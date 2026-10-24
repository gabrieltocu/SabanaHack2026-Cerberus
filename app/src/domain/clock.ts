import type { Clock } from './entities/types';

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`INVALID_INSTANT: ${iso}`);
  return { now: () => new Date(t) };
}
