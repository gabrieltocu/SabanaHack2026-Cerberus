/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import { IsoDateTime } from './common';
import { Invitation } from './invitations';

export const Health = z.object({
  status: z.literal('ok'),
  contract: z.literal('v1'),
  // `browser`: modo demo local (localStorage), añadido a `memory` y `redis`.
  storage: z.enum(['memory', 'redis', 'browser']),
  demo: z.boolean(),
  clock: z.object({ now: IsoDateTime, timezone: z.literal('America/Bogota') }),
  /** Deployed git commit on the server; absent in the in-browser demo. */
  commit: z.string().nullable().optional(),
});
export type Health = z.infer<typeof Health>;

export const DemoResetRequest = z.object({ now: IsoDateTime.optional() });
export type DemoResetRequest = z.infer<typeof DemoResetRequest>;

export const DemoResetResponse = z.object({
  status: z.literal('reset'),
  clock: z.object({ now: IsoDateTime }),
  demoInvitation: Invitation,
});
export type DemoResetResponse = z.infer<typeof DemoResetResponse>;
