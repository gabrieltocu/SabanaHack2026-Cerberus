// El pase del invitado: saludo en Bodoni, QR con marco dorado y una sola línea de contexto.
import { View } from 'react-native';
import { Text, space } from '../../design-system';
import { QrCode } from '../invitations/QrCode';
import { MarcoQr, Saludo } from './ui';

export function PaseGrande({
  saludo,
  nombre,
  qr,
  lado,
  etiquetaQr,
  linea,
  ayuda,
}: {
  saludo: string;
  nombre: string;
  qr: string;
  lado: number;
  etiquetaQr: string;
  linea: string;
  ayuda: string;
}) {
  return (
    <View style={{ gap: space[5], alignItems: 'stretch' }}>
      <Saludo saludo={saludo} nombre={nombre} />
      <MarcoQr>
        <QrCode value={qr} size={lado} showCode={false} accessibilityLabel={etiquetaQr} />
      </MarcoQr>
      <View style={{ gap: space[1] }}>
        <Text tone="muted" align="center">
          {linea}
        </Text>
        <Text tone="muted" align="center">
          {ayuda}
        </Text>
      </View>
    </View>
  );
}
