import { useCallback, useEffect, useRef, useState } from 'react';

import { ClubApiError } from '../client';
import { useSession } from '../session';

/**
 * Loads one resource while `activo` (screen visible), optionally again every `cadaMs`.
 * Keeps the last good data when a refresh fails so the screen can show it with a warning.
 */
export function useRecurso<T>(
  cargar: () => Promise<T>,
  { activo = true, cadaMs, clave }: { activo?: boolean; cadaMs?: number; clave?: unknown } = {},
) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ClubApiError | null>(null);
  const [cargando, setCargando] = useState(true);
  const { logout } = useSession();
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  });

  const recargar = useCallback(async () => {
    try {
      setDatos(await cargarRef.current());
      setError(null);
    } catch (e) {
      if (e instanceof ClubApiError && e.status === 401) void logout(); // expired: back to login
      setError(e instanceof ClubApiError ? e : new ClubApiError(0, 'error', 'No se pudo cargar.'));
    } finally {
      setCargando(false);
    }
  }, [logout]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const vuelta = async () => {
      await recargar();
      if (vivo && cadaMs) timer = setTimeout(vuelta, cadaMs);
    };
    void vuelta();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [activo, cadaMs, recargar, cargar, clave]);

  return { datos, error, cargando, recargar, sinConexion: error?.code === 'sin_conexion' };
}
