import { View } from 'react-native';

import { Logo, Text, colors, space } from '../../../../design-system';
import type { UsuarioPublico } from '../../client';
import { BENEFICIO, LIMITE_ACTIVAS, nivelDe, nombreCompleto, tierLabel } from '../model';

/**
 * Membership card: gold-lined, the seal, the level and "x de N invitados activos" with a gold
 * bar. `activos` is null while the invitations are still loading.
 */
export function TarjetaSocio({
  usuario,
  activos,
}: {
  usuario: UsuarioPublico;
  activos: number | null;
}) {
  const nivel = nivelDe(usuario);
  const limite = LIMITE_ACTIVAS[nivel];
  const usados = Math.min(activos ?? 0, limite);
  const resumen = `${activos ?? '–'} de ${limite} invitados activos`;
  return (
    <View
      accessible
      accessibilityLabel={`Tarjeta de socio: ${nombreCompleto(usuario)}, ${tierLabel(usuario)}. ${resumen}. ${BENEFICIO[nivel]}`}
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.gold,
        padding: space[5],
        gap: space[4],
      }}
    >
      <Logo size={36} wordmark="row" />
      <Text variant="label">{tierLabel(usuario)}</Text>
      <View
        style={{
          gap: space[2],
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: space[4],
        }}
      >
        <Text variant="label">{resumen}</Text>
        <View aria-hidden style={{ flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: limite }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                backgroundColor: i < usados ? colors.gold : colors.surfaceMuted,
              }}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted">
          {BENEFICIO[nivel]}
        </Text>
      </View>
    </View>
  );
}
