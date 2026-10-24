// Autorización de las operaciones sobre la visita: el actor debe tener vínculo con ella (responsable,
// edecán u operador), el acompañante propio debe ser elegible y la evaluación no es anónima.
import { setup, type Harness } from '../../support/api-harness';
import { vipWithR2 } from '../../support/api-flows';

const advance = (h: Harness, id: string, actor: string, body: object) =>
  h.call('POST', `/visits/${id}/advance`, { actor, body });

/** Llegada por rostro de `candidate` registrada por el robot `by`; devuelve el id de la visita. */
async function arrival(h: Harness, by = 'R1', candidate = 'V-201') {
  const res = await h.call('POST', '/recognition/events', {
    actor: by,
    body: {
      source: { kind: 'ROBOT', id: by },
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: candidate, confidence: 0.97 },
    },
  });
  expect(res.status).toBe(201);
  return res.body.visit.id as string;
}

describe('ASSIGN_ESCORT con SELF exige un acompañante elegible', () => {
  const assignSelf = (h: Harness, id: string, actor: string) =>
    advance(h, id, actor, { event: 'ASSIGN_ESCORT', assigneeId: 'SELF', visitorAccepted: true });

  async function oriented(h: Harness, by: string) {
    const id = await arrival(h, by);
    expect((await advance(h, id, by, { event: 'START_ORIENTATION' })).status).toBe(200);
    return id;
  }

  test('R1 (recepción) no acompaña: SELF sobre su propia visita es ESCORT_NOT_ALLOWED', async () => {
    const h = setup();
    const res = await assignSelf(h, await oriented(h, 'R1'), 'R1');
    expect([res.status, res.body.error?.code]).toEqual([422, 'ESCORT_NOT_ALLOWED']);
  });

  test('el operador no deja a R1 como acompañante', async () => {
    const h = setup();
    const res = await assignSelf(h, await oriented(h, 'R1'), 'O-01');
    expect([res.status, res.body.error?.code]).toEqual([422, 'ESCORT_NOT_ALLOWED']);
  });

  test('un robot en FAULT no se asigna a sí mismo', async () => {
    const h = setup();
    await h.call('POST', '/robots/R2/failure', { actor: 'R2', body: { code: 'MOTOR_FAULT' } });
    const res = await assignSelf(h, await oriented(h, 'R2'), 'R2');
    expect([res.status, res.body.error?.code]).toEqual([422, 'ESCORT_NOT_ALLOWED']);
  });

  test('un robot de acompañamiento sano o un edecán sí siguen como responsables', async () => {
    const h = setup();
    const res = await assignSelf(h, await oriented(h, 'R2'), 'R2');
    expect(res.body).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'R2' });
    const h2 = setup();
    const inv = (
      await h2.call('POST', '/invitations', {
        actor: 'V-202',
        body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      })
    ).body;
    const granted = await h2.call('POST', '/access/verify', {
      actor: 'U-01',
      body: { token: inv.qr.token },
    });
    const id = granted.body.visit.id as string;
    await advance(h2, id, 'U-01', { event: 'START_ORIENTATION' });
    const viaOperator = await assignSelf(h2, id, 'O-01');
    expect(viaOperator.body).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'U-01' });
  });
});

describe('vínculo con la visita: responsable, edecán u operador', () => {
  test('otro robot no avanza ni cierra la visita de R2', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    const arrive = await advance(h, id, 'R3', { event: 'ARRIVE' });
    expect([arrive.status, arrive.body.error?.code]).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    const close = await h.call('POST', `/visits/${id}/close`, { actor: 'R3', body: {} });
    expect([close.status, close.body.error?.code]).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    expect((await h.call('GET', `/visits/${id}`)).body).toMatchObject({
      state: 'IN_PROGRESS',
      arrivedAt: null,
    });
  });

  test('otro robot no orienta ni asigna en la visita de R1', async () => {
    const h = setup();
    const id = await arrival(h, 'R1');
    const start = await advance(h, id, 'R2', { event: 'START_ORIENTATION' });
    expect(start.status).toBe(403);
    await advance(h, id, 'R1', { event: 'START_ORIENTATION' });
    const assign = await advance(h, id, 'R3', {
      event: 'ASSIGN_ESCORT',
      assigneeId: 'R3',
      visitorAccepted: true,
    });
    expect(assign.status).toBe(403);
  });

  test('R1 (recepción) cierra la salida de la visita de R2; con un relevo abierto no', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    await h.call('POST', '/robots/R2/failure', { actor: 'O-01', body: { code: 'OBSTACLE' } });
    const blocked = await h.call('POST', `/visits/${id}/close`, { actor: 'R1', body: {} });
    expect([blocked.status, blocked.body.error?.code]).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    const h2 = setup();
    const id2 = await vipWithR2(h2);
    expect((await h2.call('POST', `/visits/${id2}/close`, { actor: 'R1', body: {} })).status).toBe(
      200,
    );
  });

  test('el responsable, un edecán y el operador sí actúan', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    expect((await advance(h, id, 'R2', { event: 'ARRIVE' })).status).toBe(200);
    expect((await h.call('POST', `/visits/${id}/close`, { actor: 'U-02', body: {} })).status).toBe(
      200,
    );
    const h2 = setup();
    const id2 = await vipWithR2(h2);
    expect(
      (await h2.call('POST', `/visits/${id2}/close`, { actor: 'O-01', body: {} })).status,
    ).toBe(200);
  });
});

describe('POST /visits/{id}/feedback no es anónimo', () => {
  async function closedVisit(h: Harness) {
    const id = await vipWithR2(h);
    await advance(h, id, 'R2', { event: 'ARRIVE' });
    await h.call('POST', `/visits/${id}/close`, { actor: 'R2', body: {} });
    return id;
  }
  const rate = { clubRating: 5 };

  test.each([undefined, 'V-999', 'V-202', 'V-204'])(
    'sin actor válido de operación ni ser el visitante (%s) es 403',
    async (actor) => {
      const h = setup();
      const id = await closedVisit(h);
      const res = await h.call('POST', `/visits/${id}/feedback`, { actor, body: rate });
      expect([res.status, res.body.error?.code]).toEqual([403, 'ACTOR_NOT_ALLOWED']);
      expect((await h.call('GET', `/visits/${id}`)).body.feedbackSubmitted).toBe(false);
    },
  );

  test.each(['R1', 'R2', 'U-01', 'O-01'])(
    'el kiosco o el personal (%s) la registra',
    async (actor) => {
      const h = setup();
      const id = await closedVisit(h);
      const res = await h.call('POST', `/visits/${id}/feedback`, { actor, body: rate });
      expect(res.status).toBe(201);
    },
  );

  test('el propio visitante (el personId de la visita) la registra, una sola vez', async () => {
    const h = setup();
    const id = await closedVisit(h);
    const res = await h.call('POST', `/visits/${id}/feedback`, { actor: 'V-201', body: rate });
    expect(res.status).toBe(201);
    expect((await h.call('GET', `/visits/${id}`)).body.feedbackSubmitted).toBe(true);
    const again = await h.call('POST', `/visits/${id}/feedback`, { actor: 'V-201', body: rate });
    expect([again.status, again.body.error?.code]).toEqual([409, 'FEEDBACK_ALREADY_SUBMITTED']);
  });

  test('el visitante no evalúa la visita de otra persona', async () => {
    const h = setup();
    const id = await closedVisit(h);
    for (const actor of ['V-202', 'V-209', 'V-204']) {
      const res = await h.call('POST', `/visits/${id}/feedback`, { actor, body: rate });
      expect([res.status, res.body.error?.code]).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    }
  });
});
