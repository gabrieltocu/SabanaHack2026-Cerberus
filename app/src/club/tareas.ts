// Tasks for the team (accompany, hand off, help): created by the visit actions, taken by edecanes.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { fail, json, readJson } from './http';
import { bogotaHoy } from './invitaciones';
import { isoBogota } from './qr';
import {
  conPaso,
  insertarDoc,
  KV,
  leerIndices,
  parsear,
  texto,
  update,
  updateVisita,
} from './repo';
import type { EstadoTarea, Tarea, Usuario, Visita } from './types';

const ESTADOS: EstadoTarea[] = ['ABIERTA', 'ACEPTADA', 'RECHAZADA', 'COMPLETADA', 'CANCELADA'];
const RANGO = { urgente: 3, alta: 2, normal: 1 } as const;
export const nombreDe = (u: Pick<Usuario, 'nombre' | 'apellido'>) => `${u.nombre} ${u.apellido}`;

export async function crearTarea(
  store: KeyValueStore,
  v: Visita,
  at: Date,
  t: Pick<Tarea, 'tipo'> & Partial<Pick<Tarea, 'prioridad' | 'motivo' | 'asignada_a' | 'estado'>>,
): Promise<Tarea> {
  const ts = isoBogota(at);
  const tarea: Tarea = {
    id: `tar-${randomBytes(4).toString('hex')}`,
    tipo: t.tipo,
    visita_id: v.id,
    nombre_visitante: v.nombre,
    prioridad: t.prioridad ?? (v.categoria === 'VIP' ? 'alta' : 'normal'),
    punto_encuentro: v.punto_encuentro ?? v.destino,
    motivo: t.motivo ?? null,
    asignada_a: t.asignada_a ?? null,
    estado: t.estado ?? 'ABIERTA',
    creada_at: ts,
    aceptada_at: t.estado === 'ACEPTADA' ? ts : null,
    rechazos: [],
  };
  await insertarDoc(store, KV.tarea(tarea.id), tarea.id, tarea, [KV.tareaDia(ts.slice(0, 10))]);
  return tarea;
}

export const updateTarea = (store: KeyValueStore, id: string, change: (t: Tarea) => Tarea) =>
  update<Tarea>(store, KV.tarea(id), (cur) => {
    if (!cur) throw fail(404, 'tarea_no_encontrada', 'La tarea no existe.');
    return change(cur);
  });

// ponytail: tasks are listed by creation day (today by default); an open task left from a previous
// day is not listed. Add an `abiertas` index like the visits one if the club works past midnight.
export const tareasDia = (store: KeyValueStore, fecha: string) =>
  leerIndices<Tarea>(store, [KV.tareaDia(fecha)], KV.tarea);

/** Tasks of one visit: those created the day it started or today. */
export async function tareasDeVisita(store: KeyValueStore, v: Visita, now: Date) {
  const dias = new Set([v.inicio.slice(0, 10), bogotaHoy(now)]);
  const todas = await leerIndices<Tarea>(store, [...dias].map(KV.tareaDia), KV.tarea);
  return todas.filter((t) => t.visita_id === v.id);
}

const final = (t: Tarea) => ['COMPLETADA', 'CANCELADA', 'RECHAZADA'].includes(t.estado);

/** Finishes the open tasks of a visit: taken ones are COMPLETADA, never-taken ones CANCELADA. */
export async function cerrarTareasDe(
  store: KeyValueStore,
  v: Visita,
  now: Date,
  tipos: Tarea['tipo'][],
  salvo: (t: Tarea) => boolean = () => false,
) {
  const abiertas = (await tareasDeVisita(store, v, now)).filter(
    (t) => tipos.includes(t.tipo) && !final(t) && !salvo(t),
  );
  await Promise.all(
    abiertas.map((t) =>
      updateTarea(store, t.id, (cur) =>
        final(cur)
          ? cur
          : { ...cur, estado: cur.estado === 'ACEPTADA' ? 'COMPLETADA' : 'CANCELADA' },
      ),
    ),
  );
}

/** Help request: urgent task for anyone on the team; the visit does not change state. */
export async function crearAyuda(
  store: KeyValueStore,
  id: string,
  at: Date,
  actor: string,
  motivo: string,
): Promise<Tarea> {
  const v = await updateVisita(store, id, (cur) => {
    if (cur.estado === 'CERRADA') throw fail(409, 'visita_cerrada', 'La visita ya está cerrada.');
    return conPaso(cur, isoBogota(at), 'AYUDA', actor, motivo);
  });
  return crearTarea(store, v, at, { tipo: 'AYUDA', prioridad: 'urgente', motivo });
}

