// Visit context shared by robots and humans: who arrived, who escorts, hand-offs and the trail
// (`recorrido`) of every step. "Llegar al destino cierra el acompañamiento; salir del club cierra
// la visita." Tasks live in tareas.ts; the robot reaches the same functions through /bot/visitas.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { ClubCtx, Route } from './app';
import { fail, json, readJson } from './http';
import { bogotaHoy, esFecha } from './invitaciones';
import { isoBogota } from './qr';
import {
  conPaso,
  getInvitacion,
  getVisita,
  insertarDoc,
  KV,
  leerIndices,
  parsear,
  puedeVer,
  removeId,
  texto,
  update,
  updateInvitacion,
  updateVisita,
} from './repo';
import { robotEstado } from './robot';
import { socioPorPersona, usuarioPorId } from './seed';
import {
  cerrarTareasDe,
  crearAyuda,
  crearTarea,
  nombreDe,
  solicitarRelevo,
  tareasDeVisita,
  updateTarea,
} from './tareas';
import type {
  Acompanante,
  Evaluacion,
  EstadoVisita,
  Evento,
  Incidencia,
  Invitacion,
  Tarea,
  Visita,
} from './types';

const ESTADOS: EstadoVisita[] = [
  'EN_RECEPCION',
  'ACOMPANANDO',
  'EN_RELEVO',
  'EN_DESTINO',
  'CERRADA',
];
const CATEGORIAS = ['VIP', 'REGULAR', 'INVITADO', 'PERSONAL', 'EXTERNO'] as const;
const ROBOT_POR_DEFECTO = 'x2-1';

export const robotDe = async (store: KeyValueStore, now: Date) =>
  (await robotEstado(store, now)).robot ?? ROBOT_POR_DEFECTO;
export const comoRobot = (id: string): Acompanante => ({
  tipo: 'ROBOT',
  id,
  nombre: `Robot ${id}`,
});
const esRobotId = (id: string, actual: string) => id === actual || /^x2-\d+$/.test(id);

export type NuevaVisita = Pick<Visita, 'nombre' | 'categoria' | 'destino'> &
  Partial<
    Pick<
      Visita,
      | 'persona_id'
      | 'invitacion_id'
      | 'anfitrion_id'
      | 'punto_encuentro'
      | 'asistencia'
      | 'preferencias_bebida'
      | 'acompanante'
    >
  >;

/** Opens a visit: indexed by its start day and in `abiertas` until it closes. */
export async function abrirVisita(
  store: KeyValueStore,
  n: NuevaVisita,
  at: Date,
  actor: string,
  detalle: string | null,
): Promise<Visita> {
  const ts = isoBogota(at);
  const v: Visita = {
    persona_id: null,
    invitacion_id: null,
    anfitrion_id: null,
    punto_encuentro: null,
    asistencia: [],
    preferencias_bebida: [],
    acompanante: null,
    ...n,
    id: `vis-${randomBytes(4).toString('hex')}`,
    actividad_id: null,
    ubicacion_anfitrion: null,
    permisos: [],
    estado: n.acompanante ? 'ACOMPANANDO' : 'EN_RECEPCION',
    inicio: ts,
    fin: null,
    cierre: null,
    recorrido: [{ ts, tipo: 'LLEGADA', actor, detalle }],
  };
  await insertarDoc(store, KV.vis(v.id), v.id, v, [KV.visDia(ts.slice(0, 10)), KV.visAbiertas]);
  return v;
}

export async function visitasAbiertas(store: KeyValueStore) {
  const todas = await leerIndices<Visita>(store, [KV.visAbiertas], KV.vis);
  return todas.filter((v) => v.estado !== 'CERRADA');
}
export const visitasDia = (store: KeyValueStore, fecha: string) =>
  leerIndices<Visita>(store, [KV.visDia(fecha)], KV.vis);

export async function activaDe(store: KeyValueStore, personaId: string) {
  return (await visitasAbiertas(store)).find((v) => v.persona_id === personaId) ?? null;
}

/** The open visit of a person, or else today's latest one (a guest may rate after leaving). */
export async function ultimaDe(store: KeyValueStore, personaId: string, now: Date) {
  const activa = await activaDe(store, personaId);
  if (activa) return activa;
  const hoy = await visitasDia(store, bogotaHoy(now));
  return (
    hoy
      .filter((v) => v.persona_id === personaId)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null
  );
}

