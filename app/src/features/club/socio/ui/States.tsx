import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Banner,
  Button,
  ErrorState,
  Icon,
  OfflineBanner,
  Skeleton,
  Text,
  colors,
  space,
  type IconName,
} from '../../../../design-system';
import type { ErrorInfo } from '../errors';

/** Placeholder rows while a list loads. */
export function Cargando({ filas = 3, label = 'Cargando' }: { filas?: number; label?: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ gap: space[3] }}
    >
      {Array.from({ length: filas }, (_, i) => (
        <View
          key={i}
          style={{
            gap: space[2],
            padding: space[4],
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Skeleton width="55%" height={18} />
          <Skeleton width="80%" height={14} />
        </View>
      ))}
    </View>
  );
}

/** Failure with a way forward: offline, expired session or a generic retry. */
export function Fallo({
  error,
  onRetry,
  retrying,
}: {
  error: ErrorInfo;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const router = useRouter();
  if (error.sesion) {
    return (
      <ErrorState
        title="Tu sesión venció"
        description="Entra de nuevo para continuar."
        retryLabel="Entrar de nuevo"
        onRetry={() => router.replace('/entrar')}
      />
    );
  }
  return (
    <ErrorState
      title={error.sinConexion ? 'Sin conexión' : 'No pudimos cargar'}
      description={error.detalle}
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}

/**
 * Loading / failure / stale-warning / empty wrapper for a list that comes from `useSocio()`.
 * `children` only runs with a non-empty list.
 */
export function ListaCarga<T extends readonly unknown[]>({
  datos,
  cargando,
  error,
  onRetry,
  vacio,
  filas,
  children,
}: {
  datos: T | null;
  cargando: boolean;
  error: ErrorInfo | null;
  onRetry: () => void;
  vacio: ReactNode;
  filas?: number;
  children: (datos: T) => ReactNode;
}) {
  if (!datos) {
    return error ? (
      <Fallo error={error} onRetry={onRetry} retrying={cargando} />
    ) : (
      <Cargando filas={filas} />
    );
  }
  return (
    <View style={{ gap: space[3] }}>
      {error?.sinConexion ? <OfflineBanner onRetry={onRetry} /> : null}
      {error && !error.sinConexion ? <Banner kind="error">{error.detalle}</Banner> : null}
      {datos.length ? children(datos) : vacio}
    </View>
  );
}

/** Quiet empty list: one sentence and, optionally, the next step. */
export function Vacio({
  texto,
  icon = 'people-outline',
  accion,
  onAccion,
}: {
  texto: string;
  icon?: IconName;
  accion?: string;
  onAccion?: () => void;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[6],
        paddingHorizontal: space[4],
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.borderStrong,
      }}
    >
      <Icon name={icon} size={30} color={colors.textMuted} />
      <Text tone="muted" align="center">
        {texto}
      </Text>
      {accion && onAccion ? (
        <Button label={accion} variant="secondary" size="sm" onPress={onAccion} />
      ) : null}
    </View>
  );
}
