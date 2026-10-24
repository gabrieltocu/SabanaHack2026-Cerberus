// Public membership page: levels, and requests from people without an account (rate limited by IP).
import type { KeyValueStore } from '../infrastructure/stores/types';
import type { Route } from './app';
import { texto, textoOpc } from './actividades';
import { fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { agregarAIndice, idHex, K, leerIndice, update } from './repo';
import { LIMITE_ACTIVAS } from './seed';
import type { SolicitudMembresia } from './types';

const INTERESES: SolicitudMembresia['interes'][] = ['individual', 'familiar', 'empresarial'];
const ESTADOS: SolicitudMembresia['estado'][] = ['NUEVA', 'CONTACTADA'];
const POR_HORA = 5;

const NIVELES = [
  {
    nivel: 'VIP',
    beneficios: [
      'Lounge VIP y reserva prioritaria en el restaurante',
      'Atención personalizada de concierge y robot de recepción',
      'Hasta 10 invitados activos a la vez',
    ],
    invitados_activos: LIMITE_ACTIVAS.VIP,
  },
  {
    nivel: 'Regular',
    beneficios: [
      'Acceso a canchas, piscina y restaurante',
      'Actividades y eventos del club para toda la familia',
      'Hasta 3 invitados activos a la vez',
    ],
    invitados_activos: LIMITE_ACTIVAS.REGULAR,
  },
];

export async function guardarSolicitud(
  store: KeyValueStore,
  datos: Omit<SolicitudMembresia, 'id'>,
): Promise<SolicitudMembresia> {
  for (;;) {
    const s: SolicitudMembresia = { ...datos, id: idHex('sol-') };
    if ((await store.compareAndSet(K.sol(s.id), 0, s)) !== null) {
      await agregarAIndice(store, K.solIds, s.id);
      return s;
    }
  }
}

export const membresiaRoutes: Route[] = [
  {
    method: 'GET',
    path: '/membresia/info',
    auth: 'PUBLIC',
    handler: async () => json(200, { niveles: NIVELES }),
  },
  {
    method: 'POST',
    path: '/membresia/solicitudes',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const ip = ctx.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida';
      if ((await ctx.store.increment(`club:memb-ip:${ip}`, 3600)) > POR_HORA) {
        throw fail(429, 'demasiadas_solicitudes', 'Demasiadas solicitudes. Intenta más tarde.');
      }
      const b = await readJson(ctx.req);
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw fail(400, 'email_invalido', 'Escribe un correo válido.');
      }
      if (!INTERESES.includes(b.interes as SolicitudMembresia['interes'])) {
        throw fail(400, 'interes_invalido', `El interés debe ser: ${INTERESES.join(', ')}.`);
      }
      const s = await guardarSolicitud(ctx.store, {
        nombre: texto(b.nombre, 'nombre', 80),
        email,
        telefono: textoOpc(b.telefono, 'telefono', 30),
        interes: b.interes as SolicitudMembresia['interes'],
        mensaje: textoOpc(b.mensaje, 'mensaje', 500),
        estado: 'NUEVA',
        creada_at: isoBogota(ctx.now),
      });
      return json(201, s);
    },
  },
  {
    method: 'GET',
    path: '/membresia/solicitudes',
    auth: ['ADMIN'],
    handler: async (ctx) => {
      const items = await leerIndice<SolicitudMembresia>(ctx.store, K.solIds, K.sol);
      return json(200, { items: items.reverse() });
    },
  },
  {
    method: 'PATCH',
    path: '/membresia/solicitudes/:id',
    auth: ['ADMIN'],
    handler: async (ctx) => {
      const { estado } = await readJson(ctx.req);
      if (!ESTADOS.includes(estado as SolicitudMembresia['estado'])) {
        throw fail(400, 'estado_invalido', `El estado debe ser: ${ESTADOS.join(', ')}.`);
      }
      if (!(await ctx.store.get(K.sol(ctx.params.id!)))) {
        throw fail(404, 'solicitud_no_encontrada', 'La solicitud no existe.');
      }
      const s = await update<SolicitudMembresia>(ctx.store, K.sol(ctx.params.id!), (cur) => ({
        ...cur!,
        estado: estado as SolicitudMembresia['estado'],
      }));
      return json(200, s);
    },
  },
];
