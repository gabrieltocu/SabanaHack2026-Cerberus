import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, type DimensionValue } from 'react-native';
import { colors, motion } from '../tokens';
import { useReducedMotion } from './a11y';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** Give it a label to expose it as a progress indicator; otherwise it is decorative. */
  label?: string;
};

/** Placeholder block. Breathes slowly (opacity only); static with reduced motion. */
export function Skeleton({ width = '100%', height = 16, label }: SkeletonProps) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: motion.slow * 3,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.slow * 3,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity]);

  const a11y = label
    ? ({ accessible: true, accessibilityRole: 'progressbar', accessibilityLabel: label } as const)
    : ({
        accessible: false,
        importantForAccessibility: 'no-hide-descendants',
        'aria-hidden': true,
      } as const);
  return (
    <Animated.View
      {...a11y}
      style={{
        width,
        height,
        backgroundColor: colors.skeleton,
        opacity,
      }}
    />
  );
}
