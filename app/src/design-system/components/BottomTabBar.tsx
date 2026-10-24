import { View } from 'react-native';
import { colors, fonts, hitSlop, layout, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { useInsets } from './useInsets';

/** Height of the bar without the safe-area inset. */
export const TAB_BAR_HEIGHT = 64;

export type TabItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Legacy selected glyph; the bar keeps the outline icon in both states. */
  activeIcon?: IconName;
  /** Count shown as a dot with a number (0 or undefined hides it). */
  badge?: number;
};

export type BottomTabBarProps = {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
};

/**
 * Warm-white bar with a black top line; the active tab has a gold icon, an ink label and a 2 px gold
 * line on top. Persistent bottom bar (3 to 5 tabs). Paints the safe-area inset below itself and keeps its
 * content inside the 600 px app column on wide windows. Screens must leave `TAB_BAR_HEIGHT`
 * of room at the bottom (AppShell does).
 */
export function BottomTabBar({ items, activeKey, onSelect }: BottomTabBarProps) {
  const insets = useInsets();
  return (
    <View
      style={{
        backgroundColor: colors.paper,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        alignItems: 'center',
      }}
    >
      <View
        role="tablist"
        accessibilityLabel="Secciones"
        style={{
          flexDirection: 'row',
          width: '100%',
          maxWidth: layout.app,
          height: TAB_BAR_HEIGHT,
          paddingHorizontal: space[2],
        }}
      >
        {items.map((item) => {
          const active = item.key === activeKey;
          const tint = active ? colors.gold : colors.textMuted;
          return (
            <Touchable
              key={item.key}
              role="tab"
              label={item.label}
              onPress={() => onSelect(item.key)}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: hitSlop.min,
                alignItems: 'center',
                justifyContent: 'center',
                gap: space[1],
                backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
              })}
            >
              <View
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 32,
                  height: 2,
                  backgroundColor: active ? colors.gold : 'transparent',
                }}
              />
              <View>
                <Icon name={item.icon} size={22} color={tint} />
                {item.badge ? (
                  <View
                    accessible
                    accessibilityLabel={`${item.badge} pendientes`}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -10,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.error,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.white,
                        fontSize: 11,
                        lineHeight: 14,
                        fontFamily: fonts.bodyStrong,
                      }}
                    >
                      {item.badge > 99 ? '99+' : String(item.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: active ? fonts.bodyStrong : fonts.body,
                  fontSize: 11,
                  lineHeight: 16,
                  color: active ? colors.text : colors.textMuted,
                }}
              >
                {item.label}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}
