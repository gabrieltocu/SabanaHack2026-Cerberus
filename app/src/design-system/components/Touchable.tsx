import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { focusRingStyle, useFocusRing } from './a11y';

type State = { pressed: boolean };

export type TouchableProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Accessible name (always required: these targets are icons or composed rows). */
  label: string;
  style?: ViewStyle | ((state: State) => ViewStyle);
  children?: ReactNode | ((state: State) => ReactNode);
  onDark?: boolean;
};

/** Pressable with the system's keyboard focus ring and a pointer cursor on web. */
export function Touchable({
  label,
  style,
  children,
  onDark = false,
  disabled,
  onFocus,
  onBlur,
  ...rest
}: TouchableProps) {
  const ring = useFocusRing();
  return (
    <Pressable
      role="button"
      {...rest}
      accessibilityLabel={label}
      accessibilityState={{ ...rest.accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      onFocus={(e) => {
        ring.onFocus(e);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        ring.onBlur();
        onBlur?.(e);
      }}
      style={(s): ViewStyle[] => [
        (typeof style === 'function' ? style(s) : style) ?? {},
        Platform.OS === 'web' ? ({ cursor: disabled ? 'auto' : 'pointer' } as ViewStyle) : {},
        ring.focusVisible ? focusRingStyle(onDark) : {},
      ]}
    >
      {children}
    </Pressable>
  );
}
