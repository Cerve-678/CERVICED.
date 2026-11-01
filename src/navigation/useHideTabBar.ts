import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

/** Which screen last hid the tab bar, per stack. Each tab has one stack. */
const tabBarHiddenBy = new Map<string, symbol>();

/**
 * Hides IslandPillTabBar while the calling screen is focused.
 *
 * Going from one hiding screen to another, React Navigation focuses the new
 * screen first and blurs the old one second, so the old screen's restore lands
 * last and puts the bar back over the new screen. That is how Reschedule came
 * to show the bar when opened from BookingDetail. Only the screen that hid the
 * bar most recently may restore it.
 *
 * Pass `hidden = false` for a screen that shows the bar again part-way through
 * a visit, such as ProviderProfile once something has been added to the cart.
 */
export function useHideTabBar(hidden = true): void {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      if (!hidden) return undefined;
      const tab = navigation.getParent();
      const stackKey = navigation.getState()?.key;
      if (!tab || !stackKey) return undefined;
      const claim = Symbol(stackKey);
      tabBarHiddenBy.set(stackKey, claim);
      tab.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        if (tabBarHiddenBy.get(stackKey) !== claim) return;
        tabBarHiddenBy.delete(stackKey);
        tab.setOptions({ tabBarStyle: undefined });
      };
    }, [hidden, navigation]),
  );
}
