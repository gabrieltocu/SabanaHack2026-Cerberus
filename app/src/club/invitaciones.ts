// Invitations of the socios: create, list, edit, cancel and the QR image. The robot reads them
// through /bot/registros (registros.ts) and the photo flow lives in fotos.ts.
import { randomBytes, randomUUID } from 'node:crypto';

import { requireSecret, type ClubCtx, type Route } from './app';
import { fail, json, readJson } from './http';
import { isoBogota, bogotaExp, qrPayload, qrPng } from './qr';
import {
  deleteDocumento,
  deleteFoto,
  getInvitacion,
  insertInvitacion,
  listInvitaciones,
  updateInvitacion,
} from './repo';
import { LIMITE_ACTIVAS, LUGARES } from './seed';
import type { EstadoInvitacion, Invitacion } from './types';

const ESTADOS: EstadoInvitacion[] = ['PROGRAMADA', 'LLEGO', 'SALIO', 'CANCELADA', 'VENCIDA'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const bogotaHoy = (now: Date) => isoBogota(now).slice(0, 10);

export function esFecha(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    // An impossible month (2026-13-01) is an Invalid Date: reject it instead of throwing.
    !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
  );
}

/**
 * ponytail: VENCIDA is derived, not stored: a PROGRAMADA past its `hora_hasta` reads as VENCIDA.
 * Nothing sweeps the store; add a scheduled job if the club needs the stored state to change.
 */
export const estadoDe = (inv: Invitacion, now: Date): EstadoInvitacion =>
  inv.estado === 'PROGRAMADA' && bogotaExp(inv.fecha, inv.hora_hasta) <= now.getTime() / 1000
    ? 'VENCIDA'
    : inv.estado;

/** What the owner/concierge sees: the invitation with its derived state and signed QR. */
export const vista = (inv: Invitacion, ctx: ClubCtx) => ({
  ...inv,
  // v3 fields: records stored before v3 lack them.
  preferencias_bebida: inv.preferencias_bebida ?? [],
  asistencia: inv.asistencia ?? [],
  punto_encuentro: inv.punto_encuentro ?? null,
  documento_foto: inv.documento_foto ?? 'NINGUNA',
  estado: estadoDe(inv, ctx.now),
  qr_payload: qrPayload(
    'invitado',
    inv.persona_id,
    `${inv.nombre} ${inv.apellido}`,
    bogotaExp(inv.fecha, inv.hora_hasta),
    requireSecret(ctx.cfg, 'qrSecret'),
  ),
});

/** Loads `:id`; a socio may only touch their own invitations (403), the concierge and admin may read all. */
export async function cargar(ctx: ClubCtx): Promise<Invitacion> {
  const inv = await getInvitacion(ctx.store, ctx.params.id!);
  if (!inv) throw fail(404, 'invitacion_no_encontrada', 'La invitación no existe.');
  if (ctx.user!.rol === 'SOCIO' && inv.anfitrion_id !== ctx.user!.id) {
    throw fail(403, 'invitacion_ajena', 'Esta invitación es de otro socio.');
  }
  return inv;
}

export function requireEditable(inv: Invitacion, now: Date) {
  if (estadoDe(inv, now) !== 'PROGRAMADA') {
    throw fail(409, 'invitacion_no_editable', 'La invitación ya no se puede modificar.');
  }
}

const persona = (v: unknown, code: string) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t || t.length > 60 || /[|\r\n]/.test(t)) {
    throw fail(400, code, 'Obligatorio, hasta 60 caracteres y sin el signo "|".');
  }
  return t;
};

