import { View } from 'react-native';
import { fonts, space } from '../tokens';
import { Button } from './Button';
import { Divider } from './Divider';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** An empty screen invites an action: say what to do next. */
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={{ gap: space[3], paddingVertical: space[7], maxWidth: 480 }}>
      <Divider variant="accent" />
      <Text
        variant="h3"
        level={2}
        style={{ fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 26 }}
      >
        {title}
      </Text>
      {description ? <Text tone="muted">{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: space[2] }}>
          <Button label={actionLabel} variant="outline" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
