import { invitacionesRoutes } from '@/club/invitaciones';
import { fotosRoutes } from '@/club/fotos';
import { registrosRoutes } from '@/club/registros';
import { updateInvitacion } from '@/club/repo';
import { ORDENES, TURNOS } from '@/club/seed';
import { BOT_KEY, INVITACION, makeClub } from '../../support/club-app';

const club = makeClub([...invitacionesRoutes, ...registrosRoutes]);
const { call, login } = club;
const registros = (q = '?fecha=2026-10-24') => call('GET', `/bot/registros${q}`, { bot: BOT_KEY });

test('exige la llave del robot y una fecha válida', async () => {
  expect((await call('GET', '/bot/registros?fecha=2026-10-24')).status).toBe(401);
  expect(await registros('?fecha=hoy')).toMatchObject({
    status: 400,
    body: { error: 'fecha_invalida' },
  });
});

test('forma exacta: version, fecha, socios, agenda, turnos y ordenes con fecha', async () => {
  const r = await registros();
  expect(r.status).toBe(200);
  expect(Object.keys(r.body).sort()).toEqual([
    'agenda',
    'fecha',
    'ordenes',
    'socios',
    'turnos',
    'version',
  ]);
  expect(r.body.version).toBe(0);
  expect(r.body.fecha).toBe('2026-10-24');
  expect(r.body.socios.sofia).toEqual({
    nombre: 'Sofia',
    apellido: 'Restrepo',
    trato: 'senora',
    nivel: 'VIP',
    accion: 'empresarial',
    destino: 'VIP',
  });
  expect(Object.keys(r.body.socios).sort()).toEqual(['andres', 'camila', 'sofia']);
  expect(r.body.turnos).toEqual({ marta: { ...TURNOS.marta, en_turno: true } });
  expect(r.body.ordenes['OT-1042']).toEqual({ ...ORDENES['OT-1042'], fecha: '2026-10-24' });
  expect(r.body.agenda).toEqual({});
});

test('la fecha por defecto es hoy en Bogotá', async () => {
  expect((await registros('')).body.fecha).toBe('2026-10-24');
});

test('agenda: invitaciones PROGRAMADA o LLEGO de esa fecha; version sube con cada cambio', async () => {
  const t = await login('sofia@nclub.demo');
  const post = (extra: object = {}) =>
    call('POST', '/invitaciones', { token: t, body: { ...INVITACION, ...extra } });
  const v0 = (await registros()).body.version;
  const a = (await post()).body;
  const b = (await post({ nombre: 'Luis', apellido: 'Paz', trato: 'senor', hora_desde: '12:00' }))
    .body;
  const c = (await post({ nombre: 'Cancelada' })).body;
  const d = (await post({ nombre: 'Otro dia', fecha: '2026-10-25' })).body;
  const e = (await post({ nombre: 'Salio' })).body;
  await call('DELETE', `/invitaciones/${c.id}`, { token: t });
  await updateInvitacion(club.store, b.id, (i) => ({ ...i, estado: 'LLEGO' }));
  await updateInvitacion(club.store, e.id, (i) => ({ ...i, estado: 'SALIO' }));

  const r = await registros();
  expect(r.body.version).toBeGreaterThan(v0);
  expect(Object.keys(r.body.agenda).sort()).toEqual([a.persona_id, b.persona_id].sort());
  expect(r.body.agenda[a.persona_id]).toEqual({
    nombre: 'Laura',
    apellido: 'Diaz',
    trato: 'senora',
    anfitrion: 'sofia',
    lugar: 'INVITADO',
    hora: '10:00',
    hora_hasta: '14:00',
    foto_estado: 'NINGUNA',
    consentimiento_at: null,
  });
  expect(r.body.agenda[b.persona_id]).toMatchObject({ nombre: 'Luis', hora: '12:00' });
  expect(Object.keys((await registros('?fecha=2026-10-25')).body.agenda)).toEqual([d.persona_id]);

  const before = (await registros()).body.version;
  await call('PATCH', `/invitaciones/${a.id}`, { token: t, body: { nota: 'cambio' } });
  expect((await registros()).body.version).toBeGreaterThan(before);
});

test('al revocar la foto del invitado, registros conserva agenda y publica consentimiento revocado', async () => {
  const c = makeClub([...invitacionesRoutes, ...fotosRoutes, ...registrosRoutes]);
  const token = await c.login('sofia@nclub.demo');
  const created = await c.call('POST', '/invitaciones', { token, body: INVITACION });
  await updateInvitacion(c.store, created.body.id, (i) => ({
    ...i,
    foto_estado: 'LISTA',
    consentimiento_at: '2026-10-24T09:00:00.000-05:00',
  }));

  expect((await c.call('DELETE', `/invitaciones/${created.body.id}/foto`, { token })).status).toBe(
    200,
  );
  const response = await c.call('GET', '/bot/registros?fecha=2026-10-24', { bot: BOT_KEY });
  expect(response.body.agenda[created.body.persona_id]).toMatchObject({
    nombre: 'Laura',
    hora: '10:00',
    hora_hasta: '14:00',
    foto_estado: 'NINGUNA',
    consentimiento_at: null,
  });
});

test('una invitación vencida no entra en la agenda', async () => {
  const c = makeClub([...invitacionesRoutes, ...registrosRoutes]);
  const t = await c.login('sofia@nclub.demo');
  await c.call('POST', '/invitaciones', { token: t, body: INVITACION });
  c.setNow(new Date('2026-10-24T20:00:00Z')); // 15:00 Bogotá, después de hora_hasta
  const r = await c.call('GET', '/bot/registros?fecha=2026-10-24', { bot: BOT_KEY });
  expect(r.body.agenda).toEqual({});
});

test('en_turno: entra 30 min antes de inicio y sale al pasar fin (hora de Bogotá)', async () => {
  const enTurno = async (utc: string) => {
    club.setNow(new Date(utc));
    return (await registros()).body.turnos.marta.en_turno;
  };
  expect(await enTurno('2026-10-24T13:29:00Z')).toBe(false); // 08:29, marta entra 09:00
  expect(await enTurno('2026-10-24T13:30:00Z')).toBe(true); // 08:30
  expect(await enTurno('2026-10-24T22:00:00Z')).toBe(true); // 17:00
  expect(await enTurno('2026-10-24T22:01:00Z')).toBe(false); // 17:01
  club.setNow(new Date('2026-10-24T15:00:00Z'));
});
