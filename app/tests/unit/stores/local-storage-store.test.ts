import { createLocalStorageStore } from '@/infrastructure/stores/local-storage-store';
import { runStoreContract } from './store-contract';

class FakeStorage {
  readonly data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

runStoreContract('localStorage (fake)', (clock) =>
  createLocalStorageStore(new FakeStorage(), 'cerberus:', clock.now),
);

describe('localStorage store: casos propios', () => {
  test('guarda JSON bajo el espacio de nombres', async () => {
    const storage = new FakeStorage();
    const store = createLocalStorageStore(storage);
    await store.compareAndSet('k', 0, { a: 1 });
    expect(JSON.parse(storage.data.get('cerberus:k') ?? 'null')).toEqual({ v: 1, d: { a: 1 } });
  });

  test('sin reloj inyectado usa Date.now', async () => {
    expect(await createLocalStorageStore(new FakeStorage()).increment('x', 60)).toBe(1);
  });

  test('JSON corrupto se trata como inexistente y puede sobrescribirse', async () => {
    const storage = new FakeStorage();
    storage.setItem('cerberus:k', '{no es json');
    const store = createLocalStorageStore(storage);
    expect(await store.get('k')).toBeNull();
    expect(await store.list('k')).toEqual([]);
    expect(await store.compareAndSet('k', 0, 'ok')).toBe(1);
    expect(await store.get('k')).toEqual({ value: 'ok', version: 1 });
  });

  test('JSON válido con forma inesperada también es inexistente', async () => {
    const storage = new FakeStorage();
    storage.setItem('cerberus:a', '"texto"');
    storage.setItem('cerberus:b', 'null');
    storage.setItem('cerberus:c', '{"v":"1","d":2}');
    const store = createLocalStorageStore(storage);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
    expect(await store.get('c')).toBeNull();
  });

  test('contador corrupto reinicia en 1', async () => {
    const storage = new FakeStorage();
    storage.setItem('cerberus:r', 'basura');
    expect(await createLocalStorageStore(storage).increment('r', 60)).toBe(1);
  });

  test('list y clear ignoran claves ajenas al espacio de nombres', async () => {
    const storage = new FakeStorage();
    storage.setItem('otra-app:x', '{"v":1,"d":1}');
    const store = createLocalStorageStore(storage);
    await store.compareAndSet('x', 0, 2);
    expect((await store.list('x')).map((r) => r.key)).toEqual(['x']);
    await store.clear('x');
    expect(storage.data.get('otra-app:x')).toBe('{"v":1,"d":1}');
    expect(await store.get('x')).toBeNull();
  });

  test('storage que lanza al escribir: cae a memoria y sigue funcionando', async () => {
    const broken = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => undefined,
    };
    const store = createLocalStorageStore(broken);
    expect(await store.compareAndSet('k', 0, 'm')).toBe(1);
    expect(await store.get('k')).toEqual({ value: 'm', version: 1 });
    expect(await store.increment('r', 60)).toBe(1);
  });

  test('storage ausente (undefined): cae a memoria', async () => {
    const store = createLocalStorageStore(undefined);
    expect(await store.compareAndSet('k', 0, 1)).toBe(1);
    expect(await store.get('k')).toEqual({ value: 1, version: 1 });
  });
});
