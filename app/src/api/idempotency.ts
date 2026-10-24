// `Idempotency-Key` (docs/api/CONTRACT.md §1): same key and body replay the stored response; the same
// key with another body is 422. Only successful, repeatable responses are stored, for 24 hours; a
// request in flight holds a short `pending` marker so a twin of it cannot run twice (409, retry).
import { fail } from './errors';
import type { ApiRequest, ApiResponse } from './http';
import type { Ctx } from './repo';

const TTL_MS = 24 * 3_600_000;
const PENDING_MS = 30_000;
const KEY_LENGTH = { min: 8, max: 128 };

interface Stored {
  request: string;
  status: number;
  body: unknown;
  expiresAt: number;
  /** Marker of a request that is still running; it expires by itself if the process dies. */
  pending?: true;
}

/** A business rejection (DENIED) is a 200, but fixing it for 24 hours would block the retry that should succeed. */
const isDenial = (body: unknown) => {
  const b = body as { decision?: string; classification?: { state?: string } } | null;
  return b?.decision === 'DENIED' || b?.classification?.state === 'DENIED';
};

const inFlight = () =>
  fail('VERSION_CONFLICT', 'Otra petición con la misma clave sigue en curso; reintenta.');

/** JSON with sorted keys, so the same body compares equal whatever its key order. */
const canonical = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );

export async function withIdempotency(
  ctx: Ctx,
  req: ApiRequest,
  required: boolean,
  run: () => Promise<ApiResponse>,
): Promise<ApiResponse> {
  const key = req.headers['idempotency-key'];
  if (key === undefined) {
    if (required) throw fail('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key.');
    return run();
  }
  if (key.length < KEY_LENGTH.min || key.length > KEY_LENGTH.max) {
    throw fail('BAD_REQUEST', 'Idempotency-Key debe tener de 8 a 128 caracteres.');
  }

  const storeKey = `idem:${req.method} ${req.path}:${ctx.actor ?? ''}:${key}`;
  const request = canonical(req.body);
  const now = ctx.real.now().getTime();
  // An expired entry is replaced in place by the claim below (a CAS on its version: a delete here
  // could wipe a twin's marker). ponytail: keys nobody reads again stay until the next reset;
  // listings no longer scan them. Ceiling: a demo; a long-lived deployment sets a TTL in the store.
  const found = await ctx.store.get<Stored>(storeKey);
  if (found && found.value.expiresAt > now) {
    if (found.value.pending) throw inFlight();
    if (found.value.request !== request) {
      throw fail('IDEMPOTENCY_KEY_REUSED', 'La clave se usó antes con un cuerpo distinto.');
    }
    return {
      status: found.value.status,
      headers: { 'Idempotency-Replayed': 'true' },
      body: found.value.body,
    };
  }

  // Claim the key before running: of two identical requests only one gets version `found`.
  const marker: Stored = {
    request,
    status: 0,
    body: null,
    expiresAt: now + PENDING_MS,
    pending: true,
  };
  const claimed = await ctx.store.compareAndSet(storeKey, found?.version ?? 0, marker);
  if (claimed === null) throw inFlight();

  let res: ApiResponse;
  try {
    res = await run();
  } catch (e) {
    await ctx.store.delete(storeKey);
    throw e;
  }
  if (res.status >= 200 && res.status < 300 && !isDenial(res.body)) {
    const value: Stored = { request, status: res.status, body: res.body, expiresAt: now + TTL_MS };
    await ctx.store.compareAndSet(storeKey, claimed, value);
  } else {
    await ctx.store.delete(storeKey);
  }
  return res;
}