/** Validates the part of an invitation the socio can change afterwards. */
function validarAgenda(b: Record<string, unknown>, hoy: string) {
  const { fecha, hora_desde: desde, hora_hasta: hasta } = b;
  if (!esFecha(fecha)) throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
  if (fecha < hoy) throw fail(400, 'fecha_pasada', 'La fecha ya pasó.');
  if (
    typeof desde !== 'string' ||
    typeof hasta !== 'string' ||
    !HORA.test(desde) ||
    !HORA.test(hasta)
  ) {
    throw fail(400, 'hora_invalida', 'Las horas deben ser HH:MM.');
  }
  if (hasta <= desde) throw fail(400, 'horario_invalido', 'La hora final debe ser posterior.');
  const lugar = b.lugar ?? 'INVITADO';
  if (typeof lugar !== 'string' || !LUGARES.includes(lugar)) {
    throw fail(400, 'lugar_invalido', `El lugar debe ser uno de: ${LUGARES.join(', ')}.`);
  }
  const nota = b.nota ?? null;
  if (nota !== null && (typeof nota !== 'string' || nota.length > 280)) {
    throw fail(400, 'nota_invalida', 'La nota debe tener hasta 280 caracteres.');
  }
  return { fecha, hora_desde: desde, hora_hasta: hasta, lugar, nota };
}

/** A list of up to 10 short strings (drink preferences, assistance needs). */
export function listaCorta(v: unknown, code: string): string[] {
  if (
    !Array.isArray(v) ||
    v.length > 10 ||
    !v.every((x) => typeof x === 'string' && x.trim().length >= 1 && x.length <= 40)
  ) {
    throw fail(400, code, 'Debe ser una lista de hasta 10 textos de hasta 40 caracteres.');
  }
  return v.map((x: string) => x.trim());
}

/** Validates the v3 extras; `punto_encuentro` defaults to the place when absent or null. */
function validarExtras(b: Record<string, unknown>, lugar: string) {
  const punto = b.punto_encuentro ?? lugar;
  if (typeof punto !== 'string' || punto.length > 80) {
    throw fail(
      400,
      'punto_encuentro_invalido',
      'El punto de encuentro debe tener hasta 80 caracteres.',
    );
  }
  return {
    preferencias_bebida: listaCorta(b.preferencias_bebida ?? [], 'preferencias_invalidas'),
    asistencia: listaCorta(b.asistencia ?? [], 'asistencia_invalida'),
    punto_encuentro: punto,
  };
}

const activa = (i: Invitacion, now: Date) => ['PROGRAMADA', 'LLEGO'].includes(estadoDe(i, now));

