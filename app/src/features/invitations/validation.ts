export type InvitationValues = {
  guestName: string;
  /** `AAAA-MM-DD`. */
  date: string;
  meetingPoint: string;
  drink: string;
  photo: boolean;
};

export type InvitationField = 'guestName' | 'date';
/** Field -> stable catalog code (messages.ts). */
export type InvitationErrors = Partial<Record<InvitationField, string>>;

export const MAX_DAYS_AHEAD = 30;

const toDay = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Rejects 2026-02-31 and the like: the date must survive the round trip.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return t / 86_400_000;
};

/** Pure. `today` is the simulated civil date (`AAAA-MM-DD`), never the machine clock. */
export function validateInvitation(
  values: Pick<InvitationValues, 'guestName' | 'date'>,
  today: string,
): InvitationErrors {
  const errors: InvitationErrors = {};
  const name = values.guestName.trim();
  if (name.length < 2 || name.length > 60) errors.guestName = 'INVITATION_GUEST_NAME_REQUIRED';
  const day = toDay(values.date);
  const base = toDay(today);
  if (day === null || base === null || day < base || day > base + MAX_DAYS_AHEAD) {
    errors.date = 'INVITATION_DATE_INVALID';
  }
  return errors;
}
