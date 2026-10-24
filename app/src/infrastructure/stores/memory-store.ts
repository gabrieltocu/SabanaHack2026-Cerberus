import { assertPrefix, assertValue, type KeyValueStore, type Versioned } from './types';

// JSON clone instead of structuredClone: Hermes/React Native may lack it, and it makes
// this store behave like the JSON-backed adapters (same shapes survive a round trip).
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createMemoryStore(now: () => number = Date.now): KeyValueStore {
  const entries = new Map<string, Versioned<unknown>>();
  const counters = new Map<string, { count: number; expiresAt: number }>();

  return {
    async get<T>(key: string) {
      const e = entries.get(key);
      return e ? (clone(e) as Versioned<T>) : null;
    },
    async getMany<T>(keys: string[]) {
      return keys.map((k) => {
        const e = entries.get(k);
        return e ? (clone(e) as Versioned<T>) : null;
      });
    },
    async compareAndSet<T>(key: string, expectedVersion: number, value: T) {
      assertValue(value);
      const current = entries.get(key)?.version ?? 0;
      if (current !== expectedVersion) return null;
      entries.set(key, { value: clone(value), version: current + 1 });
      return current + 1;
    },
    async list<T>(prefix: string) {
      assertPrefix(prefix);
      return [...entries]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, e]) => ({ key, ...(clone(e) as Versioned<T>) }));
    },
    async delete(key) {
      entries.delete(key);
    },
    async increment(key, ttlSeconds) {
      const c = counters.get(key);
      const live = c && c.expiresAt > now() ? c : undefined;
      const count = (live?.count ?? 0) + 1;
      counters.set(key, { count, expiresAt: live?.expiresAt ?? now() + ttlSeconds * 1000 });
      return count;
    },
    async clear(prefix) {
      assertPrefix(prefix);
      for (const map of [entries, counters]) {
        for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);
      }
    },
  };
}
