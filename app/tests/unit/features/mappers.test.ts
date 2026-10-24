import {
  classificationView,
  denialCode,
  evidenceText,
  orientationVars,
  qrShortcuts,
  resumePhase,
  shortNames,
  timeLabel,
  toContextData,
  toHandoffTask,
  uiError,
  weekdayOf,
} from '@/features/data/mappers';
import { messageFor } from '@/features/messages';
import type {
  Handoff,
  HandoffContext,
  Invitation,
  Person,
  Visit,
} from '@/infrastructure/contracts';

const visit = (p: Partial<Visit> = {}): Visit => ({
  id: 'vis-1',
  state: 'VERIFIED',
  category: 'VIP',
  visitor: { ref: 'V-201', personId: 'V-201', displayName: 'Andrés Mejía' },
  destination: 'Salón reservado',
  ownerId: 'R1',
  resumeState: null,
  classification: null,
  recognition: null,
  invitationId: null,
  hostName: null,
  openHandoffId: null,
  arrivedAt: null,
  closedAt: null,
  closeReason: null,
  failureReason: null,
  feedbackSubmitted: false,
  createdAt: '2026-10-24T09:00:00-05:00',
  updatedAt: '2026-10-24T09:00:00-05:00',
  version: 1,
  ...p,
});

const handoff = (p: Partial<Handoff> = {}): Handoff => ({
  id: 'hof-1',
  visitId: 'vis-1',
  state: 'REQUESTED',
  reason: 'ROBOT_FAILURE',
  fromId: 'R2',
  toId: null,
  preferredToId: null,
  requestedBy: 'R1',
  note: null,
  summary: {
    visitorName: 'Andrés M.',
    category: 'VIP',
    destination: 'Salón reservado',
    lastKnownPoint: 'Pasillo',
  },
  createdAt: '2026-10-24T09:20:00-05:00',
  expiresAt: '2026-10-24T09:30:00-05:00',
  acceptedAt: null,
  contextTransferredAt: null,
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  version: 1,
  ...p,
});

describe('uiError', () => {
  it('turns client and service codes into catalog codes', () => {
    expect(uiError('NETWORK_ERROR').code).toBe('NETWORK_OFFLINE');
    expect(uiError('TIMEOUT').code).toBe('NETWORK_OFFLINE');
    expect(uiError('STORAGE_UNAVAILABLE').code).toBe('API_UNAVAILABLE');
    expect(uiError('INTERNAL_ERROR').code).toBe('SERVER_ERROR');
    expect(uiError('FEEDBACK_ALREADY_SUBMITTED').code).toBe('FEEDBACK_ALREADY_SENT');
    expect(uiError('ASSIGNEE_BUSY').code).toBe('ROBOT_BUSY');
  });

  it('only a busy escort is «ocupado»; the other visit conflicts have their own wording', () => {
    expect(uiError('ESCORT_NOT_ALLOWED').code).toBe('ESCORT_NOT_ALLOWED');
    expect(uiError('VERSION_CONFLICT').code).toBe('VERSION_CONFLICT');
    expect(uiError('UNAUTHENTICATED').code).toBe('ROBOT_AUTH_REQUIRED');
    expect(messageFor('ESCORT_NOT_ALLOWED')).not.toBe(messageFor('ROBOT_BUSY'));
    expect(messageFor('VERSION_CONFLICT')).not.toBe(messageFor('SERVER_ERROR'));
    expect(messageFor('ROBOT_AUTH_REQUIRED')).toMatch(/llave del robot/);
  });

  it('the attendant panel words a busy escort as her own pending visit', () => {
    expect(uiError('ASSIGNEE_BUSY', 'owner').code).toBe('ASSIGNEE_BUSY');
    expect(messageFor('ASSIGNEE_BUSY')).toBe(
      'Ya tienes una visita en curso. Llega a su destino antes de comenzar otra.',
    );
    expect(uiError('VERSION_CONFLICT', 'handoff').code).toBe('HANDOFF_INVALID_STATE');
  });

  it('words handoff conflicts as handoff messages and keeps other codes as they are', () => {
    expect(uiError('INVALID_TRANSITION', 'handoff').code).toBe('HANDOFF_INVALID_STATE');
    expect(uiError('VERSION_CONFLICT', 'handoff').code).toBe('HANDOFF_INVALID_STATE');
    expect(uiError('ACTOR_NOT_ALLOWED', 'handoff').code).toBe('HANDOFF_NOT_ASSIGNED');
    expect(uiError('INVALID_TRANSITION').code).toBe('INVALID_TRANSITION');
    expect(uiError('HANDOFF_EXPIRED', 'handoff').code).toBe('HANDOFF_EXPIRED');
    expect(uiError('RECEIVER_BUSY', 'handoff').message).toMatch(/tarea de acompañamiento activa/);
  });
});

