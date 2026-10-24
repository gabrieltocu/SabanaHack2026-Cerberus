import { invite } from '../../support/api-flows';
import { setup, type Harness } from '../../support/api-harness';

/** Same store, later clock: the lazy rules (no-show, expiry) apply when the new app reads. */
const travel = (h: Harness, now: string) => setup({ store: h.store, now });

const create = (h: Harness, body: object, actor = 'V-202') =>
  h.call('POST', '/invitations', { actor, body });
const base = { hostId: 'V-202', guest: { fullName: 'Ana Pérez' }, date: '2026-10-24' };

describe('crear invitación: anfitrión y actor', () => {
  test.each([
    ['V-204', 'personal sin membresía', 403, 'HOST_NOT_ELIGIBLE'],
    ['V-207', 'membresía suspendida', 403, 'HOST_NOT_ELIGIBLE'],
    ['V-208', 'membresía vencida', 403, 'HOST_NOT_ELIGIBLE'],
    ['V-999', 'anfitrión inexistente', 404, 'PERSON_NOT_FOUND'],
  ])('%s (%s)', async (hostId, _why, status, code) => {
    const res = await create(setup(), { ...base, hostId }, hostId === 'V-999' ? 'O-01' : hostId);
    expect([res.status, res.body.error.code]).toEqual([status, code]);
  });

  test('solo el anfitrión o un operador la crea; sin cabecera de actor no hay creación', async () => {
    const h = setup();
    expect((await create(h, base, 'V-209')).body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await create(h, base, 'U-01')).body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await create(h, base, 'nadie')).body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await h.call('POST', '/invitations', { body: base })).status).toBe(403);
    expect((await create(h, base, 'O-01')).status).toBe(201);
  });
});

describe('crear invitación: validación y fechas', () => {
  test.each([
    ['falta el nombre', { ...base, guest: {} }, 'guest.fullName'],
    ['nombre de una letra', { ...base, guest: { fullName: 'A' } }, 'guest.fullName'],
    ['fecha inexistente', { ...base, date: '2026-02-30' }, 'date'],
    ['ventana invertida', { ...base, window: { from: '22:00', to: '06:00' } }, 'window'],
    [
      'ventana con formato inválido',
      { ...base, window: { from: '6am', to: '22:00' } },
      'window.from',
    ],
    ['sin cuerpo', undefined, 'hostId'],
  ])('%s: 422 con el campo en details.fields', async (_why, body, field) => {
    const res = await setup().call('POST', '/invitations', { actor: 'V-202', body: body ?? {} });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields)).toContain(field);
  });

  test('una fecha de ayer es INVITATION_DATE_IN_PAST', async () => {
    const res = await create(setup(), { ...base, date: '2026-10-23' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVITATION_DATE_IN_PAST');
  });

  test('hoy con la ventana terminada también; el día siguiente sí se puede', async () => {
    const h = setup();
    await h.call('POST', '/demo/reset', { body: { now: '2026-10-24T22:30:00-05:00' } });
    expect((await create(h, base)).body.error.code).toBe('INVITATION_DATE_IN_PAST');
    expect((await create(h, { ...base, date: '2026-10-25' })).status).toBe(201);
  });

  test('ventana propia y contacto opcional se conservan', async () => {
    const res = await create(setup(), {
      ...base,
      guest: { fullName: 'Ana Pérez', contact: 'ana@ejemplo.test' },
      window: { from: '10:00', to: '12:00' },
    });
    expect(res.body).toMatchObject({
      window: { from: '10:00', to: '12:00' },
      guest: { contact: 'ana@ejemplo.test' },
      qr: { validFrom: '2026-10-24T10:00:00-05:00', validTo: '2026-10-24T12:00:00-05:00' },
    });
  });
});

