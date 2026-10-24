import { ApiError } from '@/infrastructure/clients/errors';
import { createHttpTransport } from '@/infrastructure/clients/http-transport';

type FetchInit = Parameters<typeof fetch>[1];

const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });

function setup(responses: (Response | Error)[], opts: { timeoutMs?: number } = {}) {
  const calls: { url: string; init: FetchInit }[] = [];
  const delays: number[] = [];
  const queue = [...responses];
  const fetchMock = (async (url: string, init: FetchInit) => {
    calls.push({ url, init });
    const next = queue.shift() ?? reply(200, {});
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const transport = createHttpTransport({
    baseUrl: 'https://club.test/api/v1',
    fetch: fetchMock,
    sleep: async (ms) => void delays.push(ms),
    ...opts,
  });
  return { transport, calls, delays };
}

test('envía la ruta bajo la base, cabeceras JSON y cuerpo serializado', async () => {
  const { transport, calls } = setup([reply(201, { ok: true })]);
  const res = await transport({
    method: 'POST',
    path: '/invitations?x=1',
    body: { a: 1 },
    headers: { 'x-demo-actor': 'V-202' },
  });
  expect(res).toMatchObject({ status: 201, body: { ok: true } });
  expect(calls[0]?.url).toBe('https://club.test/api/v1/invitations?x=1');
  expect(calls[0]?.init?.method).toBe('POST');
  expect(calls[0]?.init?.body).toBe('{"a":1}');
  expect(calls[0]?.init?.headers).toMatchObject({
    'content-type': 'application/json',
    accept: 'application/json',
    'x-demo-actor': 'V-202',
  });
});

test('un GET no lleva cuerpo ni content-type', async () => {
  const { transport, calls } = setup([reply(200, { items: [], count: 0 })]);
  await transport({ method: 'GET', path: '/visits' });
  expect(calls[0]?.init?.body).toBeUndefined();
  expect(calls[0]?.init?.headers).not.toHaveProperty('content-type');
});

test('devuelve los errores 4xx sin reintentar', async () => {
  const { transport, calls } = setup([reply(409, { error: { code: 'VERSION_CONFLICT' } })]);
  const res = await transport({ method: 'GET', path: '/visits/vis-1' });
  expect(res.status).toBe(409);
  expect(calls).toHaveLength(1);
});

test('reintenta un GET con 5xx hasta dos veces con esperas de 300 y 900 ms', async () => {
  const { transport, calls, delays } = setup([
    reply(503, undefined),
    reply(502, undefined),
    reply(200, { ok: 1 }),
  ]);
  const res = await transport({ method: 'GET', path: '/health' });
  expect(res).toMatchObject({ status: 200, body: { ok: 1 } });
  expect(calls).toHaveLength(3);
  expect(delays).toEqual([300, 900]);
});

test('agota los reintentos del GET y devuelve la última respuesta', async () => {
  const { transport, calls } = setup([reply(500, '{}'), reply(500, '{}'), reply(500, '{}')]);
  expect((await transport({ method: 'GET', path: '/health' })).status).toBe(500);
  expect(calls).toHaveLength(3);
});

test('reintenta un GET tras un fallo de red y lo informa si persiste', async () => {
  const { transport, calls } = setup([
    new TypeError('fail'),
    new TypeError('fail'),
    new TypeError('fail'),
  ]);
  await expect(transport({ method: 'GET', path: '/health' })).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR',
  });
  expect(calls).toHaveLength(3);
});

test('nunca reintenta una escritura sin Idempotency-Key', async () => {
  const { transport, calls } = setup([reply(503, undefined), reply(200, {})]);
  const res = await transport({ method: 'POST', path: '/visits/vis-1/close' });
  expect(res.status).toBe(503);
  expect(calls).toHaveLength(1);
  const net = setup([new TypeError('fail')]);
  await expect(net.transport({ method: 'POST', path: '/x', body: {} })).rejects.toBeInstanceOf(
    ApiError,
  );
  expect(net.calls).toHaveLength(1);
});

test('reintenta una escritura que lleva Idempotency-Key', async () => {
  const { transport, calls } = setup([new TypeError('fail'), reply(201, { id: 'inv-1' })]);
  const res = await transport({
    method: 'POST',
    path: '/invitations',
    body: {},
    headers: { 'Idempotency-Key': 'clave-de-prueba-1' },
  });
  expect(res.status).toBe(201);
  expect(calls).toHaveLength(2);
});

test('convierte el vencimiento del tiempo en TIMEOUT', async () => {
  const hanging = ((_url: string, init: FetchInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
    })) as unknown as typeof fetch;
  const transport = createHttpTransport({
    baseUrl: '/api/v1',
    fetch: hanging,
    timeoutMs: 5,
    sleep: async () => {},
  });
  await expect(transport({ method: 'POST', path: '/x', body: {} })).rejects.toMatchObject({
    status: 0,
    code: 'TIMEOUT',
  });
});

test('un cuerpo que no es JSON llega como undefined', async () => {
  const { transport } = setup([reply(502, '<html>bad gateway</html>')]);
  const res = await transport({ method: 'POST', path: '/x', body: {} });
  expect(res).toMatchObject({ status: 502, body: undefined });
});

test('usa /api/v1 por defecto y expone las cabeceras de la respuesta', async () => {
  const calls: string[] = [];
  const transport = createHttpTransport({
    fetch: (async (url: string) => {
      calls.push(url);
      return new Response('{}', { status: 429, headers: { 'Retry-After': '12' } });
    }) as unknown as typeof fetch,
  });
  const res = await transport({ method: 'POST', path: '/handoffs', body: {} });
  expect(calls[0]).toBe('/api/v1/handoffs');
  expect(res.headers).toMatchObject({ 'retry-after': '12' });
});

describe('modo de datos por plataforma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dataMode, DEFAULT_API_URL } = require('@/infrastructure/clients/config');
  test('la app nativa usa la API compartida por defecto y la web el demo local', () => {
    expect(dataMode('', true)).toBe('api');
    expect(dataMode('', false)).toBe('mock');
    expect(dataMode('mock', true)).toBe('mock');
    expect(dataMode('api', false)).toBe('api');
    expect(DEFAULT_API_URL).toMatch(/^https:\/\/.+\/api\/v1$/);
  });
});
