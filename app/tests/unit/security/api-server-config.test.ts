// Configuración de servidor con efecto de seguridad: reinicio desactivable y token opcional del robot.
// Las variables son solo de servidor: el modo navegador (demo local) corre sin token y sin ellas.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createApp } from '@/api/app';
import type { ApiRequest } from '@/api/http';
import { createServerApp } from '@/api/server';
import { fixedClock } from '@/domain/clock';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { T_DEMO, seededRandom } from '../../support/api-harness';

let n = 0;
const req = (
  method: string,
  path: string,
  o: { actor?: string; auth?: string; body?: unknown } = {},
): ApiRequest => ({
  method,
  path,
  query: {},
  headers: {
    ...(o.actor ? { 'x-demo-actor': o.actor } : {}),
    ...(o.auth !== undefined ? { authorization: o.auth } : {}),
    ...(method === 'POST' ? { 'idempotency-key': `k-config-${++n}-${'x'.repeat(8)}` } : {}),
  },
  body: o.body,
  ip: `10.1.${Math.floor(n / 25)}.1`,
});

describe('POST /demo/reset desactivable (CERBERUS_RESET_ENABLED)', () => {
  const reset = (env: Record<string, string>) =>
    createServerApp(env)(req('POST', '/demo/reset', { body: {} }));

  test('por defecto está habilitado', async () => {
    expect((await reset({})).status).toBe(200);
    expect((await reset({ CERBERUS_RESET_ENABLED: 'true' })).status).toBe(200);
  });

  test.each(['false', 'FALSE', '0', 'no', 'off', 'flase', ''])(
    'con CERBERUS_RESET_ENABLED=%j responde 403 RESET_DISABLED (falla cerrado ante cualquier valor que no sea true)',
    async (value) => {
      const res = await reset({ CERBERUS_RESET_ENABLED: value });
      expect([res.status, (res.body as { error: { code: string } }).error.code]).toEqual([
        403,
        'RESET_DISABLED',
      ]);
    },
  );

  test('el nombre anterior CERBERUS_DEMO_RESET=off sigue desactivándolo', async () => {
    expect((await reset({ CERBERUS_DEMO_RESET: 'off' })).status).toBe(403);
  });

  test('desactivado no toca el estado compartido', async () => {
    const handle = createServerApp({ CERBERUS_RESET_ENABLED: 'false' });
    const inv = await handle(
      req('POST', '/invitations', {
        actor: 'V-202',
        body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      }),
    );
    expect(inv.status).toBe(201);
    expect((await handle(req('POST', '/demo/reset', { body: {} }))).status).toBe(403);
    const id = (inv.body as { id: string }).id;
    expect((await handle(req('GET', `/invitations/${id}`, { actor: 'V-202' }))).status).toBe(200);
  });
});

describe('token opcional del robot (CERBERUS_ROBOT_TOKEN)', () => {
  const TOKEN = 'robot-secret-0123456789abcdef';
  const handle = () => createServerApp({ CERBERUS_ROBOT_TOKEN: TOKEN });
  const calls = (auth?: string) => [
    req('POST', '/recognition/events', {
      actor: 'R1',
      ...(auth !== undefined ? { auth } : {}),
      body: { source: { kind: 'ROBOT', id: 'R1' }, face: { status: 'UNKNOWN' } },
    }),
    req('POST', '/access/verify', {
      actor: 'R1',
      ...(auth !== undefined ? { auth } : {}),
      body: { token: 'nq_AAAAAAAAAAAAAAAAAAAAAA' },
    }),
    req('POST', '/robots/R2/failure', {
      actor: 'R2',
      ...(auth !== undefined ? { auth } : {}),
      body: { code: 'MOTOR_FAULT' },
    }),
  ];

  test.each([
    ['sin cabecera', undefined],
    ['esquema distinto', `Basic ${TOKEN}`],
    ['Bearer vacío', 'Bearer '],
    ['solo el esquema', 'Bearer'],
    ['token distinto de igual longitud', `Bearer ${TOKEN.replace(/.$/, 'X')}`],
    ['token más corto', `Bearer ${TOKEN.slice(0, -1)}`],
    ['token más largo', `Bearer ${TOKEN}0`],
    ['prefijo del token', `Bearer ${TOKEN.slice(0, 5)}`],
    ['token sin esquema', TOKEN],
  ])('%s: 401 UNAUTHENTICATED en los tres endpoints del robot', async (_n, auth) => {
    const app = handle();
    for (const r of calls(auth)) {
      const res = await app(r);
      expect([r.path, res.status]).toEqual([r.path, 401]);
      expect(res.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    }
  });

  test('el 401 va antes que el 403: sin token ni actor no se revela nada del actor', async () => {
    const res = await handle()(req('POST', '/access/verify', { body: { token: 'x' } }));
    expect(res.status).toBe(401);
  });

  test('con el token correcto (también con esquema en minúsculas) se atiende', async () => {
    const app = handle();
    for (const auth of [`Bearer ${TOKEN}`, `bearer ${TOKEN}`]) {
      const [rec, verify, fail] = calls(auth) as [ApiRequest, ApiRequest, ApiRequest];
      expect((await app(rec)).status).toBe(201);
      expect((await app(verify)).status).toBe(200);
      expect((await app(fail)).status).toBe(200);
    }
  });

  test('un token configurado pero vacío deniega todo (no abre la puerta)', async () => {
    const app = createServerApp({ CERBERUS_ROBOT_TOKEN: '' });
    for (const auth of ['Bearer ', 'Bearer', undefined]) {
      for (const r of calls(auth)) expect((await app(r)).status).toBe(401);
    }
  });

  test('el resto de la API no exige el token (lo usa la interfaz) y el 401 no cuenta como acierto', async () => {
    const app = handle();
    expect((await app(req('GET', '/health'))).status).toBe(200);
    expect((await app(req('GET', '/visits'))).status).toBe(200);
  });

  test('sin la variable, la cabecera Authorization se ignora', async () => {
    const app = createServerApp({});
    for (const r of calls('Bearer cualquier-cosa')) expect((await app(r)).status).toBeLessThan(400);
  });

  test('el modo navegador corre sin token y nunca lo conoce', async () => {
    const browser = createApp({
      store: createMemoryStore(),
      clock: fixedClock(T_DEMO),
      random: seededRandom(),
      storage: 'browser',
      resetEnabled: true,
    });
    for (const r of calls()) expect((await browser(r)).status).toBeLessThan(400);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    for (const dir of ['src', 'app']) walk(join(process.cwd(), dir));
    const readers = files
      .filter((f) => /ROBOT_TOKEN|CERBERUS_RESET|CERBERUS_RATE_LIMIT/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(process.cwd().length + 1));
    // Solo la composición del servidor lee estas variables; ni la interfaz ni los clientes.
    expect(readers).toEqual(['src/api/server.ts']);
  });
});
