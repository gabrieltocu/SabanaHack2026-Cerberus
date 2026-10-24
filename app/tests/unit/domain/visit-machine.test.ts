import type { Visit, VisitState } from '@/domain/entities/visit';
import {
  advancePhase,
  applyClassification,
  closeVisit,
  recordFeedback,
  transitionVisit,
} from '@/domain/policies/visit-machine';

const NOW = new Date('2026-10-24T09:00:00-05:00');
const LATER = new Date('2026-10-24T09:05:00-05:00');

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v-1',
  state: 'EXPECTED',
  ownerId: 'p-r1',
  phase: 0,
  entry: 'FACE',
  openedAt: NOW.toISOString(),
  history: [],
  version: 0,
  ...over,
});

const ALL: VisitState[] = [
  'EXPECTED',
  'IDENTIFYING',
  'VERIFIED',
  'ORIENTING',
  'IN_PROGRESS',
  'WAITING_HANDOFF',
  'MANUAL_REVIEW',
  'FAILED',
  'CLOSED',
];

const ALLOWED: [VisitState, VisitState][] = [
  ['EXPECTED', 'IDENTIFYING'],
  ['IDENTIFYING', 'VERIFIED'],
  ['IDENTIFYING', 'MANUAL_REVIEW'],
  ['IDENTIFYING', 'FAILED'],
  ['MANUAL_REVIEW', 'VERIFIED'],
  ['MANUAL_REVIEW', 'FAILED'],
  ['MANUAL_REVIEW', 'CLOSED'],
  ['VERIFIED', 'ORIENTING'],
  ['ORIENTING', 'IN_PROGRESS'],
  ['ORIENTING', 'CLOSED'],
  ['IN_PROGRESS', 'CLOSED'],
  ['FAILED', 'CLOSED'],
  // QR check-in (V-04), invitation cancelled or missed, close at exit (V-14) and operator abort (V-20).
  ['EXPECTED', 'VERIFIED'],
  ['EXPECTED', 'CLOSED'],
  ['VERIFIED', 'CLOSED'],
  ['VERIFIED', 'FAILED'],
  ['ORIENTING', 'FAILED'],
  ['IN_PROGRESS', 'FAILED'],
];

describe('transitionVisit: transiciones permitidas', () => {
  test.each(ALLOWED)('%s -> %s', (from, to) => {
    const input = visit({ state: from });
    const r = transitionVisit(input, to, 'p-r1', LATER, 'nota');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state).toBe(to);
    expect(r.value.version).toBe(1);
    expect(r.value.history).toEqual([
      { at: LATER.toISOString(), from, to, by: 'p-r1', note: 'nota' },
    ]);
  });

  test('nunca muta la entrada', () => {
    const input = visit();
    const snapshot = JSON.parse(JSON.stringify(input));
    transitionVisit(input, 'IDENTIFYING', 'p-r1', LATER);
    expect(input).toEqual(snapshot);
  });

  test('sin nota no escribe la clave note; cerrar fija closedAt', () => {
    const r = transitionVisit(visit({ state: 'FAILED' }), 'CLOSED', 'p-r1', LATER);
    expect(r.ok && r.value.history[0]).toEqual({
      at: LATER.toISOString(),
      from: 'FAILED',
      to: 'CLOSED',
      by: 'p-r1',
    });
    expect(r.ok && r.value.closedAt).toBe(LATER.toISOString());
  });
});

describe('transitionVisit: transiciones prohibidas', () => {
  const FORBIDDEN: [VisitState, VisitState][] = [
    ['IDENTIFYING', 'IN_PROGRESS'],
    ['VERIFIED', 'IN_PROGRESS'],
    ['FAILED', 'VERIFIED'],
    ['IN_PROGRESS', 'ORIENTING'],
    ['ORIENTING', 'EXPECTED'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
  ];

  test.each(FORBIDDEN)('%s -> %s es INVALID_TRANSITION', (from, to) => {
    const r = transitionVisit(visit({ state: from }), to, 'p-r1', LATER);
    expect(r).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
  });

  test.each(ALL)('CLOSED -> %s es VISIT_CLOSED', (to) => {
    const r = transitionVisit(visit({ state: 'CLOSED' }), to, 'p-r1', LATER);
    expect(r).toEqual({ ok: false, error: 'VISIT_CLOSED' });
  });

  test('toda pareja no listada se rechaza', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const listed = ALLOWED.some(([f, t]) => f === from && t === to);
        const r = transitionVisit(visit({ state: from }), to, 'p-r1', LATER);
        expect(r.ok).toBe(listed);
      }
    }
  });
});

