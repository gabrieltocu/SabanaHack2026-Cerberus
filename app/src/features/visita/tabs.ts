import type { AppTab } from '../../design-system/AppTabsLayout';

export const tabsDemo: readonly AppTab[] = [
  { key: 'index', href: '/visita', label: 'Pase', icon: 'qr-code-outline' },
  { key: 'mapa', href: '/visita/mapa', label: 'Mapa', icon: 'map-outline' },
  { key: 'mensajes', href: '/visita/mensajes', label: 'Mensajes', icon: 'chatbox-outline' },
  { key: 'perfil', href: '/visita/perfil', label: 'Perfil', icon: 'person-outline' },
];

// Con el QR del socio (`?qr=`) la visita viene de la API del club.
export const tabsQr: readonly AppTab[] = [
  { key: 'index', href: '/visita', label: 'Pase', icon: 'qr-code-outline' },
  { key: 'mapa', href: '/visita/mapa', label: 'Mapa', icon: 'map-outline' },
  {
    key: 'actividades',
    href: '/visita/actividades',
    label: 'Actividades',
    icon: 'calendar-outline',
  },
  {
    key: 'acompanamiento',
    href: '/visita/acompanamiento',
    label: 'Recorrido',
    icon: 'footsteps-outline',
  },
  { key: 'perfil', href: '/visita/perfil', label: 'Perfil', icon: 'person-outline' },
];
