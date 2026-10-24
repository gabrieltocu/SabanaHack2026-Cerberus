// Club activities: listed by day for every role with a session, managed by staff, joined by socios.
// The robot offers the ones flagged `robot_puede_ofrecer` (GET /bot/actividades).
import { createHash } from 'node:crypto';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { ClubCtx, Route } from './app';
import { fail, json, readJson } from './http';
import { bogotaHoy, esFecha } from './invitaciones';
import {
  agregarAIndice,
  idHex,
  insertarIndexado,
  K,
  leerIndice,
  quitarDeIndice,
  update,
} from './repo';
import { ACTIVIDADES_BASE, isSabanaDataSource } from './seed';
import type { Actividad } from './types';

// --- Validation shared by the v3 operation modules -----------------------------------------

// `esFecha` throws a RangeError on impossible months such as 2026-13-01; the v3 routes answer 400.
export function fechaOk(s: unknown): s is string {
  try {
    return esFecha(s);
  } catch {
    return false;
  }
}

export const esHora = (s: unknown): s is string =>
  typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Required text, trimmed, up to `max` characters and without `|` or line breaks. */
export function texto(v: unknown, campo: string, max: number): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t || t.length > max || /[|\r\n]/.test(t)) {
    throw fail(400, `${campo}_invalido`, `Obligatorio, hasta ${max} caracteres y sin "|".`);
  }
  return t;
}

export const textoOpc = (v: unknown, campo: string, max: number): string | null =>
  v === undefined || v === null || v === '' ? null : texto(v, campo, max);