/** The acompañamiento ends when the destination is reached; the visit stays open until SALIDA. */
export async function registrarLlegada(
  store: KeyValueStore,
  id: string,
  at: Date,
  actor: string,
  detalle: string | null = null,
) {
  const ts = isoBogota(at);
  const v = await updateVisita(store, id, (cur) => {
    if (cur.estado !== 'ACOMPANANDO' && cur.estado !== 'EN_RELEVO') {
      throw fail(409, 'transicion_invalida', 'La visita no está en acompañamiento.');
    }
    return conPaso(
      { ...cur, acompanante: null, estado: 'EN_DESTINO' },
      ts,
      'EN_DESTINO',
      actor,
      detalle ?? `Llegó a ${cur.destino}`,
    );
  });
  await cerrarTareasDe(store, v, at, ['ACOMPANAR', 'RELEVO']);
  return v;
}

export async function cerrarVisita(
  store: KeyValueStore,
  id: string,
  at: Date,
  actor: string,
  detalle: string | null = null,
) {
  const ts = isoBogota(at);
  const v = await updateVisita(store, id, (cur) => {
    if (cur.estado === 'CERRADA') throw fail(409, 'visita_cerrada', 'La visita ya está cerrada.');
    return conPaso(
      { ...cur, acompanante: null, estado: 'CERRADA', fin: ts, cierre: 'SALIDA' },
      ts,
      'SALIDA',
      actor,
      detalle,
    );
  });
  await Promise.all([
    removeId(store, KV.visAbiertas, id),
    cerrarTareasDe(store, v, at, ['ACOMPANAR', 'RELEVO', 'AYUDA']),
    v.invitacion_id
      ? updateInvitacion(store, v.invitacion_id, (inv) =>
          inv.estado === 'CANCELADA' ? inv : { ...inv, estado: 'SALIO' },
        ).catch(() => undefined)
      : undefined,
  ]);
  return v;
}

const datosDeInvitacion = (inv: Invitacion, destino?: string | null): NuevaVisita => ({
  nombre: `${inv.nombre} ${inv.apellido}`,
  categoria: 'INVITADO',
  persona_id: inv.persona_id,
  invitacion_id: inv.id,
  anfitrion_id: inv.anfitrion_id,
  destino: destino || inv.lugar,
  punto_encuentro: inv.punto_encuentro ?? null,
  asistencia: inv.asistencia ?? [],
  preferencias_bebida: inv.preferencias_bebida ?? [],
});

/** Robot events: LLEGADA opens (or reuses) the person's visit with the robot as escort; SALIDA closes it. */
export async function visitaDeEvento(store: KeyValueStore, e: Evento, inv?: Invitacion) {
  const at = new Date(e.ts);
  const activa = await activaDe(store, e.persona_id!);
  const robot = await robotDe(store, at);
  if (e.tipo === 'SALIDA') {
    if (activa) await cerrarVisita(store, activa.id, at, robot, e.motivo);
    return;
  }
  if (activa) return;
  const propio = socioPorPersona(e.persona_id!);
  const base: NuevaVisita = inv
    ? datosDeInvitacion(inv, e.destino)
    : {
        nombre: e.nombre ?? e.persona_id!,
        categoria: e.categoria as Visita['categoria'],
        persona_id: e.persona_id,
        anfitrion_id: propio?.id ?? socioPorPersona(e.anfitrion_id ?? '')?.id ?? null,
        destino: e.destino ?? 'Recepción',
      };
  await abrirVisita(
    store,
    { ...base, acompanante: comoRobot(robot) },
    at,
    robot,
    e.motivo ?? `Reconocido por ${robot}`,
  );
}

async function cargar(ctx: ClubCtx): Promise<Visita> {
  const v = await getVisita(ctx.store, ctx.params.id!);
  if (!v) throw fail(404, 'visita_no_encontrada', 'La visita no existe.');
  if (!puedeVer(ctx.user!, v)) throw fail(403, 'visita_ajena', 'No tienes acceso a esta visita.');
  return v;
}

