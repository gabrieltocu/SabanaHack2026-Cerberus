import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const NONE = { top: 0, bottom: 0, left: 0, right: 0 } as const;

/** Safe-area insets; zeros when there is no provider (tests, web, isolated stories). */
export function useInsets() {
  return useContext(SafeAreaInsetsContext) ?? NONE;
}
