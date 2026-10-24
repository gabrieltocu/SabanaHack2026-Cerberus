import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text, colors, fonts, hitSlop, space } from '../../../../design-system';
import { focusRingStyle, useFocusRing } from '../../../../design-system/components/a11y';
import type { Invitacion } from '../../../../club/types';
import type { Aviso, Tono } from '../avisos';
import { cuandoFrase, nombreCompleto } from '../model';
import { Avatar } from './Avatar';
import { Etiqueta } from './Frame';

/** Section label in quiet capitals with an optional link on the right. */
export function Seccion({
  titulo,
  accion,
  onAccion,
  children,
}: {
  titulo: string;
  accion?: string;
  onAccion?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space[3],
        }}
      >
        <View role="heading" aria-level={2} style={{ flexShrink: 1 }}>
          <Etiqueta>{titulo}</Etiqueta>
        </View>
        {accion && onAccion ? (
          <Pressable
            role="link"
            accessibilityLabel={`${accion}: ${titulo}`}
            onPress={onAccion}
            hitSlop={8}
            style={{ minHeight: hitSlop.min, justifyContent: 'center' }}
          >
            <Text variant="label">{accion}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One invitation in a list: avatar, name and one line, "Hoy · 15:00 · Terraza". */
export function FilaInvitacion({
  inv,
  hoy,
  onPress,
  primero = false,
  conLugar = true,
}: {
  inv: Invitacion;
  hoy: string;
  onPress: () => void;
  primero?: boolean;
  conLugar?: boolean;
}) {
  const ring = useFocusRing();
  const linea = cuandoFrase(inv, hoy, conLugar);
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${nombreCompleto(inv)}, ${linea}`}
      onPress={onPress}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: 64,
          paddingVertical: space[3],
          paddingHorizontal: space[3],
          borderTopWidth: primero ? 0 : 1,
          borderTopColor: colors.border,
          backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      <Avatar nombre={inv.nombre} apellido={inv.apellido} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 }}
          numberOfLines={1}
        >
          {nombreCompleto(inv)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {linea}
        </Text>
      </View>
      <Icon name="chevron-forward-outline" size={18} color={colors.text} />
    </Pressable>
  );
}

const TONO: Record<Tono, string> = {
  ok: colors.gold,
  info: colors.gold,
  alerta: colors.gold,
  urgente: colors.danger,
};

/** One notice: a gold line icon and the sentence, as a row. */
export function FilaAviso({ aviso, primero = false }: { aviso: Aviso; primero?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={aviso.texto}
      style={{
        flexDirection: 'row',
        gap: space[3],
        alignItems: 'flex-start',
        paddingVertical: space[3],
        paddingHorizontal: space[3],
        borderTopWidth: primero ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Icon name={aviso.icono} size={20} color={TONO[aviso.tono]} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{aviso.texto}</Text>
    </View>
  );
}
