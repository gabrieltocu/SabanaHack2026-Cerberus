import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Icon,
  Text,
  Touchable,
  colors,
  fonts,
  space,
  type IconName,
} from '../../../../design-system';

/** A run of rows inside one black-lined box: grouping by line, not by colour or shadow. */
export function Grupo({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {children}
    </View>
  );
}

/**
 * One row: gold icon, title, quiet detail line and an optional trailing node. With `onPress` it is a
 * link with a chevron; without, plain information. `primero` drops the top line.
 */
export function Fila({
  icono,
  titulo,
  detalle,
  derecha,
  izquierda,
  onPress,
  primero = false,
  etiqueta,
}: {
  icono?: IconName;
  titulo: string;
  detalle?: string;
  derecha?: ReactNode;
  /** Replaces the icon (an avatar, for people). */
  izquierda?: ReactNode;
  onPress?: () => void;
  primero?: boolean;
  etiqueta?: string;
}) {
  const cuerpo = (
    <>
      {izquierda ?? (icono ? <Icon name={icono} size={22} color={colors.gold} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 }}>{titulo}</Text>
        {detalle ? (
          <Text variant="caption" tone="muted">
            {detalle}
          </Text>
        ) : null}
      </View>
      {derecha}
      {onPress ? <Icon name="chevron-forward-outline" size={18} color={colors.text} /> : null}
    </>
  );
  const estilo = {
    minHeight: 60,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderTopWidth: primero ? 0 : 1,
    borderTopColor: colors.border,
  };
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={etiqueta ?? [titulo, detalle].filter(Boolean).join(', ')}
        style={estilo}
      >
        {cuerpo}
      </View>
    );
  }
  return (
    <Touchable
      role="link"
      label={etiqueta ?? [titulo, detalle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({
        ...estilo,
        backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
      })}
    >
      {cuerpo}
    </Touchable>
  );
}
