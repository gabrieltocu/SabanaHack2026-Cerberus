// Ratings of the robot and the club, from the host, the staff, the guest (pase) or the robot.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { ClubCtx, Route } from './app';
import { fail, json, readJson } from './http';
import { bogotaHoy, esFecha } from './invitaciones';
import { isoBogota } from './qr';
import { getVisita, insertarDoc, KV, leerIndices, parsear, puedeVer, texto } from './repo';
import { robotDe } from './visitas';
import type { Evaluacion, ResumenEvaluaciones } from './types';

const nota = z.number().int().min(1).max(5);
export const evaluacionSchema = z.object({
  robot: nota,
  club: nota,
  comentario: texto(500).optional(),
  transcripcion: texto(1000).optional(),
});
export const parsearEvaluacion = <S extends z.ZodType>(schema: S, data: unknown) =>
  parsear(
    schema,
    data,
    'evaluacion_invalida',
    'Las notas del robot y del club van de 1 a 5.',
  ) as z.infer<S>;

export async function crearEvaluacion(
  store: KeyValueStore,
  at: Date,
  e: Pick<Evaluacion, 'visita_id' | 'autor' | 'robot' | 'club'> &
    Partial<Pick<Evaluacion, 'comentario' | 'transcripcion'>>,
): Promise<Evaluacion> {
  const ts = isoBogota(at);
  const ev: Evaluacion = {
    id: `eva-${randomBytes(4).toString('hex')}`,
    visita_id: e.visita_id,
    autor: e.autor,
    robot: e.robot,
    club: e.club,
    comentario: e.comentario ?? null,
    transcripcion: e.transcripcion ?? null,
    creada_at: ts,
  };
  await insertarDoc(store, KV.eva(ev.id), ev.id, ev, [KV.evaDia(ts.slice(0, 10))]);
  return ev;
}

// ponytail: no stemming or IA; words of 5+ letters minus common Spanish fillers, by frequency.
const STOP = new Set(
  `porque cuando donde estaba estaban están estoy estamos estuvo entre sobre hasta desde nuestro
  nuestra también tambien todo todos todas aunque siempre ahora había habia hacer tiene tienen
  fueron quiero estos estas esos esas mucho mucha muchos muchas pocos pocas otros otras alguna
  algunos algunas ningún mismo misma antes después despues durante contra según segun tanto tanta
  cuenta quien quienes cual cuales sido será serán eran sería además ademas bastante demasiado
  sino solo solamente pues entonces`.split(/\s+/),
);

export function puntosClave(textos: string[], max = 8): string[] {
  const cuenta = new Map<string, number>();
  for (const w of textos
    .join(' ')
    .toLowerCase()
    .match(/\p{L}{5,}/gu) ?? []) {
    if (!STOP.has(w)) cuenta.set(w, (cuenta.get(w) ?? 0) + 1);
  }
  return [...cuenta]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

const promedio = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

export async function resumen(store: KeyValueStore, fecha: string): Promise<ResumenEvaluaciones> {
  const items = (await leerIndices<Evaluacion>(store, [KV.evaDia(fecha)], KV.eva)).sort((a, b) =>
    b.creada_at.localeCompare(a.creada_at),
  );
  return {
    items,
    promedio_robot: promedio(items.map((e) => e.robot)),
    promedio_club: promedio(items.map((e) => e.club)),
    puntos_clave: puntosClave(
      items.flatMap((e) => [e.comentario, e.transcripcion ?? null]).filter((t): t is string => !!t),
    ),
  };
}

async function visitaExistente(ctx: ClubCtx, id: string | undefined) {
  if (!id) return null;
  const v = await getVisita(ctx.store, id);
  if (!v) throw fail(404, 'visita_no_encontrada', 'La visita no existe.');
  return v;
}

export const evaluacionesRoutes: Route[] = [
  {
    method: 'GET',
    path: '/evaluaciones',
    auth: ['ADMIN', 'CONCIERGE'],
    handler: async (ctx) => {
      const fecha = ctx.url.searchParams.get('fecha') ?? bogotaHoy(ctx.now);
      if (!esFecha(fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      return json(200, await resumen(ctx.store, fecha));
    },
  },
  {
    method: 'POST',
    path: '/visitas/:id/evaluacion',
    auth: ['SOCIO', 'EDECAN', 'CONCIERGE'],
    handler: async (ctx) => {
      const b = parsearEvaluacion(evaluacionSchema, await readJson(ctx.req));
      const v = await visitaExistente(ctx, ctx.params.id);
      if (!puedeVer(ctx.user!, v!)) {
        throw fail(403, 'visita_ajena', 'No tienes acceso a esta visita.');
      }
      // ponytail: several ratings per visit are allowed (host, staff, guest); the day's average counts them all.
      return json(
        201,
        await crearEvaluacion(ctx.store, ctx.now, { ...b, visita_id: v!.id, autor: ctx.user!.id }),
      );
    },
  },
  {
    method: 'POST',
    path: '/bot/evaluaciones',
    auth: 'BOT',
    handler: async (ctx) => {
      const b = parsearEvaluacion(
        evaluacionSchema.extend({ visita_id: texto(60).optional() }),
        await readJson(ctx.req),
      );
      const v = await visitaExistente(ctx, b.visita_id);
      const autor = await robotDe(ctx.store, ctx.now);
      const { visita_id: _id, ...nota } = b;
      return json(
        201,
        await crearEvaluacion(ctx.store, ctx.now, { ...nota, visita_id: v?.id ?? null, autor }),
      );
    },
  },
];
