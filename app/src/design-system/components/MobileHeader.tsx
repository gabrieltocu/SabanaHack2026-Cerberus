import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, fonts, hitSlop, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { useInsets } from './useInsets';

export type IconButtonProps = {
  icon: IconName;
  /** Accessible name, e.g. «Volver». */
  label: string;
  onPress: () => void;
  onDark?: boolean;
  disabled?: boolean;
};

/** 44 px borderless icon button for headers and sheets. */
export function IconButton({ icon, label, onPress, onDark = false, disabled }: IconButtonProps) {
  return (
    <Touchable
      label={label}
      onPress={onPress}
      onDark={onDark}
      disabled={disabled}
      style={({ pressed }) => ({
        width: hitSlop.min,
        height: hitSlop.min,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? (onDark ? colors.pine : colors.surfaceSoft) : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon name={icon} size={22} color={onDark ? colors.ivory : colors.text} />
    </Touchable>
  );
}

export type MobileHeaderProps = {
  /** Screen title (a level-1 heading, Geist semibold; Bodoni greeting on the brand header). */
  title: string;
  /** Small line above the title: a date, a role. */
  eyebrow?: string;
  subtitle?: string;
  /** Shows the back arrow; leave undefined on tab roots. */
  onBack?: () => void;
  backLabel?: string;
  /** Trailing actions, usually one or two `IconButton`s. */
  right?: ReactNode;
  /** `dark` is a black band; `light` sits on the warm-white ground. */
  tone?: 'light' | 'dark';
  /** Pads the status-bar inset. Turn off when something above already did. */
  safeTop?: boolean;
  /** Brand header: the N Club logo with a thin gold line under it, then the title as a greeting. */
  brand?: boolean;
  /** Extra content inside the band, under the title. */
  children?: ReactNode;
};

/** Top bar of a phone screen: optional back arrow, title block and trailing actions. */
export function MobileHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  backLabel = 'Volver',
  right,
  tone = 'light',
  safeTop = true,
  brand = false,
  children,
}: MobileHeaderProps) {
  const insets = useInsets();
  const dark = tone === 'dark';
  return (
    <View
      style={{
        backgroundColor: dark ? colors.forest : colors.ivory,
        paddingTop: (safeTop ? insets.top : 0) + space[4],
        paddingBottom: dark ? space[5] : space[4],
        paddingLeft: space[4] + insets.left,
        paddingRight: space[4] + insets.right,
        gap: space[4],
      }}
    >
      {brand ? (
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
            <View style={{ flex: 1 }}>
              <Logo size={28} wordmark="row" onDark={dark} />
            </View>
            {right ? <View style={{ flexDirection: 'row', gap: space[1] }}>{right}</View> : null}
          </View>
          <View aria-hidden style={{ height: 1, backgroundColor: colors.gold }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 }}>
        {onBack ? (
          <IconButton
            icon="chevron-back-outline"
            label={backLabel}
            onPress={onBack}
            onDark={dark}
          />
        ) : null}
        <View style={{ flex: 1, gap: space[1] }}>
          {eyebrow ? (
            <Text variant="caption" tone={dark ? 'mutedOnDark' : 'muted'}>
              {eyebrow}
            </Text>
          ) : null}
          <Text
            variant="title"
            tone={dark ? 'onDark' : 'default'}
            style={
              brand
                ? { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 }
                : { fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26, letterSpacing: 0 }
            }
          >
            {title}
          </Text>
          {subtitle ? (
            <Text variant="label" tone={dark ? 'mutedOnDark' : 'muted'}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right && !brand ? (
          <View style={{ flexDirection: 'row', gap: space[1] }}>{right}</View>
        ) : null}
      </View>
      {children}
    </View>
  );
}
