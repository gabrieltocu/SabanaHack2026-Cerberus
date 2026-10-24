import { assertPrefix, assertValue, type KeyValueStore, type Versioned } from './types';

/** Stable, secret-free failure of the remote store (network, HTTP, timeout, bad reply). */
export class StoreUnavailableError extends Error {
  readonly code = 'STORE_UNAVAILABLE';
  constructor() {
    super('STORE_UNAVAILABLE');
    this.name = 'StoreUnavailableError';
  }
}

/**
 * Atomic compare-and-set. KEYS[1]=key, ARGV[1]=expected version, ARGV[2]=value already as JSON
 * (embedded as-is: cjson would turn empty arrays into objects). Returns new version or -1.
 */
export const CAS_SCRIPT = `local cur = redis.call('GET', KEYS[1])
local ver = 0
if cur then ver = cjson.decode(cur).v end
if ver ~= tonumber(ARGV[1]) then return -1 end
local nv = ver + 1
redis.call('SET', KEYS[1], '{"v":' .. nv .. ',"d":' .. ARGV[2] .. '}')
return nv`;

/** INCR and, on the first hit of the window, EXPIRE. ARGV[1]=ttl seconds. */
export const INCREMENT_SCRIPT = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

export interface UpstashOptions {
  url: string;
  token: string;
  /** Optional Redis key namespace; empty keeps the legacy key layout. */
  namespace?: string;
  fetch?: typeof fetch;
  /** Per-request timeout in ms (default 4000). */
  timeoutMs?: number;
}

const SCAN_COUNT = 100;
const escapeGlob = (s: string) => s.replace(/[\\*?[\]]/g, '\\$&');

function parse<T>(raw: unknown): Versioned<T> | null {
  if (typeof raw !== 'string') return null;
  try {
    const o = JSON.parse(raw) as { v?: unknown; d?: unknown } | null;
    return o && typeof o.v === 'number' && 'd' in o ? { value: o.d as T, version: o.v } : null;
  } catch {
    return null;
  }
}

/** Upstash Redis REST API over plain fetch (no SDK). The token only ever goes in the header. */
export function createUpstashStore(opts: UpstashOptions): KeyValueStore {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 4000;
  const namespace = opts.namespace ?? '';
  const storageKey = (key: string) => `${namespace}${key}`;

  async function command(cmd: (string | number)[]): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(opts.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd.map(String)),
        signal: controller.signal,
      });
      const body = (await res.json()) as { result?: unknown; error?: unknown };
      if (!res.ok || body.error !== undefined) throw new Error('upstream');
      return body.result;
    } catch {
      // Original errors are dropped on purpose: they may echo headers or the URL.
      throw new StoreUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  async function scan(prefix: string): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const [next, page] = (await command([
        'SCAN',
        cursor,
        'MATCH',
        `${escapeGlob(storageKey(prefix))}*`,
        'COUNT',
        SCAN_COUNT,
      ])) as [string, string[]];
      page.forEach((k) => keys.add(k));
      cursor = next;
    } while (cursor !== '0');
    return [...keys];
  }

  return {
    async get<T>(key: string) {
      return parse<T>(await command(['GET', storageKey(key)]));
    },
    async getMany<T>(keys: string[]) {
      if (keys.length === 0) return [];
      const raw = (await command(['MGET', ...keys.map(storageKey)])) as unknown[];
      return keys.map((_, i) => parse<T>(raw[i]));
    },
    async compareAndSet<T>(key: string, expectedVersion: number, value: T) {
      assertValue(value);
      const r = (await command([
        'EVAL',
        CAS_SCRIPT,
        1,
        storageKey(key),
        expectedVersion,
        JSON.stringify(value),
      ])) as number;
      return r === -1 ? null : r;
    },
    async list<T>(prefix: string) {
      assertPrefix(prefix);
      const keys = await scan(prefix);
      if (keys.length === 0) return [];
      const raw = (await command(['MGET', ...keys])) as unknown[];
      return keys.flatMap((key, i) => {
        const e = parse<T>(raw[i]);
        return e ? [{ key: key.slice(namespace.length), ...e }] : [];
      });
    },
    async delete(key) {
      await command(['DEL', storageKey(key)]);
    },
    async increment(key, ttlSeconds) {
      return (await command(['EVAL', INCREMENT_SCRIPT, 1, storageKey(key), ttlSeconds])) as number;
    },
    async clear(prefix) {
      assertPrefix(prefix);
      const keys = await scan(prefix);
      if (keys.length > 0) await command(['DEL', ...keys]);
    },
  };
}
