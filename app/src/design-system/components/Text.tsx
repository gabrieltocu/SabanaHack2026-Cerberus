import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, typography, type TextVariant } from '../tokens';
import { aria } from './a11y';
import { useBreakpoint } from './useBreakpoint';

export type TextTone =
  'default' | 'muted' | 'onDark' | 'mutedOnDark' | 'onPrimary' | 'danger' | 'success' | 'warning';

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  onDark: colors.textOnDark,
  mutedOnDark: colors.textMutedOnDark,
  onPrimary: colors.onPrimary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
};

const headingLevel: Partial<Record<TextVariant, 1 | 2 | 3>> = {
  display: 1,
  title: 1,
  h1: 1,
  h2: 2,
  h3: 3,
};

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  /** Overrides the heading level implied by the variant. */
  level?: 1 | 2 | 3 | 4;
};

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  level,
  style,
  ...rest
}: TextProps) {
  const { index } = useBreakpoint();
  const t = typography[variant];
  const size = typeof t.size === 'number' ? t.size : (t.size[index] ?? t.size[0]);
  const lvl = level ?? headingLevel[variant];
  return (
    <RNText
      {...(lvl ? { role: 'heading' as const, ...aria({ 'aria-level': lvl }) } : null)}
      {...rest}
      style={[
        {
          fontFamily: t.family,
          fontSize: size,
          lineHeight: Math.round(size * t.lineHeight),
          letterSpacing: t.letterSpacing,
          color: toneColor[tone],
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
