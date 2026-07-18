/**
 * Mode controller
 * ----------------
 * Lets non-React code (e.g. the push-notification tap handler, which runs
 * outside any component via navigationRef) flip the app between client and
 * provider mode. AuthContext registers the real setter on mount; callers use
 * requestMode(). This is what lets a notification for your provider "hat" open
 * the provider stack even when the app is currently in client mode.
 */
type Mode = 'provider' | 'client';

let setter: ((mode: Mode) => void) | null = null;

/** Called once by AuthContext so external code can drive the active mode. */
export function registerModeSetter(fn: (mode: Mode) => void): void {
  setter = fn;
}

/** Switch the app into the given mode (no-op if AuthContext hasn't mounted yet). */
export function requestMode(mode: Mode): void {
  setter?.(mode);
}
