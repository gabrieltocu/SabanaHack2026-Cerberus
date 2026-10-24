import { adminRoutes } from '@/club/admin';
import { invitacionesRoutes } from '@/club/invitaciones';
import { serviciosRoutes } from '@/club/servicios';
import { LUGARES } from '@/club/seed';
import { INVITACION, makeClub } from '../../support/club-app';

const { call, login } = makeClub([...adminRoutes, ...invitacionesRoutes, ...serviciosRoutes]);

test('solo ADMIN lee los registros', async () => {
  expect((await call('GET', '/admin/registros')).status).toBe(401);
  for (const email of ['sofia@nclub.demo', 'concierge@nclub.demo', 'personal@nclub.demo']) {
    expect((await call('GET', '/admin/registros', { token: await login(email) })).status).toBe(403);
  }
});

test('usuarios sin clave, invitaciones por estado, servicios de hoy y destinos', async () => {
  const sofia = await login('sofia@nclub.demo');
  const a = (await call('POST', '/invitaciones', { token: sofia, body: INVITACION })).body;
  await call('POST', '/invitaciones', { token: sofia, body: INVITACION });
  await call('DELETE', `/invitaciones/${a.id}`, { token: sofia });
  const admin = await login('admin@nclub.demo');
  const orden = {
    nombre: 'Luis',
    apellido: 'Pena',
    trato: 'senor',
    empresa: 'Climatec',
    trabajo: 'Revisión',
    responsable: 'Marta Ruiz',
    area: 'mantenimiento',
    hora_desde: '11:00',
    hora_hasta: '12:00',
  };
  await call('POST', '/servicios', { token: admin, body: { ...orden, fecha: '2026-10-24' } });
  await call('POST', '/servicios', { token: admin, body: { ...orden, fecha: '2026-10-25' } });

  const r = await call('GET', '/admin/registros', { token: admin });
  expect(r.status).toBe(200);
  expect(r.body.usuarios).toHaveLength(7);
  expect(r.body.usuarios.some((u: object) => 'clave_hash' in u)).toBe(false);
  expect(r.body.usuarios.find((u: { id: string }) => u.id === 'u-marta')).toMatchObject({
    rol: 'PERSONAL',
    email: 'personal@nclub.demo',
  });
  expect(r.body.invitaciones_por_estado).toEqual({
    PROGRAMADA: 1,
    LLEGO: 0,
    SALIO: 0,
    CANCELADA: 1,
    VENCIDA: 0,
  });
  expect(r.body.servicios).toHaveLength(1);
  expect(r.body.servicios[0]).toMatchObject({ fecha: '2026-10-24', empresa: 'Climatec' });
  expect(r.body.destinos).toEqual(LUGARES);
});
