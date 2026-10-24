import { AppTabsLayout, type AppTab } from '../../../design-system/AppTabsLayout';
import { Guardia } from '../edecan/Guardia';

const BASE = '/app/personal';

const TABS: AppTab[] = [
  { key: 'index', href: BASE, label: 'Órdenes', icon: 'clipboard-outline' },
  { key: 'reportar', href: `${BASE}/reportar`, label: 'Reportar', icon: 'warning-outline' },
  { key: 'agenda', href: `${BASE}/agenda`, label: 'Agenda', icon: 'calendar-outline' },
  { key: 'actividades', href: `${BASE}/actividades`, label: 'Actividades', icon: 'albums-outline' },
  { key: 'perfil', href: `${BASE}/perfil`, label: 'Perfil', icon: 'person-outline' },
];

/** Guard + tabs of the club staff app. Anyone else is sent where their role belongs. */
export function PersonalLayout() {
  return <Guardia rol="PERSONAL">{(toast) => <AppTabsLayout tabs={TABS} toast={toast} />}</Guardia>;
}
