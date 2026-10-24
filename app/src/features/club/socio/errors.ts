import { ClubApiError } from '../client';

export interface ErrorInfo {
  code: string;
  /** Shown to the socio as the API wrote it. */
  detalle: string;
  /** 401: the session is gone, offer to sign in again. */
  sesion: boolean;
  sinConexion: boolean;
}

const GENERICO = 'No se pudo completar. Intenta de nuevo.';

/** Fallback texts for stable codes whose `detalle` came back empty. */
const RESPALDO: Record<string, string> = {
  sin_conexion: 'Sin conexión. Revisa tu red e intenta de nuevo.',
  limite_invitaciones: 'Llegaste al límite de invitaciones activas.',
  fecha_pasada: 'La fecha ya pasó. Elige hoy o un día futuro.',
  estado_no_editable: 'Esta invitación ya no se puede cambiar.',
  foto_muy_grande: 'La foto pesa demasiado. Prueba con otra.',
};

export function describir(e: unknown): ErrorInfo {
  if (e instanceof ClubApiError) {
    return {
      code: e.code,
      detalle: e.detalle || RESPALDO[e.code] || GENERICO,
      sesion: e.status === 401,
      sinConexion: e.code === 'sin_conexion',
    };
  }
  return { code: 'error', detalle: GENERICO, sesion: false, sinConexion: false };
}
