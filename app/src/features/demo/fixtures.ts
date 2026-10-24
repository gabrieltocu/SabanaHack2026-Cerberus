// ponytail: static demonstration data that still stands in for the API client on the kiosk and
// attendant screens (/access/verify, /handoffs, /activities). Ceiling: one fixture per persona,
// no persistence, no shared state between tabs. The member, pass, staff, activities and cover
// screens already read the API (../pages, ../screens/HomeScreen); the components only depend on
// the view models in ../types.ts.
// Every person, pass and date is fictitious (docs/api/CONTRACT.md §3).
import type { Category } from '../../domain/entities/types';
import type { CopyVars } from '../orientation/copy';
import { ORIENTATION } from '../orientation/copy';
import type {
  Activity,
  ClassificationView,
  HandoffContextData,
  HandoffTask,
  PassView,
} from '../types';

export const ARRIVING_VISITORS = [
  {
    id: 'valentina',
    title: 'Valentina · invitada',
    text: 'Su anfitrión le emite un pase QR. Llega al robot.',
  },
  {
    id: 'laura',
    title: 'Laura · trabajadora externa',
    text: 'Permiso de acceso los sábados. Llega al robot.',
  },
] as const;

export type SimulatedDate = { value: string; label: string; day: string };
export const SIMULATED_DATES: readonly SimulatedDate[] = [
  { value: '2026-10-24', label: 'Sábado 24 oct 2026', day: 'sábado' },
  { value: '2026-10-27', label: 'Martes 27 oct 2026', day: 'martes' },
];

/** Face options of the presenter, in the documented order and wording. */
export const FACES = [
  { id: 'andres', label: 'Andrés · miembro' },
  { id: 'camila', label: 'Camila · miembro' },
  { id: 'valentina', label: 'Valentina · no miembro' },
  { id: 'mario', label: 'Mario · no miembro' },
  { id: 'laura', label: 'Laura · no miembro' },
  { id: 'unknown', label: 'Rostro desconocido' },
  { id: 'error', label: 'Error de cámara' },
] as const;
export type FaceId = (typeof FACES)[number]['id'];

const KNOWN: Record<string, { name: string; category: Category; evidence: string }> = {
  andres: { name: 'Andrés', category: 'VIP', evidence: 'Membresía vigente' },
  camila: { name: 'Camila', category: 'REGULAR', evidence: 'Membresía vigente' },
  valentina: {
    name: 'Valentina',
    category: 'GUEST',
    evidence: 'Invitación de Camila para hoy',
  },
  mario: { name: 'Mario', category: 'STAFF', evidence: 'Credencial de personal vigente' },
  laura: {
    name: 'Laura',
    category: 'EXTERNAL',
    evidence: 'Visita de servicio registrada para hoy',
  },
};

/** What the (simulated) club records say about each simulated face, for the given weekday. */
export function simulateFace(face: string, day = 'sábado'): ClassificationView {
  if (face === 'error') return { state: 'MANUAL_REVIEW', code: 'RECOGNITION_ERROR' };
  const person = KNOWN[face];
  if (!person) return { state: 'MANUAL_REVIEW', code: 'RECOGNITION_UNKNOWN' };
  // Laura's permit only covers Saturdays; the face never overrides the record.
  if (face === 'laura' && day !== 'sábado') {
    return { state: 'DENIED', code: 'EXTERNAL_DAY_NOT_ALLOWED', vars: { día: day } };
  }
  return { state: 'CONFIRMED', ...person };
}

/** Values for the orientation templates of a confirmed visitor. */
export function orientationVars(category: Category, name: string, host = 'Camila'): CopyVars {
  const o = ORIENTATION[category];
  return {
    nombre: name,
    anfitrión: host,
    destino: o.destination,
    acompañante: o.escort ?? undefined,
  };
}

export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'act-tenis',
    name: 'Clase de tenis',
    place: 'Cancha de tenis',
    time: '4:00 p. m.',
    dateTime: '16:00',
    capacity: '6 cupos',
  },
  {
    id: 'act-te',
    name: 'Té de la tarde',
    place: 'Terraza',
    time: '5:00 p. m.',
    dateTime: '17:00',
    capacity: '12 cupos',
  },
  {
    id: 'act-lectura',
    name: 'Lectura en el salón',
    place: 'Salón reservado',
    time: '6:00 p. m.',
    dateTime: '18:00',
    capacity: '8 cupos',
  },
];

const pass = (p: Partial<PassView> & Pick<PassView, 'token' | 'status'>): PassView => ({
  guestName: 'Valentina',
  hostName: 'Camila',
  meetingPoint: 'Terraza',
  validityLabel: 'Válido el sáb 24 oct 2026',
  spokenDate: 'sábado 24 de octubre',
  ...p,
});

/** Passes by token. A token that is not here is «No válido» (QR_NOT_FOUND), never an error page. */
export const PASSES: Record<string, PassView> = {
  'demo-valentina': pass({ token: 'demo-valentina', status: 'VALID' }),
  'demo-tomas': pass({ token: 'demo-tomas', status: 'VALID', guestName: 'Tomás' }),
  'demo-futuro': pass({
    token: 'demo-futuro',
    status: 'NOT_YET_VALID',
    fromLabel: 'dom 25 oct 2026',
  }),
  'demo-vencido': pass({ token: 'demo-vencido', status: 'EXPIRED' }),
  'demo-usado': pass({ token: 'demo-usado', status: 'USED' }),
  'demo-cancelado': pass({ token: 'demo-cancelado', status: 'REVOKED' }),
};

export const HANDOFF_TASK: HandoffTask = {
  id: 'hof-demo',
  visitorName: 'Andrés',
  category: 'VIP',
  fromName: 'R2',
  toName: 'Sofía',
  destination: 'Salón reservado',
  lastPoint: 'Pasillo principal',
  reason: 'Falla de R2',
  requestedAt: '10:15',
  expiresAt: '10:25',
  state: 'REQUESTED',
  simulated: true,
};

export const HANDOFF_CONTEXT: HandoffContextData = {
  visitorName: 'Andrés',
  category: 'VIP',
  reference: 'V-201',
  destination: 'Salón reservado',
  permissions: ['Membresía VIP vigente', 'Reserva del salón confirmada'],
  preferences: ['Café'],
  lastPoint: 'Pasillo principal',
  progress: 'Acompañando, pasillo',
};

const PASS_CODE = {
  NOT_YET_VALID: 'QR_NOT_YET_VALID',
  EXPIRED: 'QR_EXPIRED',
  USED: 'QR_ALREADY_USED',
  REVOKED: 'QR_REVOKED',
  NOT_FOUND: 'QR_NOT_FOUND',
} as const;

/**
 * What the club records say about a typed or "scanned" code. A valid pass still only
 * confirms after the person says «Sí, soy yo»: the QR alone opens nothing.
 */
export function checkPass(
  token: string,
): { result: ClassificationView; host: string } | { errorCode: string; vars?: CopyVars } {
  const code = token.trim();
  if (code.length < 4) return { errorCode: 'QR_INVALID' };
  const pass = PASSES[code];
  if (!pass) return { errorCode: PASS_CODE.NOT_FOUND };
  if (pass.status !== 'VALID') {
    return { errorCode: PASS_CODE[pass.status], vars: { fecha: pass.fromLabel } };
  }
  return {
    host: pass.hostName,
    result: {
      state: 'CONFIRMED',
      name: pass.guestName,
      category: 'GUEST',
      evidence: `Invitación de ${pass.hostName} para hoy`,
    },
  };
}
