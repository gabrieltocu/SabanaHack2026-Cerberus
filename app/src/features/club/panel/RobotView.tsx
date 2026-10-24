import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import type { EstadoRobot, RobotEstado } from '../../../club/types';
import {
  ErrorState,
  Icon,
  Skeleton,
  Text,
  colors,
  space,
  type IconName,
} from '../../../design-system';
import { haceCuanto, horaBogota } from '../eventos';
import { useSession } from '../session';
import { RobotTelemetryCard, useTelemetriaRobot } from '../concierge/RobotTelemetry';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { SONDEO_MS } from './format';
import { Panel } from './ui';

const ESTADOS: Record<
  EstadoRobot | 'fuera',
  { titulo: string; icono: IconName; fg: string; bg: string }
> = {
  ok: {
    titulo: 'Operativo',
    icono: 'checkmark-circle-outline',
    fg: colors.success,
    bg: colors.successBg,
  },
  acompanando: {
    titulo: 'Acompañando a un visitante',
    icono: 'walk-outline',
    fg: colors.info,
    bg: colors.infoBg,
  },
  sin_servicio: {
    titulo: 'Sin servicio',
    icono: 'warning-outline',
    fg: colors.danger,
    bg: colors.dangerBg,
  },
  fuera: {
    titulo: 'Sin conexión',
    icono: 'cloud-offline-outline',
    fg: colors.danger,
    bg: colors.dangerBg,
  },
};

const clave = (r: RobotEstado): EstadoRobot | 'fuera' =>
  r.en_linea ? (r.estado ?? 'ok') : 'fuera';

export function RobotView() {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const telemetria = useTelemetriaRobot();
  const cargar = useCallback(() => client.robotEstado(), [client]);
  const { datos, error, recargar } = useRecurso(cargar, { activo: activa, cadaMs: SONDEO_MS });
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activa) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activa]);

  if (datos === null) {
    return error ? (
      <ErrorState
        title="No pudimos consultar al robot"
        description={error.detalle}
        onRetry={() => void recargar()}
      />
    ) : (
      <Skeleton height={200} label="Cargando estado del robot" />
    );
  }
  const e = ESTADOS[clave(datos)];
  const latido = datos.ultimo_latido ? Date.parse(datos.ultimo_latido) : NaN;
  return (
    <View style={{ gap: space[4] }}>
      <Panel titulo="Estado actual">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <View
            style={{
              width: 72,
              height: 72,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: e.bg,
            }}
          >
            <Icon name={e.icono} size={34} color={e.fg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" level={3}>
              {e.titulo}
            </Text>
            {datos.detalle ? <Text tone="muted">{datos.detalle}</Text> : null}
            <Text variant="caption" tone="muted">
              {Number.isNaN(latido)
                ? 'Aún no ha enviado latidos'
                : `Último latido: ${horaBogota(datos.ultimo_latido!)} · ${haceCuanto(latido, ahora)}`}
            </Text>
          </View>
        </View>
      </Panel>
      <RobotTelemetryCard
        datos={telemetria.datos}
        error={!!telemetria.error}
        cargando={telemetria.cargando}
        sinConexion={telemetria.sinConexion}
        ahora={ahora}
      />
    </View>
  );
}
