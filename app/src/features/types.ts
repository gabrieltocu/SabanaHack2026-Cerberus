// View models shared by the presentation components. They carry already-formatted display
// data, so components never fetch, format dates or know the API.
import type { Category } from '../domain/entities/types';
import type { HandoffState } from '../domain/entities/visit';
import type { CopyVars } from './orientation/copy';

export type ClassificationView =
  | { state: 'CONFIRMED'; name: string; category: Category; evidence: string }
  /** `code` is a stable catalog code (messages.ts), e.g. `RECOGNITION_UNKNOWN`. */
  | { state: 'MANUAL_REVIEW'; code: string; vars?: CopyVars }
  | { state: 'DENIED'; code: string; vars?: CopyVars };

export type Profile = {
  /** Directory id (`V-201`, `U-02`, `R1`). */
  id: string;
  /** First name, as the cards show it. */
  name: string;
  /** Secondary text: «Socio VIP», «Edecán»... */
  roleLabel: string;
  category?: Category;
  /** Route the card opens. */
  href: string;
};

export type Activity = {
  id: string;
  name: string;
  place: string;
  /** Display time, e.g. `4:00 p. m.` */
  time: string;
  /** Machine-readable `HH:MM` for the `<time>` element. */
  dateTime: string;
  capacity?: string;
};

export type InvitationStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';

export type InvitationSummary = {
  id: string;
  guestName: string;
  /** Display date, e.g. `sáb 24 oct 2026`. */
  dateLabel: string;
  meetingPoint: string;
  status: InvitationStatus;
  token?: string;
};

export type PassStatus = 'VALID' | 'NOT_YET_VALID' | 'EXPIRED' | 'USED' | 'REVOKED' | 'NOT_FOUND';

export type PassView = {
  /** Opaque code encoded in the QR. */
  token: string;
  /** First name only. */
  guestName: string;
  hostName: string;
  meetingPoint: string;
  /** `Válido el sáb 24 oct 2026` */
  validityLabel: string;
  /** Spoken date for the screen-reader announcement, e.g. `sábado 24 de octubre`. */
  spokenDate: string;
  status: PassStatus;
  /** Display date for `NOT_YET_VALID`. */
  fromLabel?: string;
};

export type HandoffTask = {
  id: string;
  visitorName: string;
  category: Category;
  fromName: string;
  toName: string;
  destination: string;
  lastPoint?: string;
  reason: string;
  /** `HH:MM` strings, already in America/Bogota. */
  requestedAt: string;
  expiresAt: string;
  state: HandoffState;
  simulated?: boolean;
};

export type HandoffContextData = {
  visitorName: string;
  category: Category;
  reference?: string;
  destination: string;
  permissions: readonly string[];
  preferences: readonly string[];
  lastPoint?: string;
  progress: string;
};

/** Short, human-readable state of a visit as the member sees it. */
export type VisitSummary = {
  id: string;
  reference: string;
  destination: string;
  statusLabel: string;
  statusKind: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  responsible?: string;
  /** `true` when a presenter action (robot failure) produced this state. */
  simulated?: boolean;
  closed?: boolean;
  feedbackSent?: boolean;
};

/** What `/socio` shows about the member: header, today's line, visit and invitations. */
export type MemberView = {
  profile: Profile;
  badgeLabel: string;
  today: string;
  visit?: VisitSummary;
  invitations: readonly InvitationSummary[];
};
