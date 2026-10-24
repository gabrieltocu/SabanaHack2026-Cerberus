/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import {
  Category,
  Evidence,
  HandoffCancelReason,
  HandoffReason,
  HandoffState,
  IsoDateTime,
  VisitState,
  listOf,
} from './common';
import { Visit, VisitorSummary } from './visits';

export const HandoffSummary = z.object({
  /** Solo el nombre de pila y la inicial del apellido. */
  visitorName: z.string(),
  category: Category,
  destination: z.string().nullable(),
  lastKnownPoint: z.string().nullable(),
});

export const Handoff = z.object({
  id: z.string(),
  visitId: z.string(),
  state: HandoffState,
  reason: HandoffReason,
  fromId: z.string(),
  toId: z.string().nullable(),
  preferredToId: z.string().nullable(),
  requestedBy: z.string(),
  note: z.string().nullable(),
  summary: HandoffSummary,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  acceptedAt: IsoDateTime.nullable(),
  contextTransferredAt: IsoDateTime.nullable(),
  confirmedAt: IsoDateTime.nullable(),
  cancelledAt: IsoDateTime.nullable(),
  cancelReason: HandoffCancelReason.nullable(),
  version: z.number().int().min(1),
});
export type Handoff = z.infer<typeof Handoff>;

export const HandoffCreate = z.object({
  visitId: z.string().min(1),
  reason: HandoffReason,
  preferredToId: z.string().optional(),
  note: z.string().max(140).optional(),
});
export type HandoffCreate = z.infer<typeof HandoffCreate>;

export const HandoffCancelRequest = z.object({ cancelReason: HandoffCancelReason.optional() });
export type HandoffCancelRequest = z.infer<typeof HandoffCancelRequest>;

export const HandoffResult = z.object({ handoff: Handoff, visit: Visit });
export type HandoffResult = z.infer<typeof HandoffResult>;

export const HandoffList = listOf(Handoff);
export type HandoffList = z.infer<typeof HandoffList>;

export const HandoffsQuery = z.object({
  state: HandoffState.optional(),
  visitId: z.string().optional(),
});
export type HandoffsQuery = z.infer<typeof HandoffsQuery>;

export const HandoffContext = z.object({
  visitId: z.string(),
  visitor: VisitorSummary,
  category: Category,
  destination: z.string().nullable(),
  preferences: z.array(z.string()),
  progress: z.object({
    state: VisitState,
    arrivedAt: IsoDateTime.nullable(),
    lastKnownPoint: z.string().nullable(),
  }),
  evidence: z.array(Evidence),
  note: z.string().nullable(),
});
export type HandoffContext = z.infer<typeof HandoffContext>;

export const HandoffContextResult = z.object({ handoff: Handoff, context: HandoffContext });
export type HandoffContextResult = z.infer<typeof HandoffContextResult>;
