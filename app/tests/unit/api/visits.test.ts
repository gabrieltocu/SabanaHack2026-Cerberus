import { invite, vipWithR2 } from '../../support/api-flows';
import { setup, type Harness } from '../../support/api-harness';

const travel = (h: Harness, now: string) => setup({ store: h.store, now });
const face = (candidateId: string, classHint: 'MEMBER' | 'NON_MEMBER', confidence = 0.95) => ({
  source: { kind: 'ROBOT', id: 'R1' },
  face: { status: 'MATCH', classHint, candidateId, confidence },
});
const arrive = async (h: Harness, id = 'V-201') =>
  (await h.call('POST', '/recognition/events', { actor: 'R1', body: face(id, 'MEMBER') })).body
    .visit.id as string;
const advance = (h: Harness, id: string, body: object, actor = 'R1') =>
  h.call('POST', `/visits/${id}/advance`, { actor, body });
const selfEscort = { event: 'ASSIGN_ESCORT', assigneeId: 'SELF', visitorAccepted: true };
const unknownFace = async (h: Harness) =>
  (
    await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: { source: { kind: 'ROBOT', id: 'R1' }, face: { status: 'UNKNOWN' } },
    })
  ).body.visit.id as string;

describe('clasificación al llegar', () => {
  test.each([
    ['V-202 socia regular', 'V-202', 'MEMBER', 'CONFIRMED', 'REGULAR'],
    ['V-204 personal con turno', 'V-204', 'NON_MEMBER', 'CONFIRMED', 'STAFF'],
    ['V-207 suspendida', 'V-207', 'MEMBER', 'DENIED', undefined],
    ['V-208 vencida', 'V-208', 'MEMBER', 'MANUAL_REVIEW', undefined],
    ['V-201 con pista contraria', 'V-201', 'NON_MEMBER', 'MANUAL_REVIEW', undefined],
  ] as const)('%s', async (_n, id, hint, state, category) => {
    const res = await setup().call('POST', '/recognition/events', {
      actor: 'R1',
      body: face(id, hint),
    });
    expect(res.status).toBe(201);
    expect(res.body.classification.state).toBe(state);
    expect(res.body.visit.category).toBe(category ?? null);
    // The identity is only revealed on a confirmation.
    if (state !== 'CONFIRMED')
      expect(res.body.visit.visitor.displayName).toBe('Visitante sin identificar');
  });

  test('una confianza baja pide revisión; sin puntuación se confirma con confidence null', async () => {
    const h = setup();
    const low = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-201', 'MEMBER', 0.5),
    });
    expect(low.body.classification).toEqual({ state: 'MANUAL_REVIEW', reason: 'LOW_CONFIDENCE' });
    const none = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-202' },
      },
    });
    expect(none.body.visit.recognition.confidence).toBeNull();
  });

  test('la invitada reconocida por su perfil demo (V-203) entra por la invitación vigente', async () => {
    const h = setup();
    const res = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-203', 'NON_MEMBER', 0.93),
    });
    expect(res.status).toBe(201);
    expect(res.body.classification).toEqual({
      state: 'CONFIRMED',
      category: 'GUEST',
      evidence: ['INVITATION_ACTIVE'],
      suggestedDestination: 'Terraza',
    });
    expect(res.body.visit).toMatchObject({
      state: 'VERIFIED',
      ownerId: 'R1',
      invitationId: expect.stringMatching(/^inv-/),
      visitor: { ref: 'V-203', personId: 'V-203', displayName: 'Valentina Restrepo' },
    });
    const demo = await h.call('GET', `/invitations/${res.body.visit.invitationId}`, {
      actor: 'O-01',
    });
    expect(demo.body).toMatchObject({ hostId: 'V-209', state: 'USED' });
    // The invitation is single use: the second arrival cannot be confirmed again.
    const open = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-203', 'NON_MEMBER'),
    });
    expect(open.status).toBe(200);
    expect(open.body.matchedOpenVisit).toBe(true);
  });

  test('un QR válido con pista NON_MEMBER consume la invitación; con QR usado, denegado y sin consumir', async () => {
    const h = setup();
    const inv = await invite(h);
    const withQr = (token: string) => ({
      source: { kind: 'ROBOT', id: 'R1' },
      face: { status: 'MATCH', classHint: 'NON_MEMBER', confidence: 0.91 },
      evidence: { qrToken: token },
    });
    const ok = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: withQr(inv.qr.token),
    });
    expect(ok.status).toBe(201);
    expect(ok.body.visit).toMatchObject({ id: inv.visitId, category: 'GUEST', state: 'VERIFIED' });
    expect((await h.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' })).body.state).toBe(
      'USED',
    );
    const again = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: withQr(inv.qr.token),
    });
    expect(again.body.classification).toEqual({ state: 'DENIED', reason: 'QR_ALREADY_USED' });
    expect(again.body.visit).toMatchObject({ state: 'FAILED', failureReason: 'QR_ALREADY_USED' });
  });

  test('un rostro desconocido con QR válido no consume la invitación', async () => {
    const h = setup();
    const inv = await invite(h);
    const res = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'UNKNOWN' },
        evidence: { qrToken: inv.qr.token },
      },
    });
    expect(res.body.classification.state).toBe('MANUAL_REVIEW');
    expect((await h.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' })).body.state).toBe(
      'ACTIVE',
    );
  });

  test('cuerpo inválido: 422', async () => {
    const h = setup();
    const res = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: { face: { status: 'MATCH' } },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields).toHaveProperty('source');
  });
});

