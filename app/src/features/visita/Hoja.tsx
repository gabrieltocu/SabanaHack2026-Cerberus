import { Modal, ScrollView, View } from 'react-native';
import { Button, Icon, Text, colors, layout, space, useInsets } from '../../design-system';

export type HojaProps = {
  visible: boolean;
  title: string;
  /** Punto de llegada dentro del club (no hay dirección postal), una línea por renglón. */
  direccion: readonly string[];
  /** Encabezado y renglones de recomendaciones. */
  consejosTitulo: string;
  consejos: readonly string[];
  onClose: () => void;
};

/** Hoja inferior con la dirección y las recomendaciones; Esc y «atrás» la cierran. */
export function Hoja({ visible, title, direccion, consejosTitulo, consejos, onClose }: HojaProps) {
  const insets = useInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignItems: 'center',
          backgroundColor: 'rgba(20, 20, 20, 0.5)',
        }}
      >
        <View
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            width: '100%',
            maxWidth: layout.app,
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              padding: space[5],
              paddingBottom: space[5] + insets.bottom,
              gap: space[5],
            }}
          >
            <Text variant="h2">{title}</Text>
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
              <Icon name="location-outline" size={22} color={colors.gold} />
              <View style={{ flex: 1 }}>
                {direccion.map((linea, i) => (
                  <Text key={linea} variant={i === 0 ? 'label' : 'body'}>
                    {linea}
                  </Text>
                ))}
              </View>
            </View>
            <View style={{ gap: space[2] }}>
              <Text variant="label" tone="muted">
                {consejosTitulo}
              </Text>
              {consejos.map((c) => (
                <View key={c} style={{ flexDirection: 'row', gap: space[3] }}>
                  <Icon name="checkmark-outline" size={20} color={colors.gold} />
                  <Text style={{ flex: 1 }}>{c}</Text>
                </View>
              ))}
            </View>
            <Button label="Cerrar" size="lg" fullWidth onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
