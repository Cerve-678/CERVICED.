import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

/** Case-insensitive, ignoring spaces either side. */
export function matchesConfirmWord(input: string, word: string): boolean {
  return input.trim().toUpperCase() === word.trim().toUpperCase();
}

export interface TypedConfirmRequest {
  title: string;
  message: string;
  /** The word to type, e.g. "DELETE". */
  word: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * A confirm dialog that stays locked until the exact word is typed, for
 * actions that can't be undone. Cross-platform, unlike Alert.prompt (iOS only).
 * Pass null to hide it.
 */
export function TypedConfirmDialog({ request, onCancel }: { request: TypedConfirmRequest | null; onCancel: () => void }) {
  const { isDarkMode, palette: P } = useTheme();
  const [typed, setTyped] = useState('');
  const danger = isDarkMode ? '#E05050' : '#C0392B';

  useEffect(() => { setTyped(''); }, [request]);

  const ready = !!request && matchesConfirmWord(typed, request.word);

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        {request && (
          <View style={[styles.box, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.title, { color: P.text }]}>{request.title}</Text>
            <Text style={[styles.body, { color: P.text }]}>{request.message}</Text>
            <Text style={[styles.body, { color: P.sub }]}>
              Type <Text style={{ fontWeight: '700', color: P.text }}>{request.word}</Text> to confirm.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              placeholder={request.word}
              placeholderTextColor={P.sub}
              accessibilityLabel={`Type ${request.word} to confirm`}
              style={[styles.input, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
            />
            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, { borderColor: P.border }]} onPress={onCancel} activeOpacity={0.7}>
                <Text style={[styles.btnText, { color: P.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: danger, borderColor: danger, opacity: ready ? 1 : 0.35 }]}
                disabled={!ready}
                onPress={request.onConfirm}
                activeOpacity={0.8}
                accessibilityState={{ disabled: !ready }}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{request.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  box: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12 },
  title: { fontFamily: 'JosefinSans-Bold', fontSize: 20, letterSpacing: 0.5 },
  body: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16, letterSpacing: 2 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'JosefinSans-Bold', fontSize: 13, letterSpacing: 1 },
});
