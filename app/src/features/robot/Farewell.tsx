import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Text, colors, space, useBreakpoint } from '../../design-system';
import type { Category } from '../../domain/entities/types';
import { ORIENTATION, renderCopy, type CopyVars } from '../orientation/copy';
import { Heading } from '../shared/Heading';
import { kioskTitleStyle } from './KioskFrame';

export type FarewellProps = {
  category: Category;
  vars: CopyVars;
  /** «Listo», or the timeout: both return the kiosk to its resting screen. */
  onDone: () => void;
  /** Seconds before it returns by itself. The countdown is always visible. */
  seconds?: number;
};

/** R-12. The goodbye in the category's register, and a visible 15 s bar back to reception. */
export function Farewell({ category, vars, onDone, seconds = 15 }: FarewellProps) {
  const [left, setLeft] = useState(seconds);
  const { width } = useBreakpoint();

  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, onDone]);

  const text = `“${renderCopy(ORIENTATION[category].phases.farewell.text, vars)}”`;
  return (
    <View style={{ gap: space[6], paddingVertical: space[6], alignItems: 'center' }}>
      <Heading variant="display" focusKey={category} style={kioskTitleStyle(width, text.length)}>
        {text}
      </Heading>
      <Button label="Listo" size="lg" onPress={onDone} />
      <View style={{ gap: space[2], width: 360, maxWidth: '100%', alignItems: 'center' }}>
        <View
          role="progressbar"
          accessible
          accessibilityLabel="Tiempo para volver al inicio"
          accessibilityValue={{ min: 0, max: seconds, now: Math.max(left, 0) }}
          style={{ height: 2, alignSelf: 'stretch', backgroundColor: colors.surfaceMuted }}
        >
          <View
            style={{
              height: 2,
              width: `${(Math.max(left, 0) / seconds) * 100}%`,
              backgroundColor: colors.gold,
            }}
          />
        </View>
        <Text variant="caption" tone="muted">
          {`Volviendo al inicio en ${Math.max(left, 0)} s`}
        </Text>
      </View>
    </View>
  );
}
