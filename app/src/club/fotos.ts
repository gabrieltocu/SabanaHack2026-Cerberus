// Photos and ID cards (sensitive data, Ley 1581): consent, AES-256-GCM at rest, no public URL (the
// robot gets 60 s signed links). Retention: the robot's answer no longer deletes a guest's photo
// (LISTA keeps it so staff can see who is coming); it, and the ID card, are kept until the visit
// ends (invitation CANCELADA, SALIO or VENCIDA) or 24 h after upload, whichever comes first, and are
// deleted lazily on read (plus a sweep when the robot lists pending photos). RECHAZADA is deleted
// at once. The socio's own profile photo (`club:mifoto:<usuario>`) does not expire.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { nowS, requireSecret, type ClubCtx, type Route } from './app';
import { fail, json, readJson } from './http';
import { cargar, estadoDe, requireEditable, vista } from './invitaciones';
import { isoBogota } from './qr';
import {
  K,
  deleteDocumento,
  deleteFoto,
  deleteMiFoto,
  getInvitacion,
  listInvitaciones,
  update,
  updateInvitacion,
  updatePerfil,
} from './repo';
import { socioPorPersona, usuarioPorId, usuarios } from './seed';
import { listPersonasRobot, personasExternasRobot } from './personas';
import type { Invitacion, Perfil } from './types';

const MAX_BYTES = 600 * 1024; // Upstash free plan caps the request size; the app compresses first
const VIDA_MS = 24 * 3600_000;
const URL_S = 60;
const MOTIVO_VENCIDA = 'La foto venció sin procesarse. Vuelve a subirla.';
const MOTIVO_PERDIDA = 'La foto no se encontró. Vuelve a subirla.';

export interface FotoGuardada {
  iv: string;
  tag: string;
  data: string; // base64 ciphertext
  subida_at: string;
}

// The invitation id is authenticated data, so a record cannot be swapped between invitations.
const aesKey = (photoKey: string) => createHash('sha256').update(photoKey).digest();

export function cifrar(bytes: Buffer, photoKey: string, invId: string, now: Date): FotoGuardada {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(photoKey), iv);
  c.setAAD(Buffer.from(invId));
  const data = Buffer.concat([c.update(bytes), c.final()]);
  return {
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    subida_at: isoBogota(now),
  };
}

export function descifrar(rec: FotoGuardada, photoKey: string, invId: string): Buffer {
  const d = createDecipheriv('aes-256-gcm', aesKey(photoKey), Buffer.from(rec.iv, 'base64'));
  d.setAAD(Buffer.from(invId));
  d.setAuthTag(Buffer.from(rec.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]);
}

/** A guest's image is over when the visit ended (or never will start) or 24 h passed since upload. */
const caducada = (inv: Invitacion, rec: FotoGuardada, now: Date) =>
  now.getTime() - Date.parse(rec.subida_at) > VIDA_MS ||
  inv.estado === 'CANCELADA' ||
  inv.estado === 'SALIO' ||
  estadoDe(inv, now) === 'VENCIDA';

type Tipo = 'foto' | 'doc';
// The ID card has its own AAD so a stored photo cannot be passed off as the card of the same invitation.
const aadDe = (tipo: Tipo, invId: string) => (tipo === 'doc' ? `doc|${invId}` : invId);
const noEncontrada = (tipo: Tipo) =>
  tipo === 'foto'
    ? fail(404, 'foto_no_encontrada', 'La foto no existe o venció.')
    : fail(404, 'documento_no_encontrado', 'La cédula no existe o venció.');

/** Deletes the stored image of an invitation; an ID card also goes back to NINGUNA. */
async function purgar(ctx: ClubCtx, inv: Invitacion, tipo: Tipo) {
  if (tipo === 'foto') return deleteFoto(ctx.store, inv.id);
  await deleteDocumento(ctx.store, inv.id);
  await updateInvitacion(ctx.store, inv.id, (cur) => ({ ...cur, documento_foto: 'NINGUNA' }));
}

const jpegResponse = (bytes: Buffer) =>
  new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

/** Decrypts and serves a guest's photo or ID card; an expired one is deleted and reads as missing. */
async function servirInvitacion(ctx: ClubCtx, inv: Invitacion, tipo: Tipo) {
  const photoKey = requireSecret(ctx.cfg, 'photoKey');
  const key = tipo === 'foto' ? K.foto(inv.id) : K.doc(inv.id);
  const rec = (await ctx.store.get<FotoGuardada>(key))?.value;
  if (!rec || caducada(inv, rec, ctx.now)) {
    if (rec) await purgar(ctx, inv, tipo);
    throw noEncontrada(tipo);
  }
  return jpegResponse(descifrar(rec, photoKey, aadDe(tipo, inv.id)));
}

