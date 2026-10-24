import { View } from 'react-native';
import { colors, fonts, space } from '../tokens';
import { Button } from './Button';
import { Text } from './Text';

export type ErrorStateProps = {
  /** What went wrong, in plain words. */
  title: string;
  /** How to fix it or what happens next. */
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
};

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Reintentar',
  retrying,
}: ErrorStateProps) {
  return (
    <View
      role="alert"
      accessibilityLiveRegion="assertive"
      style={{
        gap: space[3],
        paddingVertical: space[5],
        paddingHorizontal: space[4],
        maxWidth: 520,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: colors.danger,
      }}
    >
      <Text variant="h3" style={{ fontFamily: fonts.bodyStrong, fontSize: 18, lineHeight: 24 }}>
        {title}
      </Text>
      {description ? <Text tone="muted">{description}</Text> : null}
      {onRetry ? (
        <View style={{ marginTop: space[2] }}>
          <Button label={retryLabel} onPress={onRetry} loading={retrying} />
        </View>
      ) : null}
    </View>
  );
}
