// Fail-closed regressions found by the security review: invalid clocks and dates, permit fallback
// and the exclusive end of the QR window. Each test was red before its fix.
import type { ClubRecords, Invitation, RecognitionResult } from '@/domain/entities/types';
import { bogotaInstant, bogotaParts } from '@/domain/policies/bogota-time';
import { classify } from '@/domain/policies/classify';
import {
  activeShift,
  invitationStatusAt,
  isMembershipActive,
  permitStatus,
} from '@/domain/policies/permissions';
import { checkPass, generateToken } from '@/domain/policies/qr-token';
import { createSeed } from '@/domain/seed';

const INVITATION: Invitation = {
  id: 'inv-00000001',
  hostId: 'V-209',
  guestName: 'Valentina Restrepo',
  guestPersonId: 'V-203',
  date: '2026-10-24',
  windowFrom: '06:00',
  windowTo: '22:00',
  status: 'ACTIVE',
  createdAt: '2026-10-23T09:00:00-05:00',
};
const records: ClubRecords = { ...createSeed(), invitations: [INVITATION] };
const NOW = new Date('2026-10-24T10:00:00-05:00');
const nonMember = (candidateId: string): RecognitionResult => ({
  status: 'MATCH',
  classHint: 'NON_MEMBER',
  candidateId,
  confidence: 0.95,
});

describe('reloj inválido (NaN): ninguna regla de vigencia autoriza', () => {
  const bad = new Date(NaN);

  test('membresía, turno, permiso e invitación', () => {
    expect(isMembershipActive(records.memberships[0], bad)).toBe(false);
    expect(activeShift(records.shifts, 'V-204', bad)).toBeUndefined();
    expect(permitStatus(records.permits[0]!, bad)).not.toBe('ACTIVE');
    expect(invitationStatusAt(INVITATION, bad)).not.toBe('VALID');
  });

  test('bogotaParts lanza con un instante inválido', () => {
    expect(() => bogotaParts(bad)).toThrow('INVALID_INSTANT');
  });

  test('classify nunca confirma con reloj inválido', () => {
    for (const p of records.people) {
      for (const classHint of ['MEMBER', 'NON_MEMBER'] as const) {
        const res = classify(
          { status: 'MATCH', classHint, candidateId: p.id, confidence: 1 },
          records,
          bad,
        );
        expect(res.state).not.toBe('CONFIRMED');
      }
    }
  });
});

describe('fechas inexistentes', () => {
  test.each(['2026-02-31', '2026-02-29', '2026-04-31', '2026-00-10', '2026-10-00', '2026-13-01'])(
    'bogotaInstant lanza con %s',
    (date) => {
      expect(() => bogotaInstant(date, '10:00')).toThrow('INVALID_LOCAL_DATE');
    },
  );

  test('acepta el 29 de febrero bisiesto y fin de mes', () => {
    expect(bogotaInstant('2028-02-29', '00:00').toISOString()).toBe('2028-02-29T05:00:00.000Z');
    expect(bogotaInstant('2026-10-31', '23:59').toISOString()).toBe('2026-11-01T04:59:00.000Z');
  });

  test('una invitación con fecha inexistente nunca autoriza', () => {
    const inv = { ...INVITATION, date: '2026-02-31' };
    expect(() => invitationStatusAt(inv, NOW)).toThrow();
  });
});

describe('permiso no vigente: se consideran las invitaciones', () => {
  const laura = records.permits[0]!; // sábados 08:00-17:00
  const invitation = (over = {}) => ({
    ...INVITATION,
    id: 'inv-laura',
    guestPersonId: 'V-205',
    ...over,
  });
  const withRecords = (extra: Partial<ClubRecords>): ClubRecords => ({ ...records, ...extra });
  const SAT_EARLY = new Date('2026-10-24T07:00:00-05:00'); // fuera del horario del permiso

  test('permiso fuera de horario + invitación vigente -> GUEST', () => {
    const recs = withRecords({ invitations: [invitation()] });
    expect(classify(nonMember('V-205'), recs, SAT_EARLY)).toMatchObject({
      state: 'CONFIRMED',
      category: 'GUEST',
      personId: 'V-205',
    });
  });

  test('permiso fuera de horario + invitación no vigente -> DENIED con el motivo del permiso', () => {
    for (const status of ['USED', 'CANCELLED', 'EXPIRED'] as const) {
      const recs = withRecords({ invitations: [invitation({ status })] });
      expect(classify(nonMember('V-205'), recs, SAT_EARLY)).toEqual({
        state: 'DENIED',
        reason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
      });
    }
  });

  test('varios permisos: el motivo es el del más reciente por validTo, sin importar el orden', () => {
    const old = { ...laura, id: 'pm-old', validFrom: '2026-01-01', validTo: '2026-02-01' };
    const current = { ...laura, id: 'pm-new' };
    for (const permits of [
      [old, current],
      [current, old],
    ]) {
      const recs = withRecords({ permits });
      expect(classify(nonMember('V-205'), recs, SAT_EARLY)).toEqual({
        state: 'DENIED',
        reason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
      });
    }
  });

  test('un permiso vigente sigue ganando a la invitación', () => {
    const recs = withRecords({ invitations: [invitation()] });
    expect(classify(nonMember('V-205'), recs, NOW)).toMatchObject({ category: 'EXTERNAL' });
  });

  test('sin invitación, el rechazo conserva el motivo del permiso', () => {
    expect(classify(nonMember('V-205'), records, SAT_EARLY)).toEqual({
      state: 'DENIED',
      reason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW',
    });
  });
});

describe('pase QR: el fin de ventana es exclusivo', () => {
  const token = generateToken((n) => new Uint8Array(n).fill(7));
  const record = {
    token,
    invitationId: 'inv-valentina',
    validFrom: '2026-10-24T06:00:00-05:00',
    validTo: '2026-10-24T22:00:00-05:00',
  };

  test('validFrom entra, validTo exacto ya vence', () => {
    expect(checkPass(record, token, new Date(record.validFrom))).toEqual({ ok: true });
    expect(checkPass(record, token, new Date('2026-10-24T21:59:59.999-05:00'))).toEqual({
      ok: true,
    });
    expect(checkPass(record, token, new Date(record.validTo))).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
  });
});
