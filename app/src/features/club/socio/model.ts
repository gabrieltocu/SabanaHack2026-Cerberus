// Labels and small helpers for the socio app (texts are short on purpose: one hand, 360 px).
import type { EstadoInvitacion, FotoEstado, Invitacion, Usuario } from '../../../club/types';
import { dateLabel } from '../../shared/dates';
import { diaFrase } from './dates';

/** Places a socio can pick. `INVITADO` (robot default) is not offered. */
export const LUGARES = ['Sala de anfitriones', 'Lounge VIP', 'Terraza', 'Restaurante'] as const;

export const ESTADO_LABEL: Record<EstadoInvitacion, string> = {
  PROGRAMADA: 'Programada',
  LLEGO: 'Llegó',
  SALIO: 'Salió',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
};

export const FOTO_LABEL: Record<FotoEstado, string> = {
  NINGUNA: 'Sin foto',
  PENDIENTE: 'Procesando',
  LISTA: 'Lista',
  RECHAZADA: 'Rechazada',
};

export const CONSENTIMIENTO =
  'El invitado me autorizó a usar su foto para que el robot lo reconozca; se borra al terminar la visita';
export const SIN_FOTO_AVISO = 'El robot le pedirá un QR.';

/** Active invitations allowed per level. Same numbers as the API (src/club/seed.ts, server only). */
export const LIMITE_ACTIVAS = { VIP: 10, REGULAR: 3 } as const;

/** What the robot does for each level; the club's way to tell them apart. */
export const BENEFICIO = {
  VIP: 'El robot avisa a concierge al llegar y te acompaña a tu sala.',
  REGULAR: 'El robot te orienta a tu actividad o reserva.',
} as const;

export const nivelDe = (u: Pick<Usuario, 'nivel'>) => (u.nivel === 'VIP' ? 'VIP' : 'REGULAR');

/** Invitations that still count against the limit (the API derives VENCIDA itself). */
export const cuentaActivas = (lista: readonly Invitacion[]) =>
  lista.filter((i) => i.estado === 'PROGRAMADA' || i.estado === 'LLEGO').length;

/** `Socio VIP`, `Socia regular`. */
export const tierLabel = (u: Pick<Usuario, 'trato' | 'nivel'>) =>
  `${u.trato === 'senora' ? 'Socia' : 'Socio'} ${u.nivel === 'VIP' ? 'VIP' : 'regular'}`;

export const accionLabel = (u: Pick<Usuario, 'accion'>) =>
  u.accion === 'empresarial'
    ? 'Acción empresarial'
    : u.accion === 'familiar'
      ? 'Acción familiar'
      : '';

export const nombreCompleto = (i: Pick<Invitacion, 'nombre' | 'apellido'>) =>
  `${i.nombre} ${i.apellido}`.trim();

export const franja = (i: Pick<Invitacion, 'hora_desde' | 'hora_hasta'>) =>
  `${i.hora_desde}–${i.hora_hasta}`;

/** `sáb 24 oct 2026 · 10:00–12:00`. */
export const cuando = (i: Pick<Invitacion, 'fecha' | 'hora_desde' | 'hora_hasta'>) =>
  `${dateLabel(i.fecha)} · ${franja(i)}`;

/** `sáb 24 oct · 10:00–12:00`: fits a 360 px row on one line. */
export const cuandoCorto = (i: Pick<Invitacion, 'fecha' | 'hora_desde' | 'hora_hasta'>) =>
  `${dateLabel(i.fecha).split(' ').slice(0, 3).join(' ')} · ${franja(i)}`;

/**
 * `Hoy · 15:00 · Terraza`: the one line of a guest row. Only a cancelled or expired invitation
 * says so, as a plain word, so the history stays readable without chips.
 */
export const cuandoFrase = (
  i: Pick<Invitacion, 'fecha' | 'hora_desde' | 'estado' | 'lugar'>,
  hoy: string,
  conLugar = true,
) =>
  [
    i.estado === 'CANCELADA' ? 'Cancelada' : i.estado === 'VENCIDA' ? 'Vencida' : null,
    diaFrase(i.fecha, hoy),
    i.hora_desde,
    conLugar ? i.lugar : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** An invitation still ahead of the socio: not closed, and today or later. */
export const esProxima = (i: Invitacion, hoy: string) =>
  (i.estado === 'PROGRAMADA' || i.estado === 'LLEGO') && i.fecha >= hoy;

export const porFecha = (a: Invitacion, b: Invitacion) =>
  `${a.fecha} ${a.hora_desde}`.localeCompare(`${b.fecha} ${b.hora_desde}`);
