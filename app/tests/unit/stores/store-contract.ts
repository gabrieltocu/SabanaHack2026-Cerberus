import type { KeyValueStore } from '@/infrastructure/stores/types';

/** Manual clock shared by a store under test and its fake backend. */
export interface TestClock {
  now(): number;
  advance(ms: number): void;
}

export function createTestClock(start = 1_000_000): TestClock {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Same battery for every KeyValueStore adapter. */
export function runStoreContract(
  name: string,
  make: (clock: TestClock) => KeyValueStore | Promise<KeyValueStore>,
): void {
  describe(`KeyValueStore contract: ${name}`, () => {
    let store: KeyValueStore;
    let clock: TestClock;
    beforeEach(async () => {
      clock = createTestClock();
      store = await make(clock);
    });

    test('get de una clave inexistente devuelve null', async () => {
      expect(await store.get('nada')).toBeNull();
    });

    test('CAS con versión 0 crea la clave con versión 1', async () => {
      expect(await store.compareAndSet('k', 0, { a: 1 })).toBe(1);
      expect(await store.get('k')).toEqual({ value: { a: 1 }, version: 1 });
    });

    test('CAS con 0 sobre una clave existente es conflicto', async () => {
      await store.compareAndSet('k', 0, 'x');
      expect(await store.compareAndSet('k', 0, 'y')).toBeNull();
      expect((await store.get<string>('k'))?.value).toBe('x');
    });

    test('CAS con la versión vigente avanza; con una vieja devuelve null', async () => {
      await store.compareAndSet('k', 0, 'v1');
      expect(await store.compareAndSet('k', 1, 'v2')).toBe(2);
      expect(await store.compareAndSet('k', 1, 'v3')).toBeNull();
      expect(await store.get('k')).toEqual({ value: 'v2', version: 2 });
    });

    test('CAS sobre clave inexistente con versión distinta de 0 es conflicto', async () => {
      expect(await store.compareAndSet('k', 3, 'x')).toBeNull();
      expect(await store.get('k')).toBeNull();
    });

    test('dos CAS concurrentes con la misma versión: exactamente uno gana', async () => {
      await store.compareAndSet('k', 0, 'base');
      const results = await Promise.all([
        store.compareAndSet('k', 1, 'A'),
        store.compareAndSet('k', 1, 'B'),
      ]);
      expect(results.filter((r) => r === 2)).toHaveLength(1);
      expect(results.filter((r) => r === null)).toHaveLength(1);
      expect((await store.get('k'))?.version).toBe(2);
    });

    test('dos creaciones concurrentes: exactamente una gana', async () => {
      const results = await Promise.all([
        store.compareAndSet('n', 0, 'A'),
        store.compareAndSet('n', 0, 'B'),
      ]);
      expect(results.filter((r) => r === 1)).toHaveLength(1);
      expect(results.filter((r) => r === null)).toHaveLength(1);
    });

    test('CAS con undefined lanza INVALID_VALUE y no escribe', async () => {
      await expect(store.compareAndSet('k', 0, undefined)).rejects.toMatchObject({
        code: 'INVALID_VALUE',
      });
      expect(await store.get('k')).toBeNull();
    });

    test("list('') y clear('') lanzan INVALID_PREFIX y no borran nada", async () => {
      await store.compareAndSet('k', 0, 1);
      await expect(store.list('')).rejects.toMatchObject({ code: 'INVALID_PREFIX' });
      await expect(store.clear('')).rejects.toMatchObject({ code: 'INVALID_PREFIX' });
      expect((await store.get('k'))?.value).toBe(1);
    });

    test('delete reinicia la versión (ABA): solo para reset, no para entidades con CAS', async () => {
      await store.compareAndSet('k', 0, 'a');
      await store.delete('k');
      expect(await store.compareAndSet('k', 0, 'b')).toBe(1);
    });

    test('preserva arreglos vacíos, null y anidados', async () => {
      const value = { list: [], none: null, deep: { xs: [1, { y: [] }] } };
      await store.compareAndSet('shape', 0, value);
      expect((await store.get('shape'))?.value).toEqual(value);
    });

    test('lo leído es una copia: mutarlo no altera lo guardado', async () => {
      await store.compareAndSet('k', 0, { n: 1 });
      const read = await store.get<{ n: number }>('k');
      if (read) read.value.n = 99;
      expect((await store.get<{ n: number }>('k'))?.value.n).toBe(1);
    });

    test('lo escrito es una copia: mutar el original no altera lo guardado', async () => {
      const original = { n: 1 };
      await store.compareAndSet('k', 0, original);
      original.n = 99;
      expect((await store.get<{ n: number }>('k'))?.value.n).toBe(1);
    });

    test('list devuelve solo las claves con el prefijo, con su versión', async () => {
      await store.compareAndSet('visit:1', 0, 'a');
      await store.compareAndSet('visit:2', 0, 'b');
      await store.compareAndSet('visit:2', 1, 'b2');
      await store.compareAndSet('pass:1', 0, 'c');
      const rows = await store.list<string>('visit:');
      expect(rows.sort((x, y) => x.key.localeCompare(y.key))).toEqual([
        { key: 'visit:1', value: 'a', version: 1 },
        { key: 'visit:2', value: 'b2', version: 2 },
      ]);
    });

    test('list con muchas claves recorre todas las páginas', async () => {
      for (let i = 0; i < 7; i++) await store.compareAndSet(`p:${i}`, 0, i);
      expect(await store.list('p:')).toHaveLength(7);
    });

    test('list trata los comodines del prefijo como texto literal', async () => {
      await store.compareAndSet('a*b', 0, 1);
      await store.compareAndSet('axb', 0, 2);
      expect((await store.list('a*')).map((r) => r.key)).toEqual(['a*b']);
    });

    test('getMany devuelve cada clave en su orden, con null para las que no existen', async () => {
      await store.compareAndSet('m:1', 0, 'uno');
      await store.compareAndSet('m:2', 0, 'dos');
      await store.compareAndSet('m:2', 1, 'dos+');
      expect(await store.getMany<string>(['m:2', 'm:x', 'm:1'])).toEqual([
        { value: 'dos+', version: 2 },
        null,
        { value: 'uno', version: 1 },
      ]);
      expect(await store.getMany([])).toEqual([]);
    });

    test('list sin coincidencias devuelve []', async () => {
      expect(await store.list('zzz:')).toEqual([]);
    });

    test('delete borra la clave y es idempotente', async () => {
      await store.compareAndSet('k', 0, 1);
      await store.delete('k');
      await store.delete('k');
      expect(await store.get('k')).toBeNull();
      expect(await store.compareAndSet('k', 0, 2)).toBe(1);
    });

    test('clear borra solo el prefijo', async () => {
      await store.compareAndSet('a:1', 0, 1);
      await store.compareAndSet('a:2', 0, 2);
      await store.compareAndSet('b:1', 0, 3);
      await store.increment('a:rate', 60);
      await store.clear('a:');
      expect(await store.list('a:')).toEqual([]);
      expect((await store.get('b:1'))?.value).toBe(3);
      expect(await store.increment('a:rate', 60)).toBe(1);
    });

    test('increment cuenta de 1 en 1, por clave', async () => {
      expect(await store.increment('r:a', 60)).toBe(1);
      expect(await store.increment('r:a', 60)).toBe(2);
      expect(await store.increment('r:b', 60)).toBe(1);
    });

    test('increment concurrente no pierde cuentas', async () => {
      const counts = await Promise.all([1, 2, 3].map(() => store.increment('r:c', 60)));
      expect(counts.sort()).toEqual([1, 2, 3]);
    });

    test('increment reinicia al vencer el TTL', async () => {
      await store.increment('r:t', 10);
      await store.increment('r:t', 10);
      clock.advance(9_000);
      expect(await store.increment('r:t', 10)).toBe(3);
      clock.advance(10_001);
      expect(await store.increment('r:t', 10)).toBe(1);
    });

    test('los contadores no aparecen en list ni en get', async () => {
      await store.increment('c:1', 60);
      expect(await store.list('c:')).toEqual([]);
      expect(await store.get('c:1')).toBeNull();
    });
  });
}
