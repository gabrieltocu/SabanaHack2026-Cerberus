import { ActivityIndicator, View } from 'react-native';
import { Icon, colors, space } from '../../design-system';

const corner = (pos: object) => (
  <View
    aria-hidden
    style={[{ position: 'absolute', width: 28, height: 28, borderColor: colors.gold }, pos]}
  />
);

/**
 * Camera view on black with gold framing guides and a silhouette. `identified` turns the
 * silhouette gold.
 */
export function CameraFrame({
  loading = false,
  identified = false,
}: {
  loading?: boolean;
  identified?: boolean;
}) {
  return (
    <View style={{ width: '100%', maxWidth: 480 }}>
      <View
        role="img"
        accessible
        accessibilityLabel="Vista de la cámara"
        style={{
          aspectRatio: 4 / 3,
          borderWidth: 1,
          borderColor: colors.ink,
          backgroundColor: colors.ink,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[6],
        }}
      >
        <Icon
          name="person-outline"
          size={120}
          color={identified ? colors.goldOnDark : colors.textMutedOnDark}
        />
        {corner({ top: 20, left: 20, borderTopWidth: 2, borderLeftWidth: 2 })}
        {corner({ top: 20, right: 20, borderTopWidth: 2, borderRightWidth: 2 })}
        {corner({ bottom: 20, left: 20, borderBottomWidth: 2, borderLeftWidth: 2 })}
        {corner({ bottom: 20, right: 20, borderBottomWidth: 2, borderRightWidth: 2 })}
        {loading ? (
          <View style={{ position: 'absolute', top: '45%' }}>
            <ActivityIndicator color={colors.goldOnDark} size="large" />
          </View>
        ) : null}
      </View>
    </View>
  );
}
