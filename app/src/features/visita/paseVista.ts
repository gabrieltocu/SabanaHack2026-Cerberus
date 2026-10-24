// Visita con QR firmado: lógica pura sobre `PaseVista` (sin React). Textos en español de Colombia.
import type { PaseVista, PasoVisita, Trato, Visita } from '../../club/types';
import { diaBogota, fechaCorta, horaCorta } from './pase';

export type EstadoVista = {
  clave: 'programada' | 'en_club' | 'en_destino' | 'cerrada' | 'cancelada' | 'vencida';
  etiqueta: string;
};

/** Programada · En el club · En destino · Cerrada (más cancelada/vencida si la invitación ya no sirve). */
export function estadoVista(p: PaseVista): EstadoVista {
  const v = p.visita;
  const e = p.invitacion.estado;
  if (v?.estado === 'CERRADA' || e === 'SALIO') return { clave: 'cerrada', etiqueta: 'Cerrada' };
  if (v?.estado === 'EN_DESTINO') return { clave: 'en_destino', etiqueta: 'En destino' };
  if (v || e === 'LLEGO') return { clave: 'en_club', etiqueta: 'En el club' };
  if (e === 'CANCELADA') return { clave: 'cancelada', etiqueta: 'Cancelada' };
  if (e === 'VENCIDA') return { clave: 'vencida', etiqueta: 'Vencida' };
  return { clave: 'programada', etiqueta: 'Programada' };
}

/** La visita sigue abierta (hay recorrido y no ha salido del club). */
export const visitaActiva = (p: PaseVista): Visita | null =>
  p.visita && p.visita.estado !== 'CERRADA' && p.invitacion.estado !== 'SALIO' ? p.visita : null;

const instante = (fecha: string, hora: string) => Date.parse(`${fecha}T${hora}:00-05:00`);

/** `sáb 24 oct 2026 · 3:00 p. m. – 8:00 p. m.` */
export function horarioInvitacion(i: PaseVista['invitacion']): string {
  const d = instante(i.fecha, i.hora_desde);
  const h = instante(i.fecha, i.hora_hasta);
  if (Number.isNaN(d) || Number.isNaN(h)) return `${i.fecha} · ${i.hora_desde} – ${i.hora_hasta}`;
  return `${fechaCorta(d)} · ${horaCorta(d)} – ${horaCorta(h)}`;
}

/** `Hoy · 3:00 p. m. · Terraza`: cuándo y dónde, en una línea. */
export function lineaPase(p: PaseVista, now = Date.now()): string {
  const i = p.invitacion;
  const d = instante(i.fecha, i.hora_desde);
  if (Number.isNaN(d)) return `${i.fecha} · ${i.hora_desde} · ${destinoDe(p)}`;
  return `${diaBogota(d) === diaBogota(now) ? 'Hoy' : fechaCorta(d)} · ${horaCorta(d)} · ${destinoDe(p)}`;
}

/** «Bienvenida» / «Bienvenido» según el trato de la invitación; neutro si el pase no lo trae. */
export function bienvenidaDe(p: PaseVista): string {
  const trato: Trato | undefined = p.invitacion.trato;
  return trato === 'senora'
    ? 'Bienvenida'
    : trato === 'senor'
      ? 'Bienvenido'
      : 'Te damos la bienvenida';
}

export const nombreAnfitrion = (p: PaseVista) =>
  `${p.anfitrion.nombre} ${p.anfitrion.apellido}`.trim();

export const destinoDe = (p: PaseVista) => p.visita?.destino || p.invitacion.lugar;

export const puntoEncuentro = (p: PaseVista) =>
  p.visita?.punto_encuentro || p.invitacion.punto_encuentro || null;

export const primerNombre = (p: PaseVista) => p.invitacion.nombre.split(/\s+/)[0] || 'visitante';

/** Piso del destino si el texto lo dice («Terraza, piso 2»); 1 por omisión. */
export const pisoDe = (destino: string) => /(?:piso|nivel)\s*(-?\d+)/i.exec(destino)?.[1] ?? '1';

/** Hora de un instante ISO, o «» si no se puede leer. */
export function horaDe(ts: string | null): string {
  const ms = ts ? Date.parse(ts) : NaN;
  return Number.isNaN(ms) ? '' : horaCorta(ms);
}