describe('evidenceText', () => {
  it('names each record once and the host when there is one', () => {
    expect(evidenceText(['MEMBERSHIP_ACTIVE'])).toBe('Membresía vigente');
    expect(evidenceText(['STAFF_SHIFT_ACTIVE'])).toBe('Credencial de personal vigente');
    expect(evidenceText(['EXTERNAL_PERMIT_ACTIVE'])).toBe('Visita de servicio registrada para hoy');
    expect(evidenceText(['INVITATION_QR_VALID'], 'Male')).toBe('Invitación de Male para hoy');
    expect(evidenceText(['INVITATION_ACTIVE'])).toBe('Invitación vigente para hoy');
    expect(evidenceText(['INVITATION_ACTIVE', 'INVITATION_QR_VALID'])).toBe(
      'Invitación vigente para hoy',
    );
    expect(evidenceText(['MEMBERSHIP_ACTIVE', 'HUMAN_ATTESTATION'])).toBe(
      'Membresía vigente · Confirmado por una persona del equipo',
    );
  });
});

describe('classificationView', () => {
  it('confirms with the first name, the category and the records', () => {
    expect(
      classificationView(
        {
          state: 'CONFIRMED',
          category: 'VIP',
          evidence: ['MEMBERSHIP_ACTIVE'],
          suggestedDestination: null,
        },
        visit(),
      ),
    ).toEqual({
      state: 'CONFIRMED',
      name: 'Andrés',
      category: 'VIP',
      evidence: 'Membresía vigente',
    });
  });

  it.each([
    ['FACE_UNKNOWN', 'RECOGNITION_UNKNOWN'],
    ['FACE_ERROR', 'RECOGNITION_ERROR'],
    ['LOW_CONFIDENCE', 'RECOGNITION_UNKNOWN'],
    ['NO_EVIDENCE', 'ACCESS_DENIED_NO_EVIDENCE'],
    ['CANDIDATE_NOT_FOUND', 'RECOGNITION_UNKNOWN'],
    ['FACE_REGISTRY_MISMATCH', 'CLASSIFICATION_MANUAL_REVIEW'],
    ['MEMBERSHIP_EXPIRED', 'MEMBERSHIP_NOT_ACTIVE'],
    ['STAFF_OUTSIDE_SHIFT', 'STAFF_SHIFT_INACTIVE'],
    ['DUAL_ROLE', 'CLASSIFICATION_MANUAL_REVIEW'],
  ] as const)('a review for %s shows %s', (reason, code) => {
    expect(classificationView({ state: 'MANUAL_REVIEW', reason }, visit())).toEqual({
      state: 'MANUAL_REVIEW',
      code,
    });
  });

  it('a denial carries its code', () => {
    expect(classificationView({ state: 'DENIED', reason: 'QR_REVOKED' }, visit())).toEqual({
      state: 'DENIED',
      code: 'QR_REVOKED',
    });
  });
});