/** `?fecha=` of a request (today in Bogotá by default). */
export function fechaDe(ctx: ClubCtx): string {
  const fecha = ctx.url.searchParams.get('fecha') ?? bogotaHoy(ctx.now);
  if (!fechaOk(fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
  return fecha;
}

/** Validates `fecha`, `hora_desde` and `hora_hasta` (hasta after desde). */
export function franja(b: Record<string, unknown>) {
  if (!fechaOk(b.fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
  if (!esHora(b.hora_desde) || !esHora(b.hora_hasta)) {
    throw fail(400, 'hora_invalida', 'Las horas deben ser HH:MM.');
  }
  if (b.hora_hasta <= b.hora_desde) {
    throw fail(400, 'horario_invalido', 'La hora final debe ser posterior.');
  }
  return { fecha: b.fecha, hora_desde: b.hora_desde, hora_hasta: b.hora_hasta };
}

// --- Activities -------------------------------------------------------------------------------

const ordenar = (a: Actividad, b: Actividad) =>
  `${a.hora_desde}${a.nombre}`.localeCompare(`${b.hora_desde}${b.nombre}`);

/** Activities of a day; a day nobody has touched yet receives the 4 default ones. */
export async function listarActividades(store: KeyValueStore, fecha: string): Promise<Actividad[]> {
  if ((await store.get(K.actDia(fecha))) === null) {
    if (isSabanaDataSource()) {
      await store.compareAndSet(K.actDia(fecha), 0, []);
      return [];
    }
    // Deterministic ids: two concurrent first readers write the same records.
    const ids = ACTIVIDADES_BASE.map(
      (a) => `act-${createHash('sha1').update(`${fecha}|${a.nombre}`).digest('hex').slice(0, 8)}`,
    );
    for (const [i, a] of ACTIVIDADES_BASE.entries()) {
      await store.compareAndSet<Actividad>(K.act(ids[i]!), 0, {
        ...a,
        id: ids[i]!,
        fecha,
        inscritos: [],
      });
    }
    await store.compareAndSet(K.actDia(fecha), 0, ids);
  }
  return (await leerIndice<Actividad>(store, K.actDia(fecha), K.act)).sort(ordenar);
}

function cupoDe(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw fail(400, 'cupo_invalido', 'El cupo debe ser un entero de 1 o más, o nulo.');
  }
  return v;
}

function validar(b: Record<string, unknown>): Omit<Actividad, 'id' | 'inscritos'> {
  return {
    nombre: texto(b.nombre, 'nombre', 80),
    descripcion: textoOpc(b.descripcion, 'descripcion', 300),
    lugar: texto(b.lugar, 'lugar', 60),
    ...franja(b),
    cupo: cupoDe(b.cupo),
    robot_puede_ofrecer: b.robot_puede_ofrecer === true,
  };
}

async function cargar(ctx: ClubCtx): Promise<Actividad> {
  const a = (await ctx.store.get<Actividad>(K.act(ctx.params.id!)))?.value;
  if (!a) throw fail(404, 'actividad_no_encontrada', 'La actividad no existe.');
  return a;
}

const STAFF = ['PERSONAL', 'ADMIN'] as const;

/** Inscribe or remove the session's socio, with the capacity check inside the CAS. */
const inscripcion = (unirse: boolean) => async (ctx: ClubCtx) => {
  const id = (await cargar(ctx)).id;
  const next = await update<Actividad>(ctx.store, K.act(id), (cur) => {
    if (!cur) throw fail(404, 'actividad_no_encontrada', 'La actividad no existe.');
    const yaEsta = cur.inscritos.includes(ctx.user!.id);
    if (unirse && !yaEsta) {
      if (cur.cupo !== null && cur.inscritos.length >= cur.cupo) {
        throw fail(409, 'cupo_lleno', 'La actividad no tiene cupos disponibles.');
      }
      return { ...cur, inscritos: [...cur.inscritos, ctx.user!.id] };
    }
    return unirse ? cur : { ...cur, inscritos: cur.inscritos.filter((x) => x !== ctx.user!.id) };
  });
  return json(200, next);
};

export const actividadesRoutes: Route[] = [
  {
    method: 'GET',
    path: '/actividades',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN', 'PERSONAL'],
    handler: async (ctx) => json(200, { items: await listarActividades(ctx.store, fechaDe(ctx)) }),
  },
  {
    method: 'POST',
    path: '/actividades',
    auth: [...STAFF],
    handler: async (ctx) => {
      const datos = validar(await readJson(ctx.req));
      for (;;) {
        const act: Actividad = { ...datos, id: idHex('act-'), inscritos: [] };
        if (await insertarIndexado(ctx.store, K.act(act.id), K.actDia(act.fecha), act.id, act)) {
          return json(201, act);
        }
      }
    },
  },
  {
    method: 'PATCH',
    path: '/actividades/:id',
    auth: [...STAFF],
    handler: async (ctx) => {
      const actual = await cargar(ctx);
      const b = await readJson(ctx.req);
      const datos = validar({ ...actual, ...b });
      const next = await update<Actividad>(ctx.store, K.act(actual.id), (cur) => ({
        ...cur!,
        ...datos,
      }));
      if (next.fecha !== actual.fecha) {
        await agregarAIndice(ctx.store, K.actDia(next.fecha), next.id);
        await quitarDeIndice(ctx.store, K.actDia(actual.fecha), next.id);
      }
      return json(200, next);
    },
  },
  {
    method: 'DELETE',
    path: '/actividades/:id',
    auth: [...STAFF],
    handler: async (ctx) => {
      const a = await cargar(ctx);
      await quitarDeIndice(ctx.store, K.actDia(a.fecha), a.id);
      await ctx.store.delete(K.act(a.id));
      return json(200, { ok: true });
    },
  },
  {
    method: 'POST',
    path: '/actividades/:id/inscripcion',
    auth: ['SOCIO'],
    handler: inscripcion(true),
  },
  {
    method: 'DELETE',
    path: '/actividades/:id/inscripcion',
    auth: ['SOCIO'],
    handler: inscripcion(false),
  },
  {
    method: 'GET',
    path: '/bot/actividades',
    auth: 'BOT',
    handler: async (ctx) => {
      const items = (await listarActividades(ctx.store, fechaDe(ctx))).filter(
        (a) => a.robot_puede_ofrecer,
      );
      return json(200, { items });
    },
  },
];
