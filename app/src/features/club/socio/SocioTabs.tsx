import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { colors } from '../../../design-system';
import { BottomTabBar } from '../../../design-system/components/BottomTabBar';
import { AppTabsLayout, type AppTab } from '../../../design-system/AppTabsLayout';

const BASE = '/app/socio';
/** Width of the socio column on wide windows. */
export const COLUMNA = 560;

/** Inicio · Invitados · Agenda · Perfil. Mi pase and Avisos open from Inicio and Perfil. */
function useSocioTabs() {
  const tabs: AppTab[] = [
    { key: 'index', href: BASE, label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
    {
      key: 'invitados',
      href: `${BASE}/invitados`,
      label: 'Invitados',
      icon: 'people-outline',
      activeIcon: 'people',
    },
    {
      key: 'actividades',
      href: `${BASE}/actividades`,
      label: 'Agenda',
      icon: 'calendar-outline',
      activeIcon: 'calendar',
    },
    {
      key: 'perfil',
      href: `${BASE}/perfil`,
      label: 'Perfil',
      icon: 'person-outline',
      activeIcon: 'person',
    },
  ];
  return tabs;
}

export function SocioTabs() {
  const tabs = useSocioTabs();
  // Routes outside (tabs) (forms, details, Mi QR) are not declared here: with `href: null` SDK 58
  // redirects to another tab instead of opening them. SocioStackShell draws the bar for those.
  return <AppTabsLayout tabs={tabs} />;
}

/** Tab that stays lit while a screen outside the tabs is open (null: it is one of the tabs). */
export function pestanaDe(pathname: string): string | null {
  const ruta = pathname.slice(BASE.length);
  if (/^\/(nueva|invitacion|visita)(\/|$)/.test(ruta)) return 'invitados';
  if (/^\/actividad(\/|$)/.test(ruta)) return 'actividades';
  if (/^\/cuenta(\/|$)/.test(ruta)) return 'perfil';
  if (ruta === '/mi-qr' || ruta === '/avisos') return 'index';
  return null;
}

/**
 * One 560 px column centred on wide windows, on a slightly darker backdrop with hairline edges.
 * Screens outside the tabs get the same bottom bar, at the width of the column.
 */
export function SocioStackShell({ children }: { children: ReactNode }) {
  const tabs = useSocioTabs();
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const activa = pestanaDe(pathname);
  const ancha = width > COLUMNA;
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bone100, alignItems: 'center' }}>
      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: COLUMNA,
          backgroundColor: colors.bg,
          overflow: 'hidden',
          borderLeftWidth: ancha ? 1 : 0,
          borderRightWidth: ancha ? 1 : 0,
          borderColor: colors.border,
        }}
      >
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {activa ? (
          <BottomTabBar
            items={tabs}
            activeKey={activa}
            onSelect={(key) => {
              const tab = tabs.find((item) => item.key === key);
              if (tab) router.navigate(tab.href as never);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
