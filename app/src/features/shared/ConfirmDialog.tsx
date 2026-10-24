import { Modal, View } from 'react-native';
import { Button, Text, colors, radii, space } from '../../design-system';

/**
 * G8: modal with its consequence in one sentence. Cancel on the left, action on the right;
 * `Esc` / back cancel through `onRequestClose` (react-native-web traps focus inside Modal).
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[5],
          backgroundColor: 'rgba(16, 35, 29, 0.72)',
        }}
      >
        <View
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            width: '100%',
            maxWidth: 480,
            gap: space[4],
            padding: space[6],
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderTopWidth: 3,
            borderTopColor: colors.accent,
          }}
        >
          <Text variant="h2">{title}</Text>
          <Text tone="muted">{body}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
            <Button
              label={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
