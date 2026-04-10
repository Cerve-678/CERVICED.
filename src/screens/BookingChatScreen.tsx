import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  getBookingMessages,
  sendBookingMessage,
  subscribeToBookingMessages,
  BookingMessage,
} from '../services/databaseService';

interface Props {
  route: {
    params: {
      bookingId: string;          // Supabase booking UUID
      senderRole: 'customer' | 'provider';
      otherPartyName: string;     // Display name shown in header
    };
  };
  navigation: any;
}

export default function BookingChatScreen({ route, navigation }: Props) {
  const { bookingId, senderRole, otherPartyName } = route.params;
  const { theme, isDarkMode } = useTheme();

  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  // Get current user id once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // Load existing messages
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBookingMessages(bookingId)
      .then(msgs => { if (!cancelled) setMessages(msgs); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId]);

  // Realtime subscription — deduplicate against already-loaded messages
  useEffect(() => {
    const unsub = subscribeToBookingMessages(bookingId, (newMsg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [bookingId]);

  // Scroll to bottom when messages first load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [loading]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendBookingMessage({
        bookingId,
        content: trimmed,
        senderRole,
      });
      // Optimistic — add immediately (realtime will deduplicate)
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Failed to send', 'Please check your connection and try again.');
      setText(trimmed); // restore
    } finally {
      setSending(false);
    }
  }, [text, sending, bookingId, senderRole]);

  const renderMessage = ({ item }: { item: BookingMessage }) => {
    const isMine = item.sender_id === currentUserId;
    return (
      <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
        <View style={[
          styles.bubble,
          isMine
            ? { backgroundColor: '#007AFF' }
            : { backgroundColor: isDarkMode ? '#2C2C2E' : '#E9E9EB' },
        ]}>
          <Text style={[styles.bubbleText, { color: isMine ? '#fff' : theme.text }]}>
            {item.content}
          </Text>
          <Text style={[styles.timestamp, { color: isMine ? 'rgba(255,255,255,0.6)' : theme.text + '66' }]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: theme.text + '66' }]}>
                  No messages yet. Say hello!
                </Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={[
          styles.inputBar,
          { backgroundColor: isDarkMode ? '#1C1C1E' : '#F2F2F7', borderTopColor: isDarkMode ? '#3A3A3C' : '#C6C6C8' },
        ]}>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: isDarkMode ? '#2C2C2E' : '#fff' }]}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={theme.text + '66'}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15 },
  row: { flexDirection: 'row', marginVertical: 2 },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  timestamp: { fontSize: 11, alignSelf: 'flex-end' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
