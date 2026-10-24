// Loads the signed-in socio and sends anyone else to the sign-in screen.
// ponytail: uses club.me() directly. When the shared session provider (`useSession()` in
// src/features/club/session.tsx) lands, replace this gate with it and keep SocioProvider.
import { Redirect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';

import { Skeleton, Text, colors } from '../../../design-system';
import { club, type ClubClient } from '../client';
import { useCarga } from './hooks';
import { SocioProvider } from './SocioContext';
import { Fallo } from './ui/States';
import { View } from 'react-native';

export function SocioGate({
  client = club,
  children,
}: {
  client?: ClubClient;
  children: ReactNode;
}) {
  const load = useCallback(() => client.me(), [client]);
  const { carga, recargar } = useCarga(load);

  if (carga.estado === 'cargando') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando"
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: 24,
          gap: 12,
          justifyContent: 'center',
        }}
      >
        <Skeleton width="40%" height={28} />
        <Skeleton height={140} />
        <Text tone="muted">Cargando…</Text>
      </View>
    );
  }
  if (carga.estado === 'error') {
    if (carga.error.sesion) return <Redirect href="/entrar" />;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>
        <Fallo error={carga.error} onRetry={() => void recargar()} />
      </View>
    );
  }
  const usuario = carga.datos;
  // A concierge who lands here goes to their own area.
  if (usuario.rol !== 'SOCIO') return <Redirect href="/app/concierge" />;
  return (
    <SocioProvider client={client} usuario={usuario}>
      {children}
    </SocioProvider>
  );
}
