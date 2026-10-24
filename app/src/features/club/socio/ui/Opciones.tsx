import { Pressable, View } from 'react-native';

import { Text, colors, fonts, hitSlop, space } from '../../../../design-system';
import { focusRingStyle, useFocusRing } from '../../../../design-system/components/a11y';

export type Opcion = { value: string; label: string };

function Una({
  option,
  checked,
  disabled,
  onSelect,
}: {
  option: Opcion;
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
          justifyContent: 'center',
          paddingHorizontal: space[4],
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: checked ? colors.primary : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.bodyMedium,
          fontSize: 14,
          lineHeight: 20,
          color: checked ? colors.onPrimary : colors.text,
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

/** Single choice (`radiogroup`) as square buttons: the chosen one is black with a gold label. */
export function Opciones({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  options: readonly Opcion[];
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
          <Una
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

/** Two or three tabs on a soft strip, like Próximas / Historial: the active one is white. */
export function Pestanas({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Opcion[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View
      role="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceSoft, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const activa = o.value === value;
        return (
          <Pressable
            key={o.value}
            role="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: activa }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: activa ? colors.surface : 'transparent',
              borderWidth: 1,
              borderColor: activa ? colors.border : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: activa ? fonts.bodyStrong : fonts.bodyMedium,
                fontSize: 14,
                lineHeight: 20,
                color: activa ? colors.text : colors.textMuted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
