// Operaciones de la visita que expone la API: orientar, asignar, llegar, cerrar y abortar.
import type { Visit } from '@/domain/entities/visit';
import {
  acceptHandoff,
  cancelHandoff,
  confirmHandoff,
  expireHandoff,
  requestHandoff,
  transferContext,
} from '@/domain/policies/handoff-machine';
import {
  abortVisit,
  assignEscort,
  closeVisit,
  markArrival,
  startOrientation,
} from '@/domain/policies/visit-machine';

const T0 = new Date('2026-10-24T09:00:00-05:00');
const T1 = new Date('2026-10-24T09:01:00-05:00');
const T2 = new Date('2026-10-24T09:02:00-05:00');

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'vis-00000001',
  state: 'VERIFIED',
  ownerId: 'R1',
  destination: 'Salón reservado',
  phase: 0,
  entry: 'FACE',
  openedAt: T0.toISOString(),
  history: [],
  version: 1,
  ...over,
});

const must = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw new Error(`setup: ${String(r.error)}`);
  return r.value;
};

describe('startOrientation, assignEscort y markArrival', () => {
  test('VERIFIED -> ORIENTING conserva el destino sugerido o toma el indicado', () => {
    expect(must(startOrientation(visit(), 'R1', T1))).toMatchObject({
      state: 'ORIENTING',
      destination: 'Salón reservado',
      version: 2,
    });
    expect(must(startOrientation(visit(), 'R1', T1, 'Terraza')).destination).toBe('Terraza');
    expect(startOrientation(visit({ state: 'ORIENTING' }), 'R1', T1)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
  });

  test('ASSIGN_ESCORT cambia el responsable; con SELF (sin acompañante) no cambia', () => {
    const orienting = visit({ state: 'ORIENTING' });
    expect(must(assignEscort(orienting, 'R2', 'R1', T1))).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'R2',
    });
    expect(must(assignEscort(orienting, undefined, 'R1', T1))).toMatchObject({
      state: 'IN_PROGRESS',
      ownerId: 'R1',
    });
    expect(assignEscort(visit(), 'R2', 'R1', T1)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
  });

  test('ARRIVE marca la llegada una sola vez y no cambia el responsable', () => {
    const progress = visit({ state: 'IN_PROGRESS', ownerId: 'R2' });
    const arrived = must(markArrival(progress, 'R2', T1));
    expect(arrived).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'R2', version: 2 });
    expect(arrived.arrivedAt).toBe(T1.toISOString());
    expect(markArrival(arrived, 'R2', T2)).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    expect(markArrival(visit(), 'R2', T1)).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    expect(markArrival(visit({ state: 'CLOSED' }), 'R2', T1)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
  });
});

