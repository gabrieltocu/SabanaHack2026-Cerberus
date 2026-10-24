// Reglas R01 a R27 de docs/domain/categories-matrix.md sobre el directorio del contrato.
import type {
  ClassificationResult,
  ClubRecords,
  Invitation,
  RecognitionResult,
} from '@/domain/entities/types';
import { classify } from '@/domain/policies/classify';
import { createSeed } from '@/domain/seed';

const at = (iso: string) => new Date(iso);
const T_DEMO = at('2026-10-24T09:00:00-05:00');
const T_SAT_1030 = at('2026-10-24T10:30:00-05:00');
const T_TUE = at('2026-10-27T10:00:00-05:00');

const member = (candidateId?: string, confidence?: number): RecognitionResult => ({
  status: 'MATCH',
  classHint: 'MEMBER',
  candidateId,
  confidence,
});
const nonMember = (candidateId?: string, confidence?: number): RecognitionResult => ({
  status: 'MATCH',
  classHint: 'NON_MEMBER',
  candidateId,
  confidence,
});

const token = (n: number) => `nq_${String(n).padStart(22, 'A')}`;
const invitation = (n: number, over: Partial<Invitation> = {}): Invitation => ({
  id: `inv-0000000${n}`,
  hostId: 'V-202',
  guestName: `Invitado ${n}`,
  date: '2026-10-24',
  windowFrom: '06:00',
  windowTo: '22:00',
  status: 'ACTIVE',
  meetingPoint: 'Terraza',
  createdAt: '2026-10-20T09:00:00-05:00',
  pass: {
    token: token(n),
    validFrom: '2026-10-24T06:00:00-05:00',
    validTo: '2026-10-24T22:00:00-05:00',
  },
  ...over,
});

const base = createSeed();
const QR_VALENTINA = invitation(1, { hostId: 'V-209', guestName: 'Valentina Restrepo' });
const QR_EXPIRED = invitation(2, {
  date: '2026-10-23',
  pass: {
    token: token(2),
    validFrom: '2026-10-23T06:00:00-05:00',
    validTo: '2026-10-23T22:00:00-05:00',
  },
});
const QR_USED = invitation(3, {
  status: 'USED',
  pass: { ...QR_VALENTINA.pass!, token: token(3), usedAt: '2026-10-24T08:00:00-05:00' },
});
const QR_REVOKED = invitation(4, {
  status: 'CANCELLED',
  pass: { ...QR_VALENTINA.pass!, token: token(4), revokedAt: '2026-10-24T08:00:00-05:00' },
});
const QR_FUTURE = invitation(5, {
  date: '2026-10-25',
  pass: {
    token: token(5),
    validFrom: '2026-10-25T06:00:00-05:00',
    validTo: '2026-10-25T22:00:00-05:00',
  },
});
const records: ClubRecords = {
  ...base,
  invitations: [QR_VALENTINA, QR_EXPIRED, QR_USED, QR_REVOKED, QR_FUTURE],
};
const withQr = (inv: Invitation) => ({ qrToken: inv.pass!.token });
const review = (reason: string): ClassificationResult =>
  ({ state: 'MANUAL_REVIEW', reason }) as ClassificationResult;
const denied = (reason: string): ClassificationResult =>
  ({ state: 'DENIED', reason }) as ClassificationResult;

describe('R01 y R02: socios con membresía vigente', () => {
  test('R01 VIP', () => {
    expect(classify(member('V-201', 0.97), records, T_DEMO)).toEqual({
      state: 'CONFIRMED',
      category: 'VIP',
      personId: 'V-201',
      evidence: ['MEMBERSHIP_ACTIVE'],
      suggestedDestination: 'Salón reservado',
    });
  });

  test('R02 regular', () => {
    expect(classify(member('V-202', 0.93), records, T_DEMO)).toMatchObject({
      state: 'CONFIRMED',
      category: 'REGULAR',
      suggestedDestination: 'Cancha de tenis',
    });
  });

  test('socia sin destino registrado: no se inventa uno', () => {
    expect(classify(member('V-209', 0.95), records, T_DEMO)).not.toHaveProperty(
      'suggestedDestination',
    );
  });
});

