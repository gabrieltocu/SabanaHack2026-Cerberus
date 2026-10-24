// Arrival: the facial signal (`POST /recognition/events`) and the QR check-in (`POST /access/verify`).
// The face alone never authorizes (ADR 0003): every confirmation is backed by a club record.
import type {
  ClassificationResult,
  DenialReason,
  RecognitionResult,
} from '../domain/entities/types';
import type { Visit } from '../domain/entities/visit';
import { classify, QR_DENIAL } from '../domain/policies/classify';
import { checkPass, isWellFormedToken } from '../domain/policies/qr-token';
import {
  applyClassification,
  closeVisit,
  toInstant,
  transitionVisit,
} from '../domain/policies/visit-machine';
import type {
  AccessVerifyRequest,
  AccessVerifyResponse,
  RecognitionEventRequest,
  RecognitionEventResponse,
} from '../infrastructure/contracts';
import { findPerson, requireActor } from './directory';
import { fail } from './errors';
import { allInvitations } from './invitations';
import { invitationDto, visitDto } from './present';
import {
  MAX_ATTEMPTS,
  indexVisit,
  listVisits,
  modifyVisit,
  newId,
  readVisit,
  settle,
  visitKey,
  type Ctx,
} from './repo';

const OPEN_STATES: Visit['state'][] = [
  'VERIFIED',
  'ORIENTING',
  'IN_PROGRESS',
  'WAITING_HANDOFF',
  'MANUAL_REVIEW',
];

/** Who takes the arrival at the door: the robot or usher that scanned, otherwise reception (R1). */
function receiverOf(ctx: Ctx): string {
  const actor = findPerson(ctx.seed, ctx.actor);
  return actor && (actor.kind === 'ROBOT' || actor.kind === 'ATTENDANT') ? actor.id : 'R1';
}

export async function verifyAccess(
  ctx: Ctx,
  body: AccessVerifyRequest,
): Promise<AccessVerifyResponse> {
  const actor = requireActor(ctx, ['ROBOT', 'USHER', 'OPERATOR']);
  const { token } = body;
  let review: Visit | undefined;
  if (body.visitId) {
    review = await readVisit(ctx, body.visitId);
    if (review.state !== 'MANUAL_REVIEW' || review.invitation) {
      throw fail(
        'INVALID_TRANSITION',
        'La visita indicada no está en revisión manual sin invitación.',
        {
          state: review.state,
          event: 'MERGED',
        },
      );
    }
  }
  const idx = isWellFormedToken(token)
    ? await ctx.store.get<{ visitId: string }>(`qr:${token}`)
    : null;
  if (!idx) return { decision: 'DENIED', reason: 'QR_UNKNOWN' };

  const owner = receiverOf(ctx);
  const result = await modifyVisit<{ granted: Visit } | { denied: DenialReason }>(
    ctx,
    idx.value.visitId,
    (cur) => {
      const v = settle(cur, ctx.now);
      const inv = v.invitation;
      const check = checkPass(
        inv?.pass ? { ...inv.pass, invitationId: inv.id } : null,
        token,
        ctx.now,
      );
      if (!check.ok || !inv)
        return { visit: v, value: { denied: QR_DENIAL[check.ok ? 'UNKNOWN' : check.code] } };
      const moved = transitionVisit(v, 'VERIFIED', owner, ctx.now, 'qr-verified');
      if (!moved.ok) {
        return {
          visit: v,
          error: fail('INVALID_TRANSITION', 'La visita esperada no admite el check-in.', {
            state: v.state,
            event: 'QR_VERIFIED',
          }),
        };
      }
      const destination = inv.meetingPoint ?? v.destination;
      const next: Visit = {
        ...moved.value,
        // The expected visit was created days ago: its open day starts at the check-in (V-23).
        openedAt: toInstant(ctx.now),
        category: 'GUEST',
        classification: {
          state: 'CONFIRMED',
          category: 'GUEST',
          evidence: ['INVITATION_QR_VALID'],
          ...(inv.meetingPoint ? { suggestedDestination: inv.meetingPoint } : {}),
        },
        ownerId: owner,
        ...(destination ? { destination } : {}),
        ...(review?.recognition ? { recognition: review.recognition } : {}),
        invitation: { ...inv, status: 'USED', pass: { ...inv.pass!, usedAt: toInstant(ctx.now) } },
      };
      return { visit: next, value: { granted: next } };
    },
  );
  if ('denied' in result) return { decision: 'DENIED', reason: result.denied };

  if (review) {
    const reviewId = review.id;
    // Best effort after the invitation was consumed: a conflict here only leaves the review open.
    await modifyVisit(ctx, reviewId, (r) => {
      const closed = closeVisit(r, actor.id, ctx.now, 'merged', 'MERGED');
      return closed.ok ? { visit: closed.value, value: null } : { visit: r, value: null };
    }).catch(() => null);
  }
  return {
    decision: 'GRANTED',
    visit: visitDto(result.granted),
    invitation: invitationDto(result.granted.invitation!, ctx.now),
  };
}

