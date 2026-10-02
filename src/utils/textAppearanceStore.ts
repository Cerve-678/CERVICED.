// A tiny module-level store holding the user's live text appearance (size scale
// + chosen body font). It exists so the global <Text> wrapper in
// fontScaleClamp.ts — which is a plain module-swapped component, not something
// inside the React context tree — can still react to a preference change
// without an app restart.
//
// DisplaySettingsContext is the writer (it owns persistence); the Text/TextInput
// wrapper is the reader, via useSyncExternalStore. Kept dependency-free (no
// React, no context) so both sides can import it without a cycle.

export interface TextAppearance {
  /** Multiplier applied on top of any explicit fontSize. 1 = unchanged. */
  scale: number;
  /** Base body font to apply where a call site sets none; undefined = system. */
  fontFamily: string | undefined;
}

let current: TextAppearance = { scale: 1, fontFamily: undefined };
const listeners = new Set<() => void>();

/** Stable snapshot for useSyncExternalStore — reference only changes on a set. */
export function getTextAppearance(): TextAppearance {
  return current;
}

export function subscribeTextAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTextAppearance(next: TextAppearance): void {
  if (next.scale === current.scale && next.fontFamily === current.fontFamily) return;
  current = { scale: next.scale, fontFamily: next.fontFamily };
  for (const listener of listeners) listener();
}
