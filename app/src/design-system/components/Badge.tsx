import { Text as RNText, View, type ViewProps } from 'react-native';
import { colors, fonts, space } from '../tokens';

export type CategoryKind = 'VIP' | 'REGULAR' | 'GUEST' | 'STAFF' | 'EXTERNAL';
export type StatusKind = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeKind = CategoryKind | StatusKind;

const defaultLabel: Record<CategoryKind, string> = {
  VIP: 'VIP',
  REGULAR: 'Regular',
  GUEST: 'Invitado',
  STAFF: 'Personal',
  EXTERNAL: 'Externo',
};

type Look = { bg: string; fg: string; border: string };

const looks: Record<BadgeKind, Look> = {
  VIP: { bg: colors.forest950, fg: colors.goldOnDark, border: colors.forest950 },
  REGULAR: { bg: 'transparent', fg: colors.espresso900, border: colors.borderStrong },
  GUEST: { bg: colors.sage200, fg: colors.forest950, border: colors.sage200 },
  STAFF: { bg: colors.forest800, fg: colors.white, border: colors.forest800 },
  EXTERNAL: { bg: 'transparent', fg: colors.textMuted, border: colors.borderStrong },
  neutral: { bg: 'transparent', fg: colors.textMuted, border: colors.borderStrong },
  success: { bg: colors.successBg, fg: colors.success, border: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning, border: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info, border: colors.info },
};

export type BadgeProps = Omit<ViewProps, 'children'> & {
  kind: BadgeKind;
  /** Required for status kinds; categories fall back to their Spanish name. */
  label?: string;
};

/** Square, quiet tag with a thin line. Use sparingly: most screens say status in a sentence. */
export function Badge({ kind, label, style, ...rest }: BadgeProps) {
  const l = looks[kind];
  const text = label ?? (kind in defaultLabel ? defaultLabel[kind as CategoryKind] : '');
  return (
    <View
      accessible
      accessibilityLabel={text}
      {...rest}
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: space[3],
          paddingVertical: space[1],
          borderWidth: 1,
          backgroundColor: l.bg,
          borderColor: l.border,
        },
        style,
      ]}
    >
      <RNText
        style={{
          fontFamily: fonts.bodyStrong,
          fontSize: 13,
          lineHeight: 18,
          letterSpacing: 0.3,
          color: l.fg,
        }}
      >
        {text}
      </RNText>
    </View>
  );
}
