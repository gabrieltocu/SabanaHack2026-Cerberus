import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { Route } from './app';
import { fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { update } from './repo';

const tipos = [
  'estado',
  'movimiento_solicitado',
  'movimiento_iniciado',
  'movimiento_detenido',
  'movimiento_finalizado',
  'obstaculo',
  'lidar_perdido',
  'fallo',
  'voz',
  'gesto',
  'persona_registrada',
  'qr_generado',
  'caida',
  'contacto',
] as const;
const datosSchema = z
  .object({
    bateria_pct: z.number().min(0).max(100).optional(),
    bateria_v: z.number().min(0).max(100).optional(),
    bateria_c: z.number().min(-50).max(150).optional(),
    fsm: z.number().int().min(0).max(1000).optional(),
    accion: z.number().int().min(0).max(100000).optional(),
    sistema: z.number().int().min(0).max(100000).optional(),
    sistema_txt: z.string().max(120).optional(),
    alertas: z.array(z.number().int()).max(12).optional(),
    velocidad_orden_m_s: z.number().min(-2).max(2).optional(),
    giro_orden_rad_s: z.number().min(-4).max(4).optional(),
    lidar_m: z.number().min(0).max(100).optional(),
    distancia_solicitada_m: z.number().min(0).max(5).optional(),
    distancia_estimada_m: z.number().min(0).max(10).optional(),
    origen_medicion: z
      .string()
      .max(100)
      .refine((value) => !/(?:NCLUB1\||data:image\/)/i.test(value))
      .optional(),
  })
  .strict();
const entradaSchema = z
  .object({
    id: z.string().uuid(),
    robot: z.string().trim().min(1).max(100),
    origen: z.enum(['real', 'simulacion']),
    tipo: z.enum(tipos),
    observado_at: z.iso.datetime({ offset: true }),
    mensaje: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine((value) => !/(?:NCLUB1\||data:image\/)/i.test(value)),
    persona_id: z
      .string()
      .regex(/^[\w.:-]{1,40}$/)
      .optional(),
    datos: datosSchema.optional(),
  })
  .strict();

export type TelemetriaEntrada = z.infer<typeof entradaSchema>;
export type TelemetriaVista = TelemetriaEntrada & { recibido_at: string };
interface Registro {
  estado: TelemetriaVista | null;
  estados_por_robot_origen: Record<string, TelemetriaVista>;
  eventos: TelemetriaVista[];
  ids: { id: string; hash: string }[];
  ultima_operacion?: { id: string; hash: string; duplicada: boolean };
}
const KEY = 'club:robot:telemetria';
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 120_000;
const empty = (): Registro => ({
  estado: null,
  estados_por_robot_origen: {},
  eventos: [],
  ids: [],
});
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

export const telemetriaRoutes: Route[] = [
  {
    method: 'POST',
    path: '/bot/telemetria',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = entradaSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success)
        throw fail(422, 'telemetria_invalida', 'Revisa los datos de telemetría.');
      const entrada = parsed.data;
      if (Date.parse(entrada.observado_at) > ctx.now.getTime() + MAX_CLOCK_SKEW_MS)
        throw fail(422, 'telemetria_futura', 'La fecha observada supera el margen permitido.');
      const hash = createHash('sha256').update(canonical(entrada)).digest('hex');
      const registro = await update<Registro>(ctx.store, KEY, (current) => {
        const state = current ?? empty();
        const seen = state.ids.find((item) => item.id === entrada.id);
        if (seen) {
          if (seen.hash !== hash)
            throw fail(409, 'id_telemetria_reutilizado', 'El id ya corresponde a otro evento.');
          return { ...state, ultima_operacion: { id: entrada.id, hash, duplicada: true } };
        }
        const evento: TelemetriaVista = { ...entrada, recibido_at: isoBogota(ctx.now) };
        const anteriorA24h = ctx.now.getTime() - EVENT_TTL_MS;
        const eventos =
          entrada.tipo === 'estado'
            ? state.eventos.filter((item) => Date.parse(item.recibido_at) > anteriorA24h)
            : [...state.eventos, evento]
                .filter((item) => Date.parse(item.recibido_at) > anteriorA24h)
                .slice(-100);
        const claveEstado = `${entrada.robot}\0${entrada.origen}`;
        let estados_por_robot_origen = state.estados_por_robot_origen;
        if (entrada.tipo === 'estado') {
          const anterior = estados_por_robot_origen[claveEstado];
          if (!anterior || Date.parse(entrada.observado_at) >= Date.parse(anterior.observado_at)) {
            estados_por_robot_origen = { ...estados_por_robot_origen, [claveEstado]: evento };
          }
        }
        if (Object.keys(estados_por_robot_origen).length > 100) {
          estados_por_robot_origen = Object.fromEntries(
            Object.entries(estados_por_robot_origen)
              .sort(([, a], [, b]) => Date.parse(a.recibido_at) - Date.parse(b.recibido_at))
              .slice(-100),
          );
        }
        const aceptado =
          entrada.tipo === 'estado' && estados_por_robot_origen[claveEstado] === evento;
        return {
          estado: aceptado ? evento : state.estado,
          estados_por_robot_origen,
          eventos,
          ids: [...state.ids, { id: entrada.id, hash }].slice(-200),
          ultima_operacion: { id: entrada.id, hash, duplicada: false },
        };
      });
      const duplicate =
        registro.ultima_operacion?.id === entrada.id &&
        registro.ultima_operacion.hash === hash &&
        registro.ultima_operacion.duplicada;
      return json(duplicate ? 200 : 201, { recibido: true, estado: registro.estado });
    },
  },
  {
    method: 'GET',
    path: '/robot/telemetria',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const registro = (await ctx.store.get<Registro>(KEY))?.value ?? empty();
      const estado = registro.estado;
      const anteriorA24h = ctx.now.getTime() - EVENT_TTL_MS;
      return json(200, {
        estado,
        eventos: registro.eventos
          .filter((item) => Date.parse(item.recibido_at) > anteriorA24h)
          .reverse(),
        desactualizada: !estado || ctx.now.getTime() - Date.parse(estado.recibido_at) > 15_000,
      });
    },
  },
];
