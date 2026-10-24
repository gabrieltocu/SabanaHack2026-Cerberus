import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { colors, layout, space } from '../tokens';
import { BottomTabBar, type BottomTabBarProps } from './BottomTabBar';
import { MobileHeader, type MobileHeaderProps } from './MobileHeader';

export type AppShellProps = {
  children: ReactNode;
  /** Persistent bottom tabs. Leave out when the navigator draws its own bar. */
  tabs?: BottomTabBarProps;
  /** Pinned at the top of the column, above the content (e.g. `OfflineBanner`). */
  banner?: ReactNode;
  /** Rendered last so it floats over everything (`useToast().toast`). */
  toast?: ReactNode;
};

/**
 * Frame of the phone app: a 600 px column (full width on a phone, centred on wide windows over
 * a soft backdrop) holding the content and, optionally, the bottom tabs.
 */
export function AppShell({ children, tabs, banner, toast }: AppShellProps) {
  // On a wide window the column gets black side lines over a soft backdrop.
  const wide = useWindowDimensions().width > layout.app;
  return (
    <View
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.surfaceSoft, alignItems: 'center' }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: layout.app,
          backgroundColor: colors.bg,
          borderLeftWidth: wide ? 1 : 0,
          borderRightWidth: wide ? 1 : 0,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {banner ? <View style={{ padding: space[3] }}>{banner}</View> : null}
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {tabs ? <BottomTabBar {...tabs} /> : null}
        {toast}
      </View>
    </View>
  );
}

export type AppScreenProps = Omit<MobileHeaderProps, 'children'> & {
  children: ReactNode;
  /** Extra content inside the header band (see `MobileHeader`). */
  headerContent?: ReactNode;
  /** `false` for screens that manage their own scrolling (lists). */
  scroll?: boolean;
};

/** One tab screen: `MobileHeader` plus a scrolling body with the standard 16 px gutter and gap. */
export function AppScreen({ children, headerContent, scroll = true, ...header }: AppScreenProps) {
  const body = { paddingHorizontal: space[4], paddingBottom: space[6], gap: space[4] } as const;
  return (
    <View role="main" style={{ flex: 1, minHeight: 0, backgroundColor: colors.ivory }}>
      <MobileHeader {...header}>{headerContent}</MobileHeader>
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...body, paddingTop: space[4] }}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, ...body, paddingTop: space[4] }}>{children}</View>
      )}
    </View>
  );
}
