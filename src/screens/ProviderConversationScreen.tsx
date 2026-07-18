import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProviderHomeStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  markConversationReadByProvider,
  getConversationMessages,
  sendProviderMessage,
  DbProviderMessage,
} from '../services/databaseService';

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

const OL = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  accent: '#AF9197',
};
const OD = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  accent: '#AF9197',
};

export default function ProviderConversationScreen({ navigation, route }: Props) {
  const { conversationId, clientName } = route.params;
  const { isDarkMode } = useTheme();
  const OP = isDarkMode ? OD : OL;

  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [providerUserId, setProviderUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Get current user (the provider's own auth id)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setProviderUserId(user.id);
    });
  }, []);

  // Mark conversation as read by the provider on open
  useEffect(() => {
    if (!conversationId) return;
    markConversationReadByProvider(conversationId).catch(() => {});
  }, [conversationId]);

  // Load initial messages
  useEffect(() => {
    if (!conversationId) return;
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
      supabase.rpc('update_conversation_last_message', {
        conv_id: conversationId,
        msg_text: text,
        p_sender_type: 'provider',
      }).then(() => {});
    } catch {
      // Message never reached the client — put the text back so it isn't lost
      setInputText(text);
      Alert.alert('Message not sent', 'Check your connection and try again.');
    }
    setSending(false);
  }, [inputText, conversationId, providerUserId, sending]);

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
            {new Date(item.created_at).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            })}
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={kvOffset}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.listContent, messages.length === 0 && { flex: 1 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: OP.accent }]}>{clientName}</Text>
              <Text style={[styles.emptyBody, { color: OP.sub }]}>No messages yet</Text>
            </View>
          }
        />

        {/* Input bar — sits above the home indicator */}
        <View style={[styles.inputRow, {
          backgroundColor: OP.bg,
          borderTopColor: OP.border,
          paddingBottom: Math.max(insets.bottom, 10),
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
      </KeyboardAvoidingView>
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
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  timeStamp: {
    fontFamily: 'Jura-VariableFont_wght',
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
  bubbleText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
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
