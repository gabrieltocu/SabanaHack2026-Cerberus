import type { HandoffReason, Visit } from '@/domain/entities/visit';
import {
  acceptHandoff,
  cancelHandoff,
  confirmHandoff,
  expireHandoff,
  requestHandoff,
  transferContext,
} from '@/domain/policies/handoff-machine';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

const T0 = new Date('2026-10-24T09:00:00-05:00');
const T1 = new Date('2026-10-24T09:01:00-05:00');
const T2 = new Date('2026-10-24T09:02:00-05:00');
const AFTER_TTL = new Date('2026-10-24T09:05:00-05:00'); // exactly requestedAt + 300 s
const ACCEPT_DEADLINE = new Date('2026-10-24T09:11:00-05:00'); // acceptedAt (T1) + 600 s

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v-andres',
  personId: 'p-andres',
  category: 'VIP',
  state: 'IN_PROGRESS',
  ownerId: 'p-r2',
  destination: 'Salón reservado',
  phase: 5,
  entry: 'FACE',
  openedAt: T0.toISOString(),
  history: [],
  version: 3,
  ...over,
});

const ctx = { destination: 'Salón reservado', category: 'VIP' as const, personName: 'Andrés' };

const must = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw new Error(`setup: ${String(r.error)}`);
  return r.value;
};

const requested = (over: Partial<Visit> = {}, reason: HandoffReason = 'VISITOR_PREFERENCE') =>
  must(requestHandoff(visit(over), 'p-r2', reason, ctx, T0));

const accepted = (by = 'p-sofia', reason: HandoffReason = 'VISITOR_PREFERENCE') =>
  must(acceptHandoff(requested({}, reason), by, T1));