describe('transitionVisit: WAITING_HANDOFF solo por el relevo (B2)', () => {
  test.each(['ORIENTING', 'IN_PROGRESS', 'EXPECTED'] as const)(
    '%s -> WAITING_HANDOFF es USE_HANDOFF',
    (from) => {
      const r = transitionVisit(visit({ state: from }), 'WAITING_HANDOFF', 'p-r1', LATER);
      expect(r).toEqual({ ok: false, error: 'USE_HANDOFF' });
    },
  );

  test.each(ALL.filter((s) => s !== 'CLOSED'))('WAITING_HANDOFF -> %s es USE_HANDOFF', (to) => {
    const r = transitionVisit(visit({ state: 'WAITING_HANDOFF' }), to, 'p-r1', LATER);
    expect(r).toEqual({ ok: false, error: 'USE_HANDOFF' });
  });

  test('transitionVisit no cierra desde WAITING_HANDOFF: lo hace closeVisit', () => {
    expect(transitionVisit(visit({ state: 'WAITING_HANDOFF' }), 'CLOSED', 'p-r1', LATER)).toEqual({
      ok: false,
      error: 'USE_HANDOFF',
    });
  });
});

describe('applyClassification', () => {
  const identifying = visit({ state: 'IDENTIFYING' });

  test('CONFIRMED -> VERIFIED con categoría y persona', () => {
    const result = {
      state: 'CONFIRMED' as const,
      category: 'VIP' as const,
      personId: 'p-andres',
      evidence: ['MEMBERSHIP_ACTIVE' as const],
    };
    const r = applyClassification(identifying, result, 'p-r1', LATER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      state: 'VERIFIED',
      category: 'VIP',
      personId: 'p-andres',
      classification: result,
      version: 1,
    });
  });

  test('MANUAL_REVIEW -> MANUAL_REVIEW y conserva el resultado', () => {
    const result = { state: 'MANUAL_REVIEW' as const, reason: 'LOW_CONFIDENCE' as const };
    const r = applyClassification(identifying, result, 'p-r1', LATER, 'duda');
    expect(r.ok && r.value.state).toBe('MANUAL_REVIEW');
    expect(r.ok && r.value.classification).toEqual(result);
    expect(r.ok && r.value.category).toBeUndefined();
  });

  test('DENIED -> FAILED', () => {
    const r = applyClassification(
      identifying,
      { state: 'DENIED', reason: 'QR_UNKNOWN' },
      'p-r1',
      LATER,
    );
    expect(r.ok && r.value.state).toBe('FAILED');
  });

  test('la revisión manual puede confirmar', () => {
    const r = applyClassification(
      visit({ state: 'MANUAL_REVIEW' }),
      {
        state: 'CONFIRMED',
        category: 'GUEST',
        personId: 'p-male',
        evidence: ['INVITATION_QR_VALID'],
      },
      'p-sara',
      LATER,
    );
    expect(r.ok && r.value.state).toBe('VERIFIED');
  });

  test('es idempotente: la misma clasificación devuelve la misma visita (comparación profunda)', () => {
    const result = {
      state: 'CONFIRMED' as const,
      category: 'VIP' as const,
      personId: 'p-andres',
      evidence: ['MEMBERSHIP_ACTIVE' as const],
    };
    const first = applyClassification(identifying, result, 'p-r1', LATER);
    if (!first.ok) throw new Error('setup');
    // Copia con otro orden de claves: sigue siendo la misma clasificación.
    const same = {
      evidence: ['MEMBERSHIP_ACTIVE' as const],
      personId: 'p-andres',
      category: 'VIP',
      state: 'CONFIRMED',
    };
    const again = applyClassification(first.value, same as typeof result, 'p-r1', LATER);
    expect(again.ok && again.value).toBe(first.value);
    expect(first.value.version).toBe(1);
    expect(first.value.history).toHaveLength(1);
  });

  test('una clasificación distinta no es idempotente', () => {
    const first = applyClassification(
      identifying,
      { state: 'MANUAL_REVIEW', reason: 'FACE_UNKNOWN' },
      'p-r1',
      LATER,
    );
    if (!first.ok) throw new Error('setup');
    const other = applyClassification(
      first.value,
      { state: 'MANUAL_REVIEW', reason: 'NO_EVIDENCE' },
      'p-r1',
      LATER,
    );
    expect(other).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
  });

  test('desde un estado que no clasifica es INVALID_TRANSITION; cerrada es VISIT_CLOSED', () => {
    const denied = { state: 'DENIED' as const, reason: 'QR_UNKNOWN' as const };
    expect(applyClassification(visit({ state: 'ORIENTING' }), denied, 'p-r1', LATER)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
    expect(applyClassification(visit({ state: 'CLOSED' }), denied, 'p-r1', LATER)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
  });
});

describe('advancePhase', () => {
  test('avanza en ORIENTING e IN_PROGRESS y deja historial', () => {
    for (const state of ['ORIENTING', 'IN_PROGRESS'] as const) {
      const r = advancePhase(visit({ state, phase: 3 }), 5, 'R2', LATER);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.phase).toBe(5);
      expect(r.value.version).toBe(1);
      expect(r.value.history).toHaveLength(1);
      expect(r.value.history[0]).toMatchObject({ from: state, to: state, by: 'R2' });
    }
  });

  test('es idempotente si toPhase === phase: misma visita, sin historial', () => {
    const input = visit({ state: 'IN_PROGRESS', phase: 5 });
    const r = advancePhase(input, 5, 'R2', LATER);
    expect(r).toEqual({ ok: true, value: input });
    expect(r.ok && r.value).toBe(input);
  });

  test('no retrocede', () => {
    const r = advancePhase(visit({ state: 'IN_PROGRESS', phase: 5 }), 4, 'R2', LATER);
    expect(r).toEqual({ ok: false, error: 'PHASE_REGRESSION' });
  });

  test.each([-1, 10, 2.5, Number.NaN])('fase fuera de rango %s es INVALID_PHASE', (p) => {
    const r = advancePhase(visit({ state: 'IN_PROGRESS', phase: 3 }), p, 'R2', LATER);
    expect(r).toEqual({ ok: false, error: 'INVALID_PHASE' });
  });

  test('en otros estados es INVALID_TRANSITION; cerrada es VISIT_CLOSED', () => {
    expect(advancePhase(visit({ state: 'WAITING_HANDOFF' }), 3, 'R2', LATER)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
    expect(advancePhase(visit({ state: 'CLOSED' }), 3, 'R2', LATER)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
  });
});

describe('closeVisit', () => {
  test('cierra una visita en curso', () => {
    const r = closeVisit(visit({ state: 'IN_PROGRESS' }), 'p-sara', LATER, 'salida');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state).toBe('CLOSED');
    expect(r.value.closedAt).toBe(LATER.toISOString());
    expect(r.value.history).toHaveLength(1);
  });

  test('es idempotente: cerrar dos veces no duplica historial ni versión', () => {
    const first = closeVisit(visit({ state: 'IN_PROGRESS' }), 'p-sara', LATER);
    if (!first.ok) throw new Error('setup');
    const second = closeVisit(first.value, 'p-sara', new Date('2026-10-24T10:00:00-05:00'));
    expect(second.ok && second.value).toBe(first.value);
    expect(second.ok && second.value.history).toHaveLength(1);
    expect(second.ok && second.value.version).toBe(1);
  });

  test('desde un estado que no cierra es INVALID_TRANSITION', () => {
    expect(closeVisit(visit({ state: 'IDENTIFYING' }), 'p-r1', LATER)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
  });
});

describe('recordFeedback', () => {
  test('acepta 1..5 en visita cerrada', () => {
    const r = recordFeedback(visit({ state: 'CLOSED', phase: 9 }), {
      robot: 5,
      club: 4,
      comment: 'Muy amable',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.feedback).toEqual({ robot: 5, club: 4, comment: 'Muy amable' });
    expect(r.value.version).toBe(1);
  });

  test('acepta en fase >= 7 aunque la visita siga abierta; solo comentario también', () => {
    const r = recordFeedback(visit({ state: 'IN_PROGRESS', phase: 7 }), { comment: 'ok' });
    expect(r.ok).toBe(true);
  });

  test('rechaza antes de la fase 7 si no está cerrada', () => {
    const r = recordFeedback(visit({ state: 'ORIENTING', phase: 6 }), { robot: 3 });
    expect(r).toEqual({ ok: false, error: 'FEEDBACK_NOT_ALLOWED' });
  });

  test('el contrato también admite evaluar con la visita en IN_PROGRESS', () => {
    const r = recordFeedback(visit({ state: 'IN_PROGRESS', phase: 6 }), { club: 4 });
    expect(r.ok && r.value.feedback).toEqual({ club: 4 });
  });

  test('solo un comentario del club también cuenta como evaluación', () => {
    const r = recordFeedback(visit({ state: 'CLOSED' }), { clubComment: 'Muy amable.' });
    expect(r.ok).toBe(true);
  });

  test.each([0, 6, 3.5, Number.NaN])('rechaza calificación %s', (n) => {
    const closed = visit({ state: 'CLOSED', phase: 9 });
    expect(recordFeedback(closed, { robot: n })).toEqual({ ok: false, error: 'INVALID_RATING' });
    expect(recordFeedback(closed, { club: n })).toEqual({ ok: false, error: 'INVALID_RATING' });
  });

  test('es idempotente: el mismo feedback devuelve la misma visita sin subir versión', () => {
    const first = recordFeedback(visit({ state: 'CLOSED', phase: 9 }), { robot: 5, comment: 'ok' });
    if (!first.ok) throw new Error('setup');
    const again = recordFeedback(first.value, { comment: 'ok', robot: 5 });
    expect(again.ok && again.value).toBe(first.value);
    expect(first.value.version).toBe(1);
    const changed = recordFeedback(first.value, { robot: 4, comment: 'ok' });
    expect(changed.ok && changed.value.version).toBe(2);
  });

  test('rechaza una valoración vacía', () => {
    expect(recordFeedback(visit({ state: 'CLOSED', phase: 9 }), {})).toEqual({
      ok: false,
      error: 'EMPTY_FEEDBACK',
    });
  });
});
