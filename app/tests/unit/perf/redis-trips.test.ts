import { createUpstashStore, StoreUnavailableError } from '@/infrastructure/stores/upstash-store';
import { invite, vipWithR2 } from '../../support/api-flows';
import { setup, T_DEMO, type Harness, type CallOptions } from '../../support/api-harness';
import { createFakeUpstash, FAKE_TOKEN, FAKE_URL } from '../../support/fake-upstash';

function fixture() {
  let wall = Date.parse(T_DEMO);
  const clock = { now: () => new Date(wall) };
  const fake = createFakeUpstash({ now: () => wall, advance: () => undefined });
  const fetch = jest.fn(fake.fetch);
  const store = createUpstashStore({
    url: FAKE_URL,
    token: FAKE_TOKEN,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  const h = setup({ store, clock });
  return { h, fake, fetch, store, clock, advance: (ms: number) => (wall += ms) };
}

interface Scenario {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  options?: CallOptions;
  prepare?: (h: Harness) => Promise<unknown>;
  status: number;
  budget: number;
}

const scenarios: Scenario[] = [
  { name: 'health', method: 'GET', path: '/health', status: 200, budget: 1 },
  {
    name: 'visits',
    method: 'GET',
    path: '/visits',
    prepare: invite,
    status: 200,
    budget: 3,
  },
  {
    name: 'handoffs REQUESTED',
    method: 'GET',
    path: '/handoffs',
    options: { query: { state: 'REQUESTED' } },
    prepare: async (h) => {
      const visitId = await vipWithR2(h);
      const res = await h.call('POST', '/handoffs', {
        actor: 'R2',
        body: { visitId, reason: 'LOW_BATTERY' },
      });
      expect(res.status).toBe(201);
    },
    status: 200,
    budget: 3,
  },
  {
    name: 'invitations V-202',
    method: 'GET',
    path: '/invitations',
    options: { actor: 'V-202', query: { hostId: 'V-202' } },
    prepare: invite,
    status: 200,
    budget: 3,
  },
  {
    name: 'recognition VIP',
    method: 'POST',
    path: '/recognition/events',
    options: {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201' },
      },
    },
    status: 201,
    budget: 11,
  },
];

describe('Redis: presupuesto por petición en una instancia caliente (incluye rate limit)', () => {
  test.each(scenarios)('$name', async ({ method, path, options, prepare, status, budget }) => {
    const { h, fake, fetch } = fixture();
    expect((await h.call('GET', '/health')).status).toBe(200);
    await prepare?.(h);
    fake.commands.length = 0;
    fetch.mockClear();

    const res = await h.call(method, path, options);

    expect(res.status).toBe(status);
    if (method === 'GET' && path !== '/health') expect(res.body.count).toBeGreaterThan(0);
    if (method === 'POST') expect(res.body.visit.category).toBe('VIP');
    console.info(
      `${method} ${path}: ${fake.commands.length} comandos REST, ${fetch.mock.calls.length} viajes`,
    );
    expect(fake.commands.length).toBeLessThanOrEqual(budget);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(budget);
  });
});

describe('reloj: caché por instancia con TTL de 10 s', () => {
  const clockReads = (fake: ReturnType<typeof createFakeUpstash>) =>
    fake.commands.filter(([name, key]) => name === 'GET' && key === 'meta:clock').length;

  test('el arranque lee el reloj una sola vez después de inicializarlo', async () => {
    const { h, fake } = fixture();
    expect((await h.call('GET', '/health')).body.clock.now).toBe(T_DEMO);
    // GET ausente + CAS + GET de confirmación; bootstrap y petición comparten el ancla.
    expect(clockReads(fake)).toBe(2);
  });

  test('el tiempo avanza en los hits; el TTL no se extiende con cada petición', async () => {
    const { h, fake, advance } = fixture();
    await h.call('GET', '/health');
    fake.commands.length = 0;
    for (const seconds of [3, 6, 9]) {
      advance(3000);
      expect((await h.call('GET', '/health')).body.clock.now).toBe(
        `2026-10-24T09:00:0${seconds}-05:00`,
      );
      expect(clockReads(fake)).toBe(0);
    }
    advance(1000);
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-24T09:00:10-05:00');
    expect(clockReads(fake)).toBe(1);
    await h.call('GET', '/health');
    expect(clockReads(fake)).toBe(1);
  });

  test('un retroceso del reloj real obliga a releer el ancla', async () => {
    const { h, fake, advance } = fixture();
    await h.call('GET', '/health');
    fake.commands.length = 0;
    advance(-1000);
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-24T08:59:59-05:00');
    expect(clockReads(fake)).toBe(1);
  });

  test('el reset local invalida inmediatamente y otra instancia lo ve al vencer el TTL', async () => {
    const { h, store, clock, fake, advance } = fixture();
    await h.call('GET', '/health');
    fake.commands.length = 0;
    const other = setup({ store, clock });
    await other.call('GET', '/health');
    expect(clockReads(fake)).toBe(1); // La caché no se comparte entre instancias.

    const target = '2026-10-27T10:00:00-05:00';
    expect((await other.call('POST', '/demo/reset', { body: { now: target } })).status).toBe(200);
    expect((await other.call('GET', '/health')).body.clock.now).toBe(target);
    advance(9999);
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-24T09:00:09-05:00');
    advance(1);
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-27T10:00:10-05:00');
  });

  test('un fallo posterior a escribir el reloj del reset también invalida la caché', async () => {
    const { h, store } = fixture();
    await h.call('GET', '/health');
    const original = store.compareAndSet;
    jest.spyOn(store, 'compareAndSet').mockImplementation(async (key, version, value) => {
      if (key.startsWith('visit:')) throw new StoreUnavailableError();
      return original(key, version, value);
    });
    const target = '2026-10-27T10:00:00-05:00';
    expect((await h.call('POST', '/demo/reset', { body: { now: target } })).status).toBe(500);
    expect((await h.call('GET', '/health')).body.clock.now).toBe(target);
  });

  test('una lectura en vuelo anterior al reset no repuebla la caché invalidada', async () => {
    const { h, store, advance } = fixture();
    await h.call('GET', '/health');
    advance(10_000);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const reading = new Promise<void>((resolve) => (started = resolve));
    const original = store.get;
    jest.spyOn(store, 'get').mockImplementationOnce(async (key) => {
      const snapshot = await original(key);
      started();
      await gate;
      return snapshot;
    });
    const pending = h.call('GET', '/health');
    await reading;
    const target = '2026-10-27T10:00:00-05:00';
    try {
      expect((await h.call('POST', '/demo/reset', { body: { now: target } })).status).toBe(200);
    } finally {
      release();
    }
    await pending;
    expect((await h.call('GET', '/health')).body.clock.now).toBe(target);
  });

  test('un fallo al renovar no sirve el ancla vencida ni impide reintentar', async () => {
    const { h, store, advance } = fixture();
    await h.call('GET', '/health');
    advance(10_000);
    jest.spyOn(store, 'get').mockRejectedValueOnce(new StoreUnavailableError());
    const failed = await h.call('GET', '/health');
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect((await h.call('GET', '/health')).body.clock.now).toBe('2026-10-24T09:00:10-05:00');
  });
});
