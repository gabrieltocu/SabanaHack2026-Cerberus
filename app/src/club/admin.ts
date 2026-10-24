// Administration overview for the web panel: roster, invitation counts, today's services, destinations.
import type { Route } from './app';
import { json } from './http';
import { bogotaHoy, estadoDe } from './invitaciones';
import { listInvitaciones } from './repo';
import { LUGARES, usuarios } from './seed';
import { listServicios } from './servicios';
import type { EstadoInvitacion, RegistrosAdmin } from './types';

export const adminRoutes: Route[] = [
  {
    method: 'GET',
    path: '/admin/registros',
    auth: ['ADMIN'],
    handler: async (ctx) => {
      const [invitaciones, servicios] = await Promise.all([
        listInvitaciones(ctx.store),
        listServicios(ctx.store, bogotaHoy(ctx.now)),
      ]);
      const invitaciones_por_estado: Record<EstadoInvitacion, number> = {
        PROGRAMADA: 0,
        LLEGO: 0,
        SALIO: 0,
        CANCELADA: 0,
        VENCIDA: 0,
      };
      for (const i of invitaciones) invitaciones_por_estado[estadoDe(i, ctx.now)]++;
      const body: RegistrosAdmin = {
        usuarios: usuarios().map(({ clave_hash: _hash, ...u }) => u),
        invitaciones_por_estado,
        servicios,
        destinos: LUGARES,
      };
      return json(200, body);
    },
  },
];
