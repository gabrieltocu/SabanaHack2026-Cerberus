import { View, type ViewProps } from 'react-native';
import { colors, space } from '../tokens';
import { useBreakpoint } from './useBreakpoint';

export type CardVariant = 'plain' | 'soft' | 'dark';

export type CardProps = ViewProps & {
  /** plain: white with a black line. soft: soft grey fill. dark: black, for hero-like cards. */
  variant?: CardVariant;
  /** highlight: gold line for the one featured block of a screen. */
  tone?: 'default' | 'highlight';
};

const looks = {
  plain: { backgroundColor: colors.surface, borderColor: colors.border },
  soft: { backgroundColor: colors.surfaceSoft, borderColor: colors.surfaceSoft },
  dark: { backgroundColor: colors.bgDark, borderColor: colors.bgDark },
} as const;

/** Flat card: square corners, 1 px line, no shadow. */
export function Card({ variant = 'plain', tone = 'default', style, ...rest }: CardProps) {
  const { isTablet } = useBreakpoint();
  return (
    <View
      {...rest}
      style={[
        looks[variant],
        tone === 'highlight' ? { borderColor: colors.gold } : null,
        {
          borderWidth: 1,
          padding: isTablet ? space[6] : space[5],
          gap: space[3],
        },
        style,
      ]}
    />
  );
}