describe('R03, R04 y R20 a R28: QR de invitación', () => {
  test('R03 QR vigente con pista NON_MEMBER confirma invitado', () => {
    expect(classify(nonMember(undefined, 0.91), records, T_DEMO, withQr(QR_VALENTINA))).toEqual({
      state: 'CONFIRMED',
      category: 'GUEST',
      evidence: ['INVITATION_QR_VALID'],
      invitationId: QR_VALENTINA.id,
      suggestedDestination: 'Terraza',
    });
  });

  test('R04 sin QR ni candidato: NO_EVIDENCE, nunca GUEST', () => {
    expect(classify(nonMember(), records, T_DEMO)).toEqual(review('NO_EVIDENCE'));
  });

  test.each([
    ['R20', QR_EXPIRED, 'QR_EXPIRED'],
    ['R21', QR_USED, 'QR_ALREADY_USED'],
    ['R22', QR_REVOKED, 'QR_REVOKED'],
    ['R23', QR_FUTURE, 'QR_NOT_YET_VALID'],
  ])('%s deniega con su motivo', (_id, inv, reason) => {
    expect(classify(nonMember(), records, T_DEMO, withQr(inv))).toEqual(denied(reason));
  });

  test('R24 token inventado, alterado, truncado o con espacios: siempre QR_UNKNOWN', () => {
    const altered = QR_VALENTINA.pass!.token.slice(0, -1) + 'B';
    for (const t of [
      token(99),
      altered,
      QR_VALENTINA.pass!.token.slice(0, 10),
      ` ${altered}`,
      '',
    ]) {
      expect(classify(nonMember(), records, T_DEMO, { qrToken: t })).toEqual(denied('QR_UNKNOWN'));
    }
  });

  test('R25 revocado y usado a la vez: REVOKED; usado y vencido: ALREADY_USED', () => {
    const both = invitation(6, {
      status: 'CANCELLED',
      pass: { ...QR_VALENTINA.pass!, token: token(6), usedAt: 'x', revokedAt: 'y' },
    });
    const usedExpired = invitation(7, {
      status: 'USED',
      pass: { ...QR_EXPIRED.pass!, token: token(7), usedAt: '2026-10-23T10:00:00-05:00' },
    });
    const custom = { ...records, invitations: [both, usedExpired] };
    expect(classify(nonMember(), custom, T_DEMO, withQr(both))).toEqual(denied('QR_REVOKED'));
    expect(classify(nonMember(), custom, T_DEMO, withQr(usedExpired))).toEqual(
      denied('QR_ALREADY_USED'),
    );
  });

  test('R26 con pista MEMBER el QR se ignora', () => {
    expect(classify(member('V-201', 0.97), records, T_DEMO, withQr(QR_EXPIRED))).toMatchObject({
      state: 'CONFIRMED',
      category: 'VIP',
    });
  });

  test('R27 el candidato tiene prioridad sobre el QR', () => {
    expect(classify(nonMember('V-205', 0.95), records, T_TUE, withQr(QR_VALENTINA))).toEqual(
      denied('EXTERNAL_PERMIT_OUTSIDE_WINDOW'),
    );
  });

  test('R28 rostro desconocido con QR válido: revisión (el QR no se evalúa aquí)', () => {
    expect(classify({ status: 'UNKNOWN' }, records, T_DEMO, withQr(QR_VALENTINA))).toEqual(
      review('FACE_UNKNOWN'),
    );
  });

  test('R10 fronteras de la ventana: 05:59:59 no, 06:00:00 sí, 21:59:59 sí, 22:00:00 no', () => {
    const run = (iso: string) => classify(nonMember(), records, at(iso), withQr(QR_VALENTINA));
    expect(run('2026-10-24T10:59:59Z')).toEqual(denied('QR_NOT_YET_VALID'));
    expect(run('2026-10-24T11:00:00Z').state).toBe('CONFIRMED');
    expect(run('2026-10-25T02:59:59Z').state).toBe('CONFIRMED');
    expect(run('2026-10-25T03:00:00Z')).toEqual(denied('QR_EXPIRED'));
    expect(run('2026-10-25T04:59:59Z')).toEqual(denied('QR_EXPIRED'));
  });
});

