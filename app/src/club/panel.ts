// Metrics of one day for the web panel (GET /panel/resumen): a handful of store reads, no N+1.
import type { Route } from './app';
import { listEventos } from './eventos';
import { fail, json } from './http';
import { bogotaHoy, esFecha, estadoDe } from './invitaciones';
import { isoBogota } from './qr';
import { listInvitaciones } from './repo';
import { robotEstado } from './robot';
import type { PanelResumen } from './types';

type Categoria = keyof PanelResumen['por_categoria'];
const FAMILIA = {
  VIP: 'socios',
  REGULAR: 'socios',
  INVITADO: 'invitados',
  PERSONAL: 'personal',
  EXTERNO: 'personal',
} as const;
const HORAS = Array.from({ length: 17 }, (_, i) => i + 6);
const diaBogota = (ts: string) => isoBogota(new Date(ts)).slice(0, 10);

export const panelRoutes: Route[] = [
  {
    method: 'GET',
    path: '/panel/resumen',
    auth: ['ADMIN', 'CONCIERGE'],
    handler: async (ctx) => {
      const fecha = ctx.url.searchParams.get('fecha') ?? bogotaHoy(ctx.now);
      if (!esFecha(fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      const [eventos, invitaciones, robot] = await Promise.all([
        listEventos(ctx.store),
        listInvitaciones(ctx.store),
        robotEstado(ctx.store, ctx.now),
      ]);
      const dia = eventos.filter((e) => diaBogota(e.ts) === fecha);
      const llegadas = dia.filter((e) => e.tipo === 'LLEGADA');
      const por_categoria = { VIP: 0, REGULAR: 0, INVITADO: 0, PERSONAL: 0, EXTERNO: 0 };
      const flujo_por_hora = HORAS.map((hora) => ({ hora, socios: 0, invitados: 0, personal: 0 }));
      for (const e of llegadas) {
        const cat = e.categoria as Categoria;
        if (!(cat in por_categoria)) continue;
        por_categoria[cat]++;
        const h = Number(isoBogota(new Date(e.ts)).slice(11, 13));
        const fila = flujo_por_hora.find((f) => f.hora === h);
        if (fila) fila[FAMILIA[cat]]++;
      }
      const atendidos = dia.filter((e) => e.atendido_at);
      const resumen: PanelResumen = {
        fecha,
        kpis: {
          visitas_hoy: llegadas.length,
          visitantes_vip: por_categoria.VIP,
          invitaciones_activas: invitaciones.filter(
            (i) => i.fecha === fecha && ['PROGRAMADA', 'LLEGO'].includes(estadoDe(i, ctx.now)),
          ).length,
          alertas_abiertas: dia.filter((e) => e.requiere_atencion && e.estado === 'NUEVO').length,
          atencion_promedio_min: atendidos.length
            ? Math.round(
                (atendidos.reduce(
                  (sum, e) => sum + (Date.parse(e.atendido_at!) - Date.parse(e.ts)) / 60_000,
                  0,
                ) /
                  atendidos.length) *
                  10,
              ) / 10
            : null,
        },
        flujo_por_hora,
        por_categoria,
        robot,
        actividad: dia
          .slice(-10)
          .reverse()
          .map(({ id, ts, tipo, categoria, nombre, destino, estado }) => ({
            id,
            ts,
            tipo,
            categoria,
            nombre,
            destino,
            estado,
          })),
      };
      return json(200, resumen);
    },
  },
];
