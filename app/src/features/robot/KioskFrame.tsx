import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  IconButton,
  Logo,
  Text,
  colors,
  fonts,
  space,
  useBreakpoint,
  useInsets,
} from '../../design-system';

/** Landscape kiosk: from here the camera and the text sit side by side. */
const WIDE = 900;

export type KioskFrameProps = {
  /** `Robot R1 · Recepción`, `Robot R2 · Acompañando`. */
  robotLabel: string;
  online?: boolean;
  /** «Necesito ayuda» is present on every kiosk step. */
  onHelp: () => void;
  /** The column scrolls back to the top whenever this changes (a new step of the kiosk). */
  scrollKey?: string;
  children: ReactNode;
  footer?: ReactNode;
  onSettings?: () => void;
};

/**
 * Reception header and centred camera flow, with persistent navigation below the scroll area.
 */
export function KioskFrame({
  robotLabel,
  online = true,
  onHelp,
  scrollKey,
  children,
  footer,
  onSettings,
}: KioskFrameProps) {
  const scroller = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void }>(null);
  useEffect(() => scroller.current?.scrollTo({ y: 0, animated: false }), [scrollKey]);
  const { gutter } = useBreakpoint();
  const insets = useInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        role="banner"
        style={{
          backgroundColor: colors.ivory,
          paddingTop: insets.top + space[3],
          paddingBottom: space[3],
          paddingHorizontal: space[4],
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              accessibilityLabel={robotLabel}
              style={{ fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 }}
            >
              {robotLabel.replace(' · Recepción', '')}
            </Text>
            <View
              role="status"
              accessible
              accessibilityLabel={online ? 'Conectado' : 'Sin conexión'}
            >
              <Text variant="caption" tone="muted">
                {online ? 'En línea' : 'Sin conexión'}
              </Text>
            </View>
          </View>
          <Logo size={40} />
          <View
            style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] }}
          >
            <IconButton icon="help-circle-outline" label="Necesito ayuda" onPress={onHelp} />
            {onSettings ? (
              <IconButton icon="settings-outline" label="Ajustes del robot" onPress={onSettings} />
            ) : null}
          </View>
        </View>
      </View>
      <ScrollView
        ref={scroller as never}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: gutter,
          paddingVertical: space[5],
          paddingBottom: footer ? space[5] : insets.bottom + space[6],
        }}
      >
        <View role="main" style={{ width: '100%', maxWidth: 1000, gap: space[4] }}>
          {children}
        </View>
      </ScrollView>
      {footer}
    </View>
  );
}

/**
 * Camera first, then visitor details and actions; side by side on a landscape screen.
 */
export function KioskSplit({ media, children }: { media: ReactNode; children: ReactNode }) {
  const wide = useBreakpoint().width >= WIDE;
  return (
    <View
      style={{
        flexDirection: wide ? 'row' : 'column',
        alignItems: wide ? 'center' : 'stretch',
        gap: wide ? space[7] : space[4],
      }}
    >
      <View style={{ flex: wide ? 1 : undefined, alignItems: 'center' }}>{media}</View>
      <View style={{ flex: wide ? 1 : undefined, gap: space[4] }}>{children}</View>
    </View>
  );
}

/** Greeting-size serif title: scales with the screen so a name stays on one line. */
export function kioskTitleStyle(width: number, chars: number) {
  const target = Math.min(96, Math.max(40, width * 0.075));
  const lines = chars <= 24 ? 1 : 2;
  const fit = Math.min(target, (width * 0.9 * lines) / Math.max(chars * 0.5, 1));
  const size = Math.round(Math.max(36, fit));
  return { fontSize: size, lineHeight: Math.round(size * 1.08), textAlign: 'center' as const };
}
