import { useContext, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors, layout, space } from '../tokens';
import { useBreakpoint } from './useBreakpoint';

export type ScreenProps = {
  children: ReactNode;
  /** dark = forest ground, reserved for reception, heroes and primary states. */
  tone?: 'light' | 'dark';
  /** narrow: reading column (640). content: wide pages (1120). */
  width?: 'narrow' | 'content';
  scroll?: boolean;
};

export function Screen({
  children,
  tone = 'light',
  width = 'content',
  scroll = true,
}: ScreenProps) {
  // Works with or without a SafeAreaProvider (tests, isolated stories).
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { gutter } = useBreakpoint();
  const column = (
    <View
      role="main"
      style={{
        width: '100%',
        maxWidth: width === 'narrow' ? layout.narrow : layout.content,
        paddingHorizontal: gutter,
        paddingTop: space[6],
        paddingBottom: space[8],
        gap: space[6],
      }}
    >
      {children}
    </View>
  );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tone === 'dark' ? colors.bgDark : colors.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={{ alignItems: 'center' }}>{column}</ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center' }}>{column}</View>
      )}
    </View>
  );
}
