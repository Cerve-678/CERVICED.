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
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<HomeStackParamList, 'ProviderChat'>;

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

export default function ProviderChatScreen({ navigation, route }: Props) {
  const { providerId, providerDbId, providerName } = route.params;
  const { isDarkMode } = useTheme();
  const OP = isDarkMode ? OD : OL;

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Get or create conversation
  useEffect(() => {
    if (!userId || !providerDbId) return;

    async function initConversation() {
      setLoading(true);
      try {
        const { data: existing } = await supabase
          .from('provider_conversations')
          .select('id')
          .eq('provider_id', providerDbId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          setConversationId(existing.id);
        } else {
          const { data: newConv } = await supabase
            .from('provider_conversations')
            .insert({ provider_id: providerDbId, user_id: userId })
            .select('id')
            .single();
          if (newConv) setConversationId(newConv.id);
        }
      } catch {
        /* silent */
      }
      setLoading(false);
    }

    initConversation();
  }, [userId, providerDbId]);

  // Load initial messages
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('provider_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, [conversationId]);

  // Realtime new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'provider_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev => {
            const msg = payload.new as Message;
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Set header
  useEffect(() => {
    navigation.setOptions({
      title: providerName,
      headerShown: true,
      headerBackTitle: 'Back',
    });
  }, [navigation, providerName]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !userId || sending) return;

    setSending(true);
    setInputText('');
    Keyboard.dismiss();

    try {
      const { data: inserted } = await supabase
        .from('provider_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          sender_type: 'user',
          content: text,
        })
        .select('*')
        .single();

      if (inserted) {
        setMessages(prev => {
          if (prev.find(m => m.id === inserted.id)) return prev;
          return [...prev, inserted as Message];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      }

      await supabase.rpc('update_conversation_last_message', {
        conv_id: conversationId,
        msg_text: text,
      });
    } catch {
      /* silent */
    }
    setSending(false);
  }, [inputText, conversationId, userId, sending]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isUser = item.sender_type === 'user';
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
        <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: OP.accent }]
                : [styles.bubbleProvider, { backgroundColor: OP.surface, borderColor: OP.border }],
            ]}
          >
            <Text style={[styles.bubbleText, { color: isUser ? '#fff' : OP.text }]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [messages, OP]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: OP.bg }]}>
        <ActivityIndicator color={OP.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: OP.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
            <Text style={[styles.emptyTitle, { color: OP.accent }]}>{providerName}</Text>
            <Text style={[styles.emptyBody, { color: OP.sub }]}>
              Send a message to start a conversation
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={[styles.inputRow, { backgroundColor: OP.bg, borderTopColor: OP.border }]}>
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
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
