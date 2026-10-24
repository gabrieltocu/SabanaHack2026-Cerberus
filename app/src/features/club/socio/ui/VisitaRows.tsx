import { Pressable, View } from 'react-native';

import { Icon, Text, colors, fonts, space } from '../../../../design-system';
import type { Trato, Visita } from '../../../../club/types';
import { horaDe } from '../dates';
import { activa, frasesVisita, progresoVisita } from '../visitas';
import { Avatar } from './Avatar';

/** A guest who is in the club: name and one line of where they are. Opens the follow-up. */
export function FilaVisita({
  v,
  primero,
  onPress,
}: {
  v: Visita;
  primero: boolean;
  onPress: () => void;
}) {
  const [nombre = '', ...resto] = v.nombre.split(' ');
  const detalle = activa(v)
    ? ['En el club', v.destino].filter(Boolean).join(' · ')
    : `Salió${v.fin ? ` a las ${horaDe(v.fin)}` : ''} · Evalúa la visita`;
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${v.nombre}. ${detalle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[3],
        borderTopWidth: primero ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
      })}
    >
      <Avatar nombre={nombre} apellido={resto[0]} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 }}
          numberOfLines={1}
        >
          {v.nombre}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {detalle}
        </Text>
      </View>
      <Icon name="chevron-forward-outline" size={18} color={colors.text} />
    </Pressable>
  );
}

/**
 * The visit in progress as one gold-lined card and one sentence ("Laura Díaz llegó" / "El robot
 * la lleva a la Terraza") with a gold progress bar. Mine or a guest's; the only highlighted block of Inicio.
 */
export function TarjetaVisita({
  v,
  propia,
  trato,
  onPress,
}: {
  v: Visita;
  propia: boolean;
  trato?: Trato;
  onPress: () => void;
}) {
  const { titulo, detalle } = frasesVisita(v, propia, trato);
  const progreso = progresoVisita(v);
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${titulo}. ${detalle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: colors.gold,
        backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
        padding: space[5],
        gap: space[2],
      })}
    >
      <Text style={{ fontFamily: fonts.bodyStrong, fontSize: 18, lineHeight: 26 }}>{titulo}</Text>
      <Text variant="label" tone="muted" style={{ fontFamily: fonts.body }}>
        {detalle}
      </Text>
      <View
        aria-hidden
        style={{ height: 4, backgroundColor: colors.surfaceMuted, marginTop: space[2] }}
      >
        <View
          style={{
            height: 4,
            width: `${Math.round(progreso * 100)}%`,
            backgroundColor: colors.gold,
          }}
        />
      </View>
    </Pressable>
  );
}
