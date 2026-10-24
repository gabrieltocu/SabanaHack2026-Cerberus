import { esFecha, invitacionesRoutes } from '@/club/invitaciones';
import { qrRoutes } from '@/club/qr';
import { currentVersion, updateInvitacion } from '@/club/repo';
import { INVITACION, makeClub } from '../../support/club-app';

const club = makeClub([...invitacionesRoutes, ...qrRoutes]);
const { call, login } = club;
let sofia: string;
let andres: string;
let concierge: string;

beforeAll(async () => {
  sofia = await login('sofia@nclub.demo');
  andres = await login('andres@nclub.demo');
  concierge = await login('concierge@nclub.demo');
});

const crear = (token: string, extra: object = {}) =>
  call('POST', '/invitaciones', { token, body: { ...INVITACION, ...extra } });

test('POST crea la invitación PROGRAMADA con persona_id y QR firmado', async () => {
  const before = await currentVersion(club.store);
  const r = await crear(sofia);
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    documento: null,
    fecha: '2026-10-24',
    hora_desde: '10:00',
    hora_hasta: '14:00',
    lugar: 'INVITADO',
    nota: 'Almuerzo',
    estado: 'PROGRAMADA',
    foto_estado: 'NINGUNA',
    foto_motivo: null,
    consentimiento_at: null,
    anfitrion_id: 'u-sofia',
  });
  expect(typeof r.body.id).toBe('string');
  expect(r.body.persona_id).toMatch(/^inv-[0-9a-f]{8}$/);
  const exp = Date.parse('2026-10-24T14:00:00-05:00') / 1000;
  expect(r.body.qr_payload).toMatch(
    new RegExp(`^NCLUB1\\|invitado\\|${r.body.persona_id}\\|Laura Diaz\\|${exp}\\|[0-9a-f]{20}$`),
  );
  expect(r.body.creada_at).toBe('2026-10-24T10:00:00.000-05:00');
  expect(await currentVersion(club.store)).toBeGreaterThan(before);
});

test('POST exige rol SOCIO y token', async () => {
  expect((await crear(concierge)).status).toBe(403);
  expect((await call('POST', '/invitaciones', { body: INVITACION })).status).toBe(401);
});

test.each([
  [{ nombre: '' }, 'nombre_invalido'],
  [{ apellido: 'A|B' }, 'apellido_invalido'],
  [{ nombre: 5 }, 'nombre_invalido'],
  [{ trato: 'don' }, 'trato_invalido'],
  [{ documento: 12 }, 'documento_invalido'],
  [{ fecha: '24/10/2026' }, 'fecha_invalida'],
  [{ fecha: '2026-02-31' }, 'fecha_invalida'],
  [{ fecha: '2026-10-23' }, 'fecha_pasada'],
  [{ hora_desde: '25:00' }, 'hora_invalida'],
  [{ hora_hasta: '10:00' }, 'horario_invalido'],
  [{ hora_hasta: '09:00' }, 'horario_invalido'],
  [{ lugar: 'Azotea' }, 'lugar_invalido'],
  [{ nota: 'x'.repeat(281) }, 'nota_invalida'],
  [{ nota: 3 }, 'nota_invalida'],
])('POST rechaza %j con 400 %s', async (extra, error) => {
  const r = await crear(sofia, extra);
  expect(r).toMatchObject({ status: 400, body: { error } });
});

test('POST acepta documento, lugar y nota por defecto y fecha de hoy en Bogotá', async () => {
  const r = await call('POST', '/invitaciones', {
    token: sofia,
    body: {
      nombre: 'Ana',
      apellido: 'Gil',
      trato: 'senora',
      fecha: '2026-10-24',
      hora_desde: '08:00',
      hora_hasta: '09:00',
      documento: '1020304050',
    },
  });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ lugar: 'INVITADO', nota: null, documento: '1020304050' });
});