describe('duplicados y límite diario', () => {
  test('el mismo invitado, anfitrión y fecha (sin tildes ni mayúsculas) es INVITATION_DUPLICATE', async () => {
    const h = setup();
    const first = await invite(h, 'Sebastián Lozano');
    const dup = await create(h, { ...base, guest: { fullName: '  SEBASTIAN   lozano ' } });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: 'INVITATION_DUPLICATE',
      details: { invitationId: first.id },
    });
    // The demo invitation (Male invites Valentina) also counts.
    const demo = await create(
      h,
      { hostId: 'V-209', guest: { fullName: 'valentina restrepo' }, date: '2026-10-24' },
      'V-209',
    );
    expect(demo.body.error.code).toBe('INVITATION_DUPLICATE');
  });

  test('la sexta invitación del día es INVITATION_DAILY_LIMIT; cancelar una libera cupo', async () => {
    const h = setup();
    const made = [];
    for (const n of ['Uno Uno', 'Dos Dos', 'Tres Tres', 'Cuatro Cuatro', 'Cinco Cinco']) {
      made.push(await invite(h, n));
    }
    const sixth = await create(h, { ...base, guest: { fullName: 'Seis Seis' } });
    expect(sixth.body.error.code).toBe('INVITATION_DAILY_LIMIT');
    await h.call('POST', `/invitations/${made[0].id}/cancel`, { actor: 'V-202' });
    expect((await create(h, { ...base, guest: { fullName: 'Seis Seis' } })).status).toBe(201);
  });

  test('seis creaciones simultáneas: exactamente cinco 201 y un 409', async () => {
    const h = setup();
    const replies = await Promise.all(
      ['A Uno', 'B Dos', 'C Tres', 'D Cuatro', 'E Cinco', 'F Seis'].map((fullName) =>
        create(h, { ...base, guest: { fullName } }),
      ),
    );
    expect(replies.filter((r) => r.status === 201)).toHaveLength(5);
    const rejected = replies.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.body.error.code).toBe('INVITATION_DAILY_LIMIT');
  });

  test('otra fecha u otro anfitrión tiene su propio cupo', async () => {
    const h = setup();
    await invite(h, 'Ana Pérez');
    expect((await create(h, { ...base, date: '2026-10-25' })).status).toBe(201);
    expect((await create(h, { ...base, hostId: 'V-206' }, 'V-206')).status).toBe(201);
  });
});

