// Visit events of docs/domain/visit-handoff-states.md (V-08 to V-14, V-20) and feedback.
import type { ClassificationResult, ClubRecords } from '../domain/entities/types';
import type { Visit } from '../domain/entities/visit';
import { classify } from '../domain/policies/classify';
import {
  abortVisit,
  applyClassification,
  assignEscort,
  closeVisit,
  markArrival,
  recordFeedback,
  startOrientation,
  toInstant,
  transitionVisit,
} from '../domain/policies/visit-machine';
import type { AdvanceRequest, CloseRequest, FeedbackRequest } from '../infrastructure/contracts';
import { actorKind, findPerson, isEligibleEscort, requireActor, type ActorKind } from './directory';
import { fail, type HttpError } from './errors';
import { withEscort } from './escorts';
import { openHandoff } from './present';
import { bogotaIso } from './time';
import { modifyVisit, settle, visitKey, type Ctx, type Out } from './repo';

const RECEPTION = 'R1';
const OPERATING: ActorKind[] = ['ROBOT', 'USHER', 'OPERATOR'];

function transitionError(v: Visit, event: string): HttpError {
  return fail('INVALID_TRANSITION', 'El evento no corresponde al estado actual de la visita.', {
    state: v.state,
    event,
  });
}

/** Rejects a stale `expectedVersion` against the stored visit, before any lazy settling. */
const staleVersion = (v: Visit, expected: number | undefined): HttpError | undefined =>
  expected !== undefined && v.version !== expected
    ? fail('VERSION_CONFLICT', 'La visita cambió desde que la leíste.', {
        expectedVersion: expected,
        currentVersion: v.version,
      })
    : undefined;

/** Applies `fn` to the settled visit; a domain failure becomes the API error `toError` builds. */
function run(
  ctx: Ctx,
  cur: Visit,
  expectedVersion: number | undefined,
  fn: (v: Visit) => Out<Visit>,
): Out<Visit> {
  const stale = staleVersion(cur, expectedVersion);
  if (stale) return { visit: cur, error: stale };
  return fn(settle(cur, ctx.now));
}

