import { ApiError } from '@/infrastructure/clients/errors';
import { createCerberusClient, newIdempotencyKey } from '@/infrastructure/clients/cerberus-client';
import type { Transport, TransportRequest } from '@/infrastructure/clients/transport';

const HEALTH = {
  status: 'ok',
  contract: 'v1',
  storage: 'memory',
  demo: true,
  clock: { now: '2026-10-24T09:00:00-05:00', timezone: 'America/Bogota' },
};

function fake(res: { status: number; body?: unknown; headers?: Record<string, string> } | Error) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    if (res instanceof Error) throw res;
    return { status: res.status, body: res.body, headers: res.headers };
  };
  return { transport, calls };
}

const seq = () => {
  let n = 0;
  return (bytes: number) => new Uint8Array(bytes).fill(++n);
};

test('2xx: devuelve el cuerpo validado y envía el actor del cliente', async () => {
  const { transport, calls } = fake({ status: 200, body: HEALTH });
  const client = createCerberusClient(transport, 'U-01');
  expect((await client.getHealth()).storage).toBe('memory');
  expect(calls[0]).toMatchObject({
    method: 'GET',
    path: '/health',
    headers: { 'x-demo-actor': 'U-01' },
  });
});

test('el actor de la llamada sustituye al del cliente', async () => {
  const { transport, calls } = fake({ status: 200, body: { items: [], count: 0 } });
  await createCerberusClient(transport, 'U-01').listHandoffs({ state: 'REQUESTED' });
  const c2 = fake({ status: 200, body: { handoff: null } });
  await createCerberusClient(c2.transport, 'U-01')
    .acceptHandoff('hof-1', { actor: 'U-02' })
    .catch(() => undefined);
  expect(calls[0]?.path).toBe('/handoffs?state=REQUESTED');
  expect(c2.calls[0]?.headers).toMatchObject({ 'x-demo-actor': 'U-02' });
});

test('4xx: lanza ApiError con código, mensaje y detalles del contrato', async () => {
  const { transport } = fake({
    status: 409,
    body: {
      error: {
        code: 'HANDOFF_ALREADY_ACCEPTED',
        message: 'Otro acompañante ya aceptó este relevo.',
        details: { handoffId: 'hof-1', toId: 'U-02' },
      },
    },
  });
  const err = await createCerberusClient(transport, 'U-01')
    .acceptHandoff('hof-1')
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({
    status: 409,
    code: 'HANDOFF_ALREADY_ACCEPTED',
    details: { toId: 'U-02' },
  });
});

test('429: expone Retry-After en details', async () => {
  const { transport } = fake({
    status: 429,
    body: { error: { code: 'RATE_LIMITED', message: 'Demasiadas peticiones.' } },
    headers: { 'retry-after': '17' },
  });
  await expect(createCerberusClient(transport).getHealth()).rejects.toMatchObject({
    status: 429,
    code: 'RATE_LIMITED',
    details: { retryAfter: 17 },
  });
});

test('5xx con cuerpo del contrato conserva su código', async () => {
  const { transport } = fake({
    status: 500,
    body: { error: { code: 'STORAGE_UNAVAILABLE', message: 'No disponible.' } },
  });
  await expect(createCerberusClient(transport).getHealth()).rejects.toMatchObject({
    status: 500,
    code: 'STORAGE_UNAVAILABLE',
  });
});

test('error sin el formato del contrato: MALFORMED_RESPONSE con su estado', async () => {
  const { transport } = fake({ status: 502, body: undefined });
  await expect(createCerberusClient(transport).getHealth()).rejects.toMatchObject({
    status: 502,
    code: 'MALFORMED_RESPONSE',
  });
});

test('2xx con cuerpo que no cumple el esquema: MALFORMED_RESPONSE sin volcar datos', async () => {
  const { transport } = fake({ status: 200, body: { ...HEALTH, storage: 'disco' } });
  const err = (await createCerberusClient(transport)
    .getHealth()
    .catch((e: unknown) => e)) as ApiError;
  expect(err).toMatchObject({ status: 200, code: 'MALFORMED_RESPONSE' });
  expect(JSON.stringify(err.details)).toContain('storage');
  expect(JSON.stringify(err.details)).not.toContain('disco');
});

