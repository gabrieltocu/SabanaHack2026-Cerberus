// Robot -> human relief (docs/domain/visit-handoff-states.md §3). The handoff lives inside its visit,
// so every step is one compare-and-set on `visit:<id>`; `handoff:<id>` only maps an id to its visit.
import type { Person } from '../domain/entities/types';
import type { Handoff, HandoffCancelReason, HandoffReason, Visit } from '../domain/entities/visit';
import {
  acceptHandoff,
  cancelHandoff as cancelHandoffMachine,
  confirmHandoff as confirmHandoffMachine,
  requestHandoff,
  transferContext,
} from '../domain/policies/handoff-machine';
import type {
  HandoffCancelRequest,
  HandoffCreate,
  HandoffsQuery,
} from '../infrastructure/contracts';
import { actorKind, findPerson, isEligibleEscort, requireActor } from './directory';
import { fail, type HttpError } from './errors';
import { withEscort } from './escorts';
import { openHandoff } from './present';
import { listVisits, modifyVisit, newId, settle, visitKey, type Ctx, type Out } from './repo';

/** Maps a domain failure to the contract error. An expired handoff always reports HANDOFF_EXPIRED. */
function handoffError(v: Visit, event: string, error: string): HttpError {
  const h = v.handoff;
  if (error === 'NO_HANDOFF') return fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.');
  if (error === 'HANDOFF_EXPIRED' || (error === 'INVALID_STATE' && h?.state === 'EXPIRED')) {
    return fail('HANDOFF_EXPIRED', 'El relevo venció.', { handoffId: h?.id });
  }
  if (error === 'ALREADY_ACCEPTED') {
    return fail('HANDOFF_ALREADY_ACCEPTED', 'Otro acompañante ya aceptó este relevo.', {
      handoffId: h?.id,
      toId: h?.toId,
    });
  }
  if (error === 'HANDOFF_ALREADY_OPEN') {
    return fail('HANDOFF_ALREADY_OPEN', 'La visita ya tiene un relevo abierto.', {
      handoffId: h?.id,
    });
  }
  if (['NOT_OWNER', 'NOT_ASSIGNEE', 'SELF_HANDOFF', 'NOT_ALLOWED'].includes(error)) {
    return fail('ACTOR_NOT_ALLOWED', 'El actor no puede realizar esta acción sobre el relevo.');
  }
  return fail('INVALID_TRANSITION', 'La acción no corresponde al estado del relevo.', {
    state: h?.state ?? v.state,
    event,
  });
}

export async function visitIdOfHandoff(ctx: Ctx, id: string): Promise<string> {
  const idx = await ctx.store.get<{ visitId: string }>(`handoff:${id}`);
  if (!idx) throw fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.');
  return idx.value.visitId;
}

export interface RequestOptions {
  actor: Person;
  reason: HandoffReason;
  note?: string;
  preferredToId?: string;
  lastKnownPoint?: string;
  /** Robot failure: only the robot's own visits, and a handoff already open is reused. */
  ownerMustBe?: string;
}

/** V-15/V-16: the current owner or an operator opens a handoff; the owner does not change. */
export async function openRequest(ctx: Ctx, visitId: string, o: RequestOptions): Promise<Visit> {
  if (!(await ctx.store.get(visitKey(visitId)))) {
    throw fail('VISIT_NOT_FOUND', 'No existe la visita indicada.');
  }
  const id = newId(ctx, 'hof');
  await ctx.store.compareAndSet(`handoff:${id}`, 0, { visitId });
  return modifyVisit(ctx, visitId, (cur): Out<Visit> => {
    const v = settle(cur, ctx.now);
    const resume = o.ownerMustBe !== undefined;
    if (resume && (openHandoff(v) || v.ownerId !== o.ownerMustBe)) return { visit: v, value: v };
    if (!resume && v.ownerId !== o.actor.id && actorKind(o.actor) !== 'OPERATOR') {
      return {
        visit: v,
        error: fail('ACTOR_NOT_ALLOWED', 'Solo el responsable o un operador pide el relevo.'),
      };
    }
    const r = requestHandoff(
      v,
      v.ownerId ?? '',
      o.reason,
      {
        ...(v.destination ? { destination: v.destination } : {}),
        ...(v.category ? { category: v.category } : {}),
        ...(v.visitorName ? { personName: v.visitorName } : {}),
        ...(o.note ? { notes: o.note } : {}),
      },
      ctx.now,
    );
    if (!r.ok) return { visit: v, error: handoffError(v, 'REQUEST', r.error) };
    const handoff: Handoff = {
      ...r.value.handoff!,
      id,
      requestedBy: o.actor.id,
      ...(o.preferredToId ? { preferredToId: o.preferredToId } : {}),
      ...(o.lastKnownPoint ? { lastKnownPoint: o.lastKnownPoint } : {}),
    };
    const next = { ...r.value, handoff };
    return { visit: next, value: next };
  });
}