const esAcompanante = (id: string, v: Visita) =>
  v.acompanante?.tipo === 'HUMANO' && v.acompanante.id === id;

/** True when the last handoff step of the visit is this person's confirmed delivery. */
const yaConfirmo = (v: Visita, id: string) => {
  const ultimo = [...v.recorrido]
    .reverse()
    .find((p) => ['ASIGNADO', 'RELEVO_ACEPTADO', 'ENTREGA_CONFIRMADA'].includes(p.tipo));
  return ultimo?.tipo === 'ENTREGA_CONFIRMADA' && ultimo.actor === id;
};

const lugar = texto(60);
const crearSchema = z.object({
  invitacion_id: z.string().min(1).max(60).optional(),
  nombre: texto(80).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  destino: lugar.optional(),
  persona_id: texto(60).optional(),
});
const motivo = z.object({ motivo: texto(280) });
const botEstado = z.object({
  estado: z.enum(['ACOMPANANDO', 'EN_DESTINO']),
  destino: lugar.optional(),
  detalle: texto(200).optional(),
});

function edecanActivo(id: string) {
  const u = usuarioPorId(id);
  if (u?.rol !== 'EDECAN' || !u.activo) {
    throw fail(404, 'acompanante_no_encontrado', 'No existe ese acompañante.');
  }
  return u;
}

async function botVisita(ctx: ClubCtx) {
  const v = await getVisita(ctx.store, ctx.params.id!);
  if (!v) throw fail(404, 'visita_no_encontrada', 'La visita no existe.');
  return v;
}

