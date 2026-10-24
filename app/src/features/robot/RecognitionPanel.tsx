import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text, space } from '../../design-system';
import { Heading } from '../shared/Heading';
import { COMMON_COPY } from '../orientation/copy';
import { CameraFrame } from './CameraFrame';
import { KioskSplit } from './KioskFrame';
import { PresenterDrawer } from './PresenterDrawer';

export type RecognitionPanelProps = {
  /** `loading`: a simulated face was chosen and the result is on its way. */
  status: 'ready' | 'loading';
  faces: readonly { id: string; label: string }[];
  onSimulate: (faceId: string) => void;
  onUseQr: () => void;
  /** More presenter controls (date, restart) below the face options. */
  extra?: ReactNode;
};

/** R-02: camera view and the face options of the robot settings. */
export function RecognitionPanel({
  status,
  faces,
  onSimulate,
  onUseQr,
  extra,
}: RecognitionPanelProps) {
  const loading = status === 'loading';
  return (
    <KioskSplit media={<CameraFrame loading={loading} />}>
      <Heading variant="h1" focusKey="recognition">
        Voy a confirmar tu visita
      </Heading>

      <Text tone="muted" style={{ fontSize: 18, lineHeight: 28 }}>
        {COMMON_COPY.recognizing}
      </Text>
      {loading ? (
        <Text role="status" accessibilityLiveRegion="polite" tone="muted">
          Confirmando tu visita…
        </Text>
      ) : null}

      <Button label="Usar mi QR" size="lg" variant="secondary" fullWidth onPress={onUseQr} />

      <PresenterDrawer defaultOpen>
        <Text variant="label">Rostro a reconocer</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {faces.map((f) => (
            <Button
              key={f.id}
              label={f.label}
              size="sm"
              variant="secondary"
              disabled={loading}
              onPress={() => onSimulate(f.id)}
            />
          ))}
        </View>
        {extra}
      </PresenterDrawer>
    </KioskSplit>
  );
}