describe('requestHandoff', () => {
  test.each(['ORIENTING', 'IN_PROGRESS'] as const)('desde %s abre el relevo', (state) => {
    const v = requested({ state });
    expect(v.state).toBe('WAITING_HANDOFF');
    expect(v.ownerId).toBe('p-r2');
    expect(v.version).toBe(4);
    expect(v.history.at(-1)).toMatchObject({ from: state, to: 'WAITING_HANDOFF', by: 'p-r2' });
    expect(v.handoff).toEqual({
      id: 'H-v-andres-4',
      visitId: 'v-andres',
      fromId: 'p-r2',
      reason: 'VISITOR_PREFERENCE',
      state: 'REQUESTED',
      requestedAt: T0.toISOString(),
      expiresAt: AFTER_TTL.toISOString(),
      context: ctx,
    });
    expect(v.handoff).not.toHaveProperty('version');
  });

  test('no muta la visita de entrada', () => {
    const input = visit();
    const snapshot = JSON.parse(JSON.stringify(input));
    requestHandoff(input, 'p-r2', 'OPERATIONAL', ctx, T0);
    expect(input).toEqual(snapshot);
  });

  test('respeta un ttl propio', () => {
    const r = requestHandoff(visit(), 'p-r2', 'LOW_BATTERY', ctx, T0, 60);
    expect(r.ok && r.value.handoff?.expiresAt).toBe(T1.toISOString());
  });

  test.each([0, -5, Number.NaN, Infinity, 1e20, 86_401])('ttl %s inválido (B5)', (ttl) => {
    expect(requestHandoff(visit(), 'p-r2', 'OPERATIONAL', ctx, T0, ttl)).toEqual({
      ok: false,
      error: 'INVALID_TTL',
    });
  });

  test('el ttl máximo (86 400 s) es válido', () => {
    expect(requestHandoff(visit(), 'p-r2', 'OPERATIONAL', ctx, T0, 86_400).ok).toBe(true);
  });

  test('solo el responsable actual puede pedirlo', () => {
    expect(requestHandoff(visit(), 'p-r3', 'OPERATIONAL', ctx, T0)).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });

  test('con un relevo abierto es HANDOFF_ALREADY_OPEN (ya esperando o incluso en curso)', () => {
    const waiting = requested();
    expect(requestHandoff(waiting, 'p-r2', 'OPERATIONAL', ctx, T1)).toEqual({
      ok: false,
      error: 'HANDOFF_ALREADY_OPEN',
    });
    const odd = { ...waiting, state: 'IN_PROGRESS' as const };
    expect(requestHandoff(odd, 'p-r2', 'OPERATIONAL', ctx, T1)).toEqual({
      ok: false,
      error: 'HANDOFF_ALREADY_OPEN',
    });
  });

  test('en WAITING_HANDOFF con el relevo cerrado (motivo crítico) se puede abrir uno nuevo', () => {
    const waiting = requested({ state: 'ORIENTING' }, 'ROBOT_FAILURE');
    const cancelled = must(cancelHandoff(waiting, 'p-r2', T1));
    const again = must(requestHandoff(cancelled, 'p-r2', 'VISITOR_PREFERENCE', ctx, T2));
    expect(again.state).toBe('WAITING_HANDOFF');
    expect(again.handoff).toMatchObject({ state: 'REQUESTED', id: `H-v-andres-${again.version}` });
    expect(again.handoff?.id).not.toBe(waiting.handoff?.id);
    // El nuevo relevo no crítico, al cancelarse, devuelve la visita al estado original.
    expect(must(cancelHandoff(again, 'p-r2', T2)).state).toBe('ORIENTING');
  });

  test('WAITING_HANDOFF sin relevo registrado también admite uno nuevo', () => {
    const r = requestHandoff(visit({ state: 'WAITING_HANDOFF' }), 'p-r2', 'OPERATIONAL', ctx, T0);
    expect(r.ok).toBe(true);
  });

  test('visita cerrada es VISIT_CLOSED; otros estados INVALID_STATE', () => {
    expect(requestHandoff(visit({ state: 'CLOSED' }), 'p-r2', 'OPERATIONAL', ctx, T0)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
    for (const state of ['EXPECTED', 'IDENTIFYING', 'FAILED', 'MANUAL_REVIEW'] as const) {
      expect(requestHandoff(visit({ state }), 'p-r2', 'OPERATIONAL', ctx, T0)).toEqual({
        ok: false,
        error: 'INVALID_STATE',
      });
    }
  });
});

describe('acceptHandoff', () => {
  test('REQUESTED -> ACCEPTED fija toId y no cambia el responsable de la visita', () => {
    const v = requested();
    const a = acceptHandoff(v, 'p-sofia', T1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.handoff).toMatchObject({
      state: 'ACCEPTED',
      toId: 'p-sofia',
      acceptedAt: T1.toISOString(),
    });
    expect(a.value.version).toBe(v.version + 1);
    expect(a.value.ownerId).toBe('p-r2');
    expect(a.value.state).toBe('WAITING_HANDOFF');
    // La entrada no se muta.
    expect(v.handoff?.state).toBe('REQUESTED');
  });

  test('aceptar dos veces por el mismo edecán es idempotente', () => {
    const v = accepted();
    const again = acceptHandoff(v, 'p-sofia', T2);
    expect(again.ok && again.value).toBe(v);
    expect(v.version).toBe(5);
  });

  test('otro edecán recibe ALREADY_ACCEPTED', () => {
    expect(acceptHandoff(accepted(), 'p-sara', T2)).toEqual({
      ok: false,
      error: 'ALREADY_ACCEPTED',
    });
  });

  test('vencido (now >= expiresAt) es HANDOFF_EXPIRED; justo antes aún vale', () => {
    const v = requested();
    expect(acceptHandoff(v, 'p-sofia', AFTER_TTL)).toEqual({
      ok: false,
      error: 'HANDOFF_EXPIRED',
    });
    const justBefore = new Date(AFTER_TTL.getTime() - 1);
    expect(acceptHandoff(v, 'p-sofia', justBefore).ok).toBe(true);
  });

  test('quien lo pidió no puede aceptarlo: SELF_HANDOFF', () => {
    expect(acceptHandoff(requested(), 'p-r2', T1)).toEqual({ ok: false, error: 'SELF_HANDOFF' });
  });

  test('sin relevo es NO_HANDOFF', () => {
    expect(acceptHandoff(visit(), 'p-sofia', T1)).toEqual({ ok: false, error: 'NO_HANDOFF' });
  });

  test('relevos EXPIRED/CANCELLED no se aceptan', () => {
    const v = requested();
    const h = v.handoff!;
    expect(acceptHandoff({ ...v, handoff: { ...h, state: 'EXPIRED' } }, 'p-sofia', T1)).toEqual({
      ok: false,
      error: 'HANDOFF_EXPIRED',
    });
    expect(acceptHandoff({ ...v, handoff: { ...h, state: 'CANCELLED' } }, 'p-sofia', T1)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  test('un relevo REQUESTED con la visita cerrada o fuera de espera no se acepta', () => {
    const v = requested();
    expect(acceptHandoff({ ...v, state: 'CLOSED' }, 'p-sofia', T1)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
    expect(acceptHandoff({ ...v, state: 'IN_PROGRESS' }, 'p-sofia', T1)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });
});

describe('transferContext', () => {
  test('ACCEPTED -> CONTEXT_TRANSFERRED solo por toId', () => {
    const v = accepted();
    const t = transferContext(v, 'p-sofia', T2);
    expect(t.ok && t.value.handoff?.state).toBe('CONTEXT_TRANSFERRED');
    expect(t.ok && t.value.version).toBe(v.version + 1);
    expect(transferContext(v, 'p-sara', T2)).toEqual({ ok: false, error: 'NOT_ASSIGNEE' });
  });

  test('es idempotente para el mismo edecán', () => {
    const t = must(transferContext(accepted(), 'p-sofia', T2));
    const again = transferContext(t, 'p-sofia', T2);
    expect(again.ok && again.value).toBe(t);
  });

  test('desde REQUESTED o CONFIRMED es INVALID_STATE; sin relevo, NO_HANDOFF', () => {
    expect(transferContext(requested(), 'p-sofia', T2)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    const done = must(confirmHandoff(accepted(), 'p-sofia', T2));
    expect(transferContext(done, 'p-sofia', T2)).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(transferContext(visit(), 'p-sofia', T2)).toEqual({ ok: false, error: 'NO_HANDOFF' });
  });
});

describe('confirmHandoff', () => {
  test('desde ACCEPTED: solo aquí cambia ownerId y se conservan destino, categoría y fase', () => {
    const v = accepted();
    expect(v.ownerId).toBe('p-r2');
    const c = confirmHandoff(v, 'p-sofia', T2);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value).toMatchObject({
      ownerId: 'p-sofia',
      state: 'IN_PROGRESS',
      destination: 'Salón reservado',
      category: 'VIP',
      phase: 5,
      personId: 'p-andres',
      version: v.version + 1,
    });
    expect(c.value.history.at(-1)).toMatchObject({
      from: 'WAITING_HANDOFF',
      to: 'IN_PROGRESS',
      by: 'p-sofia',
    });
    expect(c.value.handoff).toMatchObject({
      state: 'CONFIRMED',
      confirmedAt: T2.toISOString(),
      toId: 'p-sofia',
    });
  });

  test('también desde CONTEXT_TRANSFERRED', () => {
    const t = must(transferContext(accepted(), 'p-sofia', T1));
    expect(confirmHandoff(t, 'p-sofia', T2).ok).toBe(true);
  });

  test('confirmar dos veces es idempotente: misma referencia, sin historial ni versión extra', () => {
    const first = must(confirmHandoff(accepted(), 'p-sofia', T2));
    const second = confirmHandoff(first, 'p-sofia', T2);
    expect(second.ok && second.value).toBe(first);
  });

  test('otro edecán, o un relevo sin aceptar, no confirma', () => {
    const v = accepted();
    expect(confirmHandoff(v, 'p-sara', T2)).toEqual({ ok: false, error: 'NOT_ASSIGNEE' });
    expect(confirmHandoff(requested(), 'p-sofia', T2)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    // Un confirmado por otro tampoco se "re-confirma" para alguien distinto.
    const done = must(confirmHandoff(v, 'p-sofia', T2));
    expect(confirmHandoff(done, 'p-sara', T2)).toEqual({ ok: false, error: 'NOT_ASSIGNEE' });
  });

  test('la visita debe estar esperando; sin relevo es NO_HANDOFF', () => {
    const v = accepted();
    expect(confirmHandoff({ ...v, state: 'IN_PROGRESS' }, 'p-sofia', T2)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(confirmHandoff({ ...v, state: 'CLOSED' }, 'p-sofia', T2)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
    expect(confirmHandoff(visit(), 'p-sofia', T2)).toEqual({ ok: false, error: 'NO_HANDOFF' });
  });
});

describe('cancelHandoff', () => {
  test.each(['ORIENTING', 'IN_PROGRESS'] as const)(
    'cancelar un relevo no crítico devuelve la visita a %s sin cambiar el responsable',
    (state) => {
      const v = requested({ state });
      const c = cancelHandoff(v, 'p-r2', T1);
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      expect(c.value.handoff?.state).toBe('CANCELLED');
      expect(c.value).toMatchObject({
        state,
        ownerId: 'p-r2',
        phase: 5,
        destination: 'Salón reservado',
        version: v.version + 1,
      });
    },
  );

  test.each(['ROBOT_FAILURE', 'LOW_BATTERY'] as const)(
    'motivo crítico %s: la visita queda en WAITING_HANDOFF con el relevo cerrado',
    (reason) => {
      const v = requested({}, reason);
      const c = must(cancelHandoff(v, 'p-r2', T1));
      expect(c).toMatchObject({ state: 'WAITING_HANDOFF', ownerId: 'p-r2' });
      expect(c.handoff?.state).toBe('CANCELLED');
      expect(c.version).toBe(v.version + 1);
      expect(c.history.at(-1)).toMatchObject({ from: 'WAITING_HANDOFF', to: 'WAITING_HANDOFF' });
    },
  );

  test('lo cancelan el responsable, el edecán asignado o el sistema; nadie más', () => {
    const v = accepted();
    expect(cancelHandoff(v, 'p-sofia', T2).ok).toBe(true);
    expect(cancelHandoff(v, 'system', T2).ok).toBe(true);
    expect(cancelHandoff(v, 'p-r2', T2).ok).toBe(true);
    expect(cancelHandoff(v, 'p-sara', T2)).toEqual({ ok: false, error: 'NOT_ALLOWED' });
    expect(cancelHandoff(requested(), 'p-sofia', T2)).toEqual({ ok: false, error: 'NOT_ALLOWED' });
  });

  test('cancelar tras aceptar también vale y es idempotente', () => {
    const c = must(cancelHandoff(accepted(), 'p-r2', T2));
    expect(c.ownerId).toBe('p-r2');
    const again = cancelHandoff(c, 'p-r2', T2);
    expect(again.ok && again.value).toBe(c);
  });

  test('no se cancela un relevo confirmado ni con la visita fuera de espera; sin relevo NO_HANDOFF', () => {
    const v = accepted();
    const done = must(confirmHandoff(v, 'p-sofia', T2));
    expect(cancelHandoff(done, 'p-sofia', T2)).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(cancelHandoff({ ...v, state: 'CLOSED' }, 'p-r2', T2)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
    expect(cancelHandoff({ ...v, state: 'IN_PROGRESS' }, 'p-r2', T2)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(cancelHandoff(visit(), 'p-r2', T2)).toEqual({ ok: false, error: 'NO_HANDOFF' });
  });

  test('sin rastro en el historial vuelve a IN_PROGRESS', () => {
    const stripped = { ...requested(), history: [] };
    expect(must(cancelHandoff(stripped, 'p-r2', T1)).state).toBe('IN_PROGRESS');
  });
});

describe('expireHandoff', () => {
  test('REQUESTED tras el ttl devuelve la visita a su estado previo, mismo responsable', () => {
    const v = requested({ state: 'ORIENTING' });
    const e = expireHandoff(v, AFTER_TTL);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.value.handoff?.state).toBe('EXPIRED');
    expect(e.value).toMatchObject({ state: 'ORIENTING', ownerId: 'p-r2' });
    expect(e.value.history.at(-1)).toMatchObject({ from: 'WAITING_HANDOFF', by: 'system' });
  });

  test('antes del ttl es NOT_EXPIRED; ya expirado es idempotente', () => {
    const v = requested();
    expect(expireHandoff(v, T1)).toEqual({ ok: false, error: 'NOT_EXPIRED' });
    const e = must(expireHandoff(v, AFTER_TTL));
    const again = expireHandoff(e, AFTER_TTL);
    expect(again.ok && again.value).toBe(e);
  });

  test.each(['ACCEPTED', 'CONTEXT_TRANSFERRED'] as const)(
    '%s vence a los 600 s de la aceptación, no antes (19)',
    (state) => {
      const base = accepted();
      const v = state === 'ACCEPTED' ? base : must(transferContext(base, 'p-sofia', T1));
      expect(expireHandoff(v, new Date(ACCEPT_DEADLINE.getTime() - 1))).toEqual({
        ok: false,
        error: 'NOT_EXPIRED',
      });
      const e = must(expireHandoff(v, ACCEPT_DEADLINE));
      expect(e.handoff?.state).toBe('EXPIRED');
      expect(e).toMatchObject({ state: 'IN_PROGRESS', ownerId: 'p-r2' });
    },
  );

  test('motivo crítico: vence y la visita sigue en WAITING_HANDOFF, lista para otro relevo', () => {
    const v = accepted('p-sofia', 'LOW_BATTERY');
    const e = must(expireHandoff(v, ACCEPT_DEADLINE));
    expect(e).toMatchObject({ state: 'WAITING_HANDOFF', ownerId: 'p-r2' });
    expect(e.handoff?.state).toBe('EXPIRED');
    expect(requestHandoff(e, 'p-r2', 'LOW_BATTERY', ctx, ACCEPT_DEADLINE).ok).toBe(true);
  });

  test('un relevo aceptado sin acceptedAt cuenta desde expiresAt', () => {
    const v = accepted();
    const odd = { ...v, handoff: { ...v.handoff!, acceptedAt: undefined } };
    expect(expireHandoff(odd, ACCEPT_DEADLINE).ok).toBe(false);
    expect(expireHandoff(odd, new Date(AFTER_TTL.getTime() + 600_000)).ok).toBe(true);
  });

  test('confirmado o cancelado no expira; sin relevo o visita fuera de espera, error', () => {
    const done = must(confirmHandoff(accepted(), 'p-sofia', T2));
    expect(expireHandoff(done, ACCEPT_DEADLINE)).toEqual({ ok: false, error: 'INVALID_STATE' });
    const cancelled = must(cancelHandoff(requested(), 'p-r2', T1));
    expect(expireHandoff(cancelled, ACCEPT_DEADLINE)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(expireHandoff(visit(), AFTER_TTL)).toEqual({ ok: false, error: 'NO_HANDOFF' });
    const v = requested();
    expect(expireHandoff({ ...v, state: 'CLOSED' }, AFTER_TTL)).toEqual({
      ok: false,
      error: 'VISIT_CLOSED',
    });
    expect(expireHandoff({ ...v, state: 'IN_PROGRESS' }, AFTER_TTL)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });
});

describe('una sola clave, un solo CAS (B1)', () => {
  const KEY = 'visit:v-andres';
  type Fn = (v: Visit) => { ok: true; value: Visit } | { ok: false; error: string };

  /** Lee, aplica la función pura y escribe con la versión leída, como hará la API. */
  async function apply(store: ReturnType<typeof createMemoryStore>, fn: Fn) {
    const read = await store.get<Visit>(KEY);
    if (!read) throw new Error('missing');
    const r = fn(read.value);
    if (!r.ok) return r;
    if (r.value === read.value) return { ok: true as const, written: false };
    const v = await store.compareAndSet(KEY, read.version, r.value);
    return v === null
      ? { ok: false as const, error: 'VERSION_CONFLICT' }
      : { ok: true as const, written: true };
  }

  async function seeded() {
    const store = createMemoryStore();
    await store.compareAndSet(KEY, 0, visit());
    return store;
  }

  test('solicitar, aceptar y confirmar escriben una sola clave, una vez por operación', async () => {
    const store = await seeded();
    const cas = jest.spyOn(store, 'compareAndSet');
    await apply(store, (v) => requestHandoff(v, 'p-r2', 'ROBOT_FAILURE', ctx, T0));
    await apply(store, (v) => acceptHandoff(v, 'p-sofia', T1));
    await apply(store, (v) => confirmHandoff(v, 'p-sofia', T2));
    expect(cas).toHaveBeenCalledTimes(3);
    expect(new Set(cas.mock.calls.map((c) => c[0]))).toEqual(new Set([KEY]));
    expect((await store.list('visit:')).map((r) => r.key)).toEqual([KEY]);
  });

  test('respuesta perdida: releer y re-aplicar confirm es ok y no duplica historial', async () => {
    const store = await seeded();
    await apply(store, (v) => requestHandoff(v, 'p-r2', 'ROBOT_FAILURE', ctx, T0));
    await apply(store, (v) => acceptHandoff(v, 'p-sofia', T1));
    const first = await apply(store, (v) => confirmHandoff(v, 'p-sofia', T2));
    expect(first).toMatchObject({ ok: true, written: true });
    const stored = await store.get<Visit>(KEY);
    // ...la respuesta se pierde; el cliente reintenta y la API relee y re-aplica.
    const retry = await apply(store, (v) => confirmHandoff(v, 'p-sofia', T2));
    expect(retry).toMatchObject({ ok: true, written: false });
    const after = await store.get<Visit>(KEY);
    expect(after).toEqual(stored);
    expect(after?.value.history.filter((h) => h.to === 'IN_PROGRESS')).toHaveLength(1);
    expect(after?.value).toMatchObject({ ownerId: 'p-sofia', state: 'IN_PROGRESS' });
  });

  test('conflicto de versión: el perdedor relee y obtiene ALREADY_ACCEPTED', async () => {
    const store = await seeded();
    await apply(store, (v) => requestHandoff(v, 'p-r2', 'ROBOT_FAILURE', ctx, T0));
    const stale = (await store.get<Visit>(KEY))!;
    const sofia = must(acceptHandoff(stale.value, 'p-sofia', T1));
    const sara = must(acceptHandoff(stale.value, 'p-sara', T1));
    expect(await store.compareAndSet(KEY, stale.version, sofia)).not.toBeNull();
    expect(await store.compareAndSet(KEY, stale.version, sara)).toBeNull();
    expect(await apply(store, (v) => acceptHandoff(v, 'p-sara', T1))).toEqual({
      ok: false,
      error: 'ALREADY_ACCEPTED',
    });
  });
});

describe('escenario: p-r2 falla con Andrés (VIP) camino al Salón reservado', () => {
  test('Sofía acepta y confirma; destino, categoría y fase se conservan', () => {
    const start = visit();
    const req = must(requestHandoff(start, 'p-r2', 'ROBOT_FAILURE', ctx, T0));
    expect(req.ownerId).toBe('p-r2');
    const acc = must(acceptHandoff(req, 'p-sofia', T1));
    expect(acc.ownerId).toBe('p-r2');
    const conf = must(confirmHandoff(acc, 'p-sofia', T2));
    expect(conf).toMatchObject({
      ownerId: 'p-sofia',
      state: 'IN_PROGRESS',
      destination: 'Salón reservado',
      category: 'VIP',
      phase: 5,
    });
    expect(conf.handoff?.state).toBe('CONFIRMED');
    // La visita original no fue mutada.
    expect(start).toMatchObject({ ownerId: 'p-r2', state: 'IN_PROGRESS', version: 3, history: [] });
  });
});
