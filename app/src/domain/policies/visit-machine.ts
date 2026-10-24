// Visit state machine. Pure: time is injected, inputs are never mutated.
import type { ClassificationResult } from '../entities/types';
import type { CloseReason, Handoff, Visit, VisitFeedback, VisitState } from '../entities/visit';
import { err, ok, type Result } from '../../shared/result';

export type VisitError = 'INVALID_TRANSITION' | 'VISIT_CLOSED' | 'USE_HANDOFF';

export const LAST_PHASE = 9;
/** First phase (Salida del club) from which feedback may be recorded. */
export const FEEDBACK_PHASE = 7;

// WAITING_HANDOFF is absent on purpose: only handoff-machine enters and leaves it (`moveVisit`).
const TRANSITIONS: Record<VisitState, VisitState[]> = {
  // EXPECTED -> VERIFIED is the QR check-in (V-04); -> CLOSED is a cancelled or missed invitation.
  EXPECTED: ['IDENTIFYING', 'VERIFIED', 'CLOSED'],
  IDENTIFYING: ['VERIFIED', 'MANUAL_REVIEW', 'FAILED'],
  MANUAL_REVIEW: ['VERIFIED', 'FAILED', 'CLOSED'],
  // FAILED from VERIFIED, ORIENTING and IN_PROGRESS is the operator's ABORT (V-20).
  VERIFIED: ['ORIENTING', 'CLOSED', 'FAILED'],
  ORIENTING: ['IN_PROGRESS', 'CLOSED', 'FAILED'],
  IN_PROGRESS: ['CLOSED', 'FAILED'],
  WAITING_HANDOFF: [],
  FAILED: ['CLOSED'],
  CLOSED: [],
};

// ponytail: Date#toISOString yields UTC ("Z"); swap for the Bogota formatter if the UI needs local offsets.
export const toInstant = (d: Date) => d.toISOString();

/** Stable JSON (sorted keys, `undefined` dropped) for deep equality of plain data. */
const stable = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );
export const sameData = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Unchecked move for handoff-machine (no transition table, no WAITING_HANDOFF guard). */
export function moveVisit(
  visit: Visit,
  to: VisitState,
  by: string,
  now: Date,
  note?: string,
): Visit {
  const at = toInstant(now);
  const entry = { at, from: visit.state, to, by, ...(note === undefined ? {} : { note }) };
  return {
    ...visit,
    state: to,
    ...(to === 'CLOSED' ? { closedAt: at } : {}),
    history: [...visit.history, entry],
    version: visit.version + 1,
  };
}

export function transitionVisit(
  visit: Visit,
  to: VisitState,
  by: string,
  now: Date,
  note?: string,
): Result<Visit, VisitError> {
  if (visit.state === 'CLOSED') return err('VISIT_CLOSED');
  if (to === 'WAITING_HANDOFF' || visit.state === 'WAITING_HANDOFF') return err('USE_HANDOFF');
  if (!TRANSITIONS[visit.state].includes(to)) return err('INVALID_TRANSITION');
  return ok(moveVisit(visit, to, by, now, note));
}

export function applyClassification(
  visit: Visit,
  result: ClassificationResult,
  by: string,
  now: Date,
  note?: string,
): Result<Visit, VisitError> {
  if (visit.classification && sameData(visit.classification, result)) return ok(visit);
  // Only an arrival being identified, or one awaiting a human, can be (re)classified.
  if (visit.state === 'CLOSED') return err('VISIT_CLOSED');
  if (visit.state !== 'IDENTIFYING' && visit.state !== 'MANUAL_REVIEW') {
    return err('INVALID_TRANSITION');
  }
  const to: VisitState =
    result.state === 'CONFIRMED'
      ? 'VERIFIED'
      : result.state === 'DENIED'
        ? 'FAILED'
        : 'MANUAL_REVIEW';
  const r = transitionVisit(visit, to, by, now, note);
  if (!r.ok) return r;
  const identity =
    result.state === 'CONFIRMED' ? { category: result.category, personId: result.personId } : {};
  return ok({ ...r.value, ...identity, classification: result });
}

export type PhaseError = VisitError | 'INVALID_PHASE' | 'PHASE_REGRESSION';

/** Forward-only; asking for the current phase is a no-op that returns the same visit. */
export function advancePhase(
  visit: Visit,
  toPhase: number,
  by: string,
  now: Date,
): Result<Visit, PhaseError> {
  if (visit.state === 'CLOSED') return err('VISIT_CLOSED');
  if (visit.state !== 'ORIENTING' && visit.state !== 'IN_PROGRESS')
    return err('INVALID_TRANSITION');
  if (!Number.isInteger(toPhase) || toPhase < 0 || toPhase > LAST_PHASE)
    return err('INVALID_PHASE');
  if (toPhase === visit.phase) return ok(visit);
  if (toPhase < visit.phase) return err('PHASE_REGRESSION');
  const entry = {
    at: toInstant(now),
    from: visit.state,
    to: visit.state,
    by,
    note: `phase ${visit.phase}->${toPhase}`,
  };
  return ok({
    ...visit,
    phase: toPhase,
    history: [...visit.history, entry],
    version: visit.version + 1,
  });
}

const OPEN_HANDOFF = ['REQUESTED', 'ACCEPTED', 'CONTEXT_TRANSFERRED'];

