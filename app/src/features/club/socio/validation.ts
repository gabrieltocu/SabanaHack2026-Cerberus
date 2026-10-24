import type { NuevaInvitacion } from '../client';
import { esFecha, esHora } from './dates';

export interface FormValues {
  nombre: string;
  apellido: string;
  trato: '' | 'senor' | 'senora';
  fecha: string;
  hora_desde: string;
  hora_hasta: string;
  lugar: string;
  nota: string;
  preferencias_bebida: string[];
  asistencia: string[];
  punto_encuentro: string;
  /** Cédula number; the photo of its front travels separately. */
  documento: string;
}
export type FormErrors = Partial<Record<keyof FormValues, string>>;

const DOCUMENTO = /^[A-Za-z0-9]{5,15}$/;

/** Pure. `hoy` is the civil date in Bogotá. `conFotoDocumento`: a cédula photo is attached. */
export function validar(v: FormValues, hoy: string, conFotoDocumento = false): FormErrors {
  const e: FormErrors = {};
  if (v.nombre.trim().length < 2) e.nombre = 'Escribe el nombre.';
  if (v.apellido.trim().length < 2) e.apellido = 'Escribe el apellido.';
  if (!v.trato) e.trato = 'Elige cómo tratarlo.';
  if (!esFecha(v.fecha) || v.fecha < hoy) {
    e.fecha = 'Usa una fecha de hoy en adelante (AAAA-MM-DD).';
  }
  if (!esHora(v.hora_desde)) e.hora_desde = 'Escribe la hora (HH:MM).';
  if (!esHora(v.hora_hasta)) e.hora_hasta = 'Escribe la hora (HH:MM).';
  else if (!e.hora_desde && v.hora_hasta <= v.hora_desde) {
    e.hora_hasta = 'La hora final debe ser después de la inicial.';
  }
  if (!v.lugar) e.lugar = 'Elige el lugar.';
  const doc = v.documento.trim();
  if (doc && !DOCUMENTO.test(doc))
    e.documento = 'Revisa el número: solo letras y números, de 5 a 15.';
  else if (!doc && conFotoDocumento) e.documento = 'Escribe el número de la cédula.';
  return e;
}

/** `conDocumento: false` (editing) leaves the stored cédula number untouched. */
export function aCuerpo(v: FormValues, conDocumento = true): NuevaInvitacion {
  return {
    nombre: v.nombre.trim(),
    apellido: v.apellido.trim(),
    trato: v.trato as 'senor' | 'senora',
    fecha: v.fecha,
    hora_desde: v.hora_desde,
    hora_hasta: v.hora_hasta,
    lugar: v.lugar,
    nota: v.nota.trim() || null,
    ...(conDocumento ? { documento: v.documento.trim() || null } : null),
    preferencias_bebida: v.preferencias_bebida,
    asistencia: v.asistencia,
    punto_encuentro: v.punto_encuentro.trim() || null,
  };
}
