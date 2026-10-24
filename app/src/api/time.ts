// Wire format of instants: ISO 8601 with the Bogotá offset (UTC-5, no DST), as the contract states.
const OFFSET_MS = -5 * 3_600_000;

export function bogotaIso(at: Date | string): string {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime();
  if (Number.isNaN(t)) throw new Error('INVALID_INSTANT');
  return `${new Date(t + OFFSET_MS).toISOString().slice(0, 19)}-05:00`;
}

export const bogotaIsoOrNull = (at: string | undefined): string | null =>
  at === undefined ? null : bogotaIso(at);

/** `AAAA-MM-DD` of the Bogotá calendar day. */
export const bogotaDay = (at: Date | string): string => bogotaIso(at).slice(0, 10);
