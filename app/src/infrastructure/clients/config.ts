// Elige el transporte según `EXPO_PUBLIC_DATA_MODE`: `api` usa HTTP; cualquier otro valor o su
// ausencia usa el manejador local (modo demo). Expo solo incrusta `process.env.EXPO_PUBLIC_*` si
// se escribe literal. Nunca va aquí un secreto: estas variables llegan al navegador.
import { Platform } from 'react-native';

import { createCerberusClient } from './cerberus-client';
import { createHttpTransport } from './http-transport';
import { createLocalTransport } from './local-transport';
import type { Transport } from './transport';

export type DataMode = 'api' | 'mock';

/** Production API used by the native app (Expo Go) when no API URL is configured. */
export const DEFAULT_API_URL = 'https://n-club-five.vercel.app/api/v1';
const isNative = Platform.OS !== 'web';

// Native apps default to the shared API (so phones, tablets and the web demo see the same
// visits); `EXPO_PUBLIC_DATA_MODE=mock` forces the offline demo on any platform.
export function dataMode(
  value: string | undefined = process.env.EXPO_PUBLIC_DATA_MODE,
  native = isNative,
): DataMode {
  if (value === 'api') return 'api';
  if (value === 'mock') return 'mock';
  return native ? 'api' : 'mock';
}

export function createTransport(
  mode: DataMode = dataMode(),
  baseUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL ??
    (isNative ? DEFAULT_API_URL : undefined),
): Transport {
  return mode === 'api' ? createHttpTransport({ baseUrl }) : createLocalTransport();
}

export function createDefaultClient(actor?: string) {
  return createCerberusClient(createTransport(), actor);
}
