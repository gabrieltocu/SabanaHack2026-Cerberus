import { useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, hitSlop, space } from '../tokens';
import { aria, focusRingStyle } from './a11y';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  /** Always visible; placeholders never replace it. */
  label: string;
  hint?: string;
  /** Announced to assistive tech as soon as it appears. */
  error?: string;
  required?: boolean;
  requiredLabel?: string;
};

/** Square field: black 1 px line, gold focus ring, label always above. */
export function TextField({
  label,
  hint,
  error,
  required,
  requiredLabel = 'obligatorio',
  editable = true,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <View style={{ gap: space[2], alignSelf: 'stretch' }}>
      <Text variant="label">
        {label}
        {required ? ` (${requiredLabel})` : ''}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        editable={editable}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        {...aria({
          'aria-invalid': error ? true : undefined,
          'aria-required': required ? true : undefined,
          'aria-describedby': describedBy || undefined,
        })}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: hitSlop.control,
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.text,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
            borderWidth: error ? 2 : 1,
            borderColor: error ? colors.danger : colors.borderStrong,
          },
          focused
            ? { ...focusRingStyle(), outlineColor: colors.gold }
            : { outlineStyle: 'solid', outlineWidth: 0 },
          rest.multiline ? { minHeight: 112, textAlignVertical: 'top' } : null,
        ]}
      />
      {hint ? (
        <Text variant="caption" tone="muted" nativeID={hintId}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text
          variant="caption"
          tone="danger"
          role="alert"
          accessibilityLiveRegion="assertive"
          nativeID={errorId}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