describe('denialCode', () => {
  it.each([
    ['MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_NOT_ACTIVE'],
    ['QR_EXPIRED', 'QR_EXPIRED'],
    ['QR_NOT_YET_VALID', 'QR_NOT_YET_VALID'],
    ['QR_ALREADY_USED', 'QR_ALREADY_USED'],
    ['QR_REVOKED', 'QR_REVOKED'],
    ['QR_UNKNOWN', 'QR_NOT_FOUND'],
  ] as const)('%s -> %s', (reason, code) => {
    expect(denialCode(reason)).toEqual({ code });
  });

  it('tells a wrong day from a wrong hour for the external permit', () => {
    const reason = 'EXTERNAL_PERMIT_OUTSIDE_WINDOW';
    expect(denialCode(reason, { today: '2026-10-27', permitDays: ['SAT'] })).toEqual({
      code: 'EXTERNAL_DAY_NOT_ALLOWED',
      vars: { día: 'martes' },
    });
    expect(denialCode(reason, { today: '2026-10-24', permitDays: ['SAT'] })).toEqual({
      code: 'EXTERNAL_OUT_OF_HOURS',
    });
    expect(denialCode(reason)).toEqual({
      code: 'EXTERNAL_DAY_NOT_ALLOWED',
      vars: { día: 'hoy' },
    });
  });

  it('knows the weekday of a civil date', () => {
    expect(weekdayOf('2026-10-24')).toEqual({ code: 'SAT', name: 'sábado' });
    expect(weekdayOf('2026-10-25')).toEqual({ code: 'SUN', name: 'domingo' });
  });
});

describe('orientationVars and resumePhase', () => {
  it('fills the script with the visit and the scripted escort', () => {
    expect(orientationVars(visit(), 'VIP', 'Male')).toEqual({
      nombre: 'Andrés',
      anfitrión: 'Male',
      destino: 'Salón reservado',
      acompañante: 'R2',
    });
    expect(orientationVars(visit({ destination: null }), 'STAFF')).toMatchObject({
      anfitrión: 'tu anfitrión',
      destino: 'Operaciones',
      acompañante: undefined,
    });
  });

  it('picks the visit up where it was', () => {
    expect(resumePhase(visit())).toBe('greeting');
    expect(resumePhase(visit({ state: 'ORIENTING' }))).toBe('assignment');
    expect(resumePhase(visit({ state: 'IN_PROGRESS' }))).toBe('route');
    expect(
      resumePhase(visit({ state: 'IN_PROGRESS', arrivedAt: '2026-10-24T10:00:00-05:00' })),
    ).toBe('exit');
  });
});

describe('timeLabel', () => {
  it('writes the local clock as the screens do', () => {
    expect(timeLabel('2026-10-24T09:30:00-05:00')).toBe('9:30 a. m.');
    expect(timeLabel('2026-10-24T12:00:00-05:00')).toBe('12:00 p. m.');
    expect(timeLabel('2026-10-24T16:05:00-05:00')).toBe('4:05 p. m.');
    expect(timeLabel('2026-10-24T00:10:00-05:00')).toBe('12:10 a. m.');
  });
});

