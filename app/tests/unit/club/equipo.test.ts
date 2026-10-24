import { signToken } from '@/club/auth';
import { moduleRoutes } from '@/club/routes';
import type { ColaItem, MiembroEquipo, Visita } from '@/club/types';
import { BOT_KEY, NOW, makeClub } from '../../support/club-app';

function setup() {
  const club = makeClub(moduleRoutes);
  const tk = (sub: string, rol: string) =>
    signToken({ sub, rol: rol as 'SOCIO' }, club.cfg.jwtSecret!, NOW.getTime() / 1000);
  const t = {
    mateo: tk('u-mateo', 'EDECAN'),
    conc: tk('u-natalia', 'CONCIERGE'),
    admin: tk('u-luciana', 'ADMIN'),
    andres: tk('u-andres', 'SOCIO'),
  };
  const equipo = async (token = t.conc) =>
    (await club.call('GET', '/equipo', { token })).body.items as MiembroEquipo[];
  const latido = (estado: string, robot = 'x2-1') =>
    club.call('POST', '/bot/heartbeat', { bot: BOT_KEY, body: { robot, estado, detalle: 'd' } });
  return { ...club, t, equipo, latido };
}

test('robot según el latido: ok, acompañando, sin servicio y sin conexión', async () => {
  const { t, equipo, latido, setNow } = setup();
  expect((await equipo())[0]).toMatchObject({
    id: 'x2-1',
    tipo: 'ROBOT',
    estado: 'FUERA_DE_SERVICIO',
  });
  for (const [estado, esperado] of [
    ['ok', 'DISPONIBLE'],
    ['acompanando', 'ACOMPANANDO'],
    ['sin_servicio', 'CARGANDO'],
  ]) {
    await latido(estado!, 'x2-2');
    expect((await equipo(t.mateo))[0]).toMatchObject({
      id: 'x2-2',
      estado: esperado,
      detalle: 'd',
    });
  }
  setNow(new Date(NOW.getTime() + 60_000));
  expect((await equipo())[0]).toMatchObject({ id: 'x2-2', estado: 'FUERA_DE_SERVICIO' });
});

test('edecán: disponible por defecto, estado guardado y ACOMPANANDO con tarea aceptada', async () => {
  const { call, t, equipo } = setup();
  expect((await equipo()).find((m) => m.id === 'u-mateo')).toMatchObject({
    tipo: 'HUMANO',
    nombre: 'Mateo Gil',
    estado: 'DISPONIBLE',
    visita_id: null,
  });
  const r = await call('PATCH', '/me/estado', {
    token: t.mateo,
    body: { estado: 'REGRESANDO', detalle: 'Al lobby' },
  });
  expect(r.body).toMatchObject({ id: 'u-mateo', estado: 'REGRESANDO', detalle: 'Al lobby' });
  expect(
    (await call('PATCH', '/me/estado', { token: t.mateo, body: { estado: 'DORMIDO' } })).status,
  ).toBe(422);
  expect(
    (await call('PATCH', '/me/estado', { token: t.conc, body: { estado: 'DISPONIBLE' } })).status,
  ).toBe(403);
  const v: Visita = (
    await call('POST', '/visitas', { token: t.conc, body: { nombre: 'Laura', destino: 'Terraza' } })
  ).body;
  await call('POST', `/visitas/${v.id}/asignar`, {
    token: t.conc,
    body: { acompanante_id: 'u-mateo' },
  });
  const [tarea] = (await call('GET', '/tareas', { token: t.mateo })).body.items;
  await call('POST', `/tareas/${tarea.id}/aceptar`, { token: t.mateo });
  expect((await equipo(t.admin)).find((m) => m.id === 'u-mateo')).toMatchObject({
    estado: 'ACOMPANANDO',
    visita_id: v.id,
  });
  expect((await call('GET', '/equipo', { token: t.andres })).status).toBe(403);
});

test('cola: una fila por visita (con su tarea si la hay) y recepción sin acompañante; por prioridad y luego por espera', async () => {
  const { call, t, setNow } = setup();
  const crear = async (nombre: string, extra: object = {}) =>
    (
      await call('POST', '/visitas', {
        token: t.conc,
        body: { nombre, destino: 'Terraza', ...extra },
      })
    ).body as Visita;
  const vieja = await crear('Vieja Espera');
  setNow(new Date(NOW.getTime() + 10 * 60_000));
  await crear('Nueva Espera');
  const vip = await crear('Socia Vip', { categoria: 'VIP' });
  const ayuda = (
    await call('POST', `/visitas/${vip.id}/ayuda`, { token: t.conc, body: { motivo: 'Silla' } })
  ).body;
  const cola = (await call('GET', '/cola', { token: t.conc })).body.items as ColaItem[];
  expect(cola.map((c) => [c.nombre, c.prioridad, c.espera_min, c.tarea_id])).toEqual([
    ['Socia Vip', 'urgente', 0, ayuda.id],
    ['Vieja Espera', 'normal', 10, null],
    ['Nueva Espera', 'normal', 0, null],
  ]);
  expect(cola[0]).toMatchObject({ visita_id: vip.id, categoria: 'VIP', motivo: 'Silla' });
  expect(vieja.id).toBeDefined();
  expect((await call('GET', '/cola', { token: t.mateo })).status).toBe(403);
});
