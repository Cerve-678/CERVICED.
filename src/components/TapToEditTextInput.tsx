import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable, StyleSheet, TextInput, View,
  type TextInputInstance, type TextInputProps,
} from 'react-native';

/**
 * A `TextInput` for a big box that sits in a scrolling page, which only opens
 * the keyboard on a real tap.
 *
 * A plain multiline input takes the touch the moment a finger lands on it, so
 * starting a scroll on top of it focused it and threw the keyboard up. Here,
 * until it's focused, a see-through `Pressable` lies over the input and
 * focuses it on press. A press is cancelled as soon as the parent ScrollView
 * starts scrolling, so scrolling past the box leaves it alone. Once focused,
 * the cover goes and the input behaves like any other.
 *
 * The cover is a sibling laid on top, never `pointerEvents="none"` on the
 * input's own wrapper: that version (#379) switched off touch handling on the
 * input itself, and on iOS the input then wouldn't take focus at all, so
 * nobody could type in it.
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
      <View>
        <TextInput
          {...props}
          ref={inputRef}
          editable={editable}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
        />
        {!focused && editable ? (
          <Pressable
            testID="tap-to-edit-cover"
            style={StyleSheet.absoluteFill}
            onPress={() => inputRef.current?.focus()}
            // Screen readers go to the input itself, not this cover.
            accessible={false}
            importantForAccessibility="no"
          />
        ) : null}
      </View>
    );
  },
);
