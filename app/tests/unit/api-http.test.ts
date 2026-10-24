import { toFetchHandler, type ApiRequest } from '@/api/http';

const echo = toFetchHandler(async (req: ApiRequest) => ({ status: 200, body: req }));
const JSON_HEADERS = { 'content-type': 'application/json' };

async function call(url: string, init?: RequestInit) {
  const res = await echo(new Request(url, init));
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

test('resuelve la ruta desde /api/v1 y desde la reescritura de Vercel, sin barra final', async () => {
  expect((await call('http://x/api/v1/visits/v-1/?state=OPEN')).body).toMatchObject({
    method: 'GET',
    path: '/visits/v-1',
    query: { state: 'OPEN' },
  });
  const rewritten = await call('http://x/api/router?__path=handoffs/h-1/accept&a=1', {
    method: 'POST',
    body: '{"attendantId":"U-02"}',
    headers: { ...JSON_HEADERS, 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
  });
  expect(rewritten.body).toMatchObject({
    path: '/handoffs/h-1/accept',
    query: { a: '1' },
    body: { attendantId: 'U-02' },
    ip: '1.2.3.4',
  });
  expect((await call('http://x/api/router?__path=')).body).toMatchObject({ path: '/' });
});

test('__path solo se honra en la entrada reescrita', async () => {
  const local = await call('http://x/api/v1/health?__path=otra');
  expect(local.body).toMatchObject({ path: '/health', query: { __path: 'otra' } });
});

test('la IP de la plataforma tiene prioridad y se acota', async () => {
  const vercel = await call('http://x/api/v1/health', {
    headers: { 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' },
  });
  expect(vercel.body).toMatchObject({ ip: '9.9.9.9' });
  const long = await call('http://x/api/v1/health', { headers: { 'x-real-ip': 'a'.repeat(200) } });
  expect((long.body as { ip: string }).ip).toHaveLength(64);
  expect((await call('http://x/api/v1/health')).body).toMatchObject({ ip: 'unknown' });
});

test('rechaza JSON inválido, tipos no JSON y cuerpos grandes con códigos estables', async () => {
  expect(
    await call('http://x/api/v1/invitations', { method: 'POST', body: '{', headers: JSON_HEADERS }),
  ).toEqual({ status: 400, body: { error: { code: 'BAD_REQUEST', message: 'JSON inválido' } } });
  const plain = await call('http://x/api/v1/invitations', {
    method: 'POST',
    body: '{"a":1}',
    headers: { 'content-type': 'text/plain' },
  });
  expect(plain.status).toBe(415);
  const big = await call('http://x/api/v1/invitations', {
    method: 'POST',
    body: 'x'.repeat(40000),
    headers: JSON_HEADERS,
  });
  expect(big.status).toBe(413);
  // 11k three-byte characters: under the char limit, over the byte limit.
  const multibyte = await call('http://x/api/v1/invitations', {
    method: 'POST',
    body: JSON.stringify({ n: '€'.repeat(11000) }),
    headers: JSON_HEADERS,
  });
  expect(multibyte.status).toBe(413);
  const declared = await call('http://x/api/v1/invitations', {
    method: 'POST',
    body: '{}',
    headers: { ...JSON_HEADERS, 'content-length': '999999' },
  });
  expect(declared.status).toBe(413);
  const empty = await call('http://x/api/v1/invitations/x/cancel', { method: 'POST' });
  expect(empty).toMatchObject({ status: 200, body: { path: '/invitations/x/cancel' } });
});

test('oculta errores internos y no cachea respuestas', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const boom = toFetchHandler(async () => {
    throw new Error('secreto interno');
  });
  const res = await boom(new Request('http://x/api/v1/health'));
  expect(res.status).toBe(500);
  expect(await res.text()).not.toContain('secreto');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(spy.mock.calls)).not.toContain('secreto');
  spy.mockRestore();
  const nothing = await toFetchHandler(async () => ({ status: 204, body: null }))(
    new Request('http://x/api/v1/x'),
  );
  expect(nothing.status).toBe(204);
});
