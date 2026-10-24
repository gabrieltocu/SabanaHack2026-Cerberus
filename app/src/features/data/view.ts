// Pure mappers from the API contract (src/infrastructure/contracts) to the display view models
// of ../types.ts. Instants arrive with the Bogotá offset (`-05:00`), so clock parts are read
// from the text itself and never from the machine's time zone.
import type {
  Activity as ApiActivity,
  Health,
  Invitation,
  Pass,
  Person,
  Visit,
  VisitState,
} from '../../infrastructure/contracts';
import { dateLabel, spokenDate } from '../shared/dates';
import type {
  Activity,
  InvitationSummary,
  PassStatus,
  PassView,
  Profile,
  VisitSummary,
} from '../types';

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** Robots go by their id (`R2`); people by first name. */
export const shortName = (p: Person) =>
  p.roles.includes('ROBOT') ? p.id : firstName(p.displayName);

/** The demo clock as `/health` reports it. */
export function clockOf(health: Health) {
  const iso = health.clock.now;
  return { iso, day: iso.slice(0, 10), hour: Number(iso.slice(11, 13)) };
}

/** `2026-10-24` -> `Sábado 24 oct 2026`. */
export function longDateLabel(day: string) {
  const weekday = spokenDate(day).split(' ')[0] ?? '';
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dateLabel(day).split(' ').slice(1).join(' ')}`;
}

/** Lowercase weekday of a civil date: `sábado`. */
export const weekdayOf = (day: string) => spokenDate(day).split(' ')[0] ?? '';

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Weekday an external permit stands for on `day`: today's name when the permit covers today and is
 * in force, otherwise another day it covers (so the screen can say it does not apply today).
 */
export function permitDayName(
  permit: { daysOfWeek: readonly string[]; validFrom: string; validTo: string },
  day: string,
): string {
  const today = weekdayOf(day);
  const names = permit.daysOfWeek.map((c) => DAY_NAMES[DAY_CODES.indexOf(c)] ?? '');
  const inForce = permit.validFrom <= day && day <= permit.validTo;
  return inForce && names.includes(today) ? today : (names.find((n) => n !== today) ?? 'otro día');
}

/** `16:00` -> `4:00 p. m.` */
export function timeLabel(hhmm: string) {
  const [h = 0, m = '00'] = hhmm.split(':');
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'p. m.' : 'a. m.'}`;
}

const hhmm = (iso: string) => iso.slice(11, 16);

export function toActivities(items: readonly ApiActivity[]): Activity[] {
  return [...items]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((a) => ({
      id: a.id,
      name: a.title,
      place: a.location,
      time: timeLabel(hhmm(a.startsAt)),
      dateTime: hhmm(a.startsAt),
    }));
}

// Directory ids of the five demo perspectives, with the wording of docs/design/screens.md §1.
const CARDS = [
  { id: 'V-201', roleLabel: 'Socio VIP', href: '/entrar?cuenta=sofia@nclub.demo', category: 'VIP' },
  {
    id: 'V-202',
    roleLabel: 'Socia regular',
    href: '/entrar?cuenta=camila@nclub.demo',
    category: 'REGULAR',
  },
  {
    id: 'V-204',
    roleLabel: 'Personal del club',
    href: '/entrar?cuenta=personal@nclub.demo',
    category: 'STAFF',
  },
  { id: 'U-02', roleLabel: 'Edecán', href: '/entrar?cuenta=edecan@nclub.demo' },
  { id: 'R1', roleLabel: 'Recepción', href: '/robot' },
] as const;

/** First names of the selectable members, so a screen can greet before the directory loads. */
export const MEMBER_NAMES: Record<string, string> = { 'V-201': 'Andrés', 'V-202': 'Camila' };

/** Directory id of the member a route refers to: `?perfil=` when it is one of the two, else Andrés. */
export const memberId = (perfil?: string) =>
  perfil !== undefined && Object.hasOwn(MEMBER_NAMES, perfil) ? perfil : 'V-201';

