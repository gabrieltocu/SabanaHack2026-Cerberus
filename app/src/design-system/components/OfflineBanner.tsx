import { View } from 'react-native';
import { colors, space } from '../tokens';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export type OfflineBannerProps = {
  message?: string;
  /** Adds a «Reintentar» button. */
  onRetry?: () => void;
  retryLabel?: string;
};

/** Slim notice for a lost connection while stale data is still on screen. Render it only when offline. */
export function OfflineBanner({
  message = 'Sin conexión. Mostramos lo último que tenemos.',
  onRetry,
  retryLabel = 'Reintentar',
}: OfflineBannerProps) {
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[2],
        paddingHorizontal: space[4],
        backgroundColor: colors.warningBg,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name="cloud-offline-outline" size={20} color={colors.warning} />
      <Text variant="label" style={{ flex: 1, color: colors.warning }}>
        {message}
      </Text>
      {onRetry ? <Button label={retryLabel} variant="ghost" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}
