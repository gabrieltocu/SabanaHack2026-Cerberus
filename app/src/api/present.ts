// Domain entities -> wire format of docs/api/CONTRACT.md. The domain stores UTC instants and its own
// vocabulary; here instants become Bogotá-offset ISO and optional fields become explicit nulls.
import type { Handoff, Visit, VisitState } from '../domain/entities/visit';
import type { Invitation } from '../domain/entities/types';
import { ACCEPTED_TTL_SECONDS } from '../domain/policies/handoff-machine';
import { invitationStatusAt } from '../domain/policies/permissions';
import type {
  Handoff as HandoffDto,
  HandoffContext as HandoffContextDto,
  Invitation as InvitationDto,
  Pass as PassDto,
  Visit as VisitDto,
} from '../infrastructure/contracts';
import { bogotaIso, bogotaIsoOrNull } from './time';

/** State the visit had before WAITING_HANDOFF; null in any other state. */
export function resumeStateOf(v: Visit): VisitState | null {
  if (v.state !== 'WAITING_HANDOFF') return null;
  const opened = [...v.history]
    .reverse()
    .find((e) => e.to === 'WAITING_HANDOFF' && e.from !== 'WAITING_HANDOFF');
  return opened?.from ?? null;
}

const OPEN_HANDOFF = ['REQUESTED', 'ACCEPTED', 'CONTEXT_TRANSFERRED'];
export const openHandoff = (v: Visit): Handoff | undefined =>
  v.handoff && OPEN_HANDOFF.includes(v.handoff.state) ? v.handoff : undefined;

export function visitDto(v: Visit): VisitDto {
  const c = v.classification;
  const r = v.recognition;
  return {
    id: v.id,
    state: v.state,
    category: v.category ?? null,
    visitor: {
      ref: v.visitorRef ?? null,
      personId: v.personId ?? null,
      displayName: v.visitorName ?? 'Visitante sin identificar',
    },
    destination: v.destination ?? null,
    ownerId: v.ownerId ?? null,
    resumeState: resumeStateOf(v),
    classification: c
      ? c.state === 'CONFIRMED'
        ? {
            state: 'CONFIRMED',
            category: c.category,
            evidence: c.evidence,
            suggestedDestination: c.suggestedDestination ?? null,
          }
        : c
      : null,
    recognition: r
      ? {
          source: r.source,
          simulated: r.simulated,
          face: r.face,
          confidence: r.confidence,
          observedAt: bogotaIso(r.observedAt),
        }
      : null,
    invitationId: v.invitation?.id ?? null,
    hostName: v.invitation?.hostName ?? null,
    openHandoffId: openHandoff(v)?.id ?? null,
    arrivedAt: bogotaIsoOrNull(v.arrivedAt),
    closedAt: bogotaIsoOrNull(v.closedAt),
    closeReason: v.closeReason ?? null,
    failureReason: (v.failureReason as VisitDto['failureReason']) ?? null,
    feedbackSubmitted: v.feedback !== undefined,
    createdAt: bogotaIso(v.openedAt),
    updatedAt: bogotaIso(v.history.at(-1)?.at ?? v.openedAt),
    version: v.version,
  };
}

/** Effective state: `EXPIRED` is derived when the window ended and the invitation was never used. */
export function invitationState(inv: Invitation, now: Date): InvitationDto['state'] {
  const s = invitationStatusAt(inv, now);
  return s === 'VALID' || s === 'NOT_YET' ? 'ACTIVE' : s;
}

