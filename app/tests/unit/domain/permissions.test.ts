import type { ExternalPermit, Invitation, Membership, Shift } from '@/domain/entities/types';
import {
  activeShift,
  invitationStatusAt,
  isMembershipActive,
  permitStatus,
} from '@/domain/policies/permissions';

const at = (iso: string) => new Date(iso);

const membership: Membership = {
  personId: 'p-1',
  tier: 'VIP',
  status: 'ACTIVE',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
};

describe('isMembershipActive', () => {
  test('activa dentro del rango', () => {
    expect(isMembershipActive(membership, at('2026-10-24T10:00:00-05:00'))).toBe(true);
  });

  test('fechas inclusivas en hora local de Bogotá', () => {
    expect(isMembershipActive(membership, at('2026-01-01T00:00:00-05:00'))).toBe(true);
    expect(isMembershipActive(membership, at('2026-12-31T23:59:59-05:00'))).toBe(true);
    // 2027-01-01T04:59:59Z todavía es 31-dic en Bogotá; 05:00:00Z ya es 1-ene.
    expect(isMembershipActive(membership, at('2027-01-01T04:59:59Z'))).toBe(true);
    expect(isMembershipActive(membership, at('2027-01-01T05:00:00Z'))).toBe(false);
    expect(isMembershipActive(membership, at('2025-12-31T23:59:59-05:00'))).toBe(false);
  });

  test('suspendida o inexistente no es activa', () => {
    expect(
      isMembershipActive({ ...membership, status: 'SUSPENDED' }, at('2026-10-24T10:00:00-05:00')),
    ).toBe(false);
    expect(isMembershipActive(undefined, at('2026-10-24T10:00:00-05:00'))).toBe(false);
  });
});

describe('activeShift', () => {
  const shifts: Shift[] = [
    {
      personId: 'p-1',
      start: '2026-10-24T07:00:00-05:00',
      end: '2026-10-24T19:00:00-05:00',
      area: 'Operaciones',
    },
  ];

  test('inclusivo al inicio, exclusivo al final', () => {
    expect(activeShift(shifts, 'p-1', at('2026-10-24T06:59:59-05:00'))).toBeUndefined();
    expect(activeShift(shifts, 'p-1', at('2026-10-24T07:00:00-05:00'))).toBe(shifts[0]);
    expect(activeShift(shifts, 'p-1', at('2026-10-24T18:59:59-05:00'))).toBe(shifts[0]);
    expect(activeShift(shifts, 'p-1', at('2026-10-24T19:00:00-05:00'))).toBeUndefined();
  });

  test('ignora turnos de otra persona', () => {
    expect(activeShift(shifts, 'p-2', at('2026-10-24T10:00:00-05:00'))).toBeUndefined();
  });
});

describe('permitStatus', () => {
  const permit: ExternalPermit = {
    id: 'OT-1',
    company: 'Proveedor',
    personId: 'p-1',
    sponsorId: 'p-2',
    purpose: 'Mantenimiento',
    meetingPoint: 'Recepción de proveedores',
    weekdays: [6],
    from: '08:00',
    to: '17:00',
    validFrom: '2026-10-01',
    validTo: '2026-12-31',
  };

  test('sábado dentro del horario: ACTIVE', () => {
    expect(permitStatus(permit, at('2026-10-24T10:00:00-05:00'))).toBe('ACTIVE');
  });

  test('inicio inclusivo (08:00) y fin exclusivo (17:00)', () => {
    expect(permitStatus(permit, at('2026-10-24T08:00:00-05:00'))).toBe('ACTIVE');
    expect(permitStatus(permit, at('2026-10-24T16:59:00-05:00'))).toBe('ACTIVE');
    expect(permitStatus(permit, at('2026-10-24T17:00:00-05:00'))).toBe('OUTSIDE_HOURS');
    expect(permitStatus(permit, at('2026-10-24T07:59:00-05:00'))).toBe('OUTSIDE_HOURS');
  });

  test('martes con permiso solo de sábado: WRONG_DAY', () => {
    expect(permitStatus(permit, at('2026-10-27T10:00:00-05:00'))).toBe('WRONG_DAY');
  });

  test('fuera del rango de fechas: OUT_OF_RANGE (antes y después, inclusivo)', () => {
    expect(permitStatus(permit, at('2026-09-26T10:00:00-05:00'))).toBe('OUT_OF_RANGE');
    expect(permitStatus(permit, at('2027-01-02T10:00:00-05:00'))).toBe('OUT_OF_RANGE');
    expect(
      permitStatus({ ...permit, validTo: '2026-10-24' }, at('2026-10-24T10:00:00-05:00')),
    ).toBe('ACTIVE');
  });

  test('usa el día de Bogotá: 04:59:59Z del sábado es aún viernes', () => {
    expect(permitStatus(permit, at('2026-10-24T04:59:59Z'))).toBe('WRONG_DAY');
  });
});

describe('invitationStatusAt', () => {
  const inv: Invitation = {
    id: 'i-1',
    hostId: 'p-2',
    guestName: 'Valentina',
    guestPersonId: 'p-1',
    date: '2026-10-24',
    windowFrom: '06:00',
    windowTo: '22:00',
    status: 'ACTIVE',
    createdAt: '2026-10-20T09:00:00-05:00',
  };

  test('VALID dentro de la ventana, inicio inclusivo y fin exclusivo', () => {
    expect(invitationStatusAt(inv, at('2026-10-24T06:00:00-05:00'))).toBe('VALID');
    expect(invitationStatusAt(inv, at('2026-10-24T21:59:00-05:00'))).toBe('VALID');
    expect(invitationStatusAt(inv, at('2026-10-24T22:00:00-05:00'))).toBe('EXPIRED');
  });

  test('NOT_YET antes de la ventana o un día antes', () => {
    expect(invitationStatusAt(inv, at('2026-10-24T05:59:00-05:00'))).toBe('NOT_YET');
    expect(invitationStatusAt(inv, at('2026-10-23T12:00:00-05:00'))).toBe('NOT_YET');
  });

  test('invitación del día anterior: EXPIRED', () => {
    expect(invitationStatusAt(inv, at('2026-10-25T10:00:00-05:00'))).toBe('EXPIRED');
  });

  test('estados terminales guardados prevalecen sobre la ventana', () => {
    const now = at('2026-10-24T10:00:00-05:00');
    expect(invitationStatusAt({ ...inv, status: 'CANCELLED' }, now)).toBe('CANCELLED');
    expect(invitationStatusAt({ ...inv, status: 'USED' }, now)).toBe('USED');
    expect(invitationStatusAt({ ...inv, status: 'EXPIRED' }, now)).toBe('EXPIRED');
  });
});
