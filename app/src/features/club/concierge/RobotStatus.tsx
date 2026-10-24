import { useCallback } from 'react';
import { View } from 'react-native';

import { Icon, Text, colors, space } from '../../../design-system';
import { horaBogota, haceCuanto } from '../eventos';
import type { EstadoSesionRobot as DatosSesionRobot, FaseSesionRobot } from '../client';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';

export const ROBOT_SONDEO_MS = 15000;
export const SESION_ROBOT_SONDEO_MS = 1200;

export type EstadoSesionRobot = DatosSesionRobot;

const FASES: Record<FaseSesionRobot, string> = {
  esperando: 'Esperando',
  identificando: 'Identificando',
  reintento: 'Reintentando identificación',
  qr: 'Leyendo QR',
  confirmacion: 'Esperando confirmación',
  orientando: 'Dando indicaciones',
  acompanando: 'Acompañando',
  destino: 'En el destino',
  recepcion: 'En recepción',
  salida: 'Registrando salida',
};

const metodoTexto = (metodo: string) =>
  ({ rostro: 'Rostro', cara: 'Rostro', qr: 'QR', documento: 'Documento' })[metodo.toLowerCase()] ??
  metodo.charAt(0).toUpperCase() + metodo.slice(1);

export function useSesionRobot() {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const cargar = useCallback(() => client.robotSesion(), [client]);
  return useRecurso(cargar, { activo: activa, cadaMs: SESION_ROBOT_SONDEO_MS });
}

export function RobotSesionCard({
  datos,
  error = false,
  cargando = false,
  sinConexion = false,
  ahora,
}: {
  datos: EstadoSesionRobot | null;
  error?: boolean;
  cargando?: boolean;
  sinConexion?: boolean;
  ahora: number;
}) {
  const sesion = datos?.sesion ?? null;
  const antigua = datos?.desactualizada === true || error;
  const actualizado = sesion?.actualizado_at;
  const ultima = actualizado
    ? `Actualizado ${horaBogota(actualizado)} · ${haceCuanto(Date.parse(actualizado), ahora)}`
    : null;
  const confianza =
    typeof sesion?.confianza === 'number'
      ? `${Math.round(sesion.confianza <= 1 ? sesion.confianza * 100 : sesion.confianza)} %`
      : null;

  return (
    <View
      role="region"
      accessibilityLabel={`Sesión del robot${sesion ? `: ${FASES[sesion.fase]}` : ''}${antigua ? ', datos desactualizados' : ''}`}
      style={{
        gap: space[3],
        padding: space[4],
        borderWidth: 1,
        borderColor: antigua ? colors.border : colors.gold,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon
          name={antigua ? 'time-outline' : 'radio-outline'}
          size={20}
          color={antigua ? colors.textMuted : colors.gold}
        />
        <Text variant="label">Sesión del robot</Text>
        <Text variant="caption" tone={antigua ? 'muted' : 'warning'} style={{ marginLeft: 'auto' }}>
          {antigua ? 'DATOS DESACTUALIZADOS' : 'EN VIVO'}
        </Text>
      </View>
      {sesion ? (
        <>
          <Text variant="h3">{FASES[sesion.fase]}</Text>
          {sesion.nombre || sesion.persona_id ? (
            <Text variant="label">{sesion.nombre ?? sesion.persona_id}</Text>
          ) : null}
          {sesion.categoria || sesion.metodo || confianza ? (
            <Text variant="caption" tone="muted">
              {[sesion.categoria, sesion.metodo ? metodoTexto(sesion.metodo) : null, confianza]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {sesion.mensaje ? <Text>{sesion.mensaje}</Text> : null}
          {ultima ? (
            <Text variant="caption" tone="muted">
              {ultima}
            </Text>
          ) : null}
          {error ? (
            <Text variant="caption" tone="danger">
              {sinConexion
                ? 'Sin conexión; se muestra la última sesión recibida.'
                : 'No se pudo actualizar; se muestra la última sesión recibida.'}
            </Text>
          ) : null}
        </>
      ) : (
        <Text tone="muted">
          {cargando
            ? 'Consultando la sesión del robot…'
            : error
              ? sinConexion
                ? 'Sin conexión con la sesión del robot.'
                : 'No se pudo consultar la sesión del robot.'
              : antigua
                ? 'No hay datos recientes de sesión.'
                : 'Sin sesión activa'}
        </Text>
      )}
    </View>
  );
}

export function useRobotEstado() {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const cargar = useCallback(() => client.robotEstado(), [client]);
  return useRecurso(cargar, { activo: activa, cadaMs: ROBOT_SONDEO_MS });
}

export function RobotStatus() {
  const { datos, error } = useRobotEstado();
  const mensaje = error
    ? 'No se pudo actualizar el estado del robot'
    : !datos
      ? null
      : !datos.en_linea
        ? 'Robot sin conexión'
        : datos.estado === 'acompanando'
          ? `Entrada sin robot: ${datos.detalle?.replace(/[.\s]+$/, '') || 'acompañando una visita'}. Cubre la entrada.`
          : datos.estado === 'sin_servicio'
            ? `Robot sin servicio: ${datos.detalle || 'cambio de batería'}`
            : null;
  if (!mensaje) return null;
  return (
    <View
      role="status"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: space[4],
        paddingVertical: space[2],
        backgroundColor: colors.surfaceSoft,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Icon name="alert-circle-outline" size={20} color={colors.ink} />
      <Text variant="caption" style={{ flex: 1, color: colors.ink }}>
        {mensaje}
      </Text>
    </View>
  );
}
