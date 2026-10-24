import { useCallback } from 'react';

import type { Tarea, Visita } from '../../../club/types';
import { ClubApiError } from '../client';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { tareasAceptadas, visitaTerminada } from './model';
import { useTareas } from './TareasContext';

export interface ItemEnCurso {
  visita: Visita;
  tarea: Tarea | null;
}

const noExiste = (e: unknown) => e instanceof ClubApiError && e.status === 404;

/**
 * The visits I escort: those of my accepted tasks plus `extra` (a visit opened by id), minus the
 * ones that already arrived. The tasks poll (5 s) re-creates the loader, so the visits refresh too.
 */
export function useEnCurso(extra?: string) {
  const { client } = useSession();
  const { yo, tareas } = useTareas();
  const activa = usePantallaActiva();
  const cargar = useCallback(async (): Promise<ItemEnCurso[]> => {
    const mias = tareasAceptadas(tareas ?? [], yo.id);
    const ids = [...new Set([...mias.map((t) => t.visita_id), ...(extra ? [extra] : [])])];
    const visitas = await Promise.all(
      ids.map((id) =>
        client.visita(id).catch((e: unknown) => {
          if (noExiste(e)) return null;
          throw e;
        }),
      ),
    );
    return visitas
      .filter((v): v is Visita => v !== null && !visitaTerminada(v))
      .map((v) => ({ visita: v, tarea: mias.find((t) => t.visita_id === v.id) ?? null }));
  }, [client, tareas, yo.id, extra]);
  return useRecurso(cargar, { activo: activa && tareas !== null });
}
