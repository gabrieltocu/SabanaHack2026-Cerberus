// Confirms the recognition hint against club records (docs/adr/0003-facial-classification.md).
// The face alone never authorizes: every CONFIRMED result is backed by a record valid at `now`,
// and doubt ends in MANUAL_REVIEW, never in access. First rule that applies decides.
import type {
  ClassificationResult,
  ClubRecords,
  DenialReason,
  Invitation,
  ManualReviewReason,
  RecognitionResult,
} from '../entities/types';
import { activeShift, invitationStatusAt, isMembershipActive, permitStatus } from './permissions';
import { checkPass, type PassCheck } from './qr-token';

const DEFAULT_MIN_CONFIDENCE = 0.8;

const review = (reason: ManualReviewReason): ClassificationResult => ({
  state: 'MANUAL_REVIEW',
  reason,
});
const denied = (reason: DenialReason): ClassificationResult => ({ state: 'DENIED', reason });

export const QR_DENIAL: Record<Extract<PassCheck, { ok: false }>['code'], DenialReason> = {
  MALFORMED: 'QR_UNKNOWN',
  UNKNOWN: 'QR_UNKNOWN',
  REVOKED: 'QR_REVOKED',
  USED: 'QR_ALREADY_USED',
  NOT_YET_VALID: 'QR_NOT_YET_VALID',
  EXPIRED: 'QR_EXPIRED',
};

const INVITATION_DENIAL = {
  NOT_YET: 'QR_NOT_YET_VALID',
  EXPIRED: 'QR_EXPIRED',
  CANCELLED: 'QR_REVOKED',
  USED: 'QR_ALREADY_USED',
} as const;

/** Rule 4 of the ADR: a QR presented with a NON_MEMBER hint and no candidate. */
function classifyQr(token: string, invitations: Invitation[], now: Date): ClassificationResult {
  const invitation = invitations.find((i) => i.pass?.token === token);
  const check = checkPass(
    invitation?.pass ? { ...invitation.pass, invitationId: invitation.id } : null,
    token,
    now,
  );
  if (!check.ok) return denied(QR_DENIAL[check.code]);
  return {
    state: 'CONFIRMED',
    category: 'GUEST',
    evidence: ['INVITATION_QR_VALID'],
    invitationId: invitation!.id,
    ...(invitation!.meetingPoint ? { suggestedDestination: invitation!.meetingPoint } : {}),
  };
}

export function classify(
  recognition: RecognitionResult,
  records: ClubRecords,
  now: Date,
  opts: { minConfidence?: number; qrToken?: string } = {},
): ClassificationResult {
  if (recognition.status === 'ERROR') return review('FACE_ERROR');
  if (recognition.status === 'UNKNOWN') return review('FACE_UNKNOWN');

  const { classHint, candidateId, confidence } = recognition;
  // Negated comparisons: NaN, Infinity or anything outside [min, 1] fails closed.
  const min = Number.isFinite(opts.minConfidence) ? opts.minConfidence! : DEFAULT_MIN_CONFIDENCE;
  if (confidence !== undefined && !(confidence >= min && confidence <= 1)) {
    return review('LOW_CONFIDENCE');
  }

  if (!candidateId) {
    if (classHint === 'MEMBER') return review('CANDIDATE_NOT_FOUND');
    // With a NON_MEMBER hint and no candidate only a valid QR confirms (a MEMBER hint ignores it).
    return opts.qrToken === undefined
      ? review('NO_EVIDENCE')
      : classifyQr(opts.qrToken, records.invitations, now);
  }
  const person = records.people.find((p) => p.id === candidateId);
  if (!person) return review('CANDIDATE_NOT_FOUND');

  const record = records.memberships.find((m) => m.personId === candidateId);
  const shift = activeShift(records.shifts, candidateId, now);
  const staffRecord =
    person.kind === 'STAFF' || records.shifts.some((s) => s.personId === candidateId);

  if (classHint === 'MEMBER') {
    if (!record) return review('FACE_REGISTRY_MISMATCH');
    if (record.status === 'SUSPENDED') return denied('MEMBERSHIP_SUSPENDED');
    if (!isMembershipActive(record, now)) return review('MEMBERSHIP_EXPIRED');
    if (shift) return review('DUAL_ROLE');
    return {
      state: 'CONFIRMED',
      category: record.tier,
      personId: candidateId,
      evidence: ['MEMBERSHIP_ACTIVE'],
      ...(person.defaultDestination ? { suggestedDestination: person.defaultDestination } : {}),
    };
  }

  // NON_MEMBER hint contradicted by a membership record: a human decides.
  if (record) return review('FACE_REGISTRY_MISMATCH');

  if (staffRecord) {
    if (!shift) return review('STAFF_OUTSIDE_SHIFT');
    return {
      state: 'CONFIRMED',
      category: 'STAFF',
      personId: candidateId,
      evidence: ['STAFF_SHIFT_ACTIVE'],
      suggestedDestination: person.defaultDestination ?? shift.area,
    };
  }

  const permits = records.permits
    .filter((p) => p.personId === candidateId)
    .map((permit) => ({ permit, status: permitStatus(permit, now) }));
  const validPermit = permits.find((p) => p.status === 'ACTIVE');
  if (validPermit) {
    return {
      state: 'CONFIRMED',
      category: 'EXTERNAL',
      personId: candidateId,
      evidence: ['EXTERNAL_PERMIT_ACTIVE'],
      suggestedDestination: validPermit.permit.meetingPoint,
    };
  }
  // No valid permit: a valid invitation may still apply; otherwise the permit explains the denial.
  const hasExpiredPermit = permits.length > 0;

  // Consented demo guest profile: the invitation, not the face, is the evidence. Most recent first.
  const invitations = records.invitations
    .filter((i) => i.guestPersonId === candidateId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((invitation) => ({ invitation, status: invitationStatusAt(invitation, now) }));
  const validInvitation = invitations.find((i) => i.status === 'VALID');
  if (validInvitation) {
    const { invitation } = validInvitation;
    return {
      state: 'CONFIRMED',
      category: 'GUEST',
      personId: candidateId,
      evidence: ['INVITATION_ACTIVE'],
      invitationId: invitation.id,
      ...(invitation.meetingPoint ? { suggestedDestination: invitation.meetingPoint } : {}),
    };
  }
  if (hasExpiredPermit) return denied('EXTERNAL_PERMIT_OUTSIDE_WINDOW');
  const closest = invitations[0];
  if (closest && closest.status !== 'VALID') return denied(INVITATION_DENIAL[closest.status]);

  return review('NO_EVIDENCE');
}
