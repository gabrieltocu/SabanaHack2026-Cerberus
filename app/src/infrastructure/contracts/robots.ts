/* eslint-disable @typescript-eslint/no-redeclare -- patrón Zod: el esquema y su tipo comparten nombre */
import { z } from 'zod';

import { Handoff } from './handoffs';

export const RobotFailureCode = z.enum([
  'MOTOR_FAULT',
  'NAVIGATION_BLOCKED',
  'OBSTACLE',
  'LOW_BATTERY',
  'NETWORK_LOSS',
]);
export type RobotFailureCode = z.infer<typeof RobotFailureCode>;

export const RobotFailureRequest = z.strictObject({
  code: RobotFailureCode,
  lastKnownPoint: z.string().max(60).optional(),
});
export type RobotFailureRequest = z.infer<typeof RobotFailureRequest>;

export const RobotFailureResponse = z.object({
  robot: z.object({ id: z.string(), status: z.literal('FAULT') }),
  handoffs: z.array(Handoff),
});
export type RobotFailureResponse = z.infer<typeof RobotFailureResponse>;
