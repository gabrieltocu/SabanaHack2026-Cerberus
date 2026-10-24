import { eventosRoutes } from '@/club/eventos';
import { invitacionesRoutes } from '@/club/invitaciones';
import { panelRoutes } from '@/club/panel';
import { robotRoutes } from '@/club/robot';
import { BOT_KEY, INVITACION, makeClub } from '../../support/club-app';

const club = makeClub([...invitacionesRoutes, ...eventosRoutes, ...robotRoutes, ...panelRoutes]);
const { call, login } = club;
let admin: string;
let concierge: string;
let sofia: string;

beforeAll(async () => {
  admin = await login('admin@nclub.demo');
  concierge = await login('concierge@nclub.demo');
  sofia = await login('sofia@nclub.demo');
});

let n = 0;
const evento = (patch: object = {}) =>
  call('POST', '/bot/eventos', {
    bot: BOT_KEY,
    body: {
      id: `7f0c2a1e-0000-4000-8000-${String(++n).padStart(12, '0')}`,
      ts: '2026-10-24T10:02:11-05:00',
      tipo: 'LLEGADA',
      categoria: 'INVITADO',
      nombre: `Persona ${n}`,
      destino: 'Sala',
      avisar: ['concierge'],
      severidad: 'info',
      requiere_atencion: false,
      ...patch,
    },
  });
const resumen = (q = '?fecha=2026-10-24', token = admin) =>
  call('GET', `/panel/resumen${q}`, { token });

test('solo ADMIN y CONCIERGE leen el panel; fecha inválida 400', async () => {
  expect((await resumen('?fecha=2026-10-24', sofia)).status).toBe(403);
  expect((await call('GET', '/panel/resumen')).status).toBe(401);
  expect((await resumen('?fecha=hoy')).body.error).toBe('fecha_invalida');
  expect((await resumen('?fecha=2026-10-24', concierge)).status).toBe(200);
});

test('día vacío: ceros, 17 horas (6..22), robot sin latido y sin actividad', async () => {
  const r = (await resumen('')).body; // fecha por defecto: hoy en Bogotá
  expect(r.fecha).toBe('2026-10-24');
  expect(r.kpis).toEqual({
    visitas_hoy: 0,
    visitantes_vip: 0,
    invitaciones_activas: 0,
    alertas_abiertas: 0,
    atencion_promedio_min: null,
  });
  expect(r.flujo_por_hora).toHaveLength(17);
  expect(r.flujo_por_hora[0]).toEqual({ hora: 6, socios: 0, invitados: 0, personal: 0 });
  expect(r.flujo_por_hora[16].hora).toBe(22);
  expect(r.por_categoria).toEqual({ VIP: 0, REGULAR: 0, INVITADO: 0, PERSONAL: 0, EXTERNO: 0 });
  expect(r.robot).toEqual({
    en_linea: false,
    ultimo_latido: null,
    robot: null,
    estado: null,
    detalle: null,
  });
  expect(r.actividad).toEqual([]);
});

test('KPIs, flujo por hora y categoría salen de los eventos de ese día en Bogotá', async () => {
  await evento({ categoria: 'VIP', ts: '2026-10-24T06:10:00-05:00' });
  await evento({ categoria: 'REGULAR', ts: '2026-10-24T15:05:00Z' }); // 10:05 Bogotá
  await evento({ categoria: 'INVITADO', ts: '2026-10-24T10:30:00-05:00' });
  await evento({ categoria: 'INVITADO', ts: '2026-10-24T10:40:00-05:00' });
  await evento({ categoria: 'PERSONAL', ts: '2026-10-24T22:59:00-05:00' });
  await evento({ categoria: 'EXTERNO', ts: '2026-10-24T05:59:00-05:00' }); // antes de las 6: cuenta en categoría, no en flujo
  await evento({ categoria: 'VIP', ts: '2026-10-23T11:00:00-05:00' }); // otro día
  await evento({ tipo: 'SALIDA', categoria: null, ts: '2026-10-24T12:00:00-05:00' });
  const r = (await resumen()).body;
  expect(r.kpis).toMatchObject({ visitas_hoy: 6, visitantes_vip: 1 });
  expect(r.por_categoria).toEqual({ VIP: 1, REGULAR: 1, INVITADO: 2, PERSONAL: 1, EXTERNO: 1 });
  const hora = (h: number) => r.flujo_por_hora.find((x: { hora: number }) => x.hora === h);
  expect(hora(6)).toEqual({ hora: 6, socios: 1, invitados: 0, personal: 0 });
  expect(hora(10)).toEqual({ hora: 10, socios: 1, invitados: 2, personal: 0 });
  expect(hora(22)).toEqual({ hora: 22, socios: 0, invitados: 0, personal: 1 });
  const otro = (await resumen('?fecha=2026-10-23')).body;
  expect(otro.kpis).toMatchObject({ visitas_hoy: 1, visitantes_vip: 1 });
});

test('alertas abiertas y atención promedio; actividad: 10 más nuevos primero', async () => {
  const alerta = (ts: string) =>
    evento({
      tipo: 'IMPREVISTO',
      categoria: null,
      requiere_atencion: true,
      severidad: 'atencion',
      ts,
    });
  await evento();
  await evento(); // con las alertas hay más de 10 eventos del día
  await alerta('2026-10-24T09:00:00-05:00');
  const b = await alerta('2026-10-24T09:50:00-05:00');
  const antes = (await resumen()).body.kpis.alertas_abiertas;
  expect((await call('POST', `/eventos/${b.body.id}/atender`, { token: concierge })).status).toBe(
    200,
  ); // atendido a las 10:00: 10 min
  const r = (await resumen()).body;
  expect(r.kpis.alertas_abiertas).toBe(antes - 1);
  expect(r.kpis.atencion_promedio_min).toBe(10);
  expect(r.actividad).toHaveLength(10);
  expect(r.actividad[0]).toMatchObject({ id: b.body.id, estado: 'ATENDIDO', tipo: 'IMPREVISTO' });
  expect(Object.keys(r.actividad[0]).sort()).toEqual([
    'categoria',
    'destino',
    'estado',
    'id',
    'nombre',
    'tipo',
    'ts',
  ]);
});

test('invitaciones activas: PROGRAMADA o LLEGO del día; robot igual que /robot/estado', async () => {
  await call('POST', '/invitaciones', { token: sofia, body: INVITACION });
  await call('POST', '/invitaciones', {
    token: sofia,
    body: { ...INVITACION, fecha: '2026-10-25' },
  });
  await call('POST', '/bot/heartbeat', {
    bot: BOT_KEY,
    body: { robot: 'x2-1', estado: 'acompanando', detalle: 'Guiando' },
  });
  const r = (await resumen()).body;
  expect(r.kpis.invitaciones_activas).toBe(1);
  expect(r.robot).toEqual((await call('GET', '/robot/estado', { token: admin })).body);
  expect(r.robot).toMatchObject({ en_linea: true, estado: 'acompanando' });
});

test('el resumen usa pocas lecturas del almacén (sin N+1)', async () => {
  const get = jest.spyOn(club.store, 'get');
  const many = jest.spyOn(club.store, 'getMany');
  await resumen();
  expect(get.mock.calls.length + many.mock.calls.length).toBeLessThanOrEqual(5);
  get.mockRestore();
  many.mockRestore();
});
