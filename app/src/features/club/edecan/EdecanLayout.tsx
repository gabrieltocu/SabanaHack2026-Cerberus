import type { ReactNode } from 'react';

import { OfflineBanner } from '../../../design-system';
import { AppTabsLayout, type AppTab } from '../../../design-system/AppTabsLayout';
import { Guardia } from './Guardia';
import { TareasProvider, useTareas } from './TareasContext';

const BASE = '/app/edecan';

function Pestanas({ toast }: { toast: ReactNode }) {
  const { tareas, error, recargar } = useTareas();
  const tabs: AppTab[] = [
    { key: 'index', href: BASE, label: 'Tareas', icon: 'checkmark-done-outline' },
    { key: 'en-curso', href: `${BASE}/en-curso`, label: 'En curso', icon: 'walk-outline' },
    { key: 'escanear', href: `${BASE}/escanear`, label: 'Escanear', icon: 'qr-code-outline' },
    { key: 'incidencias', href: `${BASE}/incidencias`, label: 'Reportar', icon: 'warning-outline' },
    { key: 'perfil', href: `${BASE}/perfil`, label: 'Perfil', icon: 'person-outline' },
  ];
  return (
    <AppTabsLayout
      tabs={tabs}
      toast={toast}
      banner={
        error?.code === 'sin_conexion' && tareas ? (
          <OfflineBanner onRetry={() => void recargar()} />
        ) : null
      }
    />
  );
}

/** Guard + tabs of the edecán app. Anyone else is sent where their role belongs. */
export function EdecanLayout() {
  return (
    <Guardia rol="EDECAN">
      {(toast) => (
        <TareasProvider>
          <Pestanas toast={toast} />
        </TareasProvider>
      )}
    </Guardia>
  );
}
