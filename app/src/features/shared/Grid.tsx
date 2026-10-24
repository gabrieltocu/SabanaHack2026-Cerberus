import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { space } from '../../design-system';

/**
 * Responsive grid without breakpoint tables: every child wants at least `minWidth`, so the
 * grid is one column on a phone, two on a tablet and three on a desktop (1120 px column).
 */
export function Grid({ children, minWidth = 320 }: { children: ReactNode; minWidth?: number }) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4], alignItems: 'flex-start' }}
    >
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: minWidth, maxWidth: '100%' }}>
          {child}
        </View>
      ))}
    </View>
  );
}
