import { Pressable, View } from 'react-native';
import { Text, colors, hitSlop, radii, space } from '../../design-system';
import { focusRingStyle, useFocusRing } from '../../design-system/components/a11y';

export type Option = { value: string; label: string };

function Radio({
  option,
  checked,
  disabled,
  onSelect,
}: {
  option: Option;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const ring = useFocusRing();
  return (
    <Pressable
      role="radio"
      accessibilityLabel={option.label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onSelect}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        {
          minHeight: hitSlop.min,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingVertical: space[2],
          paddingHorizontal: space[3],
          borderWidth: 1,
          borderRadius: radii.md,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.surfaceSoft : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <View style={{ width: 8, height: 8, backgroundColor: colors.primary }} /> : null}
      </View>
      <Text variant="label">{option.label}</Text>
    </Pressable>
  );
}

/** Single-choice group (`radiogroup`) with a visible label. Arrow-key roving is not implemented. */
export function OptionGroup({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <View style={{ gap: space[2], alignSelf: 'stretch' }}>
      <Text variant="label">{label}</Text>
      <View
        role="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
      >
        {options.map((o) => (
          <Radio
            key={o.value}
            option={o}
            checked={o.value === value}
            disabled={disabled}
            onSelect={() => onChange(o.value)}
          />
        ))}
      </View>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
