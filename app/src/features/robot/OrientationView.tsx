import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  Button,
  Stepper,
  Text,
  VISIT_PHASES,
  colors,
  space,
  useBreakpoint,
} from '../../design-system';
import { aria } from '../../design-system/components/a11y';
import type { Category } from '../../domain/entities/types';
import {
  COMMON_COPY,
  ORIENTATION,
  PHASE_TO_STEP,
  renderCopy,
  type CopyVars,
  type OrientationPhase,
} from '../orientation/copy';
import { Heading } from '../shared/Heading';
import { Notice } from '../shared/notices';
import { kioskTitleStyle } from './KioskFrame';

export type OrientationViewPhase = OrientationPhase | 'feedback';

export type OrientationViewProps = {
  category: Category;
  phase: OrientationViewPhase;
  vars: CopyVars;
  /** The answer given to the greeting, which unlocks its «Anotado…» line. */
  greetingAnswer?: string;
  onChoose: (option: string) => void;
  /** Phases without answer buttons (route, staff assignment) advance with this, if given. */
  onContinue?: () => void;
};

const isRobot = (escort: string) => /^R\d+$/.test(escort);
const ROUTE = ['Recepción', 'Pasillo'];

/**
 * One question at a time, in the script of the person's category. Content is what makes the five
 * orientations different (greeting, offer, destination, who escorts, register); the progress
 * strip shows where the visit is among the ten phases.
 */
export function OrientationView({
  category,
  phase,
  vars,
  greetingAnswer,
  onChoose,
  onContinue,
}: OrientationViewProps) {
  const { isTablet, width } = useBreakpoint();
  const script = ORIENTATION[category];
  const spoken = phase === 'feedback' ? null : script.phases[phase];
  const text = renderCopy(spoken ? spoken.text : COMMON_COPY.feedbackPrompt, vars);
  const options = (spoken?.options ?? []).map((o) => renderCopy(o, vars));
  const stepIndex = VISIT_PHASES.findIndex((s) => s.key === PHASE_TO_STEP[phase]);
  const answered = phase === 'greeting' && !!greetingAnswer && !!spoken?.afterChoice;
  const escort = script.escort;
  const showDestination = phase !== 'greeting' && phase !== 'feedback' && phase !== 'farewell';
  const showEscort =
    escort !== null && (phase === 'assignment' || phase === 'route' || phase === 'arrival');
  const onRoute = phase === 'route' || phase === 'arrival';
  const routePoints = [...ROUTE, vars.destino ?? script.destination];
  const routeCurrent = phase === 'arrival' ? 2 : 1;

  return (
    <View style={{ gap: space[5], alignItems: 'center' }}>
      <PhaseProgress index={stepIndex} />

      <Heading
        variant="display"
        focusKey={`${category}-${phase}`}
        style={kioskTitleStyle(width, text.length + 2)}
      >
        {`“${text}”`}
      </Heading>

      {answered && spoken?.afterChoice ? <Notice>{spoken.afterChoice}</Notice> : null}

      {showDestination ? (
        <View style={{ gap: space[1], alignItems: 'center' }}>
          <Text variant="caption" tone="muted">
            Destino registrado
          </Text>
          <Text variant="h2">{vars.destino ?? script.destination}</Text>
        </View>
      ) : null}

      {showEscort && escort ? (
        <Text tone="muted">
          {`${escort} te acompaña · ${isRobot(escort) ? 'robot de acompañamiento' : 'persona del equipo'}`}
        </Text>
      ) : null}

      {onRoute ? (
        <View
          role="list"
          accessibilityLabel="Ruta"
          style={{
            flexDirection: 'row',
            gap: space[3],
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {routePoints.map((p, i) => (
            <View
              key={p}
              role="listitem"
              {...(i === routeCurrent ? aria({ 'aria-current': 'step' }) : null)}
              style={{
                paddingVertical: space[2],
                paddingHorizontal: space[3],
                borderWidth: 1,
                borderColor: i === routeCurrent ? colors.forest : colors.borderStrong,
                backgroundColor:
                  i === routeCurrent
                    ? colors.forest
                    : i < routeCurrent
                      ? colors.sage
                      : 'transparent',
              }}
            >
              <Text
                variant="label"
                tone={i === routeCurrent ? 'onDark' : i < routeCurrent ? 'success' : 'muted'}
              >
                {`${i < routeCurrent ? '✓ ' : i === routeCurrent ? '● ' : ''}${p}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {options.length > 0 && !answered ? (
        <View
          role="group"
          accessibilityLabel={text}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space[4],
            justifyContent: 'center',
          }}
        >
          {options.map((o, i) => (
            <Button
              key={o}
              label={o}
              size="lg"
              fullWidth={!isTablet}
              variant={i === 0 ? 'primary' : 'secondary'}
              onPress={() => onChoose(o)}
            />
          ))}
        </View>
      ) : phase !== 'route' && phase !== 'feedback' && onContinue ? (
        <Button label="Continuar" size="lg" fullWidth={!isTablet} onPress={onContinue} />
      ) : null}
      {phase === 'route' ? (
        <Text variant="caption" tone="muted">
          Sin tiempos estimados: el recorrido avanza paso a paso.
        </Text>
      ) : null}
    </View>
  );
}

/** «Paso n de 10» as a quiet line; the full ten-phase Stepper opens on demand. */
function PhaseProgress({ index }: { index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: space[3], alignItems: 'center' }}>
      <Pressable
        role="button"
        accessibilityLabel="Fases de la visita"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text variant="caption" tone="muted">
          {`${open ? '▾' : '▸'} Paso ${index + 1} de ${VISIT_PHASES.length}: ${VISIT_PHASES[index]?.label ?? ''}`}
        </Text>
      </Pressable>
      {open ? <Stepper current={index} /> : null}
    </View>
  );
}
