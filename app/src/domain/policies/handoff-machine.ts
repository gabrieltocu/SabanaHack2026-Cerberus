// Handoff state machine (robot -> attendant relief). Pure: time is injected, inputs are never mutated.
// The handoff lives inside the visit (`visit.handoff`), so every function takes and returns only a
// `Visit`: one key, one compare-and-set, no partial writes between visit and handoff.
// Invariant: `visit.ownerId` only changes in `confirmHandoff`; requesting, accepting, cancelling
// or expiring leave the current owner in charge.
//
// API contract: on VERSION_CONFLICT or STORE_UNAVAILABLE the API re-reads the visit and applies the
// pure function again. Accept, transfer, confirm, cancel and expire are idempotent (same reference,
// no version bump), so a lost response never breaks the flow or duplicates history.
import type {
  Handoff,
  HandoffCancelReason,
  HandoffContext,
  HandoffReason,
  Visit,
} from '../entities/visit';
import { err, ok, type Result } from '../../shared/result';
import { moveVisit, toInstant, type VisitError } from './visit-machine';

export const DEFAULT_TTL_SECONDS = 300;
export const MAX_TTL_SECONDS = 86_400;
/** An accepted handoff must be confirmed within this many seconds of `acceptedAt`. */
export const ACCEPTED_TTL_SECONDS = 600;
const SYSTEM = 'system';
/** Closing these leaves the visit in WAITING_HANDOFF so a new handoff can be opened. */
const CRITICAL: HandoffReason[] = ['ROBOT_FAILURE', 'NETWORK_LOSS', 'LOW_BATTERY'];
const OPEN = ['REQUESTED', 'ACCEPTED', 'CONTEXT_TRANSFERRED'];

/** Same visit with a patched handoff: one history entry and one version bump. */
function withHandoff(visit: Visit, patch: Partial<Handoff>, by: string, now: Date, note: string) {
  const state = visit.state;
  return {
    ...moveVisit(visit, state, by, now, note),
    handoff: { ...visit.handoff!, ...patch },
  };
}

export type RequestError =
  VisitError | 'INVALID_STATE' | 'NOT_OWNER' | 'HANDOFF_ALREADY_OPEN' | 'INVALID_TTL';

