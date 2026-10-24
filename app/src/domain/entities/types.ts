// Shared domain vocabulary. Pure types: no React, Expo, fetch or platform imports.
// Identifiers, reasons and evidence use the same vocabulary as the public API contract.

export type Category = 'VIP' | 'REGULAR' | 'GUEST' | 'STAFF' | 'EXTERNAL';

export type PersonKind =
  'MEMBER' | 'STAFF' | 'ATTENDANT' | 'ROBOT' | 'GUEST' | 'EXTERNAL' | 'OPERATOR';

/** ISO-8601 instant, always with offset (e.g. `2026-10-24T09:00:00-05:00`). */
export type Instant = string;
/** Local calendar date in America/Bogota, `YYYY-MM-DD`. */
export type LocalDate = string;
/** Local wall time in America/Bogota, `HH:MM` 24 h. */
export type LocalTime = string;

export interface Person {
  /** Directory id: `V-201`, `U-02`, `R1`, `O-01`. */
  id: string;
  name: string;
  kind: PersonKind;
  preferences?: string;
  /** Where the club usually takes this person (their reservation or work area). */
  defaultDestination?: string;
}

export interface Membership {
  personId: string;
  tier: 'VIP' | 'REGULAR';
  status: 'ACTIVE' | 'SUSPENDED';
  validFrom: LocalDate;
  validTo: LocalDate;
}

export interface Shift {
  personId: string;
  start: Instant;
  end: Instant;
  area: string;
}

export interface ExternalPermit {
  /** Work order code, e.g. `OT-0412`. */
  id: string;
  personId: string;
  sponsorId: string;
  company: string;
  purpose: string;
  meetingPoint: string;
  /** 0 = Sunday … 6 = Saturday, evaluated in America/Bogota. */
  weekdays: number[];
  from: LocalTime;
  to: LocalTime;
  validFrom: LocalDate;
  validTo: LocalDate;
}

export type InvitationStatus = 'ACTIVE' | 'CANCELLED' | 'USED' | 'EXPIRED';

/** Opaque one-use pass attached to an invitation (see `policies/qr-token.ts`). */
export interface InvitationPass {
  token: string;
  validFrom: Instant;
  validTo: Instant;
  usedAt?: Instant;
  revokedAt?: Instant;
}

export interface Invitation {
  id: string;
  hostId: string;
  /** First name of the host, kept for the kiosk to say who expects the guest. */
  hostName?: string;
  guestName: string;
  /** Present when the guest already has a record (e.g. a consented demo face profile). */
  guestPersonId?: string;
  /** Guest reference assigned by the server (`G-…`, or the demo profile id). */
  guestRef?: string;
  guestContact?: string;
  date: LocalDate;
  windowFrom: LocalTime;
  windowTo: LocalTime;
  status: InvitationStatus;
  meetingPoint?: string;
  preferences?: string;
  createdAt: Instant;
  cancelledAt?: Instant;
  visitId?: string;
  pass?: InvitationPass;
}

/** Snapshot of authoritative club records used by pure policies. */
export interface ClubRecords {
  people: Person[];
  memberships: Membership[];
  shifts: Shift[];
  permits: ExternalPermit[];
  invitations: Invitation[];
}

export type RecognitionResult =
  | {
      status: 'MATCH';
      classHint: 'MEMBER' | 'NON_MEMBER';
      candidateId?: string;
      confidence?: number;
    }
  | { status: 'UNKNOWN' }
  | { status: 'ERROR'; code: string };

export type Evidence =
  | 'MEMBERSHIP_ACTIVE'
  | 'STAFF_SHIFT_ACTIVE'
  | 'EXTERNAL_PERMIT_ACTIVE'
  | 'INVITATION_ACTIVE'
  | 'INVITATION_QR_VALID'
  | 'HUMAN_ATTESTATION';

export type ManualReviewReason =
  | 'FACE_UNKNOWN'
  | 'FACE_ERROR'
  | 'LOW_CONFIDENCE'
  | 'NO_EVIDENCE'
  | 'CANDIDATE_NOT_FOUND'
  | 'FACE_REGISTRY_MISMATCH'
  | 'MEMBERSHIP_EXPIRED'
  | 'STAFF_OUTSIDE_SHIFT'
  | 'DUAL_ROLE';

export type DenialReason =
  | 'MEMBERSHIP_SUSPENDED'
  | 'EXTERNAL_PERMIT_OUTSIDE_WINDOW'
  | 'QR_EXPIRED'
  | 'QR_NOT_YET_VALID'
  | 'QR_ALREADY_USED'
  | 'QR_REVOKED'
  | 'QR_UNKNOWN';

export type ClassificationResult =
  | {
      state: 'CONFIRMED';
      category: Category;
      /** The identified person; absent for a guest admitted only by an invitation QR. */
      personId?: string;
      /** The invitation that backs a GUEST confirmation, so the caller can mark it used. */
      invitationId?: string;
      evidence: Evidence[];
      /** Where the records say this person goes (reservation, work area, meeting point). */
      suggestedDestination?: string;
    }
  | { state: 'MANUAL_REVIEW'; reason: ManualReviewReason }
  | { state: 'DENIED'; reason: DenialReason };

export interface Clock {
  now(): Date;
}
