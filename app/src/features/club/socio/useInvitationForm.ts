import { useState } from 'react';

import { LUGARES } from './model';
import { horasPorDefecto } from './dates';
import type { FotoLista } from './photo';
import { validar, type FormErrors, type FormValues } from './validation';

/** Form state for creating or editing an invitation. Errors appear after the first submit attempt. */
export function useInvitationForm(hoy: string, ahora: Date, initial?: Partial<FormValues>) {
  const [values, setValues] = useState<FormValues>(() => {
    const { desde, hasta } = horasPorDefecto(ahora);
    return {
      nombre: '',
      apellido: '',
      trato: '',
      fecha: hoy,
      hora_desde: desde,
      hora_hasta: hasta,
      lugar: LUGARES[0],
      nota: '',
      preferencias_bebida: [],
      asistencia: [],
      punto_encuentro: '',
      documento: '',
      ...initial,
    };
  });
  const [intentos, setIntentos] = useState(0);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [fotoDoc, setFotoDoc] = useState<FotoLista | null>(null);
  const [consentimientoDoc, setConsentimientoDoc] = useState(false);

  const errores = validar(values, hoy, !!fotoDoc);
  /** A photo is attached but its authorization is not ticked: the submit button stays disabled. */
  const falta = (!!foto && !consentimiento) || (!!fotoDoc && !consentimientoDoc);
  const mostrados: FormErrors = intentos > 0 ? errores : {};

  return {
    values,
    set: <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
      setValues((s) => ({ ...s, [k]: v })),
    errores: mostrados,
    foto,
    setFoto,
    consentimiento,
    setConsentimiento,
    fotoDoc,
    setFotoDoc,
    consentimientoDoc,
    setConsentimientoDoc,
    falta,
    intentos,
    /** Marks a submit attempt; true when the form can go out. */
    intentar: () => {
      setIntentos((n) => n + 1);
      return Object.keys(errores).length === 0 && !falta;
    },
  };
}

export type InvitationForm = ReturnType<typeof useInvitationForm>;
