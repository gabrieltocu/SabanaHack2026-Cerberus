import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Button,
  ErrorState,
  Icon,
  MobileHeader,
  OfflineBanner,
  Skeleton,
  Text,
  colors,
  space,
} from '../../../design-system';
import { haceCuanto, horaBogota } from '../eventos';
import { useSession } from '../session';
import { usePantallaActiva } from '../ui/visible';
import { LISTA } from './AlertasScreen';

import { RobotSesionCard, useRobotEstado, useSesionRobot } from './RobotStatus';
import { RobotTelemetryCard, useTelemetriaRobot } from './RobotTelemetry';

export function RobotScreen() {
  const { logout } = useSession();
  const activa = usePantallaActiva();
  const { datos, error, cargando, recargar, sinConexion } = useRobotEstado();
  const sesion = useSesionRobot();
  const telemetria = useTelemetriaRobot();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activa) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activa]);

  const enLinea = datos?.en_linea === true;
  const latido = datos?.ultimo_latido ? Date.parse(datos.ultimo_latido) : NaN;
  const disponible = enLinea && datos?.estado !== 'acompanando' && datos?.estado !== 'sin_servicio';
  const estado = !enLinea
    ? 'Sin conexión'
    : datos?.estado === 'acompanando'
      ? 'Acompañando'
      : datos?.estado === 'sin_servicio'
        ? 'Sin servicio'
        : 'En línea';
  return (
    <View role="main" style={{ flex: 1, backgroundColor: colors.bg }}>
      <MobileHeader title="Robot" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space[4], gap: space[4], ...LISTA }}
      >
        {sinConexion && datos !== null ? <OfflineBanner onRetry={() => void recargar()} /> : null}
        {cargando ? (
          <Skeleton height={220} label="Cargando estado del robot" />
        ) : error && datos === null ? (
          <ErrorState
            title={sinConexion ? 'Sin conexión' : 'No pudimos consultar al robot'}
            description={error.detalle}
            onRetry={() => void recargar()}
          />
        ) : (
          <View
            accessible
            accessibilityLabel={`Robot ${estado.toLowerCase()}`}
            style={{
              alignItems: 'center',
              gap: space[3],
              paddingVertical: space[6],
              paddingHorizontal: space[4],
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Icon
              name={enLinea ? 'hardware-chip-outline' : 'cloud-offline-outline'}
              size={40}
              color={disponible ? colors.gold : colors.ink}
            />
            <Text variant="h2" align="center">
              {estado}
            </Text>
            <Text tone="muted" align="center">
              {Number.isNaN(latido)
                ? 'Aún no ha enviado latidos'
                : `Latido del cerebro: ${horaBogota(datos!.ultimo_latido!)} · ${haceCuanto(latido, ahora)}`}
            </Text>
            {datos?.detalle ? (
              <Text variant="caption" tone="muted" align="center">
                {datos.detalle}
              </Text>
            ) : null}
          </View>
        )}

        <RobotSesionCard
          datos={sesion.datos}
          error={!!sesion.error}
          cargando={sesion.cargando}
          sinConexion={sesion.sinConexion}
          ahora={ahora}
        />

        <RobotTelemetryCard
          datos={telemetria.datos}
          error={!!telemetria.error}
          cargando={telemetria.cargando}
          sinConexion={telemetria.sinConexion}
          ahora={ahora}
        />

        <Button label="Cerrar sesión" variant="secondary" fullWidth onPress={() => void logout()} />
      </ScrollView>
    </View>
  );
}
