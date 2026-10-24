import { signToken } from '@/club/auth';
import { moduleRoutes } from '@/club/routes';
import { sembrarVisitas } from '@/club/visitas';
import type { Tarea, Visita } from '@/club/types';
import { BOT_KEY, INVITACION, NOW, makeClub } from '../../support/club-app';

function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  const t = {
    sofia: tk('u-sofia', 'SOCIO'),
    andres: tk('u-andres', 'SOCIO'),
    mateo: tk('u-mateo', 'EDECAN'),
    conc: tk('u-natalia', 'CONCIERGE'),
    admin: tk('u-luciana', 'ADMIN'),
    marta: tk('u-marta', 'PERSONAL'),
  };
  const manual = (token = t.conc, extra: object = {}) =>
    club.call('POST', '/visitas', {
      token,
      body: { nombre: 'Laura Diaz', categoria: 'INVITADO', destino: 'Terraza', ...extra },
    });
  return { ...club, t, manual };
}

test('POST /visitas desde invitación copia datos y marca la invitación como LLEGO', async () => {
  const { call, t } = setup();
  const inv = (
    await call('POST', '/invitaciones', {
      token: t.andres,
      body: { ...INVITACION, lugar: 'Terraza' },
    })
  ).body;
  const r = await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({
    nombre: 'Laura Diaz',
    categoria: 'INVITADO',
    persona_id: inv.persona_id,
    invitacion_id: inv.id,
    anfitrion_id: 'u-andres',
    destino: 'Terraza',
    estado: 'EN_RECEPCION',
    acompanante: null,
    fin: null,
    cierre: null,
    inicio: '2026-10-24T10:00:00.000-05:00',
    recorrido: [{ tipo: 'LLEGADA', actor: 'u-natalia' }],
  });
  expect(r.body.id).toMatch(/^vis-[0-9a-f]{8}$/);
  expect((await call('GET', `/invitaciones/${inv.id}`, { token: t.conc })).body.estado).toBe(
    'LLEGO',
  );
  const again = await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } });
  expect([again.status, again.body.error]).toEqual([409, 'visita_activa']);
  expect(
    (await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: 'nada' } })).status,
  ).toBe(404);
});

test('POST /visitas manual: valida datos y roles', async () => {
  const { call, t, manual } = setup();
  const ok = await manual(t.mateo);
  expect(ok.status).toBe(201);
  expect(ok.body).toMatchObject({
    nombre: 'Laura Diaz',
    destino: 'Terraza',
    categoria: 'INVITADO',
  });
  expect((await manual(t.andres)).status).toBe(403);
  const bad = await call('POST', '/visitas', { token: t.conc, body: { destino: 'x' } });
  expect([bad.status, bad.body.error]).toEqual([422, 'visita_invalida']);
  const cat = await manual(t.conc, { categoria: 'REY' });
  expect(cat.status).toBe(422);
});

test('flujo concierge → edecán: asignar, aceptar, llegada y salida con recorrido', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual()).body;
  const asig = await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  expect(asig.status).toBe(200);
  expect(asig.body.estado).toBe('EN_RECEPCION');
  const tareas: Tarea[] = (await call('GET', '/tareas', { token: t.mateo })).body.items;
  expect(tareas).toMatchObject([
    { tipo: 'ACOMPANAR', visita_id: v.id, asignada_a: 'u-mateo', estado: 'ABIERTA' },
  ]);
  const acc = await call('POST', `/tareas/${tareas[0]!.id}/aceptar`, { token: t.mateo });
  expect(acc.body).toMatchObject({ estado: 'ACEPTADA', asignada_a: 'u-mateo' });
  const enCurso = (await call('GET', `/visitas/${v.id}`, { token: t.mateo })).body;
  expect(enCurso).toMatchObject({
    estado: 'ACOMPANANDO',
    acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo Gil' },
  });
  // otro rol no confirma la llegada de una visita que no acompaña
  expect((await call('POST', `/visitas/${v.id}/llegada`, { token: t.andres })).status).toBe(403);
  const lleg = await call('POST', `/visitas/${v.id}/llegada`, { token: t.mateo });
  expect(lleg.body).toMatchObject({ estado: 'EN_DESTINO', acompanante: null, fin: null });
  expect(
    (await call('GET', '/tareas?estado=COMPLETADA', { token: t.conc })).body.items,
  ).toHaveLength(1);
  const sal = await call('POST', `/visitas/${v.id}/salida`, { token: t.conc });
  expect(sal.body).toMatchObject({
    estado: 'CERRADA',
    cierre: 'SALIDA',
    fin: '2026-10-24T10:00:00.000-05:00',
  });
  expect(sal.body.recorrido.map((p: { tipo: string }) => p.tipo)).toEqual([
    'LLEGADA',
    'ASIGNADO',
    'ASIGNADO',
    'EN_DESTINO',
    'SALIDA',
  ]);
  const dos = await call('POST', `/visitas/${v.id}/salida`, { token: t.conc });
  expect([dos.status, dos.body.error]).toEqual([409, 'visita_cerrada']);
  const tarde = await call('POST', `/visitas/${v.id}/llegada`, { token: t.conc });
  expect([tarde.status, tarde.body.error]).toEqual([409, 'transicion_invalida']);
});

