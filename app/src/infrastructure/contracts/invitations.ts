/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import { InvitationState, IsoDate, IsoDateTime, LocalTime, listOf } from './common';

export const Guest = z.object({
  fullName: z.string().min(2).max(80),
  contact: z.string().max(120).optional(),
  note: z.string().max(140).optional(),
});

export const InvitationWindow = z.object({ from: LocalTime, to: LocalTime });

export const InvitationCreate = z.object({
  hostId: z.string().min(1),
  guest: Guest,
  meetingPoint: z.string().max(60).optional(),
  date: IsoDate,
  window: InvitationWindow.optional(),
});
export type InvitationCreate = z.infer<typeof InvitationCreate>;

/** Token opaco: `nq_` + 22 caracteres base64url (128 bits). */
export const QrToken = z.string().regex(/^nq_[A-Za-z0-9_-]{22}$/);

export const Qr = z.object({
  token: QrToken,
  validFrom: IsoDateTime,
  validTo: IsoDateTime,
  usedAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
});
export type Qr = z.infer<typeof Qr>;

export const Invitation = z.object({
  id: z.string(),
  hostId: z.string(),
  guest: Guest.extend({ ref: z.string() }),
  meetingPoint: z.string().nullable(),
  date: IsoDate,
  window: InvitationWindow,
  state: InvitationState,
  qr: Qr,
  visitId: z.string(),
  createdAt: IsoDateTime,
  cancelledAt: IsoDateTime.nullable(),
});
export type Invitation = z.infer<typeof Invitation>;

/** Estado del pase que ve el invitado: `NOT_YET_VALID` es un pase activo cuya ventana no abrió. */
export const PassState = z.enum(['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED', 'NOT_YET_VALID']);
export type PassState = z.infer<typeof PassState>;

/** `GET /passes/{token}`: solo lo que el invitado necesita; poseer el token es la autorización. */
export const Pass = z.object({
  guestFirstName: z.string(),
  hostShortName: z.string(),
  meetingPoint: z.string().nullable(),
  date: IsoDate,
  window: InvitationWindow,
  state: PassState,
  qr: Qr.pick({ token: true, validFrom: true, validTo: true }),
});
export type Pass = z.infer<typeof Pass>;

export const InvitationList = listOf(Invitation);
export type InvitationList = z.infer<typeof InvitationList>;

export const InvitationsQuery = z.object({
  hostId: z.string().min(1),
  state: InvitationState.optional(),
  date: IsoDate.optional(),
});
export type InvitationsQuery = z.infer<typeof InvitationsQuery>;