test('límite de invitaciones activas por nivel; las canceladas no cuentan', async () => {
  const c = makeClub([...invitacionesRoutes, ...qrRoutes]);
  const t = await c.login('andres@nclub.demo'); // REGULAR: 3
  const post = () => c.call('POST', '/invitaciones', { token: t, body: INVITACION });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await post()).body.id);
  expect(await post()).toMatchObject({ status: 409, body: { error: 'limite_invitaciones' } });
  await c.call('DELETE', `/invitaciones/${ids[0]}`, { token: t });
  expect((await post()).status).toBe(201);
  const vip = await c.login('sofia@nclub.demo'); // VIP: 10
  for (let i = 0; i < 10; i++) {
    expect((await c.call('POST', '/invitaciones', { token: vip, body: INVITACION })).status).toBe(
      201,
    );
  }
  expect((await c.call('POST', '/invitaciones', { token: vip, body: INVITACION })).body.error).toBe(
    'limite_invitaciones',
  );
});

test('listar: socio ve las suyas, concierge todas, filtros fecha y estado', async () => {
  const c = makeClub([...invitacionesRoutes, ...qrRoutes]);
  const s = await c.login('sofia@nclub.demo');
  const a = await c.login('andres@nclub.demo');
  const k = await c.login('concierge@nclub.demo');
  const mine = (await c.call('POST', '/invitaciones', { token: s, body: INVITACION })).body;
  await c.call('POST', '/invitaciones', {
    token: s,
    body: { ...INVITACION, fecha: '2026-10-25', nombre: 'Zeta' },
  });
  await c.call('POST', '/invitaciones', { token: a, body: INVITACION });
  await c.call('DELETE', `/invitaciones/${mine.id}`, { token: s });

  const sofiaAll = await c.call('GET', '/invitaciones', { token: s });
  expect(sofiaAll.body.items).toHaveLength(2);
  expect(
    sofiaAll.body.items.every((i: { anfitrion_id: string }) => i.anfitrion_id === 'u-sofia'),
  ).toBe(true);
  expect((await c.call('GET', '/invitaciones', { token: k })).body.items).toHaveLength(3);
  const f = await c.call('GET', '/invitaciones?fecha=2026-10-25', { token: k });
  expect(f.body.items.map((i: { nombre: string }) => i.nombre)).toEqual(['Zeta']);
  const e = await c.call('GET', '/invitaciones?estado=CANCELADA', { token: k });
  expect(e.body.items).toHaveLength(1);
  expect((await c.call('GET', '/invitaciones?estado=RARO', { token: k })).status).toBe(400);
  expect((await c.call('GET', '/invitaciones?fecha=ayer', { token: k })).status).toBe(400);
});

test('detalle: dueño y concierge sí, otro socio 403, inexistente 404', async () => {
  const inv = (await crear(sofia)).body;
  const own = await call('GET', `/invitaciones/${inv.id}`, { token: sofia });
  expect(own.status).toBe(200);
  expect(own.body.qr_payload).toBe(inv.qr_payload);
  expect((await call('GET', `/invitaciones/${inv.id}`, { token: concierge })).status).toBe(200);
  expect(await call('GET', `/invitaciones/${inv.id}`, { token: andres })).toMatchObject({
    status: 403,
    body: { error: 'invitacion_ajena' },
  });
  expect(await call('GET', '/invitaciones/nada', { token: sofia })).toMatchObject({
    status: 404,
    body: { error: 'invitacion_no_encontrada' },
  });
});

test('PATCH cambia fecha, horas, lugar y nota; valida y respeta al dueño', async () => {
  const inv = (await crear(sofia)).body;
  const r = await call('PATCH', `/invitaciones/${inv.id}`, {
    token: sofia,
    body: { fecha: '2026-10-25', hora_hasta: '16:00', lugar: 'Terraza', nota: null, nombre: 'X' },
  });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({
    fecha: '2026-10-25',
    hora_hasta: '16:00',
    lugar: 'Terraza',
    nota: null,
    nombre: 'Laura',
  });
  const exp = Date.parse('2026-10-25T16:00:00-05:00') / 1000;
  expect(r.body.qr_payload).toContain(`|Laura Diaz|${exp}|`);
  const bad = (body: object) => call('PATCH', `/invitaciones/${inv.id}`, { token: sofia, body });
  expect((await bad({ hora_desde: '17:00' })).body.error).toBe('horario_invalido');
  expect((await bad({ fecha: '2026-10-01' })).body.error).toBe('fecha_pasada');
  expect((await bad({ lugar: 'x' })).body.error).toBe('lugar_invalido');
  expect(
    (await call('PATCH', `/invitaciones/${inv.id}`, { token: andres, body: { nota: 'h' } })).status,
  ).toBe(403);
});