/** Marks the invitation-backed expected visit as the arrival (V-02 + V-05 in one write). */
async function claimInvitation(
  ctx: Ctx,
  result: Extract<ClassificationResult, { state: 'CONFIRMED' }>,
  invitationVisitId: string,
  body: RecognitionEventRequest,
  face: RecognitionResult,
): Promise<Visit | 'RACE'> {
  const owner = body.source.id;
  return modifyVisit<Visit | 'RACE'>(ctx, invitationVisitId, (cur) => {
    const v = settle(cur, ctx.now);
    const inv = v.invitation;
    if (!inv || inv.status !== 'ACTIVE' || v.state !== 'EXPECTED')
      return { visit: v, value: 'RACE' };
    const moved = transitionVisit(v, 'VERIFIED', owner, ctx.now, 'recognition');
    if (!moved.ok) return { visit: v, value: 'RACE' };
    const destination = result.suggestedDestination ?? v.destination;
    const next: Visit = {
      ...moved.value,
      openedAt: toInstant(ctx.now),
      category: 'GUEST',
      classification: result,
      ownerId: owner,
      entry: result.personId ? 'FACE' : 'QR',
      ...(result.personId ? { personId: result.personId } : {}),
      ...(destination ? { destination } : {}),
      recognition: recognitionRecord(ctx, body, face),
      invitation: { ...inv, status: 'USED', pass: { ...inv.pass!, usedAt: toInstant(ctx.now) } },
    };
    return { visit: next, value: next };
  });
}

function recognitionRecord(ctx: Ctx, body: RecognitionEventRequest, face: RecognitionResult) {
  return {
    source: body.source,
    simulated: body.source.kind === 'SIMULATOR',
    face,
    confidence: face.status === 'MATCH' ? (face.confidence ?? null) : null,
    observedAt: toInstant(body.observedAt ? new Date(body.observedAt) : ctx.now),
  };
}

export async function recognize(
  ctx: Ctx,
  body: RecognitionEventRequest,
): Promise<{ status: 200 | 201; body: RecognitionEventResponse }> {
  const actor = requireActor(ctx, ['ROBOT', 'OPERATOR']);
  // The source becomes the owner of the visit: it must be a real robot and, unless an operator
  // reports on its behalf, the robot that is calling.
  const source = findPerson(ctx.seed, body.source.id);
  if (source?.kind !== 'ROBOT' || (actor.kind === 'ROBOT' && actor.id !== source.id))
    throw fail('ACTOR_NOT_ALLOWED', 'El origen del evento no corresponde al actor.');
  const face: RecognitionResult = body.face;
  let visits = await listVisits(ctx);

  // INV-15: a person already identified has at most one open visit; the event returns it.
  const matched = (open: Visit) => {
    const dto = visitDto(open);
    return {
      status: 200 as const,
      body: { visit: dto, classification: dto.classification!, matchedOpenVisit: true },
    };
  };
  const openOf = (list: Visit[]) =>
    face.status === 'MATCH' && face.candidateId
      ? list.find((v) => v.personId === face.candidateId && OPEN_STATES.includes(v.state))
      : undefined;
  const open = openOf(visits);
  if (open) return matched(open);

  let invitations = await allInvitations(ctx, visits);
  for (let pass = 0; pass < 2; pass++) {
    const result = classify(
      face,
      { ...ctx.seed, invitations },
      ctx.now,
      body.evidence?.qrToken === undefined ? {} : { qrToken: body.evidence.qrToken },
    );
    if (result.state === 'CONFIRMED' && result.invitationId) {
      const target = invitations.find((i) => i.id === result.invitationId)!;
      const claimed = await claimInvitation(ctx, result, target.visitId!, body, face);
      if (claimed !== 'RACE') {
        const dto = visitDto(claimed);
        return {
          status: 201,
          body: { visit: dto, classification: dto.classification!, matchedOpenVisit: false },
        };
      }
      // Someone used the invitation first: look again at the fresh records (that same arrival may
      // already be the open visit of this person).
      visits = await listVisits(ctx);
      const raced = openOf(visits);
      if (raced) return matched(raced);
      invitations = await allInvitations(ctx, visits);
      continue;
    }
    return await openArrival(ctx, body, face, result);
  }
  throw fail('VERSION_CONFLICT', 'La invitación cambió mientras se procesaba; reintenta.');
}

