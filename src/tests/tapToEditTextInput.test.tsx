// Edit Profile's Description box opened the keyboard whenever a scroll down
// the page started on top of it. TapToEditTextInput only focuses on a press.

import React from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { TapToEditTextInput } from '../components/TapToEditTextInput';

describe('TapToEditTextInput', () => {
  it('ignores touches on the input until it has been tapped into', () => {
    const screen = render(<TapToEditTextInput value="" placeholder="About you" />);
    const input = screen.UNSAFE_getByType(TextInput);
    expect(input.parent?.props['pointerEvents']).toBe('none');

    fireEvent(input, 'focus');
    expect(screen.UNSAFE_getByType(TextInput).parent?.props['pointerEvents']).toBe('auto');

    fireEvent(screen.UNSAFE_getByType(TextInput), 'blur');
    expect(screen.UNSAFE_getByType(TextInput).parent?.props['pointerEvents']).toBe('none');
  });

  it("still calls the caller's focus and blur handlers", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const screen = render(<TapToEditTextInput value="" onFocus={onFocus} onBlur={onBlur} />);
    fireEvent(screen.UNSAFE_getByType(TextInput), 'focus');
    fireEvent(screen.UNSAFE_getByType(TextInput), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
