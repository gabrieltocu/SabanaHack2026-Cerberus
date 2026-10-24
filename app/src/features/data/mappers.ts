// Pure translation from the API v1 contract to what the kiosk and the attendant panel show:
// catalog codes, evidence lines, relief tasks and context. No fetching, no React.
import type { Category } from '../../domain/entities/types';
import type {
  Classification,
  DenialReason,
  Evidence,
  Handoff,
  HandoffContext,
  HandoffReason,
  Invitation,
  ManualReviewReason,
  Person,
  Visit,
} from '../../infrastructure/contracts';
import { ORIENTATION, type CopyVars } from '../orientation/copy';
import { spokenDate } from '../shared/dates';
import type { ClassificationView, HandoffContextData, HandoffTask } from '../types';

export type UiError = { code: string; message?: string };

const CLIENT_CODES: Record<string, string> = {
  NETWORK_ERROR: 'NETWORK_OFFLINE',
  TIMEOUT: 'NETWORK_OFFLINE',
  STORAGE_UNAVAILABLE: 'API_UNAVAILABLE',
  INTERNAL_ERROR: 'SERVER_ERROR',
  MALFORMED_RESPONSE: 'SERVER_ERROR',
  FEEDBACK_ALREADY_SUBMITTED: 'FEEDBACK_ALREADY_SENT',
};
const HANDOFF_CODES: Record<string, string> = {
  INVALID_TRANSITION: 'HANDOFF_INVALID_STATE',
  VERSION_CONFLICT: 'HANDOFF_INVALID_STATE',
  ACTOR_NOT_ALLOWED: 'HANDOFF_NOT_ASSIGNED',
};
// The kiosk talks to the visitor: a busy escort is «los robots están ocupados». The attendant
// panel (`owner`) keeps the catalog's own wording; `ESCORT_NOT_ALLOWED` and `VERSION_CONFLICT`
// have theirs in both. A 401 on the failure report means the deployment checks the robot's token.
const VISIT_CODES: Record<string, string> = {
  ASSIGNEE_BUSY: 'ROBOT_BUSY',
  UNAUTHENTICATED: 'ROBOT_AUTH_REQUIRED',
};

/** API or client error code -> catalog code (messages.ts) plus wording the catalog lacks. */
export function uiError(code: string, scope: 'visit' | 'handoff' | 'owner' = 'visit'): UiError {
  if (code === 'RECEIVER_BUSY') {
    return {
      code,
      message: 'Ya tienes una tarea de acompañamiento activa. Termínala para aceptar otra.',
    };
  }
  const table = scope === 'handoff' ? HANDOFF_CODES : scope === 'owner' ? {} : VISIT_CODES;
  return { code: CLIENT_CODES[code] ?? table[code] ?? code };
}

export const firstName = (displayName: string) => displayName.split(' ')[0] ?? displayName;

const EVIDENCE: Record<Evidence, string> = {
  MEMBERSHIP_ACTIVE: 'Membresía vigente',
  STAFF_SHIFT_ACTIVE: 'Credencial de personal vigente',
  EXTERNAL_PERMIT_ACTIVE: 'Visita de servicio registrada para hoy',
  INVITATION_ACTIVE: 'Invitación vigente para hoy',
  INVITATION_QR_VALID: 'Invitación vigente para hoy',
  HUMAN_ATTESTATION: 'Confirmado por una persona del equipo',
};

/** The records that back a classification, in words; `host` names the inviting member. */
export function evidenceText(evidence: readonly Evidence[], host?: string): string {
  const lines = evidence.map((e) =>
    host && (e === 'INVITATION_ACTIVE' || e === 'INVITATION_QR_VALID')
      ? `Invitación de ${host} para hoy`
      : EVIDENCE[e],
  );
  return [...new Set(lines)].join(' · ');
}