export function requestHandoff(
  visit: Visit,
  fromId: string,
  reason: HandoffReason,
  context: HandoffContext,
  now: Date,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Result<Visit, RequestError> {
  if (visit.state === 'CLOSED') return err('VISIT_CLOSED');
  if (visit.handoff && OPEN.includes(visit.handoff.state)) return err('HANDOFF_ALREADY_OPEN');
  if (
    visit.state !== 'VERIFIED' &&
    visit.state !== 'ORIENTING' &&
    visit.state !== 'IN_PROGRESS' &&
    visit.state !== 'WAITING_HANDOFF'
  ) {
    return err('INVALID_STATE');
  }
  if (fromId !== visit.ownerId) return err('NOT_OWNER');
  if (!(Number.isFinite(ttlSeconds) && ttlSeconds > 0 && ttlSeconds <= MAX_TTL_SECONDS)) {
    return err('INVALID_TTL');
  }
  const moved = moveVisit(visit, 'WAITING_HANDOFF', fromId, now, `handoff:${reason}`);
  const handoff: Handoff = {
    // Deterministic id: a visit's version changes on every write, so one per request.
    id: `H-${visit.id}-${moved.version}`,
    visitId: visit.id,
    fromId,
    reason,
    state: 'REQUESTED',
    requestedAt: toInstant(now),
    expiresAt: toInstant(new Date(now.getTime() + ttlSeconds * 1000)),
    context,
  };
  return ok({ ...moved, handoff });
}

/** Shared guard: the visit must be waiting for the handoff. */
function waitingError(visit: Visit): 'VISIT_CLOSED' | 'INVALID_STATE' | undefined {
  if (visit.state === 'CLOSED') return 'VISIT_CLOSED';
  return visit.state === 'WAITING_HANDOFF' ? undefined : 'INVALID_STATE';
}

export type AcceptError =
  | 'NO_HANDOFF'
  | 'SELF_HANDOFF'
  | 'ALREADY_ACCEPTED'
  | 'HANDOFF_EXPIRED'
  | 'INVALID_STATE'
  | 'VISIT_CLOSED';

/** Idempotent for the same attendant; the TTL only bounds how long a REQUESTED handoff can wait. */
export function acceptHandoff(
  visit: Visit,
  attendantId: string,
  now: Date,
): Result<Visit, AcceptError> {
  const h = visit.handoff;
  if (!h) return err('NO_HANDOFF');
  if (attendantId === h.fromId) return err('SELF_HANDOFF');
  switch (h.state) {
    case 'REQUESTED': {
      const bad = waitingError(visit);
      if (bad) return err(bad);
      if (now.getTime() >= new Date(h.expiresAt).getTime()) return err('HANDOFF_EXPIRED');
      return ok(
        withHandoff(
          visit,
          { state: 'ACCEPTED', toId: attendantId, acceptedAt: toInstant(now) },
          attendantId,
          now,
          `handoff-accepted:${h.id}`,
        ),
      );
    }
    case 'ACCEPTED':
    case 'CONTEXT_TRANSFERRED':
    case 'CONFIRMED':
      return h.toId === attendantId ? ok(visit) : err('ALREADY_ACCEPTED');
    case 'EXPIRED':
      return err('HANDOFF_EXPIRED');
    default:
      return err('INVALID_STATE');
  }
}

export type TransferError = 'NO_HANDOFF' | 'NOT_ASSIGNEE' | 'INVALID_STATE' | 'HANDOFF_EXPIRED';

/** Optional step: the attendant met the visitor and recovered the context. Idempotent. */
export function transferContext(
  visit: Visit,
  attendantId: string,
  now: Date,
): Result<Visit, TransferError> {
  const h = visit.handoff;
  if (!h) return err('NO_HANDOFF');
  if (h.state !== 'ACCEPTED' && h.state !== 'CONTEXT_TRANSFERRED') return err('INVALID_STATE');
  if (attendantId !== h.toId) return err('NOT_ASSIGNEE');
  if (h.state === 'CONTEXT_TRANSFERRED') return ok(visit);
  if (now.getTime() >= deadline(h)) return err('HANDOFF_EXPIRED');
  return ok(
    withHandoff(
      visit,
      { state: 'CONTEXT_TRANSFERRED', contextTransferredAt: toInstant(now) },
      attendantId,
      now,
      `handoff-context:${h.id}`,
    ),
  );
}

export type CloseOutError = 'NO_HANDOFF' | 'INVALID_STATE' | 'VISIT_CLOSED';
export type ConfirmError = CloseOutError | 'NOT_ASSIGNEE' | 'HANDOFF_EXPIRED';

/**
 * Accepts ACCEPTED directly (an implicit CONTEXT_TRANSFERRED) or an explicit CONTEXT_TRANSFERRED.
 * Idempotent for the confirming attendant: a second call returns the same visit.
 */
export function confirmHandoff(
  visit: Visit,
  attendantId: string,
  now: Date,
): Result<Visit, ConfirmError> {
  const h = visit.handoff;
  if (!h) return err('NO_HANDOFF');
  if (h.state === 'CONFIRMED') return attendantId === h.toId ? ok(visit) : err('NOT_ASSIGNEE');
  if (h.state !== 'ACCEPTED' && h.state !== 'CONTEXT_TRANSFERRED') return err('INVALID_STATE');
  if (attendantId !== h.toId) return err('NOT_ASSIGNEE');
  const bad = waitingError(visit);
  if (bad) return err(bad);
  if (now.getTime() >= deadline(h)) return err('HANDOFF_EXPIRED');
  const moved = moveVisit(visit, 'IN_PROGRESS', attendantId, now, `handoff:${h.id}`);
  return ok({
    ...moved,
    ownerId: attendantId,
    handoff: { ...h, state: 'CONFIRMED', confirmedAt: toInstant(now) },
  });
}

/**
 * Closes the handoff. Critical reasons keep the visit in WAITING_HANDOFF (a new handoff can be
 * opened); the rest go back to the state the visit had before waiting. Owner untouched.
 */
function closeOut(
  visit: Visit,
  h: Handoff,
  state: 'CANCELLED' | 'EXPIRED',
  by: string,
  now: Date,
  note: string,
  cancelReason?: HandoffCancelReason,
): Visit {
  const closed: Handoff = {
    ...h,
    state,
    ...(state === 'CANCELLED'
      ? { cancelledAt: toInstant(now), ...(cancelReason ? { cancelReason } : {}) }
      : {}),
  };
  const label = `${note}:${h.id}`;
  if (CRITICAL.includes(h.reason)) {
    return { ...moveVisit(visit, 'WAITING_HANDOFF', by, now, label), handoff: closed };
  }
  const opened = [...visit.history]
    .reverse()
    .find((e) => e.to === 'WAITING_HANDOFF' && e.from !== 'WAITING_HANDOFF');
  const back =
    opened?.from === 'ORIENTING' || opened?.from === 'VERIFIED' ? opened.from : 'IN_PROGRESS';
  return { ...moveVisit(visit, back, by, now, label), handoff: closed };
}

/** Idempotent. `by` can be the current owner, the assigned attendant or the system. */
export function cancelHandoff(
  visit: Visit,
  by: string,
  now: Date,
  cancelReason?: HandoffCancelReason,
): Result<Visit, CloseOutError | 'NOT_ALLOWED'> {
  const h = visit.handoff;
  if (!h) return err('NO_HANDOFF');
  if (by !== visit.ownerId && by !== h.toId && by !== SYSTEM) return err('NOT_ALLOWED');
  if (h.state === 'CANCELLED') return ok(visit);
  if (!OPEN.includes(h.state)) return err('INVALID_STATE');
  const bad = waitingError(visit);
  if (bad) return err(bad);
  return ok(closeOut(visit, h, 'CANCELLED', by, now, 'handoff-cancelled', cancelReason));
}

export type ExpireError = CloseOutError | 'NOT_EXPIRED';

/** Instant from which an open handoff is overdue: its TTL, or 600 s after being accepted. */
const deadline = (h: Handoff) =>
  h.state === 'REQUESTED'
    ? new Date(h.expiresAt).getTime()
    : new Date(h.acceptedAt ?? h.expiresAt).getTime() + ACCEPTED_TTL_SECONDS * 1000;

/** An open handoff past its deadline expires (system actor). Idempotent. */
export function expireHandoff(visit: Visit, now: Date): Result<Visit, ExpireError> {
  const h = visit.handoff;
  if (!h) return err('NO_HANDOFF');
  if (h.state === 'EXPIRED') return ok(visit);
  if (!OPEN.includes(h.state)) return err('INVALID_STATE');
  if (now.getTime() < deadline(h)) return err('NOT_EXPIRED');
  const bad = waitingError(visit);
  if (bad) return err(bad);
  return ok(closeOut(visit, h, 'EXPIRED', SYSTEM, now, 'handoff-expired'));
}
