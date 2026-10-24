import { View } from 'react-native';
import { Button, Icon, Text, Touchable, colors, space } from '../../design-system';
import type { PaseVista } from '../../club/types';
import { nombreAnfitrion } from './paseVista';
import { Cuerpo, Datos, Encabezado, FINA } from './ui';

export function PerfilInvitado({
  p,
  onMembresia,
  onExit,
}: {
  p: PaseVista;
  onMembresia: () => void;
  onExit?: () => void;
}) {
  const nombre = `${p.invitacion.nombre} ${p.invitacion.apellido}`.trim();
  return (
    <>
      <Encabezado titulo="Mi perfil" />
      <Cuerpo>
        <View style={{ gap: space[2] }}>
          <Text variant="display" level={2}>
            {nombre}
          </Text>
        </View>
        <Datos
          filas={[{ icon: 'person-outline', etiqueta: 'Anfitrión', valor: nombreAnfitrion(p) }]}
        />
        <Touchable
          label="Membresía. Conoce los niveles y pide información"
          onPress={onMembresia}
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: FINA,
          }}
        >
          <Icon name="ribbon-outline" size={22} color={colors.gold} />
          <Text variant="label" style={{ flex: 1 }}>
            Membresía
          </Text>
          <Icon name="chevron-forward-outline" size={20} color={colors.ink} />
        </Touchable>
        <Button label="Salir de la visita" variant="secondary" fullWidth onPress={onExit} />
      </Cuerpo>
    </>
  );
}