export async function advanceVisit(ctx: Ctx, id: string, body: AdvanceRequest): Promise<Visit> {
  const actor = requireActor(ctx, ['ROBOT', 'USHER', 'OPERATOR', 'MEMBER', 'STAFF', 'EXTERNAL']);
  const kind = actorKind(actor);
  const allowed = (kinds: ActorKind[]) => kinds.includes(kind);
  // Ushers and operators act on any visit; a robot only on the visit it owns.
  const linked = (v: Visit) => v.ownerId === actor.id || allowed(['USHER', 'OPERATOR']);
  const denyActor = (v: Visit): Out<Visit> => ({
    visit: v,
    error: fail('ACTOR_NOT_ALLOWED', 'El actor no puede aplicar este evento.'),
  });
  const { now } = ctx;

  // Reads that do not depend on other visits' ownership happen before the compare-and-set loop.
  const escort =
    body.event === 'ASSIGN_ESCORT' && body.assigneeId !== 'SELF' && body.assigneeId !== 'NONE'
      ? findPerson(ctx.seed, body.assigneeId)
      : undefined;
  const escortEligible = escort ? await isEligibleEscort(ctx, escort) : false;
  // `SELF` keeps the current owner as the escort, so it follows the same rule as naming one:
  // R1, a robot in FAULT or an operator never escort.
  const eligibleOwners = new Set<string>();
  if (body.event === 'ASSIGN_ESCORT' && body.assigneeId === 'SELF')
    for (const p of ctx.seed.people) if (await isEligibleEscort(ctx, p)) eligibleOwners.add(p.id);

  const apply = (busy: Set<string>) =>
    modifyVisit(ctx, id, (cur) =>
      run(ctx, cur, body.expectedVersion, (v): Out<Visit> => {
        const ok = (visit: Visit): Out<Visit> => ({ visit, value: visit });
        switch (body.event) {
          case 'START_ORIENTATION': {
            if (!allowed(OPERATING) || !linked(v)) return denyActor(v);
            const r = startOrientation(v, actor.id, now, body.destination);
            return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
          }
          case 'ARRIVE': {
            if (!allowed(OPERATING) || !linked(v)) return denyActor(v);
            const r = markArrival(v, actor.id, now);
            return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
          }
          case 'ABORT': {
            if (!allowed(['OPERATOR'])) return denyActor(v);
            const r = abortVisit(v, actor.id, now, body.reason);
            return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
          }
          case 'ASSIGN_ESCORT': {
            if (!allowed(OPERATING) || !linked(v)) return denyActor(v);
            if (v.state !== 'ORIENTING') {
              return { visit: v, error: transitionError(v, body.event) };
            }
            if (body.assigneeId === 'NONE') {
              // No escort at all (staff, or a visitor who declines): the owner keeps the visit.
              // A visitor from outside always goes with a human usher.
              if (v.category === 'EXTERNAL') {
                return {
                  visit: v,
                  error: fail('ESCORT_NOT_ALLOWED', 'Un externo siempre va con un edecán.'),
                };
              }
              const r = assignEscort(v, undefined, actor.id, now);
              return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
            }
            if (!body.visitorAccepted) {
              return {
                visit: v,
                error: fail(
                  'VISITOR_ACCEPTANCE_REQUIRED',
                  'El visitante debe aceptar el acompañamiento.',
                ),
              };
            }
            if (body.assigneeId === 'SELF') {
              if (v.ownerId && busy.has(v.ownerId)) {
                return {
                  visit: v,
                  error: fail('ASSIGNEE_BUSY', 'El acompañante ya tiene una tarea activa.', {
                    assigneeId: v.ownerId,
                  }),
                };
              }
              if (v.category === 'EXTERNAL') {
                return { visit: v, error: fail('ESCORT_NOT_ALLOWED', 'Un externo no va solo.') };
              }
              if (!v.ownerId || !eligibleOwners.has(v.ownerId)) {
                return {
                  visit: v,
                  error: fail(
                    'ESCORT_NOT_ALLOWED',
                    'El responsable de la visita no puede acompañarla.',
                  ),
                };
              }
              const r = assignEscort(v, undefined, actor.id, now);
              return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
            }
            if (!escort)
              return { visit: v, error: fail('PERSON_NOT_FOUND', 'No existe el acompañante.') };
            if (!escortEligible) {
              return {
                visit: v,
                error: fail('ESCORT_NOT_ALLOWED', 'El acompañante no está disponible.'),
              };
            }
            if (v.category === 'EXTERNAL' && escort.kind === 'ROBOT') {
              return {
                visit: v,
                error: fail('ESCORT_NOT_ALLOWED', 'Un externo no va con robot.'),
              };
            }
            if (busy.has(escort.id)) {
              return {
                visit: v,
                error: fail('ASSIGNEE_BUSY', 'El acompañante ya tiene una tarea activa.', {
                  assigneeId: escort.id,
                }),
              };
            }
            const r = assignEscort(v, escort.id, actor.id, now);
            return r.ok ? ok(r.value) : { visit: v, error: transitionError(v, body.event) };
          }
          case 'RESOLVE_REVIEW': {
            if (!allowed(['OPERATOR', 'USHER'])) return denyActor(v);
            return resolveReview(ctx, v, body, actor.id);
          }
        }
      }),
    );

  // The escort that will own the visit is leased while the write happens, so two assignments to
  // the same escort cannot both succeed (B4). `SELF` keeps the current owner.
  let escortId: string | undefined;
  if (body.event === 'ASSIGN_ESCORT') {
    if (escort && escortEligible) escortId = escort.id;
    else if (body.assigneeId === 'SELF') {
      const owner = (await ctx.store.get<Visit>(visitKey(id)))?.value.ownerId;
      if (owner && eligibleOwners.has(owner)) escortId = owner;
    }
  }
  return escortId
    ? withEscort(
        ctx,
        escortId,
        id,
        () =>
          fail('ASSIGNEE_BUSY', 'El acompañante ya tiene una tarea activa.', {
            assigneeId: escortId,
          }),
        apply,
      )
    : apply(new Set());
}

function resolveReview(
  ctx: Ctx,
  v: Visit,
  body: Extract<AdvanceRequest, { event: 'RESOLVE_REVIEW' }>,
  by: string,
): Out<Visit> {
  const { now } = ctx;
  if (v.state !== 'MANUAL_REVIEW') {
    return { visit: v, error: transitionError(v, body.event) };
  }
  if (body.decision === 'DENY') {
    const r = transitionVisit(v, 'FAILED', by, now, 'review-denied');
    if (!r.ok) return { visit: v, error: transitionError(v, body.event) };
    const denied: Visit = { ...r.value, failureReason: 'REVIEW_DENIED' };
    return { visit: denied, value: denied };
  }
  const person = findPerson(ctx.seed, body.personId);
  if (!body.personId) {
    return {
      visit: v,
      error: fail('VALIDATION_ERROR', 'CONFIRM exige el personId comprobado.', {
        fields: { personId: 'Es obligatorio con CONFIRM.' },
      }),
    };
  }
  if (!person)
    return { visit: v, error: fail('PERSON_NOT_FOUND', 'No existe la persona indicada.') };

  // Stage 2 again, with that person as candidate and no facial hint (ADR 0003): the system, not
  // the human, picks the category. `purpose` settles a member who is also staff.
  const isMember = ctx.seed.memberships.some((m) => m.personId === person.id);
  let records: ClubRecords = { ...ctx.seed, invitations: [] };
  let classHint: 'MEMBER' | 'NON_MEMBER' = isMember ? 'MEMBER' : 'NON_MEMBER';
  if (body.purpose === 'MEMBER') {
    classHint = 'MEMBER';
    records = { ...records, shifts: records.shifts.filter((s) => s.personId !== person.id) };
  } else if (body.purpose === 'STAFF') {
    classHint = 'NON_MEMBER';
    records = {
      ...records,
      memberships: records.memberships.filter((m) => m.personId !== person.id),
    };
  }
  const result = classify({ status: 'MATCH', classHint, candidateId: person.id }, records, now);
  if (result.state !== 'CONFIRMED' || result.category === 'GUEST') {
    // A human cannot create an invitation: GUEST only comes from a valid QR (ADR 0003).
    const reason = result.state === 'CONFIRMED' ? 'NO_EVIDENCE' : result.reason;
    return {
      visit: v,
      error: fail('REVIEW_NOT_CONFIRMABLE', 'Los registros no respaldan la confirmación.', {
        reason,
      }),
    };
  }
  const attested: ClassificationResult = {
    ...result,
    evidence: [...result.evidence, 'HUMAN_ATTESTATION'],
  };
  const r = applyClassification(v, attested, by, now, 'review-confirmed');
  if (!r.ok) return { visit: v, error: transitionError(v, body.event) };
  const next: Visit = {
    ...r.value,
    visitorRef: person.id,
    visitorName: person.name,
    ownerId: v.recognition?.source.id ?? by,
    ...(result.suggestedDestination ? { destination: result.suggestedDestination } : {}),
  };
  return { visit: next, value: next };
}