test('asignar: robot acompaña de inmediato; id desconocido 404; solo concierge/admin', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual()).body;
  expect(
    (
      await call('POST', `/visitas/${v.id}/asignar`, {
        token: t.mateo,
        body: { acompanante_id: 'x2-1' },
      })
    ).status,
  ).toBe(403);
  const nope = await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-sofia' },
  });
  expect([nope.status, nope.body.error]).toEqual([404, 'acompanante_no_encontrado']);
  const r = await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.admin,
    body: { acompanante_id: 'x2-1' },
  });
  expect(r.body).toMatchObject({
    estado: 'ACOMPANANDO',
    acompanante: { tipo: 'ROBOT', id: 'x2-1' },
  });
  const again = await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  expect([again.status, again.body.error]).toEqual([409, 'transicion_invalida']);
});

test('robot → humano: relevo del robot, aceptación y entrega confirmada', async () => {
  const { call, t } = setup();
  const bot = { bot: BOT_KEY };
  const ev = {
    id: 'f39a2e70-75bc-4b27-a515-012345678901',
    ts: NOW.toISOString(),
    tipo: 'LLEGADA',
    categoria: 'VIP',
    persona_id: 'sofia',
    nombre: 'Sofia Restrepo',
    anfitrion_id: null,
    destino: 'Lounge VIP',
    avisar: ['concierge'],
    severidad: 'info',
    requiere_atencion: false,
  };
  await call('POST', '/bot/heartbeat', { ...bot, body: { robot: 'x2-1', estado: 'acompanando' } });
  expect((await call('POST', '/bot/eventos', { ...bot, body: ev })).status).toBe(201);
  const activas = (await call('GET', '/bot/visitas?activas=1', bot)).body.items as Visita[];
  expect(activas).toMatchObject([
    { persona_id: 'sofia', estado: 'ACOMPANANDO', acompanante: { tipo: 'ROBOT', id: 'x2-1' } },
  ]);
  const id = activas[0]!.id;
  const rel = await call('POST', `/bot/visitas/${id}/relevo`, {
    ...bot,
    body: { motivo: 'Escaleras: necesita ayuda humana' },
  });
  expect(rel.body).toMatchObject({ tipo: 'RELEVO', estado: 'ABIERTA', visita_id: id });
  expect((await call('GET', `/visitas/${id}`, { token: t.conc })).body.estado).toBe('EN_RELEVO');
  const cola = (await call('GET', '/cola', { token: t.conc })).body.items;
  expect(cola).toMatchObject([{ visita_id: id, tarea_id: rel.body.id, prioridad: 'alta' }]);
  // el edecán no puede recibir sin aceptar
  expect((await call('POST', `/visitas/${id}/recibir`, { token: t.mateo })).status).toBe(403);
  expect((await call('POST', `/tareas/${rel.body.id}/aceptar`, { token: t.mateo })).status).toBe(
    200,
  );
  const rec = await call('POST', `/visitas/${id}/recibir`, { token: t.mateo });
  expect(rec.body).toMatchObject({
    estado: 'ACOMPANANDO',
    acompanante: { tipo: 'HUMANO', id: 'u-mateo' },
  });
  expect(rec.body.recorrido.at(-1)).toMatchObject({
    tipo: 'ENTREGA_CONFIRMADA',
    actor: 'u-mateo',
    detalle: 'Entregó Robot x2-1; recibió Mateo Gil',
  });
  const dup = await call('POST', `/visitas/${id}/recibir`, { token: t.mateo });
  expect([dup.status, dup.body.error]).toEqual([409, 'entrega_ya_confirmada']);
  // el robot ya no es el acompañante: no puede cerrar el acompañamiento
  const x = await call('POST', `/bot/visitas/${id}/estado`, {
    ...bot,
    body: { estado: 'EN_DESTINO' },
  });
  expect([x.status, x.body.error]).toEqual([409, 'acompanante_distinto']);
  expect((await call('POST', `/visitas/${id}/llegada`, { token: t.mateo })).body.estado).toBe(
    'EN_DESTINO',
  );
});

