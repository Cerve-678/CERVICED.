import React, { useContext, useEffect, useState } from 'react';
import { StatusBar, type StatusBarProps } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/**
 * A `<StatusBar>` that only applies while its screen is the one showing.
 *
 * React Native's `<StatusBar>` component keeps a stack of every mounted
 * instance and the most recently MOUNTED one wins, whether or not its screen is
 * visible. Tab screens and screens lower in a stack stay mounted, so a screen
 * you visited earlier kept overriding the one in front of you: white clock and
 * battery on a pale screen, or black on a dark one. Rendering nothing while
 * blurred takes the screen's entry off that stack, so the focused screen (or,
 * failing that, the root default in App.tsx) is always the one that counts.
 *
 * Outside a navigator (no NavigationContext), it behaves like a plain
 * `<StatusBar>`.
 */
export function FocusAwareStatusBar(props: StatusBarProps): React.ReactElement | null {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState<boolean>(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused ? <StatusBar {...props} /> : null;
}
