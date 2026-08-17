import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProviderHomeStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useProviderDialog } from '../../components/ProviderDialog';
import { supabase } from '../../lib/supabase';
import {
  markConversationReadByProvider,
  getConversationMessages,
  getMyProviderMessageTemplates,
  sendProviderMessage,
  updateConversationLastMessage,
  DbProviderMessage,
} from '../../services/databaseService';
import { formatShortDate, formatTime12 } from '../../utils/dateUtils';

type Props = NativeStackScreenProps<ProviderHomeStackParamList, 'ProviderConversation'>;

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'user' | 'provider';
  content: string;
  created_at: string;
  read_at: string | null;
}

export default function ProviderConversationScreen({ navigation, route }: Props) {
  const { conversationId, clientName } = route.params;
  // Use the shared provider palette from the theme context so this screen obeys
  // light/dark mode the same way every other provider surface does, instead of a
  // hand-rolled OL/OD copy that could drift from the canonical palette.
  const { palette: OP } = useTheme();
  const { showToast, DialogHost } = useProviderDialog();

  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [providerUserId, setProviderUserId] = useState<string | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<{ label: string; content: string }[]>([]);
  const flatListRef = useRef<FlatList>(null);
  // The floating tab bar auto-hides while the keyboard is up (tabBarHideOnKeyboard),
  // so the input row only needs extra bottom clearance to clear the pill while
  // it's resting (keyboard down) — otherwise that clearance just becomes a dead
  // gap above the keyboard.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Get current user (the provider's own auth id)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setProviderUserId(user.id);
    });
  }, []);

  useEffect(() => {
    getMyProviderMessageTemplates()
      .then(templates => setSavedTemplates(templates))
      .catch(() => {});
  }, []);

  // Mark conversation as read by the provider on open
  useEffect(() => {
    if (!conversationId) return;
    markConversationReadByProvider(conversationId).catch(() => {});
  }, [conversationId]);

  // Load initial messages
  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    setLoading(true);
    getConversationMessages(conversationId)
      .then(data => { setMessages(data as Message[]); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [conversationId]);

  // Realtime new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`provider-chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'provider_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Reading it live — clear the unread counter the sender just bumped
          if (msg.sender_type === 'user') {
            markConversationReadByProvider(conversationId).catch(() => {});
          }
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);


  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !providerUserId || sending) return;

    setSending(true);
    setInputText('');
    Keyboard.dismiss();

    try {
      const inserted: DbProviderMessage = await sendProviderMessage({
        conversationId,
        senderId: providerUserId,
        senderType: 'provider',
        content: text,
      });

      setMessages(prev => {
        if (prev.find(m => m.id === inserted.id)) return prev;
        return [...prev, inserted as Message];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

      // Non-fatal: the message itself is already delivered; this only updates
      // the inbox preview + the client's unread badge
      updateConversationLastMessage({
        conversationId,
        message: text,
        senderType: 'provider',
      }).catch(() => {});
    } catch {
      // Message never reached the client — put the text back so it isn't lost
      setInputText(text);
      showToast('Message not sent. Check your connection and try again.', 'error');
    }
    setSending(false);
  }, [inputText, conversationId, providerUserId, sending, showToast]);

  // Prompts fill the composer instead of sending automatically, so providers
  // can edit every reply and client details are never copied into canned text.
  const defaultPrompts = [
    { label: 'Confirm address', text: 'Thanks — please confirm the address for your appointment.' },
    { label: 'Booking details', text: 'Thanks for your message. I’ll check your booking details and come back to you shortly.' },
    { label: 'Availability', text: 'Thanks for getting in touch. What date and time were you hoping for?' },
  ];
  const quickPrompts = savedTemplates.length > 0
    ? savedTemplates.map(template => ({ label: template.label, text: template.content }))
    : defaultPrompts;

  // If navigation reuses this screen, prevent even a transient render of a
  // previous client’s messages while the next thread loads.
  const visibleMessages = messages.filter(message => message.conversation_id === conversationId);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_type === 'provider';
    const prev = messages[index - 1];
    const showTime =
      !prev ||
      new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;

    return (
      <View>
        {showTime && (
          <Text style={[styles.timeStamp, { color: OP.sub }]}>
            {formatShortDate(item.created_at)}, {formatTime12(new Date(item.created_at))}
          </Text>
        )}
        <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
          <View
            style={[
              styles.bubble,
              isMine
                ? [styles.bubbleUser, { backgroundColor: OP.accent }]
                : [styles.bubbleProvider, { backgroundColor: OP.surface, borderColor: OP.border }],
            ]}
          >
            <Text style={[styles.bubbleText, { color: isMine ? '#fff' : OP.text }]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [messages, OP]);

  const headerHeight = 56;
  const kvOffset = Platform.OS === 'ios' ? insets.top + headerHeight : 0;

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: OP.bg }]}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: OP.bg }}>
          <View style={[styles.header, { borderBottomColor: OP.border }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconBtn, { backgroundColor: OP.surface }]}>
              <Ionicons name="chevron-back" size={20} color={OP.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: OP.text }]}>{clientName}</Text>
            <View style={styles.iconBtn} />
          </View>
        </SafeAreaView>
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator color={OP.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: OP.bg }]}>
      {/* Custom header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: OP.bg }}>
        <View style={[styles.header, { borderBottomColor: OP.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconBtn, { backgroundColor: OP.surface }]}>
            <Ionicons name="chevron-back" size={20} color={OP.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: OP.text }]} numberOfLines={1}>{clientName}</Text>
          <View style={styles.iconBtn} />
        </View>
      </SafeAreaView>

      <KeyboardDismissView
        style={{ flex: 1 }}
        extraOffset={kvOffset}
      >
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.listContent, visibleMessages.length === 0 && { flex: 1 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: OP.accent }]}>{clientName}</Text>
              <Text style={[styles.emptyBody, { color: OP.sub }]}>No messages yet</Text>
            </View>
          }
        />

        <View style={[styles.quickPromptRow, { borderTopColor: OP.border, backgroundColor: OP.bg }]}>
          {quickPrompts.map(prompt => (
            <TouchableOpacity
              key={prompt.label}
              style={[styles.quickPrompt, { backgroundColor: OP.surface, borderColor: OP.border }]}
              onPress={() => setInputText(prompt.text)}
              activeOpacity={0.75}
            >
              <Text style={[styles.quickPromptText, { color: OP.accent }]}>{prompt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input bar — clears the home indicator, and (while resting, keyboard
            down) the floating pill tab bar that overlays this screen */}
        <View style={[styles.inputRow, {
          backgroundColor: OP.bg,
          borderTopColor: OP.border,
          paddingBottom: keyboardVisible ? Math.max(insets.bottom, 10) : FLOATING_TAB_BAR_CLEARANCE,
        }]}>
          <TextInput
            style={[styles.input, { backgroundColor: OP.surface, color: OP.text, borderColor: OP.border }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message..."
            placeholderTextColor={OP.sub}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: OP.accent, opacity: (!inputText.trim() || sending) ? 0.4 : 1 }]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.75}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardDismissView>
      <DialogHost />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 8 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  timeStamp: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
    marginVertical: 10,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', marginBottom: 6 },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '76%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleProvider: { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14, lineHeight: 20 },
  quickPromptRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  quickPrompt: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  quickPromptText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
