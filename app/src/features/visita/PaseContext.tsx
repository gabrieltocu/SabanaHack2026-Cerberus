import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { PaseVista } from '../../club/types';
import { club, ClubApiError, type ClubClient } from '../club/client';
import { ERRORES_DEL_PASE } from './paseVista';

/** Mientras la visita está abierta (acompañamiento en vivo). */
export const SONDEO_MS = 5_000;
/** Antes de que llegue al club: basta para ver cuándo empieza el recorrido. */
export const SONDEO_ESPERA_MS = 10_000;

export type PaseEstado = {
  qr: string;
  client: ClubClient;
  datos: PaseVista | null;
  error: ClubApiError | null;
  cargando: boolean;
  recargar: () => void;
};

const Ctx = createContext<PaseEstado | null>(null);

/** Un solo sondeo del pase para todas las pestañas; se pausa con la app en segundo plano. */
export function PaseProvider({
  qr,
  client = club,
  children,
}: {
  qr: string;
  client?: ClubClient;
  children: ReactNode;
}) {
  const [datos, setDatos] = useState<PaseVista | null>(null);
  const [error, setError] = useState<ClubApiError | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const [activa, setActiva] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActiva(s !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const vuelta = async () => {
      let siguiente: number | null = SONDEO_ESPERA_MS;
      try {
        const d = await client.pase(qr);
        if (!vivo) return;
        setDatos(d);
        setError(null);
        const cerrada = d.visita?.estado === 'CERRADA' || d.invitacion.estado === 'SALIO';
        siguiente = cerrada ? null : d.visita ? SONDEO_MS : SONDEO_ESPERA_MS;
      } catch (e) {
        if (!vivo) return;
        const err =
          e instanceof ClubApiError ? e : new ClubApiError(0, 'error', 'No se pudo cargar.');
        setError(err);
        if (ERRORES_DEL_PASE.includes(err.code)) siguiente = null;
      }
      setCargando(false);
      if (vivo && siguiente) timer = setTimeout(vuelta, siguiente);
    };
    void vuelta();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [client, qr, activa, intento]);

  const valor = useMemo<PaseEstado>(
    () => ({
      qr,
      client,
      datos,
      error,
      cargando,
      recargar: () => {
        setCargando(true);
        setIntento((i) => i + 1);
      },
    }),
    [qr, client, datos, error, cargando],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** `null` fuera de un enlace con QR (modo de demostración). */
export const usePaseOpcional = () => useContext(Ctx);

export function usePase(): PaseEstado {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePase fuera de PaseProvider');
  return v;
}
