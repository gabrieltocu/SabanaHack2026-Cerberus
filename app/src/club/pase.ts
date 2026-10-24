// Guest pass and QR checks. The guest has no account: the signed QR of the invitation is the
// credential (`/pase*`, PUBLIC). Edecanes and the concierge verify a QR with `/qr/verificar`.
import { z } from 'zod';

import { nowS, requireSecret, type ClubCtx, type Route } from './app';
import { listarActividades } from './actividades';
import { crearEvaluacion, evaluacionSchema, parsearEvaluacion } from './evaluaciones';
import { fail, json, readJson } from './http';
import { estadoDe } from './invitaciones';
import { leerQr, type QrLeido } from './qr';
import { listInvitaciones, parsear, texto } from './repo';
import { usuarioPorId } from './seed';
import { crearAyuda } from './tareas';
import type { Invitacion, PaseVista, QrVerificado } from './types';
import { activaDe, ultimaDe } from './visitas';

/** Reads the guest's QR from `?qr=`; 401 `qr_invalido` / `qr_vencido` otherwise. */
async function invitado(ctx: ClubCtx): Promise<{ inv: Invitacion; qr: QrLeido }> {
  const { qr, motivo } = leerQr(
    ctx.url.searchParams.get('qr') ?? '',
    requireSecret(ctx.cfg, 'qrSecret'),
    nowS(ctx),
  );
  if (motivo === 'vencido') throw fail(401, 'qr_vencido', 'Tu pase venció.');
  if (!qr || motivo || qr.tipo !== 'invitado') {
    throw fail(401, 'qr_invalido', 'El pase no es válido.');
  }
  const inv = (await listInvitaciones(ctx.store)).find((i) => i.persona_id === qr.persona_id);
  if (!inv) throw fail(404, 'invitacion_no_encontrada', 'La invitación no existe.');
  return { inv, qr };
}

export const paseRoutes: Route[] = [
  {
    method: 'GET',
    path: '/pase',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const { inv } = await invitado(ctx);
      const anfitrion = usuarioPorId(inv.anfitrion_id);
      const todas = await listarActividades(ctx.store, inv.fecha);
      const pase: PaseVista = {
        invitacion: {
          id: inv.id,
          persona_id: inv.persona_id,
          nombre: inv.nombre,
          apellido: inv.apellido,
          trato: inv.trato,
          fecha: inv.fecha,
          hora_desde: inv.hora_desde,
          hora_hasta: inv.hora_hasta,
          lugar: inv.lugar,
          estado: estadoDe(inv, ctx.now),
          punto_encuentro: inv.punto_encuentro ?? null,
        },
        anfitrion: { nombre: anfitrion?.nombre ?? '', apellido: anfitrion?.apellido ?? '' },
        visita: await activaDe(ctx.store, inv.persona_id),
        actividades: todas,
      };
      return json(200, pase);
    },
  },
  {
    method: 'POST',
    path: '/pase/evaluacion',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const { inv } = await invitado(ctx);
      const b = parsearEvaluacion(evaluacionSchema, await readJson(ctx.req));
      const v = await ultimaDe(ctx.store, inv.persona_id, ctx.now);
      if (!v) throw fail(409, 'sin_visita', 'Aún no hay una visita para evaluar.');
      return json(
        201,
        await crearEvaluacion(ctx.store, ctx.now, { ...b, visita_id: v.id, autor: 'invitado' }),
      );
    },
  },
  {
    method: 'POST',
    path: '/pase/ayuda',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const { inv } = await invitado(ctx);
      const b = parsear(
        z.object({ motivo: texto(280) }),
        await readJson(ctx.req),
        'motivo_invalido',
        'Cuéntanos qué necesitas.',
      );
      const v = await activaDe(ctx.store, inv.persona_id);
      if (!v) throw fail(409, 'sin_visita_activa', 'Aún no hay una visita en curso.');
      return json(201, await crearAyuda(ctx.store, v.id, ctx.now, 'invitado', b.motivo));
    },
  },
  {
    method: 'POST',
    path: '/qr/verificar',
    auth: ['EDECAN', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const { payload } = parsear(
        z.object({ payload: z.string().min(1).max(500) }),
        await readJson(ctx.req),
        'qr_invalido',
        'Envía el contenido del QR.',
      );
      const { qr, motivo } = leerQr(payload, requireSecret(ctx.cfg, 'qrSecret'), nowS(ctx));
      const vacio: QrVerificado = {
        valido: false,
        motivo,
        tipo: null,
        persona_id: null,
        nombre: null,
        invitacion: null,
        visita: null,
      };
      if (!qr) return json(200, vacio);
      const inv = qr.persona_id.startsWith('inv-')
        ? ((await listInvitaciones(ctx.store)).find((i) => i.persona_id === qr.persona_id) ?? null)
        : null;
      const out: QrVerificado = {
        valido: motivo === null,
        motivo,
        tipo: qr.tipo,
        persona_id: qr.persona_id,
        nombre: qr.nombre,
        invitacion: inv && { ...inv, estado: estadoDe(inv, ctx.now) },
        visita: await activaDe(ctx.store, qr.persona_id),
      };
      return json(200, out);
    },
  },
];
