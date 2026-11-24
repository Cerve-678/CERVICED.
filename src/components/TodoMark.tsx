// src/components/TodoMark.tsx
//
// A small red "!" meaning "something here is left to do". Uses ERROR_RED, the
// same red sign-up uses to mark an unanswered required question, since that is
// what it points at. Hidden from screen readers: the row or card it sits in
// says what's left in its own accessibilityLabel.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ERROR_RED } from './signup/FormKit';

export function TodoMark({ size = 16 }: { size?: number }) {
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.7), lineHeight: size }]} allowFontScaling={false}>!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: ERROR_RED, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '900', textAlign: 'center' },
});
