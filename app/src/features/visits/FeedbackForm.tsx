import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Text, TextField, colors, radii, space } from '../../design-system';
import { focusRingStyle, useFocusRing } from '../../design-system/components/a11y';
import { ErrorNotice, Notice } from '../shared/notices';

export const MAX_COMMENT = 500;

export type FeedbackValues = { robot?: number; club?: number; comment?: string };

const SCALE = [1, 2, 3, 4, 5] as const;
const SCALE_LABELS: Record<number, string> = {
  1: '1 · Muy malo',
  2: '2',
  3: '3',
  4: '4',
  5: '5 · Muy bueno',
};

function Score({
  n,
  group,
  checked,
  disabled,
  onSelect,
}: {
  n: number;
  group: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const ring = useFocusRing();
  return (
    <Pressable
      role="radio"
      accessibilityLabel={`${group}: ${SCALE_LABELS[n]}`}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onSelect}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        {
          minWidth: 52,
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderRadius: radii.md,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      <Text variant="label" tone={checked ? 'onPrimary' : 'default'} style={{ fontSize: 17 }}>
        {String(n)}
      </Text>
    </Pressable>
  );
}

function Scale({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value?: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label">{label}</Text>
      <View
        role="radiogroup"
        accessibilityLabel={`${label}, de 1 a 5`}
        style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}
      >
        {SCALE.map((n) => (
          <Score
            key={n}
            n={n}
            group={label}
            checked={value === n}
            disabled={disabled}
            onSelect={() => onChange(n)}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', maxWidth: 292 }}>
        <Text variant="caption" tone="muted">
          Muy malo
        </Text>
        <Text variant="caption" tone="muted">
          Muy bueno
        </Text>
      </View>
    </View>
  );
}

export type FeedbackFormProps = {
  onSubmit: (values: FeedbackValues) => void;
  onSkip: () => void;
  submitting?: boolean;
  /** Stable code from the service (`FEEDBACK_ALREADY_SENT`, `NETWORK_OFFLINE`...). Input is kept. */
  errorCode?: string;
  /** Shows the thank-you line and locks the form. */
  sent?: boolean;
  /** Kiosk copy is «Enviar» / «Prefiero no participar»; the visit page says «Enviar evaluación». */
  submitLabel?: string;
  skipLabel?: string;
  /** The service accepts shorter comments than the design (300 vs 500): pass its limit. */
  maxComment?: number;
};

export function FeedbackForm({
  onSubmit,
  onSkip,
  submitting = false,
  errorCode,
  sent = false,
  submitLabel = 'Enviar',
  skipLabel = 'Prefiero no participar',
  maxComment = MAX_COMMENT,
}: FeedbackFormProps) {
  const [robot, setRobot] = useState<number>();
  const [club, setClub] = useState<number>();
  const [comment, setComment] = useState('');
  const ready = robot !== undefined || club !== undefined;
  const locked = submitting || sent;

  return (
    <View style={{ gap: space[5], alignSelf: 'stretch' }}>
      <Scale label="Servicio de los robots" value={robot} onChange={setRobot} disabled={locked} />
      <Scale label="Servicios del club" value={club} onChange={setClub} disabled={locked} />
      <View style={{ gap: space[1] }}>
        <TextField
          label="Comentario (opcional)"
          multiline
          value={comment}
          editable={!locked}
          maxLength={maxComment}
          onChangeText={setComment}
        />
        <Text variant="caption" tone="muted" align="right">
          {`${comment.length}/${maxComment}`}
        </Text>
      </View>
      {errorCode ? <ErrorNotice code={errorCode} /> : null}
      {sent ? <Notice>Gracias. Tu evaluación quedó registrada.</Notice> : null}
      {!ready && !sent ? (
        <Text variant="caption" tone="muted">
          Elige al menos una calificación para enviar.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        <Button
          label={submitting ? 'Enviando…' : submitLabel}
          loading={submitting}
          disabled={!ready || sent}
          onPress={() =>
            onSubmit({
              ...(robot !== undefined ? { robot } : null),
              ...(club !== undefined ? { club } : null),
              ...(comment.trim() ? { comment: comment.trim() } : null),
            })
          }
        />
        <Button label={skipLabel} variant="secondary" disabled={locked} onPress={onSkip} />
      </View>
    </View>
  );
}