export function invitationDto(inv: Invitation, now: Date): InvitationDto {
  const pass = inv.pass!;
  return {
    id: inv.id,
    hostId: inv.hostId,
    guest: {
      fullName: inv.guestName,
      ...(inv.guestContact ? { contact: inv.guestContact } : {}),
      ...(inv.preferences ? { note: inv.preferences } : {}),
      ref: inv.guestRef ?? inv.id,
    },
    meetingPoint: inv.meetingPoint ?? null,
    date: inv.date,
    window: { from: inv.windowFrom, to: inv.windowTo },
    state: invitationState(inv, now),
    qr: {
      token: pass.token,
      validFrom: bogotaIso(pass.validFrom),
      validTo: bogotaIso(pass.validTo),
      usedAt: bogotaIsoOrNull(pass.usedAt),
      revokedAt: bogotaIsoOrNull(pass.revokedAt),
    },
    visitId: inv.visitId ?? '',
    createdAt: bogotaIso(inv.createdAt),
    cancelledAt: bogotaIsoOrNull(inv.cancelledAt),
  };
}

/** The guest's view of an invitation: no ids, contact, note or surnames (the token is the credential). */
export function passDto(inv: Invitation, hostName: string, now: Date): PassDto {
  const pass = inv.pass!;
  const s = invitationStatusAt(inv, now);
  return {
    guestFirstName: inv.guestName.trim().split(/\s+/)[0] ?? inv.guestName,
    hostShortName: hostName.trim().split(/\s+/)[0] ?? hostName,
    meetingPoint: inv.meetingPoint ?? null,
    date: inv.date,
    window: { from: inv.windowFrom, to: inv.windowTo },
    state: s === 'VALID' ? 'ACTIVE' : s === 'NOT_YET' ? 'NOT_YET_VALID' : s,
    qr: {
      token: pass.token,
      validFrom: bogotaIso(pass.validFrom),
      validTo: bogotaIso(pass.validTo),
    },
  };
}

/** "Andrés Mejía" -> "Andrés M.": the panel never shows the full name before the handoff is accepted. */
export function shortName(name: string | undefined): string {
  const [first, second] = (name ?? 'Visitante').split(' ');
  return second ? `${first} ${second.charAt(0)}.` : (first ?? 'Visitante');
}

/** The handoff number is 1 plus the history entries that mention it (accept, context, confirm, end). */
const handoffVersion = (v: Visit, h: Handoff) =>
  1 + v.history.filter((e) => e.note?.endsWith(`:${h.id}`)).length;

export function handoffDto(v: Visit): HandoffDto {
  const h = v.handoff!;
  const deadline = h.acceptedAt
    ? new Date(Date.parse(h.acceptedAt) + ACCEPTED_TTL_SECONDS * 1000)
    : h.expiresAt;
  return {
    id: h.id,
    visitId: h.visitId,
    state: h.state,
    reason: h.reason,
    fromId: h.fromId,
    toId: h.toId ?? null,
    preferredToId: h.preferredToId ?? null,
    requestedBy: h.requestedBy ?? h.fromId,
    note: h.context.notes ?? null,
    summary: {
      visitorName: shortName(h.context.personName ?? v.visitorName),
      category: h.context.category ?? v.category ?? 'GUEST',
      destination: h.context.destination ?? v.destination ?? null,
      lastKnownPoint: h.lastKnownPoint ?? null,
    },
    createdAt: bogotaIso(h.requestedAt),
    expiresAt: bogotaIso(deadline),
    acceptedAt: bogotaIsoOrNull(h.acceptedAt),
    contextTransferredAt: bogotaIsoOrNull(h.contextTransferredAt),
    confirmedAt: bogotaIsoOrNull(h.confirmedAt),
    cancelledAt: bogotaIsoOrNull(h.cancelledAt),
    cancelReason: h.cancelReason ?? null,
    version: handoffVersion(v, h),
  };
}

export function contextDto(v: Visit, preferences: string[]): HandoffContextDto {
  const c = v.classification;
  return {
    visitId: v.id,
    visitor: visitDto(v).visitor,
    category: v.category ?? 'GUEST',
    destination: v.destination ?? null,
    preferences,
    progress: {
      state: resumeStateOf(v) ?? v.state,
      arrivedAt: bogotaIsoOrNull(v.arrivedAt),
      lastKnownPoint: v.handoff?.lastKnownPoint ?? null,
    },
    evidence: c?.state === 'CONFIRMED' ? c.evidence : [],
    note: v.handoff?.context.notes ?? null,
  };
}
