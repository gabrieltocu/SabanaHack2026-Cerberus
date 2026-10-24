// An escort takes one visit at a time. Busy-ness is derived from the visits (`busyEscorts`), but two
// requests can read it at once and both write their own visit, so each assignment first takes a short
// lease on `escort:<id>` with compare-and-set and recomputes the busy set after holding it.
import type { Visit } from '../domain/entities/visit';
import { busyEscorts } from './directory';
import { fail, type HttpError } from './errors';
import { listVisits, visitKey, MAX_ATTEMPTS, type Ctx } from './repo';

/** An in-flight claim whose visit has not been written yet blocks others for at most this long. */
const PENDING_MS = 10_000;

interface Lease {
  /** Visit the escort is being given to; empty once released. */
  visitId: string;
  /** Version of that visit when the lease was taken: unchanged means its write is still pending. */
  v0: number;
  at: number;
}

const leaseKey = (escortId: string) => `escort:${escortId}`;

/** The leaseholder still counts: its visit keeps the escort busy, or its write is in flight. */
async function holds(ctx: Ctx, lease: Lease, escortId: string): Promise<boolean> {
  if (!lease.visitId) return false;
  const held = await ctx.store.get<Visit>(visitKey(lease.visitId));
  if (!held) return false;
  if (busyEscorts([held.value]).has(escortId)) return true;
  return held.version === lease.v0 && ctx.real.now().getTime() - lease.at < PENDING_MS;
}

/**
 * Runs `run` (the visit write) holding the escort's lease for `visitId`. Rejects with `busy()` when
 * another visit already keeps the escort occupied; the lease is released if `run` fails.
 */
export async function withEscort<T>(
  ctx: Ctx,
  escortId: string,
  visitId: string,
  busy: () => HttpError,
  run: (occupied: Set<string>) => Promise<T>,
): Promise<T> {
  const key = leaseKey(escortId);
  let taken: number | null = null;
  for (let attempt = 0; taken === null; attempt++) {
    if (attempt >= MAX_ATTEMPTS)
      throw fail('VERSION_CONFLICT', 'Demasiadas solicitudes simultáneas.');
    const cur = await ctx.store.get<Lease>(key);
    if (cur && cur.value.visitId !== visitId && (await holds(ctx, cur.value, escortId)))
      throw busy();
    const own = await ctx.store.get<Visit>(visitKey(visitId));
    const lease: Lease = {
      visitId,
      v0: own?.version ?? 0,
      at: ctx.real.now().getTime(),
    };
    taken = await ctx.store.compareAndSet(key, cur?.version ?? 0, lease);
  }
  const release = (version: number) =>
    ctx.store.compareAndSet<Lease>(key, version, { visitId: '', v0: 0, at: 0 }).catch(() => null);
  try {
    // Recomputed now that the lease is ours: whoever finished before is visible, whoever is in
    // flight was stopped at the lease.
    return await run(busyEscorts(await listVisits(ctx), visitId));
  } catch (e) {
    await release(taken);
    throw e;
  }
}
