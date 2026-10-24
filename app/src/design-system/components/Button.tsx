import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, hitSlop, motion, space } from '../tokens';
import { focusRingStyle, useFocusRing, useReducedMotion, webTransition } from './a11y';

// shadcn names (default, outline, secondary, ghost, destructive, link); `primary` and `danger` are
// the older names of default and destructive and stay valid.
export type ButtonVariant =
  'default' | 'primary' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Use on black grounds (hero, robot reception). */
  onDark?: boolean;
};

type Look = { bg: string; bgPressed: string; fg: string; border: string; underline?: boolean };

const clear = 'transparent';

function look(variant: ButtonVariant, onDark: boolean): Look {
  if (onDark) {
    switch (variant) {
      case 'outline':
      case 'secondary':
        return {
          bg: clear,
          bgPressed: colors.forest800,
          fg: colors.ivory50,
          border: colors.ivory50,
        };
      case 'ghost':
        return { bg: clear, bgPressed: colors.forest800, fg: colors.ivory50, border: clear };
      case 'link':
        return {
          bg: clear,
          bgPressed: clear,
          fg: colors.goldOnDark,
          border: clear,
          underline: true,
        };
      case 'default':
      case 'primary':
        return {
          bg: colors.ivory50,
          bgPressed: colors.bone100,
          fg: colors.forest950,
          border: colors.ivory50,
        };
    }
  }
  switch (variant) {
    case 'default':
    case 'primary':
      return {
        bg: colors.primary,
        bgPressed: colors.primaryPressed,
        fg: colors.onPrimary,
        border: colors.primary,
      };
    case 'outline':
      return {
        bg: clear,
        bgPressed: colors.surfaceSoft,
        fg: colors.primary,
        border: colors.borderStrong,
      };
    case 'secondary':
      return {
        bg: colors.surfaceSoft,
        bgPressed: colors.surfaceMuted,
        fg: colors.primary,
        border: colors.borderStrong,
      };
    case 'ghost':
      return { bg: clear, bgPressed: colors.surfaceSoft, fg: colors.primary, border: clear };
    case 'link':
      return { bg: clear, bgPressed: clear, fg: colors.primary, border: clear, underline: true };
    case 'destructive':
    case 'danger':
      return {
        bg: colors.danger,
        bgPressed: colors.dangerPressed,
        fg: colors.white,
        border: colors.danger,
      };
  }
}

const sizes: Record<ButtonSize, { minHeight: number; paddingH: number; font: number }> = {
  sm: { minHeight: hitSlop.min, paddingH: space[4], font: 14 },
  md: { minHeight: hitSlop.control, paddingH: space[5], font: 15 },
  lg: { minHeight: 56, paddingH: space[6], font: 16 },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  onDark = false,
  onPress,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;
  const l = look(variant, onDark);
  const s = sizes[size];
  const ring = useFocusRing();
  const reduced = useReducedMotion();
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      onFocus={(e) => {
        ring.onFocus(e);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        ring.onBlur();
        rest.onBlur?.(e);
      }}
      style={({ pressed }): ViewStyle[] => [
        {
          minHeight: s.minHeight,
          minWidth: hitSlop.min,
          paddingHorizontal: s.paddingH,
          paddingVertical: space[2],
          borderWidth: 1,
          borderColor: l.border,
          backgroundColor: pressed && !inert ? l.bgPressed : l.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space[2],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : 1,
          ...(Platform.OS === 'web' ? { cursor: inert ? 'auto' : 'pointer' } : null),
        },
        webTransition('background-color, border-color', motion.fast, reduced),
        ring.focusVisible ? focusRingStyle(onDark) : {},
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={l.fg} /> : null}
      <RNText
        style={{
          fontFamily: fonts.bodyMedium,
          fontSize: s.font,
          lineHeight: Math.round(s.font * 1.35),
          letterSpacing: 0.2,
          color: l.fg,
          textAlign: 'center',
          textDecorationLine: l.underline ? 'underline' : 'none',
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}
