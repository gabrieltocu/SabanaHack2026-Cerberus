import { View } from 'react-native';

import { Icon, Text, Touchable, colors, hitSlop, space } from '../../../../design-system';

/** 1 to 5 stars as a radio group: every star is a labelled target, the value is also written. */
export function Estrellas({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="label">{label}</Text>
      <View
        role="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Touchable
            key={n}
            role="radio"
            label={`${n} de 5 · ${label}`}
            accessibilityState={{ checked: value === n }}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={{
              width: hitSlop.min,
              height: hitSlop.min,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={n <= value ? 'star' : 'star-outline'}
              size={30}
              color={n <= value ? colors.gold : colors.borderStrong}
            />
          </Touchable>
        ))}
        <Text variant="caption" tone="muted" style={{ marginLeft: space[2] }}>
          {value ? `${value} de 5` : 'Sin calificar'}
        </Text>
      </View>
    </View>
  );
}
