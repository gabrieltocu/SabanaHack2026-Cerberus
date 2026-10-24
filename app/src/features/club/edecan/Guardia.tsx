import { Redirect } from 'expo-router';
import { createContext, useContext, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ErrorState, TAB_BAR_HEIGHT, colors, space, useToast } from '../../../design-system';
import type { UsuarioPublico } from '../client';
import { rutaPorRol, useSession } from '../session';

type Avisar = ReturnType<typeof useToast>['show'];
const AvisarCtx = createContext<Avisar>(() => undefined);

/** Shows a toast above the tab bar (success by default is "info"; pass 'error' for failures). */
export const useAvisar = () => useContext(AvisarCtx);

function ConToast({ children }: { children: (toast: ReactNode) => ReactNode }) {
  const { show, toast } = useToast({ bottomOffset: TAB_BAR_HEIGHT });
  return <AvisarCtx.Provider value={show}>{children(toast)}</AvisarCtx.Provider>;
}

/**
 * Guard of a role's app (same contract as the concierge's): waits for the session, offers a
 * retry offline, sends anonymous visitors to the login and other roles to their own home.
 * `children` receives the toast node to hand to `AppTabsLayout`.
 */
export function Guardia({
  rol,
  children,
}: {
  rol: UsuarioPublico['rol'];
  children: (toast: ReactNode) => ReactNode;
}) {
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
  if (usuario.rol !== rol) return <Redirect href={rutaPorRol(usuario.rol)} />;
  return <ConToast>{children}</ConToast>;
}
