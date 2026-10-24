// Small building blocks shared by the panel views.
import type { ReactNode } from 'react';
import { View, useWindowDimensions, type ViewStyle } from 'react-native';

import type { ClubApiError } from '../client';
import { initialsOf } from '../../../design-system/components/Avatar';

import {
  ErrorState,
  Icon,
  Logo,
  OfflineBanner,
  Skeleton,
  Text,
  Touchable,
  colors,
  fonts,
  space,
  type IconName,
} from '../../../design-system';

import { ESCRITORIO_MIN } from './format';

/** Black 1 px line of cards, header rules and the sidebar. */
export const LINEA = colors.border;
/** Hairline between table rows: the data stays louder than the grid. */
export const LINEA_SUAVE = '#D9D4C8';

export const tarjeta: ViewStyle = {
  backgroundColor: colors.paper,
  borderWidth: 1,
  borderColor: LINEA,
};

/** Title of a card or block: Geist semibold (Bodoni is for names and greetings only). */
export function Titulo({ children }: { children: string }) {
  return (
    <Text
      role="heading"
      aria-level={2}
      style={{ fontFamily: fonts.bodyStrong, fontSize: 16, lineHeight: 22 }}
    >
      {children}
    </Text>
  );
}

/** Flat card with a black line, a title, an optional note under it and an action on the right. */
export function Panel({
  titulo,
  nota,
  accion,
  children,
  style,
}: {
  titulo: string;
  nota?: string;
  accion?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[tarjeta, { padding: 20, gap: space[4] }, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: space[3],
        }}
      >
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Titulo>{titulo}</Titulo>
          {nota ? (
            <Text variant="caption" tone="muted">
              {nota}
            </Text>
          ) : null}
        </View>
        {accion}
      </View>
      {children}
    </View>
  );
}

/** Square initials box with a black line: the panel shows no faces and no circles. */
export function Iniciales({ nombre, size = 40 }: { nombre?: string | null; size?: number }) {
  const letras = nombre ? initialsOf(nombre) : '';
  return (
    <View
      aria-hidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.sage,
        borderWidth: 1,
        borderColor: LINEA,
      }}
    >
      {letras ? (
        <Text
          style={{
            fontFamily: fonts.bodyStrong,
            fontSize: Math.round(size * 0.36),
            lineHeight: Math.round(size * 0.5),
          }}
        >
          {letras}
        </Text>
      ) : (
        <Icon name="person-outline" size={Math.round(size * 0.5)} color={colors.ink} />
      )}
    </View>
  );
}

/** Seal and wordmark with "Administración" under it. */
export function Logotipo() {
  return (
    <View style={{ gap: space[1] }}>
      <Logo size={32} wordmark="row" />
      <Text variant="caption" tone="muted">
        Administración
      </Text>
    </View>
  );
}

/** Square icon button of the header, with an optional count in a black square. */
export function BotonIcono({
  icono,
  label,
  onPress,
  contador,
}: {
  icono: IconName;
  label: string;
  onPress: () => void;
  contador?: number;
}) {
  return (
    <Touchable
      label={contador ? `${label}, ${contador} abiertas` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.sage : 'transparent',
      })}
    >
      <Icon name={icono} size={22} color={colors.ink} />
      {contador ? (
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.forest,
          }}
        >
          <Text
            style={{
              color: colors.goldOnDark,
              fontSize: 11,
              lineHeight: 14,
              fontFamily: fonts.bodyStrong,
            }}
          >
            {contador > 99 ? '99+' : contador}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

/** Column header of the desktop tables. */
export function CabeceraTabla({ cols }: { cols: readonly { t: string; flex: number }[] }) {
  return (
    <View
      aria-hidden
      style={{
        flexDirection: 'row',
        gap: space[4],
        paddingBottom: space[2],
        borderBottomWidth: 1,
        borderBottomColor: LINEA,
      }}
    >
      {cols.map((c) => (
        <Text key={c.t} variant="label" style={{ flex: c.flex }}>
          {c.t}
        </Text>
      ))}
    </View>
  );
}

/** Row separator and spacing shared by the tables. */
export const filaTabla = (ultima: boolean): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: space[4],
  paddingVertical: space[3],
  borderBottomWidth: ultima ? 0 : 1,
  borderBottomColor: LINEA_SUAVE,
});

export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[6] }}>
      <Icon name="file-tray-outline" size={28} color={colors.muted} />
      <Text variant="label">{titulo}</Text>
      {detalle ? (
        <Text variant="caption" tone="muted" align="center">
          {detalle}
        </Text>
      ) : null}
      {accion}
    </View>
  );
}

