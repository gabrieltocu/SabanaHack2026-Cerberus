// Data access for screens: one shared transport (local demo or HTTP), a client per actor and a
// small loading hook that refreshes on writes from other tabs and polls in API mode.
import { useCallback, useEffect, useRef, useState } from 'react';

import { createCerberusClient } from '../../infrastructure/clients/cerberus-client';
import { createTransport, dataMode } from '../../infrastructure/clients/config';
import { ApiError } from '../../infrastructure/clients/errors';
import { onRemoteWrite } from '../../infrastructure/clients/local-transport';
import type { Transport } from '../../infrastructure/clients/transport';

export const DATA_MODE = dataMode();
let transport: Transport | undefined;

/** Client acting as a directory id (`V-202`, `U-02`, `R1`…). The transport is created lazily. */
export function clientFor(actor?: string) {
  transport ??= createTransport();
  return createCerberusClient(transport, actor);
}

/** Stable error code for UI messages (`messageFor`). */
export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : 'NETWORK_ERROR';
}

export interface ApiState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

// One pause for the whole page: a 429 from any hook stops every hook's polling until it ends.
let pausedUntil = 0;
/** Lifts the shared pause (tests). */
export const clearPause = () => {
  pausedUntil = 0;
};

// `document` only exists in browsers (and is absent in native tests and the static export).
const doc = () => (globalThis as { document?: Document }).document;
const hidden = () => doc()?.hidden === true;

/**
 * Loads on mount and when `deps` change (the previous data is dropped, so one profile never shows
 * under another). In API mode it polls every 3 s unless `pollMs: 0`: pass 0 for static data, the
 * free Redis plan pays per request. It does not poll in a hidden tab, refreshes once when the tab
 * returns, and pauses while the service says `RATE_LIMITED`.
 */
// ponytail: polling every 3 s in API mode (contract §1); add push (SSE) if latency matters.
export function useApi<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  { pollMs = DATA_MODE === 'api' ? 3000 : 0 }: { pollMs?: number } = {},
): ApiState<T> {
  const [state, setState] = useState<Omit<ApiState<T>, 'refresh'>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await loadRef.current();
      // A slower, older response must not overwrite a newer one.
      if (alive.current && mine === seq.current)
        setState({ data, error: undefined, loading: false });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RATE_LIMITED') {
        const retryAfter = Number((e.details as { retryAfter?: unknown } | undefined)?.retryAfter);
        pausedUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
      }
      if (alive.current && mine === seq.current) {
        setState((s) => ({ ...s, error: errorCode(e), loading: false }));
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setState({ data: undefined, error: undefined, loading: true });
    void refresh();
    const unsubscribe = onRemoteWrite(() => void refresh());
    const poll = () => {
      if (!hidden() && Date.now() >= pausedUntil) void refresh();
    };
    const timer = pollMs > 0 ? setInterval(poll, pollMs) : undefined;
    if (pollMs > 0) doc()?.addEventListener('visibilitychange', poll);
    return () => {
      alive.current = false;
      unsubscribe();
      if (timer) clearInterval(timer);
      doc()?.removeEventListener('visibilitychange', poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, pollMs, ...deps]);

  return { ...state, refresh };
}