describe('consultar y cancelar', () => {
  test('GET de una invitación inexistente es 404 y la lista exige hostId', async () => {
    const h = setup();
    expect(
      (await h.call('GET', '/invitations/inv-00000000', { actor: 'V-202' })).body.error.code,
    ).toBe('INVITATION_NOT_FOUND');
    const res = await h.call('GET', '/invitations', { actor: 'V-202' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields).toHaveProperty('hostId');
  });

  test('la lista filtra por estado y fecha', async () => {
    const h = setup();
    const a = await invite(h, 'Ana Pérez');
    await create(h, { ...base, guest: { fullName: 'Ben Torres' }, date: '2026-10-25' });
    await h.call('POST', `/invitations/${a.id}/cancel`, { actor: 'V-202' });
    const q = (query: Record<string, string>) =>
      h
        .call('GET', '/invitations', { actor: 'V-202', query: { hostId: 'V-202', ...query } })
        .then((r) => r.body.count);
    expect(await q({})).toBe(2);
    expect(await q({ state: 'CANCELLED' })).toBe(1);
    expect(await q({ state: 'ACTIVE' })).toBe(1);
    expect(await q({ date: '2026-10-25' })).toBe(1);
    expect(await q({ state: 'USED' })).toBe(0);
    expect(
      (
        await h.call('GET', '/invitations', {
          actor: 'V-202',
          query: { hostId: 'V-202', state: 'X' },
        })
      ).status,
    ).toBe(422);
  });

  test('cancelar revoca el QR, cierra la visita y es idempotente', async () => {
    const h = setup();
    const inv = await invite(h);
    const first = await h.call('POST', `/invitations/${inv.id}/cancel`, { actor: 'V-202' });
    expect(first.body).toMatchObject({
      state: 'CANCELLED',
      cancelledAt: '2026-10-24T09:00:00-05:00',
      qr: { revokedAt: '2026-10-24T09:00:00-05:00' },
    });
    expect((await h.call('GET', `/visits/${inv.visitId}`)).body).toMatchObject({
      state: 'CLOSED',
      closeReason: 'INVITATION_CANCELLED',
    });
    const again = await h.call('POST', `/invitations/${inv.id}/cancel`, { actor: 'O-01' });
    expect(again.status).toBe(200);
    expect(again.body.state).toBe('CANCELLED');
    const verify = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(verify.body).toEqual({ decision: 'DENIED', reason: 'QR_REVOKED' });
    // A cancelled invitation does not count: the same guest can be invited again.
    expect((await create(h, { ...base, guest: { fullName: 'Sebastián Lozano' } })).status).toBe(
      201,
    );
  });

  test('solo el anfitrión o un operador cancela; una usada no se cancela', async () => {
    const h = setup();
    const inv = await invite(h);
    const denied = await h.call('POST', `/invitations/${inv.id}/cancel`, { actor: 'V-209' });
    expect(denied.body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await h.call('POST', `/invitations/${inv.id}/cancel`)).status).toBe(403);
    expect(
      (await h.call('POST', '/invitations/inv-00000000/cancel', { actor: 'V-202' })).status,
    ).toBe(404);
    await h.call('POST', '/access/verify', { actor: 'R1', body: { token: inv.qr.token } });
    const used = await h.call('POST', `/invitations/${inv.id}/cancel`, { actor: 'V-202' });
    expect(used.body.error).toMatchObject({
      code: 'INVITATION_NOT_ACTIVE',
      details: { state: 'USED' },
    });
  });

  test('vencida: se deriva al leer, cierra la visita como NO_SHOW y no se cancela', async () => {
    const h = setup();
    const inv = await invite(h);
    const late = travel(h, '2026-10-24T22:00:00-05:00');
    expect((await late.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' })).body.state).toBe(
      'EXPIRED',
    );
    expect((await late.call('GET', `/visits/${inv.visitId}`)).body).toMatchObject({
      state: 'CLOSED',
      closeReason: 'NO_SHOW',
    });
    const cancel = await late.call('POST', `/invitations/${inv.id}/cancel`, { actor: 'V-202' });
    expect(cancel.body.error.code).toBe('INVITATION_NOT_ACTIVE');
    expect(
      (await late.call('POST', '/access/verify', { actor: 'R1', body: { token: inv.qr.token } }))
        .body,
    ).toEqual({ decision: 'DENIED', reason: 'QR_EXPIRED' });
  });
});

describe('verificar acceso', () => {
  test('token desconocido, mal formado o alterado: siempre QR_UNKNOWN', async () => {
    const h = setup();
    const inv = await invite(h);
    const altered = `${inv.qr.token.slice(0, -1)}${inv.qr.token.endsWith('A') ? 'B' : 'A'}`;
    for (const token of [
      'nq_AAAAAAAAAAAAAAAAAAAAAA',
      'basura',
      altered,
      ` ${inv.qr.token}`,
      inv.qr.token.slice(0, 12),
    ]) {
      const res = await h.call('POST', '/access/verify', { actor: 'R1', body: { token } });
      expect(res.body).toEqual({ decision: 'DENIED', reason: 'QR_UNKNOWN' });
    }
    expect((await h.call('POST', '/access/verify', { actor: 'R1', body: {} })).status).toBe(422);
  });

  test('antes de su ventana es QR_NOT_YET_VALID y no se consume', async () => {
    const h = setup();
    const inv = (await create(h, { ...base, date: '2026-10-25' })).body;
    const res = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token },
    });
    expect(res.body).toEqual({ decision: 'DENIED', reason: 'QR_NOT_YET_VALID' });
    expect((await h.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' })).body.state).toBe(
      'ACTIVE',
    );
  });

  test('el responsable es quien escanea si es robot o edecán; el operador deja a R1; otros no escanean', async () => {
    const h = setup();
    const a = await invite(h, 'Ana Pérez');
    const b = await invite(h, 'Ben Torres');
    const c = await invite(h, 'Cris Uribe');
    const by = (inv: { qr: { token: string } }, actor?: string) =>
      h.call('POST', '/access/verify', {
        ...(actor ? { actor } : {}),
        body: { token: inv.qr.token },
      });
    expect((await by(a, 'U-01')).body.visit.ownerId).toBe('U-01');
    expect((await by(b, 'O-01')).body.visit.ownerId).toBe('R1');
    // A member or an anonymous caller is rejected before the token is looked at (still ACTIVE).
    expect((await by(c, 'V-201')).status).toBe(403);
    expect((await by(c)).status).toBe(403);
    expect((await by(c, 'R2')).body.visit.ownerId).toBe('R2');
  });

  test('visitId: inexistente es 404; una visita que no está en revisión es INVALID_TRANSITION', async () => {
    const h = setup();
    const inv = await invite(h);
    const missing = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token, visitId: 'vis-00000000' },
    });
    expect(missing.body.error.code).toBe('VISIT_NOT_FOUND');
    const vip = await h.call('POST', '/recognition/events', {
      actor: 'R1',
      body: {
        source: { kind: 'ROBOT', id: 'R1' },
        face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201' },
      },
    });
    const wrong = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: inv.qr.token, visitId: vip.body.visit.id },
    });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { state: 'VERIFIED', event: 'MERGED' },
    });
    expect((await h.call('GET', `/invitations/${inv.id}`, { actor: 'O-01' })).body.state).toBe(
      'ACTIVE',
    );
  });
});
