import { getFocusedRouteNameFromRoute, useNavigation, useRoute } from '@react-navigation/native';

/** The Settings tab in both hats: ProfileNavigator (client), ProviderAccountNavigator (provider). */
export const SETTINGS_TAB = 'Profile';

/** The provider's Home tab: ProviderHomeNavigator (both the booking and link-only Home). */
export const PROVIDER_HOME_TAB = 'ProviderHome';

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
 * The provider Home's Quick Access sheet (the + button). These screens, and
 * anything opened from them (a conversation from Inbox, a booking from
 * Clientele), show no bottom nav. Keep in step with the sheet's rows in
 * ProviderHomeScreen.
 */
export const QUICK_ACCESS_ROUTES: readonly string[] = [
  'AddBooking', 'ProviderSchedule', 'Promotions', 'Clientele', 'InfoPacks', 'ProviderIntakeForm', 'ProviderInbox',
];

/**
 * Whether the bottom nav is hidden on `tab` when its stack holds `stack`
 * (route names from the root up to the screen being shown, which is last).
 * An empty stack means the tab has not navigated anywhere yet, so it is on its root.
 */
export function stackHidesTabBar(tab: string, stack: readonly string[]): boolean {
  if (tab === SETTINGS_TAB) {
    const top = stack[stack.length - 1];
    return top !== undefined && !SETTINGS_ROUTES_WITH_TAB_BAR.includes(top);
  }
  if (tab === PROVIDER_HOME_TAB) {
    return stack.some(name => QUICK_ACCESS_ROUTES.includes(name));
  }
  return false;
}

type TabRoute = Parameters<typeof getFocusedRouteNameFromRoute>[0] & {
  state?: { index?: number; routes: readonly { name: string }[] };
};

/**
 * A tab's stack as route names, root first, up to its focused screen. Before
 * the stack has mounted there is no state yet, only the screen a navigate()
 * asked for, which getFocusedRouteNameFromRoute reads from the params.
 */
export function tabStackRouteNames(tab: TabRoute): string[] {
  const state = tab.state;
  if (!state) {
    const focused = getFocusedRouteNameFromRoute(tab);
    return focused ? [focused] : [];
  }
  const index = state.index ?? state.routes.length - 1;
  return state.routes.slice(0, index + 1).map(r => r.name);
}

/**
 * True when the calling screen is one shown without the bottom nav, so a
 * footer has only the home indicator to clear.
 */
export function useStackHidesTabBar(): boolean {
  const navigation = useNavigation();
  const route = useRoute();
  const stack = navigation.getState();
  const tab = navigation.getParent()?.getState()?.routes.find(r => r.state?.key === stack?.key);
  if (!tab || !stack) return false;
  const upTo = stack.routes.findIndex(r => r.key === route.key);
  return stackHidesTabBar(tab.name, stack.routes.slice(0, upTo + 1).map(r => r.name));
}