export const invitacionesRoutes: Route[] = [
  {
    method: 'POST',
    path: '/invitaciones',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const u = ctx.user!;
      const b = await readJson(ctx.req);
      const nombre = persona(b.nombre, 'nombre_invalido');
      const apellido = persona(b.apellido, 'apellido_invalido');
      if (b.trato !== 'senor' && b.trato !== 'senora') {
        throw fail(400, 'trato_invalido', 'El trato debe ser "senor" o "senora".');
      }
      const documento = b.documento ?? null;
      if (
        documento !== null &&
        (typeof documento !== 'string' || !/^[\w.-]{1,20}$/.test(documento.trim()))
      ) {
        throw fail(400, 'documento_invalido', 'El documento debe tener hasta 20 caracteres.');
      }
      const agenda = validarAgenda(b, bogotaHoy(ctx.now));
      const extras = validarExtras(b, agenda.lugar);

      const todas = await listInvitaciones(ctx.store);
      const limite = LIMITE_ACTIVAS[u.nivel ?? 'REGULAR'];
      // ponytail: read-then-insert is not atomic; two simultaneous requests could pass the limit by one.
      if (todas.filter((i) => i.anfitrion_id === u.id && activa(i, ctx.now)).length >= limite) {
        throw fail(
          409,
          'limite_invitaciones',
          `Alcanzaste el límite de ${limite} invitaciones activas.`,
        );
      }
      let personaId: string;
      do personaId = `inv-${randomBytes(4).toString('hex')}`;
      while (todas.some((i) => i.persona_id === personaId));

      const inv: Invitacion = {
        id: randomUUID(),
        persona_id: personaId,
        anfitrion_id: u.id,
        nombre,
        apellido,
        trato: b.trato,
        documento: documento === null ? null : (documento as string).trim(),
        ...agenda,
        ...extras,
        estado: 'PROGRAMADA',
        foto_estado: 'NINGUNA',
        foto_motivo: null,
        consentimiento_at: null,
        documento_foto: 'NINGUNA',
        creada_at: isoBogota(ctx.now),
      };
      const out = vista(inv, ctx); // fails with 503 before storing anything if the QR secret is missing
      await insertInvitacion(ctx.store, inv);
      return json(201, out);
    },
  },
  {
    method: 'GET',
    path: '/invitaciones',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const fecha = ctx.url.searchParams.get('fecha');
      const estado = ctx.url.searchParams.get('estado');
      if (fecha !== null && !esFecha(fecha)) {
        throw fail(400, 'fecha_invalida', 'La fecha debe ser AAAA-MM-DD.');
      }
      if (estado !== null && !ESTADOS.includes(estado as EstadoInvitacion)) {
        throw fail(400, 'estado_invalido', `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
      }
      const u = ctx.user!;
      const items = (await listInvitaciones(ctx.store))
        .filter((i) => u.rol !== 'SOCIO' || i.anfitrion_id === u.id)
        .filter((i) => fecha === null || i.fecha === fecha)
        .filter((i) => estado === null || estadoDe(i, ctx.now) === estado)
        .sort((a, b) =>
          `${a.fecha}${a.hora_desde}${a.creada_at}`.localeCompare(
            `${b.fecha}${b.hora_desde}${b.creada_at}`,
          ),
        )
        .map((i) => vista(i, ctx));
      return json(200, { items });
    },
  },
  {
    method: 'GET',
    path: '/invitaciones/:id',
    auth: ['SOCIO', 'CONCIERGE', 'ADMIN'],
    handler: async (ctx) => json(200, vista(await cargar(ctx), ctx)),
  },
  {
    method: 'PATCH',
    path: '/invitaciones/:id',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const inv = await cargar(ctx);
      requireEditable(inv, ctx.now);
      const b = await readJson(ctx.req);
      const pick = (k: keyof Invitacion) => (k in b ? b[k] : inv[k]);
      const agenda = validarAgenda(
        {
          fecha: pick('fecha'),
          hora_desde: pick('hora_desde'),
          hora_hasta: pick('hora_hasta'),
          lugar: pick('lugar'),
          nota: pick('nota'),
        },
        bogotaHoy(ctx.now),
      );
      const extras = validarExtras(
        {
          preferencias_bebida: pick('preferencias_bebida'),
          asistencia: pick('asistencia'),
          punto_encuentro: pick('punto_encuentro'),
        },
        agenda.lugar,
      );
      const next = await updateInvitacion(ctx.store, inv.id, (cur) => {
        requireEditable(cur, ctx.now);
        return { ...cur, ...agenda, ...extras };
      });
      return json(200, vista(next, ctx));
    },
  },
  {
    method: 'DELETE',
    path: '/invitaciones/:id',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const inv = await cargar(ctx);
      if (inv.estado === 'CANCELADA') return json(200, vista(inv, ctx));
      const next = await updateInvitacion(ctx.store, inv.id, (cur) => {
        if (estadoDe(cur, ctx.now) !== 'PROGRAMADA') {
          throw fail(409, 'invitacion_no_cancelable', 'La invitación ya no se puede cancelar.');
        }
        return {
          ...cur,
          estado: 'CANCELADA',
          foto_estado: 'NINGUNA',
          foto_motivo: null,
          consentimiento_at: null,
          documento_foto: 'NINGUNA',
        };
      });
      await deleteFoto(ctx.store, inv.id);
      await deleteDocumento(ctx.store, inv.id);
      return json(200, vista(next, ctx));
    },
  },
  {
    method: 'GET',
    path: '/invitaciones/:id/qr.png',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const { qr_payload } = vista(await cargar(ctx), ctx);
      return new Response(new Uint8Array(await qrPng(qr_payload)), {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    },
  },
];
