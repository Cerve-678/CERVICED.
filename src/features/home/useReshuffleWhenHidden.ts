// Gives Home's browse rails a new order between visits without ever
// reordering them where the client can see it.
//
// Home is hidden in exactly two ways: a tab switch (instant) or a screen
// pushed over it (only once that screen's slide-in ends — the stack then
// sends Home `transitionEnd` with `closing: true`). Anything else, such as an
// overlay Home stays visible behind, leaves the order alone: a stable rail
// beats one that jumps. This replaces a 600ms timer that guessed the push had
// finished, and guessed wrong whenever the next screen was slow to open.

import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, type NavigationProp, type ParamListBase } from '@react-navigation/native';

export interface ReshuffleWhenHidden {
  /** Home is in view again: a reshuffle still waiting for it to be covered is dropped. */
  focused: () => void;
  /** Home lost focus. `tabStillFocused` is false when a tab switch hid it. */
  left: (how: { tabStillFocused: boolean }) => void;
  /** The stack finished a transition on Home; `closing` means it's now hidden. */
  transitionEnd: (event: { closing: boolean }) => void;
}

/** The decision itself, free of React so it can be tested directly. */
export function createReshuffleWhenHidden(reshuffle: () => void): ReshuffleWhenHidden {
  let waitingToBeCovered = false;
  return {
    focused: () => {
      waitingToBeCovered = false;
    },
    left: ({ tabStillFocused }) => {
      if (!tabStillFocused) {
        reshuffle();
        return;
      }
      waitingToBeCovered = true;
    },
    transitionEnd: ({ closing }) => {
      if (!closing || !waitingToBeCovered) return;
      waitingToBeCovered = false;
      reshuffle();
    },
  };
}

/** Minimal shape of the screen's navigation this needs (native-stack screen in a tab). */
type HomeNavigation = Pick<NavigationProp<ParamListBase>, 'getParent'> & {
  addListener: (
    type: 'transitionEnd',
    callback: (event: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

/** Calls `reshuffle` once each time Home is fully hidden after being left. */
export function useReshuffleWhenHidden(navigation: HomeNavigation, reshuffle: () => void): void {
  // Latest reshuffle, so the controller and listeners never need rebuilding.
  const reshuffleRef = useRef(reshuffle);
  reshuffleRef.current = reshuffle;
  const controller = useRef<ReshuffleWhenHidden | null>(null);
  if (!controller.current) controller.current = createReshuffleWhenHidden(() => reshuffleRef.current());

  useFocusEffect(
    useCallback(() => {
      controller.current?.focused();
      return () => {
        controller.current?.left({ tabStillFocused: navigation.getParent()?.isFocused() !== false });
      };
    }, [navigation]),
  );

  useEffect(
    () => navigation.addListener('transitionEnd', (event) => {
      controller.current?.transitionEnd({ closing: event.data?.closing === true });
    }),
    [navigation],
  );
}
