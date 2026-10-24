import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Frame of the `/demo` routes: just the route, the screens pad the status bar themselves. */
export function DemoFrame({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
