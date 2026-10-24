// Límite de tasa del servidor: 120 escrituras y 3 reinicios por minuto y por IP, 600 lecturas; la
// ventana es compartida entre instancias cuando el almacén es Upstash; el modo navegador no se
// bloquea a sí mismo.
import { createApp } from '@/api/app';
import type { ApiRequest } from '@/api/http';
import { toFetchHandler } from '@/api/http';
import { createServerApp } from '@/api/server';
import { fixedClock } from '@/domain/clock';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';
import { createUpstashStore } from '@/infrastructure/stores/upstash-store';
import { createTestClock } from '../stores/store-contract';
import { FAKE_TOKEN, FAKE_URL, createFakeUpstash } from '../../support/fake-upstash';
import { flows } from '../../support/api-flows';
import { T_DEMO, seededRandom, setup } from '../../support/api-harness';

const app = (
  store = createMemoryStore(),
  storage: 'memory' | 'redis' | 'browser' = 'memory',
  rateLimit?: boolean,
) =>
  createApp({
    store,
    clock: fixedClock(T_DEMO),
    random: seededRandom(),
    storage,
    resetEnabled: true,
    ...(rateLimit === undefined ? {} : { rateLimit }),
  });

const req = (method: string, path: string, ip: string, body?: unknown): ApiRequest => ({
  method,
  path,
  query: {},
  headers: { 'x-demo-actor': 'O-01', 'content-type': 'application/json' },
  body,
  ip,
});
// Escritura que no cambia nada (404 tras contarse): aísla el límite de la lógica de negocio.
const write = (ip: string) => req('POST', '/handoffs/hof-00000000/cancel', ip, {});

describe('límite por IP', () => {
  test('120 escrituras pasan y la 121 es 429 RATE_LIMITED con Retry-After en segundos', async () => {
    const handle = app();
    for (let i = 0; i < 120; i++) expect((await handle(write('1.2.3.4'))).status).toBe(404);
    const blocked = await handle(write('1.2.3.4'));
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    const wait = Number(blocked.headers?.['Retry-After']);
    expect(Number.isInteger(wait) && wait >= 1 && wait <= 60).toBe(true);
    // Otra IP no se ve afectada.
    expect((await handle(write('5.6.7.8'))).status).toBe(404);
  });

  test('las lecturas tienen su propio presupuesto (600/min): una escritura no lo gasta', async () => {
    const handle = app();
    for (let i = 0; i < 120; i++) await handle(write('1.2.3.4'));
    expect((await handle(req('GET', '/health', '1.2.3.4'))).status).toBe(200);
    for (let i = 0; i < 599; i++) await handle(req('GET', '/health', '9.9.9.9'));
    expect((await handle(req('GET', '/health', '9.9.9.9'))).status).toBe(200); // 600
    expect((await handle(req('GET', '/health', '9.9.9.9'))).status).toBe(429); // 601
  });

  test('el reinicio tiene un límite aparte de 3 por minuto', async () => {
    const handle = app();
    for (let i = 0; i < 3; i++)
      expect((await handle(req('POST', '/demo/reset', '1.2.3.4', {}))).status).toBe(200);
    const blocked = await handle(req('POST', '/demo/reset', '1.2.3.4', {}));
    expect(blocked.status).toBe(429);
    expect(blocked.headers?.['Retry-After']).toBeDefined();
    // Reiniciar no borra los contadores: tampoco abre la ventana de escrituras.
    for (let i = 0; i < 120; i++) await handle(write('1.2.3.4'));
    expect((await handle(write('1.2.3.4'))).status).toBe(429);
  });

  test('la clave del contador usa una IP acotada: una cabecera enorme no crea claves enormes', async () => {
    const store = createMemoryStore();
    const keys: string[] = [];
    const spy = {
      ...store,
      increment: (key: string, ttl: number) => {
        keys.push(key);
        return store.increment(key, ttl);
      },
    };
    await app(spy)(write('x'.repeat(10_000)));
    await toFetchHandler(app(spy))(
      new Request('https://x.test/api/v1/health', {
        headers: { 'x-forwarded-for': `${'9'.repeat(5000)}, 1.1.1.1` },
      }),
    );
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(key.length).toBeLessThanOrEqual(96);
  });

  test('declararse "local" por HTTP no exime del límite en el servidor', async () => {
    const server = toFetchHandler(createServerApp({}));
    const post = () =>
      server(
        new Request('https://x.test/api/v1/handoffs/hof-00000000/cancel', {
          method: 'POST',
          headers: {
            'x-real-ip': 'local',
            'x-demo-actor': 'O-01',
            'content-type': 'application/json',
          },
          body: '{}',
        }),
      );
    for (let i = 0; i < 120; i++) expect((await post()).status).toBe(404);
    const blocked = await post();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
  });
});

