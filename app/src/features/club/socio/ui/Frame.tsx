import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';

import {
  Icon,
  Text,
  Touchable,
  colors,
  fonts,
  hitSlop,
  layout,
  space,
  useInsets,
  type IconName,
} from '../../../../design-system';

const GUTTER = layout.gutter.mobile;

/** 44 px icon target for headers: the glyph alone, no box. */
export function IconoBoton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Touchable
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: hitSlop.min,
        height: hitSlop.min,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon name={icon} size={22} color={colors.text} />
    </Touchable>
  );
}

/** Plain title bar: optional back arrow, a short Geist title and one trailing action. */
function Encabezado({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const insets = useInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + space[2],
        paddingLeft: GUTTER - (onBack ? space[2] : 0) + insets.left,
        paddingRight: GUTTER - space[3] + insets.right,
        paddingBottom: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        minHeight: hitSlop.min + space[3],
      }}
    >
      {onBack ? <IconoBoton icon="chevron-back-outline" label="Volver" onPress={onBack} /> : null}
      {title ? (
        <Text
          level={1}
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fonts.bodyStrong,
            fontSize: 18,
            lineHeight: 26,
            paddingLeft: onBack ? 0 : space[2],
          }}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}

export type FrameProps = {
  /** Short title (Geist). Ignored when `header` is given. */
  title?: string;
  /** Own header for tab roots (brand line + greeting) and for detail screens. */
  header?: ReactNode;
  /** Shows the back arrow: stacked screens only. */
  onBack?: () => void;
  right?: ReactNode;
  /** Fixed above the tab bar, reachable with the thumb. */
  footer?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Changing it scrolls to the top (e.g. to show form errors). */
  scrollTopKey?: number;
  children: ReactNode;
};

/** Phone screen of the socio app: header, scrolling body and a fixed action bar. Sits inside AppShell. */
export function Frame({
  title = '',
  header,
  onBack,
  right,
  footer,
  onRefresh,
  refreshing = false,
  scrollTopKey,
  children,
}: FrameProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (scrollTopKey) scroll.current?.scrollTo?.({ y: 0, animated: true });
  }, [scrollTopKey]);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}
    >
      <View role="main" style={{ flex: 1, minHeight: 0 }}>
        {header ?? <Encabezado title={title} onBack={onBack} right={right} />}
        <ScrollView
          ref={scroll}
          style={{ flex: 1, minHeight: 0 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
          contentContainerStyle={{
            paddingHorizontal: GUTTER,
            paddingTop: space[3],
            paddingBottom: space[6],
            gap: space[5],
          }}
        >
          {children}
        </ScrollView>
      </View>
      {footer ? (
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: GUTTER,
            paddingTop: space[3],
            flexShrink: 0,
            paddingBottom: space[3],
            gap: space[2],
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Line of the brand header and of the section titles: quiet capitals, not a heading level. */
export function Etiqueta({ children }: { children: string }) {
  return (
    <Text
      variant="caption"
      tone="muted"
      style={{ fontFamily: fonts.bodyMedium, letterSpacing: 2, textTransform: 'uppercase' }}
    >
      {children}
    </Text>
  );
}

/** Title of a block inside a screen (Geist, level 2): Bodoni stays for names and greetings. */
export function Subtitulo({ children, level = 2 }: { children: string; level?: 2 | 3 }) {
  return (
    <Text level={level} style={{ fontFamily: fonts.bodyStrong, fontSize: 17, lineHeight: 24 }}>
      {children}
    </Text>
  );
}
