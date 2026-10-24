import { View } from 'react-native';
import { colors, fonts } from '../tokens';
import { Text } from './Text';

export type AvatarTone = 'sage' | 'forest' | 'gold';

const looks: Record<AvatarTone, { bg: string; fg: string }> = {
  sage: { bg: colors.surfaceSoft, fg: colors.text },
  forest: { bg: colors.forest, fg: colors.goldOnDark },
  gold: { bg: colors.gold, fg: colors.forest },
};

/** `Andrés Gómez` -> `AG`, `Camila` -> `C`. */
export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

export type AvatarProps = {
  name: string;
  size?: number;
  tone?: AvatarTone;
  /** Spoken name. Without it the avatar is decorative: the name is always written next to it. */
  label?: string;
  /** Thin gold ring around the square (the member in focus). */
  ring?: boolean;
};

/** Square avatar with initials (Bodoni from 64 px up, like names). There are no photographs in the app: never a face. */
export function Avatar({ name, size = 44, tone = 'sage', label, ring = false }: AvatarProps) {
  const l = looks[tone];
  return (
    <View
      {...(label
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
        : { accessible: false, importantForAccessibility: 'no' as const, 'aria-hidden': true })}
      style={{
        width: size,
        height: size,
        ...(ring ? { borderWidth: 1, borderColor: colors.gold } : null),
        backgroundColor: l.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: size >= 64 ? fonts.display : fonts.bodyStrong,
          fontSize: Math.round(size * 0.38),
          lineHeight: Math.round(size * 0.5),
          color: l.fg,
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
