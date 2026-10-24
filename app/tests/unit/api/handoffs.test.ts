import { vipWithR2 } from '../../support/api-flows';
import { setup, type Harness } from '../../support/api-harness';

const travel = (h: Harness, now: string) => setup({ store: h.store, now });
const request = (h: Harness, visitId: string, body: object = {}, actor = 'R2') =>
  h.call('POST', '/handoffs', { actor, body: { visitId, reason: 'LOW_BATTERY', ...body } });

/** Andrés is IN_PROGRESS with R2; returns the visit id. */
const withHandoff = async (h: Harness, body: object = {}) => {
  const id = await vipWithR2(h);
  const res = await request(h, id, body);
  return { id, hid: res.body.handoff.id as string, res };
};

describe('solicitar un relevo', () => {
  test('el responsable lo pide: 201, el responsable no cambia y el contrato lista el motivo', async () => {
    const h = setup();
    const { id, res } = await withHandoff(h, {
      preferredToId: 'U-02',
      note: 'R2 necesita regresar a carga.',
    });
    expect(res.status).toBe(201);
    expect(res.body.handoff).toMatchObject({
      state: 'REQUESTED',
      reason: 'LOW_BATTERY',
      fromId: 'R2',
      preferredToId: 'U-02',
      requestedBy: 'R2',
      note: 'R2 necesita regresar a carga.',
    });
    expect(res.body.visit).toMatchObject({
      id,
      state: 'WAITING_HANDOFF',
      ownerId: 'R2',
      resumeState: 'IN_PROGRESS',
    });
  });

  test('un segundo relevo abierto es HANDOFF_ALREADY_OPEN', async () => {
    const h = setup();
    const { id, hid } = await withHandoff(h);
    const second = await request(h, id);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'HANDOFF_ALREADY_OPEN',
      details: { handoffId: hid },
    });
  });

  test('solo el responsable o un operador; receptor y visita deben existir', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    expect((await request(h, id, {}, 'U-01')).body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect(
      (await h.call('POST', '/handoffs', { body: { visitId: id, reason: 'LOW_BATTERY' } })).status,
    ).toBe(403);
    expect((await request(h, id, { preferredToId: 'U-99' })).body.error.code).toBe(
      'PERSON_NOT_FOUND',
    );
    expect((await request(h, 'vis-00000000')).body.error.code).toBe('VISIT_NOT_FOUND');
    expect((await request(h, id, { reason: 'EXPLOTO' })).status).toBe(422);
    expect((await request(h, id, { note: 'x'.repeat(141) })).status).toBe(422);
    expect((await request(h, id, {}, 'O-01')).status).toBe(201);
  });

  test('desde una visita sin responsable (esperada o en revisión) es INVALID_TRANSITION', async () => {
    const h = setup();
    const expected = (await h.call('GET', '/visits', { query: { state: 'EXPECTED' } })).body
      .items[0].id;
    const res = await request(h, expected, {}, 'O-01');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('aceptar', () => {
  test('solo un acompañante disponible, distinto de quien entrega y del indicado en preferredToId', async () => {
    const h = setup();
    const { hid } = await withHandoff(h, { preferredToId: 'U-02' });
    for (const actor of ['V-202', 'R1', 'O-01', 'nadie']) {
      expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor })).status).toBe(403);
    }
    expect((await h.call('POST', `/handoffs/${hid}/accept`)).status).toBe(403);
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'R2' })).body.error.code).toBe(
      'ACTOR_NOT_ALLOWED',
    );
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-01' })).status).toBe(403);
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' })).status).toBe(200);
    expect(
      (await h.call('POST', '/handoffs/hof-00000000/accept', { actor: 'U-02' })).body.error.code,
    ).toBe('HANDOFF_NOT_FOUND');
  });

  test('un robot averiado no acepta; un receptor con tarea activa es RECEIVER_BUSY', async () => {
    const h = setup();
    const { hid } = await withHandoff(h);
    await h.call('POST', '/robots/R3/failure', { actor: 'O-01', body: { code: 'MOTOR_FAULT' } });
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'R3' })).status).toBe(403);
    // U-01 takes Camila's walk first.
    const camila = (
      await h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: {
          source: { kind: 'ROBOT', id: 'R1' },
          face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-202' },
        },
      })
    ).body.visit.id as string;
    await h.call('POST', `/visits/${camila}/advance`, {
      actor: 'R1',
      body: { event: 'START_ORIENTATION' },
    });
    await h.call('POST', `/visits/${camila}/advance`, {
      actor: 'R1',
      body: { event: 'ASSIGN_ESCORT', assigneeId: 'U-01', visitorAccepted: true },
    });
    const busy = await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-01' });
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('RECEIVER_BUSY');
  });

  test('un externo solo se entrega a un edecán, no a un robot', async () => {
    const h = setup();
    const laura = (
      await h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: {
          source: { kind: 'ROBOT', id: 'R1' },
          face: { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-205' },
        },
      })
    ).body.visit.id as string;
    await h.call('POST', `/visits/${laura}/advance`, {
      actor: 'R1',
      body: { event: 'START_ORIENTATION' },
    });
    await h.call('POST', `/visits/${laura}/advance`, {
      actor: 'R1',
      body: { event: 'ASSIGN_ESCORT', assigneeId: 'U-03', visitorAccepted: true },
    });
    const hid = (await request(h, laura, { reason: 'VISITOR_PREFERENCE' }, 'U-03')).body.handoff.id;
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'R3' })).status).toBe(403);
    expect((await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-01' })).status).toBe(200);
  });
});

