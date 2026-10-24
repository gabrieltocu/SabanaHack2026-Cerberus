// What the robot loads: socios, today's guest list, shifts and work orders (GET /bot/registros).
import type { Route } from './app';
import { fail, json } from './http';
import { bogotaHoy, esFecha, estadoDe } from './invitaciones';
import { isoBogota } from './qr';
import { currentVersion, listInvitaciones } from './repo';
import { isSabanaDataSource, ORDENES, TURNOS, usuarios } from './seed';
import { listServicios, servicioVigente } from './servicios';
import { listPersonasRobot } from './personas';

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** On shift from 30 min before `inicio` until `fin`, club time (Bogotá). */
// ponytail: shifts that cross midnight are not supported; split them into two turnos.
const enTurno = (t: { inicio: string; fin: string }, now: Date) => {
  const ahora = minutos(isoBogota(now).slice(11, 16));
  return ahora >= minutos(t.inicio) - 30 && ahora <= minutos(t.fin);
};

export const registrosRoutes: Route[] = [
  {
    method: 'GET',
    path: '/bot/registros',
    auth: 'BOT',
    handler: async (ctx) => {
      const fecha = ctx.url.searchParams.get('fecha') ?? bogotaHoy(ctx.now);
      if (!esFecha(fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      const servicios = await listServicios(ctx.store, fecha);
      const turnos: Record<string, (typeof TURNOS)[keyof typeof TURNOS]> = isSabanaDataSource()
        ? {}
        : TURNOS;
      const ordenesBase: Record<string, (typeof ORDENES)[keyof typeof ORDENES]> =
        isSabanaDataSource() ? {} : ORDENES;
      const socios = usuarios().filter((u) => u.rol === 'SOCIO' && u.activo && u.persona_id);
      const extras = await listPersonasRobot(ctx.store);
      const agenda = (await listInvitaciones(ctx.store))
        .filter((i) => i.fecha === fecha && ['PROGRAMADA', 'LLEGO'].includes(estadoDe(i, ctx.now)))
        .map((i) => [
          i.persona_id,
          {
            nombre: i.nombre,
            apellido: i.apellido,
            trato: i.trato,
            anfitrion: socios.find((s) => s.id === i.anfitrion_id)?.persona_id ?? null,
            lugar: i.lugar,
            hora: i.hora_desde,
            hora_hasta: i.hora_hasta,
            foto_estado: i.foto_estado,
            consentimiento_at: i.consentimiento_at,
          },
        ]);
      return json(200, {
        version: await currentVersion(ctx.store),
        fecha,
        socios: Object.fromEntries([
          ...socios.map((s) => [
            s.persona_id,
            {
              nombre: s.nombre,
              apellido: s.apellido,
              trato: s.trato,
              nivel: s.nivel,
              accion: s.accion,
              destino: s.destino,
            },
          ]),
          ...extras.map((p) => [p.id, { nombre: p.nombre, apellido: '', nivel: p.categoria }]),
        ]),
        agenda: Object.fromEntries(agenda),
        turnos: Object.fromEntries(
          Object.entries(turnos).map(([id, t]) => [id, { ...t, en_turno: enTurno(t, ctx.now) }]),
        ),
        ordenes: Object.fromEntries([
          ...Object.entries(ordenesBase).map(([id, o]) => [id, { ...o, fecha }]),
          ...servicios
            .filter((o) => ['PROGRAMADA', 'EN_CURSO'].includes(o.estado))
            .map((o) => [
              o.id,
              {
                persona: o.persona,
                nombre: o.nombre,
                apellido: o.apellido,
                trato: o.trato,
                empresa: o.empresa,
                motivo: o.trabajo,
                supervisor: o.responsable,
                area: o.area,
                fecha: o.fecha,
                lugar: 'EXTERNO',
                hora_desde: o.hora_desde,
                hora_hasta: o.hora_hasta,
                estado: o.estado,
                en_horario: servicioVigente(o, ctx.now),
              },
            ]),
        ]),
      });
    },
  },
];
