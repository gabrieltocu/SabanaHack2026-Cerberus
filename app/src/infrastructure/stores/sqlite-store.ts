import type { DatabaseSync } from 'node:sqlite';

import { assertPrefix, assertValue, type KeyValueStore, type Versioned } from './types';

// Loaded lazily from the process (not imported) so Metro, Vercel and the browser bundle never
// resolve `node:sqlite`: only the self-hosted server ever calls `createSqliteStore`.
const open = (path: string): DatabaseSync => {
  const { DatabaseSync: Db } = process.getBuiltinModule('node:sqlite');
  const db = new Db(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL, expires_at INTEGER
    ) WITHOUT ROWID`);
  return db;
};

const connections = new Map<string, { db: DatabaseSync; store: KeyValueStore }>();

/** Closes every open database (graceful shutdown, tests). */
export function closeSqliteStores(): void {
  for (const { db } of connections.values()) db.close();
  connections.clear();
}

type Row = { value: string; version: number };
const read = <T>(r: Row): Versioned<T> => ({ value: JSON.parse(r.value) as T, version: r.version });

/**
 * KeyValueStore over one SQLite file (`node:sqlite`, no dependencies). One connection per path:
 * the club and v1 APIs share it. Entries have `expires_at` NULL; counters (rate limiting) are rows
 * with an expiry, hidden from get/list. Every statement is atomic and the connection is synchronous,
 * so CAS and increment cannot interleave. Entries and counters must not share a key.
 */
export function createSqliteStore(path: string, now: () => number = Date.now): KeyValueStore {
  const cached = connections.get(path);
  if (cached) return cached.store;
  const db = open(path);
  db.prepare('DELETE FROM kv WHERE expires_at <= ?').run(now());
  let hits = 0;
  const q = {
    get: db.prepare('SELECT value, version FROM kv WHERE key = ? AND expires_at IS NULL'),
    insert: db.prepare(
      'INSERT INTO kv (key, value, version) VALUES (?, ?, 1) ON CONFLICT (key) DO NOTHING',
    ),
    update: db.prepare(
      'UPDATE kv SET value = ?, version = version + 1 WHERE key = ? AND version = ? AND expires_at IS NULL',
    ),
    list: db.prepare(
      'SELECT key, value, version FROM kv WHERE instr(key, ?) = 1 AND expires_at IS NULL',
    ),
    del: db.prepare('DELETE FROM kv WHERE key = ?'),
    clear: db.prepare('DELETE FROM kv WHERE instr(key, ?) = 1'),
    hit: db.prepare(
      `INSERT INTO kv (key, value, version, expires_at) VALUES (?1, '1', 0, ?2)
       ON CONFLICT (key) DO UPDATE SET
         value = CASE WHEN expires_at <= ?3 THEN '1' ELSE CAST(CAST(value AS INTEGER) + 1 AS TEXT) END,
         expires_at = CASE WHEN expires_at <= ?3 THEN ?2 ELSE expires_at END
       RETURNING value`,
    ),
  };
  const get = <T>(key: string) => {
    const r = q.get.get(key) as Row | undefined;
    return r ? read<T>(r) : null;
  };
  const store: KeyValueStore = {
    async get<T>(key: string) {
      return get<T>(key);
    },
    async getMany<T>(keys: string[]) {
      return keys.map((k) => get<T>(k));
    },
    async compareAndSet<T>(key: string, expectedVersion: number, value: T) {
      assertValue(value);
      const json = JSON.stringify(value);
      if (expectedVersion === 0) return q.insert.run(key, json).changes === 1 ? 1 : null;
      return q.update.run(json, key, expectedVersion).changes === 1 ? expectedVersion + 1 : null;
    },
    async list<T>(prefix: string) {
      assertPrefix(prefix);
      return (q.list.all(prefix) as (Row & { key: string })[]).map((r) => ({
        key: r.key,
        ...read<T>(r),
      }));
    },
    async delete(key) {
      q.del.run(key);
    },
    async increment(key, ttlSeconds) {
      const t = now();
      // ponytail: expired counters are swept on open and every 1000 hits; add a timer if the volume grows.
      if (++hits % 1000 === 0) db.prepare('DELETE FROM kv WHERE expires_at <= ?').run(t);
      return Number((q.hit.get(key, t + ttlSeconds * 1000, t) as { value: string }).value);
    },
    async clear(prefix) {
      assertPrefix(prefix);
      q.clear.run(prefix);
    },
  };
  connections.set(path, { db, store });
  return store;
}
