import { useState } from 'react';
import { View } from 'react-native';
import { Button, Text, space } from '../../design-system';
import { SIMULATED_DATES } from '../demo/fixtures';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { dateLabel } from '../shared/dates';

export type DemoControlsProps = {
  /** Civil date the API clock shows (`AAAA-MM-DD`); undefined while it loads. */
  today?: string;
  /** Moves the demonstration clock. It also restarts the shared state (`POST /demo/reset`). */
  onDate: (date: string) => void;
  onReset: () => void;
  disabled?: boolean;
};

/** Presenter controls that act on the whole demonstration, not on one visit. */
export function DemoControls({ today, onDate, onReset, disabled = false }: DemoControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const current = SIMULATED_DATES.find((d) => d.value === today);
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Text variant="label">Fecha de trabajo</Text>
        {today ? (
          <Text variant="caption" tone="muted">
            {`Hoy: ${current?.label ?? dateLabel(today)}`}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {SIMULATED_DATES.map((d) => (
          <Button
            key={d.value}
            label={d.label}
            size="sm"
            variant={d.value === today ? 'primary' : 'secondary'}
            disabled={disabled || d.value === today}
            onPress={() => onDate(d.value)}
          />
        ))}
        <Button
          label="Reiniciar datos"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onPress={() => setConfirming(true)}
        />
      </View>
      <ConfirmDialog
        visible={confirming}
        title="¿Reiniciar los datos?"
        body="Se borran las visitas, invitaciones y relevos creados y vuelven los datos iniciales."
        cancelLabel="Cancelar"
        confirmLabel="Reiniciar"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onReset();
        }}
      />
    </View>
  );
}
