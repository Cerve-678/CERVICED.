import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

/**
 * A `TextInput` for a big box that sits in a scrolling page, which only opens
 * the keyboard on a real tap.
 *
 * A plain multiline input takes the touch the moment a finger lands on it, so
 * starting a scroll on top of it focused it and threw the keyboard up. Here,
 * until it's focused, the input ignores touches and a `Pressable` over it
 * focuses it on press instead. A press is cancelled as soon as the parent
 * ScrollView starts scrolling, so scrolling past the box leaves it alone.
 * Once focused it behaves like any input (cursor placement, selection).
 *
 * The first tap puts the cursor at the end of the text rather than where the
 * finger was; a second tap moves it.
 */
export const TapToEditTextInput = forwardRef<TextInputInstance, TextInputProps>(
  function TapToEditTextInput({ onFocus, onBlur, editable = true, ...props }, ref) {
    const inputRef = useRef<TextInputInstance>(null);
    const [focused, setFocused] = useState(false);
    useImperativeHandle(ref, () => inputRef.current as TextInputInstance);

    return (
      <Pressable
        onPress={() => inputRef.current?.focus()}
        disabled={focused || !editable}
        // Screen readers go to the input itself, not this wrapper.
        accessible={false}
      >
        <View pointerEvents={focused ? 'auto' : 'none'}>
          <TextInput
            {...props}
            ref={inputRef}
            editable={editable}
            onFocus={e => { setFocused(true); onFocus?.(e); }}
            onBlur={e => { setFocused(false); onBlur?.(e); }}
          />
        </View>
      </Pressable>
    );
  },
);
