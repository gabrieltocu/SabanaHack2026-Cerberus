import { Text, type TextProps } from '../../design-system/components/Text';

/** Time of day rendered as a `<time>` element on web (react-native-web maps role `time`). */
export function TimeText(props: TextProps) {
  // React Native's `Role` type does not list `time`; react-native-web understands it.
  return <Text {...props} {...({ role: 'time' } as object)} />;
}
