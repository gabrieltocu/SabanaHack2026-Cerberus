import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Icon, Text, TextField, colors, space } from '../../../../design-system';
import { Subtitulo } from './Frame';
import type { Visita } from '../../../../club/types';
import { describir, type ErrorInfo } from '../errors';
import { useSocio } from '../SocioContext';
import { Estrellas } from './Estrellas';

/**
 * Evaluación al salir: stars for the robot and the club plus an optional comment. Text only: the
 * robot collects voice comments itself. After sending it becomes a short thank-you.
 */
export function EvaluationForm({ visita }: { visita: Visita }) {
  const { client, evaluadas, marcarEvaluada } = useSocio();
  const [robot, setRobot] = useState(0);
  const [club, setClub] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  if (evaluadas.has(visita.id)) {
    return (
      <View
        accessible
        accessibilityLabel="Gracias por evaluar tu visita"
        role="status"
        style={{ alignItems: 'center', gap: space[2], paddingVertical: space[4] }}
      >
        <Icon name="checkmark-circle-outline" size={36} color={colors.gold} />
        <Subtitulo>Gracias por tu opinión</Subtitulo>
        <Text tone="muted" align="center">
          La leemos todos los días para mejorar el servicio.
        </Text>
      </View>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await client.evaluarVisita(visita.id, {
        robot,
        club,
        ...(comentario.trim() ? { comentario: comentario.trim() } : null),
      });
      marcarEvaluada(visita.id);
    } catch (e) {
      setError(describir(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Subtitulo>¿Cómo estuvo la visita?</Subtitulo>
        <Text tone="muted">Son tres toques y nos ayudas a mejorar.</Text>
      </View>
      <Estrellas label="El robot" value={robot} onChange={setRobot} disabled={enviando} />
      <Estrellas label="El club" value={club} onChange={setClub} disabled={enviando} />
      <TextField
        label="Comentario (opcional)"
        value={comentario}
        multiline
        maxLength={280}
        editable={!enviando}
        onChangeText={setComentario}
      />
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      <Button
        label="Enviar evaluación"
        size="lg"
        fullWidth
        loading={enviando}
        disabled={!robot || !club}
        onPress={() => void enviar()}
      />
    </View>
  );
}
