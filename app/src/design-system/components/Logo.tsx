import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, fonts } from '../tokens';
import { Text } from './Text';

export type LogoProps = {
  /** Side of the seal in px. */
  size?: number;
  /** Show the `N CLUB` wordmark next to (row) or under (stack) the seal. */
  wordmark?: 'none' | 'row' | 'stack';
  /** Wordmark in ivory for black grounds. */
  onDark?: boolean;
};

/** N Club seal: a Bodoni N inside a double square gold frame, optionally with the wordmark. */
export function Logo({ size = 28, wordmark = 'none', onDark = false }: LogoProps) {
  const seal = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 48 48" style={{ position: 'absolute' }}>
        <Rect
          x={1.5}
          y={1.5}
          width={45}
          height={45}
          fill="none"
          stroke={colors.gold}
          strokeWidth={1.2}
        />
        <Rect
          x={5}
          y={5}
          width={38}
          height={38}
          fill="none"
          stroke={colors.gold}
          strokeWidth={0.6}
        />
      </Svg>
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: size * 0.48,
          lineHeight: size * 0.6,
          color: colors.gold,
        }}
      >
        N
      </Text>
    </View>
  );
  if (wordmark === 'none') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="N Club">
        {seal}
      </View>
    );
  }
  const stack = wordmark === 'stack';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="N Club"
      style={{
        flexDirection: stack ? 'column' : 'row',
        alignItems: 'center',
        gap: stack ? size * 0.25 : 10,
      }}
    >
      {seal}
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: stack ? Math.max(16, size * 0.22) : Math.max(13, size * 0.5),
          letterSpacing: 4,
          color: onDark ? colors.textOnDark : colors.ink,
        }}
      >
        N CLUB
      </Text>
    </View>
  );
}
