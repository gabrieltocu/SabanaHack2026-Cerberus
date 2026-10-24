// Persistence of the visit aggregate: `visit:<id>` holds the visit with its embedded invitation and
// handoff, so every transition is a single compare-and-set (docs/adr/0002-mocks-api.md §4).
import type { Clock, ClubRecords } from '../domain/entities/types';
import type { Visit } from '../domain/entities/visit';
import { expireHandoff } from '../domain/policies/handoff-machine';
import { closeVisit } from '../domain/policies/visit-machine';
import type { KeyValueStore } from '../infrastructure/stores/types';
import { fail, HttpError } from './errors';
import { bogotaDay } from './time';

export interface Ctx {
  store: KeyValueStore;
  random: (bytes: number) => Uint8Array;
  /** Wall clock (rate-limit windows); `now` below is the demo clock for domain decisions. */
  real: Clock;
  now: Date;
  storage: 'memory' | 'redis' | 'browser';
  resetEnabled: boolean;
  /** `X-Demo-Actor`, declarative and unverifiable. */
  actor: string | undefined;
  /** Directory, shifts and permits (static seed); invitations are read from the visits. */
  seed: ClubRecords;
}

export const MAX_ATTEMPTS = 3;
const INDEX_ATTEMPTS = 12; // every creator appends to the same list
export const visitKey = (id: string) => `visit:${id}`;

export const randomHex = (ctx: Ctx, bytes = 4) =>
  Array.from(ctx.random(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
export const newId = (ctx: Ctx, prefix: 'vis' | 'inv' | 'hof') => `${prefix}-${randomHex(ctx)}`;

const OPEN_STATES: Visit['state'][] = [
  'VERIFIED',
  'ORIENTING',
  'IN_PROGRESS',
  'WAITING_HANDOFF',
  'MANUAL_REVIEW',
];

/**
 * Applies the lazy rules of docs/domain/visit-handoff-states.md: an expected visit whose invitation
 * window ended closes as NO_SHOW (V-22), an open visit from a previous Bogotá day closes as
 * DAY_ROLLOVER (V-23/INV-14) and an overdue handoff expires (H-07). Same reference if nothing applies.
 */
export function settle(visit: Visit, now: Date): Visit {
  let v = visit;
  const pass = v.invitation?.pass;
  if (v.state === 'EXPECTED' && v.invitation?.status === 'ACTIVE' && pass) {
    // Negated comparison: an unreadable date counts as already over.
    if (!(now.getTime() < Date.parse(pass.validTo))) {
      const r = closeVisit(v, 'system', now, 'no-show', 'NO_SHOW');
      if (r.ok) v = r.value;
    }
  } else if (OPEN_STATES.includes(v.state) && bogotaDay(v.openedAt) < bogotaDay(now)) {
    const r = closeVisit(v, 'system', now, 'day-rollover', 'DAY_ROLLOVER');
    if (r.ok) v = r.value;
  }
  if (v.state !== 'CLOSED' && v.handoff) {
    const r = expireHandoff(v, now);
    if (r.ok) v = r.value;
  }
  return v;
}

export type Out<T> = { visit: Visit } & ({ value: T } | { error: HttpError });

/**
 * Reads the visit, applies the pure function and writes with compare-and-set; on a version
 * conflict it re-reads and re-applies (at most 3 attempts). The function returns the visit to
 * persist (the input itself when nothing changes) and a value or an error; a settled visit is
 * written even when the operation itself is rejected.
 */
export async function modifyVisit<T>(
  ctx: Ctx,
  id: string,
  fn: (visit: Visit, version: number) => Out<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cur = await ctx.store.get<Visit>(visitKey(id));
    if (!cur) throw fail('VISIT_NOT_FOUND', 'No existe la visita indicada.');
    const out = fn(cur.value, cur.version);
    if (out.visit !== cur.value) {
      if ((await ctx.store.compareAndSet(visitKey(id), cur.version, out.visit)) === null) continue;
    }
    if ('error' in out) throw out.error;
    return out.value;
  }
  throw fail('VERSION_CONFLICT', 'La visita cambió mientras se procesaba; reintenta.');
}

/** Persists a lazily settled visit without failing the read that triggered it. */
async function persistSettled(ctx: Ctx, id: string, version: number, settled: Visit) {
  try {
    await ctx.store.compareAndSet(visitKey(id), version, settled);
  } catch {
    // The next read settles it again.
  }
}

export async function readVisit(ctx: Ctx, id: string): Promise<Visit> {
  const cur = await ctx.store.get<Visit>(visitKey(id));
  if (!cur) throw fail('VISIT_NOT_FOUND', 'No existe la visita indicada.');
  const settled = settle(cur.value, ctx.now);
  if (settled !== cur.value) await persistSettled(ctx, id, cur.version, settled);
  return settled;
}

/** Ids of every visit, so a list never scans the keyspace (`idem:` and `rate:` keys pile up there). */
const VISITS_INDEX = 'visits:ids';
interface VisitIndex {
  ids: string[];
}

/** The index, rebuilt once from the `visit:` keys when the store predates it. */
async function readIndex(ctx: Ctx): Promise<{ ids: string[]; version: number }> {
  for (;;) {
    const cur = await ctx.store.get<VisitIndex>(VISITS_INDEX);
    if (cur) return { ids: cur.value.ids, version: cur.version };
    const ids = (await ctx.store.list<Visit>('visit:')).map((e) => e.value.id);
    if ((await ctx.store.compareAndSet(VISITS_INDEX, 0, { ids })) !== null)
      return { ids, version: 1 };
  }
}

/**
 * Registers a visit id before the visit is written: an id whose visit never appears is skipped by
 * the list, while a visit missing from the index would be invisible for good.
 */
export async function indexVisit(ctx: Ctx, id: string): Promise<void> {
  for (let attempt = 0; attempt < INDEX_ATTEMPTS; attempt++) {
    const { ids, version } = await readIndex(ctx);
    if (ids.includes(id)) return;
    if ((await ctx.store.compareAndSet(VISITS_INDEX, version, { ids: [...ids, id] })) !== null)
      return;
  }
  throw fail('VERSION_CONFLICT', 'Demasiadas solicitudes simultáneas.');
}

export async function listVisits(ctx: Ctx): Promise<Visit[]> {
  const { ids } = await readIndex(ctx);
  const entries = await ctx.store.getMany<Visit>(ids.map(visitKey));
  const settled = await Promise.all(
    entries.map(async (e) => {
      if (!e) return [];
      const visit = settle(e.value, ctx.now);
      if (visit !== e.value) await persistSettled(ctx, e.value.id, e.version, visit);
      return [visit];
    }),
  );
  return settled.flat();
}