describe('advance: permisos y guardas', () => {
  test('sin actor, con un socio, o con un evento que no le toca: ACTOR_NOT_ALLOWED', async () => {
    const h = setup();
    const id = await arrive(h);
    expect(
      (await h.call('POST', `/visits/${id}/advance`, { body: { event: 'ARRIVE' } })).status,
    ).toBe(403);
    expect((await advance(h, id, { event: 'START_ORIENTATION' }, 'V-202')).body.error.code).toBe(
      'ACTOR_NOT_ALLOWED',
    );
    expect((await advance(h, id, { event: 'ABORT' }, 'R1')).body.error.code).toBe(
      'ACTOR_NOT_ALLOWED',
    );
    expect((await advance(h, id, { event: 'RESOLVE_REVIEW', decision: 'DENY' }, 'R1')).status).toBe(
      403,
    );
    expect((await advance(h, id, { event: 'START_ORIENTATION' }, 'V-999')).status).toBe(403);
  });

  test('evento desconocido o campos inválidos: 422; visita inexistente: 404', async () => {
    const h = setup();
    const id = await arrive(h);
    expect((await advance(h, id, { event: 'FLY' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await advance(h, id, { event: 'ASSIGN_ESCORT', assigneeId: 'R2' })).status).toBe(422);
    expect((await advance(h, 'vis-00000000', { event: 'ARRIVE' })).body.error.code).toBe(
      'VISIT_NOT_FOUND',
    );
  });

  test('un evento fuera de estado es INVALID_TRANSITION con state y event', async () => {
    const h = setup();
    const id = await arrive(h);
    const res = await advance(h, id, { event: 'ARRIVE' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { state: 'VERIFIED', event: 'ARRIVE' },
    });
    expect(
      (await advance(h, id, { event: 'ASSIGN_ESCORT', assigneeId: 'U-01', visitorAccepted: true }))
        .status,
    ).toBe(409);
  });

  test('expectedVersion desactualizada es VERSION_CONFLICT y la vigente pasa', async () => {
    const h = setup();
    const id = await arrive(h);
    const stale = await advance(h, id, { event: 'START_ORIENTATION', expectedVersion: 7 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 1 },
    });
    expect(
      (await advance(h, id, { event: 'START_ORIENTATION', expectedVersion: 1 })).body.version,
    ).toBe(2);
  });

  test('ABORT del operador deja la visita en FAILED', async () => {
    const h = setup();
    const id = await arrive(h);
    const res = await advance(h, id, { event: 'ABORT', reason: 'Salió sin avisar' }, 'O-01');
    expect(res.body).toMatchObject({
      state: 'FAILED',
      failureReason: 'ABORTED_BY_OPERATOR',
      ownerId: 'R1',
    });
    expect((await advance(h, id, { event: 'ABORT' }, 'O-01')).status).toBe(409);
  });

  test('START_ORIENTATION cambia el destino sugerido', async () => {
    const h = setup();
    const id = await arrive(h);
    const res = await advance(
      h,
      id,
      { event: 'START_ORIENTATION', destination: 'Terraza' },
      'U-01',
    );
    expect(res.body).toMatchObject({
      state: 'ORIENTING',
      destination: 'Terraza',
      classification: { suggestedDestination: 'Salón reservado' },
    });
  });
});

describe('ASSIGN_ESCORT', () => {
  const orient = async (h: Harness, id: string) => advance(h, id, { event: 'START_ORIENTATION' });
  const assign = (h: Harness, id: string, assigneeId: string, visitorAccepted = true) =>
    advance(h, id, { event: 'ASSIGN_ESCORT', assigneeId, visitorAccepted });

  test('el visitante debe aceptar; R1, un socio o un robot averiado no acompañan', async () => {
    const h = setup();
    const id = await arrive(h);
    await orient(h, id);
    expect((await assign(h, id, 'R2', false)).body.error.code).toBe('VISITOR_ACCEPTANCE_REQUIRED');
    expect((await assign(h, id, 'R1')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
    expect((await assign(h, id, 'V-202')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
    expect((await assign(h, id, 'V-999')).body.error.code).toBe('PERSON_NOT_FOUND');
    await h.call('POST', '/robots/R3/failure', { actor: 'O-01', body: { code: 'MOTOR_FAULT' } });
    expect((await assign(h, id, 'R3')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
    expect((await assign(h, id, 'U-01')).body).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'U-01',
    });
  });

  test('un externo no va solo ni con robot; sí con edecán', async () => {
    const h = setup();
    const id = (
      await h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: face('V-205', 'NON_MEMBER'),
      })
    ).body.visit.id as string;
    await orient(h, id);
    expect((await assign(h, id, 'SELF')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
    expect((await assign(h, id, 'R2')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
    expect((await assign(h, id, 'U-03')).body.ownerId).toBe('U-03');
  });

  test('SELF deja al mismo responsable si puede acompañar; R1 (recepción) no', async () => {
    const h = setup();
    const id = (
      await h.call('POST', '/recognition/events', {
        actor: 'R2',
        body: { ...face('V-201', 'MEMBER'), source: { kind: 'ROBOT', id: 'R2' } },
      })
    ).body.visit.id as string;
    await advance(h, id, { event: 'START_ORIENTATION' }, 'R2');
    expect((await advance(h, id, selfEscort, 'R2')).body).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'R2',
    });
    const h1 = setup();
    const own = await arrive(h1);
    await orient(h1, own);
    expect((await assign(h1, own, 'SELF')).body.error.code).toBe('ESCORT_NOT_ALLOWED');
  });

  test('un acompañante con tarea activa es ASSIGNEE_BUSY hasta que el visitante llega', async () => {
    const h = setup();
    const first = await arrive(h, 'V-201');
    await orient(h, first);
    await assign(h, first, 'U-01');
    const second = await arrive(h, 'V-202');
    await orient(h, second);
    const busy = await assign(h, second, 'U-01');
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('ASSIGNEE_BUSY');
    await advance(h, first, { event: 'ARRIVE' }, 'U-01');
    expect((await assign(h, second, 'U-01')).body.ownerId).toBe('U-01');
  });
});

describe('RESOLVE_REVIEW (R30)', () => {
  const resolve = (h: Harness, id: string, body: object, actor = 'O-01') =>
    advance(h, id, { event: 'RESOLVE_REVIEW', ...body }, actor);

  test('confirmar con una persona que el registro respalda: VERIFIED con HUMAN_ATTESTATION', async () => {
    const h = setup();
    const id = await unknownFace(h);
    const res = await resolve(h, id, { decision: 'CONFIRM', personId: 'V-201' });
    expect(res.body).toMatchObject({
      state: 'VERIFIED',
      category: 'VIP',
      ownerId: 'R1',
      destination: 'Salón reservado',
      visitor: { ref: 'V-201', personId: 'V-201', displayName: 'Andrés Mejía' },
      classification: { evidence: ['MEMBERSHIP_ACTIVE', 'HUMAN_ATTESTATION'] },
    });
  });

  test('un edecán también resuelve; una persona no confirmable es 422 y la visita no cambia', async () => {
    const h = setup();
    const id = await unknownFace(h);
    const bad = await resolve(h, id, { decision: 'CONFIRM', personId: 'V-207' }, 'U-02');
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({
      code: 'REVIEW_NOT_CONFIRMABLE',
      details: { reason: 'MEMBERSHIP_SUSPENDED' },
    });
    expect((await h.call('GET', `/visits/${id}`)).body).toMatchObject({
      state: 'MANUAL_REVIEW',
      version: 1,
    });
    // A human cannot make someone a guest: only a valid QR does.
    const guest = await resolve(h, id, { decision: 'CONFIRM', personId: 'V-203' });
    expect(guest.body.error.details.reason).toBe('NO_EVIDENCE');
    const nobody = await resolve(h, id, { decision: 'CONFIRM', personId: 'U-01' });
    expect(nobody.body.error.code).toBe('REVIEW_NOT_CONFIRMABLE');
  });

  test('CONFIRM exige personId existente; DENY pasa a FAILED con REVIEW_DENIED', async () => {
    const h = setup();
    const id = await unknownFace(h);
    expect(
      (await resolve(h, id, { decision: 'CONFIRM' })).body.error.details.fields,
    ).toHaveProperty('personId');
    expect((await resolve(h, id, { decision: 'CONFIRM', personId: 'V-999' })).status).toBe(404);
    expect((await resolve(h, id, { decision: 'DENY' }, 'V-202')).status).toBe(403);
    const denied = await resolve(h, id, { decision: 'DENY' });
    expect(denied.body).toMatchObject({ state: 'FAILED', failureReason: 'REVIEW_DENIED' });
    expect((await resolve(h, id, { decision: 'DENY' })).body.error.code).toBe('INVALID_TRANSITION');
  });

  test('socia y personal (DUAL_ROLE): el motivo de la llegada decide la categoría', async () => {
    const h = setup();
    await h.call('POST', '/demo/reset', { body: { now: '2026-10-24T10:30:00-05:00' } });
    const dual = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-206', 'MEMBER'),
    });
    expect(dual.body.classification).toEqual({ state: 'MANUAL_REVIEW', reason: 'DUAL_ROLE' });
    const id = dual.body.visit.id as string;
    const staff = await resolve(h, id, {
      decision: 'CONFIRM',
      personId: 'V-206',
      purpose: 'STAFF',
    });
    expect(staff.body).toMatchObject({ state: 'VERIFIED', category: 'STAFF' });
    const other = await h.call('POST', '/demo/reset', {
      body: { now: '2026-10-24T10:30:00-05:00' },
    });
    expect(other.status).toBe(200);
    const again = (
      await h.call('POST', '/recognition/events', { actor: 'R1', body: face('V-206', 'MEMBER') })
    ).body.visit.id as string;
    const member = await resolve(h, again, {
      decision: 'CONFIRM',
      personId: 'V-206',
      purpose: 'MEMBER',
    });
    expect(member.body).toMatchObject({ state: 'VERIFIED', category: 'REGULAR' });
  });
});

describe('close y feedback', () => {
  test('cerrar exige un actor operativo y un estado que cierre', async () => {
    const h = setup();
    const id = await arrive(h);
    expect((await h.call('POST', `/visits/${id}/close`)).status).toBe(403);
    expect((await h.call('POST', `/visits/${id}/close`, { actor: 'V-202' })).status).toBe(403);
    const closed = await h.call('POST', `/visits/${id}/close`, { actor: 'R1' });
    expect(closed.body).toMatchObject({
      state: 'CLOSED',
      closeReason: 'EXIT',
      ownerId: 'R1',
      closedAt: '2026-10-24T09:00:00-05:00',
    });
    const again = await h.call('POST', `/visits/${id}/close`, { actor: 'R1' });
    expect(again.status).toBe(409);
    expect(again.body.error.details).toEqual({ state: 'CLOSED', event: 'CLOSE' });
    const review = await unknownFace(h);
    expect((await h.call('POST', `/visits/${review}/close`, { actor: 'O-01' })).status).toBe(409);
  });

  test('close con expectedVersion desactualizada es VERSION_CONFLICT; un método inválido, 422', async () => {
    const h = setup();
    const id = await arrive(h);
    expect(
      (await h.call('POST', `/visits/${id}/close`, { actor: 'R1', body: { expectedVersion: 9 } }))
        .status,
    ).toBe(409);
    expect(
      (await h.call('POST', `/visits/${id}/close`, { actor: 'R1', body: { method: 'VOZ' } }))
        .status,
    ).toBe(422);
  });

  test('evaluar: solo en curso o cerrada, con al menos un campo y calificaciones de 1 a 5', async () => {
    const h = setup();
    const id = await arrive(h);
    expect(
      (await h.call('POST', `/visits/${id}/feedback`, { actor: 'R1', body: { clubRating: 5 } }))
        .body.error.code,
    ).toBe('INVALID_TRANSITION');
    await h.call('POST', `/visits/${id}/close`, { actor: 'R1' });
    expect((await h.call('POST', `/visits/${id}/feedback`, { actor: 'R1', body: {} })).status).toBe(
      422,
    );
    expect(
      (await h.call('POST', `/visits/${id}/feedback`, { actor: 'R1', body: { robotRating: 6 } }))
        .status,
    ).toBe(422);
    const ok = await h.call('POST', `/visits/${id}/feedback`, {
      actor: 'R1',
      body: { clubComment: 'Todo bien.', clubRating: 4 },
    });
    expect(ok.body).toMatchObject({ clubRating: 4, clubComment: 'Todo bien.', visitId: id });
    expect(
      (
        await h.call('POST', '/visits/vis-00000000/feedback', {
          actor: 'R1',
          body: { clubRating: 4 },
        })
      ).status,
    ).toBe(404);
  });
});

describe('listas y reglas perezosas', () => {
  test('GET /visits filtra por estado y responsable y respeta limit', async () => {
    const h = setup();
    await arrive(h, 'V-201');
    await arrive(h, 'V-202');
    const verified = await h.call('GET', '/visits', {
      query: { state: 'VERIFIED', ownerId: 'R1' },
    });
    expect(verified.body.count).toBe(2);
    expect((await h.call('GET', '/visits', { query: { state: 'EXPECTED' } })).body.count).toBe(1);
    expect((await h.call('GET', '/visits', { query: { limit: '1' } })).body.count).toBe(1);
    expect((await h.call('GET', '/visits', { query: { limit: '999' } })).status).toBe(422);
    expect((await h.call('GET', '/visits', { query: { ownerId: 'U-03' } })).body.count).toBe(0);
    expect((await h.call('GET', '/visits/vis-00000000')).status).toBe(404);
  });

  test('cambio de día: una visita abierta de ayer se cierra como DAY_ROLLOVER al consultarla', async () => {
    const h = setup();
    const id = await arrive(h);
    const next = travel(h, '2026-10-25T08:00:00-05:00');
    expect((await next.call('GET', `/visits/${id}`)).body).toMatchObject({
      state: 'CLOSED',
      closeReason: 'DAY_ROLLOVER',
      ownerId: 'R1',
    });
  });

  test('cambio de día con un relevo abierto: el relevo vence y el responsable no cambia', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    await h.call('POST', '/robots/R2/failure', { actor: 'O-01', body: { code: 'MOTOR_FAULT' } });
    const next = travel(h, '2026-10-25T08:00:00-05:00');
    expect((await next.call('GET', `/visits/${id}`)).body).toMatchObject({
      state: 'CLOSED',
      closeReason: 'DAY_ROLLOVER',
      ownerId: 'R2',
    });
    const handoffs = await next.call('GET', '/handoffs', { query: { visitId: id } });
    expect(handoffs.body.items[0].state).toBe('EXPIRED');
  });
});
