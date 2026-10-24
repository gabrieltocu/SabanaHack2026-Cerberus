// Personal agenda of the staff: own shift, role meetings, services they answer for and reminders.
import type { Route } from './app';
import { esHora, fechaDe, fechaOk, texto, textoOpc } from './actividades';
import { fail, json, readJson } from './http';
import { idHex, K, update } from './repo';
import { REUNIONES, TURNOS } from './seed';
import { listServicios } from './servicios';
import type { ItemAgenda } from './types';

const ROLES = ['PERSONAL', 'EDECAN', 'CONCIERGE'] as const;
const MAX_RECORDATORIOS = 200;
// ponytail: reminders live in one document per user; split them by date if people keep thousands.

export const agendaRoutes: Route[] = [
  {
    method: 'GET',
    path: '/me/agenda',
    auth: [...ROLES],
    handler: async (ctx) => {
      const fecha = fechaDe(ctx);
      const u = ctx.user!;
      const items: ItemAgenda[] = [];
      const turno = u.persona_id ? TURNOS[u.persona_id as keyof typeof TURNOS] : undefined;
      if (turno) {
        items.push({
          id: `turno-${u.persona_id}-${fecha}`,
          tipo: 'TURNO',
          titulo: `Turno de ${turno.area}`,
          lugar: null,
          fecha,
          hora_desde: turno.inicio,
          hora_hasta: turno.fin,
          nota: null,
        });
      }
      const reuniones = REUNIONES[u.rol as (typeof ROLES)[number]] ?? [];
      for (const [i, r] of reuniones.entries()) {
        items.push({
          ...r,
          id: `reu-${u.rol.toLowerCase()}-${i + 1}`,
          tipo: 'REUNION',
          fecha,
          nota: null,
        });
      }
      const nombres = [u.nombre, `${u.nombre} ${u.apellido}`].map((n) => n.toLowerCase());
      for (const o of await listServicios(ctx.store, fecha)) {
        if (o.estado === 'CANCELADA' || !nombres.includes(o.responsable.trim().toLowerCase()))
          continue;
        items.push({
          id: o.id,
          tipo: 'SERVICIO',
          titulo: `${o.trabajo} · ${o.empresa}`,
          lugar: o.punto_presentacion,
          fecha,
          hora_desde: o.hora_desde,
          hora_hasta: o.hora_hasta,
          nota: null,
        });
      }
      const propios = (await ctx.store.get<ItemAgenda[]>(K.agenda(u.id)))?.value ?? [];
      items.push(...propios.filter((r) => r.fecha === fecha));
      items.sort((a, b) => `${a.hora_desde}${a.id}`.localeCompare(`${b.hora_desde}${b.id}`));
      return json(200, { items });
    },
  },
  {
    method: 'POST',
    path: '/me/agenda',
    auth: [...ROLES],
    handler: async (ctx) => {
      const b = await readJson(ctx.req);
      if (!fechaOk(b.fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      if (!esHora(b.hora_desde)) throw fail(400, 'hora_invalida', 'La hora debe ser HH:MM.');
      const item: ItemAgenda = {
        id: idHex('rec-'),
        tipo: 'RECORDATORIO',
        titulo: texto(b.titulo, 'titulo', 80),
        lugar: null,
        fecha: b.fecha,
        hora_desde: b.hora_desde,
        hora_hasta: null,
        nota: textoOpc(b.nota, 'nota', 280),
      };
      await update<ItemAgenda[]>(ctx.store, K.agenda(ctx.user!.id), (cur) => {
        if ((cur ?? []).length >= MAX_RECORDATORIOS) {
          throw fail(409, 'limite_recordatorios', 'Tienes demasiados recordatorios. Borra alguno.');
        }
        return [...(cur ?? []), item];
      });
      return json(201, item);
    },
  },
  {
    method: 'DELETE',
    path: '/me/agenda/:id',
    auth: [...ROLES],
    handler: async (ctx) => {
      const id = ctx.params.id!;
      const propios = (await ctx.store.get<ItemAgenda[]>(K.agenda(ctx.user!.id)))?.value ?? [];
      if (!propios.some((r) => r.id === id)) {
        throw fail(404, 'recordatorio_no_encontrado', 'El recordatorio no existe.');
      }
      await update<ItemAgenda[]>(ctx.store, K.agenda(ctx.user!.id), (cur) =>
        (cur ?? []).filter((r) => r.id !== id),
      );
      return json(200, { ok: true });
    },
  },
];