describe('toHandoffTask and toContextData', () => {
  const names = { R2: 'R2', 'U-02': 'Sofía' };

  it('shows a first name, the people by their names and the hours of the panel', () => {
    expect(toHandoffTask(handoff(), names)).toEqual({
      id: 'hof-1',
      visitorName: 'Andrés',
      category: 'VIP',
      fromName: 'R2',
      toName: 'Equipo',
      destination: 'Salón reservado',
      lastPoint: 'Pasillo',
      reason: 'Falla de R2',
      requestedAt: '09:20',
      expiresAt: '09:30',
      state: 'REQUESTED',
      simulated: true,
    });
    const taken = toHandoffTask(
      handoff({
        toId: 'U-02',
        reason: 'VISITOR_PREFERENCE',
        summary: {
          visitorName: 'Camila',
          category: 'REGULAR',
          destination: null,
          lastKnownPoint: null,
        },
      }),
      names,
    );
    expect(taken).toMatchObject({
      toName: 'Sofía',
      destination: 'Sin destino',
      reason: 'Preferencia del visitante',
      simulated: false,
    });
    expect(taken).not.toHaveProperty('lastPoint');
  });

  it.each([
    ['NETWORK_LOSS', 'Pérdida de red de R2'],
    ['LOW_BATTERY', 'Batería baja de R2'],
    ['OPERATIONAL', 'Motivo operativo'],
  ] as const)('words %s', (reason, text) => {
    expect(toHandoffTask(handoff({ reason }), names).reason).toBe(text);
  });

  const context = (p: Partial<HandoffContext> = {}): HandoffContext => ({
    visitId: 'vis-1',
    visitor: { ref: 'V-201', personId: 'V-201', displayName: 'Andrés Mejía' },
    category: 'VIP',
    destination: 'Salón reservado',
    preferences: ['Café'],
    progress: { state: 'IN_PROGRESS', arrivedAt: null, lastKnownPoint: 'Pasillo Principal' },
    evidence: ['MEMBERSHIP_ACTIVE'],
    note: null,
    ...p,
  });

  it('hands over who, where, permissions, preferences and progress', () => {
    expect(toContextData(context())).toEqual({
      visitorName: 'Andrés Mejía',
      category: 'VIP',
      reference: 'V-201',
      destination: 'Salón reservado',
      permissions: ['Membresía vigente'],
      preferences: ['Café'],
      lastPoint: 'Pasillo Principal',
      progress: 'Acompañando, pasillo principal',
    });
  });

  it('describes the progress in each state and survives missing data', () => {
    const progress = (state: HandoffContext['progress']['state'], arrivedAt: string | null) =>
      toContextData(
        context({
          progress: { state, arrivedAt, lastKnownPoint: null },
          evidence: [],
          destination: null,
        }),
      );
    expect(progress('IN_PROGRESS', '2026-10-24T10:00:00-05:00').progress).toBe('En el destino');
    expect(progress('ORIENTING', null).progress).toBe('Orientación en curso');
    expect(progress('VERIFIED', null).progress).toBe('Identidad confirmada');
    expect(progress('VERIFIED', null)).toMatchObject({
      destination: 'Sin destino',
      permissions: ['Sin registros adicionales'],
    });
    expect(
      toContextData(context({ visitor: { ref: null, personId: null, displayName: 'X' } })),
    ).not.toHaveProperty('reference');
  });
});

describe('shortNames and qrShortcuts', () => {
  const person = (id: string, displayName: string, roles: Person['roles']): Person => ({
    id,
    displayName,
    roles,
    defaultDestination: null,
  });

  it('uses first names for people and ids for robots', () => {
    expect(
      shortNames([
        person('U-02', 'Sofía', ['USHER']),
        person('V-201', 'Andrés Mejía', ['MEMBER']),
        person('R2', 'R2 · acompañamiento', ['ROBOT']),
      ]),
    ).toEqual({ 'U-02': 'Sofía', 'V-201': 'Andrés', R2: 'R2' });
  });

  const inv = (state: Invitation['state'], name: string, token: string): Invitation => ({
    id: `inv-${token}`,
    hostId: 'V-209',
    guest: { fullName: name, ref: 'G-1' },
    meetingPoint: null,
    date: '2026-10-24',
    window: { from: '06:00', to: '22:00' },
    state,
    qr: {
      token,
      validFrom: '2026-10-24T06:00:00-05:00',
      validTo: '2026-10-24T22:00:00-05:00',
      usedAt: null,
      revokedAt: null,
    },
    visitId: 'vis-1',
    createdAt: '2026-10-24T09:00:00-05:00',
    cancelledAt: null,
  });

  it('offers real tokens: active passes first, one probe per problem, and a forged one', () => {
    const shortcuts = qrShortcuts([
      inv('ACTIVE', 'Valentina Restrepo', 'nq_a'),
      inv('USED', 'Tomás Gil', 'nq_b'),
      inv('CANCELLED', 'Sebastián L', 'nq_c'),
      inv('EXPIRED', 'Ana P', 'nq_d'),
      inv('USED', 'Otro', 'nq_e'),
    ]);
    expect(shortcuts.map((s) => s.label)).toEqual([
      'Usar el pase de Valentina',
      'Probar un pase ya usado',
      'Probar un pase cancelado',
      'Probar un pase vencido',
      'Probar un pase manipulado',
    ]);
    expect(shortcuts.slice(0, 4).map((s) => s.token)).toEqual(['nq_a', 'nq_b', 'nq_c', 'nq_d']);
    expect(shortcuts.at(-1)?.token).toMatch(/^nq_x{22}$/);
    expect(qrShortcuts([]).map((s) => s.label)).toEqual(['Probar un pase manipulado']);
  });
});
