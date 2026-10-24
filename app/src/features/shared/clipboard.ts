import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/** Copies text (web clipboard or native). Resolves false when the platform refuses access. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS !== 'web') return await Clipboard.setStringAsync(text);
    const clipboard = (
      globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }
    ).navigator?.clipboard;
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
