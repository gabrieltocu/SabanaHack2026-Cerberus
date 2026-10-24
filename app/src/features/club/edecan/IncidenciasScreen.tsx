import { useCallback, useMemo } from 'react';

import { MobileHeader } from '../../../design-system';
import { useSession } from '../session';
import { horaDe } from '../socio/dates';
import { Frame } from '../socio/ui/Frame';
import { Fila, Lista, Textos } from '../ui/lux';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { etiquetaIncidencia, tareasAceptadas } from './model';
import { FormularioReporte } from './Reportar';
import { useTareas } from './TareasContext';
import { Seccion } from './ui';

/** Report a problem and, below, the ones still open (nothing is shown when there are none). */
export function IncidenciasScreen() {
  const { client } = useSession();
  const { yo, tareas } = useTareas();
  const activa = usePantallaActiva();

  const cargar = useCallback(() => client.incidencias('ABIERTA'), [client]);
  const { datos, recargar } = useRecurso(cargar, { activo: activa, cadaMs: 10_000 });

  // With exactly one visit in hand the report belongs to it; with none or several, to none.
  const visitaId = useMemo(() => {
    const mias = tareasAceptadas(tareas ?? [], yo.id);
    return mias.length === 1 ? mias[0]!.visita_id : undefined;
  }, [tareas, yo.id]);

  return (
    <Frame header={<MobileHeader title="Reportar" />} onRefresh={() => void recargar()}>
      <FormularioReporte visitaId={visitaId} onEnviado={recargar} />
      {datos?.length ? (
        <Seccion titulo="Abiertas">
          <Lista>
            {datos.map((i) => (
              <Fila key={i.id}>
                <Textos
                  titulo={i.descripcion}
                  detalle={[etiquetaIncidencia(i.tipo), i.lugar, horaDe(i.creada_at)]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </Fila>
            ))}
          </Lista>
        </Seccion>
      ) : null}
    </Frame>
  );
}
