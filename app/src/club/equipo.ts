// The team on shift (robots from the heartbeat, edecanes by state) and the queue of what waits.
import { z } from 'zod';

import type { Route } from './app';
import { json, readJson } from './http';
import { isoBogota } from './qr';
import { bogotaHoy } from './invitaciones';
import { KV, parsear, texto, update } from './repo';
import { robotEstado } from './robot';
import { usuarios } from './seed';
import { nombreDe, tareasDia } from './tareas';
import type { ColaItem, EstadoEquipo, EstadoRobot, MiembroEquipo, Tarea, Visita } from './types';
import { comoRobot, visitasAbiertas } from './visitas';

const ESTADOS = [
  'DISPONIBLE',
  'ASIGNADO',
  'ACOMPANANDO',
  'REGRESANDO',
  'CARGANDO',
  'FUERA_DE_SERVICIO',
] as const;
const DE_ROBOT: Record<EstadoRobot, EstadoEquipo> = {
  ok: 'DISPONIBLE',
  acompanando: 'ACOMPANANDO',
  sin_servicio: 'CARGANDO',
};
const RANGO = { urgente: 3, alta: 2, normal: 1 } as const;

interface Guardado {
  estado: EstadoEquipo;
  detalle: string | null;
  actualizado_at: string;
}

/** Team members with their state: robots from the last heartbeat, edecanes saved or derived. */
async function equipo(ctx: Parameters<Route['handler']>[0]): Promise<MiembroEquipo[]> {
  const edecanes = usuarios().filter((u) => u.rol === 'EDECAN' && u.activo);
  const [robot, visitas, tareas, guardados] = await Promise.all([
    robotEstado(ctx.store, ctx.now),
    visitasAbiertas(ctx.store),
    tareasDia(ctx.store, bogotaHoy(ctx.now)),
    ctx.store.getMany<Guardado>(edecanes.map((u) => KV.equipo(u.id))),
  ]);
  const robotId = robot.robot ?? 'x2-1';
  const miembros: MiembroEquipo[] = [
    {
      id: robotId,
      tipo: 'ROBOT',
      nombre: comoRobot(robotId).nombre,
      estado: robot.en_linea && robot.estado ? DE_ROBOT[robot.estado] : 'FUERA_DE_SERVICIO',
      visita_id: visitas.find((v) => v.acompanante?.id === robotId)?.id ?? null,
      detalle: robot.detalle,
      actualizado_at: robot.ultimo_latido,
    },
  ];
  edecanes.forEach((u, i) => {
    const g = guardados[i]?.value;
    const activa =
      visitas.find((v) => v.acompanante?.id === u.id)?.id ??
      tareas.find((t) => t.estado === 'ACEPTADA' && t.asignada_a === u.id)?.visita_id ??
      null;
    miembros.push({
      id: u.id,
      tipo: 'HUMANO',
      nombre: nombreDe(u),
      estado:
        activa && g?.estado !== 'FUERA_DE_SERVICIO' ? 'ACOMPANANDO' : (g?.estado ?? 'DISPONIBLE'),
      visita_id: activa,
      detalle: g?.detalle ?? null,
      actualizado_at: g?.actualizado_at ?? null,
    });
  });
  return miembros;
}

const espera = (desde: string, now: Date) =>
  Math.max(0, Math.round((now.getTime() - Date.parse(desde)) / 60_000));

export const equipoRoutes: Route[] = [
  {
    method: 'GET',
    path: '/equipo',
    auth: ['CONCIERGE', 'ADMIN', 'EDECAN'],
    handler: async (ctx) => json(200, { items: await equipo(ctx) }),
  },
  {
    method: 'PATCH',
    path: '/me/estado',
    auth: ['EDECAN'],
    handler: async (ctx) => {
      const b = parsear(
        z.object({ estado: z.enum(ESTADOS), detalle: texto(200).optional() }),
        await readJson(ctx.req),
        'estado_invalido',
        `El estado debe ser uno de: ${ESTADOS.join(', ')}.`,
      );
      await update<Guardado>(ctx.store, KV.equipo(ctx.user!.id), () => ({
        estado: b.estado,
        detalle: b.detalle ?? null,
        actualizado_at: isoBogota(ctx.now),
      }));
      return json(
        200,
        (await equipo(ctx)).find((m) => m.id === ctx.user!.id),
      );
    },
  },
  {
    method: 'GET',
    path: '/cola',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const [visitas, tareas] = await Promise.all([
        visitasAbiertas(ctx.store),
        tareasDia(ctx.store, bogotaHoy(ctx.now)),
      ]);
      const porId = new Map<string, Visita>(visitas.map((v) => [v.id, v]));
      const abiertas = tareas.filter((t) => t.estado === 'ABIERTA');
      const conTarea = new Set(abiertas.map((t) => t.visita_id));
      const deTarea = (t: Tarea): ColaItem => {
        const v = porId.get(t.visita_id);
        return {
          visita_id: t.visita_id,
          tarea_id: t.id,
          nombre: t.nombre_visitante,
          categoria: v?.categoria ?? 'INVITADO',
          prioridad: t.prioridad,
          motivo: t.motivo,
          punto_encuentro: t.punto_encuentro,
          espera_min: espera(t.creada_at, ctx.now),
        };
      };
      const sinAtender: ColaItem[] = visitas
        .filter(
          (v) =>
            (v.estado === 'EN_RECEPCION' || v.estado === 'EN_RELEVO') &&
            !v.acompanante &&
            !conTarea.has(v.id),
        )
        .map((v) => ({
          visita_id: v.id,
          tarea_id: null,
          nombre: v.nombre,
          categoria: v.categoria,
          prioridad: v.categoria === 'VIP' ? 'alta' : 'normal',
          motivo: null,
          punto_encuentro: v.punto_encuentro ?? v.destino,
          espera_min: espera(v.inicio, ctx.now),
        }));
      const items = [...abiertas.map(deTarea), ...sinAtender].sort(
        (a, b) => RANGO[b.prioridad] - RANGO[a.prioridad] || b.espera_min - a.espera_min,
      );
      return json(200, { items });
    },
  },
];
