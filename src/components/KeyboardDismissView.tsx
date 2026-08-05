import React from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface KeyboardDismissViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  // Height of anything rendered ABOVE this component that KeyboardAvoidingView
  // itself doesn't know about — a custom header, safe-area inset, etc. On iOS,
  // `padding` behavior offsets from this component's own top, so omitting this
  // is what caused the extra-gap-above-input bug on screens with a header
  // rendered outside the KeyboardAvoidingView (see ProviderConversationScreen's
  // pre-existing correct `insets.top + headerHeight` for the shape to pass in).
  extraOffset?: number;
  // Tap-outside-to-dismiss. Off by default because a ScrollView ancestor with
  // keyboardShouldPersistTaps="handled" (the app's existing convention on
  // full-screen forms) already covers this — only turn it on for modal/sheet
  // overlays that don't scroll, matching the TouchableWithoutFeedback +
  // Keyboard.dismiss pattern already used for popup rating/review modals.
  dismissOnTap?: boolean;
}

// Single source of truth for KeyboardAvoidingView's platform-specific
// behavior — 28 screens previously each hand-rolled this with inconsistent
// `behavior`/`keyboardVerticalOffset` values (some omitted Android handling
// entirely via `undefined`, some hardcoded offset 0 regardless of what's
// above them), which is what caused the keyboard covering inputs, layout
// jumping, and inconsistent dismiss behavior across the app. Match this
// component's defaults rather than reintroducing a per-screen guess.
export function KeyboardDismissView({
  children,
  style,
  extraOffset = 0,
  dismissOnTap = false,
}: KeyboardDismissViewProps) {
  const content = (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? extraOffset : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );

  if (!dismissOnTap) return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {content}
    </TouchableWithoutFeedback>
  );
}
