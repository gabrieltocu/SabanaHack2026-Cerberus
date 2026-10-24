import { agendaRoutes } from '@/club/agenda';
import { serviciosRoutes } from '@/club/servicios';
import { makeClub } from '../../support/club-app';

const club = makeClub([...agendaRoutes, ...serviciosRoutes]);
const { call, login } = club;
const HOY = '2026-10-24';
const ORDEN = {
  nombre: 'Luis',
  apellido: 'Pena',
  trato: 'senor',
  empresa: 'Climatec',
  trabajo: 'Revisión del aire',
  solicitado_por: 'Natalia Rios',
  responsable: 'marta ruiz',
  area: 'mantenimiento',
  fecha: HOY,
  hora_desde: '11:00',
  hora_hasta: '13:00',
  punto_presentacion: 'Cocina',
};
type Item = { id: string; tipo: string; titulo: string; hora_desde: string };

test('Marta ve su turno, reuniones y el servicio donde es responsable, ordenados por hora', async () => {
  const admin = await login('admin@nclub.demo');
  await call('POST', '/servicios', { token: admin, body: ORDEN });
  await call('POST', '/servicios', { token: admin, body: { ...ORDEN, responsable: 'Jorge Diaz' } });
  const t = await login('personal@nclub.demo');
  const r = await call('GET', `/me/agenda?fecha=${HOY}`, { token: t });
  expect(r.status).toBe(200);
  const items: Item[] = r.body.items;
  expect(items.map((i) => i.tipo)).toEqual(['REUNION', 'TURNO', 'SERVICIO', 'REUNION']);
  expect(items.map((i) => i.hora_desde)).toEqual(['08:45', '09:00', '11:00', '14:00']);
  expect(items[1]).toMatchObject({
    titulo: 'Turno de cocina',
    hora_hasta: '17:00',
    fecha: HOY,
    lugar: null,
    nota: null,
  });
  expect(items[2]).toMatchObject({ lugar: 'Cocina', hora_hasta: '13:00' });
});

test('edecán y concierge tienen 2 reuniones y sin turno; socio y admin no tienen agenda', async () => {
  for (const email of ['edecan@nclub.demo', 'concierge@nclub.demo']) {
    const r = await call('GET', `/me/agenda?fecha=${HOY}`, { token: await login(email) });
    expect(r.body.items.map((i: Item) => i.tipo)).toEqual(['REUNION', 'REUNION']);
  }
  for (const email of ['sofia@nclub.demo', 'admin@nclub.demo']) {
    expect((await call('GET', '/me/agenda', { token: await login(email) })).status).toBe(403);
  }
  expect((await call('GET', '/me/agenda')).status).toBe(401);
  const t = await login('edecan@nclub.demo');
  expect((await call('GET', '/me/agenda?fecha=ayer', { token: t })).body.error).toBe(
    'fecha_invalida',
  );
});

test('recordatorios: se crean, se ordenan, son propios y solo ellos se borran', async () => {
  const marta = await login('personal@nclub.demo');
  const mateo = await login('edecan@nclub.demo');
  const c = await call('POST', '/me/agenda', {
    token: marta,
    body: { titulo: 'Llamar a proveedor', fecha: HOY, hora_desde: '10:15', nota: 'Pedir hielo' },
  });
  expect(c.status).toBe(201);
  expect(c.body).toMatchObject({
    tipo: 'RECORDATORIO',
    titulo: 'Llamar a proveedor',
    fecha: HOY,
    hora_desde: '10:15',
    hora_hasta: null,
    lugar: null,
    nota: 'Pedir hielo',
  });
  expect(c.body.id).toMatch(/^rec-[0-9a-f]{8}$/);
  const lista = (await call('GET', `/me/agenda?fecha=${HOY}`, { token: marta })).body.items;
  expect(lista.map((i: Item) => i.id)).toContain(c.body.id);
  expect(
    (await call('GET', `/me/agenda?fecha=${HOY}`, { token: mateo })).body.items.map(
      (i: Item) => i.id,
    ),
  ).not.toContain(c.body.id);
  expect(
    (await call('GET', '/me/agenda?fecha=2026-10-25', { token: marta })).body.items.map(
      (i: Item) => i.tipo,
    ),
  ).not.toContain('RECORDATORIO');

  expect((await call('DELETE', `/me/agenda/${c.body.id}`, { token: mateo })).status).toBe(404);
  expect((await call('DELETE', '/me/agenda/turno-marta', { token: marta })).status).toBe(404);
  expect((await call('DELETE', `/me/agenda/${c.body.id}`, { token: marta })).body).toEqual({
    ok: true,
  });
  expect(
    (await call('GET', `/me/agenda?fecha=${HOY}`, { token: marta })).body.items.map(
      (i: Item) => i.id,
    ),
  ).not.toContain(c.body.id);
});

test('valida el recordatorio', async () => {
  const token = await login('personal@nclub.demo');
  const post = (b: object) =>
    call('POST', '/me/agenda', {
      token,
      body: { titulo: 'x', fecha: HOY, hora_desde: '10:00', ...b },
    });
  expect((await post({ titulo: '' })).body.error).toBe('titulo_invalido');
  expect((await post({ hora_desde: '25:00' })).body.error).toBe('hora_invalida');
  expect((await post({ fecha: '2026-02-30' })).body.error).toBe('fecha_invalida');
  expect((await post({ nota: 'n'.repeat(281) })).body.error).toBe('nota_invalido');
});
