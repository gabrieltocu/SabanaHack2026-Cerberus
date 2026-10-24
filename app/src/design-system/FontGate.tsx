import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { fontAssets } from './fonts';
import { colors } from './tokens';

/**
 * Holds the app behind a quiet ivory screen until the brand fonts and the icon font are ready. If loading
 * fails it renders anyway: tokens fall back to Georgia/system-ui on web.
 */
export function FontGate({
  children,
  label = 'Cargando',
}: {
  children: ReactNode;
  label?: string;
}) {
  const [loaded, error] = useFonts({ ...fontAssets, ...Ionicons.font });
  if (loaded || error) return <>{children}</>;
  return (
    <View
      accessible
      role="progressbar"
      accessibilityLabel={label}
      aria-busy
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
