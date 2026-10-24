// Composition root del servidor: elige el almacén según el entorno (archivo SQLite, Upstash o memoria). Los secretos del almacén
// viven solo en variables de servidor (nunca `EXPO_PUBLIC_*`).
import { systemClock } from '../domain/clock';
import { createMemoryStore } from '../infrastructure/stores/memory-store';
import { createSqliteStore } from '../infrastructure/stores/sqlite-store';
import { createUpstashStore } from '../infrastructure/stores/upstash-store';
import { secureRandom } from '../shared/random';
import { createApp } from './app';
import type { ApiHandler } from './http';

type Env = Record<string, string | undefined>;

export function createServerApp(env: Env): ApiHandler {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  const sqlite = env.SQLITE_PATH;
  // Durable shared stores (SQLite file, Upstash) report as `redis`: the health enum has no `sqlite`.
  const remote = Boolean(sqlite || (url && token));
  const app = createApp({
    store: sqlite
      ? createSqliteStore(sqlite)
      : remote
        ? createUpstashStore({ url: url!, token: token! })
        : createMemoryStore(),
    clock: systemClock,
    random: secureRandom,
    storage: remote ? 'redis' : 'memory',
    // Fail closed: any value other than `true` (or the legacy `CERBERUS_DEMO_RESET=off`) disables it.
    resetEnabled:
      (env.CERBERUS_RESET_ENABLED === undefined || env.CERBERUS_RESET_ENABLED === 'true') &&
      env.CERBERUS_DEMO_RESET !== 'off',
    // Only the local e2e server sets `off` (shared IP, many devices); any other value keeps the limit.
    rateLimit: env.CERBERUS_RATE_LIMIT !== 'off',
    // Server-side only: the browser demo builds its app without it.
    ...(env.CERBERUS_ROBOT_TOKEN === undefined ? {} : { robotToken: env.CERBERUS_ROBOT_TOKEN }),
  });
  // Deployed commit (set by Vercel) lets the post-deploy smoke wait for the right build.
  const commit = env.VERCEL_GIT_COMMIT_SHA ?? null;
  return async (req) => {
    const res = await app(req);
    return req.method === 'GET' && req.path === '/health' && res.status === 200
      ? { ...res, body: { ...(res.body as object), commit } }
      : res;
  };
}