describe('closeVisit y abortVisit (V-14, V-20)', () => {
  test('cerrar fija el motivo EXIT por defecto y respeta el que se indique', () => {
    expect(must(closeVisit(visit(), 'R1', T1))).toMatchObject({
      state: 'CLOSED',
      closeReason: 'EXIT',
      ownerId: 'R1',
    });
    expect(
      must(closeVisit(visit({ state: 'EXPECTED' }), 'system', T1, undefined, 'NO_SHOW')),
    ).toMatchObject({ state: 'CLOSED', closeReason: 'NO_SHOW' });
  });

  test('cerrar una visita ya cerrada devuelve la misma sin cambios', () => {
    const closed = must(closeVisit(visit(), 'R1', T1));
    expect(must(closeVisit(closed, 'R1', T2))).toBe(closed);
  });

  test('cerrar desde WAITING_HANDOFF cancela el relevo abierto en la misma escritura', () => {
    const waiting = must(
      requestHandoff(visit({ state: 'IN_PROGRESS', ownerId: 'R2' }), 'R2', 'ROBOT_FAILURE', {}, T0),
    );
    const closed = must(closeVisit(waiting, 'O-01', T1));
    expect(closed).toMatchObject({
      state: 'CLOSED',
      ownerId: 'R2',
      closeReason: 'EXIT',
      version: waiting.version + 1,
    });
    expect(closed.handoff).toMatchObject({
      state: 'CANCELLED',
      cancelReason: 'VISIT_CLOSED',
      cancelledAt: T1.toISOString(),
    });
  });

  test('cerrar por cambio de día expira el relevo en lugar de cancelarlo', () => {
    const waiting = must(
      requestHandoff(visit({ state: 'IN_PROGRESS', ownerId: 'R2' }), 'R2', 'LOW_BATTERY', {}, T0),
    );
    const closed = must(closeVisit(waiting, 'system', T1, undefined, 'DAY_ROLLOVER'));
    expect(closed.handoff?.state).toBe('EXPIRED');
    expect(closed.closeReason).toBe('DAY_ROLLOVER');
  });

  test('un relevo ya terminado no se toca al cerrar', () => {
    const waiting = must(
      requestHandoff(visit({ state: 'IN_PROGRESS', ownerId: 'R2' }), 'R2', 'ROBOT_FAILURE', {}, T0),
    );
    const cancelled = must(cancelHandoff(waiting, 'R2', T1));
    expect(cancelled.state).toBe('WAITING_HANDOFF');
    expect(must(closeVisit(cancelled, 'O-01', T2)).handoff?.state).toBe('CANCELLED');
    expect(must(abortVisit(cancelled, 'O-01', T2)).handoff?.state).toBe('CANCELLED');
  });

  test('abortar: FAILED con ABORTED_BY_OPERATOR y el relevo abierto cancelado', () => {
    const waiting = must(
      requestHandoff(visit({ state: 'IN_PROGRESS', ownerId: 'R2' }), 'R2', 'ROBOT_FAILURE', {}, T0),
    );
    const aborted = must(abortVisit(waiting, 'O-01', T1));
    expect(aborted).toMatchObject({
      state: 'FAILED',
      failureReason: 'ABORTED_BY_OPERATOR',
      ownerId: 'R2',
    });
    expect(aborted.handoff).toMatchObject({ state: 'CANCELLED', cancelReason: 'VISIT_ABORTED' });
  });

  test.each(['MANUAL_REVIEW', 'VERIFIED', 'ORIENTING', 'IN_PROGRESS'] as const)(
    'abortar desde %s',
    (state) => {
      expect(must(abortVisit(visit({ state }), 'O-01', T1)).state).toBe('FAILED');
    },
  );

  test.each(['EXPECTED', 'IDENTIFYING', 'FAILED', 'CLOSED'] as const)(
    'abortar desde %s es una transición inválida',
    (state) => {
      const r = abortVisit(visit({ state }), 'O-01', T1);
      expect(r.ok).toBe(false);
    },
  );
});

describe('relevo según el contrato', () => {
  const owned = visit({ state: 'IN_PROGRESS', ownerId: 'R2', version: 3 });

  test('se puede pedir desde VERIFIED y, si no es crítico, la cancelación vuelve a VERIFIED', () => {
    const waiting = must(requestHandoff(visit(), 'R1', 'VISITOR_PREFERENCE', {}, T0));
    expect(waiting.state).toBe('WAITING_HANDOFF');
    const back = must(cancelHandoff(waiting, 'R1', T1, 'VISITOR_DECLINED'));
    expect(back).toMatchObject({ state: 'VERIFIED', ownerId: 'R1' });
    expect(back.handoff).toMatchObject({
      state: 'CANCELLED',
      cancelReason: 'VISITOR_DECLINED',
      cancelledAt: T1.toISOString(),
    });
  });

  test('NETWORK_LOSS es crítico: al cancelar la visita sigue esperando', () => {
    const waiting = must(requestHandoff(owned, 'R2', 'NETWORK_LOSS', {}, T0));
    expect(must(cancelHandoff(waiting, 'R2', T1)).state).toBe('WAITING_HANDOFF');
  });

  test('transferir el contexto registra su instante', () => {
    const accepted = must(
      acceptHandoff(must(requestHandoff(owned, 'R2', 'LOW_BATTERY', {}, T0)), 'U-02', T1),
    );
    expect(must(transferContext(accepted, 'U-02', T2)).handoff?.contextTransferredAt).toBe(
      T2.toISOString(),
    );
  });

  test('confirmar o transferir pasados 600 s desde la aceptación es HANDOFF_EXPIRED', () => {
    const accepted = must(
      acceptHandoff(must(requestHandoff(owned, 'R2', 'LOW_BATTERY', {}, T0)), 'U-02', T1),
    );
    const late = new Date(T1.getTime() + 600_000);
    const justBefore = new Date(T1.getTime() + 599_000);
    expect(confirmHandoff(accepted, 'U-02', late)).toEqual({ ok: false, error: 'HANDOFF_EXPIRED' });
    expect(transferContext(accepted, 'U-02', late)).toEqual({
      ok: false,
      error: 'HANDOFF_EXPIRED',
    });
    expect(confirmHandoff(accepted, 'U-02', justBefore).ok).toBe(true);
    expect(must(expireHandoff(accepted, late)).handoff?.state).toBe('EXPIRED');
  });
});
