// Single source of visual tokens for the N Club app. Palette hex values come from the approved
// brand package; semantic names are what components consume. Contrast of the pairs that matter
// is asserted in tests/unit/design-system/contrast.test.ts.
import { Platform } from 'react-native';

export const palette = {
  // N Club Luxury: warm white ground, black lines and text, soft antique gold for details only.
  // The old brand names stay as aliases so every screen recolours from this one place:
  // forest/pine = black ink, sage = soft surface, ivory/paper = warm white, gold = antique gold.
  forest: '#141414',
  pine: '#2B2B2B',
  sage: '#F3F2EE',
  ivory: '#FDFCFA',
  paper: '#FDFCFA',
  // Antique gold for lines, icons, fills and the logo; never small text (3.2:1 on ivory: UI only).
  gold: '#AD8948',
  // Gold for text on black (primary buttons, the active label on dark grounds).
  goldOnDark: '#CAAD7D',
  ink: '#141414',
  muted: '#5C5C5C',
  error: '#A33A2E',
  bone100: '#EDEBE6',
  // Legacy names used by existing screens; same colours.
  forest950: '#141414',
  forest800: '#2B2B2B',
  sage200: '#F3F2EE',
  ivory50: '#FDFCFA',
  espresso900: '#141414',
  champagne400: '#AD8948',
  white: '#FFFFFF',
} as const;

export const colors = {
  ...palette,
  // Surfaces
  bg: palette.ivory50,
  bgDark: palette.forest950,
  surface: palette.white,
  surfaceMuted: palette.bone100,
  skeleton: '#ECEAE5',
  surfaceSoft: palette.sage200,
  // Text
  text: palette.espresso900,
  textMuted: palette.muted,
  textOnDark: palette.ivory50,
  textMutedOnDark: '#A6A6A6',
  // Actions
  primary: palette.forest,
  primaryPressed: palette.pine,
  // Black buttons carry gold labels.
  onPrimary: palette.goldOnDark,
  accent: palette.champagne400,
  // Lines are black: cards, inputs and separators all use the same ink line.
  border: '#242424',
  borderStrong: '#242424',
  // Status
  danger: palette.error,
  dangerPressed: '#822E24',
  dangerBg: '#F6E7E4',
  success: '#2F5D3A',
  successBg: palette.sage200,
  warning: '#6E5326',
  warningBg: '#F5EFE3',
  info: palette.forest800,
  infoBg: palette.sage200,
  // Keyboard focus ring: ink on light grounds, gold on black grounds.
  focus: palette.forest800,
  focusOnDark: palette.champagne400,
} as const;

/** 4/8 scale. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96 } as const;

/** Premium and straight: no curves anywhere (every corner is square). Keys kept for callers. */
export const radii = { none: 0, sm: 0, md: 0, lg: 0, xl: 0 } as const;

export const breakpoints = { tablet: 768, desktop: 1200 } as const;

/** Minimum touch target (CSS px) and the standard control height. */
export const hitSlop = { min: 44, control: 48 } as const;

const isWeb = Platform.OS === 'web';
const family = (name: string, fallback: string) => (isWeb ? `${name}, ${fallback}` : name);

/** Names must match the keys of `fontAssets` in fonts.ts. */
export const fonts = {
  display: family('BodoniModa_500Medium', 'Georgia, serif'),
  displayStrong: family('BodoniModa_600SemiBold', 'Georgia, serif'),
  body: family('Geist_400Regular', 'system-ui, sans-serif'),
  bodyMedium: family('Geist_500Medium', 'system-ui, sans-serif'),
  bodyStrong: family('Geist_600SemiBold', 'system-ui, sans-serif'),
} as const;

export type TextVariant =
  'display' | 'title' | 'h1' | 'h2' | 'h3' | 'body' | 'label' | 'caption' | 'eyebrow';

/**
 * `size` is a number or [mobile, tablet, desktop]. Bodoni (serif) is only used from 22 px up, for
 * names, greetings and the wordmark; everything else is Geist. No fontWeight on purpose: each weight is its own loaded face.
 */
export const typography: Record<
  TextVariant,
  {
    family: string;
    size: number | readonly [number, number, number];
    lineHeight: number;
    letterSpacing: number;
  }
> = {
  display: { family: fonts.display, size: [44, 52, 60], lineHeight: 1.06, letterSpacing: -0.6 },
  // title: screen titles of the phone app (the column never grows past 600 px).
  title: { family: fonts.displayStrong, size: 30, lineHeight: 1.12, letterSpacing: -0.2 },
  h1: { family: fonts.display, size: [32, 36, 40], lineHeight: 1.12, letterSpacing: -0.3 },
  h2: { family: fonts.display, size: [26, 28, 32], lineHeight: 1.2, letterSpacing: -0.1 },
  h3: { family: fonts.displayStrong, size: 22, lineHeight: 1.25, letterSpacing: 0 },
  body: { family: fonts.body, size: [16, 16, 17], lineHeight: 1.6, letterSpacing: 0 },
  label: { family: fonts.bodyMedium, size: 14, lineHeight: 1.45, letterSpacing: 0.1 },
  caption: { family: fonts.body, size: 13, lineHeight: 1.45, letterSpacing: 0.1 },
  eyebrow: { family: fonts.bodyStrong, size: 13, lineHeight: 1.4, letterSpacing: 0.6 },
};

/** Flat: objects are separated by black lines, not shadows. Only floating sheets lift. */
export const shadows = {
  none: undefined,
  card: undefined,
  raised: '0 12px 32px rgba(20, 20, 20, 0.12)',
  tabBar: undefined,
} as const;

export type ChipKind = 'VIP' | 'REGULAR' | 'GUEST' | 'STAFF' | 'EXTERNAL' | 'ESCALATION';

/**
 * Colour per category (N Club): VIP gold, Regular blue, Invitado green, Personal white/neutral,
 * Externo orange, Escalamiento soft red. Every fg/bg pair is >= 4.5:1 (contrast.test.ts); the
 * meaning is always carried by the label too, never by colour alone.
 */
export const chipColors: Record<ChipKind, { bg: string; fg: string; border: string }> = {
  VIP: { bg: '#F3EAD3', fg: '#5E4A1B', border: palette.gold },
  REGULAR: { bg: '#DDE9F5', fg: '#1D4A75', border: '#9DBBDA' },
  GUEST: { bg: '#DDEBDA', fg: '#2A5C2E', border: '#A9CBA6' },
  STAFF: { bg: palette.paper, fg: palette.ink, border: '#7A877F' },
  EXTERNAL: { bg: '#FBE7D3', fg: '#8A4106', border: '#E8B98B' },
  ESCALATION: { bg: '#F7E3E1', fg: '#8B2B2B', border: '#E3B1AD' },
};

/** Motion durations in ms. Components collapse them to 0 when reduced motion is on. */
export const motion = { instant: 0, fast: 120, base: 200, slow: 360 } as const;

/** Readable column widths. */
export const layout = {
  narrow: 640,
  content: 1120,
  gutter: { mobile: 20, tablet: 32, desktop: 48 },
  /** Width of the phone-app column when it is shown on a wide window. */
  app: 600,
} as const;
