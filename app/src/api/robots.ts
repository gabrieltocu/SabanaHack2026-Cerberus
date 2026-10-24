// `POST /robots/{id}/failure`: the robot goes to FAULT and each visit it owns asks for a relief.
// Resumable and idempotent: repeating it reuses open handoffs and only creates the missing ones.
import type { HandoffReason, Visit } from '../domain/entities/visit';
import type { RobotFailureRequest } from '../infrastructure/contracts';
import { findPerson, requireActor, robotKey } from './directory';
import { fail } from './errors';
import { openHandoff } from './present';
import { openRequest } from './handoffs';
import { listVisits, type Ctx } from './repo';

const REASON: Record<RobotFailureRequest['code'], HandoffReason> = {
  MOTOR_FAULT: 'ROBOT_FAILURE',
  NAVIGATION_BLOCKED: 'ROBOT_FAILURE',
  OBSTACLE: 'ROBOT_FAILURE',
  LOW_BATTERY: 'LOW_BATTERY',
  NETWORK_LOSS: 'NETWORK_LOSS',
};

const REQUESTABLE: Visit['state'][] = ['VERIFIED', 'ORIENTING', 'IN_PROGRESS', 'WAITING_HANDOFF'];

export async function reportFailure(
  ctx: Ctx,
  robotId: string,
  body: RobotFailureRequest,
): Promise<Visit[]> {
  const robot = findPerson(ctx.seed, robotId);
  if (!robot || robot.kind !== 'ROBOT')
    throw fail('ROBOT_NOT_FOUND', 'No existe el robot indicado.');
  // Only the robot itself (or an operator) declares its fault: no robot disables another.
  const actor = requireActor(ctx, ['ROBOT', 'OPERATOR']);
  if (actor.kind === 'ROBOT' && actor.id !== robotId)
    throw fail('ACTOR_NOT_ALLOWED', 'Un robot solo reporta su propia falla.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await ctx.store.get<{ status: string }>(robotKey(robotId));
    if (cur?.value.status === 'FAULT') break;
    if (
      (await ctx.store.compareAndSet(robotKey(robotId), cur?.version ?? 0, { status: 'FAULT' })) !==
      null
    )
      break;
    if (attempt === 2) throw fail('VERSION_CONFLICT', 'El estado del robot cambió; reintenta.');
  }

  const owned = (await listVisits(ctx)).filter(
    (v) => v.ownerId === robotId && REQUESTABLE.includes(v.state),
  );
  const out: Visit[] = [];
  for (const v of owned) {
    const done = await openRequest(ctx, v.id, {
      actor,
      reason: REASON[body.code],
      ownerMustBe: robotId,
      ...(body.lastKnownPoint ? { lastKnownPoint: body.lastKnownPoint } : {}),
    });
    if (openHandoff(done)) out.push(done);
  }
  return out;
}
