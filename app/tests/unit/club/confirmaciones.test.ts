import { createClubApp } from '@/club/app';
import { signToken } from '@/club/auth';
import { clubConfig } from '@/club/config';
import { confirmacionesRoutes } from '@/club/confirmaciones';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

const ID = 'f39a2e70-75bc-4b27-a515-012345678901';
const body = {
  id: ID,
  anfitrion_id: 'andres',
  visitante_desc: 'Dice llamarse Pedro Gomez',
  evento_id: null,
  vence_en_s: 45,
};
function setup() {
  let now = new Date('2026-10-24T15:00:00Z');
  const cfg = clubConfig({});
  const store = createMemoryStore();
  const app = createClubApp({ store, cfg, routes: confirmacionesRoutes, clock: () => now });
  return {
    store,
    advance: (seconds: number) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
    call: async (method: string, path: string, data?: unknown, role = 'BOT') => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (role === 'BOT') headers['x-bot-key'] = cfg.botKey!;
      else if (role)
        headers.authorization = `Bearer ${signToken({ sub: role === 'CONCIERGE' ? 'u-natalia' : `u-${role}`, rol: role === 'CONCIERGE' ? 'CONCIERGE' : 'SOCIO' }, cfg.jwtSecret!, now.getTime() / 1000)}`;
      const res = await app(
        new Request(`http://x${path}`, {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        path,
      );
      return { status: res.status, body: await res.json() };
    },
  };
}

test('creación concurrente idempotente y pendientes solo del socio dueño', async () => {
  const { call } = setup();
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/bot/confirmaciones', body)));
  expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
  expect(results.filter((r) => r.status === 200).map((r) => r.body)).toEqual([
    { duplicado: true },
    { duplicado: true },
  ]);
  expect(
    (await call('GET', '/confirmaciones/pendientes', undefined, 'andres')).body.items,
  ).toHaveLength(1);
  expect((await call('GET', '/confirmaciones/pendientes', undefined, 'sofia')).body).toEqual({
    items: [],
  });
  expect((await call('GET', `/bot/confirmaciones/${ID}`)).body).toEqual({
    estado: 'PENDIENTE',
    respondida_at: null,
  });
});

test.each([true, false])(
  'dueño responde aprueba=%s; ajeno 403 y respuesta repetida 409',
  async (aprueba) => {
    const { call } = setup();
    await call('POST', '/bot/confirmaciones', body);
    expect(
      (await call('POST', `/confirmaciones/${ID}/responder`, { aprueba }, 'sofia')).status,
    ).toBe(403);
    expect(
      await call('POST', `/confirmaciones/${ID}/responder`, { aprueba }, 'andres'),
    ).toMatchObject({
      status: 200,
      body: {
        estado: aprueba ? 'APROBADA' : 'RECHAZADA',
        respondida_at: '2026-10-24T10:00:00.000-05:00',
      },
    });
    expect(
      (await call('POST', `/confirmaciones/${ID}/responder`, { aprueba }, 'andres')).status,
    ).toBe(409);
    expect((await call('GET', `/bot/confirmaciones/${ID}`)).body.estado).toBe(
      aprueba ? 'APROBADA' : 'RECHAZADA',
    );
    expect(
      (await call('GET', '/confirmaciones/pendientes', undefined, 'andres')).body.items,
    ).toEqual([]);
  },
);

test('vence en el límite, se persiste perezosamente y no admite respuesta', async () => {
  const { call, advance, store } = setup();
  await call('POST', '/bot/confirmaciones', body);
  advance(44);
  expect(
    (await call('GET', '/confirmaciones/pendientes', undefined, 'andres')).body.items,
  ).toHaveLength(1);
  advance(1);
  expect(
    (await call('POST', `/confirmaciones/${ID}/responder`, { aprueba: true }, 'andres')).status,
  ).toBe(409);
  expect((await call('GET', '/confirmaciones/pendientes', undefined, 'andres')).body.items).toEqual(
    [],
  );
  expect((await call('GET', `/bot/confirmaciones/${ID}`)).body).toEqual({
    estado: 'VENCIDA',
    respondida_at: null,
  });
  expect((await store.get<{ estado: string }>('club:confirmacion:' + ID))?.value.estado).toBe(
    'VENCIDA',
  );
});

test('poll del bot vence la confirmación sin pendientes previo; respuesta simultánea tiene un ganador', async () => {
  const { call, advance } = setup();
  await call('POST', '/bot/confirmaciones', body);
  const results = await Promise.all(
    [true, false].map((aprueba) =>
      call('POST', `/confirmaciones/${ID}/responder`, { aprueba }, 'andres'),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  advance(46);
  expect((await call('GET', `/bot/confirmaciones/${ID}`)).body.estado).not.toBe('VENCIDA');
  const other = ID.slice(0, -1) + '2';
  await call('POST', '/bot/confirmaciones', { ...body, id: other, vence_en_s: 5 });
  advance(6);
  expect((await call('GET', `/bot/confirmaciones/${other}`)).body.estado).toBe('VENCIDA');
});

test.each([
  { id: 'x' },
  { anfitrion_id: '' },
  { visitante_desc: '' },
  { evento_id: 'x' },
  { vence_en_s: 4 },
  { vence_en_s: 601 },
  { vence_en_s: 5.5 },
])('valida confirmación %j', async (patch) => {
  expect((await setup().call('POST', '/bot/confirmaciones', { ...body, ...patch })).status).toBe(
    422,
  );
});

test('valida respuesta, ausentes y permisos', async () => {
  const { call } = setup();
  expect((await call('POST', '/bot/confirmaciones', body, '')).status).toBe(401);
  expect((await call('GET', '/bot/confirmaciones/ausente')).status).toBe(404);
  expect(
    (await call('POST', '/confirmaciones/ausente/responder', { aprueba: true }, 'andres')).status,
  ).toBe(404);
  expect(
    (await call('POST', `/confirmaciones/${ID}/responder`, { aprueba: 'true' }, 'andres')).status,
  ).toBe(422);
  expect((await call('GET', '/confirmaciones/pendientes', undefined, 'CONCIERGE')).status).toBe(
    403,
  );
});
