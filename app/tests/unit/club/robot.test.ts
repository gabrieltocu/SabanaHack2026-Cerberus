import { createClubApp } from '@/club/app';
import { signToken } from '@/club/auth';
import { clubConfig } from '@/club/config';
import { robotRoutes } from '@/club/robot';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

function setup() {
  let now = new Date('2026-10-24T15:00:00Z');
  const store = createMemoryStore();
  const cfg = clubConfig({});
  const app = createClubApp({ store, cfg, routes: robotRoutes, clock: () => now });
  return {
    store,
    advance: (s: number) => {
      now = new Date(now.getTime() + s * 1000);
    },
    call: async (method: string, path: string, body?: unknown, role = 'BOT') => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (role === 'BOT') headers['x-bot-key'] = 'local-CERBERUS_BOT_KEY';
      else if (role)
        headers.authorization = `Bearer ${signToken({ sub: role === 'SOCIO' ? 'u-andres' : role === 'ADMIN' ? 'u-luciana' : 'u-natalia', rol: role === 'SOCIO' ? 'SOCIO' : role === 'ADMIN' ? 'ADMIN' : 'CONCIERGE' }, cfg.jwtSecret!, now.getTime() / 1000)}`;
      const res = await app(
        new Request(`http://x${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        path,
      );
      return { status: res.status, body: await res.json() };
    },
  };
}

test('robot sin latido, en línea 44/45 s, fuera a los 46 s y recuperado', async () => {
  const { call, advance } = setup();
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body).toEqual({
    en_linea: false,
    ultimo_latido: null,
    robot: null,
    estado: null,
    detalle: null,
  });
  expect(
    (await call('POST', '/bot/heartbeat', { robot: 'x2-1', estado: 'ok', detalle: '' })).status,
  ).toBe(200);
  advance(44);
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body).toEqual({
    en_linea: true,
    ultimo_latido: '2026-10-24T10:00:00.000-05:00',
    robot: 'x2-1',
    estado: 'ok',
    detalle: '',
  });
  advance(1);
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body.en_linea).toBe(true);
  advance(1);
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body.en_linea).toBe(false);
  await call('POST', '/bot/heartbeat', {
    robot: 'x2-2',
    estado: 'sin_servicio',
    detalle: 'Sin conexión al motor',
  });
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body).toMatchObject({
    en_linea: true,
    robot: 'x2-2',
    estado: 'sin_servicio',
  });
});

test('push tokens sin duplicados, aislados por usuario, máximo cinco incluso concurrentes', async () => {
  const { call, store } = setup();
  const push = (token: string, plataforma = 'web', role = 'SOCIO') =>
    call('POST', '/me/push-token', { token, plataforma }, role);
  expect((await push('t0')).status).toBe(200);
  await push('t0');
  expect((await store.get<unknown[]>('club:push:u-andres'))?.value).toHaveLength(1);
  await push('t0', 'ios');
  for (const plataforma of ['android', 'expo']) await push(plataforma, plataforma);
  await Promise.all(['t1', 't2', 't3'].map((t) => push(t)));
  const tokens = (await store.get<{ token: string; plataforma: string }[]>('club:push:u-andres'))!
    .value;
  expect(tokens).toHaveLength(5);
  expect(new Set(tokens.map((t) => t.token)).size).toBe(5);
  expect(tokens.some((t) => t.token === 't3')).toBe(true);
  await push('concierge', 'web', 'CONCIERGE');
  expect((await store.get<unknown[]>('club:push:u-natalia'))?.value).toHaveLength(1);
});

test.each([
  { token: '', plataforma: 'web' },
  { token: 'x', plataforma: 'desktop' },
  { token: 4, plataforma: 'ios' },
  { token: 'x'.repeat(4097), plataforma: 'expo' },
])('valida token %j', async (body) => {
  expect((await setup().call('POST', '/me/push-token', body, 'SOCIO')).status).toBe(422);
});

test('valida latido y protege rutas por llave y rol', async () => {
  const { call } = setup();
  expect(
    (await call('POST', '/bot/heartbeat', { robot: '', estado: 'ok', detalle: '' })).status,
  ).toBe(422);
  expect((await call('POST', '/bot/heartbeat', {}, '')).status).toBe(401);
  expect((await call('GET', '/robot/estado', undefined, 'SOCIO')).status).toBe(403);
  expect((await call('POST', '/me/push-token', {}, '')).status).toBe(401);
});

test('latido: estado ok, acompanando o sin_servicio; detalle opcional de hasta 200', async () => {
  const { call } = setup();
  for (const estado of ['ok', 'acompanando', 'sin_servicio'])
    expect((await call('POST', '/bot/heartbeat', { robot: 'x2-1', estado })).status).toBe(200);
  expect((await call('GET', '/robot/estado', undefined, 'CONCIERGE')).body).toMatchObject({
    estado: 'sin_servicio',
    detalle: null,
  });
  const latido = (detalle: string) =>
    call('POST', '/bot/heartbeat', { robot: 'x2-1', estado: 'ok', detalle });
  expect((await latido('x'.repeat(200))).status).toBe(200);
  expect((await latido('x'.repeat(201))).status).toBe(422);
  expect((await call('POST', '/bot/heartbeat', { robot: 'x2-1', estado: 'error' })).status).toBe(
    422,
  );
});

test('ADMIN lee el estado del robot y registra su push token', async () => {
  const { call } = setup();
  expect((await call('GET', '/robot/estado', undefined, 'ADMIN')).status).toBe(200);
  expect(
    (await call('POST', '/me/push-token', { token: 't', plataforma: 'web' }, 'ADMIN')).status,
  ).toBe(200);
});
