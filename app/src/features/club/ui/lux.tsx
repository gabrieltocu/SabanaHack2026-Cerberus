// Building blocks of the N Club Luxury screens of the team apps: one featured block per screen
// (gold line) and clean lists framed by a black line. Straight corners, no shadows.
import { Children, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Icon, Text, colors, space, type IconName } from '../../../design-system';

/** The one thing to do now. Gold line; nothing else on the screen gets a gold frame. */
export function Destacado({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: colors.gold,
          backgroundColor: colors.surface,
          padding: space[4],
          gap: space[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Clean list: a black frame and a thin line between rows. */
export function Lista({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {Children.toArray(children).map((hijo, i) => (
        <View key={i} style={i ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
          {hijo}
        </View>
      ))}
    </View>
  );
}

/** Row of a `Lista`: leading content, text and an optional action on the right. */
export function Fila({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 64,
        paddingVertical: space[3],
        paddingHorizontal: space[3],
      }}
    >
      {children}
    </View>
  );
}

/** Line icon in gold for list rows (decorative). */
export function IconoDorado({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <View aria-hidden style={{ width: size + 8, alignItems: 'center' }}>
      <Icon name={name} size={size} color={colors.gold} />
    </View>
  );
}

/** Title and a short muted line, the text of a row. */
export function Textos({ titulo, detalle }: { titulo: string; detalle?: string | null }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="label" numberOfLines={2} style={{ fontSize: 16, lineHeight: 22 }}>
        {titulo}
      </Text>
      {detalle ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {detalle}
        </Text>
      ) : null}
    </View>
  );
}

/** Thin gold progress line. `valor` is 0..1. */
export function Progreso({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, valor)) * 100);
  return (
    <View
      accessible
      role="progressbar"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 6, backgroundColor: colors.surfaceMuted }}
    >
      <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.gold }} />
    </View>
  );
}
