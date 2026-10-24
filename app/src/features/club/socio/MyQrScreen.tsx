import { useCallback } from 'react';
import { Image, View } from 'react-native';

import { Button, Text, colors, space } from '../../../design-system';
import { QrCode } from '../../invitations/QrCode';
import { faltan, horaDe } from './dates';
import { useCarga, useWhileFocused } from './hooks';
import { nombreCompleto, tierLabel } from './model';
import { useSocio } from './SocioContext';
import { Fila, Grupo } from './ui/Fila';
import { Frame, Subtitulo } from './ui/Frame';
import { Cargando, Fallo } from './ui/States';

// ponytail: printed passes the robot already knows; generated QR for everyone else.
const PASES_FIJOS: Record<string, number> = {
  gabriel: require('../../../../assets/pases/gabriel.png'),
  andres: require('../../../../assets/pases/andres.png'),
};

/** Mi pase: the code, when it expires and what to do if the robot does not recognise the face. */
export function MyQrScreen({ onBack }: { onBack: () => void }) {
  const { client, usuario, ahora } = useSocio();
  const load = useCallback(() => client.miQr(), [client]);
  const { carga, recargar } = useCarga(load, false);
  useWhileFocused(recargar);
  const vence = carga.estado === 'lista' ? carga.datos.vence_at : '';
  const quedan = vence ? faltan(vence, ahora()) : null;
  const fijo = usuario.persona_id ? PASES_FIJOS[usuario.persona_id] : undefined;
  return (
    <Frame title="Mi pase" onBack={onBack}>
      {fijo ? (
        <Image
          source={fijo}
          resizeMode="contain"
          style={{ width: '100%', maxWidth: 360, aspectRatio: 1080 / 1560, alignSelf: 'center' }}
          accessibilityLabel="Código QR de tu pase de socio. Muéstralo al robot o a un edecán."
        />
      ) : null}
      {!fijo && carga.estado === 'cargando' ? <Cargando filas={1} label="Cargando tu QR" /> : null}
      {!fijo && carga.estado === 'error' ? (
        <Fallo error={carga.error} onRetry={() => void recargar()} />
      ) : null}
      {!fijo && carga.estado === 'lista' ? (
        <View style={{ alignItems: 'center', gap: space[4] }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.gold,
              backgroundColor: colors.white,
              padding: space[3],
            }}
          >
            <QrCode
              value={carga.datos.qr_payload}
              size={220}
              showCode={false}
              accessibilityLabel="Código QR de tu pase de socio. Muéstralo al robot o a un edecán."
            />
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="h2" level={2}>
              {nombreCompleto(usuario)}
            </Text>
            <Text tone="muted">{`Pase de socio · ${tierLabel(usuario)}`}</Text>
            <Text variant="caption" tone={quedan ? 'muted' : 'danger'}>
              {quedan
                ? `Vence en ${quedan} (${horaDe(vence)})`
                : 'Este código venció. Toca Actualizar.'}
            </Text>
          </View>
          <Button label="Actualizar código" variant="ghost" onPress={() => void recargar()} />
        </View>
      ) : null}
      <View style={{ gap: space[2] }}>
        <Subtitulo>Si el rostro no se reconoce</Subtitulo>
        <Grupo>
          <Fila
            primero
            icono="qr-code-outline"
            titulo="Muéstralo al robot o a un edecán"
            detalle="Ellos leen el código y te dan el paso."
          />
          <Fila
            icono="sunny-outline"
            titulo="Revisa la luz y quita gafas oscuras"
            detalle="Con la foto de tu perfil, el robot te reconoce más rápido."
          />
        </Grupo>
      </View>
    </Frame>
  );
}