describe('R05 a R09 y R19: personal y externos', () => {
  test('R05 personal con turno vigente', () => {
    expect(classify(nonMember('V-204', 0.95), records, T_DEMO)).toEqual({
      state: 'CONFIRMED',
      category: 'STAFF',
      personId: 'V-204',
      evidence: ['STAFF_SHIFT_ACTIVE'],
      suggestedDestination: 'Operaciones',
    });
  });

  test('turno de [08:00, 20:00): 19:59 sí, 20:00 no', () => {
    expect(classify(nonMember('V-204'), records, at('2026-10-24T19:59:00-05:00')).state).toBe(
      'CONFIRMED',
    );
    expect(classify(nonMember('V-204'), records, at('2026-10-24T20:00:00-05:00'))).toEqual(
      review('STAFF_OUTSIDE_SHIFT'),
    );
  });

  test('R19 personal sin turno el día de la demostración', () => {
    expect(classify(nonMember('V-210', 0.95), records, T_DEMO)).toEqual(
      review('STAFF_OUTSIDE_SHIFT'),
    );
  });

  test('R06 externo sábado en horario', () => {
    expect(classify(nonMember('V-205', 0.95), records, T_SAT_1030)).toEqual({
      state: 'CONFIRMED',
      category: 'EXTERNAL',
      personId: 'V-205',
      evidence: ['EXTERNAL_PERMIT_ACTIVE'],
      suggestedDestination: 'Recepción de proveedores',
    });
  });

  test('R07 externo un martes', () => {
    expect(classify(nonMember('V-205', 0.95), records, T_TUE)).toEqual(
      denied('EXTERNAL_PERMIT_OUTSIDE_WINDOW'),
    );
  });

  test('R08 fronteras del horario del sábado', () => {
    const run = (iso: string) => classify(nonMember('V-205'), records, at(iso)).state;
    expect(run('2026-10-24T07:59:59-05:00')).toBe('DENIED');
    expect(run('2026-10-24T08:00:00-05:00')).toBe('CONFIRMED');
    expect(run('2026-10-24T16:59:59-05:00')).toBe('CONFIRMED');
    expect(run('2026-10-24T17:00:00-05:00')).toBe('DENIED');
  });

  test('R09 el día se mide en hora de Bogotá, no en UTC', () => {
    const run = (iso: string) => classify(nonMember('V-205'), records, at(iso)).state;
    expect(run('2026-10-24T04:59:59Z')).toBe('DENIED');
    expect(run('2026-10-24T05:00:00Z')).toBe('DENIED');
    expect(run('2026-10-24T08:00:00Z')).toBe('DENIED');
    expect(run('2026-10-24T13:00:00Z')).toBe('CONFIRMED');
    expect(run('2026-10-25T13:00:00Z')).toBe('DENIED');
  });

  test('permiso fuera del rango de fechas: denegado', () => {
    expect(classify(nonMember('V-205'), records, at('2027-01-02T10:00:00-05:00')).state).toBe(
      'DENIED',
    );
  });
});

describe('R11 a R13: señal facial poco fiable', () => {
  test('R11 rostro desconocido, con o sin candidato', () => {
    expect(classify({ status: 'UNKNOWN' }, records, T_DEMO)).toEqual(review('FACE_UNKNOWN'));
  });

  test('R12 error de cámara', () => {
    expect(classify({ status: 'ERROR', code: 'CAMERA_UNAVAILABLE' }, records, T_DEMO)).toEqual(
      review('FACE_ERROR'),
    );
  });

  test('R13 umbral 0,8 inclusivo (valor del código; ver corrección al contrato)', () => {
    expect(classify(member('V-201', 0.79), records, T_DEMO)).toEqual(review('LOW_CONFIDENCE'));
    expect(classify(member('V-201', 0.8), records, T_DEMO).state).toBe('CONFIRMED');
    expect(classify(member('V-201', 0.62), records, T_DEMO)).toEqual(review('LOW_CONFIDENCE'));
    expect(classify(member('V-201'), records, T_DEMO).state).toBe('CONFIRMED');
  });

  test('confianza NaN, negativa o mayor que 1 es dudosa', () => {
    for (const c of [Number.NaN, -0.5, 1.5, Infinity]) {
      expect(classify(member('V-201', c), records, T_DEMO)).toEqual(review('LOW_CONFIDENCE'));
    }
  });

  test('minConfidence configurable, y uno inválido vuelve al valor por defecto', () => {
    expect(classify(member('V-201', 0.85), records, T_DEMO, { minConfidence: 0.9 })).toEqual(
      review('LOW_CONFIDENCE'),
    );
    expect(classify(member('V-201', 0.5), records, T_DEMO, { minConfidence: 0.4 }).state).toBe(
      'CONFIRMED',
    );
    expect(classify(member('V-201', 0.5), records, T_DEMO, { minConfidence: NaN }).state).toBe(
      'MANUAL_REVIEW',
    );
  });
});

