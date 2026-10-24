// Recorridos completos de la API (tests de integración y de contrato): cada respuesta real se valida
// en el arnés contra su esquema Zod, de modo que cualquier deriva del contrato rompe la prueba.
import { toFetchHandler } from '@/api/http';
import { type Harness, type Reply } from './api-harness';

const SIM_R1 = { kind: 'SIMULATOR', id: 'R1' };
const face = (candidateId: string, classHint: 'MEMBER' | 'NON_MEMBER', confidence = 0.95) => ({
  source: SIM_R1,
  face: { status: 'MATCH', classHint, candidateId, confidence },
  observedAt: '2026-10-24T09:02:11-05:00',
});

/** Creates Camila's invitation (V-202) and returns it. */
export async function invite(h: Harness, guest = 'Sebastián Lozano', host = 'V-202') {
  const res = await h.call('POST', '/invitations', {
    actor: host,
    body: {
      hostId: host,
      guest: { fullName: guest, note: 'Café sin azúcar' },
      meetingPoint: 'Cancha de tenis',
      date: '2026-10-24',
    },
  });
  expect(res.status).toBe(201);
  return res.body as Reply['body'];
}

/** Andrés (VIP) arrives, is oriented and R2 takes him: returns the visit in IN_PROGRESS. */
export async function vipWithR2(h: Harness) {
  const arrival = await h.call('POST', '/recognition/events', {
    actor: 'R1',
    body: face('V-201', 'MEMBER', 0.97),
  });
  expect(arrival.status).toBe(201);
  const id = arrival.body.visit.id as string;
  const oriented = await h.call('POST', `/visits/${id}/advance`, {
    actor: 'R1',
    body: { event: 'START_ORIENTATION', destination: 'Salón reservado' },
  });
  expect(oriented.body.state).toBe('ORIENTING');
  const assigned = await h.call('POST', `/visits/${id}/advance`, {
    actor: 'R1',
    body: { event: 'ASSIGN_ESCORT', assigneeId: 'R2', visitorAccepted: true },
  });
  expect(assigned.body).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'R2' });
  return id;
}

