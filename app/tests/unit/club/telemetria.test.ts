import { createClubApp } from '@/club/app';
import { signToken } from '@/club/auth';
import { clubConfig } from '@/club/config';
import { telemetriaRoutes, type TelemetriaEntrada } from '@/club/telemetria';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { BOT_KEY, NOW } from '../../support/club-app';

const entrada = (overrides: Partial<TelemetriaEntrada> = {}): TelemetriaEntrada => ({
  id: '0c9e7078-c687-4cb2-bf81-f9dcfb919ea2',
  robot: 'x2-1',
  origen: 'real',
  tipo: 'estado',
  observado_at: '2026-10-24T10:00:00-05:00',
  mensaje: 'listo',
  datos: { fsm: 3 },
  ...overrides,
});
function setup() {
  let now = NOW;
  const store = createMemoryStore();
  const cfg = clubConfig({});
  const app = createClubApp({ store, cfg, routes: telemetriaRoutes, clock: () => now });
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    auth: 'BOT' | string | null = 'BOT',
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth === 'BOT') headers['x-bot-key'] = BOT_KEY;
    else if (auth)
      headers.authorization = `Bearer ${signToken({ sub: auth, rol: auth === 'u-andres' ? 'SOCIO' : auth === 'u-luciana' ? 'ADMIN' : 'CONCIERGE' }, cfg.jwtSecret!, now.getTime() / 1000)}`;
    const res = await app(
      new Request(`http://x${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path,
    );
    return { status: res.status, body: await res.json() };
  };
  return { call, store, setNow: (date: Date) => (now = date) };
}

test('auth BOT/JWT, esquema estricto, snapshot por origen, dedupe y conflicto de UUID', async () => {
  const { call } = setup();
  expect((await call('POST', '/bot/telemetria', entrada(), null)).status).toBe(401);
  expect((await call('GET', '/robot/telemetria', undefined, 'u-andres')).status).toBe(403);
  expect((await call('GET', '/robot/telemetria', undefined, null)).status).toBe(401);
  expect((await call('POST', '/bot/telemetria', { ...entrada(), audio: 'x' })).status).toBe(422);
  expect(
    (await call('POST', '/bot/telemetria', entrada({ origen: 'desconocido' as never }))).status,
  ).toBe(422);
  for (const datos of [
    { bateria_pct: 101 },
    { bateria_v: Number.POSITIVE_INFINITY },
    { fsm: 1.5 },
    { velocidad_orden_m_s: 2.1 },
    { alertas: Array(13).fill(1) },
    { payload: 'no permitido' },
    { origen_medicion: 'NCLUB1|qr|persona|firma' },
    { origen_medicion: ['data:', 'image/png;base64,AAAA'].join('') },
  ]) {
    expect((await call('POST', '/bot/telemetria', entrada({ datos } as never))).status).toBe(422);
  }
  expect(
    (
      await call(
        'POST',
        '/bot/telemetria',
        entrada({ mensaje: ['data:', 'image/png;base64,AAAA'].join('') }),
      )
    ).status,
  ).toBe(422);
  expect(
    (await call('POST', '/bot/telemetria', entrada({ mensaje: 'NCLUB1|qr|persona|firma' }))).status,
  ).toBe(422);
  expect((await call('POST', '/bot/telemetria', entrada())).status).toBe(201);
  expect((await call('POST', '/bot/telemetria', entrada())).status).toBe(200);
  expect((await call('POST', '/bot/telemetria', entrada({ mensaje: 'otro' }))).status).toBe(409);
  const sim = entrada({
    id: '9b4886c1-9383-4211-bca6-69e45dbf0f27',
    origen: 'simulacion',
    observado_at: '2026-10-24T10:01:00-05:00',
  });
  await call('POST', '/bot/telemetria', sim);
  const get = await call('GET', '/robot/telemetria', undefined, 'u-luciana');
  expect(get.body.eventos).toHaveLength(0);
  expect(get.body.estado).toMatchObject({ origen: 'simulacion' });
  expect(get.body.desactualizada).toBe(false);
});

test('sin snapshots responde null y desactualizada; no interpreta valores ausentes como cero', async () => {
  const { call } = setup();
  const get = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(get.body).toEqual({ estado: null, eventos: [], desactualizada: true });
});

test('rechaza timestamps futuros, acepta estados offline y no congela lecturas actuales', async () => {
  const { call } = setup();
  expect(
    (await call('POST', '/bot/telemetria', entrada({ observado_at: '2099-01-01T00:00:00Z' })))
      .status,
  ).toBe(422);
  expect(
    (await call('POST', '/bot/telemetria', entrada({ observado_at: '2000-01-01T00:00:00Z' })))
      .status,
  ).toBe(201);
  expect(
    (await call('POST', '/bot/telemetria', entrada({ id: '9b4886c1-9383-4211-bca6-69e45dbf0f27' })))
      .status,
  ).toBe(201);
  const get = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(get.body.estado).toMatchObject({ observado_at: '2026-10-24T10:00:00-05:00' });
});

test('GET oculta eventos recibidos hace más de 24 horas y conserva snapshot como desactualizado', async () => {
  const { call, setNow } = setup();
  await call(
    'POST',
    '/bot/telemetria',
    entrada({ tipo: 'voz', id: '9b4886c1-9383-4211-bca6-69e45dbf0f27' }),
  );
  const oldState = await call('POST', '/bot/telemetria', entrada());
  expect(oldState.status).toBe(201);
  setNow(new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 1));
  const get = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(get.body.eventos).toEqual([]);
  expect(get.body.estado).toMatchObject({ id: entrada().id });
  expect(get.body.desactualizada).toBe(true);
  await call(
    'POST',
    '/bot/telemetria',
    entrada({ tipo: 'voz', id: '2f35a1f8-1141-4158-957f-00b2cf0bac39' }),
  );
  const fresh = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(fresh.body.eventos.map((event: TelemetriaEntrada) => event.id)).toEqual([
    '2f35a1f8-1141-4158-957f-00b2cf0bac39',
  ]);
});

test('no acepta estado fuera de orden por robot y origen; comandos no alteran snapshot y lista limita 100', async () => {
  const { call, setNow } = setup();
  await call('POST', '/bot/telemetria', entrada());
  await call(
    'POST',
    '/bot/telemetria',
    entrada({
      id: '2f35a1f8-1141-4158-957f-00b2cf0bac39',
      tipo: 'movimiento_solicitado',
      observado_at: '2026-10-24T10:02:00-05:00',
      mensaje: 'solicitar',
    }),
  );
  await call(
    'POST',
    '/bot/telemetria',
    entrada({
      id: '2f35a1f8-1141-4158-957f-00b2cf0bac40',
      mensaje: 'atrasado',
      observado_at: '2026-10-24T09:00:00-05:00',
    }),
  );
  const beforeVolume = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(beforeVolume.body.estado.mensaje).toBe('listo');
  expect(beforeVolume.body.eventos.map((e: TelemetriaEntrada) => e.tipo)).toEqual([
    'movimiento_solicitado',
  ]);
  for (let i = 0; i < 102; i++)
    await call(
      'POST',
      '/bot/telemetria',
      entrada({
        id: `1${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
        tipo: 'voz',
        mensaje: `evento ${i}`,
      }),
    );
  const get = await call('GET', '/robot/telemetria', undefined, 'u-natalia');
  expect(get.body.estado.mensaje).toBe('listo');
  expect(get.body.eventos).toHaveLength(100);
  setNow(new Date(NOW.getTime() + 15_001));
  expect((await call('GET', '/robot/telemetria', undefined, 'u-natalia')).body.desactualizada).toBe(
    true,
  );
});
