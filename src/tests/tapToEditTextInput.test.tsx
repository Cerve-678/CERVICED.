// Edit Profile's Description box opened the keyboard whenever a scroll down
// the page started on top of it. TapToEditTextInput only focuses on a press,
// and must still let you type once tapped (#379 switched touches off on the
// input itself, and on iOS it then couldn't be typed in at all).

import React from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { TapToEditTextInput } from '../components/TapToEditTextInput';

describe('TapToEditTextInput', () => {
  it('covers the input until it is tapped, then gets out of the way', () => {
    const screen = render(<TapToEditTextInput value="" placeholder="About you" />);
    expect(screen.queryByTestId('tap-to-edit-cover')).not.toBeNull();

    fireEvent(screen.UNSAFE_getByType(TextInput), 'focus');
    expect(screen.queryByTestId('tap-to-edit-cover')).toBeNull();

    fireEvent(screen.UNSAFE_getByType(TextInput), 'blur');
    expect(screen.queryByTestId('tap-to-edit-cover')).not.toBeNull();
  });

  it('never turns touches off on the input itself', () => {
    const screen = render(<TapToEditTextInput value="" />);
    const input = screen.UNSAFE_getByType(TextInput);
    expect(input.props['pointerEvents']).toBeUndefined();
    expect(input.parent?.props['pointerEvents']).toBeUndefined();
  });

  it('a tap on the cover focuses the input', () => {
    const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus').mockImplementation(() => {});
    const screen = render(<TapToEditTextInput value="" />);
    fireEvent.press(screen.getByTestId('tap-to-edit-cover'));
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
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

  it('has no cover when the box is read-only', () => {
    const screen = render(<TapToEditTextInput value="" editable={false} />);
    expect(screen.queryByTestId('tap-to-edit-cover')).toBeNull();
  });
});
