import { colors, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type QuickActionProps = {
  icon: IconName;
  /** Short visible label (one or two words: it sits in a 4-up row on a phone). */
  label: string;
  onPress: () => void;
  /** Longer spoken name when the visible label is abbreviated. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

/** Flat shortcut tile: gold line icon over a short label. Put 2 to 4 in a row with `flex: 1`. */
export function QuickAction({
  icon,
  label,
  onPress,
  accessibilityLabel,
  disabled,
}: QuickActionProps) {
  return (
    <Touchable
      label={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 92,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        paddingHorizontal: space[1],
        paddingVertical: space[3],
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon name={icon} size={28} color={colors.gold} />
      <Text variant="label" align="center" numberOfLines={1} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </Touchable>
  );
}
