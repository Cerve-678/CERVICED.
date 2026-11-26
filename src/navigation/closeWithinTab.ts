// Closing a screen must stay in the tab it was opened from. A plain goBack() on
// a screen alone on its stack has nothing to pop, so it bubbles up to the tab
// navigator, whose backBehavior switches to the calendar tab.

/** The main screen of each tab that has one to fall back on. Home's stack isn't
 *  here: falling through from it lands on Home anyway. */
const TAB_ROOT_SCREENS: readonly string[] = ['ProviderServicesMain', 'ProviderAccountMain'];

interface ClosableNavigation {
  getState(): { index: number; routeNames: readonly string[] } | undefined;
  goBack(): void;
  // Each stack types its routes by its own screen names; the root below is
  // checked against routeNames at runtime instead.
  reset(state: never): void;
}

export function closeWithinTab(navigation: ClosableNavigation): void {
  const state = navigation.getState();
  const root = state && state.index === 0
    ? TAB_ROOT_SCREENS.find(name => state.routeNames.includes(name))
    : undefined;
  if (root) navigation.reset({ index: 0, routes: [{ name: root }] } as never);
  else navigation.goBack();
}
