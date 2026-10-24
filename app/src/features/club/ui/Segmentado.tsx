import { View } from 'react-native';

import { Text, Touchable, colors, space } from '../../../design-system';

export interface Opcion<T extends string> {
  clave: T;
  etiqueta: string;
  /** Count next to the label (0 or undefined hides it). */
  badge?: number;
}

/** Two or three straight segments in a black frame; the selected one is black with a gold label. */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: readonly Opcion<T>[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <View
      role="tablist"
      style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.border }}
    >
      {opciones.map((o) => {
        const activa = o.clave === valor;
        return (
          <Touchable
            key={o.clave}
            role="tab"
            label={o.badge ? `${o.etiqueta}, ${o.badge}` : o.etiqueta}
            onPress={() => onCambio(o.clave)}
            accessibilityState={{ selected: activa }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[2],
              backgroundColor: activa
                ? colors.primary
                : pressed
                  ? colors.surfaceSoft
                  : colors.surface,
            })}
          >
            <Text variant="label" tone={activa ? 'onPrimary' : 'default'} style={{ fontSize: 15 }}>
              {o.etiqueta}
            </Text>
            {o.badge ? (
              <View
                style={{
                  minWidth: 22,
                  minHeight: 22,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.danger,
                }}
              >
                <Text
                  variant="caption"
                  style={{ color: colors.white, fontSize: 12, lineHeight: 16 }}
                >
                  {o.badge > 99 ? '99+' : o.badge}
                </Text>
              </View>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
}
