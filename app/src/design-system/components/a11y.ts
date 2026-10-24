import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type ViewStyle } from 'react-native';
import { colors } from '../tokens';

/** True when the user asked the OS/browser to reduce motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type FocusEventLike = { target?: { matches?: (selector: string) => boolean } };

/** Keyboard-only focus ring state: mouse/touch focus does not light the ring (web). */
export function useFocusRing() {
  const [focusVisible, setVisible] = useState(false);
  return {
    focusVisible,
    onFocus: (e: unknown) => {
      const t = (e as FocusEventLike | undefined)?.target;
      setVisible(typeof t?.matches === 'function' && t.matches(':focus-visible'));
    },
    onBlur: () => setVisible(false),
  };
}

export function focusRingStyle(onDark = false): ViewStyle {
  return {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineOffset: 2,
    outlineColor: onDark ? colors.focusOnDark : colors.focus,
  };
}

/** CSS transition for web only (React Native's style types do not list it); off with reduced motion. */
export function webTransition(properties: string, ms: number, reduced: boolean): ViewStyle {
  if (Platform.OS !== 'web') return {};
  return {
    transitionProperty: properties,
    transitionDuration: `${reduced ? 0 : ms}ms`,
  } as object as ViewStyle;
}

/**
 * react-native-web understands these ARIA attributes but React Native's types do not list them.
 * Spread the result into a component's props.
 */
export function aria(
  attrs: Record<`aria-${string}`, string | number | boolean | undefined>,
): object {
  return attrs;
}