export type Relevo =
  { tipo: 'pendiente' } | { tipo: 'en_camino' } | { tipo: 'nuevo'; nombre: string } | null;

const CAMBIO: readonly PasoVisita['tipo'][] = [
  'RELEVO_SOLICITADO',
  'RELEVO_ACEPTADO',
  'ENTREGA_CONFIRMADA',
];

/**
 * Cambio de acompañante en curso o ya hecho. Llegar al destino cierra el acompañamiento: desde
 * ahí no hay aviso.
 */
export function relevo(v: Visita): Relevo {
  if (v.estado === 'CERRADA' || v.estado === 'EN_DESTINO') return null;
  const ultimo = [...v.recorrido].reverse().find((p) => CAMBIO.includes(p.tipo));
  if (v.estado === 'EN_RELEVO') {
    return ultimo?.tipo === 'RELEVO_ACEPTADO' ? { tipo: 'en_camino' } : { tipo: 'pendiente' };
  }
  if (ultimo?.tipo === 'ENTREGA_CONFIRMADA' && v.acompanante) {
    return { tipo: 'nuevo', nombre: v.acompanante.nombre };
  }
  return null;
}

/** Texto fijo por tipo de paso: el `detalle` del servidor es interno y no se muestra. */
export function pasoTexto(p: PasoVisita, destino: string): string {
  switch (p.tipo) {
    case 'LLEGADA':
      return 'Llegaste al club';
    case 'ASIGNADO':
      return 'Te asignamos un acompañante';
    case 'RELEVO_SOLICITADO':
      return 'Pedimos un cambio de acompañante';
    case 'RELEVO_ACEPTADO':
      return 'Un edecán va a recibirte';
    case 'ENTREGA_CONFIRMADA':
      return 'Te entregamos a tu nuevo acompañante';
    case 'AYUDA':
      return 'Pediste ayuda';
    case 'EN_DESTINO':
      return `Llegaste a ${destino}`;
    case 'ENCUENTRO':
      return 'Te encontraste con tu anfitrión';
    case 'INCIDENCIA':
      return 'Hubo un imprevisto y ya lo atendemos';
    case 'SALIDA':
      return 'Saliste del club';
  }
}

export function estadoAcompanamiento(v: Visita): string {
  switch (v.estado) {
    case 'EN_RECEPCION':
      return 'Estamos asignando a quien te acompañe.';
    case 'ACOMPANANDO':
      return `Vamos hacia ${v.destino}.`;
    case 'EN_RELEVO':
      return 'Estamos cambiando de acompañante.';
    case 'EN_DESTINO':
      return `Llegaste a ${v.destino}. El acompañamiento terminó.`;
    case 'CERRADA':
      return 'Tu visita terminó.';
  }
}

export type ErrorPase = {
  tipo: 'invalido' | 'vencido' | 'conexion' | 'otro';
  titulo: string;
  texto: string;
  /** Un enlace malo o vencido no mejora reintentando. */
  reintentar: boolean;
};

export function errorPase(code: string): ErrorPase {
  if (code === 'qr_invalido') {
    return {
      tipo: 'invalido',
      titulo: 'Este enlace no es válido',
      texto:
        'Pídele a tu anfitrión que te comparta de nuevo el enlace de tu pase. Si ya estás en el club, muestra tu QR al robot o a un edecán.',
      reintentar: false,
    };
  }
  if (code === 'qr_vencido') {
    return {
      tipo: 'vencido',
      titulo: 'Tu pase venció',
      texto:
        'Esta invitación ya no está vigente. Pídele a tu anfitrión una nueva; si sigues en el club, habla con un edecán.',
      reintentar: false,
    };
  }
  if (code === 'sin_conexion') {
    return {
      tipo: 'conexion',
      titulo: 'Sin conexión',
      texto: 'Revisa tu red e intenta de nuevo. Tu pase sigue siendo válido.',
      reintentar: true,
    };
  }
  return {
    tipo: 'otro',
    titulo: 'No pudimos cargar tu visita',
    texto: 'Intenta de nuevo en unos segundos.',
    reintentar: true,
  };
}

export const ERRORES_DEL_PASE: readonly string[] = ['qr_invalido', 'qr_vencido'];
