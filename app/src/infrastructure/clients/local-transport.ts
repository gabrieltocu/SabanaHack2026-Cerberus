// Transporte del modo demo: ejecuta el mismo manejador de la API dentro del navegador, con el
// estado en localStorage. Es la fuente de verdad en ese modo; no hay otra copia.
import { createApp } from '../../api/app';
import type { ApiHandler } from '../../api/http';
import { systemClock } from '../../domain/clock';
import { secureRandom } from '../../shared/random';
import { createLocalStorageStore } from '../stores/local-storage-store';
import type { Transport } from './transport';

export const CHANNEL_NAME = 'cerberus';

export interface LocalTransportOptions {
  /** Manejador a ejecutar; por defecto la API con almacén en localStorage. */
  app?: ApiHandler;
  channelName?: string;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

function openChannel(name: string): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(name);
  } catch {
    return undefined;
  }
}

export function createLocalTransport(opts: LocalTransportOptions = {}): Transport {
  let app = opts.app;
  const channelName = opts.channelName ?? CHANNEL_NAME;

  return async (req) => {
    // Perezoso: el export estático de Expo evalúa módulos sin `localStorage`.
    app ??= createApp({
      store: createLocalStorageStore(globalThis.localStorage),
      clock: systemClock,
      random: secureRandom,
      storage: 'browser',
      resetEnabled: true,
    });
    const url = new URL(req.path, 'http://local');
    const headers = Object.fromEntries(
      Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (req.body !== undefined) headers['content-type'] ??= 'application/json';

    const res = await app({
      method: req.method,
      path: url.pathname.replace(/\/+$/, '') || '/',
      query: Object.fromEntries(url.searchParams),
      headers,
      body: clone(req.body),
      ip: 'local',
    });
    if (req.method !== 'GET') {
      // Opened per write and closed at once: a long-lived channel keeps Node test runners alive.
      const channel = openChannel(channelName);
      channel?.postMessage({ type: 'write', method: req.method, path: req.path });
      channel?.close();
    }
    return { status: res.status, body: clone(res.body), headers: res.headers };
  };
}

/** Avisa a esta pestaña cuando otra pestaña escribe (para refrescar listas). Devuelve la baja. */
export function onRemoteWrite(listener: () => void, channelName = CHANNEL_NAME): () => void {
  const channel = openChannel(channelName);
  if (!channel) return () => {};
  channel.onmessage = listener;
  return () => channel.close();
}
