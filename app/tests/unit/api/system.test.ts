import { createApp } from '@/api/app';
import { toFetchHandler } from '@/api/http';
import { createServerApp } from '@/api/server';
import { fixedClock } from '@/domain/clock';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { StoreUnavailableError } from '@/infrastructure/stores/upstash-store';
import type { KeyValueStore } from '@/infrastructure/stores/types';
import { T_DEMO, seededRandom, setup } from '../../support/api-harness';

describe('directorio y actividades', () => {
  test('GET /people lista el directorio público sin preferencias y sin el perfil invitado', async () => {
    const h = setup();
    const res = await h.call('GET', '/people');
    expect(res.body.count).toBe(16);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain('V-201');
    expect(ids).not.toContain('V-203');
    expect(
      res.body.items.every((p: { preferences?: unknown }) => p.preferences === undefined),
    ).toBe(true);
  });

  test.each([
    ['ROBOT', ['R1', 'R2', 'R3']],
    ['USHER', ['U-01', 'U-02', 'U-03']],
    ['OPERATOR', ['O-01']],
    ['EXTERNAL', ['V-205']],
    ['STAFF', ['V-204', 'V-206', 'V-210']],
  ])('?role=%s', async (role, ids) => {
    const res = await setup().call('GET', '/people', { query: { role } });
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(ids);
  });

  test('un rol inválido es 422', async () => {
    expect((await setup().call('GET', '/people', { query: { role: 'REY' } })).status).toBe(422);
  });

  test('el detalle incluye preferencias, turnos, permiso o estado del robot', async () => {
    const h = setup();
    expect((await h.call('GET', '/people/V-201')).body).toEqual({
      id: 'V-201',
      displayName: 'Andrés Mejía',
      roles: ['MEMBER'],
      membership: { tier: 'VIP', status: 'ACTIVE', validTo: '2027-06-30' },
      defaultDestination: 'Salón reservado',
      preferences: ['Café'],
    });
    expect((await h.call('GET', '/people/V-206')).body).toMatchObject({
      roles: ['MEMBER', 'STAFF'],
      staff: { shifts: [{ date: '2026-10-24', from: '10:00', to: '18:00' }] },
    });
    expect((await h.call('GET', '/people/V-205')).body.external).toMatchObject({
      company: 'Mantenimientos Andinos',
      orderCode: 'OT-0412',
      responsibleId: 'V-204',
      permit: { daysOfWeek: ['SAT'], from: '08:00', to: '17:00' },
    });
    expect((await h.call('GET', '/people/R1')).body).toMatchObject({
      displayName: 'R1 · recepción',
      robot: { role: 'RECEPTION', canEscort: false, status: 'OK' },
    });
    expect((await h.call('GET', '/people/R2')).body.robot).toMatchObject({
      role: 'ESCORT',
      canEscort: true,
    });
    expect((await h.call('GET', '/people/V-999')).body.error.code).toBe('PERSON_NOT_FOUND');
    expect((await h.call('GET', '/people/V-203')).status).toBe(404);
  });

  test('GET /activities usa la fecha del reloj o la indicada', async () => {
    const h = setup();
    const today = await h.call('GET', '/activities');
    expect(today.body.count).toBe(3);
    expect(today.body.items[0]).toMatchObject({
      id: 'act-001',
      title: 'Clase abierta de tenis',
      startsAt: '2026-10-24T09:30:00-05:00',
      audience: ['VIP', 'REGULAR', 'GUEST'],
    });
    const other = await h.call('GET', '/activities', { query: { date: '2026-11-02' } });
    expect(other.body.items[1].startsAt).toBe('2026-11-02T11:00:00-05:00');
    expect((await h.call('GET', '/activities', { query: { date: '2026-02-30' } })).status).toBe(
      422,
    );
  });
});

