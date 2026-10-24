import { contrastRatio } from '@/design-system/contrast';
import { chipColors, colors, palette } from '@/design-system/tokens';

const AA_TEXT = 4.5;
const AA_UI = 3;

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  it('is symmetric and rejects malformed colours', () => {
    expect(contrastRatio('#123456', '#ABCDEF')).toBeCloseTo(
      contrastRatio('#ABCDEF', '#123456'),
      10,
    );
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow('Invalid hex colour');
  });
});

describe('palette text pairs (AA 4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['espresso on ivory', palette.espresso900, palette.ivory50],
    ['espresso on white', palette.espresso900, palette.white],
    ['white on forest-950', palette.white, palette.forest950],
    ['white on forest-800', palette.white, palette.forest800],
    ['forest-800 on ivory', palette.forest800, palette.ivory50],
    ['error on white', palette.error, palette.white],
    ['error on ivory', palette.error, palette.ivory50],
    // Semantic pairs the components actually render.
    ['textMuted on ivory', colors.textMuted, colors.bg],
    ['textMuted on white', colors.textMuted, colors.surface],
    ['textMuted on bone', colors.textMuted, colors.surfaceMuted],
    ['textMuted on sage', colors.textMuted, colors.surfaceSoft],
    ['espresso on bone', colors.text, colors.surfaceMuted],
    ['forest-950 on sage', palette.forest950, palette.sage200],
    ['textOnDark on forest-950', colors.textOnDark, colors.bgDark],
    ['textMutedOnDark on forest-950', colors.textMutedOnDark, colors.bgDark],
    ['forest-950 on ivory (primary pressed label)', palette.forest950, palette.ivory50],
    ['white on danger pressed', palette.white, colors.dangerPressed],
    ['success on sage', colors.success, colors.successBg],
    ['success on ivory', colors.success, colors.bg],
    ['warning on warningBg', colors.warning, colors.warningBg],
    ['warning on ivory', colors.warning, colors.bg],
    ['danger on dangerBg', colors.danger, colors.dangerBg],
    ['info on sage', colors.info, colors.infoBg],
    ['badge VIP: ivory on forest-950', colors.ivory50, colors.forest950],
    ['badge STAFF: white on forest-800', colors.white, colors.forest800],
  ];
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('N Club palette and mobile components (AA 4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['ink on ivory', palette.ink, palette.ivory],
    ['ink on paper', palette.ink, palette.paper],
    ['ink on sage', palette.ink, palette.sage],
    ['muted on ivory', palette.muted, palette.ivory],
    ['ink on paper (active tab label, list rows)', colors.text, palette.paper],
    ['ink on white (card, input)', colors.text, colors.surface],
    ['ink on sage (secondary button, avatar)', colors.text, colors.surfaceSoft],
    ['ink on gold (gold avatar)', palette.ink, palette.gold],
    ['gold on dark on ink (primary button label)', colors.onPrimary, colors.primary],
    ['gold on dark on pine (primary button pressed)', colors.onPrimary, colors.primaryPressed],
    [
      'gold on dark on ink (VIP badge, toast action, link on dark)',
      palette.goldOnDark,
      palette.ink,
    ],
    ['ivory on ink (outline button on dark, toast, header)', palette.ivory, palette.ink],
    ['white on danger (destructive button)', palette.white, colors.danger],
    ['textMuted on paper (inactive tab, descriptions)', colors.textMuted, palette.paper],
    ['textMuted on sage (secondary text)', colors.textMuted, colors.surfaceSoft],
    ['textMutedOnDark on forest', colors.textMutedOnDark, palette.forest],
    ['paper on error (tab badge)', palette.paper, palette.error],
    ['error on paper', palette.error, palette.paper],
  ];
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(chipColors))('chip %s: text on its fill', (_kind, c) => {
    expect(contrastRatio(c.fg, c.bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(chipColors))('chip %s: text on the ivory ground', (_kind, c) => {
    expect(contrastRatio(c.fg, colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('gold on ivory/paper stays below AA text: it is an accent only', () => {
    expect(contrastRatio(palette.gold, palette.ivory)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(palette.gold, palette.paper)).toBeLessThan(AA_TEXT);
  });

  it('gold on warm white reaches 3:1 for icons, lines and borders', () => {
    expect(contrastRatio(palette.gold, palette.paper)).toBeGreaterThanOrEqual(AA_UI);
    expect(contrastRatio(palette.gold, palette.ivory)).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe('UI component pairs (3:1)', () => {
  const pairs: [string, string, string][] = [
    ['gold on ink (logo, tab line on dark, toast bar)', palette.gold, palette.ink],
    ['gold on dark on ink (toast bar)', palette.goldOnDark, palette.ink],
    ['gold on white (list and quick-action icons, ring)', palette.gold, palette.white],
    ['black line on white (cards, rows, outline buttons)', colors.border, colors.surface],
    ['black line on paper (tab bar top, rows)', colors.border, palette.paper],
    ['focus ring on ivory', colors.focus, colors.bg],
    ['focus ring on white', colors.focus, colors.surface],
    ['focus ring on dark ground', colors.focusOnDark, colors.bgDark],
    ['input border on white', colors.borderStrong, colors.surface],
    ['input border on ivory', colors.borderStrong, colors.bg],
    ['danger border on white', colors.danger, colors.surface],
    ['gold hairline on forest (membership card)', palette.gold, palette.forest],
    ['neutral chip border on paper', chipColors.STAFF.border, palette.paper],
    ['banner bar info on sage', colors.info, colors.infoBg],
    ['banner bar warning', colors.warning, colors.warningBg],
    ['banner bar error', colors.danger, colors.dangerBg],
  ];
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe('champagne is an accent, never text', () => {
  it('is fine for UI on forest grounds', () => {
    expect(contrastRatio(palette.champagne400, palette.forest950)).toBeGreaterThanOrEqual(AA_UI);
  });

  it('is NOT suitable for text on ivory or white (documented limit)', () => {
    // Below AA for text: use champagne only for rules and outlines on dark grounds.
    expect(contrastRatio(palette.champagne400, palette.ivory50)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(palette.champagne400, palette.white)).toBeLessThan(AA_TEXT);
  });
});
