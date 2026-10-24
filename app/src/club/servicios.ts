// Service work orders (external workers): staff create and edit them, the robot loads them
// through /bot/registros, and the responsible person sees them in their agenda.
import { randomInt } from 'node:crypto';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { ClubCtx, Route } from './app';
import { fechaDe, franja, texto } from './actividades';
import { fail, json, readJson } from './http';
import {
  agregarAIndice,
  bumpVersion,
  idHex,
  insertarIndexado,
  K,
  leerIndice,
  quitarDeIndice,
  update,
} from './repo';
import { ORDENES } from './seed';
import { listPersonasRobot, personasExternasRobot } from './personas';
import type { OrdenServicio } from './types';
import { bogotaExp } from './qr';

const ESTADOS: OrdenServicio['estado'][] = ['PROGRAMADA', 'EN_CURSO', 'TERMINADA', 'CANCELADA'];
type Datos = Omit<OrdenServicio, 'id' | 'persona' | 'estado'>;

export const servicioVigente = (orden: OrdenServicio, now: Date) =>
  ['PROGRAMADA', 'EN_CURSO'].includes(orden.estado) &&
  now.getTime() >= bogotaExp(orden.fecha, orden.hora_desde) * 1000 &&
  now.getTime() <= bogotaExp(orden.fecha, orden.hora_hasta) * 1000;

/** Validates the editable part of an order; `defecto` fills `solicitado_por` when missing. */
export function validarOrden(b: Record<string, unknown>, defecto: string): Datos {
  if (b.trato !== 'senor' && b.trato !== 'senora') {
    throw fail(400, 'trato_invalido', 'El trato debe ser "senor" o "senora".');
  }
  return {
    nombre: texto(b.nombre, 'nombre', 60),
    apellido: texto(b.apellido, 'apellido', 60),
    trato: b.trato,
    empresa: texto(b.empresa, 'empresa', 80),
    trabajo: texto(b.trabajo, 'trabajo', 200),
    solicitado_por: texto(b.solicitado_por ?? defecto, 'solicitado_por', 80),
    responsable: texto(b.responsable, 'responsable', 80),
    area: texto(b.area, 'area', 60),
    ...franja(b),
    punto_presentacion: texto(b.punto_presentacion ?? 'Recepción', 'punto_presentacion', 60),
  };
}

/** Orders of a day (all states), by start time. */
export async function listServicios(store: KeyValueStore, fecha: string): Promise<OrdenServicio[]> {
  return (await leerIndice<OrdenServicio>(store, K.otDia(fecha), K.ot)).sort((a, b) =>
    `${a.hora_desde}${a.id}`.localeCompare(`${b.hora_desde}${b.id}`),
  );
}

/** Stores a new order (`OT-` + 4 digits, `ext-` + 6 hex person) and bumps the robot's version. */
export async function crearOrden(
  store: KeyValueStore,
  datos: Datos,
  persona?: string,
): Promise<OrdenServicio> {
  for (;;) {
    const id = `OT-${randomInt(1000, 10000)}`;
    if (id in ORDENES) continue; // the seed order keeps its id
    const orden: OrdenServicio = {
      ...datos,
      id,
      persona: persona ?? idHex('ext-', 3),
      estado: 'PROGRAMADA',
    };
    if (await insertarIndexado(store, K.ot(id), K.otDia(orden.fecha), id, orden)) {
      await bumpVersion(store);
      return orden;
    }
  }
}

const nombreDe = (ctx: ClubCtx) => `${ctx.user!.nombre} ${ctx.user!.apellido}`;

export const serviciosRoutes: Route[] = [
  {
    method: 'GET',
    path: '/servicios/personas',
    auth: ['PERSONAL', 'ADMIN'],
    handler: async (ctx) =>
      json(200, {
        items: [...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))]
          .filter((p) => p.categoria === 'EXTERNO')
          .map(({ id, nombre }) => ({ id, nombre })),
      }),
  },
  {
    method: 'GET',
    path: '/servicios',
    auth: ['PERSONAL', 'ADMIN', 'CONCIERGE', 'EDECAN'],
    handler: async (ctx) => json(200, { items: await listServicios(ctx.store, fechaDe(ctx)) }),
  },
  {
    method: 'POST',
    path: '/servicios',
    auth: ['PERSONAL', 'ADMIN'],
    handler: async (ctx) => {
      const body = await readJson(ctx.req);
      const persona = body.persona_id;
      if (
        persona !== undefined &&
        (typeof persona !== 'string' ||
          ![...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))].some(
            (p) => p.id === persona && p.categoria === 'EXTERNO',
          ))
      )
        throw fail(422, 'persona_invalida', 'La identidad externa no está en el catálogo.');
      return json(
        201,
        await crearOrden(
          ctx.store,
          validarOrden(body, nombreDe(ctx)),
          persona as string | undefined,
        ),
      );
    },
  },
  {
    method: 'PATCH',
    path: '/servicios/:id',
    auth: ['PERSONAL', 'ADMIN'],
    handler: async (ctx) => {
      const actual = (await ctx.store.get<OrdenServicio>(K.ot(ctx.params.id!)))?.value;
      if (!actual) throw fail(404, 'servicio_no_encontrado', 'La orden de servicio no existe.');
      const b = await readJson(ctx.req);
      const datos = validarOrden({ ...actual, ...b }, nombreDe(ctx));
      const estado = b.estado ?? actual.estado;
      if (!ESTADOS.includes(estado as OrdenServicio['estado'])) {
        throw fail(400, 'estado_invalido', `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
      }
      const next = await update<OrdenServicio>(ctx.store, K.ot(actual.id), (cur) => ({
        ...cur!,
        ...datos,
        estado: estado as OrdenServicio['estado'],
      }));
      if (next.fecha !== actual.fecha) {
        await agregarAIndice(ctx.store, K.otDia(next.fecha), next.id);
        await quitarDeIndice(ctx.store, K.otDia(actual.fecha), next.id);
      }
      await bumpVersion(ctx.store);
      return json(200, next);
    },
  },
];
