import { View } from 'react-native';

import { Button, Card, Text, colors, space } from '../../../../design-system';
import { horaDe } from '../dates';
import { Subtitulo } from './Frame';
import type { Tarjeta } from '../SocioContext';

const CERRADA = {
  APROBADA: 'Listo: avisaste que lo esperas.',
  RECHAZADA: 'Listo: avisaste que no lo conoces. Recepción lo atiende.',
  VENCIDA: 'Esta solicitud ya venció.',
} as const;

/** "Do you expect this person?" with the two answers. Disabled after answering; handles expiry. */
export function TarjetaConfirmacion({
  tarjeta,
  onResponder,
}: {
  tarjeta: Tarjeta;
  onResponder: (aprueba: boolean) => void;
}) {
  const { confirmacion: c, respuesta } = tarjeta;
  const estado = respuesta?.estado;
  const cerrada = estado === 'APROBADA' || estado === 'RECHAZADA' || estado === 'VENCIDA';
  if (cerrada) {
    return (
      <Card
        variant="soft"
        style={{ borderColor: colors.border }}
        accessibilityLabel={`${c.visitante_desc}. ${CERRADA[estado]}`}
      >
        <Text variant="label">{c.visitante_desc}</Text>
        <Text tone="muted" role="status" accessibilityLiveRegion="polite">
          {CERRADA[estado]}
        </Text>
      </Card>
    );
  }
  const enviando = estado === 'ENVIANDO';
  const hasta = horaDe(c.vence_at);
  return (
    <Card style={{ borderColor: colors.border, gap: space[3] }}>
      <Subtitulo>¿Esperas a esta persona?</Subtitulo>
      <Text>{c.visitante_desc}</Text>
      {hasta ? (
        <Text variant="caption" tone="muted">
          {`Responde antes de las ${hasta}.`}
        </Text>
      ) : null}
      {estado === 'ERROR' ? (
        <Text variant="label" tone="danger" role="alert" accessibilityLiveRegion="assertive">
          {respuesta?.detalle}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[1] }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Sí lo espero"
            size="sm"
            fullWidth
            disabled={enviando}
            loading={enviando}
            onPress={() => onResponder(true)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="No lo conozco"
            variant="secondary"
            size="sm"
            fullWidth
            disabled={enviando}
            onPress={() => onResponder(false)}
          />
        </View>
      </View>
    </Card>
  );
}
