import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, Text, colors, space } from '../../design-system';
import { focusRingStyle, useFocusRing } from '../../design-system/components/a11y';

/**
 * Robot settings, collapsible so the kiosk stays clean when it is closed.
 */
export function PresenterDrawer({
  children,
  defaultOpen = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ring = useFocusRing();
  return (
    <View
      role="region"
      accessibilityLabel="Ajustes del robot"
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        alignSelf: 'stretch',
      }}
    >
      <Pressable
        role="button"
        accessibilityLabel="Operación"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        onFocus={ring.onFocus}
        onBlur={ring.onBlur}
        style={[
          {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: space[3],
            paddingHorizontal: space[4],
            paddingVertical: space[2],
          },
          ring.focusVisible ? focusRingStyle() : null,
        ]}
      >
        <Icon
          name={open ? 'chevron-down-outline' : 'chevron-forward-outline'}
          size={20}
          color={colors.muted}
        />
        <Text variant="caption" tone="muted">
          Operación
        </Text>
        <Text variant="caption" tone="muted">
          Ajustes del robot
        </Text>
      </Pressable>
      {open ? <View style={{ gap: space[3], padding: space[4] }}>{children}</View> : null}
    </View>
  );
}