test('sin conexión y tiempo agotado se propagan como ApiError del transporte', async () => {
  const offline = fake(new ApiError(0, 'NETWORK_ERROR', 'sin red'));
  await expect(createCerberusClient(offline.transport).getHealth()).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR',
  });
  const slow = fake(new ApiError(0, 'TIMEOUT', 'lento'));
  await expect(createCerberusClient(slow.transport).getHealth()).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
  const odd = fake(new Error('boom'));
  await expect(createCerberusClient(odd.transport).getHealth()).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR',
  });
});

test('los POST que exigen Idempotency-Key la generan y se puede fijar a mano', async () => {
  const random = seq();
  const { transport, calls } = fake({ status: 500, body: undefined });
  const client = createCerberusClient(transport, 'R1', random);
  await client.verifyAccess({ token: 'nq_x' }).catch(() => undefined);
  await client
    .createRecognitionEvent({ source: { kind: 'ROBOT', id: 'R1' }, face: { status: 'UNKNOWN' } })
    .catch(() => undefined);
  await client
    .createInvitation({ hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' })
    .catch(() => undefined);
  await client.createHandoff({ visitId: 'vis-1', reason: 'LOW_BATTERY' }).catch(() => undefined);
  await client.reportRobotFailure('R2', { code: 'MOTOR_FAULT' }).catch(() => undefined);
  await client
    .verifyAccess({ token: 'nq_x' }, { idempotencyKey: 'clave-fija-0001' })
    .catch(() => undefined);
  const keys = calls.map((c) => c.headers?.['idempotency-key']);
  expect(
    keys.slice(0, 5).every((k) => typeof k === 'string' && k.length >= 8 && k.length <= 128),
  ).toBe(true);
  expect(new Set(keys.slice(0, 5)).size).toBe(5);
  expect(keys[5]).toBe('clave-fija-0001');
});

test('los POST sin exigencia no llevan clave y los GET tampoco', async () => {
  const { transport, calls } = fake({ status: 500, body: undefined });
  const client = createCerberusClient(transport, 'U-01');
  await client.advanceVisit('vis-1', { event: 'ARRIVE' }).catch(() => undefined);
  await client.closeVisit('vis-1').catch(() => undefined);
  await client.getVisit('vis-1').catch(() => undefined);
  expect(calls.every((c) => !c.headers?.['idempotency-key'])).toBe(true);
});

test('cada operación usa su método y ruta del contrato', async () => {
  const { transport, calls } = fake({ status: 500, body: undefined });
  const c = createCerberusClient(transport, 'O-01');
  const run = (p: Promise<unknown>) => p.catch(() => undefined);
  await run(c.resetDemo({ now: '2026-10-27T10:00:00-05:00' }));
  await run(c.listPeople({ role: 'ROBOT' }));
  await run(c.getPerson('V-201'));
  await run(c.listActivities({ date: '2026-10-24' }));
  await run(c.listInvitations({ hostId: 'V-202', state: 'ACTIVE' }));
  await run(c.getInvitation('inv-1'));
  await run(c.cancelInvitation('inv-1'));
  await run(c.listVisits({ state: 'IN_PROGRESS', ownerId: 'R2', limit: 5 }));
  await run(c.submitFeedback('vis-1', { clubRating: 4 }));
  await run(c.transferHandoffContext('hof-1'));
  await run(c.confirmHandoff('hof-1'));
  await run(c.cancelHandoff('hof-1', { cancelReason: 'OPERATOR' }));
  expect(calls.map((x) => `${x.method} ${x.path}`)).toEqual([
    'POST /demo/reset',
    'GET /people?role=ROBOT',
    'GET /people/V-201',
    'GET /activities?date=2026-10-24',
    'GET /invitations?hostId=V-202&state=ACTIVE',
    'GET /invitations/inv-1',
    'POST /invitations/inv-1/cancel',
    'GET /visits?state=IN_PROGRESS&ownerId=R2&limit=5',
    'POST /visits/vis-1/feedback',
    'POST /handoffs/hof-1/context',
    'POST /handoffs/hof-1/confirm',
    'POST /handoffs/hof-1/cancel',
  ]);
  expect(calls[11]?.body).toEqual({ cancelReason: 'OPERATOR' });
});

test('newIdempotencyKey usa 128 bits aleatorios en hexadecimal', () => {
  expect(newIdempotencyKey(seq())).toMatch(/^cb-[0-9a-f]{32}$/);
  expect(newIdempotencyKey()).toMatch(/^cb-[0-9a-f]{32}$/);
});