describe('sistema: health, reset y rutas', () => {
  test('health informa almacenamiento y el reloj de demostración en hora de Bogotá', async () => {
    const res = await setup().call('GET', '/health');
    expect(res.body).toEqual({
      status: 'ok',
      contract: 'v1',
      storage: 'memory',
      demo: true,
      clock: { now: T_DEMO, timezone: 'America/Bogota' },
    });
  });

  test('el reloj de demostración avanza con el reloj real desde el reinicio', async () => {
    const h = setup();
    await h.call('GET', '/health');
    const later = setup({ store: h.store, now: '2026-10-24T09:30:00-05:00' });
    expect((await later.call('GET', '/health')).body.clock.now).toBe('2026-10-24T09:30:00-05:00');
    const reset = await later.call('POST', '/demo/reset', {
      body: { now: '2026-10-27T10:00:00-05:00' },
    });
    expect(reset.body.clock.now).toBe('2026-10-27T10:00:00-05:00');
    const afterwards = setup({ store: h.store, now: '2026-10-24T09:45:00-05:00' });
    expect((await afterwards.call('GET', '/health')).body.clock.now).toBe(
      '2026-10-27T10:15:00-05:00',
    );
  });

  test('reiniciar borra visitas, invitaciones y claves, deja robots en OK y siembra la invitación de ejemplo', async () => {
    const h = setup();
    const inv = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' },
      key: 'clave-reset-001',
    });
    await h.call('POST', '/robots/R2/failure', { actor: 'O-01', body: { code: 'MOTOR_FAULT' } });
    const reset = await h.call('POST', '/demo/reset');
    expect(reset.body.demoInvitation).toMatchObject({
      hostId: 'V-209',
      guest: { fullName: 'Valentina Restrepo', ref: 'V-203', note: 'Agua aromática' },
      meetingPoint: 'Terraza',
      date: '2026-10-24',
      state: 'ACTIVE',
      window: { from: '06:00', to: '22:00' },
    });
    expect((await h.call('GET', `/invitations/${inv.body.id}`, { actor: 'O-01' })).status).toBe(
      404,
    );
    expect((await h.call('GET', '/people/R2')).body.robot.status).toBe('OK');
    const again = await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Otra Persona' }, date: '2026-10-24' },
      key: 'clave-reset-001',
    });
    expect(again.status).toBe(201); // the stored response of the old key is gone
    expect((await h.call('GET', '/visits')).body.count).toBe(2);
  });

  test('un cuerpo de reinicio inválido es 422 y el reinicio desactivado es 403', async () => {
    const h = setup();
    expect((await h.call('POST', '/demo/reset', { body: { now: 'ayer' } })).status).toBe(422);
    const off = await setup({ resetEnabled: false }).call('POST', '/demo/reset');
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('RESET_DISABLED');
  });

  test('una ruta o un método inexistente es ROUTE_NOT_FOUND', async () => {
    const h = setup();
    expect((await h.call('GET', '/nope')).body.error.code).toBe('ROUTE_NOT_FOUND');
    expect((await h.call('POST', '/health')).status).toBe(404);
    expect((await h.call('GET', '/visits/vis-1/advance')).status).toBe(404);
  });
});

describe('errores del almacén', () => {
  const failing = (error: Error): KeyValueStore => ({
    ...createMemoryStore(),
    async get() {
      throw error;
    },
  });
  const app = (store: KeyValueStore) =>
    createApp({
      store,
      clock: fixedClock(T_DEMO),
      random: seededRandom(),
      storage: 'redis',
      resetEnabled: true,
    });
  const req = { method: 'GET', path: '/visits', query: {}, headers: {}, body: undefined, ip: 'x' };

  test('STORE_UNAVAILABLE es 500 STORAGE_UNAVAILABLE sin detalles', async () => {
    const res = await app(failing(new StoreUnavailableError()))(req);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'STORAGE_UNAVAILABLE', message: 'El almacenamiento no está disponible.' },
    });
  });

  test('cualquier otro fallo es 500 INTERNAL_ERROR sin filtrar el mensaje', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app(failing(new Error('secreto interno')))(req);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(res.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    spy.mockRestore();
  });

  test('una fecha inexistente que llegue al dominio es 422, no 500', async () => {
    const boom = failing(new Error('INVALID_LOCAL_DATE: 2026-02-30'));
    const res = await app(boom)(req);
    expect(res.status).toBe(422);
  });

  test('un fallo del almacén al limitar la tasa también es 500 estable', async () => {
    const store: KeyValueStore = {
      ...createMemoryStore(),
      async increment() {
        throw new StoreUnavailableError();
      },
    };
    expect((await app(store)(req)).body).toMatchObject({ error: { code: 'STORAGE_UNAVAILABLE' } });
  });

  test('el adaptador HTTP responde 413 con un cuerpo demasiado grande', async () => {
    const handle = toFetchHandler(setup().app);
    const res = await handle(
      new Request('http://x/api/v1/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pad: 'x'.repeat(40_000) }),
      }),
    );
    expect(res.status).toBe(413);
  });
});

describe('createServerApp', () => {
  const call = (env: Record<string, string | undefined>) =>
    createServerApp(env)({
      method: 'GET',
      path: '/health',
      query: {},
      headers: {},
      body: undefined,
      ip: 'x',
    });

  test('sin variables usa memoria', async () => {
    expect((await call({})).body).toMatchObject({ storage: 'memory' });
  });

  test('con las variables de Vercel KV o de Upstash usa Redis', async () => {
    const failed = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red'));
    for (const env of [
      { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 'tok' },
      { UPSTASH_REDIS_REST_URL: 'https://up.test', UPSTASH_REDIS_REST_TOKEN: 'tok' },
    ]) {
      const res = await call(env);
      // The remote store is chosen (it is unreachable in the test): the error is stable and secret-free.
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('tok');
    }
    failed.mockRestore();
  });

  test('el reinicio se desactiva con CERBERUS_DEMO_RESET=off', async () => {
    const res = await createServerApp({ CERBERUS_DEMO_RESET: 'off' })({
      method: 'POST',
      path: '/demo/reset',
      query: {},
      headers: {},
      body: undefined,
      ip: 'x',
    });
    expect(res.status).toBe(403);
  });
});
