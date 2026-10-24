import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Vibration } from 'react-native';

import { diaBogota } from '../eventos';

/** True while the app is in the foreground (on web: the tab is visible). */
export function useAppActiva(): boolean {
  // Only "background" pauses: "unknown" and "inactive" are transitions, not a hidden app.
  const [activa, setActiva] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActiva(s !== 'background'));
    return () => sub.remove();
  }, []);
  return activa;
}

/** Foreground and this tab is the focused one: the moment it is worth polling. */
export function usePantallaActiva(): boolean {
  const app = useAppActiva();
  const enfocada = useIsFocused();
  return app && enfocada;
}

/** Two short buzzes for a new alert. React Native Web maps it to navigator.vibrate. */
export const vibrarAlerta = () => Vibration.vibrate([0, 250, 120, 250]);

/** Today in Bogotá ("YYYY-MM-DD"), refreshed every minute so the lists roll over at midnight. */
export function useHoy(): string {
  const [dia, setDia] = useState(() => diaBogota(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setDia(diaBogota(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);
  return dia;
}
