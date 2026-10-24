import { checkBotKey, hashPassword, signToken, verifyPassword, verifyToken } from '@/club/auth';
import { createClubApp } from '@/club/app';
import { clubConfig } from '@/club/config';
import { DEMO_CLAVE } from '@/club/seed';
import { clubPath } from '@/club/server';
import { robotRoutes } from '@/club/robot';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { makeClub } from '../../support/club-app';

const NOW = new Date('2026-10-24T15:00:00Z');
const cfg = clubConfig({});
const app = createClubApp({ store: createMemoryStore(), cfg, clock: () => NOW });
const call = async (
  method: string,
  path: string,
  init: { body?: unknown; token?: string; bot?: string } = {},
) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.bot) headers['x-bot-key'] = init.bot;
  const res = await app(
    new Request(`http://x/api${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    path,
  );
  return { status: res.status, body: await res.json() };
};

test('contraseñas scrypt y JWT HS256 con vencimiento', () => {
  const h = hashPassword('secreta');
  expect(verifyPassword('secreta', h)).toBe(true);
  expect(verifyPassword('otra', h)).toBe(false);
  expect(verifyPassword('x', 'md5$a$b')).toBe(false);
  const t = signToken({ sub: 'u-sofia', rol: 'SOCIO' }, 's', 1000);
  expect(verifyToken(t, 's', 1000)).toMatchObject({ sub: 'u-sofia', rol: 'SOCIO', exp: 4600 });
  expect(() => verifyToken(t, 'otra', 1000)).toThrow('token_invalido');
  expect(() => verifyToken(t, 's', 4600)).toThrow('token_vencido');
  expect(() => verifyToken('a.b', 's', 0)).toThrow('token_invalido');
});

test('login devuelve token y perfil sin hash; credenciales malas 401 y luego 429', async () => {
  const ok = await call('POST', '/auth/login', {
    body: { email: 'Sofia@nclub.demo', clave: DEMO_CLAVE },
  });
  expect(ok.status).toBe(200);
  expect(ok.body.usuario).toMatchObject({ id: 'u-sofia', rol: 'SOCIO', nivel: 'VIP' });
  expect(ok.body.usuario).not.toHaveProperty('clave_hash');
  const me = await call('GET', '/me', { token: ok.body.token });
  expect(me.body).toMatchObject({ persona_id: 'sofia' });
  const refreshed = await call('POST', '/auth/refresh', { token: ok.body.token });
  expect(typeof refreshed.body.token).toBe('string');
  for (let i = 0; i < 5; i++) {
    expect(
      (await call('POST', '/auth/login', { body: { email: 'andres@nclub.demo', clave: 'x' } }))
        .status,
    ).toBe(401);
  }
  const blocked = await call('POST', '/auth/login', {
    body: { email: 'andres@nclub.demo', clave: DEMO_CLAVE },
  });
  expect(blocked).toMatchObject({ status: 429, body: { error: 'demasiados_intentos' } });
});

test('rutas: 401 sin token, 404 desconocida, 405 método, errores {error, detalle}', async () => {
  expect(await call('GET', '/me')).toMatchObject({ status: 401, body: { error: 'sin_token' } });
  expect((await call('GET', '/nada')).body).toEqual({
    error: 'ruta_no_encontrada',
    detalle: 'La ruta no existe.',
  });
  expect((await call('DELETE', '/me')).status).toBe(405);
  expect((await call('GET', '/club-health')).body).toMatchObject({ status: 'ok' });
  expect((await call('GET', '/me', { token: 'basura' })).status).toBe(401);
});

test('configuración: secretos de desarrollo solo fuera de Vercel', () => {
  expect(clubConfig({}).botKey).toBeTruthy();
  expect(clubConfig({ VERCEL: '1' }).botKey).toBeUndefined();
  expect(clubConfig({ VERCEL: '1', CERBERUS_BOT_KEY: 'k' }).botKey).toBe('k');
});

test('clubPath resuelve la reescritura de Vercel y la ruta directa', () => {
  expect(clubPath(new URL('http://x/api/club?__path=bot/registros'))).toBe('/bot/registros');
  expect(clubPath(new URL('http://x/api/invitaciones/abc/'))).toBe('/invitaciones/abc');
});

test('ADMIN inicia sesión, consulta /me y renueva el token; sin nivel ni persona', async () => {
  const ok = await call('POST', '/auth/login', {
    body: { email: 'admin@nclub.demo', clave: DEMO_CLAVE },
  });
  expect(ok.body.usuario).toMatchObject({
    id: 'u-luciana',
    rol: 'ADMIN',
    nombre: 'Luciana',
    apellido: 'Vargas',
    nivel: null,
    persona_id: null,
  });
  expect((await call('GET', '/me', { token: ok.body.token })).status).toBe(200);
  expect((await call('POST', '/auth/refresh', { token: ok.body.token })).status).toBe(200);
});

test.each([
  ['personal@nclub.demo', 'PERSONAL', 'u-marta'],
  ['edecan@nclub.demo', 'EDECAN', 'u-mateo'],
])('%s inicia sesión, consulta /me, renueva y registra su token push', async (email, rol, id) => {
  const club = makeClub(robotRoutes);
  const ok = await club.call('POST', '/auth/login', { body: { email, clave: DEMO_CLAVE } });
  expect(ok.body.usuario).toMatchObject({ id, rol });
  const token = ok.body.token as string;
  expect((await club.call('GET', '/me', { token })).body).toMatchObject({ id, rol });
  expect((await club.call('POST', '/auth/refresh', { token })).status).toBe(200);
  const push = await club.call('POST', '/me/push-token', {
    token,
    body: { token: 'ExponentPushToken[x]', plataforma: 'expo' },
  });
  expect(push.status).toBe(200);
});

test('la clave del puente es adicional: ambas autorizan y las ausentes o ajenas fallan', async () => {
  const bridgeCfg = { ...cfg, botKey: 'robot-original', bridgeKey: 'puente-adicional' };
  const bridgeApp = createClubApp({
    store: createMemoryStore(),
    cfg: bridgeCfg,
    routes: [
      {
        method: 'GET',
        path: '/bot/prueba',
        auth: 'BOT',
        handler: async () => Response.json({ ok: true }),
      },
    ],
  });
  for (const key of ['robot-original', 'puente-adicional', 'incorrecta', '']) {
    const response = await bridgeApp(
      new Request('http://x/api/bot/prueba', { headers: { 'x-bot-key': key } }),
      '/bot/prueba',
    );
    expect(response.status).toBe(['robot-original', 'puente-adicional'].includes(key) ? 200 : 401);
  }
  expect(() => checkBotKey(null, 'robot-original')).toThrow('bot_no_autorizado');
  expect(() => checkBotKey('', 'robot-original', '')).toThrow('bot_no_autorizado');
  expect(() => checkBotKey('puente-adicional', 'robot-original')).toThrow('bot_no_autorizado');
});
