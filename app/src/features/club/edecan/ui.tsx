// Small visual pieces shared by the edecán and personal apps.
import { useEffect, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';

import { Icon, Text, Touchable, colors, fonts, space, type IconName } from '../../../design-system';
import type { ClubClient } from '../client';
import { etiquetaAsistencia } from './model';
import { coloresAvatar, iniciales, type Categoria } from '../categorias';

export const HAIRLINE = colors.border;

/** Photo of a person if the API has one, else initials on the category colour. */
export function FotoPersona({
  client,
  invitacionId,
  nombre,
  categoria,
  size = 72,
}: {
  client: ClubClient;
  invitacionId?: string | null;
  nombre: string;
  categoria?: Categoria;
  size?: number;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!invitacionId) return;
    let vivo = true;
    let actual: string | null = null;
    client
      .foto(`/invitaciones/${encodeURIComponent(invitacionId)}/foto`)
      .then((u) => {
        actual = u;
        if (vivo) setUri(u);
      })
      .catch(() => undefined); // no photo: the initials stay
    return () => {
      vivo = false;
      if (actual?.startsWith('blob:') && typeof URL.revokeObjectURL === 'function')
        URL.revokeObjectURL(actual);
    };
  }, [client, invitacionId]);

  const c = coloresAvatar(categoria);
  const caja = {
    width: size,
    height: size,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.bg,
  };
  if (uri)
    return (
      <View style={caja}>
        <Image
          source={{ uri }}
          accessibilityLabel={`Foto de ${nombre}`}
          style={{ width: size, height: size }}
        />
      </View>
    );
  return (
    <View aria-hidden accessible={false} style={caja}>
      <Text
        style={{
          color: c.fg,
          fontFamily: fonts.bodyStrong,
          fontSize: size * 0.36,
          lineHeight: size * 0.5,
        }}
      >
        {iniciales(nombre)}
      </Text>
    </View>
  );
}

/** Small-caps heading of a group inside a screen. */
export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="eyebrow" tone="muted" role="heading" style={{ textTransform: 'uppercase' }}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

/** Label above a value, for the facts of a visit. */
export function Dato({
  etiqueta,
  valor,
  icon,
}: {
  etiqueta: string;
  valor: string;
  icon?: IconName;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      {icon ? <Icon name={icon} size={20} color={colors.gold} /> : null}
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
        <Text variant="caption" tone="muted">
          {etiqueta}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 22 }}>{valor}</Text>
      </View>
    </View>
  );
}

export interface Eleccion<T extends string> {
  clave: T;
  etiqueta: string;
}

/** Wrapping chips where exactly one is selected (radio group). */
export function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: readonly Eleccion<T>[];
  valor: T | null;
  onCambio: (v: T) => void;
}) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label">{etiqueta}</Text>
      <View
        role="radiogroup"
        accessibilityLabel={etiqueta}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
      >
        {opciones.map((o) => {
          const activa = o.clave === valor;
          return (
            <Touchable
              key={o.clave}
              role="radio"
              label={o.etiqueta}
              accessibilityState={{ checked: activa }}
              onPress={() => onCambio(o.clave)}
              style={({ pressed }) => ({
                minHeight: 44,
                paddingHorizontal: space[4],
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: activa
                  ? colors.primary
                  : pressed
                    ? colors.surfaceSoft
                    : colors.surface,
              })}
            >
              <Text
                variant="label"
                tone={activa ? 'onPrimary' : 'default'}
                style={{ fontSize: 15 }}
              >
                {o.etiqueta}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

/** Assistance needs and drink preferences, highlighted: what the edecán must not ask again. */
export function TenPresente({
  asistencia,
  bebidas,
}: {
  asistencia: readonly string[];
  bebidas: readonly string[];
}) {
  if (asistencia.length === 0 && bebidas.length === 0) return null;
  return (
    <View
      role="status"
      style={{ gap: space[2], padding: space[4], backgroundColor: colors.surfaceSoft }}
    >
      <Text variant="label">Ten presente</Text>
      {asistencia.map((a) => (
        <View key={a} style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <Icon name="accessibility-outline" size={20} color={colors.ink} />
          <Text style={{ fontSize: 16 }}>{etiquetaAsistencia(a)}</Text>
        </View>
      ))}
      {bebidas.length ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <Icon name="cafe-outline" size={20} color={colors.ink} />
          <Text style={{ fontSize: 16 }}>Prefiere {bebidas.join(', ')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Quiet text action (no box) for secondary choices inside a row. */
export function AccionTexto({
  label,
  onPress,
  accessibilityLabel,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  danger?: boolean;
}) {
  return (
    <Touchable
      label={accessibilityLabel ?? label}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingRight: space[3] }}
    >
      <Text variant="label" style={{ color: danger ? colors.danger : colors.ink, fontSize: 15 }}>
        {label}
      </Text>
    </Touchable>
  );
}