/** The socio's own photo (never expires); `id` is the usuario id. */
export async function servirMiFoto(ctx: ClubCtx, id: string) {
  const photoKey = requireSecret(ctx.cfg, 'photoKey');
  const rec = (await ctx.store.get<FotoGuardada>(K.mifoto(id)))?.value;
  if (!rec) throw noEncontrada('foto');
  return jpegResponse(descifrar(rec, photoKey, id));
}

/** Photo behind an id the robot knows: an invitation (guest) or a usuario (socio). */
async function servirPorId(ctx: ClubCtx, id: string) {
  const inv = await getInvitacion(ctx.store, id);
  if (inv) return servirInvitacion(ctx, inv, 'foto');
  if (usuarioPorId(id)) return servirMiFoto(ctx, id);
  const socio = socioPorPersona(id);
  if (socio) return servirMiFoto(ctx, socio.id);
  throw noEncontrada('foto');
}

/**
 * Reads and validates a multipart upload: JPEG <= 600 KB in `foto` plus `consentimiento=true`.
 * Returns the bytes and the form so callers can read extra fields.
 */
export async function leerImagen(ctx: ClubCtx) {
  if (!(ctx.req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    throw fail(400, 'multipart_invalido', 'Envía la foto como multipart/form-data.');
  }
  const tooBig = () => fail(413, 'foto_muy_grande', 'La foto supera los 600 KB. Comprímela.');
  if (Number(ctx.req.headers.get('content-length') ?? 0) > MAX_BYTES + 16 * 1024) throw tooBig();
  // React Native's global FormData type lacks `get`; the Node (undici) one has it.
  const form = (await ctx.req.formData().catch(() => {
    throw fail(400, 'multipart_invalido', 'El cuerpo multipart no es válido.');
  })) as unknown as {
    get(name: string): string | { size: number; arrayBuffer(): Promise<ArrayBuffer> } | null;
  };
  if (form.get('consentimiento') !== 'true') {
    throw fail(400, 'consentimiento_requerido', 'Se requiere el consentimiento del titular.');
  }
  const file = form.get('foto');
  if (!file || typeof file === 'string')
    throw fail(400, 'foto_requerida', 'Falta el campo "foto".');
  if (file.size > MAX_BYTES) throw tooBig();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    throw fail(415, 'foto_no_jpeg', 'La foto debe ser un JPEG.');
  }
  return { bytes, form };
}

const firma = (photoKey: string, invId: string, exp: number) =>
  createHmac('sha256', photoKey).update(`foto|${invId}|${exp}`).digest('hex');

/** Public origin of this API as the robot reaches it (behind Vercel or the local proxy). */
function origin(ctx: ClubCtx): string {
  const host = ctx.req.headers.get('x-forwarded-host') ?? ctx.req.headers.get('host');
  if (!host) return ctx.url.origin;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return `${ctx.req.headers.get('x-forwarded-proto') ?? (local ? 'http' : 'https')}://${host}`;
}

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Sweeps images kept past their retention (nobody may read them again once the visit is over). */
async function barrer(ctx: ClubCtx, invs: Invitacion[]) {
  const items = invs.flatMap((inv) => [
    ...(inv.foto_estado === 'LISTA' ? [{ inv, tipo: 'foto' as Tipo, key: K.foto(inv.id) }] : []),
    ...(inv.documento_foto === 'GUARDADA'
      ? [{ inv, tipo: 'doc' as Tipo, key: K.doc(inv.id) }]
      : []),
  ]);
  const recs = await ctx.store.getMany<FotoGuardada>(items.map((x) => x.key));
  for (const [n, { inv, tipo }] of items.entries()) {
    const rec = recs[n]?.value;
    if (rec && caducada(inv, rec, ctx.now)) await purgar(ctx, inv, tipo);
  }
}

const sube =
  (tipo: Tipo): Route['handler'] =>
  async (ctx) => {
    const inv = await cargar(ctx);
    requireEditable(inv, ctx.now);
    const photoKey = requireSecret(ctx.cfg, 'photoKey');
    const { bytes, form } = await leerImagen(ctx);
    const numero = tipo === 'doc' ? form.get('numero') : null;
    if (numero && (typeof numero !== 'string' || !/^\d{5,15}$/.test(numero))) {
      throw fail(400, 'documento_invalido', 'El número debe tener entre 5 y 15 dígitos.');
    }
    const rec = cifrar(bytes, photoKey, aadDe(tipo, inv.id), ctx.now);
    await update(ctx.store, tipo === 'foto' ? K.foto(inv.id) : K.doc(inv.id), () => rec);
    try {
      const next = await updateInvitacion(ctx.store, inv.id, (cur) => {
        requireEditable(cur, ctx.now);
        return tipo === 'foto'
          ? {
              ...cur,
              foto_estado: 'PENDIENTE',
              foto_motivo: null,
              consentimiento_at: isoBogota(ctx.now),
            }
          : { ...cur, documento_foto: 'GUARDADA', ...(numero ? { documento: numero } : {}) };
      });
      return json(200, vista(next, ctx));
    } catch (e) {
      await (tipo === 'foto' ? deleteFoto : deleteDocumento)(ctx.store, inv.id);
      throw e;
    }
  };

