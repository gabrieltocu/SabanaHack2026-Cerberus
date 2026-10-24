import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { colors, space } from '../tokens';
import { Text } from './Text';

export type BannerKind = 'info' | 'warning' | 'error';

const looks = {
  info: { bg: colors.infoBg, bar: colors.info },
  warning: { bg: colors.warningBg, bar: colors.warning },
  error: { bg: colors.dangerBg, bar: colors.danger },
};

export type BannerProps = Omit<ViewProps, 'children'> & {
  kind?: BannerKind;
  title?: string;
  children?: ReactNode;
};

/** Flat notice: black 1 px line, a 4 px bar on the left carries the kind. */
export function Banner({ kind = 'info', title, children, style, ...rest }: BannerProps) {
  const l = looks[kind];
  const urgent = kind === 'error';
  return (
    <View
      role={urgent ? 'alert' : 'status'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      {...rest}
      style={[
        {
          backgroundColor: l.bg,
          borderLeftWidth: 4,
          borderLeftColor: l.bar,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          gap: space[2],
        },
        style,
      ]}
    >
      {title ? <Text variant="label">{title}</Text> : null}
      {typeof children === 'string' ? (
        <Text variant="body" style={{ fontSize: 15 }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
