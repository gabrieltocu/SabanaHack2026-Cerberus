import { Pressable, View } from 'react-native';

import { Icon, Text, colors, hitSlop, space } from '../../../../design-system';
import { focusRingStyle, useFocusRing } from '../../../../design-system/components/a11y';

/** Square checkbox with its text always visible; the whole row is the touch target. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  invalid = false,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const ring = useFocusRing();
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        {
          minHeight: hitSlop.min,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space[3],
          paddingVertical: space[2],
          opacity: disabled ? 0.5 : 1,
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          marginTop: 1,
          borderWidth: invalid ? 2 : 1.5,
          borderColor: invalid ? colors.danger : checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Icon name="checkmark-outline" size={18} color={colors.onPrimary} /> : null}
      </View>
      <Text variant="label" style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>
        {label}
      </Text>
    </Pressable>
  );
}
