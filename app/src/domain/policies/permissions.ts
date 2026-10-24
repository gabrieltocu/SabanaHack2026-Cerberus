// Time-window rules over club records. Windows are `from <= t < to`; dates are inclusive.
import type { ExternalPermit, Invitation, Membership, Shift } from '../entities/types';
import { bogotaInstant, bogotaParts, parseLocalTime } from './bogota-time';

export type PermitStatus = 'ACTIVE' | 'WRONG_DAY' | 'OUTSIDE_HOURS' | 'OUT_OF_RANGE';
export type InvitationValidity = 'VALID' | 'NOT_YET' | 'EXPIRED' | 'CANCELLED' | 'USED';

export function isMembershipActive(m: Membership | undefined, now: Date): boolean {
  if (!m || m.status !== 'ACTIVE' || Number.isNaN(now.getTime())) return false;
  const { date } = bogotaParts(now);
  return m.validFrom <= date && date <= m.validTo;
}

export function activeShift(shifts: Shift[], personId: string, now: Date): Shift | undefined {
  const t = now.getTime();
  return shifts.find(
    (s) => s.personId === personId && Date.parse(s.start) <= t && t < Date.parse(s.end),
  );
}

export function permitStatus(permit: ExternalPermit, now: Date): PermitStatus {
  if (Number.isNaN(now.getTime())) return 'OUT_OF_RANGE';
  const { date, weekday, minutes } = bogotaParts(now);
  if (date < permit.validFrom || date > permit.validTo) return 'OUT_OF_RANGE';
  if (!permit.weekdays.includes(weekday)) return 'WRONG_DAY';
  if (minutes < parseLocalTime(permit.from) || minutes >= parseLocalTime(permit.to)) {
    return 'OUTSIDE_HOURS';
  }
  return 'ACTIVE';
}

export function invitationStatusAt(inv: Invitation, now: Date): InvitationValidity {
  if (inv.status === 'CANCELLED') return 'CANCELLED';
  if (inv.status === 'USED') return 'USED';
  if (inv.status === 'EXPIRED') return 'EXPIRED';
  // Negated comparisons so an invalid `now` (NaN) fails closed.
  if (!(now >= bogotaInstant(inv.date, inv.windowFrom))) return 'NOT_YET';
  if (!(now < bogotaInstant(inv.date, inv.windowTo))) return 'EXPIRED';
  return 'VALID';
}
