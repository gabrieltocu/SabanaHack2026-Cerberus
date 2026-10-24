import { colors, space, type ChipKind } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { View } from 'react-native';

export type ListRowTint = 'gold' | 'forest' | 'pine';

export type ListRowProps = {
  icon: IconName;
  title: string;
  description?: string;
  /** Kept for existing callers: the icon is always antique gold on the flat skin. */
  tint?: ListRowTint | ChipKind;
  onPress: () => void;
  /** Longer spoken name; defaults to title and description. */
  accessibilityLabel?: string;
  /** `link` when the row navigates. */
  role?: 'button' | 'link';
  /** Gold line around the one featured row of a list. */
  featured?: boolean;
};

/** Flat row: black 1 px line, gold line icon, bold title, short grey description and a chevron. */
export function ListRow({
  icon,
  title,
  description,
  onPress,
  accessibilityLabel,
  role = 'button',
  featured = false,
}: ListRowProps) {
  return (
    <Touchable
      role={role}
      label={accessibilityLabel ?? (description ? `${title}, ${description}` : title)}
      onPress={onPress}
      // react-native-web does not turn Enter into a press for role="link" (a native <a> would).
      {...(role === 'link'
        ? ({
            onKeyDown: (e: { key?: string }) => {
              if (e.key === 'Enter') onPress();
            },
          } as object)
        : null)}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[4],
        minHeight: 64,
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        borderWidth: 1,
        borderColor: featured ? colors.gold : colors.border,
        backgroundColor: pressed ? colors.surfaceSoft : colors.paper,
      })}
    >
      <View aria-hidden style={{ width: 24, alignItems: 'center' }}>
        <Icon name={icon} size={24} color={colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ fontSize: 16 }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward-outline" size={20} color={colors.textMuted} />
    </Touchable>
  );
}