test('bot estado: ACOMPANANDO y EN_DESTINO; relevo por edecán y transición inválida', async () => {
  const { call, t, manual } = setup();
  const bot = { bot: BOT_KEY };
  const v: Visita = (await manual()).body;
  const a = await call('POST', `/bot/visitas/${v.id}/estado`, {
    ...bot,
    body: { estado: 'ACOMPANANDO', destino: 'Restaurante', detalle: 'Guiando' },
  });
  expect(a.body).toMatchObject({
    estado: 'ACOMPANANDO',
    destino: 'Restaurante',
    acompanante: { tipo: 'ROBOT', id: 'x2-1' },
  });
  expect(
    (await call('POST', `/visitas/${v.id}/relevo`, { token: t.mateo, body: { motivo: 'x' } }))
      .status,
  ).toBe(403);
  const d = await call('POST', `/bot/visitas/${v.id}/estado`, {
    ...bot,
    body: { estado: 'EN_DESTINO' },
  });
  expect(d.body).toMatchObject({ estado: 'EN_DESTINO', acompanante: null });
  const r = await call('POST', `/bot/visitas/${v.id}/relevo`, { ...bot, body: { motivo: 'x' } });
  expect([r.status, r.body.error]).toEqual([409, 'transicion_invalida']);
  expect(
    (
      await call('POST', '/bot/visitas/vis-00000000/estado', {
        ...bot,
        body: { estado: 'EN_DESTINO' },
      })
    ).status,
  ).toBe(404);
  expect(
    (await call('POST', `/bot/visitas/${v.id}/estado`, { ...bot, body: { estado: 'X' } })).status,
  ).toBe(422);
});

