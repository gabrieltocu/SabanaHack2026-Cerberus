import { sembrarFijos } from '@/club/fijos';
import { getInvitacion, listInvitaciones, updateInvitacion } from '@/club/repo';
import { registrosRoutes } from '@/club/registros';
import { invitacionesRoutes } from '@/club/invitaciones';
import { BOT_KEY, makeClub, NOW } from '../../support/club-app';

const club = makeClub([...registrosRoutes, ...invitacionesRoutes]);

test('en una base vacía crea las 3 invitaciones fijas para hoy en Bogotá', async () => {
  await sembrarFijos(club.store, NOW);
  const todas = await listInvitaciones(club.store);
  expect(
    todas.map((i) => [i.id, i.persona_id, i.nombre, i.apellido, i.anfitrion_id, i.lugar]),
  ).toEqual([
    ['inv-00000001', 'inv-00000001', 'Laura', 'Diaz', 'u-andres', 'INVITADO'],
    ['inv-00000002', 'inv-00000002', 'Pedro', 'Gomez', 'u-sofia', 'Lounge VIP'],
    ['inv-00000003', 'inv-00000003', 'Ana', 'Vélez', 'u-camila', 'Terraza'],
  ]);
  expect(todas.map((i) => `${i.fecha} ${i.hora_desde}-${i.hora_hasta} ${i.estado}`)).toEqual([
    '2026-10-24 00:00-23:59 PROGRAMADA',
    '2026-10-24 00:00-23:59 PROGRAMADA',
    '2026-10-24 00:00-23:59 PROGRAMADA',
  ]);
});

test('el robot las ve en /bot/registros', async () => {
  const r = await club.call('GET', '/bot/registros?fecha=2026-10-24', { bot: BOT_KEY });
  expect(r.status).toBe(200);
  expect(Object.keys(r.body.agenda)).toEqual(
    expect.arrayContaining(['inv-00000001', 'inv-00000002', 'inv-00000003']),
  );
});

test('es idempotente: repetirlo no duplica ni pisa los cambios del mismo día', async () => {
  await updateInvitacion(club.store, 'inv-00000001', (i) => ({ ...i, estado: 'LLEGO' }));
  await sembrarFijos(club.store, NOW);
  expect(await listInvitaciones(club.store)).toHaveLength(3);
  expect((await getInvitacion(club.store, 'inv-00000001'))?.estado).toBe('LLEGO');
});

test('un día nuevo las devuelve a los valores fijos con la fecha de hoy', async () => {
  const manana = new Date(NOW.getTime() + 24 * 3600_000);
  await sembrarFijos(club.store, manana);
  const inv = await getInvitacion(club.store, 'inv-00000001');
  expect(inv).toMatchObject({ fecha: '2026-10-25', estado: 'PROGRAMADA', hora_desde: '00:00' });
  expect(await listInvitaciones(club.store)).toHaveLength(3);
});
