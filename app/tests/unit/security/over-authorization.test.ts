// Adversarial sweep: no recognition input, person or instant may yield CONFIRMED without a record
// that is valid at that instant. The oracle below is independent from src/domain/policies.
import type { ClubRecords, Invitation, RecognitionResult } from '@/domain/entities/types';
import type { Visit } from '@/domain/entities/visit';
import { classify } from '@/domain/policies/classify';
import {
  acceptHandoff,
  cancelHandoff,
  confirmHandoff,
  expireHandoff,
  requestHandoff,
  transferContext,
} from '@/domain/policies/handoff-machine';
import { createSeed } from '@/domain/seed';

const DEMO: Invitation = {
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
const records: ClubRecords = { ...createSeed(), invitations: [DEMO] };

const INSTANTS = [
  '2026-10-23T23:59:00-05:00',
  '2026-10-24T00:00:00-05:00',
  '2026-10-24T05:00:00-05:00',
  '2026-10-24T05:59:00-05:00',
  '2026-10-24T06:00:00-05:00',
  '2026-10-24T07:00:00-05:00',
  '2026-10-24T07:59:00-05:00',
  '2026-10-24T08:00:00-05:00',
  '2026-10-24T15:59:00-05:00',
  '2026-10-24T16:00:00-05:00',
  '2026-10-24T16:59:00-05:00',
  '2026-10-24T17:00:00-05:00',
  '2026-10-24T18:59:00-05:00',
  '2026-10-24T19:00:00-05:00',
  '2026-10-24T21:59:00-05:00',
  '2026-10-24T22:00:00-05:00',
  '2026-10-24T23:59:00-05:00',
  '2026-10-25T00:00:00-05:00',
  '2026-10-27T10:00:00-05:00',
  '2027-01-01T10:00:00-05:00',
];
const CONFIDENCES = [
  0,
  0.5,
  0.79,
  0.8,
  1,
  undefined,
  NaN,
  -1,
  -0.01,
  1.01,
  2,
  100,
  Infinity,
  -Infinity,
];
const CANDIDATES = [...records.people.map((p) => p.id), undefined, '', 'V-999', 'v-201'];
const HINTS = ['MEMBER', 'NON_MEMBER'] as const;

// Bogotá wall clock, computed without the code under test (fixed UTC-5, no DST).
function wall(now: Date) {
  const iso = new Date(now.getTime() - 5 * 3_600_000).toISOString();
  return {
    date: iso.slice(0, 10),
    weekday: new Date(iso).getUTCDay(),
    hhmm: iso.slice(11, 16),
  };
}

/** Returns why the record that backs `category` for `personId` does NOT exist (undefined = it exists). */
function backingFailure(
  recs: ClubRecords,
  category: string,
  personId: string,
  now: Date,
): string | undefined {
  const w = wall(now);
  const t = now.getTime();
  switch (category) {
    case 'VIP':
    case 'REGULAR':
      return recs.memberships.some(
        (m) =>
          m.personId === personId &&
          m.status === 'ACTIVE' &&
          m.tier === category &&
          m.validFrom <= w.date &&
          w.date <= m.validTo,
      )
        ? undefined
        : 'no active membership of that tier';
    case 'STAFF':
      return recs.shifts.some(
        (s) => s.personId === personId && Date.parse(s.start) <= t && t < Date.parse(s.end),
      )
        ? undefined
        : 'no shift at that instant';
    case 'EXTERNAL':
      return recs.permits.some(
        (p) =>
          p.personId === personId &&
          p.validFrom <= w.date &&
          w.date <= p.validTo &&
          p.weekdays.includes(w.weekday) &&
          p.from <= w.hhmm &&
          w.hhmm < p.to,
      )
        ? undefined
        : 'no permit at that instant';
    case 'GUEST':
      return recs.invitations.some(
        (i) =>
          i.guestPersonId === personId &&
          i.status === 'ACTIVE' &&
          i.date === w.date &&
          i.windowFrom <= w.hhmm &&
          w.hhmm < i.windowTo,
      )
        ? undefined
        : 'no valid invitation at that instant';
    default:
      return `unknown category ${category}`;
  }
}

function violations(recs: ClubRecords, now: Date, inputs: RecognitionResult[]): string[] {
  const bad: string[] = [];
  for (const rec of inputs) {
    const res = classify(rec, recs, now);
    if (res.state !== 'CONFIRMED') continue;
    const tag = `${JSON.stringify(rec)} @ ${now.toISOString()} -> ${res.category}`;
    if (rec.status !== 'MATCH') {
      bad.push(`${tag}: CONFIRMED without a match`);
      continue;
    }
    if (rec.candidateId !== res.personId) bad.push(`${tag}: personId differs from candidate`);
    const why = backingFailure(recs, res.category, res.personId ?? '', now);
    if (why) bad.push(`${tag}: ${why}`);
    const memberCategory = res.category === 'VIP' || res.category === 'REGULAR';
    if (memberCategory !== (rec.classHint === 'MEMBER')) bad.push(`${tag}: category vs hint`);
    const c = rec.confidence;
    if (c !== undefined && !(Number.isFinite(c) && c >= 0.8 && c <= 1)) {
      bad.push(`${tag}: confidence ${c} accepted`);
    }
  }
  return bad;
}

const matches = (): RecognitionResult[] =>
  HINTS.flatMap((classHint) =>
    CANDIDATES.flatMap((candidateId) =>
      CONFIDENCES.map((confidence) => ({
        status: 'MATCH' as const,
        classHint,
        candidateId,
        confidence,
      })),
    ),
  );

const inconclusive: RecognitionResult[] = [
  { status: 'UNKNOWN' },
  { status: 'ERROR', code: 'CAMERA_DOWN' },
  { status: 'ERROR', code: '' },
];

function stateOrThrows(fn: () => { state: string }): string {
  try {
    return fn().state;
  } catch {
    // Failing closed by exception is acceptable: the API layer maps it to 500, never to access.
    return 'THROWS';
  }
}

describe('sobreautorización: CONFIRMED siempre tiene registro vigente', () => {
  test.each(INSTANTS)('barrido completo en %s', (iso) => {
    const now = new Date(iso);
    expect(violations(records, now, [...matches(), ...inconclusive])).toEqual([]);
  });

  test('el barrido no es trivial: hay CONFIRMED, revisiones y rechazos', () => {
    const states = new Set<string>();
    for (const iso of INSTANTS) {
      for (const rec of matches()) states.add(classify(rec, records, new Date(iso)).state);
    }
    expect(states).toEqual(new Set(['CONFIRMED', 'MANUAL_REVIEW', 'DENIED']));
  });

  test.each([NaN, -1, 1.01, 2, Infinity, -Infinity])(
    'confianza inválida %p nunca confirma, ni con registro vigente',
    (confidence) => {
      const now = new Date('2026-10-24T10:00:00-05:00');
      const res = classify(
        { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence },
        records,
        now,
      );
      expect(res).toEqual({ state: 'MANUAL_REVIEW', reason: 'LOW_CONFIDENCE' });
    },
  );

  test.each([NaN, Infinity, -Infinity, undefined])(
    'minConfidence inválido (%p) conserva el umbral por defecto',
    (minConfidence) => {
      const now = new Date('2026-10-24T10:00:00-05:00');
      const res = classify(
        { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence: 0.5 },
        records,
        now,
        { minConfidence },
      );
      expect(res).toEqual({ state: 'MANUAL_REVIEW', reason: 'LOW_CONFIDENCE' });
    },
  );

  test('sin membresías, turnos, permisos ni invitaciones no hay CONFIRMED', () => {
    const empty: ClubRecords = {
      people: records.people,
      memberships: [],
      shifts: [],
      permits: [],
      invitations: [],
    };
    for (const iso of INSTANTS) {
      const now = new Date(iso);
      for (const rec of matches()) {
        expect(classify(rec, empty, now).state).not.toBe('CONFIRMED');
      }
    }
  });

  test('membresía suspendida, invitación usada/cancelada/vencida y permiso de otro día no autorizan', () => {
    const now = new Date('2026-10-24T10:00:00-05:00');
    const inv = DEMO;
    for (const status of ['USED', 'CANCELLED', 'EXPIRED'] as const) {
      const recs: ClubRecords = { ...records, invitations: [{ ...inv, status }] };
      const res = classify(
        { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-203', confidence: 1 },
        recs,
        now,
      );
      expect(res.state).toBe('DENIED');
    }
    expect(
      classify(
        { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-207', confidence: 1 },
        records,
        now,
      ),
    ).toEqual({ state: 'DENIED', reason: 'MEMBERSHIP_SUSPENDED' });
    expect(
      classify(
        { status: 'MATCH', classHint: 'NON_MEMBER', candidateId: 'V-205', confidence: 1 },
        records,
        new Date('2026-10-27T10:00:00-05:00'),
      ),
    ).toEqual({ state: 'DENIED', reason: 'EXTERNAL_PERMIT_OUTSIDE_WINDOW' });
  });

  test('un registro con fecha u hora ilegible no autoriza: lanza o rechaza, nunca CONFIRMED', () => {
    const now = new Date('2026-10-24T10:00:00-05:00');
    const inv = DEMO;
    const permit = records.permits[0]!;
    const recs: ClubRecords = {
      ...records,
      invitations: [{ ...inv, date: 'mañana', windowFrom: '25:99' }],
      permits: [{ ...permit, from: '8am' }],
    };
    for (const candidateId of ['V-203', 'V-205']) {
      const state = stateOrThrows(() =>
        classify(
          { status: 'MATCH', classHint: 'NON_MEMBER', candidateId, confidence: 1 },
          recs,
          now,
        ),
      );
      expect(state).not.toBe('CONFIRMED');
    }
  });

  test('un instante inválido (NaN) no autoriza a nadie', () => {
    const now = new Date(NaN);
    for (const rec of matches()) {
      expect(stateOrThrows(() => classify(rec, records, now))).not.toBe('CONFIRMED');
    }
  });
});

describe('relevo: el responsable solo cambia al confirmar', () => {
  const T0 = new Date('2026-10-24T09:00:00-05:00');
  const visit: Visit = {
    id: 'v-1',
    personId: 'p-andres',
    category: 'VIP',
    state: 'IN_PROGRESS',
    ownerId: 'p-r2',
    phase: 5,
    entry: 'FACE',
    openedAt: T0.toISOString(),
    history: [],
    version: 1,
  };
  const ctx = { destination: 'Salón' };
  const at = (s: number) => new Date(T0.getTime() + s * 1000);
  const actors = ['p-r2', 'p-r1', 'p-sara', 'p-andres', 'attacker', ''];

  test('con cualquier actor, ownerId solo cambia en confirmHandoff del asignado', () => {
    for (const a of actors.filter((x) => x !== 'p-r2')) {
      expect(requestHandoff(visit, a, 'OPERATIONAL', ctx, T0).ok).toBe(false);
    }
    const req = requestHandoff(visit, 'p-r2', 'ROBOT_FAILURE', ctx, T0);
    if (!req.ok) throw new Error('setup');
    let v = req.value;
    const owners = [v.ownerId];
    for (const a of actors) {
      const acc = acceptHandoff(v, a, at(1));
      if (acc.ok) {
        const r = cancelHandoff(acc.value, a, at(2));
        if (r.ok) owners.push(r.value.ownerId);
      }
      expect(transferContext(v, a, at(1)).ok).toBe(false);
      expect(expireHandoff(v, at(2)).ok).toBe(false);
      expect(confirmHandoff(v, a, at(2)).ok).toBe(false); // nobody accepted yet
    }
    expect(new Set(owners)).toEqual(new Set(['p-r2']));
    // A stranger cannot cancel the handoff; only the owner, the assignee or the system.
    const strangers = actors.filter((x) => !['p-r2', ''].includes(x));
    for (const a of strangers) expect(cancelHandoff(v, a, at(2)).ok).toBe(false);

    const acc = acceptHandoff(v, 'p-sara', at(1));
    if (!acc.ok) throw new Error('setup');
    v = acc.value;
    for (const a of actors.filter((x) => x !== 'p-sara')) {
      expect(confirmHandoff(v, a, at(2)).ok).toBe(false);
    }
    const done = confirmHandoff(v, 'p-sara', at(2));
    if (!done.ok) throw new Error('setup');
    expect(done.value.ownerId).toBe('p-sara');
    v = done.value;
    // Once confirmed, the previous owner can neither cancel it back nor confirm it again.
    expect(cancelHandoff(v, 'p-r2', at(3)).ok).toBe(false);
    expect(confirmHandoff(v, 'p-r2', at(3)).ok).toBe(false);
  });

  test('un relevo vencido no se acepta; el TTL inválido no abre relevos', () => {
    const req = requestHandoff(visit, 'p-r2', 'LOW_BATTERY', ctx, T0, 60);
    if (!req.ok) throw new Error('setup');
    expect(acceptHandoff(req.value, 'p-sara', at(59)).ok).toBe(true);
    expect(acceptHandoff(req.value, 'p-sara', at(60)).ok).toBe(false);
    expect(acceptHandoff(req.value, 'p-sara', at(61)).ok).toBe(false);
    for (const ttl of [NaN, -5, Infinity, 1e20]) {
      expect(requestHandoff(visit, 'p-r2', 'OPERATIONAL', ctx, T0, ttl).ok).toBe(false);
    }
  });
});
