import { signToken } from '@/club/auth';
import { personasRoutes, listPersonasRobot } from '@/club/personas';
import { makeClub, BOT_KEY, NOW } from '../../support/club-app';

const persona = (overrides: Record<string, unknown> = {}) => ({
  id: 'brain-new-1',
  nombre: '  Valeria Ríos  ',
  categoria: 'VIP',
  consentimiento: true,
  ...overrides,
});
function setup() {
  const { call, store, cfg } = makeClub(personasRoutes);
  const bot = (method: string, path: string, body?: unknown) =>
    call(method, path, { bot: BOT_KEY, ...(body === undefined ? {} : { body }) });
  const role = async (
    method: string,
    path: string,
    id: string,
    rol: 'SOCIO' | 'CONCIERGE' | 'ADMIN',
  ) => {
    const token = signToken({ sub: id, rol }, cfg.jwtSecret!, NOW.getTime() / 1000);
    return call(method, path, { token });
  };
  return { bot, role, store };
}

test('BOT registra y actualiza metadatos; lectura de personal ve solo extras activos sin datos sensibles', async () => {
  const { bot, role, store } = setup();
  expect((await bot('POST', '/bot/personas', persona())).status).toBe(201);
  expect(
    (await bot('POST', '/bot/personas', { ...persona(), consentimiento: undefined })).status,
  ).toBe(422);
  expect((await bot('POST', '/bot/personas', persona({ nombre: 'Valeria Rios' }))).status).toBe(
    200,
  );
  const disabled = await bot('POST', '/bot/personas', {
    id: 'brain-new-1',
    nombre: 'Valeria Ríos',
    categoria: 'VIP',
    activo: false,
    consentimiento: false,
  });
  expect(disabled.status).toBe(200);
  expect(disabled.body).toEqual({ persona: { id: 'brain-new-1', activo: false } });
  expect(await listPersonasRobot(store)).toEqual([]);
  expect((await store.get('club:robot:personas-extra'))?.value).toEqual([]);
  expect((await bot('POST', '/bot/personas', persona({ activo: true }))).status).toBe(201);
  const get = await role('GET', '/robot/personas', 'u-natalia', 'CONCIERGE');
  expect(get.status).toBe(200);
  expect(get.body.items).toEqual([
    {
      id: 'brain-new-1',
      nombre: 'Valeria Ríos',
      categoria: 'VIP',
      activo: true,
      consentimiento_at: '2026-10-24T10:00:00.000-05:00',
      origenregistro: 'robot',
    },
  ]);
  expect(JSON.stringify(get.body)).not.toMatch(/foto|documento|embedding|clave_hash/i);
  expect((await role('GET', '/robot/personas', 'u-andres', 'SOCIO')).status).toBe(403);
});

test('rechaza identidad semilla, prefijos reservados y payloads fuera del esquema estricto', async () => {
  const { bot } = setup();
  expect((await bot('POST', '/bot/personas', persona({ consentimiento: false }))).status).toBe(422);
  for (const invalid of [
    persona({ id: 'inv-guest' }),
    persona({ id: 'personal-temp' }),
    persona({ id: 'MAYUSCULAS' }),
    persona({ categoria: 'INVITADO' }),
    persona({ nombre: '   ' }),
    { ...persona(), foto: 'data:' + 'image/png;base64,AAAA' },
  ]) {
    expect((await bot('POST', '/bot/personas', invalid)).status).toBe(422);
  }
  for (const id of ['andres', 'u-andres']) {
    expect((await bot('POST', '/bot/personas', persona({ id }))).status).toBe(409);
  }
  expect((await bot('POST', '/bot/personas', persona({ id: 'vale' }))).status).toBe(409);
  expect((await bot('POST', '/bot/personas', persona({ payloadQR: 'NCLUB' + '1|x' }))).status).toBe(
    422,
  );
});

test('requiere BOT para escritura y concierge/admin para consulta', async () => {
  const { role } = setup();
  expect((await role('POST', '/bot/personas', 'u-natalia', 'CONCIERGE')).status).toBe(401);
  expect((await role('GET', '/robot/personas', 'u-andres', 'SOCIO')).status).toBe(403);
  expect((await role('GET', '/robot/personas', 'u-luciana', 'ADMIN')).status).toBe(200);
});

test('CAS conserva registros concurrentes y limita el catálogo a 500 identidades', async () => {
  const { bot, store } = setup();
  await Promise.all(
    ['brain-a', 'brain-b'].map((id) => bot('POST', '/bot/personas', persona({ id }))),
  );
  expect((await listPersonasRobot(store)).map((item) => item.id).sort()).toEqual([
    'brain-a',
    'brain-b',
  ]);
  for (let i = 0; i < 498; i++) {
    expect((await bot('POST', '/bot/personas', persona({ id: `extra-${i}` }))).status).toBe(201);
  }
  expect(await listPersonasRobot(store)).toHaveLength(500);
  expect((await bot('POST', '/bot/personas', persona({ id: 'brain-overflow' }))).status).toBe(409);
});
