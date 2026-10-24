// Pure Bogotá wall-clock helpers. Colombia has no DST, so a fixed UTC-5 offset is exact.
import type { LocalDate, LocalTime } from '../entities/types';

const OFFSET_MINUTES = -5 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface BogotaParts {
  date: LocalDate;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes since local midnight, 0..1439. */
  minutes: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function bogotaParts(d: Date): BogotaParts {
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_INSTANT');
  const shifted = new Date(d.getTime() + OFFSET_MINUTES * 60_000);
  return {
    date: `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** `HH:MM` → minutes since midnight. Throws on anything else (ponytail: no `24:00`; end windows use 23:59). */
export function parseLocalTime(time: LocalTime): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`INVALID_LOCAL_TIME: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Local Bogotá date + `HH:MM` → absolute instant. */
export function bogotaInstant(date: LocalDate, time: LocalTime): Date {
  const minutes = parseLocalTime(time);
  const t = DATE_RE.test(date) ? Date.parse(`${date}T00:00:00-05:00`) : NaN;
  // Round-trip: engines roll `2026-02-31` over to March instead of rejecting it.
  if (Number.isNaN(t) || bogotaParts(new Date(t)).date !== date) {
    throw new Error(`INVALID_LOCAL_DATE: ${date}`);
  }
  return new Date(t + minutes * 60_000);
}
