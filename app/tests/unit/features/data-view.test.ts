import {
  clockOf,
  firstName,
  longDateLabel,
  memberId,
  permitDayName,
  shortName,
  timeLabel,
  toInvitationSummary,
  toPassView,
  toProfiles,
  toVisitSummary,
} from '@/features/data/view';
import type { Invitation, Person, Visit } from '@/infrastructure/contracts';

const person = (id: string, displayName: string, roles: Person['roles'] = ['MEMBER']): Person => ({
  id,
  displayName,
  roles,
  defaultDestination: null,
});

const invitation = (over: Partial<Invitation> = {}): Invitation => ({
  id: 'inv-00000001',
  hostId: 'V-202',
  guest: { fullName: 'Sebastián Lozano', note: 'Café', ref: 'G-1' },
  meetingPoint: null,
  date: '2026-10-25',
  window: { from: '06:00', to: '22:00' },
  state: 'ACTIVE',
  qr: {
    token: 'nq_Zx9Lm2QwR7tYb4NcV1sHaA',
    validFrom: '2026-10-25T06:00:00-05:00',
    validTo: '2026-10-25T22:00:00-05:00',
    usedAt: null,
    revokedAt: null,
  },
  visitId: 'vis-00000001',
  createdAt: '2026-10-24T09:00:00-05:00',
  cancelledAt: null,
  ...over,
});

describe('formatos de la API', () => {
  it('lee el reloj de la demostración sin pasar por la zona horaria del equipo', () => {
    expect(
      clockOf({
        status: 'ok',
        contract: 'v1',
        storage: 'browser',
        demo: true,
        clock: { now: '2026-10-27T18:05:00-05:00', timezone: 'America/Bogota' },
      }),
    ).toEqual({ iso: '2026-10-27T18:05:00-05:00', day: '2026-10-27', hour: 18 });
  });

  it('da formato a horas y fechas como el resto de la aplicación', () => {
    expect(timeLabel('00:30')).toBe('12:30 a. m.');
    expect(timeLabel('12:00')).toBe('12:00 p. m.');
    expect(timeLabel('16:05')).toBe('4:05 p. m.');
    expect(longDateLabel('2026-10-27')).toBe('Martes 27 oct 2026');
    expect(firstName('  Ángela   María Pérez ')).toBe('Ángela');
    expect(shortName(person('R2', 'R2 · acompañamiento', ['ROBOT']))).toBe('R2');
    expect(shortName(person('V-201', 'Andrés Mejía'))).toBe('Andrés');
  });

  it('reconoce solo a los dos socios de la demostración', () => {
    expect(memberId('V-202')).toBe('V-202');
    expect(memberId('V-204')).toBe('V-201');
    expect(memberId('constructor')).toBe('V-201');
    expect(memberId(undefined)).toBe('V-201');
  });

  it('arma los perfiles que existen en el directorio, en el orden de la portada', () => {
    const profiles = toProfiles([
      person('R1', 'R1 · recepción', ['ROBOT']),
      person('V-201', 'Andrés Mejía'),
      person('V-209', 'Male Ospina'),
    ]);
    expect(profiles.map((p) => [p.id, p.name, p.roleLabel, p.href])).toEqual([
      ['V-201', 'Andrés', 'Socio VIP', '/entrar?cuenta=sofia@nclub.demo'],
      ['R1', 'Robot R1', 'Recepción', '/robot'],
    ]);
    expect(profiles[0]?.category).toBe('VIP');
    expect(profiles[1]).not.toHaveProperty('category');
  });
});

describe('permisos de externos', () => {
  const permit = { daysOfWeek: ['SAT'], validFrom: '2026-10-01', validTo: '2026-12-31' };

  it('es el día de hoy solo si el permiso lo cubre y está vigente', () => {
    expect(permitDayName(permit, '2026-10-24')).toBe('sábado');
    expect(permitDayName(permit, '2026-10-27')).toBe('sábado');
    expect(permitDayName(permit, '2027-01-02')).toBe('otro día');
    expect(permitDayName({ ...permit, daysOfWeek: ['SAT', 'TUE'] }, '2026-10-27')).toBe('martes');
  });
});

describe('invitaciones y pases', () => {
  it('resume la invitación para el anfitrión', () => {
    expect(toInvitationSummary(invitation())).toEqual({
      id: 'inv-00000001',
      guestName: 'Sebastián Lozano',
      dateLabel: 'dom 25 oct 2026',
      meetingPoint: 'Punto por acordar',
      status: 'ACTIVE',
      token: 'nq_Zx9Lm2QwR7tYb4NcV1sHaA',
    });
  });

  it('muestra al invitado solo su nombre de pila y el estado real del pase', () => {
    const early = toPassView(invitation(), 'Camila', '2026-10-24T09:00:00-05:00');
    expect(early).toMatchObject({
      guestName: 'Sebastián',
      hostName: 'Camila',
      status: 'NOT_YET_VALID',
      fromLabel: 'dom 25 oct 2026',
      validityLabel: 'Válido el dom 25 oct 2026',
      spokenDate: 'domingo 25 de octubre',
    });
    expect(toPassView(invitation(), 'Camila', '2026-10-25T09:00:00-05:00').status).toBe('VALID');
    // La vista previa del anfitrión no compara con el reloj.
    expect(toPassView(invitation(), 'Camila').status).toBe('VALID');
    expect(toPassView(invitation({ state: 'USED' }), 'Camila').status).toBe('USED');
    expect(toPassView(invitation({ state: 'EXPIRED' }), 'Camila').status).toBe('EXPIRED');
    expect(toPassView(invitation({ state: 'CANCELLED' }), 'Camila').status).toBe('REVOKED');
  });
});

describe('visitas', () => {
  const visit = (over: Partial<Visit> = {}): Visit => ({
    id: 'vis-00000002',
    state: 'ORIENTING',
    category: 'VIP',
    visitor: { ref: 'V-201', personId: 'V-201', displayName: 'Andrés Mejía' },
    destination: null,
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
    ...over,
  });

  it('traduce el estado, el responsable y si viene del presentador', () => {
    expect(toVisitSummary(visit(), 'R1')).toMatchObject({
      statusLabel: 'Orientando',
      statusKind: 'info',
      responsible: 'Te atiende R1',
      simulated: false,
      closed: false,
    });
    expect(toVisitSummary(visit()).responsible).toBeUndefined();
    expect(
      toVisitSummary(
        visit({
          state: 'CLOSED',
          feedbackSubmitted: true,
          destination: 'Terraza',
          visitor: { ref: null, personId: null, displayName: 'x' },
          recognition: {
            source: { kind: 'SIMULATOR', id: 'R1' },
            simulated: true,
            face: { status: 'UNKNOWN' },
            confidence: null,
            observedAt: '2026-10-24T09:00:00-05:00',
          },
        }),
      ),
    ).toMatchObject({
      statusLabel: 'Cerrada',
      closed: true,
      feedbackSent: true,
      simulated: true,
      destination: 'Terraza',
      reference: '',
    });
  });
});
