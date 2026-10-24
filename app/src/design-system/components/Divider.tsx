import { View, type ViewProps } from 'react-native';
import { colors } from '../tokens';

export type DividerProps = ViewProps & {
  /** accent: a short champagne rule, used once per screen as a signature, never as text. */
  variant?: 'line' | 'accent';
  onDark?: boolean;
};

export function Divider({ variant = 'line', onDark = false, style, ...rest }: DividerProps) {
  const accent = variant === 'accent';
  return (
    <View
      role="separator"
      {...rest}
      style={[
        {
          height: accent ? 2 : 1,
          width: accent ? 40 : '100%',
          backgroundColor: accent ? colors.accent : onDark ? colors.forest800 : colors.border,
        },
        style,
      ]}
    />
  );
}