export async function closeVisitEvent(ctx: Ctx, id: string, body: CloseRequest): Promise<Visit> {
  const actor = requireActor(ctx, OPERATING);
  return modifyVisit(ctx, id, (cur) =>
    run(ctx, cur, body.expectedVersion, (v) => {
      // Reception (R1) checks anyone out unless a handoff is open; other robots, only their own.
      const reception = actor.id === RECEPTION && !openHandoff(v);
      if (v.ownerId !== actor.id && actorKind(actor) === 'ROBOT' && !reception) {
        return { visit: v, error: fail('ACTOR_NOT_ALLOWED', 'La visita es de otro responsable.') };
      }
      const allowed: Visit['state'][] = ['VERIFIED', 'ORIENTING', 'IN_PROGRESS', 'WAITING_HANDOFF'];
      if (!allowed.includes(v.state)) {
        return { visit: v, error: transitionError(v, 'CLOSE') };
      }
      const r = closeVisit(v, actor.id, ctx.now, body.method ? `exit:${body.method}` : undefined);
      return r.ok
        ? { visit: r.value, value: r.value }
        : { visit: v, error: transitionError(v, 'CLOSE') };
    }),
  );
}

export async function submitFeedback(
  ctx: Ctx,
  id: string,
  body: FeedbackRequest,
): Promise<{ visit: Visit }> {
  // Collected at the kiosk or by staff on behalf of the visitor, or by the visitor themself (the
  // `personId` of the visit): never anonymous.
  const actor = requireActor(ctx, [...OPERATING, 'MEMBER', 'STAFF', 'EXTERNAL', 'GUEST']);
  const operating = OPERATING.includes(actorKind(actor));
  return modifyVisit<{ visit: Visit }>(ctx, id, (cur) => {
    const v = settle(cur, ctx.now);
    if (!operating && v.personId !== actor.id) {
      return {
        visit: v,
        error: fail(
          'ACTOR_NOT_ALLOWED',
          'Solo el propio visitante o el personal evalúa la visita.',
        ),
      };
    }
    if (v.feedback) {
      return {
        visit: v,
        error: fail('FEEDBACK_ALREADY_SUBMITTED', 'La visita ya tiene evaluación.'),
      };
    }
    const r = recordFeedback(v, {
      ...(body.robotRating === undefined ? {} : { robot: body.robotRating }),
      ...(body.clubRating === undefined ? {} : { club: body.clubRating }),
      ...(body.robotComment === undefined ? {} : { comment: body.robotComment }),
      ...(body.clubComment === undefined ? {} : { clubComment: body.clubComment }),
      createdAt: toInstant(ctx.now),
    });
    if (!r.ok) {
      return {
        visit: v,
        error:
          r.error === 'FEEDBACK_NOT_ALLOWED'
            ? transitionError(v, 'FEEDBACK')
            : fail('VALIDATION_ERROR', 'La evaluación no es válida.'),
      };
    }
    return { visit: r.value, value: { visit: r.value } };
  });
}

/** Wire shape of a stored feedback. */
export function feedbackDto(v: Visit) {
  const f = v.feedback!;
  return {
    ...(f.robot === undefined ? {} : { robotRating: f.robot }),
    ...(f.comment === undefined ? {} : { robotComment: f.comment }),
    ...(f.club === undefined ? {} : { clubRating: f.club }),
    ...(f.clubComment === undefined ? {} : { clubComment: f.clubComment }),
    visitId: v.id,
    createdAt: bogotaIso(f.createdAt ?? v.openedAt),
  };
}
