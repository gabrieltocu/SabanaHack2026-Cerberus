// Reglas que el kiosco de recepción necesita (C04-CP08): orientar sin acompañante, salida en
// recepción y el nombre del anfitrión de un invitado reconocido.
import { setup, type Harness } from '../../support/api-harness';

const arrive = (h: Harness, candidate: string, classHint: 'MEMBER' | 'NON_MEMBER' = 'MEMBER') =>
  h.call('POST', '/recognition/events', {
    actor: 'R1',
    body: {
      source: { kind: 'ROBOT', id: 'R1' },
      face: { status: 'MATCH', classHint, candidateId: candidate, confidence: 0.97 },
    },
  });
const advance = (h: Harness, id: string, actor: string, body: object) =>
  h.call('POST', `/visits/${id}/advance`, { actor, body });
const none = (h: Harness, id: string, actor = 'R1', visitorAccepted = false) =>
  advance(h, id, actor, { event: 'ASSIGN_ESCORT', assigneeId: 'NONE', visitorAccepted });
const code = (r: { status: number; body: { error?: { code: string } } }) => [
  r.status,
  r.body.error?.code,
];

async function oriented(h: Harness, candidate: string, hint: 'MEMBER' | 'NON_MEMBER' = 'MEMBER') {
  const id = (await arrive(h, candidate, hint)).body.visit.id as string;
  await advance(h, id, 'R1', { event: 'START_ORIENTATION' });
  return id;
}

describe('13: ASSIGN_ESCORT con assigneeId NONE (orientación sin acompañante)', () => {
  test('el dueño R1 deja a un socio que rechaza el acompañamiento en IN_PROGRESS, y luego ARRIVE y close funcionan', async () => {
    const h = setup();
    const id = await oriented(h, 'V-201');
    const res = await none(h, id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'R1', arrivedAt: null });
    expect((await advance(h, id, 'R1', { event: 'ARRIVE' })).body.arrivedAt).not.toBeNull();
    expect((await h.call('POST', `/visits/${id}/close`, { actor: 'R1', body: {} })).status).toBe(
      200,
    );
  });

  test('el personal (STAFF) va sin acompañante y no se toma ninguna reserva de escolta', async () => {
    const h = setup();
    const id = await oriented(h, 'V-204', 'NON_MEMBER');
    expect((await none(h, id, 'R1', true)).body).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'R1',
      category: 'STAFF',
    });
    expect(await h.store.get('escort:R1')).toBeNull();
  });

  test('el externo siempre va con un edecán humano: ESCORT_NOT_ALLOWED', async () => {
    const h = setup();
    const id = await oriented(h, 'V-205', 'NON_MEMBER');
    expect(code(await none(h, id))).toEqual([422, 'ESCORT_NOT_ALLOWED']);
    expect((await h.call('GET', `/visits/${id}`)).body.state).toBe('ORIENTING');
  });

  test('exige orientación en curso y un actor con vínculo', async () => {
    const h = setup();
    const id = (await arrive(h, 'V-201')).body.visit.id as string;
    expect(code(await none(h, id))).toEqual([409, 'INVALID_TRANSITION']);
    await advance(h, id, 'R1', { event: 'START_ORIENTATION' });
    expect(code(await none(h, id, 'R2'))).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    expect(code(await none(h, id, 'V-201'))).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    expect((await none(h, id)).status).toBe(200);
  });

  test('SELF sigue prohibido para R1 y para un externo', async () => {
    const h = setup();
    const id = await oriented(h, 'V-201');
    const self = await advance(h, id, 'R1', {
      event: 'ASSIGN_ESCORT',
      assigneeId: 'SELF',
      visitorAccepted: true,
    });
    expect(code(self)).toEqual([422, 'ESCORT_NOT_ALLOWED']);
  });
});

describe('14: R1 cierra la salida de cualquier visita sin relevo abierto', () => {
  async function withR2(h: Harness) {
    const id = await oriented(h, 'V-201');
    await advance(h, id, 'R1', {
      event: 'ASSIGN_ESCORT',
      assigneeId: 'R2',
      visitorAccepted: true,
    });
    return id;
  }
  const close = (h: Harness, id: string, actor: string, method?: string) =>
    h.call('POST', `/visits/${id}/close`, { actor, body: method ? { method } : {} });

  test('R1 cierra la visita de R2 (salida asistida por rostro incluida)', async () => {
    const h = setup();
    const id = await withR2(h);
    const res = await close(h, id, 'R1', 'FACE');
    expect([res.status, res.body.state, res.body.closeReason]).toEqual([200, 'CLOSED', 'EXIT']);
  });

  test('R1 cierra la visita de un edecán', async () => {
    const h = setup();
    const id = await oriented(h, 'V-201');
    await advance(h, id, 'R1', {
      event: 'ASSIGN_ESCORT',
      assigneeId: 'U-01',
      visitorAccepted: true,
    });
    expect((await close(h, id, 'R1')).status).toBe(200);
  });

  test('R2 y R3 siguen sin poder cerrar visitas ajenas', async () => {
    const h = setup();
    const id = await withR2(h);
    expect(code(await close(h, id, 'R3'))).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    const other = await oriented(h, 'V-202');
    expect(code(await close(h, other, 'R2'))).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    expect((await h.call('GET', `/visits/${id}`)).body.state).toBe('IN_PROGRESS');
  });

  test('con un relevo abierto R1 no cierra la visita ajena', async () => {
    const h = setup();
    const id = await withR2(h);
    await h.call('POST', '/robots/R2/failure', { actor: 'O-01', body: { code: 'OBSTACLE' } });
    expect(code(await close(h, id, 'R1'))).toEqual([403, 'ACTOR_NOT_ALLOWED']);
    expect((await h.call('GET', `/visits/${id}`)).body.state).toBe('WAITING_HANDOFF');
  });
});

describe('15: hostName en la visita del invitado', () => {
  test('el invitado reconocido por rostro trae el nombre corto del anfitrión, sin token', async () => {
    const h = setup();
    const res = await arrive(h, 'V-203', 'NON_MEMBER');
    expect(res.body.classification).toMatchObject({ state: 'CONFIRMED', category: 'GUEST' });
    expect(res.body.visit.hostName).toBe('Male');
    expect(JSON.stringify(res.body)).not.toMatch(/nq_[A-Za-z0-9_-]{22}/);
    expect((await h.call('GET', `/visits/${res.body.visit.id}`)).body.hostName).toBe('Male');
  });

  test('el invitado que entra por QR también lo trae; una visita sin invitación, null', async () => {
    const h = setup();
    const inv = (
      await h.call('POST', '/invitations', {
        actor: 'V-202',
        body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      })
    ).body;
    const expected = (await h.call('GET', `/visits/${inv.visitId}`)).body;
    expect(expected.hostName).toBe('Camila');
    const granted = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(granted.body.visit.hostName).toBe('Camila');
    const member = await arrive(h, 'V-201');
    expect(member.body.visit.hostName).toBeNull();
  });
});