const REVIEW_CODE: Record<ManualReviewReason, string> = {
  FACE_UNKNOWN: 'RECOGNITION_UNKNOWN',
  FACE_ERROR: 'RECOGNITION_ERROR',
  LOW_CONFIDENCE: 'RECOGNITION_UNKNOWN',
  NO_EVIDENCE: 'ACCESS_DENIED_NO_EVIDENCE',
  CANDIDATE_NOT_FOUND: 'RECOGNITION_UNKNOWN',
  FACE_REGISTRY_MISMATCH: 'CLASSIFICATION_MANUAL_REVIEW',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_NOT_ACTIVE',
  STAFF_OUTSIDE_SHIFT: 'STAFF_SHIFT_INACTIVE',
  DUAL_ROLE: 'CLASSIFICATION_MANUAL_REVIEW',
};

const DENIAL_CODE: Record<Exclude<DenialReason, 'EXTERNAL_PERMIT_OUTSIDE_WINDOW'>, string> = {
  MEMBERSHIP_SUSPENDED: 'MEMBERSHIP_NOT_ACTIVE',
  QR_EXPIRED: 'QR_EXPIRED',
  QR_NOT_YET_VALID: 'QR_NOT_YET_VALID',
  QR_ALREADY_USED: 'QR_ALREADY_USED',
  QR_REVOKED: 'QR_REVOKED',
  QR_UNKNOWN: 'QR_NOT_FOUND',
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Civil date `AAAA-MM-DD` -> `{ code: 'SAT', name: 'sábado' }`. */
export function weekdayOf(date: string): { code: (typeof WEEKDAYS)[number]; name: string } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return {
    code: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] as (typeof WEEKDAYS)[number],
    name: spokenDate(date).split(' ')[0] as string,
  };
}

export type ClassifyContext = {
  /** First name of the member who invited the visitor. */
  host?: string;
  /** Demo date (`AAAA-MM-DD`) and the days the external permit covers, to word the denial. */
  today?: string;
  permitDays?: readonly string[];
};

/** API denial reason -> catalog code and template variables. */
export function denialCode(
  reason: DenialReason,
  { today, permitDays }: ClassifyContext = {},
): { code: string; vars?: CopyVars } {
  if (reason !== 'EXTERNAL_PERMIT_OUTSIDE_WINDOW') return { code: DENIAL_CODE[reason] };
  const day = today ? weekdayOf(today) : undefined;
  if (day && permitDays?.includes(day.code)) return { code: 'EXTERNAL_OUT_OF_HOURS' };
  return { code: 'EXTERNAL_DAY_NOT_ALLOWED', vars: { día: day?.name ?? 'hoy' } };
}

/** What the kiosk shows for the API's two-stage classification of `visit`. */
export function classificationView(
  c: Classification,
  visit: Visit,
  ctx: ClassifyContext = {},
): ClassificationView {
  if (c.state === 'CONFIRMED') {
    return {
      state: 'CONFIRMED',
      name: firstName(visit.visitor.displayName),
      category: c.category,
      evidence: evidenceText(c.evidence, ctx.host),
    };
  }
  if (c.state === 'MANUAL_REVIEW') return { state: 'MANUAL_REVIEW', code: REVIEW_CODE[c.reason] };
  return { state: 'DENIED', ...denialCode(c.reason, ctx) };
}

/** Who escorts in each category's script, as a directory id. */
export const ESCORT_ID: Record<string, string> = {
  R2: 'R2',
  R3: 'R3',
  Sara: 'U-01',
  Sofía: 'U-02',
  Ramiro: 'U-03',
};

/** Values for the orientation templates of a visit that API confirmed. */
export function orientationVars(visit: Visit, category: Category, host?: string): CopyVars {
  const script = ORIENTATION[category];
  return {
    nombre: firstName(visit.visitor.displayName),
    anfitrión: host ?? 'tu anfitrión',
    destino: visit.destination ?? script.destination,
    acompañante: script.escort ?? undefined,
  };
}

