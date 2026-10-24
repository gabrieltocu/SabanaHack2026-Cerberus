// Fixed one-minute window per client (docs/api/CONTRACT.md §1): 600 reads, 120 writes, 3 resets.
// Reads are generous because every open screen polls every 3 s and a venue shares one address
// (and about 20 writes per device cover the whole demo journey).
import type { KeyValueStore } from '../infrastructure/stores/types';
import { HttpError } from './errors';
import type { ApiRequest } from './http';

const WINDOW_MS = 60_000;
const MAX_IP = 64; // the key never grows with a hostile header
const LIMITS = { read: 600, write: 120, reset: 3 } as const;

const kindOf = (req: ApiRequest): keyof typeof LIMITS =>
  req.method === 'POST' && req.path === '/demo/reset'
    ? 'reset'
    : req.method === 'GET' || req.method === 'HEAD'
      ? 'read'
      : 'write';

/** Counts the request; throws 429 `RATE_LIMITED` with `Retry-After` once the window is full. */
export async function rateLimit(store: KeyValueStore, nowMs: number, req: ApiRequest) {
  const kind = kindOf(req);
  const window = Math.floor(nowMs / WINDOW_MS);
  const count = await store.increment(
    `rate:${req.ip.slice(0, MAX_IP)}:${kind}:${window}`,
    WINDOW_MS / 1000,
  );
  if (count > LIMITS[kind]) {
    const retryAfter = Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - nowMs) / 1000));
    throw new HttpError(429, 'RATE_LIMITED', 'Demasiadas peticiones.', undefined, {
      'Retry-After': String(retryAfter),
    });
  }
}