export function toProfiles(people: readonly Person[]): Profile[] {
  return CARDS.flatMap((c) => {
    const p = people.find((x) => x.id === c.id);
    if (!p) return [];
    const profile: Profile = {
      id: c.id,
      name: c.id === 'R1' ? 'Robot R1' : shortName(p),
      roleLabel: c.roleLabel,
      href: c.href,
    };
    return [{ ...profile, ...('category' in c ? { category: c.category } : {}) }];
  });
}

export function toInvitationSummary(i: Invitation): InvitationSummary {
  return {
    id: i.id,
    guestName: i.guest.fullName,
    dateLabel: dateLabel(i.date),
    meetingPoint: i.meetingPoint ?? 'Punto por acordar',
    status: i.state,
    token: i.qr.token,
  };
}

const PASS_STATUS: Record<Invitation['state'], PassStatus> = {
  ACTIVE: 'VALID',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'REVOKED',
};

/**
 * The pass as the guest sees it. With `nowIso` an active pass whose window has not opened is
 * «Aún no válido»; without it (the host's preview right after creating) it is shown as valid.
 */
export function toPassView(i: Invitation, hostName: string, nowIso?: string): PassView {
  const early =
    i.state === 'ACTIVE' && nowIso !== undefined && Date.parse(nowIso) < Date.parse(i.qr.validFrom);
  return {
    token: i.qr.token,
    guestName: firstName(i.guest.fullName),
    hostName,
    meetingPoint: i.meetingPoint ?? 'Punto por acordar',
    validityLabel: `Válido el ${dateLabel(i.date)}`,
    spokenDate: spokenDate(i.date),
    status: early ? 'NOT_YET_VALID' : PASS_STATUS[i.state],
    fromLabel: dateLabel(i.date),
  };
}

const PASS_VIEW_STATUS: Record<Pass['state'], PassStatus> = {
  ACTIVE: 'VALID',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'REVOKED',
  NOT_YET_VALID: 'NOT_YET_VALID',
};

/** The pass as `GET /passes/{token}` returns it: already only what the guest may see. */
export function fromPass(p: Pass): PassView {
  return {
    token: p.qr.token,
    guestName: p.guestFirstName,
    hostName: p.hostShortName,
    meetingPoint: p.meetingPoint ?? 'Punto por acordar',
    validityLabel: `Válido el ${dateLabel(p.date)}`,
    spokenDate: spokenDate(p.date),
    status: PASS_VIEW_STATUS[p.state],
    fromLabel: dateLabel(p.date),
  };
}

export const VISIT_LABEL: Record<VisitState, { label: string; kind: VisitSummary['statusKind'] }> =
  {
    EXPECTED: { label: 'Esperada', kind: 'neutral' },
    IDENTIFYING: { label: 'Identificándote', kind: 'info' },
    VERIFIED: { label: 'Confirmada', kind: 'success' },
    ORIENTING: { label: 'Orientando', kind: 'info' },
    IN_PROGRESS: { label: 'En curso', kind: 'info' },
    WAITING_HANDOFF: { label: 'Esperando relevo', kind: 'warning' },
    MANUAL_REVIEW: { label: 'En revisión', kind: 'warning' },
    FAILED: { label: 'No completada', kind: 'danger' },
    CLOSED: { label: 'Cerrada', kind: 'neutral' },
  };

export function toVisitSummary(v: Visit, owner?: string): VisitSummary {
  const state = VISIT_LABEL[v.state];
  return {
    id: v.id,
    reference: v.visitor.ref ?? '',
    destination: v.destination ?? '',
    statusLabel: state.label,
    statusKind: state.kind,
    ...(owner ? { responsible: `Te atiende ${owner}` } : {}),
    simulated: v.recognition?.simulated === true,
    closed: v.state === 'CLOSED',
    feedbackSent: v.feedbackSubmitted,
  };
}