export const visitasRoutes: Route[] = [
  {
    method: 'GET',
    path: '/visitas',
    auth: ['SOCIO', 'EDECAN', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const fecha = ctx.url.searchParams.get('fecha');
      const estado = ctx.url.searchParams.get('estado');
      if (fecha !== null && !esFecha(fecha)) {
        throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      }
      if (estado !== null && !ESTADOS.includes(estado as EstadoVisita)) {
        throw fail(400, 'estado_invalido', `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
      }
      const fuente = await leerIndices<Visita>(
        ctx.store,
        fecha ? [KV.visDia(fecha)] : [KV.visDia(bogotaHoy(ctx.now)), KV.visAbiertas],
        KV.vis,
      );
      const items = fuente
        .filter((v) => puedeVer(ctx.user!, v) && (estado === null || v.estado === estado))
        .sort((a, b) => b.inicio.localeCompare(a.inicio));
      return json(200, { items });
    },
  },
  {
    method: 'GET',
    path: '/visitas/:id',
    auth: ['SOCIO', 'EDECAN', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => json(200, await cargar(ctx)),
  },
  {
    method: 'POST',
    path: '/visitas',
    auth: ['CONCIERGE', 'EDECAN', 'ADMIN'],
    handler: async (ctx) => {
      const b = parsear(
        crearSchema,
        await readJson(ctx.req),
        'visita_invalida',
        'Indica la invitación, o nombre y destino.',
      );
      let inv: Invitacion | null = null;
      let datos: NuevaVisita;
      if (b.invitacion_id) {
        inv = await getInvitacion(ctx.store, b.invitacion_id);
        if (!inv) throw fail(404, 'invitacion_no_encontrada', 'La invitación no existe.');
        if (inv.estado === 'CANCELADA') {
          throw fail(409, 'invitacion_cancelada', 'La invitación fue cancelada.');
        }
        datos = datosDeInvitacion(inv);
      } else {
        if (!b.nombre || !b.destino) {
          throw fail(422, 'visita_invalida', 'Indica la invitación, o nombre y destino.');
        }
        const socio = b.persona_id ? socioPorPersona(b.persona_id) : undefined;
        datos = {
          nombre: b.nombre,
          categoria: b.categoria ?? 'EXTERNO',
          destino: b.destino,
          persona_id: b.persona_id ?? null,
          anfitrion_id: socio?.id ?? null,
        };
      }
      if (datos.persona_id && (await activaDe(ctx.store, datos.persona_id))) {
        throw fail(409, 'visita_activa', 'Esta persona ya tiene una visita en curso.');
      }
      const v = await abrirVisita(
        ctx.store,
        datos,
        ctx.now,
        ctx.user!.id,
        'Registrada en recepción',
      );
      if (inv) {
        await updateInvitacion(ctx.store, inv.id, (cur) =>
          cur.estado === 'PROGRAMADA' ? { ...cur, estado: 'LLEGO' } : cur,
        );
      }
      return json(201, v);
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/asignar',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const { acompanante_id: quien } = parsear(
        z.object({ acompanante_id: texto(60) }),
        await readJson(ctx.req),
        'acompanante_invalido',
        'Indica el acompañante.',
      );
      const v0 = await cargar(ctx);
      const robot = await robotDe(ctx.store, ctx.now);
      const esRobot = esRobotId(quien, robot);
      const humano = esRobot ? null : edecanActivo(quien);
      const ts = isoBogota(ctx.now);
      const actor = ctx.user!.id;
      const check = (v: Visita) => {
        if (v.estado !== 'EN_RECEPCION' && v.estado !== 'EN_RELEVO') {
          throw fail(409, 'transicion_invalida', 'La visita ya tiene acompañamiento.');
        }
      };
      check(v0);
      if (esRobot) {
        const v = await updateVisita(ctx.store, v0.id, (cur) => {
          check(cur);
          return conPaso(
            { ...cur, estado: 'ACOMPANANDO', acompanante: comoRobot(quien) },
            ts,
            'ASIGNADO',
            actor,
            `Acompaña Robot ${quien}`,
          );
        });
        await cerrarTareasDe(ctx.store, v, ctx.now, ['ACOMPANAR', 'RELEVO']);
        await crearTarea(ctx.store, v, ctx.now, {
          tipo: 'ACOMPANAR',
          asignada_a: quien,
          estado: 'ACEPTADA',
        });
        return json(200, v);
      }
      const abierta = (await tareasDeVisita(ctx.store, v0, ctx.now)).find(
        (t) => t.estado === 'ABIERTA' && t.tipo !== 'AYUDA',
      );
      if (abierta) {
        await updateTarea(ctx.store, abierta.id, (t) => ({ ...t, asignada_a: quien }));
      } else {
        await crearTarea(ctx.store, v0, ctx.now, { tipo: 'ACOMPANAR', asignada_a: quien });
      }
      const v = await updateVisita(ctx.store, v0.id, (cur) => {
        check(cur);
        return conPaso(cur, ts, 'ASIGNADO', actor, `Asignada a ${nombreDe(humano!)}`);
      });
      return json(200, v);
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/ayuda',
    auth: ['SOCIO', 'EDECAN', 'CONCIERGE'],
    handler: async (ctx) => {
      const b = parsear(
        motivo,
        await readJson(ctx.req),
        'motivo_invalido',
        'Cuéntanos qué necesitas.',
      );
      const v = await cargar(ctx);
      return json(201, await crearAyuda(ctx.store, v.id, ctx.now, ctx.user!.id, b.motivo));
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/relevo',
    auth: ['EDECAN', 'CONCIERGE'],
    handler: async (ctx) => {
      const b = parsear(
        z.object({ motivo: texto(280), a: texto(60).optional() }),
        await readJson(ctx.req),
        'motivo_invalido',
        'Indica el motivo del relevo.',
      );
      const v = await cargar(ctx);
      if (ctx.user!.rol === 'EDECAN' && !esAcompanante(ctx.user!.id, v)) {
        throw fail(403, 'no_eres_acompanante', 'Solo quien acompaña puede pedir el relevo.');
      }
      if (b.a) edecanActivo(b.a);
      const t = await solicitarRelevo(
        ctx.store,
        v.id,
        ctx.now,
        ctx.user!.id,
        b.motivo,
        b.a ?? null,
      );
      return json(201, t);
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/recibir',
    auth: ['EDECAN'],
    handler: async (ctx) => {
      const u = ctx.user!;
      const v0 = await cargar(ctx);
      if (yaConfirmo(v0, u.id)) {
        throw fail(409, 'entrega_ya_confirmada', 'Ya confirmaste esta entrega.');
      }
      const tareas = await tareasDeVisita(ctx.store, v0, ctx.now);
      const mia = tareas.find(
        (t) => t.estado === 'ACEPTADA' && t.asignada_a === u.id && t.tipo !== 'AYUDA',
      );
      if (!mia) throw fail(403, 'tarea_no_aceptada', 'Primero acepta la tarea de esta visita.');
      const ts = isoBogota(ctx.now);
      const nombre = nombreDe(u);
      const v = await updateVisita(ctx.store, v0.id, (cur) => {
        if (cur.estado === 'CERRADA' || cur.estado === 'EN_DESTINO') {
          throw fail(409, 'transicion_invalida', 'La visita ya no está en acompañamiento.');
        }
        if (yaConfirmo(cur, u.id)) {
          throw fail(409, 'entrega_ya_confirmada', 'Ya confirmaste esta entrega.');
        }
        return conPaso(
          {
            ...cur,
            estado: 'ACOMPANANDO',
            acompanante: { tipo: 'HUMANO', id: u.id, nombre },
          },
          ts,
          'ENTREGA_CONFIRMADA',
          u.id,
          `Entregó ${v0.acompanante?.nombre ?? 'recepción'}; recibió ${nombre}`,
        );
      });
      // The handoff is done: the relevo task and the previous escort's tasks end here.
      await cerrarTareasDe(
        ctx.store,
        v,
        ctx.now,
        ['ACOMPANAR', 'RELEVO'],
        (t) => t.asignada_a === u.id && t.tipo === 'ACOMPANAR',
      );
      return json(200, v);
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/llegada',
    auth: ['EDECAN', 'CONCIERGE'],
    handler: async (ctx) => {
      const v = await cargar(ctx);
      if (ctx.user!.rol === 'EDECAN' && !esAcompanante(ctx.user!.id, v)) {
        throw fail(403, 'no_eres_acompanante', 'Solo quien acompaña confirma la llegada.');
      }
      return json(200, await registrarLlegada(ctx.store, v.id, ctx.now, ctx.user!.id));
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/salida',
    auth: ['EDECAN', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const v = await cargar(ctx);
      return json(200, await cerrarVisita(ctx.store, v.id, ctx.now, ctx.user!.id));
    },
  },
  {
    method: 'PATCH',
    path: '/visitas/:id/encuentro',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const b = parsear(
        z.object({
          punto_encuentro: texto(120).nullable().optional(),
          ubicacion_anfitrion: texto(120).nullable().optional(),
        }),
        await readJson(ctx.req),
        'encuentro_invalido',
        'Indica el punto de encuentro o tu ubicación (hasta 120 caracteres).',
      );
      if (b.punto_encuentro === undefined && b.ubicacion_anfitrion === undefined) {
        throw fail(422, 'encuentro_invalido', 'Indica el punto de encuentro o tu ubicación.');
      }
      const v0 = await cargar(ctx);
      if (v0.anfitrion_id !== ctx.user!.id) {
        throw fail(403, 'visita_ajena', 'Solo el socio anfitrión comparte el encuentro.');
      }
      const ts = isoBogota(ctx.now);
      const v = await updateVisita(ctx.store, v0.id, (cur) => {
        if (cur.estado === 'CERRADA')
          throw fail(409, 'visita_cerrada', 'La visita ya está cerrada.');
        const next = {
          ...cur,
          punto_encuentro:
            b.punto_encuentro === undefined ? cur.punto_encuentro : b.punto_encuentro,
          ubicacion_anfitrion:
            b.ubicacion_anfitrion === undefined ? cur.ubicacion_anfitrion : b.ubicacion_anfitrion,
        };
        return conPaso(
          next,
          ts,
          'ENCUENTRO',
          ctx.user!.id,
          [next.punto_encuentro, next.ubicacion_anfitrion].filter(Boolean).join(' · ') || null,
        );
      });
      if (b.punto_encuentro) {
        const abiertas = (await tareasDeVisita(ctx.store, v, ctx.now)).filter(
          (t) => t.estado === 'ABIERTA' || t.estado === 'ACEPTADA',
        );
        await Promise.all(
          abiertas.map((t) =>
            updateTarea(ctx.store, t.id, (cur) => ({
              ...cur,
              punto_encuentro: b.punto_encuentro!,
            })),
          ),
        );
      }
      return json(200, v);
    },
  },
];

export const visitasBotRoutes: Route[] = [
  {
    method: 'GET',
    path: '/bot/visitas',
    auth: 'BOT',
    handler: async (ctx) => {
      const activas = ['1', 'true'].includes(ctx.url.searchParams.get('activas') ?? '');
      const items = activas
        ? await visitasAbiertas(ctx.store)
        : await visitasDia(ctx.store, bogotaHoy(ctx.now));
      return json(200, { items });
    },
  },
  {
    method: 'POST',
    path: '/bot/visitas/:id/estado',
    auth: 'BOT',
    handler: async (ctx) => {
      const b = parsear(
        botEstado,
        await readJson(ctx.req),
        'estado_invalido',
        'El estado debe ser ACOMPANANDO o EN_DESTINO.',
      );
      const v0 = await botVisita(ctx);
      const robot = await robotDe(ctx.store, ctx.now);
      if (v0.acompanante && v0.acompanante.tipo !== 'ROBOT') {
        throw fail(409, 'acompanante_distinto', 'La visita la acompaña una persona.');
      }
      if (b.estado === 'EN_DESTINO') {
        return json(
          200,
          await registrarLlegada(ctx.store, v0.id, ctx.now, robot, b.detalle ?? null),
        );
      }
      const ts = isoBogota(ctx.now);
      const v = await updateVisita(ctx.store, v0.id, (cur) => {
        if (cur.estado !== 'EN_RECEPCION' && cur.estado !== 'ACOMPANANDO') {
          throw fail(409, 'transicion_invalida', 'La visita no admite este cambio.');
        }
        const destino = b.destino ?? cur.destino;
        if (cur.estado === 'ACOMPANANDO') return { ...cur, destino };
        return conPaso(
          { ...cur, destino, estado: 'ACOMPANANDO', acompanante: comoRobot(robot) },
          ts,
          'ASIGNADO',
          robot,
          b.detalle ?? `Acompaña Robot ${robot}`,
        );
      });
      return json(200, v);
    },
  },
  {
    method: 'POST',
    path: '/bot/visitas/:id/relevo',
    auth: 'BOT',
    handler: async (ctx) => {
      const b = parsear(
        motivo,
        await readJson(ctx.req),
        'motivo_invalido',
        'Indica el motivo del relevo.',
      );
      const v = await botVisita(ctx);
      const robot = await robotDe(ctx.store, ctx.now);
      return json(201, await solicitarRelevo(ctx.store, v.id, ctx.now, robot, b.motivo, null));
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Demo data for today (called by /demo/sembrar). Fixed ids: seeding twice overwrites, never duplicates.
// ---------------------------------------------------------------------------------------------
export async function sembrarVisitas(store: KeyValueStore, now: Date) {
  const hoy = bogotaHoy(now);
  // Never before today's midnight, so the day indexes below stay true.
  const desdeMedianoche = Math.floor(
    (now.getTime() - Date.parse(`${hoy}T00:00:00-05:00`)) / 60_000,
  );
  const hace = (min: number) =>
    isoBogota(new Date(now.getTime() - Math.min(min, desdeMedianoche) * 60_000));
  const robot = comoRobot('x2-1');
  const mateo = { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo Gil' } as const;
  type P = [min: number, tipo: Visita['recorrido'][number]['tipo'], actor: string, detalle: string];
  const visita = (
    n: number,
    d: Pick<Visita, 'nombre' | 'categoria' | 'destino' | 'estado'> & Partial<Visita>,
    min: number,
    pasos: P[],
  ): Visita => ({
    id: `vis-5eed00${n.toString(16).padStart(2, '0')}`,
    persona_id: null,
    invitacion_id: null,
    anfitrion_id: null,
    actividad_id: null,
    punto_encuentro: null,
    ubicacion_anfitrion: null,
    permisos: [],
    asistencia: [],
    preferencias_bebida: [],
    acompanante: null,
    fin: null,
    cierre: null,
    ...d,
    inicio: hace(min),
    recorrido: pasos.map(([m, tipo, actor, detalle]) => ({ ts: hace(m), tipo, actor, detalle })),
  });
  const visitas = [
    visita(
      1,
      {
        nombre: 'Sofia Restrepo',
        categoria: 'VIP',
        destino: 'Lounge VIP',
        estado: 'ACOMPANANDO',
        persona_id: 'sofia',
        anfitrion_id: 'u-sofia',
        acompanante: robot,
        preferencias_bebida: ['café sin azúcar'],
      },
      35,
      [
        [35, 'LLEGADA', 'x2-1', 'Reconocida por el robot'],
        [34, 'ASIGNADO', 'x2-1', 'Acompaña Robot x2-1'],
      ],
    ),
    visita(
      2,
      {
        nombre: 'Laura Diaz',
        categoria: 'INVITADO',
        destino: 'Terraza',
        estado: 'EN_RELEVO',
        persona_id: 'inv-5eed0002',
        anfitrion_id: 'u-andres',
        acompanante: robot,
        asistencia: ['movilidad_reducida'],
        punto_encuentro: 'Entrada principal',
      },
      28,
      [
        [28, 'LLEGADA', 'x2-1', 'Invitación de hoy'],
        [27, 'ASIGNADO', 'x2-1', 'Acompaña Robot x2-1'],
        [12, 'RELEVO_SOLICITADO', 'x2-1', 'Escaleras: necesita ayuda de una persona'],
      ],
    ),
    visita(
      3,
      {
        nombre: 'Carlos Pardo',
        categoria: 'INVITADO',
        destino: 'Restaurante',
        estado: 'ACOMPANANDO',
        persona_id: 'inv-5eed0003',
        anfitrion_id: 'u-camila',
        acompanante: mateo,
        preferencias_bebida: ['agua con gas'],
      },
      50,
      [
        [50, 'LLEGADA', 'u-natalia', 'Registrada en recepción'],
        [48, 'ASIGNADO', 'u-natalia', 'Asignada a Mateo Gil'],
        [46, 'ASIGNADO', 'u-mateo', 'Mateo Gil aceptó acompañar'],
        [45, 'ENTREGA_CONFIRMADA', 'u-mateo', 'Entregó recepción; recibió Mateo Gil'],
      ],
    ),
    visita(
      4,
      {
        nombre: 'Andres Mejia',
        categoria: 'REGULAR',
        destino: 'Sala de anfitriones',
        estado: 'EN_DESTINO',
        persona_id: 'andres',
        anfitrion_id: 'u-andres',
        ubicacion_anfitrion: 'Terraza, mesa 4',
      },
      90,
      [
        [90, 'LLEGADA', 'x2-1', 'Reconocido por el robot'],
        [89, 'ASIGNADO', 'x2-1', 'Acompaña Robot x2-1'],
        [84, 'EN_DESTINO', 'x2-1', 'Llegó a Sala de anfitriones'],
        [80, 'ENCUENTRO', 'u-andres', 'Terraza, mesa 4'],
      ],
    ),
    visita(
      5,
      {
        nombre: 'Julian Ospina',
        categoria: 'INVITADO',
        destino: 'Lounge VIP',
        estado: 'EN_RECEPCION',
        persona_id: 'inv-5eed0005',
        anfitrion_id: 'u-sofia',
        punto_encuentro: 'Recepción',
      },
      6,
      [[6, 'LLEGADA', 'u-natalia', 'Registrada en recepción']],
    ),
    visita(
      6,
      {
        nombre: 'Marta Ruiz',
        categoria: 'PERSONAL',
        destino: 'Cocina',
        estado: 'CERRADA',
        persona_id: 'marta',
        fin: hace(20),
        cierre: 'SALIDA',
      },
      180,
      [
        [180, 'LLEGADA', 'x2-1', 'Turno de cocina'],
        [20, 'SALIDA', 'x2-1', 'Fin de turno'],
      ],
    ),
    visita(
      7,
      {
        nombre: 'Valentina Cruz',
        categoria: 'INVITADO',
        destino: 'Terraza',
        estado: 'CERRADA',
        persona_id: 'inv-5eed0007',
        anfitrion_id: 'u-camila',
        fin: hace(55),
        cierre: 'SALIDA',
      },
      140,
      [
        [140, 'LLEGADA', 'x2-1', 'Invitación de hoy'],
        [135, 'EN_DESTINO', 'x2-1', 'Llegó a Terraza'],
        [55, 'SALIDA', 'u-natalia', 'Salió del club'],
      ],
    ),
  ];
  const tarea = (n: number, t: Partial<Tarea>, v: Visita, min: number): Tarea => ({
    id: `tar-5eed000${n}`,
    tipo: 'ACOMPANAR',
    visita_id: v.id,
    nombre_visitante: v.nombre,
    prioridad: 'normal',
    punto_encuentro: v.punto_encuentro ?? v.destino,
    motivo: null,
    asignada_a: null,
    estado: 'ABIERTA',
    creada_at: hace(min),
    aceptada_at: null,
    rechazos: [],
    ...t,
  });
  const tareas = [
    tarea(
      1,
      { tipo: 'RELEVO', prioridad: 'alta', motivo: 'Escaleras: necesita ayuda de una persona' },
      visitas[1]!,
      12,
    ),
    tarea(
      2,
      { tipo: 'ACOMPANAR', asignada_a: 'u-mateo', estado: 'ACEPTADA', aceptada_at: hace(46) },
      visitas[2]!,
      48,
    ),
    tarea(
      3,
      { tipo: 'AYUDA', prioridad: 'urgente', motivo: 'Necesita una silla de ruedas en la entrada' },
      visitas[4]!,
      3,
    ),
  ];
  const incidencias: Incidencia[] = [
    {
      id: 'inc-5eed0001',
      tipo: 'RUTA_BLOQUEADA',
      descripcion: 'Carrito de mantenimiento bloquea el pasillo del restaurante',
      lugar: 'Pasillo del restaurante',
      visita_id: visitas[2]!.id,
      reportada_por: 'x2-1',
      estado: 'ABIERTA',
      creada_at: hace(25),
      resuelta_at: null,
    },
    {
      id: 'inc-5eed0002',
      tipo: 'CONEXION',
      descripcion: 'El robot perdió la red unos segundos cerca de la terraza',
      lugar: 'Terraza',
      visita_id: null,
      reportada_por: 'x2-1',
      estado: 'RESUELTA',
      creada_at: hace(120),
      resuelta_at: hace(100),
    },
  ];
  const ev = (
    n: number,
    robotN: number,
    club: number,
    min: number,
    c: string | null,
    tr: string | null,
  ): Evaluacion => ({
    id: `eva-5eed000${n}`,
    visita_id: visitas[[3, 6, 5, 3, 6][n - 1]!]!.id,
    autor: ['u-andres', 'invitado', 'x2-1', 'u-andres', 'invitado'][n - 1]!,
    robot: robotN,
    club,
    comentario: c,
    transcripcion: tr,
    creada_at: hace(min),
  });
  const evaluaciones = [
    ev(1, 5, 5, 70, 'El robot fue muy amable y rápido guiándome', null),
    ev(2, 4, 5, 50, 'Excelente atención, el club es hermoso', null),
    ev(3, 3, 4, 40, null, 'el robot se demoró en las escaleras pero la atención fue buena'),
    ev(4, 5, 4, 30, 'Amable atención del robot, muy rápido', null),
    ev(5, 2, 3, 15, 'El robot se demoró mucho en el pasillo', null),
  ];
  const guardar = (key: string, doc: unknown) => update(store, key, () => doc);
  await Promise.all([
    ...visitas.map((v) => guardar(KV.vis(v.id), v)),
    ...tareas.map((t) => guardar(KV.tarea(t.id), t)),
    ...incidencias.map((i) => guardar(KV.inc(i.id), i)),
    ...evaluaciones.map((e) => guardar(KV.eva(e.id), e)),
  ]);
  const indexar = (key: string, docs: { id: string }[]) =>
    update<string[]>(store, key, (cur) => [...new Set([...(cur ?? []), ...docs.map((d) => d.id)])]);
  await Promise.all([
    indexar(KV.visDia(hoy), visitas),
    indexar(
      KV.visAbiertas,
      visitas.filter((v) => v.estado !== 'CERRADA'),
    ),
    indexar(KV.tareaDia(hoy), tareas),
    indexar(KV.incDia(hoy), incidencias),
    indexar(KV.evaDia(hoy), evaluaciones),
  ]);
}