/** Handoff request: the visit waits in EN_RELEVO (with its companion) until someone takes it. */
export async function solicitarRelevo(
  store: KeyValueStore,
  id: string,
  at: Date,
  actor: string,
  motivo: string,
  a: string | null,
): Promise<Tarea> {
  const v = await updateVisita(store, id, (cur) => {
    if (cur.estado !== 'ACOMPANANDO') {
      throw fail(409, 'transicion_invalida', 'Solo se pide relevo mientras se acompaña.');
    }
    return conPaso(
      { ...cur, estado: 'EN_RELEVO' },
      isoBogota(at),
      'RELEVO_SOLICITADO',
      actor,
      motivo,
    );
  });
  return crearTarea(store, v, at, { tipo: 'RELEVO', prioridad: 'alta', motivo, asignada_a: a });
}

const motivo = z.object({ motivo: texto(280) });

export const tareasRoutes: Route[] = [
  {
    method: 'GET',
    path: '/tareas',
    auth: ['EDECAN', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const estado = ctx.url.searchParams.get('estado');
      if (estado !== null && !ESTADOS.includes(estado as EstadoTarea)) {
        throw fail(400, 'estado_invalido', `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
      }
      const u = ctx.user!;
      const items = (await tareasDia(ctx.store, bogotaHoy(ctx.now)))
        .filter((t) => estado === null || t.estado === estado)
        .filter(
          (t) =>
            u.rol !== 'EDECAN' ||
            t.asignada_a === u.id ||
            (t.estado === 'ABIERTA' && t.asignada_a === null && !t.rechazos.includes(u.id)),
        )
        .sort(
          (a, b) =>
            RANGO[b.prioridad] - RANGO[a.prioridad] || a.creada_at.localeCompare(b.creada_at),
        );
      return json(200, { items });
    },
  },
  {
    method: 'POST',
    path: '/tareas/:id/aceptar',
    auth: ['EDECAN'],
    handler: async (ctx) => {
      const u = ctx.user!;
      const ts = isoBogota(ctx.now);
      let nueva = false;
      const t = await updateTarea(ctx.store, ctx.params.id!, (cur) => {
        nueva = false;
        if (cur.estado === 'ACEPTADA' && cur.asignada_a === u.id) return cur;
        if (cur.estado === 'ACEPTADA') {
          throw fail(409, 'tarea_ya_aceptada', 'Otra persona ya aceptó esta tarea.');
        }
        if (cur.estado !== 'ABIERTA')
          throw fail(409, 'tarea_cerrada', 'La tarea ya no está abierta.');
        if (cur.asignada_a && cur.asignada_a !== u.id) {
          throw fail(409, 'tarea_asignada_a_otro', 'La tarea está asignada a otra persona.');
        }
        nueva = true;
        return { ...cur, estado: 'ACEPTADA', asignada_a: u.id, aceptada_at: ts };
      });
      if (nueva) {
        const nombre = nombreDe(u);
        await updateVisita(ctx.store, t.visita_id, (v) => {
          if (v.estado === 'CERRADA') return v;
          if (t.tipo === 'ACOMPANAR') {
            return conPaso(
              {
                ...v,
                estado: 'ACOMPANANDO',
                acompanante: { tipo: 'HUMANO', id: u.id, nombre },
              },
              ts,
              'ASIGNADO',
              u.id,
              `${nombre} aceptó acompañar`,
            );
          }
          return t.tipo === 'RELEVO'
            ? conPaso(v, ts, 'RELEVO_ACEPTADO', u.id, `${nombre} recibirá la visita`)
            : conPaso(v, ts, 'AYUDA', u.id, `${nombre} atiende la ayuda`);
        });
      }
      return json(200, t);
    },
  },
  {
    method: 'POST',
    path: '/tareas/:id/rechazar',
    auth: ['EDECAN'],
    handler: async (ctx) => {
      const u = ctx.user!;
      // ponytail: the reason is validated but not stored (Tarea has no field for it).
      parsear(motivo, await readJson(ctx.req), 'motivo_invalido', 'Escribe el motivo del rechazo.');
      const t = await updateTarea(ctx.store, ctx.params.id!, (cur) => {
        if (cur.estado !== 'ABIERTA') {
          throw fail(409, 'tarea_no_rechazable', 'Solo se rechazan tareas abiertas.');
        }
        if (cur.asignada_a && cur.asignada_a !== u.id) {
          throw fail(409, 'tarea_asignada_a_otro', 'La tarea está asignada a otra persona.');
        }
        return {
          ...cur,
          asignada_a: null,
          rechazos: cur.rechazos.includes(u.id) ? cur.rechazos : [...cur.rechazos, u.id],
        };
      });
      return json(200, t);
    },
  },
];
