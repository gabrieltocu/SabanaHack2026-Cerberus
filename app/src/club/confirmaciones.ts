import { z } from 'zod';

import type { ClubCtx, Route } from './app';
import { fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { update } from './repo';
import type { Confirmacion } from './types';

const key = (id: string) => `club:confirmacion:${id}`;
const schema = z
  .object({
    id: z.uuid(),
    anfitrion_id: z.string().trim().min(1).max(100),
    visitante_desc: z.string().trim().min(1).max(1000),
    evento_id: z.uuid().nullable(),
    vence_en_s: z.number().int().min(5).max(600),
  })
  .strict();

async function getCurrent(ctx: ClubCtx, id: string): Promise<Confirmacion> {
  const c = (await ctx.store.get<Confirmacion>(key(id)))?.value;
  if (!c) throw fail(404, 'confirmacion_no_encontrada', 'La confirmación no existe.');
  if (c.estado !== 'PENDIENTE' || Date.parse(c.vence_at) > ctx.now.getTime()) return c;
  return update<Confirmacion>(ctx.store, key(id), (current) => {
    if (!current) throw fail(404, 'confirmacion_no_encontrada', 'La confirmación no existe.');
    return current.estado === 'PENDIENTE' ? { ...current, estado: 'VENCIDA' } : current;
  });
}

export const confirmacionesRoutes: Route[] = [
  {
    method: 'POST',
    path: '/bot/confirmaciones',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = schema.safeParse(await readJson(ctx.req));
      if (!parsed.success)
        throw fail(422, 'confirmacion_invalida', 'Revisa los datos de la confirmación.');
      const { vence_en_s, ...body } = parsed.data;
      const c: Confirmacion = {
        ...body,
        estado: 'PENDIENTE',
        creada_at: isoBogota(ctx.now),
        vence_at: isoBogota(new Date(ctx.now.getTime() + vence_en_s * 1000)),
        respondida_at: null,
      };
      if ((await ctx.store.compareAndSet(key(c.id), 0, c)) === null)
        return json(200, { duplicado: true });
      return json(201, c);
    },
  },
  {
    method: 'GET',
    path: '/bot/confirmaciones/:id',
    auth: 'BOT',
    handler: async (ctx) => {
      const c = await getCurrent(ctx, ctx.params.id!);
      return json(200, { estado: c.estado, respondida_at: c.respondida_at });
    },
  },
  {
    method: 'GET',
    path: '/confirmaciones/pendientes',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const rows = await ctx.store.list<Confirmacion>('club:confirmacion:');
      const items: Confirmacion[] = [];
      for (const { value: c } of rows) {
        if (c.anfitrion_id !== ctx.user!.persona_id || c.estado !== 'PENDIENTE') continue;
        const current = await getCurrent(ctx, c.id);
        if (current.estado === 'PENDIENTE') items.push(current);
      }
      return json(200, { items });
    },
  },
  {
    method: 'POST',
    path: '/confirmaciones/:id/responder',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const parsed = z
        .object({ aprueba: z.boolean() })
        .strict()
        .safeParse(await readJson(ctx.req));
      if (!parsed.success) throw fail(422, 'respuesta_invalida', 'Indica si apruebas la visita.');
      const c = await getCurrent(ctx, ctx.params.id!);
      if (c.anfitrion_id !== ctx.user!.persona_id)
        throw fail(403, 'confirmacion_ajena', 'Esta confirmación pertenece a otro socio.');
      const result = await update<Confirmacion>(ctx.store, key(c.id), (current) => {
        if (!current) throw fail(404, 'confirmacion_no_encontrada', 'La confirmación no existe.');
        if (current.estado !== 'PENDIENTE' || Date.parse(current.vence_at) <= ctx.now.getTime())
          throw fail(409, 'confirmacion_cerrada', 'La confirmación ya fue respondida o venció.');
        return {
          ...current,
          estado: parsed.data.aprueba ? 'APROBADA' : 'RECHAZADA',
          respondida_at: isoBogota(ctx.now),
        };
      });
      return json(200, result);
    },
  },
];
