// Composition root of the club API: store from the environment (SQLite file, Upstash or memory) and secrets.
import { createMemoryStore } from '../infrastructure/stores/memory-store';
import { createSqliteStore } from '../infrastructure/stores/sqlite-store';
import { createUpstashStore } from '../infrastructure/stores/upstash-store';
import { createClubApp } from './app';
import { clubConfig } from './config';
import { moduleRoutes } from './routes';

type Env = Record<string, string | undefined>;

export function createClubServer(env: Env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  const sqlite = env.SQLITE_PATH;
  if (env.VERCEL && env.CERBERUS_DATA_SOURCE === 'sabana' && (sqlite || !url || !token)) {
    throw new Error('N Club integrado necesita almacenamiento compartido en Vercel (Upstash).');
  }
  return createClubApp({
    store: sqlite
      ? createSqliteStore(sqlite)
      : url && token
        ? createUpstashStore({
            url,
            token,
            namespace: env.CERBERUS_DATA_SOURCE === 'sabana' ? 'sabana:' : '',
          })
        : createMemoryStore(),
    cfg: clubConfig(env),
    routes: moduleRoutes,
  });
}

/** `/api/...` request path → club path (`/api/invitaciones/x` → `/invitaciones/x`). */
export function clubPath(url: URL): string {
  const rewritten = url.pathname === '/api/club' ? url.searchParams.get('__path') : null;
  const raw = rewritten !== null ? `/${rewritten}` : url.pathname.replace(/^\/api/, '');
  return raw.replace(/\/+$/, '') || '/';
}
