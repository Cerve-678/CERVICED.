import React from 'react';
import { StatusBar } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { FocusAwareStatusBar } from '../components/FocusAwareStatusBar';

// A stand-in navigation object: enough for isFocused and focus/blur listeners.
function fakeNavigation(initiallyFocused: boolean) {
  let focused = initiallyFocused;
  const listeners: Record<string, Array<() => void>> = { focus: [], blur: [] };
  return {
    isFocused: () => focused,
    addListener: (event: 'focus' | 'blur', cb: () => void) => {
      listeners[event]!.push(cb);
      return () => { listeners[event] = listeners[event]!.filter(l => l !== cb); };
    },
    emit(event: 'focus' | 'blur') {
      focused = event === 'focus';
      listeners[event]!.forEach(cb => cb());
    },
  };
}

function renderWith(nav: ReturnType<typeof fakeNavigation>) {
  return render(
    <NavigationContext.Provider value={nav as never}>
      <FocusAwareStatusBar barStyle="light-content" />
    </NavigationContext.Provider>,
  );
}

test('applies only while its screen is focused', () => {
  const nav = fakeNavigation(true);
  const ui = renderWith(nav);
  expect(ui.UNSAFE_queryByType(StatusBar)).not.toBeNull();

  act(() => nav.emit('blur'));
  expect(ui.UNSAFE_queryByType(StatusBar)).toBeNull();

  act(() => nav.emit('focus'));
  expect(ui.UNSAFE_queryByType(StatusBar)).not.toBeNull();
});

test('a screen mounted underneath another starts out not applying', () => {
  const ui = renderWith(fakeNavigation(false));
  expect(ui.UNSAFE_queryByType(StatusBar)).toBeNull();
});

test('outside a navigator it behaves like a plain StatusBar', () => {
  const ui = render(<FocusAwareStatusBar barStyle="dark-content" />);
  expect(ui.UNSAFE_queryByType(StatusBar)?.props['barStyle']).toBe('dark-content');
});
