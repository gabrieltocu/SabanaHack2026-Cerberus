import { createMemoryStore } from './memory-store';
import { assertPrefix, assertValue, type KeyValueStore, type Versioned } from './types';

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PROBE = '__probe__';

/** Parses `{v,d}`; corrupt or foreign JSON counts as "does not exist". */
function parse<T>(raw: string | null): Versioned<T> | null {
  if (raw === null) return null;
  try {
    const o = JSON.parse(raw) as { v?: unknown; d?: unknown } | null;
    return o && typeof o.v === 'number' && 'd' in o ? { value: o.d as T, version: o.v } : null;
  } catch {
    return null;
  }
}

function parseCounter(raw: string | null): { c: number; e: number } | null {
  try {
    const o = JSON.parse(raw ?? 'null') as { c?: unknown; e?: unknown } | null;
    return o && typeof o.c === 'number' && typeof o.e === 'number' ? { c: o.c, e: o.e } : null;
  } catch {
    return null;
  }
}

/**
 * Browser-persisted store. CAS is atomic within a tab because read and write run in one
 * synchronous step; across tabs it is best effort (ponytail: demo only, the real API uses Upstash).
 * Without a usable storage (undefined, or it throws on write) it falls back to memory.
 */
export function createLocalStorageStore(
  storage: WebStorage | undefined,
  namespace = 'cerberus:',
  now: () => number = Date.now,
): KeyValueStore {
  try {
    storage?.setItem(namespace + PROBE, '1');
    storage?.removeItem(namespace + PROBE);
  } catch {
    storage = undefined;
  }
  if (!storage) return createMemoryStore(now);
  const s = storage;

  const keysWith = (prefix: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(namespace + prefix)) out.push(k.slice(namespace.length));
    }
    return out;
  };

  return {
    async get<T>(key: string) {
      return parse<T>(s.getItem(namespace + key));
    },
    async getMany<T>(keys: string[]) {
      return keys.map((k) => parse<T>(s.getItem(namespace + k)));
    },
    async compareAndSet<T>(key: string, expectedVersion: number, value: T) {
      assertValue(value);
      const current = parse(s.getItem(namespace + key))?.version ?? 0;
      if (current !== expectedVersion) return null;
      s.setItem(namespace + key, JSON.stringify({ v: current + 1, d: value }));
      return current + 1;
    },
    async list<T>(prefix: string) {
      assertPrefix(prefix);
      return keysWith(prefix).flatMap((key) => {
        const e = parse<T>(s.getItem(namespace + key));
        return e ? [{ key, ...e }] : [];
      });
    },
    async delete(key) {
      s.removeItem(namespace + key);
    },
    async increment(key, ttlSeconds) {
      const c = parseCounter(s.getItem(namespace + key));
      const live = c && c.e > now() ? c : undefined;
      const next = { c: (live?.c ?? 0) + 1, e: live?.e ?? now() + ttlSeconds * 1000 };
      s.setItem(namespace + key, JSON.stringify(next));
      return next.c;
    },
    async clear(prefix) {
      assertPrefix(prefix);
      for (const key of keysWith(prefix)) s.removeItem(namespace + key);
    },
  };
}
