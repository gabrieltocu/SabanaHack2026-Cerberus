import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Divider, Text, hitSlop, space, useBreakpoint } from '../../design-system';
import { focusRingStyle, useFocusRing } from '../../design-system/components/a11y';

/**
 * Accordion block: closed by default on phones (375), open from tablet up, as the cover spec asks.
 * The header is a button that says whether it is expanded.
 */
export function Disclosure({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  /** Overrides the responsive default. */
  defaultOpen?: boolean;
}) {
  const { isTablet } = useBreakpoint();
  const [open, setOpen] = useState(defaultOpen ?? isTablet);
  const ring = useFocusRing();
  return (
    <View style={{ gap: space[3], alignSelf: 'stretch' }}>
      <Divider />
      <Pressable
        role="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        onFocus={ring.onFocus}
        onBlur={ring.onBlur}
        style={[
          { minHeight: hitSlop.min, justifyContent: 'center' },
          ring.focusVisible ? focusRingStyle() : null,
        ]}
      >
        <Text variant="h3">{`${open ? '▾' : '▸'} ${title}`}</Text>
      </Pressable>
      {open ? <View style={{ gap: space[4] }}>{children}</View> : null}
    </View>
  );
}
