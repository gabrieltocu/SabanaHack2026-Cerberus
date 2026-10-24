import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { colors, layout, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { useInsets } from './useInsets';

export type ToastKind = 'success' | 'error' | 'info';

const look: Record<ToastKind, { icon: IconName; bar: string }> = {
  success: { icon: 'checkmark-circle-outline', bar: colors.goldOnDark },
  error: { icon: 'alert-circle-outline', bar: colors.error },
  info: { icon: 'information-circle-outline', bar: colors.goldOnDark },
};

export type ToastProps = {
  message: string;
  kind?: ToastKind;
  visible: boolean;
  /** Called after `durationMs` and when the close button is pressed. */
  onHide: () => void;
  durationMs?: number;
  /** Space reserved under the toast, e.g. `TAB_BAR_HEIGHT` above a tab bar. */
  bottomOffset?: number;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Transient confirmation floating above the bottom of the screen (black bar, gold line).
 * Errors are announced assertively and stay until closed; the rest hide by themselves.
 */
export function Toast({
  message,
  kind = 'info',
  visible,
  onHide,
  durationMs = 4000,
  bottomOffset = 0,
  actionLabel,
  onAction,
}: ToastProps) {
  const insets = useInsets();
  useEffect(() => {
    if (!visible || kind === 'error') return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [visible, kind, durationMs, onHide, message]);
  if (!visible) return null;
  const l = look[kind];
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + bottomOffset + space[3],
        alignItems: 'center',
        paddingHorizontal: space[4],
      }}
    >
      <View
        role={kind === 'error' ? 'alert' : 'status'}
        accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
        style={{
          width: '100%',
          maxWidth: layout.app - space[4] * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          backgroundColor: colors.forest,
          borderLeftWidth: 4,
          borderLeftColor: l.bar,
        }}
      >
        <Icon name={l.icon} size={22} color={colors.ivory} />
        <Text variant="label" tone="onDark" style={{ flex: 1, fontSize: 15 }}>
          {message}
        </Text>
        {actionLabel && onAction ? (
          <Touchable
            label={actionLabel}
            onPress={onAction}
            onDark
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}
          >
            <Text variant="label" style={{ color: colors.goldOnDark }}>
              {actionLabel}
            </Text>
          </Touchable>
        ) : null}
        <Touchable
          label="Cerrar aviso"
          onPress={onHide}
          onDark
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close-outline" size={20} color={colors.ivory} />
        </Touchable>
      </View>
    </View>
  );
}

/** `show(message, kind)` and a `toast` node to render once near the root of a screen. */
export function useToast(props: Pick<ToastProps, 'bottomOffset' | 'durationMs'> = {}): {
  show: (message: string, kind?: ToastKind) => void;
  toast: ReactNode;
} {
  const [state, setState] = useState<{ message: string; kind: ToastKind } | null>(null);
  const hide = useCallback(() => setState(null), []);
  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => setState({ message, kind }),
    [],
  );
  return {
    show,
    toast: (
      <Toast
        {...props}
        visible={state !== null}
        message={state?.message ?? ''}
        kind={state?.kind ?? 'info'}
        onHide={hide}
      />
    ),
  };
}
