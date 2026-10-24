import { StoreUnavailableError, createUpstashStore } from '@/infrastructure/stores/upstash-store';
import { FAKE_TOKEN, FAKE_URL, createFakeUpstash } from '../../support/fake-upstash';
import { runStoreContract } from './store-contract';

const URL = FAKE_URL;
const TOKEN = FAKE_TOKEN;
type Fetch = typeof fetch;
type Command = string[];

runStoreContract('upstash (fake fetch)', (clock) =>
  createUpstashStore({ url: URL, token: TOKEN, fetch: createFakeUpstash(clock).fetch }),
);

describe('upstash store: casos propios', () => {
  const clock = { now: () => 0, advance: () => undefined };

  test('guarda {"v":versión,"d":dato} y usa solo GET/EVAL/SCAN/MGET/DEL', async () => {
    const fake = createFakeUpstash(clock);
    const store = createUpstashStore({ url: URL, token: TOKEN, fetch: fake.fetch });
    await store.compareAndSet('k', 0, { a: [] });
    expect(fake.data.get('k')).toBe('{"v":1,"d":{"a":[]}}');
    await store.get('k');
    await store.list('k');
    await store.delete('k');
    await store.increment('r', 5);
    expect(new Set(fake.commands.map((c) => c[0]))).toEqual(
      new Set(['EVAL', 'GET', 'SCAN', 'MGET', 'DEL']),
    );
  });

  test('el prefijo de list se escapa para MATCH', async () => {
    const fake = createFakeUpstash(clock);
    const store = createUpstashStore({ url: URL, token: TOKEN, fetch: fake.fetch });
    await store.list('a*[b]?\\');
    expect(fake.commands[0]).toEqual(['SCAN', '0', 'MATCH', 'a\\*\\[b\\]\\?\\\\*', 'COUNT', '100']);
  });

  test('namespace aísla escritura, lectura, CAS, listado y limpieza frente al espacio legacy', async () => {
    const fake = createFakeUpstash(clock);
    const legacy = createUpstashStore({ url: URL, token: TOKEN, fetch: fake.fetch });
    const options = { url: URL, token: TOKEN, fetch: fake.fetch, namespace: 'sabana:' };
    const sabana = createUpstashStore(options);

    await legacy.compareAndSet('actividad:1', 0, { origen: 'demo' });
    await sabana.compareAndSet('actividad:1', 0, { origen: 'real' });
    expect(await legacy.get<{ origen: string }>('actividad:1')).toMatchObject({
      value: { origen: 'demo' },
      version: 1,
    });
    expect(await sabana.get<{ origen: string }>('actividad:1')).toMatchObject({
      value: { origen: 'real' },
      version: 1,
    });
    expect(await sabana.getMany<{ origen: string }>(['actividad:1'])).toMatchObject([
      { value: { origen: 'real' }, version: 1 },
    ]);
    expect(await sabana.compareAndSet('actividad:1', 1, { origen: 'real-actualizado' })).toBe(2);
    expect(await legacy.increment('limite:1', 5)).toBe(1);
    expect(await sabana.increment('limite:1', 5)).toBe(1);
    expect(await sabana.increment('limite:1', 5)).toBe(2);

    await legacy.compareAndSet('actividad:2', 0, { origen: 'demo' });
    await sabana.compareAndSet('actividad:2', 0, { origen: 'real' });
    await legacy.compareAndSet('actividad:3', 0, { origen: 'demo' });
    await sabana.compareAndSet('actividad:3', 0, { origen: 'real' });
    await sabana.delete('actividad:3');
    expect(await sabana.get('actividad:3')).toBeNull();
    expect(await legacy.get('actividad:3')).toMatchObject({ value: { origen: 'demo' } });
    expect(await sabana.list('actividad:')).toEqual([
      { key: 'actividad:1', value: { origen: 'real-actualizado' }, version: 2 },
      { key: 'actividad:2', value: { origen: 'real' }, version: 1 },
    ]);

    await sabana.clear('actividad:');
    expect(await sabana.list('actividad:')).toEqual([]);
    expect(await legacy.list('actividad:')).toHaveLength(3);
    expect(fake.data.has('actividad:1')).toBe(true);
    expect(fake.data.has('sabana:actividad:1')).toBe(false);
  });

  test('clear sin coincidencias no emite DEL', async () => {
    const fake = createFakeUpstash(clock);
    const store = createUpstashStore({ url: URL, token: TOKEN, fetch: fake.fetch });
    await store.clear('nada:');
    expect(fake.commands.every((c) => c[0] === 'SCAN')).toBe(true);
  });

  test('list omite claves que expiraron entre SCAN y MGET y valores ajenos', async () => {
    const fetchStub: Fetch = async (_i, init) => {
      const [name] = JSON.parse(String(init?.body)) as Command;
      const result =
        name === 'SCAN' ? ['0', ['x:1', 'x:2', 'x:3', 'x:1']] : [null, '7', '{"v":2,"d":"ok"}'];
      return new Response(JSON.stringify({ result }), { status: 200 });
    };
    const store = createUpstashStore({ url: URL, token: TOKEN, fetch: fetchStub });
    expect(await store.list('x:')).toEqual([{ key: 'x:3', value: 'ok', version: 2 }]);
  });

  test('get con valor no JSON se trata como inexistente', async () => {
    const fetchStub: Fetch = async () =>
      new Response(JSON.stringify({ result: 'basura' }), { status: 200 });
    const store = createUpstashStore({ url: URL, token: TOKEN, fetch: fetchStub });
    expect(await store.get('k')).toBeNull();
  });

  describe('fallos de red: STORE_UNAVAILABLE sin filtrar el token', () => {
    const expectUnavailable = async (p: Promise<unknown>) => {
      const error = await p.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(StoreUnavailableError);
      const e = error as StoreUnavailableError;
      expect(e.code).toBe('STORE_UNAVAILABLE');
      expect(e.message).toBe('STORE_UNAVAILABLE');
      for (const text of [e.message, String(e.stack), JSON.stringify(e), String(e.cause)]) {
        expect(text).not.toContain(TOKEN);
      }
    };

    test('error HTTP', async () => {
      const f: Fetch = async () => new Response('boom ' + TOKEN, { status: 500 });
      await expectUnavailable(createUpstashStore({ url: URL, token: TOKEN, fetch: f }).get('k'));
    });

    test('token rechazado (401)', async () => {
      const store = createUpstashStore({
        url: URL,
        token: 'otro',
        fetch: createFakeUpstash({ now: () => 0, advance: () => undefined }).fetch,
      });
      await expectUnavailable(store.get('k'));
    });

    test('respuesta con { error }', async () => {
      const f: Fetch = async () =>
        new Response(JSON.stringify({ error: `ERR bad ${TOKEN}` }), { status: 200 });
      await expectUnavailable(createUpstashStore({ url: URL, token: TOKEN, fetch: f }).get('k'));
    });

    test('respuesta que no es JSON', async () => {
      const f: Fetch = async () => new Response('<html>', { status: 200 });
      await expectUnavailable(createUpstashStore({ url: URL, token: TOKEN, fetch: f }).get('k'));
    });

    test('fetch lanza un error que menciona el token', async () => {
      const f: Fetch = async () => {
        throw new TypeError(`network down Bearer ${TOKEN}`);
      };
      const store = createUpstashStore({ url: URL, token: TOKEN, fetch: f });
      await expectUnavailable(store.compareAndSet('k', 0, 1));
      await expectUnavailable(store.list('k'));
      await expectUnavailable(store.increment('k', 1));
    });

    test('timeout aborta la petición', async () => {
      let aborted = false;
      const f: Fetch = (_i, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error(`aborted ${TOKEN}`));
          });
        });
      const store = createUpstashStore({ url: URL, token: TOKEN, fetch: f, timeoutMs: 20 });
      await expectUnavailable(store.get('k'));
      expect(aborted).toBe(true);
    });
  });

  test('sin fetch inyectado usa globalThis.fetch', async () => {
    const original = globalThis.fetch;
    const spy = jest.fn(async () => new Response('{"result":null}', { status: 200 }));
    globalThis.fetch = spy as unknown as Fetch;
    try {
      expect(await createUpstashStore({ url: URL, token: TOKEN }).get('k')).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
