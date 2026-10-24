import { z } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { ClubError, fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { K, listInvitaciones, nextSeq, update, updateInvitacion } from './repo';
import type { Evento, Invitacion } from './types';
import { visitaDeEvento } from './visitas';

export const eventoKey = (seq: number) => `club:evento:${seq}`;
const idKey = (id: string) => `club:evento-id:${id}`;
const categoria = z.enum(['VIP', 'INVITADO', 'REGULAR', 'PERSONAL', 'EXTERNO']);
const nullableText = z.string().max(1000).nullable().optional();
const eventSchema = z
  .object({
    id: z.uuid(),
    ts: z.iso.datetime({ offset: true }),
    tipo: z.enum(['LLEGADA', 'ESCALADO_RECEPCION', 'IMPREVISTO', 'EMERGENCIA', 'SALIDA']),
    categoria: categoria.nullable().optional(),
    persona_id: nullableText,
    nombre: nullableText,
    anfitrion_id: nullableText,
    destino: nullableText,
    avisar: z
      .array(z.enum(['concierge', 'anfitrion', 'supervisor', 'mantenimiento', 'seguridad']))
      .max(5),
    severidad: z.enum(['info', 'atencion', 'urgente']),
    requiere_atencion: z.boolean(),
    motivo: nullableText,
    evidencia: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict()
  .refine((e) => e.tipo !== 'LLEGADA' || e.categoria != null);

export type EventoEntrada = z.infer<typeof eventSchema>;

// Evidence is metadata only, including when nested in arrays or objects.
function hasImage(value: unknown): boolean {
  if (typeof value === 'string')
    return /data:|https?:\/\/|(?:[A-Za-z0-9+/]{256,}={0,2})/i.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /imagen|image|foto|photo|base64|bitmap|thumbnail/i.test(key) || hasImage(child),
  );
}

/** Every event in sequence order: one read of the counter and one `getMany`. */
// ponytail: reads the whole log; keep a per-day index once it holds thousands of events.
export async function listEventos(store: KeyValueStore): Promise<Evento[]> {
  const last = (await store.get<number>(K.seq))?.value ?? 0;
  const rows = await store.getMany<Evento>(
    Array.from({ length: last }, (_, i) => eventoKey(i + 1)),
  );
  return rows.flatMap((r) => (r ? [r.value] : []));
}

/** Stores an already validated event (idempotent by `id`); POST /bot/eventos and the demo seed share it. */
export async function insertarEvento(
  store: KeyValueStore,
  body: EventoEntrada,
): Promise<{ duplicado: true } | { seq: number; id: string }> {
  // Reserve before allocating a sequence; concurrent retries cannot create a second event.
  if ((await store.compareAndSet(idKey(body.id), 0, 0)) === null) return { duplicado: true };
  const seq = await nextSeq(store);
  const event: Evento = {
    ...body,
    seq,
    categoria: body.categoria ?? null,
    persona_id: body.persona_id ?? null,
    nombre: body.nombre ?? null,
    anfitrion_id: body.anfitrion_id ?? null,
    destino: body.destino ?? null,
    motivo: body.motivo ?? null,
    evidencia: body.evidencia ?? null,
    estado: 'NUEVO',
    atendido_por: null,
    atendido_at: null,
    nota: null,
  };
  await update(store, eventoKey(seq), () => event);
  await update(store, idKey(body.id), () => seq);
  const tipoPuerta = body.tipo === 'LLEGADA' || body.tipo === 'SALIDA';
  let inv: Invitacion | undefined;
  if (body.persona_id?.startsWith('inv-') && tipoPuerta) {
    inv = (await listInvitaciones(store)).find((i) => i.persona_id === body.persona_id);
    if (inv)
      await updateInvitacion(store, inv.id, (current) => ({
        ...current,
        estado:
          body.tipo === 'SALIDA'
            ? 'SALIO'
            : current.estado === 'PROGRAMADA'
              ? 'LLEGO'
              : current.estado,
      }));
  }
  // The visit (context shared with the humans) follows the door events of a known person.
  if (body.persona_id && tipoPuerta) await visitaDeEvento(store, event, inv);
  return { seq, id: body.id };
}

async function sequence(ctx: Parameters<Route['handler']>[0]): Promise<number> {
  const seq = (await ctx.store.get<number>(idKey(ctx.params.id!)))?.value;
  if (!seq) throw fail(404, 'evento_no_encontrado', 'El evento no existe.');
  return seq;
}

export const eventosRoutes: Route[] = [
  {
    method: 'POST',
    path: '/bot/eventos',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = eventSchema.safeParse(
        await readJson(ctx.req).catch((error: unknown) => {
          if (error instanceof ClubError && error.status === 413) {
            throw fail(422, 'evento_muy_grande', 'El evento excede el tamaño permitido.');
          }
          throw error;
        }),
      );
      if (!parsed.success) throw fail(422, 'evento_invalido', 'Revisa los datos del evento.');
      const body = parsed.data;
      if (
        Buffer.byteLength(JSON.stringify(body.evidencia ?? null), 'utf8') > 4096 ||
        hasImage(body)
      ) {
        throw fail(
          422,
          'evidencia_invalida',
          'Solo se admite evidencia sin imágenes de hasta 4 KB.',
        );
      }
      const r = await insertarEvento(ctx.store, body);
      return 'duplicado' in r ? json(200, r) : json(201, r);
    },
  },
  {
    method: 'GET',
    path: '/bot/eventos/:id',
    auth: 'BOT',
    handler: async (ctx) => {
      const e = (await ctx.store.get<Evento>(eventoKey(await sequence(ctx))))?.value;
      if (!e) throw fail(404, 'evento_no_encontrado', 'El evento no existe.');
      return json(200, {
        estado: e.estado,
        atendido_por: e.atendido_por,
        atendido_at: e.atendido_at,
      });
    },
  },
  {
    method: 'GET',
    path: '/eventos',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const raw = ctx.url.searchParams.get('despues_de') ?? '0';
      const after = Number(raw);
      const attention = ctx.url.searchParams.get('solo_atencion');
      if (
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(after) ||
        (attention !== null && attention !== 'true' && attention !== 'false')
      ) {
        throw fail(422, 'filtro_invalido', 'Revisa los filtros del feed.');
      }
      const last = (await ctx.store.get<number>(K.seq))?.value ?? 0;
      const end = Math.max(after, Math.min(last, after + 100));
      const rows = await ctx.store.getMany<Evento>(
        Array.from({ length: end - after }, (_, i) => eventoKey(after + i + 1)),
      );
      const items: Evento[] = [];
      let cursor = after;
      for (const row of rows) {
        // A writer may have allocated its seq but not published it yet; retry this seq next poll.
        if (!row) break;
        cursor++;
        const e = row.value;
        if (
          ctx.user!.rol === 'SOCIO' &&
          (e.anfitrion_id !== ctx.user!.persona_id || !e.avisar.includes('anfitrion'))
        )
          continue;
        if (attention === 'true' && !e.requiere_atencion) continue;
        items.push(e);
      }
      return json(200, { items, ultimo_seq: cursor });
    },
  },
  {
    method: 'POST',
    path: '/eventos/:id/atender',
    auth: ['CONCIERGE'],
    handler: async (ctx) => {
      const seq = await sequence(ctx);
      const event = await update<Evento>(ctx.store, eventoKey(seq), (current) => {
        if (!current) throw fail(404, 'evento_no_encontrado', 'El evento no existe.');
        if (current.estado === 'RESUELTO')
          throw fail(409, 'evento_resuelto', 'El evento ya fue resuelto.');
        if (current.estado === 'ATENDIDO') return current;
        return {
          ...current,
          estado: 'ATENDIDO',
          atendido_por: ctx.user!.id,
          atendido_at: isoBogota(ctx.now),
        };
      });
      return json(200, event);
    },
  },
  {
    method: 'POST',
    path: '/eventos/:id/resolver',
    auth: ['CONCIERGE'],
    handler: async (ctx) => {
      const body = z
        .object({ nota: z.string().trim().min(1).max(2000) })
        .strict()
        .safeParse(await readJson(ctx.req));
      if (!body.success) throw fail(422, 'nota_invalida', 'Escribe una nota de resolución.');
      const seq = await sequence(ctx);
      const event = await update<Evento>(ctx.store, eventoKey(seq), (current) => {
        if (!current) throw fail(404, 'evento_no_encontrado', 'El evento no existe.');
        return { ...current, estado: 'RESUELTO', nota: body.data.nota };
      });
      return json(200, event);
    },
  },
];
