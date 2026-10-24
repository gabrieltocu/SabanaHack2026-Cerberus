import { Redirect, Slot } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { ErrorState, colors, space } from '../../../design-system';
import { rutaPorRol, useSession } from '../session';

/** Guard of the web panel: ADMIN and CONCIERGE enter; anyone else goes where their role belongs. */
export function PanelLayout() {
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
  const rol = usuario.rol as string; // 'ADMIN' joins the Rol type in the auth module.
  if (rol !== 'ADMIN' && rol !== 'CONCIERGE') return <Redirect href={rutaPorRol(usuario.rol)} />;
  return <Slot />;
}
