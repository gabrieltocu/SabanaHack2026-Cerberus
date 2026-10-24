import * as ExpoCrypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FontGate } from '@/design-system/FontGate';

// Hermes (Expo Go) has no Web Crypto: idempotency keys and pass tokens need a secure source.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...g.crypto, getRandomValues: ExpoCrypto.getRandomValues };
}

export default function RootLayout() {
  return (
    <FontGate>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </FontGate>
  );
}
