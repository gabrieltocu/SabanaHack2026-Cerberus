// Robot bookings for club events: a robot cannot hold two overlapping bookings, and the
// concierge is warned when reception would be left without a robot.
import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { fechaDe, franja, texto } from './actividades';
import { fail, json, readJson } from './http';
import { idHex, insertarIndexado, K, leerIndice, quitarDeIndice } from './repo';
import { ROBOTS } from './seed';
import type { ReservaRobot } from './types';

export const listReservas = async (store: KeyValueStore, fecha: string) =>
  (await leerIndice<ReservaRobot>(store, K.rrDia(fecha), K.rr)).sort((a, b) =>
    `${a.hora_desde}${a.id}`.localeCompare(`${b.hora_desde}${b.id}`),
  );

const solapa = (a: ReservaRobot, desde: string, hasta: string) =>
  a.hora_desde < hasta && desde < a.hora_hasta;

/** Stores a booking (no checks); the route and the demo seed share it. */
export async function guardarReserva(
  store: KeyValueStore,
  datos: Omit<ReservaRobot, 'id'>,
): Promise<ReservaRobot> {
  for (;;) {
    const r: ReservaRobot = { ...datos, id: idHex('rr-') };
    if (await insertarIndexado(store, K.rr(r.id), K.rrDia(r.fecha), r.id, r)) return r;
  }
}

const ROLES = ['ADMIN', 'CONCIERGE'] as const;

export const reservasRoutes: Route[] = [
  {
    method: 'GET',
    path: '/reservas-robot',
    auth: [...ROLES],
    handler: async (ctx) => json(200, { items: await listReservas(ctx.store, fechaDe(ctx)) }),
  },
  {
    method: 'POST',
    path: '/reservas-robot',
    auth: [...ROLES],
    handler: async (ctx) => {
      const b = await readJson(ctx.req);
      if (typeof b.cobertura_recepcion !== 'boolean') {
        throw fail(
          400,
          'cobertura_invalida',
          'Indica si la recepción queda cubierta (true o false).',
        );
      }
      const datos = {
        evento: texto(b.evento, 'evento', 80),
        ...franja(b),
        robot: texto(b.robot, 'robot', 40),
        lugar: texto(b.lugar, 'lugar', 60),
        cobertura_recepcion: b.cobertura_recepcion,
        creada_por: ctx.user!.id,
      };
      // ponytail: read-then-insert is not atomic; two simultaneous bookings could overlap.
      const delDia = (await listReservas(ctx.store, datos.fecha)).filter((r) =>
        solapa(r, datos.hora_desde, datos.hora_hasta),
      );
      if (delDia.some((r) => r.robot === datos.robot)) {
        throw fail(409, 'robot_ocupado', 'Ese robot ya tiene una reserva en ese horario.');
      }
      const reserva = await guardarReserva(ctx.store, datos);
      const otroLibre = ROBOTS.some((r) => r !== datos.robot && !delDia.some((x) => x.robot === r));
      return json(
        201,
        datos.cobertura_recepcion || otroLibre
          ? reserva
          : { ...reserva, advertencia: 'La recepción quedaría sin robot en ese horario.' },
      );
    },
  },
  {
    method: 'DELETE',
    path: '/reservas-robot/:id',
    auth: [...ROLES],
    handler: async (ctx) => {
      const r = (await ctx.store.get<ReservaRobot>(K.rr(ctx.params.id!)))?.value;
      if (!r) throw fail(404, 'reserva_no_encontrada', 'La reserva no existe.');
      await quitarDeIndice(ctx.store, K.rrDia(r.fecha), r.id);
      await ctx.store.delete(K.rr(r.id));
      return json(200, { ok: true });
    },
  },
];
