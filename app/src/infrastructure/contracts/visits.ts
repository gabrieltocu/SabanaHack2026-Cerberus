/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import {
  Category,
  DenialReason,
  Evidence,
  IsoDateTime,
  ManualReviewReason,
  VisitState,
  listOf,
} from './common';

const version = z.number().int().min(1);

export const EventSource = z.object({
  kind: z.enum(['ROBOT', 'SIMULATOR']),
  id: z.string().min(1).max(20),
});
export type EventSource = z.infer<typeof EventSource>;

export const FaceMatch = z.object({
  status: z.literal('MATCH'),
  classHint: z.enum(['MEMBER', 'NON_MEMBER']),
  candidateId: z.string().min(1).max(20).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export const FaceSignal = z.discriminatedUnion('status', [
  FaceMatch,
  z.object({ status: z.literal('UNKNOWN') }),
  z.object({ status: z.literal('ERROR'), code: z.string().max(60) }),
]);
export type FaceSignal = z.infer<typeof FaceSignal>;

export const Classification = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('CONFIRMED'),
    category: Category,
    evidence: z.array(Evidence).min(1),
    suggestedDestination: z.string().nullable(),
  }),
  z.object({ state: z.literal('MANUAL_REVIEW'), reason: ManualReviewReason }),
  z.object({ state: z.literal('DENIED'), reason: DenialReason }),
]);
export type Classification = z.infer<typeof Classification>;

export const RecognitionRecord = z.object({
  source: EventSource,
  simulated: z.boolean(),
  face: FaceSignal,
  confidence: z.number().nullable(),
  observedAt: IsoDateTime,
});
export type RecognitionRecord = z.infer<typeof RecognitionRecord>;

export const VisitorSummary = z.object({
  ref: z.string().nullable(),
  personId: z.string().nullable(),
  displayName: z.string(),
});
export type VisitorSummary = z.infer<typeof VisitorSummary>;

export const CloseReason = z.enum([
  'EXIT',
  'INVITATION_CANCELLED',
  'NO_SHOW',
  'MERGED',
  'DAY_ROLLOVER',
]);
export type CloseReason = z.infer<typeof CloseReason>;

export const FailureReason = z.union([
  DenialReason,
  z.enum(['REVIEW_DENIED', 'ABORTED_BY_OPERATOR']),
]);
export type FailureReason = z.infer<typeof FailureReason>;

export const Visit = z.object({
  id: z.string(),
  state: VisitState,
  category: Category.nullable(),
  visitor: VisitorSummary,
  destination: z.string().nullable(),
  /** Responsable actual o, si la visita terminó, el último. */
  ownerId: z.string().nullable(),
  resumeState: VisitState.nullable(),
  classification: Classification.nullable(),
  recognition: RecognitionRecord.nullable(),
  invitationId: z.string().nullable(),
  /** Nombre de pila del anfitrión del invitado; `null` si la visita no nació de una invitación. */
  hostName: z.string().nullable(),
  openHandoffId: z.string().nullable(),
  arrivedAt: IsoDateTime.nullable(),
  closedAt: IsoDateTime.nullable(),
  closeReason: CloseReason.nullable(),
  failureReason: FailureReason.nullable(),
  feedbackSubmitted: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  version,
});
export type Visit = z.infer<typeof Visit>;

export const VisitList = listOf(Visit);
export type VisitList = z.infer<typeof VisitList>;

export const VisitsQuery = z.object({
  state: VisitState.optional(),
  ownerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
/** Los parámetros de consulta llegan como texto: `limit` se convierte a entero. */
export type VisitsQuery = z.output<typeof VisitsQuery>;

/** The request is strict: an image, an embedding or any other field is rejected, never stored. */
const strict = <T extends z.ZodRawShape>(o: z.ZodObject<T>) => z.strictObject(o.shape);

export const RecognitionEventRequest = z.strictObject({
  source: strict(EventSource),
  face: z.discriminatedUnion('status', [
    strict(FaceMatch),
    z.strictObject({ status: z.literal('UNKNOWN') }),
    z.strictObject({ status: z.literal('ERROR'), code: z.string().max(60) }),
  ]),
  evidence: z.strictObject({ qrToken: z.string().min(1).max(128).optional() }).optional(),
  observedAt: IsoDateTime.optional(),
});
export type RecognitionEventRequest = z.infer<typeof RecognitionEventRequest>;

export const RecognitionEventResponse = z.object({
  visit: Visit,
  classification: Classification,
  matchedOpenVisit: z.boolean(),
});
export type RecognitionEventResponse = z.infer<typeof RecognitionEventResponse>;

const expectedVersion = { expectedVersion: version.optional() };

export const AdvanceRequest = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('RESOLVE_REVIEW'),
    decision: z.enum(['CONFIRM', 'DENY']),
    personId: z.string().optional(),
    purpose: z.enum(['MEMBER', 'STAFF']).optional(),
    ...expectedVersion,
  }),
  z.object({
    event: z.literal('START_ORIENTATION'),
    destination: z.string().max(60).optional(),
    ...expectedVersion,
  }),
  z.object({
    event: z.literal('ASSIGN_ESCORT'),
    assigneeId: z.string().min(1),
    visitorAccepted: z.boolean(),
    ...expectedVersion,
  }),
  z.object({ event: z.literal('ARRIVE'), ...expectedVersion }),
  z.object({
    event: z.literal('ABORT'),
    reason: z.string().max(140).optional(),
    ...expectedVersion,
  }),
]);
export type AdvanceRequest = z.infer<typeof AdvanceRequest>;

export const CloseRequest = z.object({
  method: z.enum(['FACE', 'QR', 'MANUAL']).optional(),
  ...expectedVersion,
});
export type CloseRequest = z.infer<typeof CloseRequest>;

const rating = z.number().int().min(1).max(5);
export const FeedbackRequest = z
  .object({
    robotRating: rating.optional(),
    robotComment: z.string().max(300).optional(),
    clubRating: rating.optional(),
    clubComment: z.string().max(300).optional(),
  })
  .refine((f) => Object.values(f).some((v) => v !== undefined), {
    message: 'Debe incluir al menos un campo.',
  });
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export const Feedback = z.object({
  robotRating: rating.optional(),
  robotComment: z.string().optional(),
  clubRating: rating.optional(),
  clubComment: z.string().optional(),
  visitId: z.string(),
  createdAt: IsoDateTime,
});
export type Feedback = z.infer<typeof Feedback>;
