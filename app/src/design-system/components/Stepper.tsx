import { View } from 'react-native';
import { colors, space } from '../tokens';
import { aria } from './a11y';
import { Text } from './Text';
import { useBreakpoint } from './useBreakpoint';

export type Step = { key: string; label: string };

/** The ten phases of a visit, from invitation to evaluation (labels are Spanish). */
export const VISIT_PHASES: readonly Step[] = [
  { key: 'pre-registration', label: 'Registro previo' },
  { key: 'identification', label: 'Identificación' },
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'destination', label: 'Destino y necesidades' },
  { key: 'assignment', label: 'Asignación' },
  { key: 'escort', label: 'Acompañamiento' },
  { key: 'arrival', label: 'Llegada al destino' },
  { key: 'exit', label: 'Salida del club' },
  { key: 'feedback', label: 'Evaluación' },
  { key: 'farewell', label: 'Despedida' },
];

export type StepperStrings = {
  done: string;
  current: string;
  upcoming: string;
  position: (index: number, total: number) => string;
};

const esStrings: StepperStrings = {
  done: 'completado',
  current: 'en curso',
  upcoming: 'pendiente',
  position: (i, n) => `Paso ${i} de ${n}`,
};

export type StepperProps = {
  steps?: readonly Step[];
  /** Zero-based index of the active step; steps before it are done. */
  current: number;
  accessibilityLabel?: string;
  strings?: StepperStrings;
  /** Defaults to horizontal on desktop with up to 6 steps; otherwise vertical (two columns from tablet up when there are more than 6). */
  orientation?: 'horizontal' | 'vertical';
};

const SIZE = 28;

export function Stepper({
  steps = VISIT_PHASES,
  current,
  accessibilityLabel = 'Fases de la visita',
  strings = esStrings,
  orientation,
}: StepperProps) {
  const { isDesktop, isTablet } = useBreakpoint();
  const horizontal =
    (orientation ?? (isDesktop && steps.length <= 6 ? 'horizontal' : 'vertical')) === 'horizontal';
  const columns = !horizontal && isTablet && steps.length > 6 ? 2 : 1;
  const perColumn = Math.ceil(steps.length / columns);

  const renderStep = (step: Step, i: number, last: boolean) => {
    const status = i < current ? 'done' : i === current ? 'current' : 'upcoming';
    const marker = (
      <View
        style={{
          width: SIZE,
          height: SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: status === 'current' ? 2 : 1,
          borderColor:
            status === 'upcoming'
              ? colors.borderStrong
              : status === 'current'
                ? colors.gold
                : colors.primary,
          backgroundColor: status === 'done' ? colors.primary : colors.surface,
        }}
      >
        <Text
          variant="caption"
          tone={status === 'done' ? 'onPrimary' : status === 'current' ? 'default' : 'muted'}
          style={{ lineHeight: 16 }}
        >
          {status === 'done' ? '✓' : String(i + 1)}
        </Text>
      </View>
    );
    const connector = last ? null : (
      <View
        style={
          horizontal
            ? {
                flex: 1,
                height: 1,
                marginHorizontal: space[2],
                backgroundColor: status === 'done' ? colors.primary : colors.borderStrong,
              }
            : {
                width: 1,
                minHeight: space[4],
                flex: 1,
                marginVertical: space[1],
                backgroundColor: status === 'done' ? colors.primary : colors.borderStrong,
              }
        }
      />
    );
    const label = (
      <Text
        variant={status === 'current' ? 'label' : 'caption'}
        tone={status === 'upcoming' ? 'muted' : 'default'}
        style={status === 'current' ? { fontSize: 13 } : undefined}
      >
        {step.label}
      </Text>
    );
    return (
      <View
        key={step.key}
        role="listitem"
        accessible
        accessibilityLabel={`${strings.position(i + 1, steps.length)}: ${step.label}, ${strings[status]}`}
        {...(status === 'current' ? aria({ 'aria-current': 'step' }) : null)}
        style={
          horizontal
            ? { flex: 1, gap: space[2], paddingRight: 0 }
            : { flexDirection: 'row', gap: space[3] }
        }
      >
        {horizontal ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {marker}
              {connector}
            </View>
            {label}
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center' }}>
              {marker}
              {connector}
            </View>
            <View
              style={{
                minHeight: SIZE + (last ? 0 : space[4]),
                justifyContent: 'flex-start',
                paddingTop: 4,
              }}
            >
              {label}
            </View>
          </>
        )}
      </View>
    );
  };

  const groups = Array.from({ length: columns }, (_, c) =>
    steps.slice(c * perColumn, (c + 1) * perColumn).map((step, k) => {
      const i = c * perColumn + k;
      return renderStep(step, i, i === Math.min(steps.length, (c + 1) * perColumn) - 1);
    }),
  );
  return (
    <View
      role="list"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: horizontal || columns > 1 ? 'row' : 'column',
        alignSelf: 'stretch',
        gap: horizontal ? 0 : space[6],
      }}
    >
      {horizontal
        ? groups[0]
        : groups.map((g, c) => (
            <View key={c} role="none" style={{ flex: 1 }}>
              {g}
            </View>
          ))}
    </View>
  );
}
