import React from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { KeyboardDismissView } from '../components/KeyboardDismissView';

// The keyboard's position arrives in window coordinates, while the avoiding
// view only knows its frame relative to its parent. A screen that sits below
// a stack header (the Get In Touch chat) passes how far down its parent
// starts; dropping that offset on either platform leaves the composer under
// the keyboard by the header's height.
describe('KeyboardDismissView', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it.each([
    ['ios', 'padding'],
    ['android', 'height'],
  ])('passes the parent offset through on %s', (os, behavior) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    const { UNSAFE_getByType } = render(
      <KeyboardDismissView extraOffset={103}>
        <Text>Message</Text>
      </KeyboardDismissView>,
    );
    const avoiding = UNSAFE_getByType(KeyboardAvoidingView);
    expect(avoiding.props['keyboardVerticalOffset']).toBe(103);
    expect(avoiding.props['behavior']).toBe(behavior);
  });

  it('adds no offset when the parent starts at the top of the screen', () => {
    const { UNSAFE_getByType } = render(
      <KeyboardDismissView>
        <Text>Message</Text>
      </KeyboardDismissView>,
    );
    expect(UNSAFE_getByType(KeyboardAvoidingView).props['keyboardVerticalOffset']).toBe(0);
  });
});
