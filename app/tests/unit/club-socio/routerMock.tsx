// Stand-in for expo-router in screen tests: no navigator, focus = mounted.
import { useEffect } from 'react';
import { Text } from 'react-native';

export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
export const useRouter = () => router;
export const usePathname = jest.fn(() => '/app/socio/nueva');
export const useFocusEffect = (cb: () => void | (() => void)) => useEffect(cb, [cb]);
export const Redirect = ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>;
