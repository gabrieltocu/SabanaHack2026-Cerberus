import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { TelemetriaVista } from '../../../club/telemetria';
import { Button, Card, Icon, Text, colors, space } from '../../../design-system';
import type { EstadoTelemetriaRobot } from '../client';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';

export type { EstadoTelemetriaRobot };

export const TELEMETRIA_ROBOT_SONDEO_MS = 1200;
const LIMITE_DESACTUALIZADO_MS = 15_000;
const FSM: Record<number, string> = {
  2: 'Estable',
  3: 'Controlador en marcha',
  4: 'Modo seguro',
};
const EVENTOS_ALERTA = new Set(['obstaculo', 'lidar_perdido', 'fallo', 'caida', 'contacto']);
const FECHA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const origenTexto = (origen: TelemetriaVista['origen']) =>
  origen === 'real' ? 'Robot físico' : 'Simulación';
const fechaTexto = (value: string) => {
  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? value : FECHA_BOGOTA.format(fecha);
};

/** Polls the authenticated feed only while the containing screen is active. */
export function useTelemetriaRobot() {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const cargar = useCallback(() => client.robotTelemetria(), [client]);
  return useRecurso(cargar, { activo: activa, cadaMs: TELEMETRIA_ROBOT_SONDEO_MS });
}

export function RobotTelemetryCard({
  datos,
  error = false,
  cargando = false,
  sinConexion = false,
  ahora,
}: {
  datos: EstadoTelemetriaRobot | null;
  error?: boolean;
  cargando?: boolean;
  sinConexion?: boolean;
  ahora: number;
}) {
  const [limite, setLimite] = useState(8);
  const estado = datos?.estado ?? null;
  const recibido = estado?.recibido_at ? Date.parse(estado.recibido_at) : NaN;
  const vencida =
    datos?.desactualizada === true ||
    error ||
    (estado !== null &&
      (!Number.isFinite(recibido) || ahora - recibido > LIMITE_DESACTUALIZADO_MS));
  const fsm = estado?.datos?.fsm;
  const descripcion =
    typeof fsm === 'number' ? (FSM[fsm] ?? `Estado ${fsm}`) : estado?.datos?.sistema_txt;
  const eventos = datos?.eventos ?? [];

  return (
    <Card accessibilityRole="region" accessibilityLabel="Juan, actividad del robot">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon name="hardware-chip-outline" size={20} color={colors.ink} />
        <Text variant="label">Juan · actividad</Text>
      </View>

      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {sinConexion
            ? 'Sin conexión. Revisa la red para actualizar la telemetría.'
            : 'No se pudo actualizar la telemetría. Revisa la conexión e intenta de nuevo.'}
        </Text>
      ) : null}
      {vencida && !error ? (
        <Text variant="caption" tone="warning" accessibilityRole="status">
          Telemetría desactualizada. Verifica el robot antes de actuar.
        </Text>
      ) : null}

      {estado ? (
        <View style={{ gap: space[2] }}>
          <Text variant="h3">{descripcion ?? 'Telemetría recibida'}</Text>
          <Text variant="caption" tone="muted">
            {origenTexto(estado.origen)}
            {estado.recibido_at ? ` · Recibido ${fechaTexto(estado.recibido_at)}` : ''}
          </Text>
          {typeof estado.datos?.bateria_pct === 'number' ? (
            <Text variant="body">Batería {estado.datos.bateria_pct} %</Text>
          ) : null}
          {estado.datos?.sistema_txt ? (
            <Text variant="body">{estado.datos.sistema_txt}</Text>
          ) : null}
          {estado.datos?.alertas?.length ? (
            <Text variant="caption" tone="warning">
              Alertas del controlador: {estado.datos.alertas.join(', ')}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text tone="muted">
          {error
            ? sinConexion
              ? 'Sin conexión con el robot. Revisa la red para consultar su actividad.'
              : 'No se pudo consultar la telemetría. Intenta actualizar de nuevo.'
            : cargando
              ? 'Consultando la telemetría del robot…'
              : 'Esperando telemetría del robot.'}
        </Text>
      )}

      {eventos.length ? (
        <View
          style={{
            gap: space[3],
            paddingTop: space[3],
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text variant="label">Actividad reciente</Text>
          <View accessibilityRole="list" style={{ gap: space[3] }}>
            {eventos.slice(0, limite).map((evento) => {
              const alerta = EVENTOS_ALERTA.has(evento.tipo);
              return (
                <View
                  key={evento.id}
                  accessibilityRole="listitem"
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}
                >
                  {alerta ? (
                    <Icon
                      name="alert-circle-outline"
                      size={18}
                      color={colors.warning}
                      label="Alerta del robot"
                    />
                  ) : null}
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text>{evento.mensaje}</Text>
                    <Text variant="caption" tone="muted">
                      {fechaTexto(evento.observado_at)} · {origenTexto(evento.origen)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          {eventos.length > limite ? (
            <Button
              label="Ver más eventos"
              variant="outline"
              onPress={() => setLimite((actual) => Math.min(actual + 8, 100))}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
