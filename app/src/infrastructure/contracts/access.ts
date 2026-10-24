/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import { DenialReason } from './common';
import { Invitation } from './invitations';
import { Visit } from './visits';

export const AccessVerifyRequest = z.strictObject({
  token: z.string().min(1).max(128),
  /** Visita en `MANUAL_REVIEW` sin invitación que se fusiona con la esperada. */
  visitId: z.string().optional(),
});
export type AccessVerifyRequest = z.infer<typeof AccessVerifyRequest>;

export const AccessVerifyResponse = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('GRANTED'), visit: Visit, invitation: Invitation }),
  z.object({ decision: z.literal('DENIED'), reason: DenialReason }),
]);
export type AccessVerifyResponse = z.infer<typeof AccessVerifyResponse>;
