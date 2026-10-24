import { View } from 'react-native';
import { Button, Text, fonts, space } from '../../design-system';
import type { HandoffState } from '../../domain/entities/visit';
import { Heading } from '../shared/Heading';

export type FailureStage = Extract<
  HandoffState,
  'REQUESTED' | 'ACCEPTED' | 'CONTEXT_TRANSFERRED' | 'CONFIRMED' | 'EXPIRED'
>;

const VOICE: Record<FailureStage, string> = {
  REQUESTED: 'Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.',
  ACCEPTED: 'Soy {edecán}, voy a ayudarte. ¿Estás junto al robot?',
  CONTEXT_TRANSFERRED: 'Ya tengo tu destino. Continuaremos desde aquí.',
  CONFIRMED: 'Yo sigo contigo; nuestro equipo revisará el robot.',
  EXPIRED:
    'Seguimos buscando a una persona del equipo. Puedes mostrar tu QR o pedir ayuda en recepción.',
};

/** Inline progress of the relief, in the order the visitor lives it. */
const STAGES: { stage: FailureStage; label: string }[] = [
  { stage: 'REQUESTED', label: 'Ayuda solicitada' },
  { stage: 'ACCEPTED', label: '{edecán} va hacia ti' },
  { stage: 'CONTEXT_TRANSFERRED', label: '{edecán} ya tiene tu destino' },
  { stage: 'CONFIRMED', label: '{edecán} continúa contigo' },
];

export type RobotFailureBannerProps = {
  stage: FailureStage;
  /** Name of the attendant who took the relief; before that, a generic «una persona del equipo». */
  attendantName?: string;
  /** «Mostrar mi QR»: the visitor can always fall back to the pass. */
  onShowQr: () => void;
};

const fill = (t: string, name: string) => t.replace('{edecán}', name);

/**
 * R-09. When the robot fails the visitor sees a clear human signal, the state of the help on its
 * way and an exit (QR). Never a dead screen: every stage says what happens next.
 */
export function RobotFailureBanner({ stage, attendantName, onShowQr }: RobotFailureBannerProps) {
  const name = attendantName ?? 'Una persona del equipo';
  const current = stage === 'EXPIRED' ? -1 : STAGES.findIndex((s) => s.stage === stage);
  return (
    <View role="alert" accessibilityLiveRegion="assertive" style={{ gap: space[5] }}>
      <Heading variant="h1" focusKey="failure">
        Tengo un inconveniente
      </Heading>
      <Text style={{ fontSize: 20, lineHeight: 30 }}>{fill(VOICE[stage], name)}</Text>
      <View role="list" accessibilityLabel="Estado del relevo" style={{ gap: space[2] }}>
        {STAGES.map((s, i) => (
          <View
            key={s.stage}
            role="listitem"
            accessibilityLabel={`${fill(s.label, name)}${i < current ? ', hecho' : i === current ? ', ahora' : ''}`}
            style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}
          >
            <Text
              variant="label"
              tone={i < current ? 'success' : i === current ? 'default' : 'muted'}
            >
              {i < current ? '✓' : i === current ? '●' : '○'}
            </Text>
            <Text
              tone={i <= current ? 'default' : 'muted'}
              style={i === current ? { fontFamily: fonts.bodyStrong } : undefined}
            >
              {fill(s.label, name)}
            </Text>
          </View>
        ))}
      </View>
      <Button label="Mostrar mi QR" size="lg" variant="secondary" onPress={onShowQr} />
    </View>
  );
}
