import React, { useContext, useEffect, useState } from 'react';
import { AppState, StatusBar, type StatusBarProps } from 'react-native';
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
 * The stack alone still left the clock white after coming back to a pale
 * screen. On iOS, React Native only tells the phone about a colour when it
 * differs from the one it LAST SENT, not the one actually showing. Anything
 * native that changes the colour behind its back (the Stripe / Apple Pay
 * sheet, a web page, the app coming back from the background) leaves it
 * believing the clock is still dark, so returning to a screen that wants dark
 * sends nothing. So whenever its screen gains focus, or the app comes back to
 * the foreground while it's showing, this re-sends its own colour straight to
 * the phone. (`setBarStyle` also rewrites the stack's fallback default, which
 * is never read: App.tsx's root bar always sets a style.)
 *
 * Outside a navigator (no NavigationContext), it behaves like a plain
 * `<StatusBar>`, plus the foreground re-send.
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

  const { barStyle, animated } = props;
  useEffect(() => {
    if (!focused || !barStyle) return undefined;
    const reassert = () => StatusBar.setBarStyle(barStyle, animated ?? false);
    reassert();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') reassert();
    });
    return () => sub.remove();
  }, [focused, barStyle, animated]);

  return focused ? <StatusBar {...props} /> : null;
}