export const flows = {
  /** (a) VIP por rostro -> VERIFIED VIP. */
  async vipByFace(h: Harness) {
    const res = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-201', 'MEMBER', 0.97),
    });
    expect(res.status).toBe(201);
    expect(res.body.matchedOpenVisit).toBe(false);
    expect(res.body.classification).toEqual({
      state: 'CONFIRMED',
      category: 'VIP',
      evidence: ['MEMBERSHIP_ACTIVE'],
      suggestedDestination: 'Salón reservado',
    });
    expect(res.body.visit).toMatchObject({
      state: 'VERIFIED',
      category: 'VIP',
      ownerId: 'R1',
      destination: 'Salón reservado',
      visitor: { ref: 'V-201', personId: 'V-201', displayName: 'Andrés Mejía' },
      recognition: { simulated: true, confidence: 0.97, observedAt: '2026-10-24T09:02:11-05:00' },
      version: 1,
      invitationId: null,
    });
    const got = await h.call('GET', `/visits/${res.body.visit.id}`);
    expect(got.body).toEqual(res.body.visit);

    // INV-15: recognizing the same person again returns the open visit.
    const again = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-201', 'MEMBER'),
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ matchedOpenVisit: true, visit: { id: res.body.visit.id } });
    const visits = await h.call('GET', '/visits', { query: { state: 'VERIFIED' } });
    expect(visits.body.items.map((v: { id: string }) => v.id)).toEqual([res.body.visit.id]);
  },

  /** (b) Invitación de Camila -> QR -> GRANTED -> reutilización: QR_ALREADY_USED. */
  async inviteAndUseQr(h: Harness) {
    const inv = await invite(h);
    expect(inv).toMatchObject({
      hostId: 'V-202',
      state: 'ACTIVE',
      window: { from: '06:00', to: '22:00' },
      date: '2026-10-24',
      qr: {
        usedAt: null,
        revokedAt: null,
        validFrom: '2026-10-24T06:00:00-05:00',
        validTo: '2026-10-24T22:00:00-05:00',
      },
      guest: { fullName: 'Sebastián Lozano', note: 'Café sin azúcar' },
      cancelledAt: null,
    });
    expect(inv.qr.token).toMatch(/^nq_[A-Za-z0-9_-]{22}$/);
    const mine = await h.call('GET', '/invitations', {
      actor: 'V-202',
      query: { hostId: 'V-202' },
    });
    expect(mine.body).toMatchObject({ count: 1, items: [{ id: inv.id }] });

    const granted = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(granted.body.decision).toBe('GRANTED');
    expect(granted.body.visit).toMatchObject({
      id: inv.visitId,
      state: 'VERIFIED',
      category: 'GUEST',
      ownerId: 'R1',
      destination: 'Cancha de tenis',
      invitationId: inv.id,
      version: 2,
      classification: { state: 'CONFIRMED', evidence: ['INVITATION_QR_VALID'] },
      visitor: { personId: null, displayName: 'Sebastián Lozano' },
    });
    expect(granted.body.invitation).toMatchObject({
      state: 'USED',
      qr: { usedAt: '2026-10-24T09:00:00-05:00' },
    });

    const reuse = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(reuse.status).toBe(200);
    expect(reuse.body).toEqual({ decision: 'DENIED', reason: 'QR_ALREADY_USED' });
    const after = await h.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' });
    expect(after.body.state).toBe('USED');
  },

  /** (c) Externa el sábado GRANTED; tras reiniciar en martes, DENIED. */
  async externalSaturdayVersusTuesday(h: Harness) {
    const sat = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-205', 'NON_MEMBER'),
    });
    expect(sat.body.classification).toMatchObject({
      state: 'CONFIRMED',
      category: 'EXTERNAL',
      evidence: ['EXTERNAL_PERMIT_ACTIVE'],
    });
    expect(sat.body.visit).toMatchObject({
      state: 'VERIFIED',
      destination: 'Recepción de proveedores',
    });

    const reset = await h.call('POST', '/demo/reset', {
      body: { now: '2026-10-27T10:00:00-05:00' },
    });
    expect(reset.body.clock.now).toBe('2026-10-27T10:00:00-05:00');
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-27T10:00:00-05:00');

    const tue = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: face('V-205', 'NON_MEMBER'),
    });
    expect(tue.status).toBe(201);
    expect(tue.body.classification).toEqual({
      state: 'DENIED',
      reason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
    });
    expect(tue.body.visit).toMatchObject({
      state: 'FAILED',
      failureReason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
      ownerId: null,
    });
  },

  /** (d) Rostro desconocido -> MANUAL_REVIEW -> QR con visitId -> MERGED. */
  async unknownFaceThenQr(h: Harness) {
    const inv = await invite(h);
    const review = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'UNKNOWN' },
        observedAt: '2026-10-24T09:50:00-05:00',
      },
    });
    expect(review.body.classification).toEqual({ state: 'MANUAL_REVIEW', reason: 'FACE_UNKNOWN' });
    expect(review.body.visit).toMatchObject({
      state: 'MANUAL_REVIEW',
      ownerId: null,
      category: null,
      visitor: { ref: null, personId: null, displayName: 'Visitante sin identificar' },
      recognition: { simulated: false, confidence: null },
    });

    const merged = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token, visitId: review.body.visit.id },
    });
    expect(merged.body.decision).toBe('GRANTED');
    expect(merged.body.visit.id).toBe(inv.visitId);
    expect(merged.body.visit.recognition).toMatchObject({ face: { status: 'UNKNOWN' } });
    const closed = await h.call('GET', `/visits/${review.body.visit.id}`);
    expect(closed.body).toMatchObject({ state: 'CLOSED', closeReason: 'MERGED' });
  },

  /** (e) Falla de R2 -> relevo -> dos accept simultáneos -> contexto -> confirmar -> cerrar -> evaluar. */
  async robotFailureHandoff(h: Harness) {
    const id = await vipWithR2(h);
    const failure = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'MOTOR_FAULT', lastKnownPoint: 'Corredor norte' },
    });
    expect(failure.body.robot).toEqual({ id: 'R2', status: 'FAULT' });
    expect(failure.body.handoffs).toHaveLength(1);
    const handoff = failure.body.handoffs[0];
    expect(handoff).toMatchObject({
      visitId: id,
      state: 'REQUESTED',
      reason: 'ROBOT_FAILURE',
      fromId: 'R2',
      toId: null,
      requestedBy: 'O-01',
      summary: {
        visitorName: 'Andrés M.',
        category: 'VIP',
        destination: 'Salón reservado',
        lastKnownPoint: 'Corredor norte',
      },
      createdAt: '2026-10-24T09:00:00-05:00',
      expiresAt: '2026-10-24T09:05:00-05:00',
      version: 1,
    });
    const waiting = await h.call('GET', `/visits/${id}`);
    expect(waiting.body).toMatchObject({
      state: 'WAITING_HANDOFF',
      ownerId: 'R2',
      resumeState: 'IN_PROGRESS',
      openHandoffId: handoff.id,
    });
    const panel = await h.call('GET', '/handoffs', { query: { state: 'REQUESTED' } });
    expect(panel.body).toMatchObject({ count: 1, items: [{ id: handoff.id }] });

    // Two attendants accept at the same time: exactly one wins, the other gets 409.
    const [sara, sofia] = await Promise.all([
      h.call('POST', `/handoffs/${handoff.id}/accept`, { actor: 'U-01' }),
      h.call('POST', `/handoffs/${handoff.id}/accept`, { actor: 'U-02' }),
    ]);
    const statuses = [sara.status, sofia.status].sort();
    expect(statuses).toEqual([200, 409]);
    const [winner, loser] = sara.status === 200 ? [sara, sofia] : [sofia, sara];
    const winnerId = sara.status === 200 ? 'U-01' : 'U-02';
    expect(winner.body.handoff).toMatchObject({ state: 'ACCEPTED', toId: winnerId, version: 2 });
    expect(winner.body.handoff.expiresAt).toBe('2026-10-24T09:10:00-05:00');
    expect(winner.body.visit.ownerId).toBe('R2');
    expect(loser.body.error).toMatchObject({
      code: 'HANDOFF_ALREADY_ACCEPTED',
      details: { handoffId: handoff.id, toId: winnerId },
    });

    // The context is only for the winner; the owner changes only on confirm.
    const stranger = winnerId === 'U-01' ? 'U-02' : 'U-01';
    expect(
      (await h.call('POST', `/handoffs/${handoff.id}/context`, { actor: stranger })).status,
    ).toBe(403);
    const context = await h.call('POST', `/handoffs/${handoff.id}/context`, { actor: winnerId });
    expect(context.body.handoff).toMatchObject({ state: 'CONTEXT_TRANSFERRED', version: 3 });
    expect(context.body.context).toMatchObject({
      visitId: id,
      visitor: { displayName: 'Andrés Mejía' },
      preferences: ['Café'],
      progress: { state: 'IN_PROGRESS', lastKnownPoint: 'Corredor norte' },
      evidence: ['MEMBERSHIP_ACTIVE'],
    });
    expect((await h.call('GET', `/visits/${id}`)).body.ownerId).toBe('R2');
    const confirmed = await h.call('POST', `/handoffs/${handoff.id}/confirm`, { actor: winnerId });
    expect(confirmed.body.handoff).toMatchObject({ state: 'CONFIRMED', version: 4 });
    expect(confirmed.body.visit).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: winnerId,
      resumeState: null,
      openHandoffId: null,
    });

    const arrived = await h.call('POST', `/visits/${id}/advance`, {
      actor: winnerId,
      body: { event: 'ARRIVE' },
    });
    expect(arrived.body.arrivedAt).toBe('2026-10-24T09:00:00-05:00');
    const closed = await h.call('POST', `/visits/${id}/close`, {
      actor: winnerId,
      body: { method: 'FACE' },
    });
    expect(closed.body).toMatchObject({ state: 'CLOSED', closeReason: 'EXIT', ownerId: winnerId });
    const feedback = await h.call('POST', `/visits/${id}/feedback`, {
      actor: 'R1',
      body: { robotRating: 5, robotComment: 'Muy claro el recorrido.', clubRating: 4 },
    });
    expect(feedback.status).toBe(201);
    expect(feedback.body).toMatchObject({ visitId: id, robotRating: 5, clubRating: 4 });
    expect((await h.call('GET', `/visits/${id}`)).body.feedbackSubmitted).toBe(true);
    expect(
      (await h.call('POST', `/visits/${id}/feedback`, { actor: 'R1', body: { clubRating: 1 } }))
        .body.error.code,
    ).toBe('FEEDBACK_ALREADY_SUBMITTED');
  },

  /** (f) Idempotencia: misma clave y cuerpo repite; otro cuerpo da 422. */
  async idempotency(h: Harness) {
    const body = { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' };
    const first = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body,
      key: 'clave-idem-0001',
    });
    expect(first.status).toBe(201);
    expect(first.headers['Idempotency-Replayed']).toBeUndefined();
    const replay = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body,
      key: 'clave-idem-0001',
    });
    expect(replay.status).toBe(201);
    expect(replay.headers['Idempotency-Replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    const other = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { ...body, guest: { fullName: 'Otra Persona' } },
      key: 'clave-idem-0001',
    });
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const listed = await h.call('GET', '/invitations', {
      actor: 'V-202',
      query: { hostId: 'V-202' },
    });
    expect(listed.body.count).toBe(1);
    const missing = await h.call('POST', '/invitations', { actor: 'V-202', body, key: false });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const short = await h.call('POST', '/invitations', { actor: 'V-202', body, key: 'corta' });
    expect(short.body.error.code).toBe('BAD_REQUEST');
  },

  /** (g) Límite de tasa: 429 con Retry-After; otro cliente no se ve afectado. */
  async rateLimit(h: Harness) {
    for (let i = 0; i < 120; i++) {
      const r = await h.call('POST', '/visits/vis-00000000/close', { actor: 'R1', ip: '1.1.1.1' });
      expect(r.status).toBe(404);
    }
    const limited = await h.call('POST', '/visits/vis-00000000/close', {
      actor: 'R1',
      ip: '1.1.1.1',
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['Retry-After']).toBe('60');
    expect(
      (await h.call('POST', '/visits/vis-00000000/close', { actor: 'R1', ip: '2.2.2.2' })).status,
    ).toBe(404);
    // Reads have their own budget of 600 and resets of 3 per minute.
    for (let i = 0; i < 600; i++)
      expect((await h.call('GET', '/health', { ip: '3.3.3.3' })).status).toBe(200);
    expect((await h.call('GET', '/health', { ip: '3.3.3.3' })).status).toBe(429);
    for (let i = 0; i < 3; i++)
      expect((await h.call('POST', '/demo/reset', { ip: '4.4.4.4' })).status).toBe(200);
    expect((await h.call('POST', '/demo/reset', { ip: '4.4.4.4' })).status).toBe(429);
  },

  /** (h) Escrituras con cuerpo exigen JSON: 415 (lo aplica el adaptador HTTP). */
  async unsupportedMediaType(h: Harness) {
    const handle = toFetchHandler(h.app);
    const send = (init: RequestInit) =>
      handle(new Request('http://x/api/v1/invitations', { method: 'POST', ...init }));
    const text = await send({
      body: '{"hostId":"V-202"}',
      headers: { 'content-type': 'text/plain', 'idempotency-key': 'clave-idem-0002' },
    });
    expect(text.status).toBe(415);
    expect((await text.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const form = await send({
      body: 'a=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
    const json = await send({
      body: '{"hostId":"V-202","guest":{"fullName":"Ana Pérez"},"date":"2026-10-24"}',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'clave-idem-0003' },
    });
    expect(json.status).toBe(403); // reaches the use case: no actor declared
    // A POST without body (accept, confirm...) needs no Content-Type.
    const bodyless = await handle(
      new Request('http://x/api/v1/handoffs/hof-00000000/accept', {
        method: 'POST',
        headers: { 'x-demo-actor': 'U-01' },
      }),
    );
    expect(bodyless.status).toBe(404);
  },

  /** (i) Respuesta perdida: el confirm se aplicó; repetirlo da 200 sin duplicar el historial. */
  async lostResponse(h: Harness) {
    const id = await vipWithR2(h);
    const failure = await h.call('POST', '/robots/R2/failure', {
      actor: 'R2',
      body: { code: 'LOW_BATTERY' },
    });
    const hid = failure.body.handoffs[0].id as string;
    expect(failure.body.handoffs[0].reason).toBe('LOW_BATTERY');
    await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' });
    const repeatedAccept = await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' });
    expect(repeatedAccept.status).toBe(200);
    expect(repeatedAccept.body.handoff.version).toBe(2);
    await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' });
    expect(
      (await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' })).body.handoff.version,
    ).toBe(3);

    const first = await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' });
    const before = (await h.call('GET', `/visits/${id}`)).body;
    const lost = await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' });
    expect(lost.status).toBe(200);
    expect(lost.body).toEqual(first.body);
    const after = (await h.call('GET', `/visits/${id}`)).body;
    expect(after).toEqual(before);
    expect(after).toMatchObject({ ownerId: 'U-02', version: before.version });
    // Another attendant cannot confirm it.
    expect(
      (await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-01' })).body.error.code,
    ).toBe('ACTOR_NOT_ALLOWED');
  },
};

export type FlowName = keyof typeof flows;
