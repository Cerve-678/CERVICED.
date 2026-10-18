// src/features/providers/LinkOnlyAnnouncementSheet.tsx
// A link-only provider's announcement: a title and a message, sent as an
// in-app notification (and push, where the client allows it) to the clients
// who saved them. That's the whole audience — link-only providers have no
// CERVICED bookings to target "repeat" or "lapsed" clients from.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getMyProviderSaverCount, sendAnnouncementToMySavers } from '../../services/databaseService';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { toUserMessageAllowingDbGuard, toUserMessage } from '../../utils/userFacingError';
import type { DiaryPalette } from './DiaryCard';

interface Props {
  visible: boolean;
  P: DiaryPalette;
  onClose: () => void;
  onSent: (count: number) => void;
}

export function LinkOnlyAnnouncementSheet({ visible, P, onClose, onSent }: Props) {
  const bottomInset = useSystemBottomInset();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // Fresh state per open: the caller remounts this sheet (a new `key`) each
  // time it shows it; this only loads the audience size.
  useEffect(() => {
    if (!visible) return;
    getMyProviderSaverCount()
      .then(setCount)
      .catch((e: unknown) => {
        setCount(0);
        setError(toUserMessage(e, "Couldn't load who's saved you. Please try again.", 'LinkOnlyAnnouncement.audience'));
      });
  }, [visible]);

  const canSend = count != null && count > 0 && title.trim().length > 0 && body.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const sent = await sendAnnouncementToMySavers(title.trim(), body.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSent(sent);
    } catch (e) {
      setError(toUserMessageAllowingDbGuard(e, "That didn't send. Please try again.", 'LinkOnlyAnnouncement.send'));
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={[styles.sheet, { backgroundColor: P.bg, paddingBottom: bottomInset + 20 }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: P.border }]} />
            <Text style={[styles.title, { color: P.text }]}>New announcement</Text>
            <Text style={[styles.sub, { color: P.sub }]}>
              {count == null
                ? 'Checking who has saved you…'
                : count === 0
                  ? "Nobody has saved your profile yet. Once clients save you, announcements reach them here."
                  : `Goes to the ${count} client${count === 1 ? '' : 's'} who saved you.`}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title, e.g. New slots in November"
              placeholderTextColor={P.sub}
              maxLength={60}
              style={[styles.input, { borderColor: P.border, color: P.text, backgroundColor: P.card }]}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Your message"
              placeholderTextColor={P.sub}
              maxLength={400}
              multiline
              style={[styles.input, styles.multiline, { borderColor: P.border, color: P.text, backgroundColor: P.card }]}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: P.accent }, !canSend && styles.disabled]}
              disabled={!canSend}
              onPress={handleSend}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator color={P.onAccent} /> : <Text style={[styles.buttonText, { color: P.onAccent }]}>Send</Text>}
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 10, gap: 10 },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 6 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 20 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: '#B3261E' },
  button: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.6 },
  disabled: { opacity: 0.45 },
});