test('DELETE cancela; repetir es idempotente; PATCH tras cancelar 409', async () => {
  const inv = (await crear(sofia)).body;
  const del = await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia });
  expect(del).toMatchObject({ status: 200, body: { estado: 'CANCELADA' } });
  expect((await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia })).status).toBe(200);
  expect(
    await call('PATCH', `/invitaciones/${inv.id}`, { token: sofia, body: { nota: 'x' } }),
  ).toMatchObject({ status: 409, body: { error: 'invitacion_no_editable' } });
  expect((await call('DELETE', `/invitaciones/${inv.id}`, { token: andres })).status).toBe(403);
});

test('LLEGO no se edita ni se cancela', async () => {
  const inv = (await crear(sofia)).body;
  await updateInvitacion(club.store, inv.id, (i) => ({ ...i, estado: 'LLEGO' }));
  expect(
    (await call('PATCH', `/invitaciones/${inv.id}`, { token: sofia, body: { nota: 'x' } })).status,
  ).toBe(409);
  expect(await call('DELETE', `/invitaciones/${inv.id}`, { token: sofia })).toMatchObject({
    status: 409,
    body: { error: 'invitacion_no_cancelable' },
  });
});

test('pasada su hora_hasta la invitación se ve VENCIDA y ya no se edita', async () => {
  const c = makeClub([...invitacionesRoutes]);
  const t = await c.login('sofia@nclub.demo');
  const mine = (
    await c.call('POST', '/invitaciones', {
      token: t,
      body: { ...INVITACION, hora_desde: '10:00', hora_hasta: '10:30' },
    })
  ).body;
  c.setNow(new Date('2026-10-24T15:45:00Z')); // 10:45 Bogotá
  const got = await c.call('GET', `/invitaciones/${mine.id}`, { token: t });
  expect(got.body.estado).toBe('VENCIDA');
  expect(
    (await c.call('GET', '/invitaciones?estado=VENCIDA', { token: t })).body.items,
  ).toHaveLength(1);
  expect(
    (await c.call('PATCH', `/invitaciones/${mine.id}`, { token: t, body: { nota: 'x' } })).status,
  ).toBe(409);
});

test('qr.png: PNG para el dueño, 403 para otro socio', async () => {
  const inv = (await crear(sofia)).body;
  const r = await call('GET', `/invitaciones/${inv.id}/qr.png`, { token: sofia });
  expect(r.status).toBe(200);
  expect(r.res.headers.get('content-type')).toBe('image/png');
  const bytes = Buffer.from(await r.res.arrayBuffer());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect((await call('GET', `/invitaciones/${inv.id}/qr.png`, { token: andres })).status).toBe(403);
});

test('GET /me/qr: QR de socio con vencimiento a 5 minutos', async () => {
  const r = await call('GET', '/me/qr', { token: sofia });
  expect(r.status).toBe(200);
  const exp = Math.floor(Date.parse('2026-10-24T15:05:00Z') / 1000);
  expect(r.body.qr_payload).toMatch(
    new RegExp(`^NCLUB1\\|socio\\|sofia\\|Sofia Restrepo\\|${exp}\\|[0-9a-f]{20}$`),
  );
  expect(r.body.vence_at).toBe('2026-10-24T10:05:00.000-05:00');
  expect((await call('GET', '/me/qr', { token: concierge })).status).toBe(403);
});

test('ADMIN lee todas las invitaciones y el detalle, pero no escribe', async () => {
  const admin = await login('admin@nclub.demo');
  const creada = (await crear(sofia, { nombre: 'ParaAdmin' })).body;
  const lista = (await call('GET', '/invitaciones', { token: admin })).body.items;
  expect(lista.some((i: { id: string }) => i.id === creada.id)).toBe(true);
  expect((await call('GET', `/invitaciones/${creada.id}`, { token: admin })).status).toBe(200);
  expect((await crear(admin)).status).toBe(403);
  expect(
    (await call('PATCH', `/invitaciones/${creada.id}`, { token: admin, body: { nota: 'x' } }))
      .status,
  ).toBe(403);
  expect((await call('DELETE', `/invitaciones/${creada.id}`, { token: admin })).status).toBe(403);
});