const VER = ['SOCIO', 'CONCIERGE', 'ADMIN', 'EDECAN'] as const;

export const fotosRoutes: Route[] = [
  {
    method: 'DELETE',
    path: '/bot/personas/:id/foto',
    auth: 'BOT',
    handler: async (ctx) => {
      const persona = personasExternasRobot().find((p) => p.id === ctx.params.id);
      const account = persona && socioPorPersona(persona.id);
      if (!account) throw noEncontrada('foto');
      await deleteMiFoto(ctx.store, account.id);
      await updatePerfil(ctx.store, account.id, (perfil) => ({
        ...perfil,
        foto_estado: 'NINGUNA',
        foto_motivo: null,
        consentimiento_foto_at: null,
      }));
      return json(200, { ok: true });
    },
  },
  {
    method: 'POST',
    path: '/bot/personas/:id/foto',
    auth: 'BOT',
    handler: async (ctx) => {
      const persona = [...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))].find(
        (p) => p.id === ctx.params.id && p.categoria === 'EXTERNO',
      );
      if (!persona || persona.id !== 'vale') throw noEncontrada('foto');
      const socio = socioPorPersona(persona.id) ?? { id: 'u-vale' };
      const { bytes } = await leerImagen(ctx);
      const photoKey = requireSecret(ctx.cfg, 'photoKey');
      const rec = cifrar(bytes, photoKey, socio.id, ctx.now);
      await update(ctx.store, K.mifoto(socio.id), () => rec);
      await updatePerfil(ctx.store, socio.id, (perfil) => ({
        ...perfil,
        foto_estado: 'PENDIENTE',
        foto_motivo: null,
        consentimiento_foto_at: isoBogota(ctx.now),
      }));
      return json(201, {
        id: socio.id,
        persona_id: persona.id,
        foto_estado: 'PENDIENTE',
        foto_motivo: null,
      });
    },
  },
  { method: 'PUT', path: '/invitaciones/:id/foto', auth: ['SOCIO'], handler: sube('foto') },
  {
    method: 'DELETE',
    path: '/invitaciones/:id/foto',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const inv = await cargar(ctx);
      await deleteFoto(ctx.store, inv.id);
      const next = await updateInvitacion(ctx.store, inv.id, (cur) => ({
        ...cur,
        foto_estado: 'NINGUNA',
        foto_motivo: null,
        consentimiento_at: null,
      }));
      return json(200, vista(next, ctx));
    },
  },
  {
    method: 'GET',
    path: '/invitaciones/:id/foto',
    auth: [...VER],
    handler: async (ctx) => servirInvitacion(ctx, await cargar(ctx), 'foto'),
  },
  { method: 'PUT', path: '/invitaciones/:id/documento', auth: ['SOCIO'], handler: sube('doc') },
  {
    method: 'GET',
    path: '/invitaciones/:id/documento',
    auth: [...VER],
    handler: async (ctx) => servirInvitacion(ctx, await cargar(ctx), 'doc'),
  },
  {
    method: 'DELETE',
    path: '/invitaciones/:id/documento',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const inv = await cargar(ctx);
      await deleteDocumento(ctx.store, inv.id);
      const next = await updateInvitacion(ctx.store, inv.id, (cur) => ({
        ...cur,
        documento_foto: 'NINGUNA',
      }));
      return json(200, vista(next, ctx));
    },
  },
  {
    method: 'GET',
    path: '/bot/fotos/pendientes',
    auth: 'BOT',
    handler: async (ctx) => {
      const photoKey = requireSecret(ctx.cfg, 'photoKey');
      const todas = await listInvitaciones(ctx.store);
      const pendientes = todas.filter((i) => i.foto_estado === 'PENDIENTE');
      const recs = await ctx.store.getMany<FotoGuardada>(pendientes.map((i) => K.foto(i.id)));
      const exp = nowS(ctx) + URL_S;
      const url = (id: string) =>
        `${origin(ctx)}/api/bot/fotos/${id}/archivo?exp=${exp}&sig=${firma(photoKey, id, exp)}`;
      const items: Record<string, unknown>[] = [];
      for (const [n, inv] of pendientes.entries()) {
        const rec = recs[n]?.value;
        if (rec && !caducada(inv, rec, ctx.now)) {
          items.push({
            tipo: 'invitado',
            id: inv.id,
            invitacion_id: inv.id,
            persona_id: inv.persona_id,
            url: url(inv.id),
          });
          continue;
        }
        await deleteFoto(ctx.store, inv.id);
        await updateInvitacion(ctx.store, inv.id, (cur) =>
          cur.foto_estado === 'PENDIENTE'
            ? { ...cur, foto_estado: 'RECHAZADA', foto_motivo: MOTIVO_VENCIDA }
            : cur,
        );
      }
      // Socios: the roster is a fixed list (seed), so one batch read finds the pending profiles.
      const roster = usuarios();
      const perfiles = await ctx.store.getMany<Perfil>(roster.map((u) => K.perfil(u.id)));
      const sociosPend = roster.filter((_, n) => perfiles[n]?.value.foto_estado === 'PENDIENTE');
      const mias = await ctx.store.getMany<FotoGuardada>(sociosPend.map((u) => K.mifoto(u.id)));
      for (const [n, u] of sociosPend.entries()) {
        if (mias[n]) {
          // ponytail: roles without persona_id (edecán, concierge) enroll under their usuario id.
          items.push({
            tipo: u.id === 'u-vale' ? 'externo' : 'socio',
            id: u.id,
            invitacion_id: null, // keeps the key the first robot version read
            usuario_id: u.id,
            persona_id: u.persona_id ?? u.id,
            url: url(u.id),
          });
          continue;
        }
        await updatePerfil(ctx.store, u.id, (p) =>
          p.foto_estado === 'PENDIENTE'
            ? { ...p, foto_estado: 'RECHAZADA', foto_motivo: MOTIVO_PERDIDA }
            : p,
        );
      }
      await barrer(ctx, todas);
      return json(200, { items });
    },
  },
  {
    // Declared after /pendientes: both match `/bot/fotos/<x>` and the first registered wins.
    method: 'GET',
    path: '/bot/fotos/:id',
    auth: 'BOT',
    handler: async (ctx) => servirPorId(ctx, ctx.params.id!),
  },
  {
    // PUBLIC on purpose: the robot downloads with the signed link only (no key, no cookies).
    method: 'GET',
    path: '/bot/fotos/:id/archivo',
    auth: 'PUBLIC',
    handler: async (ctx) => {
      const photoKey = requireSecret(ctx.cfg, 'photoKey');
      const id = ctx.params.id!;
      const exp = Number(ctx.url.searchParams.get('exp'));
      const sig = ctx.url.searchParams.get('sig') ?? '';
      if (!Number.isInteger(exp) || !safeEqual(sig, firma(photoKey, id, exp))) {
        throw fail(401, 'firma_invalida', 'El enlace de la foto no es válido.');
      }
      if (exp <= nowS(ctx)) throw fail(401, 'url_vencida', 'El enlace de la foto venció.');
      return servirPorId(ctx, id);
    },
  },
  {
    method: 'POST',
    path: '/bot/fotos/:id/resultado',
    auth: 'BOT',
    handler: async (ctx) => {
      const b = await readJson(ctx.req);
      if (typeof b.ok !== 'boolean')
        throw fail(400, 'resultado_invalido', 'Falta "ok" (booleano).');
      const motivo = typeof b.motivo === 'string' && b.motivo ? b.motivo.slice(0, 200) : null;
      const id = ctx.params.id!;
      const estado = b.ok ? ('LISTA' as const) : ('RECHAZADA' as const);
      const noPendiente = () =>
        fail(409, 'foto_no_pendiente', 'La foto no está pendiente de revisión.');

      const usuarioFoto = usuarioPorId(id);
      if (!(await getInvitacion(ctx.store, id)) && usuarioFoto) {
        const u = usuarioFoto;
        const p = await updatePerfil(ctx.store, id, (cur) => {
          if (cur.foto_estado !== 'PENDIENTE') throw noPendiente();
          return { ...cur, foto_estado: estado, foto_motivo: b.ok ? null : motivo };
        });
        if (!b.ok) await deleteMiFoto(ctx.store, id);
        return json(200, {
          id,
          persona_id: u.persona_id ?? u.id,
          foto_estado: p.foto_estado,
          foto_motivo: p.foto_motivo,
        });
      }
      const next = await updateInvitacion(ctx.store, id, (cur) => {
        if (cur.foto_estado !== 'PENDIENTE') throw noPendiente();
        return { ...cur, foto_estado: estado, foto_motivo: b.ok ? null : motivo };
      });
      if (!b.ok) await deleteFoto(ctx.store, next.id); // LISTA keeps it until the visit ends
      return json(200, {
        id: next.id,
        persona_id: next.persona_id,
        foto_estado: next.foto_estado,
        foto_motivo: next.foto_motivo,
      });
    },
  },
];
