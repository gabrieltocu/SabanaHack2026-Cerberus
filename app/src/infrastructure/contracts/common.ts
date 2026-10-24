/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
// Vocabulario compartido del contrato v1 (docs/api/openapi.yaml). Los tipos exportados con
// `z.infer` son la interfaz que consume la UI; el servidor valida con los mismos esquemas.
import { z } from 'zod';

export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const Category = z.enum(['VIP', 'REGULAR', 'GUEST', 'STAFF', 'EXTERNAL']);
export type Category = z.infer<typeof Category>;

export const PersonRole = z.enum(['MEMBER', 'STAFF', 'EXTERNAL', 'USHER', 'ROBOT', 'OPERATOR']);
export type PersonRole = z.infer<typeof PersonRole>;

export const InvitationState = z.enum(['ACTIVE', 'CANCELLED', 'USED', 'EXPIRED']);
export type InvitationState = z.infer<typeof InvitationState>;

export const VisitState = z.enum([
  'EXPECTED',
  'IDENTIFYING',
  'VERIFIED',
  'ORIENTING',
  'IN_PROGRESS',
  'WAITING_HANDOFF',
  'MANUAL_REVIEW',
  'FAILED',
  'CLOSED',
]);
export type VisitState = z.infer<typeof VisitState>;

export const HandoffState = z.enum([
  'REQUESTED',
  'ACCEPTED',
  'CONTEXT_TRANSFERRED',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED',
]);
export type HandoffState = z.infer<typeof HandoffState>;

export const HandoffReason = z.enum([
  'ROBOT_FAILURE',
  'NETWORK_LOSS',
  'LOW_BATTERY',
  'VISITOR_PREFERENCE',
  'OPERATIONAL',
]);
export type HandoffReason = z.infer<typeof HandoffReason>;

export const HandoffCancelReason = z.enum([
  'VISITOR_DECLINED',
  'RECEIVER_UNAVAILABLE',
  'SUPERSEDED',
  'OPERATOR',
  'VISIT_CLOSED',
  'VISIT_ABORTED',
]);
export type HandoffCancelReason = z.infer<typeof HandoffCancelReason>;

export const ManualReviewReason = z.enum([
  'FACE_UNKNOWN',
  'FACE_ERROR',
  'LOW_CONFIDENCE',
  'NO_EVIDENCE',
  'CANDIDATE_NOT_FOUND',
  'FACE_REGISTRY_MISMATCH',
  'MEMBERSHIP_EXPIRED',
  'STAFF_OUTSIDE_SHIFT',
  'DUAL_ROLE',
]);
export type ManualReviewReason = z.infer<typeof ManualReviewReason>;

export const DenialReason = z.enum([
  'MEMBERSHIP_SUSPENDED',
  'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
  'QR_EXPIRED',
  'QR_NOT_YET_VALID',
  'QR_ALREADY_USED',
  'QR_REVOKED',
  'QR_UNKNOWN',
]);
export type DenialReason = z.infer<typeof DenialReason>;

export const Evidence = z.enum([
  'MEMBERSHIP_ACTIVE',
  'STAFF_SHIFT_ACTIVE',
  'EXTERNAL_PERMIT_ACTIVE',
  // Invitation active for the day of a guest recognized by a consented demo face profile.
  'INVITATION_ACTIVE',
  'INVITATION_QR_VALID',
  'HUMAN_ATTESTATION',
]);
export type Evidence = z.infer<typeof Evidence>;

/** Códigos estables de error (docs/api/CONTRACT.md §2). Forman parte del contrato. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'IDEMPOTENCY_KEY_REQUIRED',
  'UNAUTHENTICATED',
  'ACTOR_NOT_ALLOWED',
  'HOST_NOT_ELIGIBLE',
  'RESET_DISABLED',
  'ROUTE_NOT_FOUND',
  'PERSON_NOT_FOUND',
  'INVITATION_NOT_FOUND',
  'PASS_NOT_FOUND',
  'VISIT_NOT_FOUND',
  'HANDOFF_NOT_FOUND',
  'ROBOT_NOT_FOUND',
  'INVITATION_DUPLICATE',
  'INVITATION_DAILY_LIMIT',
  'INVITATION_NOT_ACTIVE',
  'INVALID_TRANSITION',
  'VERSION_CONFLICT',
  'HANDOFF_ALREADY_OPEN',
  'HANDOFF_ALREADY_ACCEPTED',
  'HANDOFF_EXPIRED',
  'RECEIVER_BUSY',
  'ASSIGNEE_BUSY',
  'FEEDBACK_ALREADY_SUBMITTED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_ERROR',
  'INVITATION_DATE_IN_PAST',
  'IDEMPOTENCY_KEY_REUSED',
  'VISITOR_ACCEPTANCE_REQUIRED',
  'ESCORT_NOT_ALLOWED',
  'REVIEW_NOT_CONFIRMABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'STORAGE_UNAVAILABLE',
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** `{ items, count }` de todas las listas del contrato. */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), count: z.number().int().min(0) });
