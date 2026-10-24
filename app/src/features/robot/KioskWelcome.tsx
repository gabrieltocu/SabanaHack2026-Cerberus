import { View } from 'react-native';
import { Button, Skeleton, Text, space, useBreakpoint } from '../../design-system';
import { Heading } from '../shared/Heading';
import { kioskTitleStyle } from './KioskFrame';

export type KioskWelcomeProps = {
  onStart: () => void;
  /** «Tengo un código QR»: the alternative to the face, always one step away. */
  onQr: () => void;
  /** Robot state still loading: «Preparando al robot…» with a skeleton of the title. */
  loading?: boolean;
};

const TITLE = 'Bienvenido a N Club';

/** R-01: resting screen. Nobody is recognised yet: the greeting, one line and two buttons. */
export function KioskWelcome({ onStart, onQr, loading = false }: KioskWelcomeProps) {
  const { width } = useBreakpoint();
  if (loading) {
    return (
      <View style={{ gap: space[5], paddingVertical: space[5], alignItems: 'center' }}>
        <Skeleton width="80%" height={72} label="Preparando al robot…" />
        <Skeleton width="45%" height={28} />
        <Text tone="muted" role="status">
          Preparando al robot…
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: space[6], width: '100%', alignItems: 'center' }}>
      <View style={{ gap: space[3], alignItems: 'center' }}>
        <Heading
          variant="display"
          level={1}
          focusKey="welcome"
          style={kioskTitleStyle(width, TITLE.length)}
        >
          {TITLE}
        </Heading>
        <Text tone="muted" style={{ fontSize: 20, lineHeight: 28 }} align="center">
          Soy el robot de recepción.
        </Text>
      </View>
      <View
        style={{
          flexDirection: width >= 600 ? 'row' : 'column',
          gap: space[3],
          alignSelf: 'stretch',
          justifyContent: 'center',
          alignItems: 'stretch',
        }}
      >
        <View style={{ width: width >= 600 ? 260 : '100%' }}>
          <Button label="Comenzar" size="lg" fullWidth onPress={onStart} />
        </View>
        <View style={{ width: width >= 600 ? 260 : '100%' }}>
          <Button
            label="Tengo un código QR"
            size="lg"
            variant="secondary"
            fullWidth
            onPress={onQr}
          />
        </View>
      </View>
    </View>
  );
}