/** `2026-10-24T16:00:00-05:00` -> `4:00 p. m.` (the offset is Bogotá's, so the clock is local). */
export function timeLabel(iso: string): string {
  const [h = 0, m = '00'] = iso.slice(11, 16).split(':');
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'p. m.' : 'a. m.'}`;
}

const hhmm = (iso: string) => iso.slice(11, 16);

const SIMULATED_REASONS: HandoffReason[] = ['ROBOT_FAILURE', 'NETWORK_LOSS', 'LOW_BATTERY'];

function reasonLabel(reason: HandoffReason, from: string): string {
  switch (reason) {
    case 'ROBOT_FAILURE':
      return `Falla de ${from}`;
    case 'NETWORK_LOSS':
      return `Pérdida de red de ${from}`;
    case 'LOW_BATTERY':
      return `Batería baja de ${from}`;
    case 'VISITOR_PREFERENCE':
      return 'Preferencia del visitante';
    case 'OPERATIONAL':
      return 'Motivo operativo';
  }
}

/** `names` maps directory ids to the short names people use (`U-02` -> `Sofía`). */
export function toHandoffTask(h: Handoff, names: Record<string, string>): HandoffTask {
  const from = names[h.fromId] ?? h.fromId;
  const to = h.toId ?? h.preferredToId;
  return {
    id: h.id,
    // Only the first name before the context is handed over (the API sends «Andrés M.»).
    visitorName: firstName(h.summary.visitorName),
    category: h.summary.category,
    fromName: from,
    toName: to ? (names[to] ?? to) : 'Equipo',
    destination: h.summary.destination ?? 'Sin destino',
    ...(h.summary.lastKnownPoint ? { lastPoint: h.summary.lastKnownPoint } : {}),
    reason: reasonLabel(h.reason, from),
    requestedAt: hhmm(h.createdAt),
    expiresAt: hhmm(h.expiresAt),
    state: h.state,
    simulated: SIMULATED_REASONS.includes(h.reason),
  };
}

function progressText(c: HandoffContext): string {
  const { state, arrivedAt, lastKnownPoint } = c.progress;
  const base =
    state === 'IN_PROGRESS'
      ? arrivedAt
        ? 'En el destino'
        : 'Acompañando'
      : state === 'ORIENTING'
        ? 'Orientación en curso'
        : 'Identidad confirmada';
  return lastKnownPoint ? `${base}, ${lastKnownPoint.toLowerCase()}` : base;
}

export function toContextData(c: HandoffContext): HandoffContextData {
  return {
    visitorName: c.visitor.displayName,
    category: c.category,
    ...(c.visitor.ref ? { reference: c.visitor.ref } : {}),
    destination: c.destination ?? 'Sin destino',
    permissions: c.evidence.length
      ? [...new Set(c.evidence.map((e) => EVIDENCE[e]))]
      : ['Sin registros adicionales'],
    preferences: c.preferences,
    ...(c.progress.lastKnownPoint ? { lastPoint: c.progress.lastKnownPoint } : {}),
    progress: progressText(c),
  };
}

/** Directory id -> the name people use (`U-02` -> `Sofía`, `R2` -> `R2`). */
export function shortNames(people: readonly Person[]): Record<string, string> {
  return Object.fromEntries(
    people.map((p) => [p.id, p.roles.includes('ROBOT') ? p.id : firstName(p.displayName)]),
  );
}

export type QrShortcut = { label: string; token: string };

/** Presenter shortcuts built from real invitations, so tokens are never typed by hand. */
export function qrShortcuts(invitations: readonly Invitation[]): QrShortcut[] {
  const out: QrShortcut[] = invitations
    .filter((i) => i.state === 'ACTIVE')
    .slice(0, 3)
    .map((i) => ({ label: `Usar el pase de ${firstName(i.guest.fullName)}`, token: i.qr.token }));
  const probes = [
    ['USED', 'Probar un pase ya usado'],
    ['CANCELLED', 'Probar un pase cancelado'],
    ['EXPIRED', 'Probar un pase vencido'],
  ] as const;
  for (const [state, label] of probes) {
    const found = invitations.find((i) => i.state === state);
    if (found) out.push({ label, token: found.qr.token });
  }
  // Well-formed but never issued: the service answers QR_UNKNOWN.
  out.push({ label: 'Probar un pase manipulado', token: ['nq', 'x'.repeat(22)].join('_') });
  return out;
}

/** Where the kiosk picks up a visit that was already open when the person was recognised. */
export function resumePhase(visit: Visit): 'greeting' | 'assignment' | 'route' | 'exit' {
  if (visit.state === 'ORIENTING') return 'assignment';
  if (visit.state === 'IN_PROGRESS') return visit.arrivedAt ? 'exit' : 'route';
  return 'greeting';
}
