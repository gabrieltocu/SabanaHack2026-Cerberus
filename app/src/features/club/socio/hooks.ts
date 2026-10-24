import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { describir, type ErrorInfo } from './errors';

export const POLL_MS = 3000;

/**
 * Runs `task` when the screen gains focus and, with `everyMs`, repeats it while the screen is
 * focused AND the app is in the foreground. Tabs stay mounted, so focus is the visibility signal.
 */
export function useWhileFocused(task: () => unknown, everyMs?: number) {
  useFocusEffect(
    useCallback(() => {
      void task();
      if (!everyMs) return;
      let timer: ReturnType<typeof setInterval> | undefined = setInterval(
        () => void task(),
        everyMs,
      );
      const stop = () => {
        clearInterval(timer);
        timer = undefined;
      };
      const sub = AppState.addEventListener('change', (state) => {
        stop();
        if (state === 'active') {
          void task();
          timer = setInterval(() => void task(), everyMs);
        }
      });
      return () => {
        stop();
        sub.remove();
      };
    }, [task, everyMs]),
  );
}

export type Carga<T> =
  { estado: 'cargando' } | { estado: 'lista'; datos: T } | { estado: 'error'; error: ErrorInfo };

/** One-shot load with reload. `load` must be stable (useCallback). `auto` loads on mount. */
export function useCarga<T>(load: () => Promise<T>, auto = true) {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const viva = useRef(true);
  const resolver = useCallback(
    (p: Promise<T>) =>
      p.then(
        (datos) => viva.current && setCarga({ estado: 'lista', datos }),
        (e: unknown) => viva.current && setCarga({ estado: 'error', error: describir(e) }),
      ),
    [],
  );
  useEffect(() => {
    viva.current = true;
    if (auto) void resolver(load());
    return () => {
      viva.current = false;
    };
  }, [load, auto, resolver]);
  const recargar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    return resolver(load());
  }, [load, resolver]);
  return { carga, recargar, setCarga };
}
