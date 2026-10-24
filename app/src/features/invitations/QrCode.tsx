import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import * as QRCode from 'qrcode';
import { Text, colors, space } from '../../design-system';

const QUIET_ZONE = 4;

/** One path of horizontal runs (`M x y h w v1 h-w z`) keeps the SVG small for dense codes. */
export function qrPath(size: number, isDark: (row: number, col: number) => boolean): string {
  let d = '';
  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && isDark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        d += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
        start = -1;
      }
    }
  }
  return d;
}

export type QrCodeProps = {
  /** Opaque identifier to encode. Never put personal data in a QR. */
  value: string;
  /** Side in px, quiet zone included. */
  size?: number;
  accessibilityLabel?: string;
  /** Prints the code under the symbol so it can be read and typed by hand. */
  showCode?: boolean;
};

/** High-contrast QR on white with a 4-module quiet zone, drawn with react-native-svg. */
export function QrCode({
  value,
  size = 240,
  accessibilityLabel = 'Código QR de tu pase. Muéstralo en recepción.',
  showCode = true,
}: QrCodeProps) {
  const { modules } = useMemo(() => QRCode.create(value, { errorCorrectionLevel: 'M' }), [value]);
  const d = useMemo(
    () => qrPath(modules.size, (r, c) => modules.data[r * modules.size + c] === 1),
    [modules],
  );
  const span = modules.size + QUIET_ZONE * 2;
  return (
    <View style={{ gap: space[2], alignItems: 'center' }}>
      <View role="img" accessibilityLabel={accessibilityLabel} accessible>
        <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
          <Rect x={0} y={0} width={span} height={span} fill={colors.white} />
          <Path d={d} fill={colors.espresso900} />
        </Svg>
      </View>
      {showCode ? (
        <Text variant="caption" tone="muted" selectable align="center">
          {`Código: ${value}`}
        </Text>
      ) : null}
    </View>
  );
}
