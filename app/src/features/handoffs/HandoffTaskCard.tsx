import { useState } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  StatusChip,
  Banner,
  Button,
  Card,
  Stepper,
  Text,
  space,
} from '../../design-system';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { CATEGORY_LABEL, HANDOFF_BADGE, HANDOFF_LABEL } from '../shared/labels';
import { ErrorNotice, Notice } from '../shared/notices';
import type { HandoffContextData, HandoffTask } from '../types';
import { HandoffContext } from './HandoffContext';

export type HandoffAction = 'accept' | 'context' | 'confirm';

const STEPS = [
  { key: 'requested', label: 'Solicitado' },
  { key: 'accepted', label: 'Aceptado' },
  { key: 'context', label: 'Contexto recibido' },
  { key: 'confirmed', label: 'Confirmado' },
];
const STEP_INDEX = { REQUESTED: 0, ACCEPTED: 1, CONTEXT_TRANSFERRED: 2, CONFIRMED: 4 } as const;

const BUSY_LABEL: Record<HandoffAction, string> = {
  accept: 'Aceptando…',
  context: 'Recibiendo…',
  confirm: 'Confirmando…',
};

export type HandoffTaskCardProps = {
  task: HandoffTask;
  /** Shown once the relief is accepted. */
  context?: HandoffContextData;
  /** The action in flight: its button reads as a gerund and every action is locked. */
  busy?: HandoffAction | null;
  /** Stable code (`HANDOFF_ALREADY_ACCEPTED`, `HANDOFF_EXPIRED`, `NETWORK_OFFLINE`...). */
  errorCode?: string;
  /** Wording for a code the catalog does not have (`RECEIVER_BUSY`). */
  errorMessage?: string;
  /** Write actions are off (no connection): buttons stay visible but disabled. */
  disabled?: boolean;
  /** Success line for the last transition (G6). */
  notice?: string;
  onAccept: () => void;
  onReject?: () => void;
  onReceiveContext: () => void;
  onConfirm: () => void;
  onGoToVisit?: () => void;
  /** After `HANDOFF_ALREADY_ACCEPTED` or `HANDOFF_INVALID_STATE`: reload the real state. */
  onRefresh?: () => void;
  /** After `HANDOFF_EXPIRED`. */
  onRequestAgain?: () => void;
};

/**
 * One relief task for the attendant. The request never changes who is responsible: only the
 * confirmation does, which is why that step asks first and says what it implies.
 */
export function HandoffTaskCard({
  task,
  context,
  busy = null,
  disabled = false,
  errorCode,
  errorMessage,
  notice,
  onAccept,
  onReject,
  onReceiveContext,
  onConfirm,
  onGoToVisit,
  onRefresh,
  onRequestAgain,
}: HandoffTaskCardProps) {
  const [confirming, setConfirming] = useState(false);
  const { state } = task;
  const title = state === 'REQUESTED' ? 'Relevo solicitado' : 'Relevo';
  const open = state === 'REQUESTED' || state === 'ACCEPTED' || state === 'CONTEXT_TRANSFERRED';
  // Someone else won the race: the real state arrives with a refresh, not with this button.
  const lost =
    errorCode === 'HANDOFF_ALREADY_ACCEPTED' ||
    errorCode === 'HANDOFF_INVALID_STATE' ||
    errorCode === 'HANDOFF_NOT_FOUND';
  const locked = busy !== null || disabled;

  return (
    <Card
      role="article"
      accessibilityLabel={`${title}, ${task.visitorName}, ${HANDOFF_LABEL[state]}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
        <Text variant="h2" level={3} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        <StatusChip kind={HANDOFF_BADGE[state]} label={HANDOFF_LABEL[state]} />
      </View>

      {state in STEP_INDEX ? (
        <Stepper
          steps={STEPS}
          current={STEP_INDEX[state as keyof typeof STEP_INDEX]}
          accessibilityLabel="Avance del relevo"
          orientation="horizontal"
        />
      ) : null}

      {open ? (
        <Banner kind="info">
          {`${task.fromName} sigue siendo el responsable de la visita hasta que confirmes el relevo.`}
        </Banner>
      ) : null}

      <View style={{ gap: space[1] }}>
        <View
          style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Avatar name={task.visitorName} tone="gold" size={36} />
          <Text variant="label" style={{ flex: 1 }}>
            {`${task.visitorName} · ${CATEGORY_LABEL[task.category]}`}
          </Text>
        </View>
        <Text>{`De: ${task.fromName} → A: ${task.toName}`}</Text>
        <Text>{`Destino: ${task.destination}`}</Text>
        {task.lastPoint ? <Text>{`Último punto confirmado: ${task.lastPoint}`}</Text> : null}
        <Text>{`Motivo: ${task.reason}`}</Text>
        <Text variant="caption" tone="muted">
          {`Solicitado ${task.requestedAt} · Vence ${task.expiresAt}`}
        </Text>
      </View>

      {context && state !== 'REQUESTED' && state !== 'EXPIRED' && state !== 'CANCELLED' ? (
        <HandoffContext context={context} />
      ) : null}

      {state === 'EXPIRED' && !errorCode ? <ErrorNotice code="HANDOFF_EXPIRED" /> : null}
      {state === 'CANCELLED' ? <Banner kind="warning">Este relevo fue cancelado.</Banner> : null}
      {errorCode ? <ErrorNotice code={errorCode} message={errorMessage} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {lost ? (
          onRefresh ? (
            <Button label="Actualizar lista" onPress={onRefresh} />
          ) : null
        ) : (
          <>
            {state === 'REQUESTED' ? (
              <>
                <Button
                  label={busy === 'accept' ? BUSY_LABEL.accept : 'Aceptar relevo'}
                  loading={busy === 'accept'}
                  disabled={locked}
                  onPress={onAccept}
                />
                {onReject ? (
                  <Button
                    label="Rechazar"
                    variant="secondary"
                    disabled={locked}
                    onPress={onReject}
                  />
                ) : null}
              </>
            ) : null}
            {state === 'ACCEPTED' ? (
              <Button
                label={busy === 'context' ? BUSY_LABEL.context : 'Recibí el contexto'}
                loading={busy === 'context'}
                disabled={locked}
                onPress={onReceiveContext}
              />
            ) : null}
            {state === 'CONTEXT_TRANSFERRED' ? (
              <Button
                label={busy === 'confirm' ? BUSY_LABEL.confirm : 'Confirmar relevo'}
                loading={busy === 'confirm'}
                disabled={locked}
                onPress={() => setConfirming(true)}
              />
            ) : null}
            {state === 'CONFIRMED' && onGoToVisit ? (
              <Button label="Ir a la visita en curso" onPress={onGoToVisit} />
            ) : null}
            {state === 'EXPIRED' && onRequestAgain ? (
              <Button label="Solicitar de nuevo" onPress={onRequestAgain} />
            ) : null}
          </>
        )}
      </View>

      <ConfirmDialog
        visible={confirming}
        title={`¿Ya estás con ${task.visitorName}?`}
        body={`Al confirmar serás la responsable de esta visita. ${task.fromName} queda liberado.`}
        cancelLabel="Todavía no"
        confirmLabel="Sí, asumo la visita"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onConfirm();
        }}
      />
    </Card>
  );
}
