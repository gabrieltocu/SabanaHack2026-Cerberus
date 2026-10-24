import { Tabs, useGlobalSearchParams, useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { BottomTabBar, type TabItem } from './components/BottomTabBar';
import { colors } from './tokens';

export type AppTab = TabItem & {
  /** File name of the route inside the layout folder: `index`, `invitados`, `perfil`. */
  key: string;
  /** Absolute path of that route, e.g. `/socio/invitados`. */
  href: string;
};

export type AppTabsLayoutProps = {
  /** Tabs in display order. Routes of the folder that are not listed (forms, details) stay reachable. */
  tabs: readonly AppTab[];
  /** Other routes of the folder (forms, details) that open inside the area without a tab. */
  hiddenRoutes?: readonly string[];
  /** Query params that survive a tab change, e.g. `['perfil']`. */
  keepParams?: readonly string[];
  /** Pinned at the top of the area (e.g. `<OfflineBanner />` while offline). */
  banner?: ReactNode;
  /** Floating overlay (`useToast().toast`). */
  toast?: ReactNode;
};

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Drop-in `_layout.tsx` body for a role's tab area:
 * `export default () => <AppTabsLayout tabs={[{ key: 'index', href: '/socio', label: 'Inicio', icon: 'home-outline' }, ...]} />`.
 * Renders expo-router `Tabs` inside the `AppShell` column with the N Club `BottomTabBar`.
 */
export function AppTabsLayout({
  tabs,
  hiddenRoutes = [],
  keepParams = [],
  banner,
  toast,
}: AppTabsLayoutProps) {
  const router = useRouter();
  const params = useGlobalSearchParams();
  const kept = Object.fromEntries(
    keepParams.flatMap((k) => (typeof params[k] === 'string' ? [[k, params[k]]] : [])),
  );
  const bar = ({ state }: TabBarProps) => (
    <BottomTabBar
      items={tabs}
      activeKey={state.routes[state.index]?.name ?? ''}
      onSelect={(key) => {
        const tab = tabs.find((t) => t.key === key);
        if (tab) router.navigate({ pathname: tab.href, params: kept } as never);
      }}
    />
  );
  return (
    <AppShell banner={banner} toast={toast}>
      <Tabs
        tabBar={bar}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        {tabs.map((t) => (
          <Tabs.Screen key={t.key} name={t.key} options={{ title: t.label }} />
        ))}
        {hiddenRoutes.map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </AppShell>
  );
}
