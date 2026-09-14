import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useIsFocused } from '@react-navigation/native';

/**
 * The app paints a frosted strip over the status bar at the root (see
 * `StatusBarBlur` in App.tsx). It is tinted light and pairs with dark status
 * bar icons, which is right for every screen whose top edge is pale — which is
 * almost all of them.
 *
 * It is wrong for a screen whose top edge is genuinely dark. A provider using
 * the Black profile theme has a true-black hero running under the safe area,
 * and a light strip over it reads as a milky grey band right at the notch,
 * with black status bar icons vanishing into the hero behind it.
 *
 * Rather than special-casing screens inside App.tsx, a screen declares that its
 * own top area is dark via `useDarkTopArea()`, and the strip flips to match.
 * Claims are focus-gated and released on blur, so pushing another screen on top
 * cannot leave the strip stuck dark.
 */
type StatusBarTintValue = {
  /** True while any focused screen has claimed a dark top area. */
  isDarkTopArea: boolean;
  claimDarkTopArea: (id: string) => void;
  releaseDarkTopArea: (id: string) => void;
};

const StatusBarTintContext = createContext<StatusBarTintValue | null>(null);

export function StatusBarTintProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // A list of claim ids rather than a single boolean: a screen and a modal
  // presented over it can both be mounted and claiming, and releasing one must
  // not clear the other's claim.
  const [claims, setClaims] = useState<string[]>([]);

  const claimDarkTopArea = useCallback((id: string) => {
    setClaims(prev => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const releaseDarkTopArea = useCallback((id: string) => {
    setClaims(prev => (prev.includes(id) ? prev.filter(c => c !== id) : prev));
  }, []);

  const value = useMemo(
    () => ({
      isDarkTopArea: claims.length > 0,
      claimDarkTopArea,
      releaseDarkTopArea,
    }),
    [claims.length, claimDarkTopArea, releaseDarkTopArea],
  );

  return (
    <StatusBarTintContext.Provider value={value}>
      {children}
    </StatusBarTintContext.Provider>
  );
}

/** Read by the root status bar chrome only. Defaults to light/pale. */
export function useStatusBarTint(): boolean {
  return useContext(StatusBarTintContext)?.isDarkTopArea ?? false;
}

/**
 * Declare that this screen's top edge is dark, so the root status bar strip
 * should invert. Pass the screen's own derived value (e.g. `heroIsDark`) — it
 * is re-evaluated when that changes, so a live theme switch is picked up.
 *
 * Note for provider-themed screens: use the hero's darkness, NOT the theme's
 * `isDark` token. `isDark` is derived from the card colour, and the Black theme
 * pairs a true-black hero with a pale card — so `isDark` is false there and
 * gating on it would silently never fire.
 */
export function useDarkTopArea(active: boolean): void {
  const ctx = useContext(StatusBarTintContext);
  const isFocused = useIsFocused();
  const id = useId();

  const claim = ctx?.claimDarkTopArea;
  const release = ctx?.releaseDarkTopArea;

  useEffect(() => {
    if (!claim || !release) return undefined;
    if (!active || !isFocused) return undefined;
    claim(id);
    return () => release(id);
  }, [active, isFocused, id, claim, release]);
}
