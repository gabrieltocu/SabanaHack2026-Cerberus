import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { Tarea } from '../../../club/types';
import type { ClubApiError, UsuarioPublico } from '../client';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { useAppActiva, vibrarAlerta } from '../ui/visible';
import { useAvisar } from './Guardia';
import { tareasAbiertas } from './model';

export const SONDEO_MS = 5000;

interface Valor {
  yo: UsuarioPublico;
  tareas: Tarea[] | null;
  error: ClubApiError | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

const Ctx = createContext<Valor | null>(null);

export function useTareas(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTareas necesita TareasProvider');
  return v;
}

/**
 * Polls the edecán's tasks every 5 s while the app is in the foreground. A new urgent task
 * vibrates and shows a toast whichever tab is open; the first load only sets the baseline.
 */
export function TareasProvider({ children }: { children: ReactNode }) {
  const { client, usuario } = useSession();
  const avisar = useAvisar();
  const activa = useAppActiva();
  const cargar = useCallback(() => client.tareas(), [client]);
  const { datos, error, cargando, recargar } = useRecurso(cargar, {
    activo: activa,
    cadaMs: SONDEO_MS,
  });
  const vistas = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!datos || !usuario) return;
    const abiertas = tareasAbiertas(datos, usuario.id);
    const previas = vistas.current;
    vistas.current = new Set(abiertas.map((t) => t.id));
    if (!previas) return;
    const nueva = abiertas.find((t) => t.prioridad === 'urgente' && !previas.has(t.id));
    if (nueva) {
      vibrarAlerta();
      avisar(`Tarea urgente: ${nueva.nombre_visitante}`, 'error');
    }
  }, [datos, usuario, avisar]);

  const valor = useMemo(
    () => (usuario ? { yo: usuario, tareas: datos, error, cargando, recargar } : null),
    [usuario, datos, error, cargando, recargar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
