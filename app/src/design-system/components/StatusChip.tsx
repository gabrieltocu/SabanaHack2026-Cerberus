import { Text as RNText, View, type ViewProps } from 'react-native';
import { colors, fonts, space, type ChipKind } from '../tokens';
import type { StatusKind } from './Badge';
import { Icon, type IconName } from './Icon';

export type StatusChipKind = ChipKind | StatusKind;

const defaultLabel: Record<ChipKind, string> = {
  VIP: 'VIP',
  REGULAR: 'Regular',
  GUEST: 'Invitado',
  STAFF: 'Personal',
  EXTERNAL: 'Externo',
  ESCALATION: 'Escalamiento',
};

type Look = { bg: string; fg: string; border: string };

// Sober: a thin line and ink text; only VIP (black and gold) and the warning tones stand out.
const categoryLooks: Record<ChipKind, Look> = {
  VIP: { bg: colors.forest950, fg: colors.goldOnDark, border: colors.forest950 },
  REGULAR: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
  GUEST: { bg: colors.surfaceSoft, fg: colors.text, border: colors.surfaceSoft },
  STAFF: { bg: colors.forest800, fg: colors.white, border: colors.forest800 },
  EXTERNAL: { bg: 'transparent', fg: colors.textMuted, border: colors.borderStrong },
  ESCALATION: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
};

const statusLooks: Record<StatusKind, Look> = {
  neutral: { bg: 'transparent', fg: colors.textMuted, border: colors.borderStrong },
  success: { bg: colors.successBg, fg: colors.success, border: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning, border: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info, border: colors.info },
};

export type StatusChipProps = Omit<ViewProps, 'children'> & {
  /** Category (VIP, REGULAR, GUEST, STAFF, EXTERNAL, ESCALATION) or status (neutral, success, ...). */
  kind: StatusChipKind;
  /** Required for status kinds; categories fall back to their Spanish name. */
  label?: string;
  /** Optional leading glyph. Without it a small dot of the text colour marks the chip. */
  icon?: IconName;
};

/** Square chip with a square dot or icon and a thin line. */
export function StatusChip({ kind, label, icon, style, ...rest }: StatusChipProps) {
  const look =
    kind in categoryLooks ? categoryLooks[kind as ChipKind] : statusLooks[kind as StatusKind];
  const text = label ?? (kind in defaultLabel ? defaultLabel[kind as ChipKind] : '');
  return (
    <View
      accessible
      accessibilityLabel={text}
      {...rest}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[1] + 2,
          minHeight: 28,
          paddingHorizontal: space[3],
          paddingVertical: 2,
          borderWidth: 1,
          backgroundColor: look.bg,
          borderColor: look.border,
        },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={14} color={look.fg} />
      ) : (
        <View aria-hidden style={{ width: 6, height: 6, backgroundColor: look.fg }} />
      )}
      <RNText
        style={{
          fontFamily: fonts.bodyStrong,
          fontSize: 13,
          lineHeight: 18,
          letterSpacing: 0.2,
          color: look.fg,
        }}
      >
        {text}
      </RNText>
    </View>
  );
}