// ---- v3: más datos de la invitación ---------------------------------------------------------

describe('datos v3 de la invitación', () => {
  const c = makeClub([...invitacionesRoutes, ...qrRoutes]);
  let t: string;
  beforeAll(async () => {
    t = await c.login('sofia@nclub.demo');
  });
  const post = (extra: object = {}) =>
    c.call('POST', '/invitaciones', { token: t, body: { ...INVITACION, ...extra } });
  const patch = (id: string, body: object) =>
    c.call('PATCH', `/invitaciones/${id}`, { token: t, body });

  test('POST devuelve los valores por defecto: [] , [] , punto = lugar y documento_foto NINGUNA', async () => {
    const r = await post({ lugar: 'Terraza' });
    expect(r.body).toMatchObject({
      preferencias_bebida: [],
      asistencia: [],
      punto_encuentro: 'Terraza',
      documento_foto: 'NINGUNA',
    });
  });

  test('POST y PATCH aceptan preferencias, asistencia y punto de encuentro', async () => {
    const r = await post({
      preferencias_bebida: ['te verde'],
      asistencia: ['silla_ruedas'],
      punto_encuentro: 'Entrada principal',
    });
    expect(r).toMatchObject({
      status: 201,
      body: {
        preferencias_bebida: ['te verde'],
        asistencia: ['silla_ruedas'],
        punto_encuentro: 'Entrada principal',
      },
    });
    const p = await patch(r.body.id, { asistencia: ['visual', 'acompanante'] });
    expect(p.body).toMatchObject({
      preferencias_bebida: ['te verde'], // lo no enviado se conserva
      asistencia: ['visual', 'acompanante'],
      punto_encuentro: 'Entrada principal',
    });
    const q = await patch(r.body.id, { punto_encuentro: null, lugar: 'Lounge VIP' });
    expect(q.body.punto_encuentro).toBe('Lounge VIP');
    const guardada = await c.call('GET', `/invitaciones/${r.body.id}`, { token: t });
    expect(guardada.body.asistencia).toEqual(['visual', 'acompanante']);
  });

  test.each([
    [{ preferencias_bebida: 'cafe' }, 'preferencias_invalidas'],
    [{ preferencias_bebida: Array(11).fill('x') }, 'preferencias_invalidas'],
    [{ asistencia: ['y'.repeat(41)] }, 'asistencia_invalida'],
    [{ asistencia: [7] }, 'asistencia_invalida'],
    [{ punto_encuentro: 'p'.repeat(81) }, 'punto_encuentro_invalido'],
    [{ punto_encuentro: 5 }, 'punto_encuentro_invalido'],
  ])('POST y PATCH rechazan %j', async (extra, error) => {
    expect(await post(extra)).toMatchObject({ status: 400, body: { error } });
    const ok = await post();
    expect(await patch(ok.body.id, extra)).toMatchObject({ status: 400, body: { error } });
    await c.call('DELETE', `/invitaciones/${ok.body.id}`, { token: t });
  });

  test('un registro anterior a v3 se ve con los valores por defecto', async () => {
    const r = await post();
    await updateInvitacion(c.store, r.body.id, (i) => {
      const {
        preferencias_bebida: _a,
        asistencia: _b,
        punto_encuentro: _c,
        documento_foto: _d,
        ...viejo
      } = i;
      return viejo;
    });
    const g = await c.call('GET', `/invitaciones/${r.body.id}`, { token: t });
    expect(g.body).toMatchObject({
      preferencias_bebida: [],
      asistencia: [],
      punto_encuentro: null,
      documento_foto: 'NINGUNA',
    });
  });
});

test('una fecha imposible es inválida (400), no un error del servidor', () => {
  expect(esFecha('2026-13-01')).toBe(false);
  expect(esFecha('2026-02-30')).toBe(false);
  expect(esFecha('2026-10-24')).toBe(true);
});
