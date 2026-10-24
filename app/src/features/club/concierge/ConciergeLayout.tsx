import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppTabsLayout, type AppTab } from '../../../design-system/AppTabsLayout';
import {
  ErrorState,
  OfflineBanner,
  TAB_BAR_HEIGHT,
  colors,
  space,
  useToast,
} from '../../../design-system';
import { FeedProvider, useFeed } from '../feed';
import { rutaPorRol, useSession } from '../session';

const BASE = '/app/concierge';

function Pestanas() {
  const feed = useFeed();
  const { show, toast } = useToast({ bottomOffset: TAB_BAR_HEIGHT });
  const aviso = feed.aviso;
  useEffect(() => {
    if (aviso)
      show(
        aviso.texto,
        aviso.tipo === 'error' ? 'error' : aviso.tipo === 'ok' ? 'success' : 'info',
      );
  }, [aviso, show]);

  const tabs: AppTab[] = [
    { key: 'index', href: BASE, label: 'Cola', icon: 'file-tray-outline' },
    { key: 'llegadas', href: `${BASE}/llegadas`, label: 'Llegadas', icon: 'enter-outline' },
    { key: 'esperados', href: `${BASE}/esperados`, label: 'Esperados', icon: 'calendar-outline' },
    { key: 'robot', href: `${BASE}/robot`, label: 'Robot', icon: 'hardware-chip-outline' },
  ];
  return (
    <AppTabsLayout
      tabs={tabs}
      toast={toast}
      banner={
        feed.sinConexion && feed.eventos.length > 0 ? (
          <OfflineBanner onRetry={() => void feed.recargar()} />
        ) : null
      }
    />
  );
}

/** Guard + tabs of the concierge app. Anyone else is sent where their role belongs. */
export function ConciergeLayout() {
  const { estado, usuario, reintentar } = useSession();
  if (estado === 'cargando') {
    return (
      <View
        accessible
        role="progressbar"
        accessibilityLabel="Cargando"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (estado === 'sin_conexion') {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors.bg }}
      >
        <ErrorState
          title="Sin conexión"
          description="No pudimos abrir tu sesión. Revisa tu red e intenta de nuevo."
          onRetry={reintentar}
        />
      </View>
    );
  }
  if (estado === 'anonimo' || !usuario) return <Redirect href="/entrar" />;
  if (usuario.rol !== 'CONCIERGE') return <Redirect href={rutaPorRol(usuario.rol)} />;
  return (
    <FeedProvider>
      <Pestanas />
    </FeedProvider>
  );
}