describe('ventana compartida entre instancias (Upstash)', () => {
  test('dos instancias del servidor suman sus escrituras: la 121 es 429 aunque cada una lleve 60', async () => {
    const fake = createFakeUpstash(createTestClock());
    const instance = () =>
      app(createUpstashStore({ url: FAKE_URL, token: FAKE_TOKEN, fetch: fake.fetch }), 'redis');
    const a = instance();
    const b = instance();
    for (let i = 0; i < 60; i++) {
      expect((await a(write('1.2.3.4'))).status).toBe(404);
      expect((await b(write('1.2.3.4'))).status).toBe(404);
    }
    expect((await a(write('1.2.3.4'))).status).toBe(429);
    expect((await b(write('1.2.3.4'))).status).toBe(429);
  });
});

describe('CERBERUS_RATE_LIMIT=off (servidor local de e2e)', () => {
  test('con rateLimit:false no hay 429: ni escrituras, ni reinicios, ni lecturas', async () => {
    const handle = app(createMemoryStore(), 'memory', false);
    for (let i = 0; i < 200; i++) expect((await handle(write('1.2.3.4'))).status).toBe(404);
    for (let i = 0; i < 10; i++)
      expect((await handle(req('POST', '/demo/reset', '1.2.3.4', {}))).status).toBe(200);
    for (let i = 0; i < 650; i++) await handle(req('GET', '/health', '1.2.3.4'));
    expect((await handle(req('GET', '/health', '1.2.3.4'))).status).toBe(200);
  });

  test('por defecto (y con rateLimit:true) el límite sigue activo', async () => {
    for (const handle of [app(), app(createMemoryStore(), 'memory', true)]) {
      for (let i = 0; i < 3; i++) await handle(req('POST', '/demo/reset', '1.2.3.4', {}));
      expect((await handle(req('POST', '/demo/reset', '1.2.3.4', {}))).status).toBe(429);
    }
  });

  test('createServerApp lee CERBERUS_RATE_LIMIT y solo "off" lo desactiva (falla cerrado)', async () => {
    const resets = async (env: Record<string, string>) => {
      const handle = toFetchHandler(createServerApp(env));
      let last = 0;
      for (let i = 0; i < 4; i++)
        last = (
          await handle(
            new Request('https://x.test/api/v1/demo/reset', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' },
              body: '{}',
            }),
          )
        ).status;
      return last;
    };
    expect(await resets({ CERBERUS_RATE_LIMIT: 'off' })).toBe(200);
    for (const value of ['', 'false', 'OFF', 'on', '0'])
      expect(await resets({ CERBERUS_RATE_LIMIT: value })).toBe(429);
    expect(await resets({})).toBe(429);
  });
});

describe('modo navegador', () => {
  test('el recorrido completo y más no se autobloquea (ni escrituras ni reinicios)', async () => {
    const handle = app(createMemoryStore(), 'browser');
    for (let i = 0; i < 100; i++) expect((await handle(write('local'))).status).toBe(404);
    for (let i = 0; i < 10; i++)
      expect((await handle(req('POST', '/demo/reset', 'local', {}))).status).toBe(200);
    for (let i = 0; i < 700; i++) await handle(req('GET', '/health', 'local'));
    expect((await handle(req('GET', '/health', 'local'))).status).toBe(200);
  });
});

describe('el recorrido completo de la demostración cabe en el límite de escrituras, también seis dispositivos tras una misma IP', () => {
  test.each(['robotFailureHandoff', 'inviteAndUseQr', 'vipByFace'] as const)(
    '%s usa bastante menos de 120 escrituras en una misma IP',
    async (name) => {
      const h = setup();
      let writes = 0;
      const call = h.call.bind(h);
      h.call = (method, path, o) => {
        if (method === 'POST') writes++;
        return call(method, path, { ...o, ip: '7.7.7.7' });
      };
      await flows[name](h);
      expect(writes).toBeLessThanOrEqual(20);
    },
  );
});