/**
 * Ends a visit that is waiting for a handoff: the open handoff ends in the same write
 * (CANCELLED with `cancelReason`, or EXPIRED on a day rollover). Owner untouched (INV-18).
 */
function leaveWaiting(
  visit: Visit,
  to: 'CLOSED' | 'FAILED',
  by: string,
  now: Date,
  note: string | undefined,
  patch: Partial<Visit>,
  handoffEnd: Pick<Handoff, 'state' | 'cancelReason'>,
): Visit {
  const moved = { ...moveVisit(visit, to, by, now, note), ...patch };
  const h = visit.handoff;
  if (!h || !OPEN_HANDOFF.includes(h.state)) return moved;
  const end =
    handoffEnd.state === 'CANCELLED'
      ? {
          state: 'CANCELLED' as const,
          cancelledAt: toInstant(now),
          cancelReason: handoffEnd.cancelReason,
        }
      : { state: handoffEnd.state };
  return { ...moved, handoff: { ...h, ...end } };
}

/**
 * Idempotent: closing an already closed visit returns it untouched. From WAITING_HANDOFF the open
 * handoff is cancelled in the same write (V-14); a day rollover expires it instead (V-23).
 */
export function closeVisit(
  visit: Visit,
  by: string,
  now: Date,
  note?: string,
  reason: CloseReason = 'EXIT',
): Result<Visit, VisitError> {
  if (visit.state === 'CLOSED') return ok(visit);
  const patch = { closeReason: reason };
  if (visit.state === 'WAITING_HANDOFF') {
    return ok(
      leaveWaiting(
        visit,
        'CLOSED',
        by,
        now,
        note,
        patch,
        reason === 'DAY_ROLLOVER'
          ? { state: 'EXPIRED' }
          : { state: 'CANCELLED', cancelReason: 'VISIT_CLOSED' },
      ),
    );
  }
  const r = transitionVisit(visit, 'CLOSED', by, now, note);
  return r.ok ? ok({ ...r.value, ...patch }) : r;
}

/** Operator abort (V-20): the visit fails and an open handoff is cancelled in the same write. */
export function abortVisit(
  visit: Visit,
  by: string,
  now: Date,
  note?: string,
): Result<Visit, VisitError> {
  const patch = { failureReason: 'ABORTED_BY_OPERATOR' };
  if (visit.state === 'WAITING_HANDOFF') {
    return ok(
      leaveWaiting(visit, 'FAILED', by, now, note, patch, {
        state: 'CANCELLED',
        cancelReason: 'VISIT_ABORTED',
      }),
    );
  }
  if (visit.state === 'IDENTIFYING' || visit.state === 'EXPECTED') return err('INVALID_TRANSITION');
  const r = transitionVisit(visit, 'FAILED', by, now, note);
  return r.ok ? ok({ ...r.value, ...patch }) : r;
}

/** V-11: the robot or an attendant starts the orientation; `destination` may override the suggestion. */
export function startOrientation(
  visit: Visit,
  by: string,
  now: Date,
  destination?: string,
): Result<Visit, VisitError> {
  const r = transitionVisit(visit, 'ORIENTING', by, now);
  return r.ok ? ok({ ...r.value, ...(destination ? { destination } : {}) }) : r;
}

/** V-12: `escortId` takes over as owner; without it (`SELF`) the owner does not change. */
export function assignEscort(
  visit: Visit,
  escortId: string | undefined,
  by: string,
  now: Date,
): Result<Visit, VisitError> {
  const r = transitionVisit(visit, 'IN_PROGRESS', by, now, 'escort');
  return r.ok ? ok({ ...r.value, ...(escortId ? { ownerId: escortId } : {}) }) : r;
}

/** V-13: the visitor reached the destination; frees the escort. Only once. */
export function markArrival(visit: Visit, by: string, now: Date): Result<Visit, VisitError> {
  if (visit.state === 'CLOSED') return err('VISIT_CLOSED');
  if (visit.state !== 'IN_PROGRESS' || visit.arrivedAt) return err('INVALID_TRANSITION');
  return ok({ ...moveVisit(visit, 'IN_PROGRESS', by, now, 'arrive'), arrivedAt: toInstant(now) });
}

export type FeedbackError = 'FEEDBACK_NOT_ALLOWED' | 'INVALID_RATING' | 'EMPTY_FEEDBACK';

const validRating = (n: number | undefined) =>
  n === undefined || (Number.isInteger(n) && n >= 1 && n <= 5);

export function recordFeedback(
  visit: Visit,
  feedback: VisitFeedback,
): Result<Visit, FeedbackError> {
  if (visit.feedback && sameData(visit.feedback, feedback)) return ok(visit);
  // The API contract also allows feedback while the visit is IN_PROGRESS (docs/api/CONTRACT.md).
  const allowed = visit.state === 'CLOSED' || visit.state === 'IN_PROGRESS';
  if (!allowed && visit.phase < FEEDBACK_PHASE) return err('FEEDBACK_NOT_ALLOWED');
  if (!validRating(feedback.robot) || !validRating(feedback.club)) return err('INVALID_RATING');
  if (
    feedback.robot === undefined &&
    feedback.club === undefined &&
    !feedback.comment &&
    !feedback.clubComment
  ) {
    return err('EMPTY_FEEDBACK');
  }
  return ok({ ...visit, feedback: { ...feedback }, version: visit.version + 1 });
}
