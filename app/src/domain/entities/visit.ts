// Visit and handoff entities. Pure types: no React, Expo, fetch or platform imports.
import type {
  Category,
  ClassificationResult,
  Instant,
  Invitation,
  RecognitionResult,
} from './types';

export type VisitState =
  | 'EXPECTED'
  | 'IDENTIFYING'
  | 'VERIFIED'
  | 'ORIENTING'
  | 'IN_PROGRESS'
  | 'WAITING_HANDOFF'
  | 'MANUAL_REVIEW'
  | 'FAILED'
  | 'CLOSED';

export type CloseReason = 'EXIT' | 'INVITATION_CANCELLED' | 'NO_SHOW' | 'MERGED' | 'DAY_ROLLOVER';

export interface VisitHistoryEntry {
  at: Instant;
  from: VisitState;
  to: VisitState;
  by: string;
  note?: string;
}

export interface VisitFeedback {
  /** 1..5 */
  robot?: number;
  /** 1..5 */
  club?: number;
  comment?: string;
  clubComment?: string;
  createdAt?: Instant;
}

/** The facial signal as received, kept without images or templates (only status, hint, id, score). */
export interface RecognitionRecord {
  source: { kind: 'ROBOT' | 'SIMULATOR'; id: string };
  simulated: boolean;
  face: RecognitionResult;
  confidence: number | null;
  observedAt: Instant;
}

export interface Visit {
  id: string;
  personId?: string;
  /** Short reference of the visitor (`V-201`, `G-3c91aa07`). */
  visitorRef?: string;
  visitorName?: string;
  category?: Category;
  state: VisitState;
  /** Current responsible party (`R1`, `U-02`…). Unset until verified; only changes when a handoff is confirmed. */
  ownerId?: string;
  destination?: string;
  /** Index 0..9 into the ten visit phases. */
  phase: number;
  entry: 'FACE' | 'QR' | 'HUMAN';
  classification?: ClassificationResult;
  recognition?: RecognitionRecord;
  /** The invitation that announced this visit, embedded so both change in one write. */
  invitation?: Invitation;
  openedAt: Instant;
  arrivedAt?: Instant;
  closedAt?: Instant;
  closeReason?: CloseReason;
  /** Denial reason, `REVIEW_DENIED` or `ABORTED_BY_OPERATOR`. */
  failureReason?: string;
  feedback?: VisitFeedback;
  /** The open handoff, or the last closed one. Embedded so visit and handoff change in one write. */
  handoff?: Handoff;
  history: VisitHistoryEntry[];
  /** Optimistic-concurrency counter, incremented on every change (also of the embedded handoff). */
  version: number;
}

export type HandoffState =
  'REQUESTED' | 'ACCEPTED' | 'CONTEXT_TRANSFERRED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export type HandoffReason =
  'ROBOT_FAILURE' | 'NETWORK_LOSS' | 'LOW_BATTERY' | 'VISITOR_PREFERENCE' | 'OPERATIONAL';

export type HandoffCancelReason =
  | 'VISITOR_DECLINED'
  | 'RECEIVER_UNAVAILABLE'
  | 'SUPERSEDED'
  | 'OPERATOR'
  | 'VISIT_CLOSED'
  | 'VISIT_ABORTED';

export interface HandoffContext {
  destination?: string;
  category?: Category;
  personName?: string;
  notes?: string;
}

export interface Handoff {
  id: string;
  visitId: string;
  fromId: string;
  toId?: string;
  reason: HandoffReason;
  state: HandoffState;
  requestedAt: Instant;
  expiresAt: Instant;
  acceptedAt?: Instant;
  contextTransferredAt?: Instant;
  confirmedAt?: Instant;
  cancelledAt?: Instant;
  cancelReason?: HandoffCancelReason;
  /** Who asked (the owner or an operator) and whom they would prefer. */
  requestedBy?: string;
  preferredToId?: string;
  lastKnownPoint?: string;
  context: HandoffContext;
}
