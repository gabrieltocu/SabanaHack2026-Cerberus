import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Text, colors, space, useBreakpoint } from '../../design-system';
import { focusRingStyle, useFocusRing } from '../../design-system/components/a11y';
import { messageFor } from '../messages';
import { COMMON_COPY, renderCopy } from '../orientation/copy';
import { Heading } from '../shared/Heading';
import { Notice } from '../shared/notices';
import type { ClassificationView } from '../types';
import { kioskTitleStyle } from './KioskFrame';

type Variant = { title: string; message?: string; actions: 'alternatives' | 'notify' };

const MEMBER_DENIED = 'No puedo confirmar tu visita';
const EXTERNAL_DENIED = 'No puedo confirmar su visita hoy';

/** Titles and way out per code (screens.md §6.2). Message text comes from the catalog. */
const VARIANTS: Record<string, Variant> = {
  RECOGNITION_UNKNOWN: { title: 'No pude confirmar tu identidad', actions: 'alternatives' },
  RECOGNITION_ERROR: { title: 'No pude usar la cámara', actions: 'alternatives' },
  ACCESS_DENIED_NO_EVIDENCE: {
    title: 'Necesito tu pase',
    message:
      'Para continuar necesito tu pase de invitación. Muéstrame tu QR o pide apoyo en recepción.',
    actions: 'alternatives',
  },
  CLASSIFICATION_MANUAL_REVIEW: { title: 'Recepción puede ayudarte', actions: 'notify' },
  MEMBERSHIP_NOT_ACTIVE: { title: MEMBER_DENIED, actions: 'notify' },
  STAFF_SHIFT_INACTIVE: { title: MEMBER_DENIED, actions: 'notify' },
  EXTERNAL_DAY_NOT_ALLOWED: { title: EXTERNAL_DENIED, actions: 'notify' },
  EXTERNAL_OUT_OF_HOURS: { title: EXTERNAL_DENIED, actions: 'notify' },
};

export const NOTIFIED_TEXT = 'Aviso enviado a recepción. Una persona del equipo viene en camino.';

export type ClassificationResultProps = {
  result: ClassificationView;
  destination?: string;
  /** The result comes from the face reading (captioned «Resultado del reconocimiento»). */
  simulated?: boolean;
  /** An action is in flight: the pressed button reads as busy and the rest lock. */
  busy?: boolean;
  /** Reception was already notified: shows the confirmation instead of asking again. */
  notified?: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onUseQr: () => void;
  /** «Pedir ayuda» and «Avisar a recepción»: both open a verification task, neither grants access. */
  onHelp: () => void;
  /** «Volver al inicio»: when the answer is not a confirmation the screen is never a dead end. */
  onBack?: () => void;
};

/**
 * R-03 / R-13. The face is only a hint: CONFIRMED asks the person to confirm and names the
 * record that backs it; anything else explains kindly and offers a way forward, never a dead end.
 */
export function ClassificationResult({
  result,
  simulated = false,
  destination,
  busy = false,
  notified = false,
  onConfirm,
  onReject,
  onUseQr,
  onHelp,
  onBack,
}: ClassificationResultProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const ring = useFocusRing();
  const { width } = useBreakpoint();
  if (result.state === 'CONFIRMED') {
    const question = renderCopy(COMMON_COPY.confirmIdentity, { nombre: result.name });
    return (
      <View style={{ gap: space[6], alignItems: 'center' }}>
        <View style={{ gap: space[3], alignItems: 'center' }}>
          <Heading
            variant="display"
            focusKey={result.name}
            style={kioskTitleStyle(width, question.length)}
          >
            {question}
          </Heading>
          <Text tone="muted" align="center" style={{ fontSize: 20, lineHeight: 28 }}>
            {destination ? `Destino: ${destination}` : 'Confirma para continuar.'}
          </Text>
        </View>
        <View
          role="group"
          accessibilityLabel={`${result.name}, ¿eres tú?`}
          style={{
            flexDirection: width >= 600 ? 'row' : 'column',
            gap: space[3],
            alignSelf: 'stretch',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: width >= 600 ? 280 : '100%' }}>
            <Button
              label="Confirmar y notificar"
              size="lg"
              fullWidth
              loading={busy}
              onPress={onConfirm}
            />
          </View>
          <View style={{ width: width >= 600 ? 280 : '100%' }}>
            <Pressable
              role="button"
              accessibilityLabel="Más opciones"
              accessibilityState={{ expanded: optionsOpen, disabled: busy }}
              disabled={busy}
              onPress={() => setOptionsOpen((open) => !open)}
              onFocus={ring.onFocus}
              onBlur={ring.onBlur}
              style={[
                {
                  borderWidth: 1,
                  borderColor: colors.ink,
                  minHeight: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: busy ? 0.45 : 1,
                },
                ring.focusVisible ? focusRingStyle() : null,
              ]}
            >
              <Text variant="label">Más opciones</Text>
            </Pressable>
          </View>
        </View>
        {optionsOpen ? (
          <View style={{ width: width >= 600 ? 280 : '100%' }}>
            <Button
              label="No soy yo"
              size="lg"
              fullWidth
              variant="secondary"
              disabled={busy}
              onPress={onReject}
            />
          </View>
        ) : null}
        <Text variant="caption" tone="muted" align="center">
          {result.evidence}
        </Text>
      </View>
    );
  }

  const variant: Variant = VARIANTS[result.code] ?? {
    title: result.state === 'DENIED' ? MEMBER_DENIED : 'Recepción puede ayudarte',
    actions: result.state === 'DENIED' ? 'notify' : 'alternatives',
  };
  return (
    <View style={{ gap: space[5], alignItems: 'center' }}>
      {simulated ? (
        <Text variant="caption" tone="muted">
          Resultado del reconocimiento
        </Text>
      ) : null}
      <Heading
        variant="h1"
        focusKey={result.code}
        style={{ fontSize: 44, lineHeight: 48, textAlign: 'center' }}
      >
        {variant.title}
      </Heading>
      <Text align="center" style={{ fontSize: 20, lineHeight: 30 }}>
        {variant.message ?? messageFor(result.code, result.vars)}
      </Text>
      <Text variant="caption" tone="muted">{`Código: ${result.code}`}</Text>
      {notified ? (
        <Notice>{NOTIFIED_TEXT}</Notice>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space[4],
            justifyContent: 'center',
          }}
        >
          {variant.actions === 'alternatives' ? (
            <>
              <Button label="Usar mi QR" size="lg" onPress={onUseQr} />
              <Button label="Pedir ayuda" size="lg" variant="secondary" onPress={onHelp} />
            </>
          ) : (
            <Button label="Avisar a recepción" size="lg" loading={busy} onPress={onHelp} />
          )}
        </View>
      )}
      {onBack ? (
        <Button
          label="Volver al inicio"
          size="lg"
          variant="secondary"

          disabled={busy}
          onPress={onBack}
        />
      ) : null}
    </View>
  );
}
