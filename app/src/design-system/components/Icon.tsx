import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '../tokens';

/** Any Ionicons glyph; use the `-outline` ones so the whole app keeps one linear style. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  /** Spoken name. Without it the icon is decorative and hidden from screen readers. */
  label?: string;
};

/** Linear icon (Ionicons outline, bundled with Expo Go). Pair it with visible text when you can. */
export function Icon({ name, size = 22, color = colors.text, label }: IconProps) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      {...(label
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
        : {
            accessible: false,
            importantForAccessibility: 'no' as const,
            'aria-hidden': true,
          })}
    />
  );
}