export async function createHandoff(ctx: Ctx, body: HandoffCreate): Promise<Visit> {
  const actor = requireActor(ctx, ['ROBOT', 'USHER', 'OPERATOR']);
  if (body.preferredToId && !findPerson(ctx.seed, body.preferredToId)) {
    throw fail('PERSON_NOT_FOUND', 'No existe el receptor preferido.');
  }
  return openRequest(ctx, body.visitId, {
    actor,
    reason: body.reason,
    ...(body.note ? { note: body.note } : {}),
    ...(body.preferredToId ? { preferredToId: body.preferredToId } : {}),
  });
}

export async function listHandoffs(ctx: Ctx, query: HandoffsQuery): Promise<Visit[]> {
  const visits = await listVisits(ctx);
  return visits
    .filter((v) => v.handoff)
    .filter((v) => query.state === undefined || v.handoff!.state === query.state)
    .filter((v) => query.visitId === undefined || v.id === query.visitId)
    .sort((a, b) => a.handoff!.requestedAt.localeCompare(b.handoff!.requestedAt));
}

/**
 * Runs `apply` holding the lease of the receiver when the handoff is in the state that makes them
 * the next owner (`REQUESTED` to accept, `CONTEXT_TRANSFERRED` to confirm); any other state only
 * yields the error the machine reports, which must not depend on how busy the actor is.
 */
async function leased(
  ctx: Ctx,
  actorId: string,
  visitId: string,
  handoffId: string,
  state: 'REQUESTED' | 'CONTEXT_TRANSFERRED',
  apply: (busy: Set<string>) => Promise<Visit>,
): Promise<Visit> {
  const h = (await ctx.store.get<Visit>(visitKey(visitId)))?.value.handoff;
  const takes =
    h?.id === handoffId && h.state === state && (state === 'REQUESTED' || h.toId === actorId);
  return takes
    ? withEscort(
        ctx,
        actorId,
        visitId,
        () => fail('RECEIVER_BUSY', 'El receptor ya tiene una tarea activa.'),
        apply,
      )
    : apply(new Set());
}