/**
 * V-03 + V-05/06/07: a new visit is created already classified, in one write. A confirmed person is
 * first reserved in `person:<id>` with the id of the visit about to exist, so simultaneous events of
 * the same person end up writing the same `visit:<id>` and only one of them creates it (INV-15).
 */
async function openArrival(
  ctx: Ctx,
  body: RecognitionEventRequest,
  face: RecognitionResult,
  result: ClassificationResult,
): Promise<{ status: 200 | 201; body: RecognitionEventResponse }> {
  const identifying: Visit = {
    id: newId(ctx, 'vis'),
    state: 'IDENTIFYING',
    entry: 'FACE',
    phase: 0,
    recognition: recognitionRecord(ctx, body, face),
    openedAt: toInstant(ctx.now),
    history: [],
    version: 0,
  };
  const applied = applyClassification(identifying, result, body.source.id, ctx.now);
  if (!applied.ok) throw fail('INTERNAL_ERROR', 'No se pudo clasificar la llegada.');
  let visit = applied.value;
  if (result.state === 'CONFIRMED') {
    const person = findPerson(ctx.seed, result.personId)!;
    visit = {
      ...visit,
      visitorRef: person.id,
      visitorName: person.name,
      ownerId: body.source.id,
      ...(result.suggestedDestination ? { destination: result.suggestedDestination } : {}),
    };
  } else if (result.state === 'DENIED') {
    visit = { ...visit, failureReason: result.reason };
  }
  const reply = (v: Visit, matchedOpenVisit: boolean) => {
    const dto = visitDto(v);
    return {
      status: matchedOpenVisit ? (200 as const) : (201 as const),
      body: { visit: dto, classification: dto.classification!, matchedOpenVisit },
    };
  };

  const personId = result.state === 'CONFIRMED' ? result.personId : undefined;
  if (personId) {
    const key = `person:${personId}`;
    for (let attempt = 0; ; attempt++) {
      if (attempt >= MAX_ATTEMPTS)
        throw fail('VERSION_CONFLICT', 'Demasiadas solicitudes simultáneas.');
      const idx = await ctx.store.get<{ visitId: string }>(key);
      const held = idx ? await ctx.store.get<Visit>(visitKey(idx.value.visitId)) : null;
      if (held) {
        const settled = settle(held.value, ctx.now);
        if (OPEN_STATES.includes(settled.state)) return reply(settled, true);
      }
      // Reserved but not written yet (a twin event is in flight): write that same id.
      const reserved = idx && !held ? idx.value.visitId : undefined;
      if (reserved === undefined) {
        const claimed = await ctx.store.compareAndSet(key, idx?.version ?? 0, {
          visitId: visit.id,
        });
        if (claimed === null) continue;
      } else {
        visit = { ...visit, id: reserved };
      }
      await indexVisit(ctx, visit.id);
      if ((await ctx.store.compareAndSet(visitKey(visit.id), 0, visit)) !== null)
        return reply(visit, false);
      // The twin created it first: that is the open visit.
    }
  }
  await indexVisit(ctx, visit.id);
  if ((await ctx.store.compareAndSet(visitKey(visit.id), 0, visit)) === null) {
    throw fail('VERSION_CONFLICT', 'No se pudo crear la visita; reintenta.');
  }
  return reply(visit, false);
}
