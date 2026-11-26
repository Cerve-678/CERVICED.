import type * as ClipboardModule from 'expo-clipboard';
import { logger } from './logger';

// Loaded on first use, not when the app starts. A build made before
// expo-clipboard was added has no native side for it, and importing it at the
// top would crash that build on launch; this way only copying fails there, and
// the caller falls back to something that does work (the share sheet).
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const loadClipboard = (): typeof ClipboardModule => require('expo-clipboard') as typeof ClipboardModule;

/** Puts `text` on the clipboard. False when this build can't copy. */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await loadClipboard().setStringAsync(text);
  } catch (error: unknown) {
    logger.warn('[clipboard] could not copy:', error);
    return false;
  }
}