test('relevo humano (edecán acompañante o concierge) dirigido a otro edecán', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual()).body;
  await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  const [tarea] = (await call('GET', '/tareas', { token: t.mateo })).body.items as Tarea[];
  await call('POST', `/tareas/${tarea!.id}/aceptar`, { token: t.mateo });
  const r = await call('POST', `/visitas/${v.id}/relevo`, {
    token: t.mateo,
    body: { motivo: 'Fin de turno', a: 'u-mateo' },
  });
  expect(r.body).toMatchObject({ tipo: 'RELEVO', asignada_a: 'u-mateo', motivo: 'Fin de turno' });
  const bad = await call('POST', `/visitas/${v.id}/relevo`, {
    token: t.conc,
    body: { motivo: 'otra' },
  });
  expect([bad.status, bad.body.error]).toEqual([409, 'transicion_invalida']);
  const v2: Visita = (await manual(t.conc, { nombre: 'Otro Invitado' })).body;
  await call('POST', `/visitas/${v2.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'x2-1' },
  });
  const c = await call('POST', `/visitas/${v2.id}/relevo`, {
    token: t.conc,
    body: { motivo: 'Batería', a: 'u-sofia' },
  });
  expect([c.status, c.body.error]).toEqual([404, 'acompanante_no_encontrado']);
});

test('ayuda: socio anfitrión, edecán o concierge; el socio ajeno no', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual(t.conc, { persona_id: 'andres', categoria: 'REGULAR' })).body;
  const r = await call('POST', `/visitas/${v.id}/ayuda`, {
    token: t.andres,
    body: { motivo: 'Silla de ruedas' },
  });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({
    tipo: 'AYUDA',
    prioridad: 'urgente',
    estado: 'ABIERTA',
    asignada_a: null,
    motivo: 'Silla de ruedas',
  });
  expect(
    (await call('POST', `/visitas/${v.id}/ayuda`, { token: t.sofia, body: { motivo: 'x' } }))
      .status,
  ).toBe(403);
  expect(
    (await call('POST', `/visitas/${v.id}/ayuda`, { token: t.mateo, body: { motivo: 'x' } }))
      .status,
  ).toBe(201);
  expect((await call('POST', `/visitas/${v.id}/ayuda`, { token: t.andres, body: {} })).status).toBe(
    422,
  );
  const vis = (await call('GET', `/visitas/${v.id}`, { token: t.conc })).body as Visita;
  expect(vis.recorrido.filter((p) => p.tipo === 'AYUDA')).toHaveLength(2);
  await call('POST', `/visitas/${v.id}/salida`, { token: t.conc });
  const cerrada = await call('POST', `/visitas/${v.id}/ayuda`, {
    token: t.conc,
    body: { motivo: 'x' },
  });
  expect([cerrada.status, cerrada.body.error]).toEqual([409, 'visita_cerrada']);
  // cerrar la visita cancela la ayuda abierta
  expect((await call('GET', '/tareas?estado=ABIERTA', { token: t.conc })).body.items).toEqual([]);
});

test('encuentro: solo el socio anfitrión, sin visita cerrada; actualiza el punto de la tarea', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual(t.conc, { persona_id: 'andres', categoria: 'REGULAR' })).body;
  await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  const url = `/visitas/${v.id}/encuentro`;
  const body = { punto_encuentro: 'Entrada norte', ubicacion_anfitrion: 'Terraza, mesa 4' };
  expect((await call('PATCH', url, { token: t.sofia, body })).status).toBe(403);
  expect((await call('PATCH', url, { token: t.conc, body })).status).toBe(403);
  expect((await call('PATCH', url, { token: t.andres, body: {} })).status).toBe(422);
  const r = await call('PATCH', url, { token: t.andres, body });
  expect(r.body).toMatchObject(body);
  expect(r.body.recorrido.at(-1)).toMatchObject({ tipo: 'ENCUENTRO', actor: 'u-andres' });
  expect((await call('GET', '/tareas', { token: t.mateo })).body.items[0].punto_encuentro).toBe(
    'Entrada norte',
  );
  const borra = await call('PATCH', url, { token: t.andres, body: { ubicacion_anfitrion: null } });
  expect(borra.body).toMatchObject({ punto_encuentro: 'Entrada norte', ubicacion_anfitrion: null });
});

test('visibilidad: socio (invitados y propia), edecán (activas), concierge/admin (todas)', async () => {
  const { call, t, manual } = setup();
  const own: Visita = (
    await manual(t.conc, { persona_id: 'sofia', nombre: 'Sofia Restrepo', categoria: 'VIP' })
  ).body;
  const inv = (await call('POST', '/invitaciones', { token: t.andres, body: INVITACION })).body;
  const guest: Visita = (
    await call('POST', '/visitas', { token: t.conc, body: { invitacion_id: inv.id } })
  ).body;
  const done: Visita = (await manual(t.conc, { nombre: 'Cerrada Ya' })).body;
  await call('POST', `/visitas/${done.id}/salida`, { token: t.conc });
  const ids = async (token: string, q = '') =>
    ((await call('GET', `/visitas${q}`, { token })).body.items as Visita[]).map((v) => v.id).sort();
  expect(await ids(t.sofia)).toEqual([own.id]);
  expect(await ids(t.andres)).toEqual([guest.id]);
  expect(await ids(t.mateo)).toEqual([own.id, guest.id].sort());
  expect(await ids(t.conc)).toEqual([own.id, guest.id, done.id].sort());
  expect(await ids(t.admin, '?estado=CERRADA')).toEqual([done.id]);
  expect(await ids(t.admin, '?fecha=2026-10-23')).toEqual([]);
  expect(await ids(t.admin, '?fecha=2026-10-24&estado=EN_RECEPCION')).toEqual(
    [own.id, guest.id].sort(),
  );
  expect((await call('GET', '/visitas?estado=X', { token: t.admin })).body.error).toBe(
    'estado_invalido',
  );
  expect((await call('GET', '/visitas?fecha=hoy', { token: t.admin })).body.error).toBe(
    'fecha_invalida',
  );
  expect((await call('GET', `/visitas/${own.id}`, { token: t.andres })).status).toBe(403);
  expect((await call('GET', `/visitas/${guest.id}`, { token: t.andres })).status).toBe(200);
  expect((await call('GET', `/visitas/${done.id}`, { token: t.mateo })).status).toBe(403);
  expect((await call('GET', '/visitas/vis-00000000', { token: t.conc })).status).toBe(404);
  expect((await call('GET', '/visitas', { token: t.marta })).status).toBe(403);
});

test('listar usa índices por día y getMany, sin lecturas sueltas', async () => {
  const { call, t, manual, store } = setup();
  for (let i = 0; i < 5; i++) await manual(t.conc, { nombre: `Invitado ${i}` });
  const get = jest.spyOn(store, 'get');
  const many = jest.spyOn(store, 'getMany');
  expect((await call('GET', '/visitas', { token: t.conc })).body.items).toHaveLength(5);
  expect(get).not.toHaveBeenCalled();
  expect(many.mock.calls.length).toBeLessThanOrEqual(2);
});

test('evaluar la visita: socio anfitrión, valores 1..5', async () => {
  const { call, t, manual } = setup();
  const v: Visita = (await manual(t.conc, { persona_id: 'andres', categoria: 'REGULAR' })).body;
  const ok = await call('POST', `/visitas/${v.id}/evaluacion`, {
    token: t.andres,
    body: { robot: 5, club: 4, comentario: 'Muy amable', transcripcion: 'gracias' },
  });
  expect(ok.status).toBe(201);
  expect(ok.body).toMatchObject({ visita_id: v.id, autor: 'u-andres', robot: 5, club: 4 });
  expect(
    (
      await call('POST', `/visitas/${v.id}/evaluacion`, {
        token: t.andres,
        body: { robot: 6, club: 4 },
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call('POST', `/visitas/${v.id}/evaluacion`, {
        token: t.sofia,
        body: { robot: 5, club: 4 },
      })
    ).status,
  ).toBe(403);
});

test('sembrarVisitas deja datos de hoy: visitas, tareas, incidencias y evaluaciones', async () => {
  const { call, t, store } = setup();
  await sembrarVisitas(store, NOW);
  const visitas = (await call('GET', '/visitas', { token: t.conc })).body.items as Visita[];
  expect(visitas.length).toBeGreaterThanOrEqual(6);
  expect(visitas.length).toBeLessThanOrEqual(8);
  expect(new Set(visitas.map((v) => v.estado)).size).toBeGreaterThanOrEqual(4);
  expect(visitas.every((v) => v.recorrido.length >= 1 && v.inicio.startsWith('2026-10-24'))).toBe(
    true,
  );
  expect((await call('GET', '/tareas', { token: t.conc })).body.items).toHaveLength(3);
  expect((await call('GET', '/incidencias', { token: t.conc })).body.items).toHaveLength(2);
  const ev = (await call('GET', '/evaluaciones', { token: t.admin })).body;
  expect(ev.items).toHaveLength(5);
  expect(ev.puntos_clave.length).toBeGreaterThan(0);
  await sembrarVisitas(store, NOW); // idempotente
  expect((await call('GET', '/visitas', { token: t.conc })).body.items).toHaveLength(
    visitas.length,
  );
});
