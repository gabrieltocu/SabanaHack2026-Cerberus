import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Icon, Text, TextField, colors, hitSlop, space } from '../../../../design-system';
import { focusRingStyle, useFocusRing } from '../../../../design-system/components/a11y';
import type { Opcion } from '../catalogos';

const MAX_OTRAS = 5;

function Chip({
  label,
  selected,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  icon?: 'add-outline' | 'close-outline';
}) {
  const ring = useFocusRing();
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        {
          minHeight: hitSlop.min,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[1],
          paddingHorizontal: space[4],
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
        ring.focusVisible ? focusRingStyle() : null,
      ]}
    >
      {selected ? <Icon name="checkmark-outline" size={16} color={colors.onPrimary} /> : null}
      {icon && !selected ? <Icon name={icon} size={16} color={colors.text} /> : null}
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Multi-select chips plus "Otra": free text becomes one more selected chip (tap it to remove).
 * `value` holds catalogue values and free texts together, in the order they were picked.
 */
export function ChipsField({
  label,
  hint,
  opciones,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  opciones: readonly Opcion[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const conocidos = new Set(opciones.map((o) => o.value));
  const otras = value.filter((v) => !conocidos.has(v));
  const alternar = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const agregar = () => {
    const t = texto.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setTexto('');
    setEscribiendo(false);
  };
  return (
    <View style={{ gap: space[2], alignSelf: 'stretch' }}>
      <Text variant="label">{label}</Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      <View
        role="group"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
      >
        {opciones.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={value.includes(o.value)}
            disabled={disabled}
            onPress={() => alternar(o.value)}
          />
        ))}
        {otras.map((o) => (
          <Chip key={o} label={o} selected disabled={disabled} onPress={() => alternar(o)} />
        ))}
        {otras.length < MAX_OTRAS ? (
          <Chip
            label="Otra"
            icon="add-outline"
            selected={false}
            disabled={disabled}
            onPress={() => setEscribiendo((e) => !e)}
          />
        ) : null}
      </View>
      {escribiendo ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Escribe otra opción"
              value={texto}
              maxLength={40}
              autoFocus
              editable={!disabled}
              onChangeText={setTexto}
              onSubmitEditing={agregar}
              returnKeyType="done"
            />
          </View>
          <Button label="Añadir" size="md" disabled={disabled || !texto.trim()} onPress={agregar} />
        </View>
      ) : null}
    </View>
  );
}