describe('contexto y confirmación', () => {
  const accepted = async (h: Harness) => {
    const ctx = await withHandoff(h);
    await h.call('POST', `/handoffs/${ctx.hid}/accept`, { actor: 'U-02' });
    return ctx;
  };

  test('confirmar exige haber recibido el contexto', async () => {
    const h = setup();
    const { hid } = await accepted(h);
    const early = await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' });
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { state: 'ACCEPTED', event: 'CONFIRM' },
    });
    expect((await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-01' })).status).toBe(403);
    await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' });
    expect((await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' })).status).toBe(200);
  });

  test('contexto antes de aceptar es INVALID_TRANSITION y sin actor es 403', async () => {
    const h = setup();
    const { hid } = await withHandoff(h);
    expect(
      (await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' })).body.error.code,
    ).toBe('INVALID_TRANSITION');
    expect((await h.call('POST', `/handoffs/${hid}/context`)).status).toBe(403);
    expect((await h.call('POST', '/handoffs/hof-00000000/context', { actor: 'U-02' })).status).toBe(
      404,
    );
  });

  test('pasados 600 s desde la aceptación: HANDOFF_EXPIRED y el responsable no cambia', async () => {
    const h = setup();
    const { id, hid } = await accepted(h);
    await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' });
    const late = travel(h, '2026-10-24T09:10:00-05:00');
    const res = await late.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HANDOFF_EXPIRED');
    expect((await late.call('GET', `/visits/${id}`)).body).toMatchObject({
      ownerId: 'R2',
      state: 'WAITING_HANDOFF',
    });
    expect(
      (await late.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' })).body.error.code,
    ).toBe('HANDOFF_EXPIRED');
  });

  test('un relevo sin aceptar vence a los 300 s y entonces no se puede aceptar', async () => {
    const h = setup();
    const { hid } = await withHandoff(h);
    const late = travel(h, '2026-10-24T09:05:00-05:00');
    const res = await late.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HANDOFF_EXPIRED');
    const listed = await late.call('GET', '/handoffs', { query: { state: 'EXPIRED' } });
    expect(listed.body.count).toBe(1);
    // A critical reason keeps the visit waiting so a new handoff can be requested.
    const again = await request(late, listed.body.items[0].visitId);
    expect(again.status).toBe(201);
  });
});

describe('cancelar', () => {
  test('motivo no crítico: la visita vuelve a su estado y el responsable no cambia', async () => {
    const h = setup();
    const { id, hid } = await withHandoff(h, { reason: 'VISITOR_PREFERENCE' });
    const res = await h.call('POST', `/handoffs/${hid}/cancel`, {
      actor: 'R2',
      body: { cancelReason: 'VISITOR_DECLINED' },
    });
    expect(res.body.handoff).toMatchObject({
      state: 'CANCELLED',
      cancelReason: 'VISITOR_DECLINED',
      cancelledAt: '2026-10-24T09:00:00-05:00',
      version: 2,
    });
    expect(res.body.visit).toMatchObject({
      id,
      state: 'IN_PROGRESS',
      ownerId: 'R2',
      openHandoffId: null,
    });
    const again = await h.call('POST', `/handoffs/${hid}/cancel`, { actor: 'R2' });
    expect(again.status).toBe(200);
    expect(again.body.handoff.state).toBe('CANCELLED');
  });

  test('motivo crítico: la visita sigue esperando; el receptor y el operador también cancelan', async () => {
    const h = setup();
    const { hid } = await withHandoff(h);
    await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' });
    expect((await h.call('POST', `/handoffs/${hid}/cancel`, { actor: 'U-01' })).status).toBe(403);
    expect((await h.call('POST', `/handoffs/${hid}/cancel`)).status).toBe(403);
    const byReceiver = await h.call('POST', `/handoffs/${hid}/cancel`, { actor: 'U-02' });
    expect(byReceiver.body.handoff).toMatchObject({
      state: 'CANCELLED',
      cancelReason: 'RECEIVER_UNAVAILABLE',
    });
    expect(byReceiver.body.visit).toMatchObject({
      state: 'WAITING_HANDOFF',
      ownerId: 'R2',
      openHandoffId: null,
    });
    const second = await request(h, byReceiver.body.visit.id);
    const byOperator = await h.call('POST', `/handoffs/${second.body.handoff.id}/cancel`, {
      actor: 'O-01',
    });
    expect(byOperator.body.handoff.cancelReason).toBe('OPERATOR');
    expect(
      (
        await h.call('POST', `/handoffs/${second.body.handoff.id}/cancel`, {
          actor: 'R2',
          body: { cancelReason: 'X' },
        })
      ).status,
    ).toBe(422);
  });

  test('un relevo confirmado ya no se cancela', async () => {
    const h = setup();
    const { hid } = await withHandoff(h);
    await h.call('POST', `/handoffs/${hid}/accept`, { actor: 'U-02' });
    await h.call('POST', `/handoffs/${hid}/context`, { actor: 'U-02' });
    await h.call('POST', `/handoffs/${hid}/confirm`, { actor: 'U-02' });
    const res = await h.call('POST', `/handoffs/${hid}/cancel`, { actor: 'U-02' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { state: 'CONFIRMED', event: 'CANCEL' },
    });
  });

  test('cerrar o abortar la visita cancela su relevo abierto sin cambiar el responsable', async () => {
    const h = setup();
    const { id, hid } = await withHandoff(h);
    const closed = await h.call('POST', `/visits/${id}/close`, { actor: 'O-01' });
    expect(closed.body).toMatchObject({ state: 'CLOSED', ownerId: 'R2', openHandoffId: null });
    const handoff = (await h.call('GET', '/handoffs', { query: { visitId: id } })).body.items[0];
    expect(handoff).toMatchObject({ id: hid, state: 'CANCELLED', cancelReason: 'VISIT_CLOSED' });
    const h2 = setup();
    const second = await withHandoff(h2);
    const aborted = await h2.call('POST', `/visits/${second.id}/advance`, {
      actor: 'O-01',
      body: { event: 'ABORT' },
    });
    expect(aborted.body).toMatchObject({ state: 'FAILED', ownerId: 'R2' });
    expect(
      (await h2.call('GET', '/handoffs', { query: { visitId: second.id } })).body.items[0]
        .cancelReason,
    ).toBe('VISIT_ABORTED');
  });
});

describe('falla de un robot', () => {
  test('robot inexistente es 404, actor no operativo 403 y el cuerpo se valida', async () => {
    const h = setup();
    expect(
      (await h.call('POST', '/robots/R9/failure', { actor: 'O-01', body: { code: 'MOTOR_FAULT' } }))
        .body.error.code,
    ).toBe('ROBOT_NOT_FOUND');
    expect(
      (
        await h.call('POST', '/robots/U-01/failure', {
          actor: 'O-01',
          body: { code: 'MOTOR_FAULT' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call('POST', '/robots/R2/failure', {
          actor: 'V-202',
          body: { code: 'MOTOR_FAULT' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await h.call('POST', '/robots/R2/failure', { actor: 'O-01', body: { code: 'EXPLOTO' } }))
        .status,
    ).toBe(422);
  });

  test('un robot sin visitas abiertas devuelve handoffs vacío y queda en FAULT', async () => {
    const h = setup();
    const res = await h.call('POST', '/robots/R3/failure', {
      actor: 'R3',
      body: { code: 'NETWORK_LOSS' },
    });
    expect(res.body).toEqual({ robot: { id: 'R3', status: 'FAULT' }, handoffs: [] });
    expect((await h.call('GET', '/people/R3')).body.robot.status).toBe('FAULT');
  });

  test('repetirla con otra clave no duplica relevos; los códigos se traducen al motivo', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    const first = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'NAVIGATION_BLOCKED' },
    });
    const second = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'NAVIGATION_BLOCKED' },
    });
    expect(first.body.handoffs[0].reason).toBe('ROBOT_FAILURE');
    expect(second.body.handoffs).toHaveLength(1);
    expect(second.body.handoffs[0].id).toBe(first.body.handoffs[0].id);
    const all = await h.call('GET', '/handoffs', { query: { visitId: id } });
    expect(all.body.count).toBe(1);
  });

  test('un relevo crítico terminado se reabre al repetir la falla', async () => {
    const h = setup();
    const id = await vipWithR2(h);
    const first = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'NETWORK_LOSS' },
    });
    await h.call('POST', `/handoffs/${first.body.handoffs[0].id}/cancel`, { actor: 'O-01' });
    const again = await h.call('POST', '/robots/R2/failure', {
      actor: 'O-01',
      body: { code: 'NETWORK_LOSS' },
    });
    expect(again.body.handoffs).toHaveLength(1);
    expect(again.body.handoffs[0].id).not.toBe(first.body.handoffs[0].id);
    expect((await h.call('GET', `/visits/${id}`)).body.openHandoffId).toBe(
      again.body.handoffs[0].id,
    );
  });

  test('el panel lista solo los relevos del estado pedido y rechaza uno inválido', async () => {
    const h = setup();
    await withHandoff(h);
    expect((await h.call('GET', '/handoffs')).body.count).toBe(1);
    expect((await h.call('GET', '/handoffs', { query: { state: 'CONFIRMED' } })).body.count).toBe(
      0,
    );
    expect((await h.call('GET', '/handoffs', { query: { state: 'X' } })).status).toBe(422);
  });
});
