import { useNavigation, useRoute } from '@react-navigation/native';

/** The Settings tab in both hats: ProfileNavigator (client), ProviderAccountNavigator (provider). */
export const SETTINGS_TAB = 'Profile';

/**
 * The only Settings-tab screens that keep the bottom nav: the client's Profile,
 * the provider's Settings, and the provider's Business Profile. The two stacks
 * share no route names, so one list serves both hats. Everything pushed on top
 * (Achievements, Notifications, Business Profile's own sub-screens, Points, and
 * so on) hides it, so a new screen added to either stack hides it too without
 * having to opt in.
 */
const SETTINGS_ROUTES_WITH_TAB_BAR: readonly string[] = ['ProfileMain', 'ProviderAccountMain', 'BusinessProfile'];

/**
 * `focusedRoute` is the stack's focused route name, or undefined before the
 * stack has navigated anywhere, when it is still on its root.
 */
export function settingsStackHidesTabBar(focusedRoute: string | undefined): boolean {
  return focusedRoute !== undefined && !SETTINGS_ROUTES_WITH_TAB_BAR.includes(focusedRoute);
}

/**
 * True when the calling screen is one the Settings tab shows without the
 * bottom nav, so a footer has only the home indicator to clear.
 */
export function useSettingsStackHidesTabBar(): boolean {
  const navigation = useNavigation();
  const route = useRoute();
  const stackKey = navigation.getState()?.key;
  const tabs = navigation.getParent()?.getState();
  const inSettingsTab = tabs?.routes.some(r => r.name === SETTINGS_TAB && r.state?.key === stackKey) ?? false;
  return inSettingsTab && settingsStackHidesTabBar(route.name);
}
