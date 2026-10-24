import { z } from 'zod';

import type { Route } from './app';
import type { KeyValueStore } from '../infrastructure/stores/types';
import { fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { update } from './repo';
import type { EstadoRobot, RobotEstado } from './types';

interface Heartbeat {
  robot: string;
  estado: EstadoRobot;
  detalle: string | null;
  ultimo_latido: string;
}
interface PushToken {
  token: string;
  plataforma: 'web' | 'ios' | 'android' | 'expo';
}
export const heartbeatKey = 'club:robot:heartbeat';
const heartbeatSchema = z
  .object({
    robot: z.string().trim().min(1).max(100),
    estado: z.enum(['ok', 'acompanando', 'sin_servicio']),
    detalle: z.string().max(200).optional(),
  })
  .strict();
const pushSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    plataforma: z.enum(['web', 'ios', 'android', 'expo']),
  })
  .strict();

/** Robot status as the apps see it: online when the last heartbeat is at most 45 s old. */
export async function robotEstado(store: KeyValueStore, now: Date): Promise<RobotEstado> {
  const heartbeat = (await store.get<Heartbeat>(heartbeatKey))?.value;
  return {
    en_linea: heartbeat ? now.getTime() - Date.parse(heartbeat.ultimo_latido) <= 45_000 : false,
    ultimo_latido: heartbeat?.ultimo_latido ?? null,
    robot: heartbeat?.robot ?? null,
    estado: heartbeat?.estado ?? null,
    detalle: heartbeat?.detalle ?? null,
  };
}

export const robotRoutes: Route[] = [
  {
    method: 'POST',
    path: '/bot/heartbeat',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = heartbeatSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success) throw fail(422, 'latido_invalido', 'Revisa los datos del latido.');
      const value = await update<Heartbeat>(ctx.store, heartbeatKey, () => ({
        ...parsed.data,
        detalle: parsed.data.detalle ?? null,
        ultimo_latido: isoBogota(ctx.now),
      }));
      return json(200, value);
    },
  },
  {
    method: 'GET',
    path: '/robot/estado',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => json(200, await robotEstado(ctx.store, ctx.now)),
  },
  {
    method: 'POST',
    path: '/me/push-token',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN', 'PERSONAL'],
    handler: async (ctx) => {
      const parsed = pushSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success)
        throw fail(422, 'push_token_invalido', 'Revisa el token y la plataforma.');
      await update<PushToken[]>(ctx.store, `club:push:${ctx.user!.id}`, (current) =>
        [...(current ?? []).filter((p) => p.token !== parsed.data.token), parsed.data].slice(-5),
      );
      return json(200, { ok: true });
    },
  },
];
