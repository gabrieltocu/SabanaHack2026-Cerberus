import { useEffect, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { Text, type TextProps } from '../../design-system/components/Text';

/**
 * Title that takes the focus whenever `focusKey` changes (screens.md §0.8: every change of
 * screen or step moves focus to its title). On web the wrapper is focusable with tabindex -1,
 * so the next Tab continues from the title and screen readers read it.
 */
export function Heading({ focusKey, ...props }: TextProps & { focusKey?: unknown }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    (ref.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, [focusKey]);
  return (
    <View ref={ref} tabIndex={-1} style={{ outlineStyle: 'solid', outlineWidth: 0 }}>
      <Text {...props} />
    </View>
  );
}
