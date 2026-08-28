/**
 * Mode controller
 * ----------------
 * Lets non-React code (e.g. the push-notification tap handler, which runs
 * outside any component via navigationRef) flip the app between client and
 * provider mode. AuthContext registers the real setter on mount; callers use
 * requestMode(). This is what lets a notification for your provider "hat" open
 * the provider stack even when the app is currently in client mode.
 *
 * requestMode() returns a Promise<Mode> that resolves, with the mode that
 * actually ended up active, once AuthContext confirms the corresponding
 * navigator has mounted (via resolveModeChange()). RootNavigation swaps its
 * whole MainTabsComponent by conditionally rendering ProviderTabNavigation vs
 * ClientTabNavigation off activeMode — that swap happens on React's own
 * schedule, not synchronously with setActiveMode. A caller that deep-links
 * immediately after calling requestMode() (without awaiting it) can fire
 * navigationRef.navigate() while the OLD hat's navigator is still mounted,
 * landing the deep-link in the wrong stack — which then leaves the previous
 * hat's screen exposed on back-navigation.
 *
 * The promise resolves with the LANDED mode rather than assuming the caller's
 * requested mode won: two mode-change requests can overlap (e.g. two
 * different-hat notifications tapped in close succession, or a manual
 * switchMode() toggle racing a notification tap) and React coalesces
 * multiple setActiveMode calls into a single commit + a single RootNavigation
 * re-render — so a single resolveModeChange() call can end up draining
 * resolvers queued by more than one request, and not every one of them
 * necessarily got the mode it asked for. Every caller MUST compare the
 * resolved value against what it requested before acting (see
 * notificationTapHandler.ts) rather than assuming success.
 *
 * switchMode() (the in-app manual hat toggle in AuthContext) funnels through
 * this same registerModeSetter/applyMode path, so its transitions also drain
 * this queue — there is only one shared "a mode change landed" signal for the
 * whole app, not one per caller.
 */
type Mode = 'provider' | 'client';

let setter: ((mode: Mode) => void) | null = null;
let pendingResolvers: ((landed: Mode) => void)[] = [];

/** Called once by AuthContext so external code can drive the active mode. */
export function registerModeSetter(fn: (mode: Mode) => void): void {
  setter = fn;
}

/**
 * Called by AuthContext after activeMode has actually committed and the
 * corresponding navigator has mounted — resolves every requestMode() caller
 * currently waiting with the mode that actually landed.
 */
export function resolveModeChange(landed: Mode): void {
  const resolvers = pendingResolvers;
  pendingResolvers = [];
  resolvers.forEach((resolve) => resolve(landed));
}

/**
 * Switch the app into the given mode. Resolves with whichever mode actually
 * ended up active once the switch has landed (or immediately if AuthContext
 * hasn't mounted yet) — the resolved value may differ from `mode` if another
 * request landed first or this one was rejected, so always check it before
 * navigating into the target hat's stack.
 */
export function requestMode(mode: Mode): Promise<Mode> {
  if (!setter) return Promise.resolve(mode);
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    setter?.(mode);
  });
}