describe('R14 a R18: membresías y contradicciones', () => {
  test('R14 socia y personal: DUAL_ROLE dentro del turno, REGULAR fuera', () => {
    expect(classify(member('V-206', 0.95), records, T_SAT_1030)).toEqual(review('DUAL_ROLE'));
    expect(classify(member('V-206', 0.95), records, T_DEMO)).toMatchObject({
      state: 'CONFIRMED',
      category: 'REGULAR',
    });
  });

  test('R15 membresía vencida: revisión', () => {
    expect(classify(member('V-208', 0.95), records, T_DEMO)).toEqual(review('MEMBERSHIP_EXPIRED'));
  });

  test('R16 membresía suspendida: denegada', () => {
    expect(classify(member('V-207', 0.95), records, T_DEMO)).toEqual(
      denied('MEMBERSHIP_SUSPENDED'),
    );
  });

  test('R17 candidato ausente o desconocido', () => {
    expect(classify(member(undefined, 0.95), records, T_DEMO)).toEqual(
      review('CANDIDATE_NOT_FOUND'),
    );
    expect(classify(member('V-999', 0.95), records, T_DEMO)).toEqual(review('CANDIDATE_NOT_FOUND'));
    expect(classify(nonMember('V-999', 0.95), records, T_DEMO)).toEqual(
      review('CANDIDATE_NOT_FOUND'),
    );
  });

  test('R18 la pista contradice al registro', () => {
    expect(classify(nonMember('V-201', 0.95), records, T_DEMO)).toEqual(
      review('FACE_REGISTRY_MISMATCH'),
    );
    expect(classify(member('V-204', 0.95), records, T_DEMO)).toEqual(
      review('FACE_REGISTRY_MISMATCH'),
    );
  });

  test('MATCH MEMBER de alguien sin membresía jamás es CONFIRMED', () => {
    for (const id of ['V-204', 'V-205', 'V-203', 'U-01', 'R1', 'O-01']) {
      expect(classify(member(id, 0.99), records, T_DEMO).state).toBe('MANUAL_REVIEW');
    }
  });
});

describe('perfil demo consentido: invitada reconocida por rostro (V-203)', () => {
  const valentina = { ...QR_VALENTINA, guestPersonId: 'V-203' };
  const recs: ClubRecords = { ...base, invitations: [valentina] };

  test('con invitación vigente se confirma con la invitación como evidencia', () => {
    expect(classify(nonMember('V-203', 0.93), recs, T_DEMO)).toEqual({
      state: 'CONFIRMED',
      category: 'GUEST',
      personId: 'V-203',
      evidence: ['INVITATION_ACTIVE'],
      invitationId: valentina.id,
      suggestedDestination: 'Terraza',
    });
  });

  test.each([
    ['usada', { status: 'USED' as const }, 'QR_ALREADY_USED'],
    ['cancelada', { status: 'CANCELLED' as const }, 'QR_REVOKED'],
    ['de ayer', { date: '2026-10-23' }, 'QR_EXPIRED'],
    ['de mañana', { date: '2026-10-25' }, 'QR_NOT_YET_VALID'],
  ])('invitación %s deniega', (_n, over, reason) => {
    expect(
      classify(nonMember('V-203'), { ...base, invitations: [{ ...valentina, ...over }] }, T_DEMO),
    ).toEqual(denied(reason));
  });

  test('una vigente gana a otras cerradas y sin invitación no se infiere invitado', () => {
    const closed = { ...valentina, id: 'inv-00000009', status: 'CANCELLED' as const };
    expect(
      classify(nonMember('V-203'), { ...base, invitations: [closed, valentina] }, T_DEMO).state,
    ).toBe('CONFIRMED');
    expect(classify(nonMember('V-203'), base, T_DEMO)).toEqual(review('NO_EVIDENCE'));
    expect(classify(nonMember('U-01', 0.99), base, T_DEMO)).toEqual(review('NO_EVIDENCE'));
  });

  test('una invitación de otra persona no autoriza', () => {
    const other = { ...valentina, guestPersonId: 'V-205' };
    expect(classify(nonMember('V-203'), { ...base, invitations: [other] }, T_DEMO)).toEqual(
      review('NO_EVIDENCE'),
    );
  });
});

describe('invariante de seguridad (F-1)', () => {
  test('sin registros ningún reconocimiento devuelve CONFIRMED', () => {
    const empty: ClubRecords = {
      ...base,
      memberships: [],
      shifts: [],
      permits: [],
      invitations: [],
    };
    for (const person of base.people) {
      for (const hint of [member, nonMember]) {
        expect(classify(hint(person.id, 1), empty, T_DEMO).state).not.toBe('CONFIRMED');
      }
    }
  });

  test('toda confirmación lleva al menos una evidencia de registro', () => {
    for (const person of base.people) {
      for (const hint of [member, nonMember]) {
        for (const now of [T_DEMO, T_SAT_1030, T_TUE]) {
          const r = classify(hint(person.id, 1), records, now);
          if (r.state === 'CONFIRMED') expect(r.evidence.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
