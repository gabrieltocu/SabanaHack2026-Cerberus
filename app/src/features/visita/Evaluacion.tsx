// Pantalla 9: cierre de la visita. Gracias, resumen breve y evaluación; el final deja un buen recuerdo.
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Icon, Text, TextField, Touchable, colors, space } from '../../design-system';
import type { PaseVista } from '../../club/types';
import { ClubApiError } from '../club/client';
import { usePase } from './PaseContext';
import { primerNombre } from './paseVista';
import { Cuerpo, Encabezado, FINA } from './ui';

/** Fila de cinco estrellas doradas (una calificación): etiqueta pequeña y 44 px por estrella. */
export function Estrellas({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  onChange: (n: number) => void;
}) {
  return (
    <View role="radiogroup" accessibilityLabel={etiqueta} style={{ gap: space[1] }}>
      <Text variant="label" align="center">
        {etiqueta}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Touchable
            key={n}
            role="radio"
            label={`${n} de 5`}
            accessibilityState={{ checked: n === valor }}
            onPress={() => onChange(n)}
            style={{ width: 52, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon
              name={n <= valor ? 'star' : 'star-outline'}
              size={36}
              color={n <= valor ? colors.gold : colors.ink}
            />
          </Touchable>
        ))}
      </View>
    </View>
  );
}

/** Cierre cálido: tras evaluar (o si ya lo hizo) queda el agradecimiento y la invitación a ser socio. */
function Gracias({ p, onMembresia }: { p: PaseVista; onMembresia: () => void }) {
  return (
    <>
      <View role="status" accessibilityLiveRegion="polite" style={{ gap: space[3] }}>
        <Text variant="display" level={2} align="center">
          {`Gracias,\n${primerNombre(p)}`}
        </Text>
        <Text tone="muted" align="center">
          Recibimos tu evaluación. Fue un gusto recibirte en N Club.
        </Text>
      </View>
      <Button
        label="Conocer la membresía"
        variant="secondary"
        size="lg"
        fullWidth
        onPress={onMembresia}
      />
    </>
  );
}

export function Evaluacion({
  p,
  qr,
  onMembresia,
}: {
  p: PaseVista;
  qr: string;
  onMembresia: () => void;
}) {
  const { client } = usePase();
  const [robot, setRobot] = useState(0);
  const [club, setClub] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!robot || !club) return setError('Elige de 1 a 5 estrellas para el robot y para el club.');
    setEnviando(true);
    setError(null);
    try {
      await client.evaluarConPase(qr, {
        robot,
        club,
        ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
      });
      setEnviada(true);
    } catch (e) {
      // 409: ya evaluó antes (por ejemplo, desde otro dispositivo).
      if (e instanceof ClubApiError && e.status === 409) setEnviada(true);
      else setError(e instanceof ClubApiError ? e.detalle : 'No pudimos enviar tu evaluación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Encabezado titulo="¿Cómo estuvo su visita?" />
      <Cuerpo>
        {enviada ? (
          <Gracias p={p} onMembresia={onMembresia} />
        ) : (
          <>
            <View style={{ gap: space[3] }}>
              <Estrellas etiqueta="El robot que te acompañó" valor={robot} onChange={setRobot} />
              <Estrellas etiqueta="El club" valor={club} onChange={setClub} />
            </View>
            <TextField
              label="Comentario (opcional)"
              value={comentario}
              onChangeText={setComentario}
              multiline
              maxLength={500}
            />
            {error ? (
              <Text role="alert" tone="danger" variant="caption">
                {error}
              </Text>
            ) : null}
            <Button label="Enviar" size="lg" fullWidth loading={enviando} onPress={enviar} />
            <Touchable
              label="Conocer la membresía de N Club"
              onPress={onMembresia}
              style={{
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                borderTopWidth: 1,
                borderTopColor: FINA,
              }}
            >
              <Icon name="ribbon-outline" size={22} color={colors.gold} />
              <Text variant="label" style={{ flex: 1 }}>
                Conocer la membresía
              </Text>
              <Icon name="chevron-forward-outline" size={20} color={colors.ink} />
            </Touchable>
          </>
        )}
      </Cuerpo>
    </>
  );
}
