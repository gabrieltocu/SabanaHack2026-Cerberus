// Profile of every user with an account (drink preferences, assistance needs) and their own photo.
// The photo is sensitive data like a guest's: consent, AES-256-GCM at rest, the robot enrolls it; it
// is the user's own profile, so it does not expire (only DELETE /me/foto removes it).
import { requireSecret, type Route } from './app';
import { cifrar, leerImagen, servirMiFoto } from './fotos';
import { fail, json, readJson } from './http';
import { listaCorta } from './invitaciones';
import { K, deleteMiFoto, getPerfil, update, updatePerfil } from './repo';

const TODOS = ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN', 'PERSONAL'] as const;

export const perfilRoutes: Route[] = [
  {
    method: 'GET',
    path: '/me/perfil',
    auth: [...TODOS],
    handler: async (ctx) => json(200, await getPerfil(ctx.store, ctx.user!.id)),
  },
  {
    method: 'PATCH',
    path: '/me/perfil',
    auth: [...TODOS],
    handler: async (ctx) => {
      const b = await readJson(ctx.req);
      const cambios: Partial<{
        preferencias_bebida: string[];
        asistencia: string[];
        nota_asistencia: string | null;
      }> = {};
      if ('preferencias_bebida' in b) {
        cambios.preferencias_bebida = listaCorta(b.preferencias_bebida, 'preferencias_invalidas');
      }
      if ('asistencia' in b) cambios.asistencia = listaCorta(b.asistencia, 'asistencia_invalida');
      if ('nota_asistencia' in b) {
        const n = b.nota_asistencia;
        if (n !== null && (typeof n !== 'string' || n.length > 280)) {
          throw fail(400, 'nota_asistencia_invalida', 'La nota debe tener hasta 280 caracteres.');
        }
        cambios.nota_asistencia = n;
      }
      return json(200, await updatePerfil(ctx.store, ctx.user!.id, (p) => ({ ...p, ...cambios })));
    },
  },
  {
    method: 'PUT',
    path: '/me/foto',
    auth: [...TODOS],
    handler: async (ctx) => {
      const photoKey = requireSecret(ctx.cfg, 'photoKey');
      const id = ctx.user!.id;
      const { bytes } = await leerImagen(ctx);
      await update(ctx.store, K.mifoto(id), () => cifrar(bytes, photoKey, id, ctx.now));
      return json(
        200,
        await updatePerfil(ctx.store, id, (p) => ({
          ...p,
          foto_estado: 'PENDIENTE',
          foto_motivo: null,
        })),
      );
    },
  },
  {
    method: 'GET',
    path: '/me/foto',
    auth: [...TODOS],
    handler: async (ctx) => servirMiFoto(ctx, ctx.user!.id),
  },
  {
    method: 'DELETE',
    path: '/me/foto',
    auth: [...TODOS],
    handler: async (ctx) => {
      await deleteMiFoto(ctx.store, ctx.user!.id);
      return json(
        200,
        await updatePerfil(ctx.store, ctx.user!.id, (p) => ({
          ...p,
          foto_estado: 'NINGUNA',
          foto_motivo: null,
        })),
      );
    },
  },
];