/** H-02: only an eligible, free escort other than the giver (and the preferred one) accepts. */
export async function accept(ctx: Ctx, id: string): Promise<Visit> {
  const actor = requireActor(ctx, ['USHER']);
  if (!(await isEligibleEscort(ctx, actor))) {
    throw fail('ACTOR_NOT_ALLOWED', 'El actor no es un acompañante disponible.');
  }
  const visitId = await visitIdOfHandoff(ctx, id);
  const apply = (busy: Set<string>) =>
    modifyVisit(ctx, visitId, (cur): Out<Visit> => {
      const v = settle(cur, ctx.now);
      const h = v.handoff;
      if (!h || h.id !== id)
        return { visit: v, error: fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.') };
      if (h.state === 'REQUESTED') {
        if (h.preferredToId && h.preferredToId !== actor.id) {
          return {
            visit: v,
            error: fail('ACTOR_NOT_ALLOWED', 'El relevo se pidió para otro acompañante.'),
          };
        }
        if (v.category === 'EXTERNAL' && actor.kind !== 'ATTENDANT') {
          return {
            visit: v,
            error: fail('ACTOR_NOT_ALLOWED', 'Un externo solo se entrega a un edecán.'),
          };
        }
        if (busy.has(actor.id)) {
          return {
            visit: v,
            error: fail('RECEIVER_BUSY', 'El receptor ya tiene una tarea activa.'),
          };
        }
      }
      const r = acceptHandoff(v, actor.id, ctx.now);
      return r.ok
        ? { visit: r.value, value: r.value }
        : { visit: v, error: handoffError(v, 'ACCEPT', r.error) };
    });
  return leased(ctx, actor.id, visitId, id, 'REQUESTED', apply);
}

/** H-03: the receiver gets the full context. Idempotent. */
export async function transfer(ctx: Ctx, id: string): Promise<Visit> {
  const actor = requireActor(ctx, ['USHER']);
  const visitId = await visitIdOfHandoff(ctx, id);
  return modifyVisit(ctx, visitId, (cur): Out<Visit> => {
    const v = settle(cur, ctx.now);
    if (v.handoff?.id !== id)
      return { visit: v, error: fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.') };
    const r = transferContext(v, actor.id, ctx.now);
    return r.ok
      ? { visit: r.value, value: r.value }
      : { visit: v, error: handoffError(v, 'CONTEXT', r.error) };
  });
}

/** H-04: the only step that changes the owner of the visit. Idempotent for the same receiver. */
export async function confirm(ctx: Ctx, id: string): Promise<Visit> {
  const actor = requireActor(ctx, ['USHER']);
  const visitId = await visitIdOfHandoff(ctx, id);
  const apply = (busy: Set<string>) =>
    modifyVisit(ctx, visitId, (cur): Out<Visit> => {
      const v = settle(cur, ctx.now);
      if (v.handoff?.id !== id)
        return { visit: v, error: fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.') };
      // The contract (H-04) confirms only after the context was received, although the machine
      // would treat an accepted handoff as an implicit transfer.
      if (v.handoff.state === 'ACCEPTED' && v.handoff.toId === actor.id) {
        return { visit: v, error: handoffError(v, 'CONFIRM', 'INVALID_STATE') };
      }
      // Recomputed right before the write: the receiver must not have taken another visit meanwhile.
      if (
        v.handoff.state === 'CONTEXT_TRANSFERRED' &&
        v.handoff.toId === actor.id &&
        busy.has(actor.id)
      )
        return { visit: v, error: fail('RECEIVER_BUSY', 'El receptor ya tiene una tarea activa.') };
      const r = confirmHandoffMachine(v, actor.id, ctx.now);
      return r.ok
        ? { visit: r.value, value: r.value }
        : { visit: v, error: handoffError(v, 'CONFIRM', r.error) };
    });
  return leased(ctx, actor.id, visitId, id, 'CONTEXT_TRANSFERRED', apply);
}

/** H-08: the giver, the receiver (once accepted) or an operator cancels. Idempotent. */
export async function cancel(ctx: Ctx, id: string, body: HandoffCancelRequest): Promise<Visit> {
  const actor = requireActor(ctx, ['USHER', 'ROBOT', 'OPERATOR']);
  const visitId = await visitIdOfHandoff(ctx, id);
  return modifyVisit(ctx, visitId, (cur): Out<Visit> => {
    const v = settle(cur, ctx.now);
    const h = v.handoff;
    if (!h || h.id !== id)
      return { visit: v, error: fail('HANDOFF_NOT_FOUND', 'No existe el relevo indicado.') };
    const operator = actorKind(actor) === 'OPERATOR';
    // The machine accepts the owner, the receiver or `system`; an operator acts as `system`.
    const by = operator ? 'system' : actor.id;
    const reason: HandoffCancelReason =
      body.cancelReason ??
      (operator ? 'OPERATOR' : actor.id === h.toId ? 'RECEIVER_UNAVAILABLE' : 'SUPERSEDED');
    const r = cancelHandoffMachine(v, by, ctx.now, reason);
    return r.ok
      ? { visit: r.value, value: r.value }
      : { visit: v, error: handoffError(v, 'CANCEL', r.error) };
  });
}
