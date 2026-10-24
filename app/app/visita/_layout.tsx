import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { AppShell, colors } from '@/design-system';
import { PaseProvider } from '@/features/visita/PaseContext';
import { tabsDemo, tabsQr } from '@/features/visita/tabs';

// «Mi pase» y «Membresía» son pantallas completas (SDK 58: las pestañas no alojan rutas sin
// declarar), así que viven en un stack que conserva la barra inferior.
export default function VisitaLayout() {
  const params = useGlobalSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const qr = Array.isArray(params.qr) ? params.qr[0] : params.qr;
  const items = qr ? tabsQr : tabsDemo;
  const activa =
    pathname === '/visita/pase' ? 'index' : pathname === '/visita/membresia' ? 'perfil' : null;
  const kept = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === 'string'));
  const shell = (
    <AppShell
      tabs={
        activa
          ? {
              items,
              activeKey: activa,
              onSelect: (key) => {
                const tab = items.find((t) => t.key === key);
                if (tab) router.navigate({ pathname: tab.href, params: kept } as never);
              },
            }
          : undefined
      }
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </AppShell>
  );
  return qr ? <PaseProvider qr={qr}>{shell}</PaseProvider> : shell;
}
