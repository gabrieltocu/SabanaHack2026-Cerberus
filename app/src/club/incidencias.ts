// Incidents reported by the team or the robot (blocked route, robot failure, assistance...).
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { fail, json, readJson } from './http';
import { bogotaHoy } from './invitaciones';
import { isoBogota } from './qr';
import {
  conPaso,
  getVisita,
  insertarDoc,
  KV,
  leerIndices,
  parsear,
  puedeVer,
  texto,
  update,
  updateVisita,
} from './repo';
import { robotDe } from './visitas';
import type { Incidencia, Usuario } from './types';

const TIPOS = ['FALLA_ROBOT', 'CONEXION', 'RUTA_BLOQUEADA', 'ASISTENCIA', 'OTRA'] as const;
const ESTADOS = ['ABIERTA', 'RESUELTA'];
const schema = z.object({
  tipo: z.enum(TIPOS),
  descripcion: texto(500),
  lugar: texto(80).optional(),
  visita_id: texto(60).optional(),
});

export async function crearIncidencia(
  store: KeyValueStore,
  b: z.infer<typeof schema>,
  at: Date,
  quien: string,
  usuario?: Usuario,
): Promise<Incidencia> {
  const visita = b.visita_id ? await getVisita(store, b.visita_id) : null;
  if (b.visita_id && !visita) throw fail(404, 'visita_no_encontrada', 'La visita no existe.');
  if (visita && usuario && !puedeVer(usuario, visita)) {
    throw fail(403, 'visita_ajena', 'No tienes acceso a esta visita.');
  }
  const ts = isoBogota(at);
  const inc: Incidencia = {
    id: `inc-${randomBytes(4).toString('hex')}`,
    tipo: b.tipo,
    descripcion: b.descripcion,
    lugar: b.lugar ?? null,
    visita_id: visita?.id ?? null,
    reportada_por: quien,
    estado: 'ABIERTA',
    creada_at: ts,
    resuelta_at: null,
  };
  await insertarDoc(store, KV.inc(inc.id), inc.id, inc, [KV.incDia(ts.slice(0, 10))]);
  if (visita && visita.estado !== 'CERRADA') {
    await updateVisita(store, visita.id, (v) =>
      conPaso(v, ts, 'INCIDENCIA', quien, `${b.tipo}: ${b.descripcion.slice(0, 120)}`),
    );
  }
  return inc;
}

const invalida = [
  'incidencia_invalida',
  'Indica el tipo y la descripción (hasta 500 caracteres).',
] as const;

export const incidenciasRoutes: Route[] = [
  {
    method: 'POST',
    path: '/incidencias',
    auth: ['EDECAN', 'CONCIERGE', 'PERSONAL', 'ADMIN', 'SOCIO'],
    handler: async (ctx) => {
      const b = parsear(schema, await readJson(ctx.req), ...invalida);
      return json(201, await crearIncidencia(ctx.store, b, ctx.now, ctx.user!.id, ctx.user));
    },
  },
  {
    method: 'POST',
    path: '/bot/incidencias',
    auth: 'BOT',
    handler: async (ctx) => {
      const b = parsear(schema, await readJson(ctx.req), ...invalida);
      return json(
        201,
        await crearIncidencia(ctx.store, b, ctx.now, await robotDe(ctx.store, ctx.now)),
      );
    },
  },
  {
    method: 'GET',
    path: '/incidencias',
    auth: ['CONCIERGE', 'ADMIN', 'EDECAN'],
    handler: async (ctx) => {
      const estado = ctx.url.searchParams.get('estado');
      if (estado !== null && !ESTADOS.includes(estado)) {
        throw fail(400, 'estado_invalido', `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
      }
      // ponytail: today's incidents only (day index); add an `abiertas` index to keep old ones.
      const todas = await leerIndices<Incidencia>(
        ctx.store,
        [KV.incDia(bogotaHoy(ctx.now))],
        KV.inc,
      );
      const items = todas
        .filter((i) => estado === null || i.estado === estado)
        .sort((a, b) => b.creada_at.localeCompare(a.creada_at));
      return json(200, { items });
    },
  },
  {
    method: 'POST',
    path: '/incidencias/:id/resolver',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const inc = await update<Incidencia>(ctx.store, KV.inc(ctx.params.id!), (cur) => {
        if (!cur) throw fail(404, 'incidencia_no_encontrada', 'La incidencia no existe.');
        return cur.estado === 'RESUELTA'
          ? cur
          : { ...cur, estado: 'RESUELTA', resuelta_at: isoBogota(ctx.now) };
      });
      return json(200, inc);
    },
  },
];
