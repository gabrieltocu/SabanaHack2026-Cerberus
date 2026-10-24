// Robustez de la frontera: clave de idempotencia en vuelo, rechazos que no se fijan, rutas con
// escapes inválidos y actor validado en el historial.
import { createSeed } from '@/domain/seed';
import { setup, type Harness } from '../../support/api-harness';

const mk = async (h: Harness, date = '2026-10-24') =>
  (
    await h.call('POST', '/invitations', {
      actor: 'V-202',
      body: { hostId: 'V-202', guest: { fullName: 'Sebastián Lozano' }, date },
    })
  ).body;

describe('Idempotency-Key', () => {
  test('dos peticiones simultáneas con la misma clave: el QR se consume una sola vez y nadie ve DENIED', async () => {
    const h = setup({ validate: false });
    const inv = await mk(h);
    const send = () =>
      h.call('POST', '/access/verify', {
        actor: 'R1',
        key: 'k-verify-same-key',
        body: { token: inv.qr.token },
      });
    const replies = await Promise.all([send(), send()]);
    for (const r of replies) {
      const ok = r.status === 200 && r.body.decision === 'GRANTED';
      const retry = r.status === 409 && r.body.error.code === 'VERSION_CONFLICT';
      expect([r.status, r.body.decision ?? r.body.error?.code, ok || retry]).toEqual([
        r.status,
        r.body.decision ?? r.body.error?.code,
        true,
      ]);
    }
    expect(replies.some((r) => r.body.decision === 'GRANTED')).toBe(true);
    // El reintento con la misma clave repite el GRANTED guardado.
    const again = await send();
    expect(again.body).toMatchObject({ decision: 'GRANTED' });
    expect(again.headers['Idempotency-Replayed']).toBe('true');
  });

  test('un rechazo de negocio (DENIED) no queda fijado 24 h bajo la clave', async () => {
    const first = setup();
    const inv = await mk(first, '2026-10-25');
    const body = { token: inv.qr.token };
    const early = await first.call('POST', '/access/verify', {
      actor: 'R1',
      key: 'k-early-denied',
      body,
    });
    expect(early.body).toEqual({ decision: 'DENIED', reason: 'QR_NOT_YET_VALID' });
    // Al día siguiente el mismo QR es válido: la misma clave no repite el rechazo anterior.
    const later = setup({ store: first.store, now: '2026-10-25T07:00:00-05:00' });
    const res = await later.call('POST', '/access/verify', {
      actor: 'R1',
      key: 'k-early-denied',
      body,
    });
    expect(res.headers['Idempotency-Replayed']).toBeUndefined();
    expect(res.body.decision).toBe('GRANTED');
  });

  test('una clasificación DENIED tampoco se repite bajo la misma clave', async () => {
    const h = setup();
    const ev = {
      source: { kind: 'ROBOT', id: 'R1' },
      face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-207', confidence: 0.95 },
    };
    const one = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      key: 'k-susp-1',
      body: ev,
    });
    expect(one.body.classification.state).toBe('DENIED');
    const two = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      key: 'k-susp-1',
      body: ev,
    });
    expect(two.headers['Idempotency-Replayed']).toBeUndefined();
  });

  test('un error no deja la clave atascada: el reintento se ejecuta', async () => {
    const h = setup();
    const url = '/handoffs/hof-00000000/accept';
    const miss = await h.call('POST', url, { actor: 'U-01', key: 'k-retry-after-404' });
    expect(miss.status).toBe(404);
    const again = await h.call('POST', url, { actor: 'U-01', key: 'k-retry-after-404' });
    expect(again.status).toBe(404);
  });
});

describe('rutas con escapes de URL inválidos', () => {
  test.each([
    '/visits/%E0%A4%A',
    '/people/%',
    '/invitations/%E0%A4%A/cancel',
    '/handoffs/%FF/accept',
  ])('%s responde 404 ROUTE_NOT_FOUND, no 500', async (path) => {
    const h = setup();
    const method = path.endsWith('/cancel') || path.endsWith('/accept') ? 'POST' : 'GET';
    const res = await h.call(method, path, { actor: 'O-01' });
    expect([res.status, res.body.error.code]).toEqual([404, 'ROUTE_NOT_FOUND']);
  });
});

describe('el historial solo guarda actores validados', () => {
  test('fusionar una revisión manual escribe el id del actor del directorio', async () => {
    const h = setup();
    const inv = await mk(h);
    const review = (
      await h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: { source: { kind: 'ROBOT', id: 'R1' }, face: { status: 'UNKNOWN' } },
      })
    ).body.visit;
    const res = await h.call('POST', '/access/verify', {
      actor: 'U-01',
      body: { token: inv.qr.token, visitId: review.id },
    });
    expect(res.body.decision).toBe('GRANTED');
    const stored = await h.store.get<{ history: { by: string }[] }>(`visit:${review.id}`);
    const ids = new Set([...createSeed().people.map((p) => p.id), 'system']);
    expect(stored!.value.history.map((e) => e.by).every((by) => ids.has(by))).toBe(true);
    expect(stored!.value.history.at(-1)!.by).toBe('U-01');
  });
});