/** A loaded resource (see `useRecurso`) with its skeleton, error with retry and offline notice. */
export function Cargable<T>({
  recurso,
  etiqueta,
  errorTitulo,
  alto = 240,
  children,
}: {
  recurso: { datos: T | null; error: ClubApiError | null; recargar: () => Promise<void> };
  etiqueta: string;
  errorTitulo: string;
  alto?: number;
  children: (datos: T) => ReactNode;
}) {
  const { datos, error, recargar } = recurso;
  if (datos === null) {
    return error ? (
      <ErrorState title={errorTitulo} description={error.detalle} onRetry={() => void recargar()} />
    ) : (
      <Skeleton height={alto} label={etiqueta} />
    );
  }
  return (
    <>
      {error?.code === 'sin_conexion' ? <OfflineBanner onRetry={() => void recargar()} /> : null}
      {children(datos)}
    </>
  );
}

export const useEscritorio = () => useWindowDimensions().width >= ESCRITORIO_MIN;

export interface Col<T> {
  t: string;
  flex: number;
  ver: (x: T) => ReactNode;
}

/**
 * Table on wide windows (header + aligned cells); on phones each row is whatever `movil` draws.
 * With `onPress` the whole row is one button; `debajo` adds content under a row (details).
 */
export function Tabla<T>({
  filas,
  cols,
  escritorio,
  id,
  movil,
  onPress,
  etiqueta,
  debajo,
}: {
  filas: readonly T[];
  cols: readonly Col<T>[];
  escritorio: boolean;
  id: (x: T) => string;
  movil: (x: T) => ReactNode;
  onPress?: (x: T) => void;
  etiqueta?: (x: T) => string;
  debajo?: (x: T) => ReactNode;
}) {
  return (
    <View>
      {escritorio ? <CabeceraTabla cols={cols} /> : null}
      {filas.map((x, i) => {
        const ultima = i === filas.length - 1;
        const contenido = escritorio
          ? cols.map((c) => {
              const celda = c.ver(x);
              return (
                <View key={c.t} style={{ flex: c.flex }}>
                  {typeof celda === 'string' ? (
                    <Text variant="label" tone="muted" numberOfLines={1}>
                      {celda}
                    </Text>
                  ) : (
                    celda
                  )}
                </View>
              );
            })
          : movil(x);
        const extra = debajo?.(x);
        return (
          <View key={id(x)}>
            {onPress ? (
              <Touchable
                label={etiqueta?.(x) ?? id(x)}
                onPress={() => onPress(x)}
                style={({ pressed }) => ({
                  ...filaTabla(ultima && !extra),
                  backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                })}
              >
                {contenido}
              </Touchable>
            ) : (
              <View style={filaTabla(ultima && !extra)}>{contenido}</View>
            )}
            {extra}
          </View>
        );
      })}
    </View>
  );
}

/** Large figure over a small label: the hierarchy comes from type, not from a box. */
export function Cifra({
  valor,
  etiqueta,
  nota,
}: {
  valor: string;
  etiqueta: string;
  nota?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${etiqueta}: ${valor}${nota ? `. ${nota}` : ''}`}
      style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}
    >
      <Text variant="caption" tone="muted">
        {etiqueta}
      </Text>
      <Text
        style={{
          fontFamily: fonts.bodyStrong,
          fontSize: 28,
          lineHeight: 34,
          fontVariant: ['tabular-nums'],
        }}
      >
        {valor}
      </Text>
      {nota ? (
        <Text variant="caption" tone="muted">
          {nota}
        </Text>
      ) : null}
    </View>
  );
}

/** Heading of a section that has no card: serif title, optional note, hairline above. */
export function Bloque({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space[3], paddingTop: space[4], borderTopWidth: 1, borderTopColor: LINEA }}>
      <View style={{ gap: 2 }}>
        <Titulo>{titulo}</Titulo>
        {nota ? (
          <Text variant="caption" tone="muted">
            {nota}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Quiet text button ("Cargar datos iniciales"): underlined, no fill. */
export function EnlaceTexto({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Touchable
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}
    >
      <Text
        variant="label"
        tone="muted"
        style={{ textDecorationLine: 'underline', opacity: disabled ? 0.5 : 1 }}
      >
        {label}
      </Text>
    </Touchable>
  );
}

/** Initials circle with a name and one line under it. */
export function Quien({
  nombre,
  sub,
  grow,
  icono,
}: {
  nombre: string;
  sub?: string | null;
  grow?: boolean;
  /** A glyph instead of initials (robots). */
  icono?: IconName;
}) {
  return (
    <View
      style={{
        flex: grow ? 1 : undefined,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      {icono ? (
        <View
          aria-hidden
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.sage,
            borderWidth: 1,
            borderColor: LINEA,
          }}
        >
          <Icon name={icono} size={20} color={colors.ink} />
        </View>
      ) : (
        <Iniciales nombre={nombre} />
      )}
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {nombre}
        </Text>
        {sub ? (
          <Text variant="caption" tone="muted" numberOfLines={3}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
