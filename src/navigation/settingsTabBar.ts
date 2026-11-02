import { useNavigation } from '@react-navigation/native';

/** The provider's Settings tab (ProviderAccountNavigator), in both tab sets. */
export const PROVIDER_SETTINGS_TAB = 'Profile';

/**
 * The only Settings-tab screens that keep the bottom nav. Everything pushed on
 * top of them (Achievements, Notifications, Business Profile's own sub-screens,
 * and so on) hides it, so a new screen added to that stack hides it too
 * without having to opt in.
 */
const SETTINGS_ROUTES_WITH_TAB_BAR: readonly string[] = ['ProviderAccountMain', 'BusinessProfile'];

/**
 * `focusedRoute` is the stack's focused route name, or undefined before the
 * stack has navigated anywhere, when it is still on its root.
 */
export function settingsStackHidesTabBar(focusedRoute: string | undefined): boolean {
  return focusedRoute !== undefined && !SETTINGS_ROUTES_WITH_TAB_BAR.includes(focusedRoute);
}

/**
 * True when the calling screen sits in the provider's Settings tab, where any
 * pushed screen has no bottom nav to leave room for. Only meaningful in the
 * provider hat; the client's Profile tab has the same name but keeps the bar.
 */
export function useInProviderSettingsTab(): boolean {
  const navigation = useNavigation();
  const stackKey = navigation.getState()?.key;
  const tabs = navigation.getParent()?.getState();
  return tabs?.routes.some(r => r.name === PROVIDER_SETTINGS_TAB && r.state?.key === stackKey) ?? false;
}
