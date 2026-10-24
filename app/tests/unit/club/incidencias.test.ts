import { signToken } from '@/club/auth';
import { moduleRoutes } from '@/club/routes';
import type { Incidencia, Visita } from '@/club/types';
import { BOT_KEY, NOW, makeClub } from '../../support/club-app';

function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  return {
    ...club,
    t: {
      mateo: tk('u-mateo', 'EDECAN'),
      conc: tk('u-natalia', 'CONCIERGE'),
      marta: tk('u-marta', 'PERSONAL'),
      sofia: tk('u-sofia', 'SOCIO'),
      andres: tk('u-andres', 'SOCIO'),
    },
  };
}

test('reportar: cualquier rol del club; con visita añade el paso INCIDENCIA', async () => {
  const { call, t } = setup();
  const v: Visita = (
    await call('POST', '/visitas', { token: t.conc, body: { nombre: 'Laura', destino: 'Terraza' } })
  ).body;
  const r = await call('POST', '/incidencias', {
    token: t.mateo,
    body: { tipo: 'ASISTENCIA', descripcion: 'Necesita silla', lugar: 'Entrada', visita_id: v.id },
  });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({
    tipo: 'ASISTENCIA',
    lugar: 'Entrada',
    visita_id: v.id,
    reportada_por: 'u-mateo',
    estado: 'ABIERTA',
    resuelta_at: null,
  });
  expect(r.body.id).toMatch(/^inc-[0-9a-f]{8}$/);
  const vis = (await call('GET', `/visitas/${v.id}`, { token: t.conc })).body as Visita;
  expect(vis.recorrido.at(-1)).toMatchObject({ tipo: 'INCIDENCIA', actor: 'u-mateo' });
  const marta = await call('POST', '/incidencias', {
    token: t.marta,
    body: { tipo: 'OTRA', descripcion: 'Fuga de agua' },
  });
  expect(marta.body).toMatchObject({ lugar: null, visita_id: null, reportada_por: 'u-marta' });
});

test('reportar valida tipo, descripción y visita (ajena 403, inexistente 404)', async () => {
  const { call, t } = setup();
  const v: Visita = (
    await call('POST', '/visitas', {
      token: t.conc,
      body: { nombre: 'Sofia', destino: 'Lounge', persona_id: 'sofia', categoria: 'VIP' },
    })
  ).body;
  const post = (token: string, body: object) => call('POST', '/incidencias', { token, body });
  expect((await post(t.mateo, { tipo: 'RARA', descripcion: 'x' })).body.error).toBe(
    'incidencia_invalida',
  );
  expect((await post(t.mateo, { tipo: 'OTRA', descripcion: ' ' })).status).toBe(422);
  expect((await post(t.mateo, { tipo: 'OTRA', descripcion: 'x', visita_id: 'vis-0' })).status).toBe(
    404,
  );
  expect((await post(t.andres, { tipo: 'OTRA', descripcion: 'x', visita_id: v.id })).status).toBe(
    403,
  );
  expect((await post(t.sofia, { tipo: 'OTRA', descripcion: 'x', visita_id: v.id })).status).toBe(
    201,
  );
  expect((await call('POST', '/incidencias', { body: {} })).status).toBe(401);
});

test('listar y resolver: concierge/admin resuelven, edecán lista, filtro por estado', async () => {
  const { call, t } = setup();
  const crear = (descripcion: string) =>
    call('POST', '/bot/incidencias', {
      bot: BOT_KEY,
      body: { tipo: 'RUTA_BLOQUEADA', descripcion, lugar: 'Pasillo' },
    });
  const a = (await crear('Carrito en el pasillo')).body as Incidencia;
  expect(a.reportada_por).toBe('x2-1');
  await crear('Otra');
  expect((await call('POST', `/incidencias/${a.id}/resolver`, { token: t.mateo })).status).toBe(
    403,
  );
  const r = await call('POST', `/incidencias/${a.id}/resolver`, { token: t.conc });
  expect(r.body).toMatchObject({
    estado: 'RESUELTA',
    resuelta_at: '2026-10-24T10:00:00.000-05:00',
  });
  expect((await call('POST', `/incidencias/${a.id}/resolver`, { token: t.conc })).body.estado).toBe(
    'RESUELTA',
  );
  expect((await call('POST', '/incidencias/inc-0/resolver', { token: t.conc })).status).toBe(404);
  expect((await call('GET', '/incidencias', { token: t.mateo })).body.items).toHaveLength(2);
  expect(
    (await call('GET', '/incidencias?estado=ABIERTA', { token: t.conc })).body.items,
  ).toHaveLength(1);
  expect((await call('GET', '/incidencias?estado=X', { token: t.conc })).body.error).toBe(
    'estado_invalido',
  );
  expect((await call('GET', '/incidencias', { token: t.marta })).status).toBe(403);
});
