import { demoRoutes } from '@/club/demo';
import { membresiaRoutes } from '@/club/membresia';
import { listEventos } from '@/club/eventos';
import { listarActividades } from '@/club/actividades';
import { listInvitaciones } from '@/club/repo';
import { robotEstado } from '@/club/robot';
import { listServicios } from '@/club/servicios';
import { listReservas } from '@/club/reservas';
import { NOW, makeClub } from '../../support/club-app';

const HOY = '2026-10-24';
const club = makeClub([...demoRoutes, ...membresiaRoutes]);
const { call, login, store } = club;

test('solo ADMIN siembra', async () => {
  expect((await call('POST', '/demo/sembrar')).status).toBe(401);
  for (const email of ['sofia@nclub.demo', 'concierge@nclub.demo', 'personal@nclub.demo']) {
    expect((await call('POST', '/demo/sembrar', { token: await login(email) })).status).toBe(403);
  }
  expect(await listEventos(store)).toEqual([]);
});

test('siembra el día: actividades, órdenes, reservas, solicitudes, invitaciones, eventos y latido', async () => {
  const admin = await login('admin@nclub.demo');
  const r = await call('POST', '/demo/sembrar', { token: admin });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ ya_sembrado: false });

  expect((await listarActividades(store, HOY)).length).toBeGreaterThanOrEqual(4);
  expect(await listServicios(store, HOY)).toHaveLength(3);
  expect(await listReservas(store, HOY)).toHaveLength(2);
  expect((await call('GET', '/membresia/solicitudes', { token: admin })).body.items).toHaveLength(
    2,
  );
  const invs = await listInvitaciones(store);
  expect(invs).toHaveLength(6);
  expect([...new Set(invs.map((i) => i.anfitrion_id))].sort()).toEqual([
    'u-andres',
    'u-camila',
    'u-sofia',
  ]);
  expect(
    invs.every((i) => i.fecha === HOY && i.punto_encuentro && i.preferencias_bebida!.length > 0),
  ).toBe(true);
  expect(invs.filter((i) => i.estado === 'LLEGO')).toHaveLength(3); // sus eventos de llegada usan insertarEvento
  expect(invs.some((i) => i.asistencia!.length > 0)).toBe(true);

  const eventos = await listEventos(store);
  expect(eventos).toHaveLength(10);
  const llegadas = eventos.filter((e) => e.tipo === 'LLEGADA');
  expect([...new Set(llegadas.map((e) => e.categoria))].sort()).toEqual([
    'EXTERNO',
    'INVITADO',
    'PERSONAL',
    'REGULAR',
    'VIP',
  ]);
  expect(eventos.filter((e) => e.tipo === 'ESCALADO_RECEPCION')).toMatchObject([
    { severidad: 'urgente', requiere_atencion: true, estado: 'NUEVO' },
  ]);
  expect(eventos.filter((e) => e.tipo === 'IMPREVISTO')).toHaveLength(1);
  expect(eventos.some((e) => e.estado === 'ATENDIDO' && e.atendido_por && e.atendido_at)).toBe(
    true,
  );
  const ts = eventos.map((e) => e.ts);
  expect(ts).toEqual([...ts].sort());
  expect(ts[0]!.slice(0, 16)).toBe(`${HOY}T08:00`);
  expect(Date.parse(ts.at(-1)!)).toBeLessThanOrEqual(NOW.getTime());
  expect(eventos.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  expect((await robotEstado(store, NOW)).en_linea).toBe(true);
});

test('es idempotente por día: la segunda vez responde 200 y no duplica nada', async () => {
  const admin = await login('admin@nclub.demo');
  const r = await call('POST', '/demo/sembrar', { token: admin });
  expect(r).toMatchObject({ status: 200, body: { ya_sembrado: true } });
  expect(await listEventos(store)).toHaveLength(10);
  expect(await listInvitaciones(store)).toHaveLength(6);
  expect(await listServicios(store, HOY)).toHaveLength(3);
});

test('al día siguiente vuelve a sembrar', async () => {
  club.setNow(new Date('2026-10-25T20:00:00Z'));
  const admin = await login('admin@nclub.demo');
  expect((await call('POST', '/demo/sembrar', { token: admin })).status).toBe(201);
  expect(await listEventos(store)).toHaveLength(20);
  club.setNow(NOW);
});
