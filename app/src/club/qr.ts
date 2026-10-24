// Signed QR passes (must match the robot's vision/qr_pass.py byte for byte) and Bogotá time.
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as QRCode from 'qrcode';

import { nowS, requireSecret, type Route } from './app';
import { json } from './http';
import type { KeyValueStore } from '../infrastructure/stores/types';
import { update } from './repo';

export type QrTipo = 'socio' | 'invitado' | 'personal' | 'externo';

const BOGOTA_MS = 5 * 3600_000; // America/Bogota is UTC-5 all year (no DST)
export const SOCIO_QR_TTL_S = 300;
const qrSocioKey = (personaId: string) => `club:qr-socio:${personaId}`;

/** `2026-10-24T10:00:00.000-05:00`: how every instant of the club API is shown. */
export const isoBogota = (d: Date) =>
  new Date(d.getTime() - BOGOTA_MS).toISOString().replace('Z', '-05:00');

/** Unix seconds of `fecha` (YYYY-MM-DD) + `hora` (HH:MM) in Bogotá. */
export const bogotaExp = (fecha: string, hora: string) =>
  Date.parse(`${fecha}T${hora}:00-05:00`) / 1000;

/** `NCLUB1|tipo|persona_id|nombre|exp|sig`, sig = HMAC-SHA256(body)[:20] in hex. */
export function qrPayload(
  tipo: QrTipo,
  personaId: string,
  nombre: string,
  expUnix: number,
  secret: string,
): string {
  const body = ['NCLUB1', tipo, personaId, nombre.replaceAll('|', ' '), String(expUnix)].join('|');
  const sig = createHmac('sha256', secret).update(body).digest('hex').slice(0, 20);
  return `${body}|${sig}`;
}

export interface QrLeido {
  tipo: string;
  persona_id: string;
  nombre: string;
  exp: number;
}

/** Verifies a signed payload: `qr` is set whenever the signature holds (also when `vencido`). */
export function leerQr(
  payload: string,
  secret: string,
  nowUnix: number,
): { qr: QrLeido | null; motivo: 'formato_invalido' | 'firma_invalida' | 'vencido' | null } {
  const parts = payload.split('|');
  const [magic, tipo, persona_id, nombre, exp, sig] = parts;
  if (
    parts.length !== 6 ||
    magic !== 'NCLUB1' ||
    !/^\d{1,12}$/.test(exp!) ||
    !/^[0-9a-f]{20}$/.test(sig!)
  ) {
    return { qr: null, motivo: 'formato_invalido' };
  }
  const expected = createHmac('sha256', secret).update(parts.slice(0, 5).join('|')).digest('hex');
  if (!timingSafeEqual(Buffer.from(sig!), Buffer.from(expected.slice(0, 20)))) {
    return { qr: null, motivo: 'firma_invalida' };
  }
  const qr = { tipo: tipo!, persona_id: persona_id!, nombre: nombre!, exp: Number(exp) };
  return { qr, motivo: qr.exp <= nowUnix ? 'vencido' : null };
}

/** Reuses the last live QR, or refreshes it for the app and the robot snapshot. */
export function qrSocioActual(
  store: KeyValueStore,
  now: Date,
  secret: string,
  personaId: string,
  nombre: string,
  renovar = false,
  tipo: 'socio' | 'externo' = 'socio',
): Promise<string> {
  const nowUnix = Math.floor(now.getTime() / 1000);
  const exp = nowUnix + SOCIO_QR_TTL_S;
  const nuevo = qrPayload(tipo, personaId, nombre, exp, secret);
  return update(store, qrSocioKey(personaId), (actual) => {
    if (actual) {
      const { qr, motivo } = leerQr(actual, secret, nowUnix);
      const mismoSocio =
        qr?.tipo === tipo &&
        qr.persona_id === personaId &&
        qr.nombre === nombre.replaceAll('|', ' ');
      if (mismoSocio && motivo !== 'vencido' && (!renovar || qr.exp >= exp)) return actual;
    }
    return nuevo;
  });
}

export const qrPng = (payload: string) =>
  QRCode.toBuffer(payload, { margin: 2, scale: 8, errorCorrectionLevel: 'M' });

export const qrRoutes: Route[] = [
  {
    method: 'GET',
    path: '/me/qr',
    auth: ['SOCIO'],
    handler: async (ctx) => {
      const u = ctx.user!;
      const secret = requireSecret(ctx.cfg, 'qrSecret');
      const qr_payload = await qrSocioActual(
        ctx.store,
        ctx.now,
        secret,
        u.persona_id!,
        `${u.nombre} ${u.apellido}`,
        true,
      );
      const exp = leerQr(qr_payload, secret, nowS(ctx)).qr!.exp;
      return json(200, {
        qr_payload,
        vence_at: isoBogota(new Date(exp * 1000)),
      });
    },
  },
];
