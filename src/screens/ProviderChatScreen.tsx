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
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  getProviderAddressSettings,
  getClientBookingsForAddressShare,
  setBookingClientAddress,
  insertProviderNotification,
  ProviderAddressSettings,
  ClientBookingSummary,
} from '../services/databaseService';

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

  // Address-sharing (mobile providers only — client sends the address they want visited)
  const [addressSettings, setAddressSettings] = useState<ProviderAddressSettings | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressBookings, setAddressBookings] = useState<ClientBookingSummary[]>([]);
  const [loadingAddressBookings, setLoadingAddressBookings] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<ClientBookingSummary | null>(null);
  const [addressText, setAddressText] = useState('');
  const [sendingAddress, setSendingAddress] = useState(false);

  useEffect(() => {
    if (!providerDbId) return;
    getProviderAddressSettings(providerDbId).then(setAddressSettings).catch(() => {});
  }, [providerDbId]);

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

  // Mark conversation as read by the user on open (mirrors provider side)
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('provider_conversations')
      .update({ unread_count_user: 0 })
      .eq('id', conversationId)
      .then(() => {});
  }, [conversationId]);

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
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Reading it live — clear the unread counter the sender just bumped
          if (msg.sender_type === 'provider') {
            supabase
              .from('provider_conversations')
              .update({ unread_count_user: 0 })
              .eq('id', conversationId)
              .then(() => {});
          }
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

  const postMessage = useCallback(async (text: string) => {
    if (!text || !conversationId || !userId) return;

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
      p_sender_type: 'user',
    });
  }, [conversationId, userId]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !userId || sending) return;

    setSending(true);
    setInputText('');
    Keyboard.dismiss();

    try {
      await postMessage(text);
    } catch {
      /* silent */
    }
    setSending(false);
  }, [inputText, conversationId, userId, sending, postMessage]);

  const openAddressModal = useCallback(async () => {
    if (!providerDbId) return;
    setShowAddressModal(true);
    setLoadingAddressBookings(true);
    setSelectedBooking(null);
    setAddressText('');
    try {
      const bookings = await getClientBookingsForAddressShare(providerDbId);
      setAddressBookings(bookings);
      const [only] = bookings;
      if (bookings.length === 1 && only) {
        setSelectedBooking(only);
        setAddressText(only.client_address ?? '');
      }
    } finally {
      setLoadingAddressBookings(false);
    }
  }, [providerDbId]);

  const closeAddressModal = useCallback(() => {
    setShowAddressModal(false);
  }, []);

  const selectAddressBooking = useCallback((b: ClientBookingSummary) => {
    setSelectedBooking(b);
    setAddressText(b.client_address ?? '');
  }, []);

  const handleSendAddress = useCallback(async () => {
    const address = addressText.trim();
    if (!address || !selectedBooking || sendingAddress) return;

    setSendingAddress(true);
    try {
      await setBookingClientAddress(selectedBooking.id, address);
      await postMessage(`📍 Sent my address for ${selectedBooking.service_name_snapshot}: ${address}`);
      insertProviderNotification({
        provider_id: providerDbId,
        type: 'new_message',
        title: 'Address received',
        message: `A client sent their address for their ${selectedBooking.service_name_snapshot} appointment.`,
        priority: 'medium',
        is_actionable: false,
        booking_id: selectedBooking.id,
      }).catch(() => {});
      setShowAddressModal(false);
    } catch {
      /* silent */
    }
    setSendingAddress(false);
  }, [addressText, selectedBooking, sendingAddress, postMessage, providerDbId]);

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

      {addressSettings?.business_type === 'mobile' && (
        <TouchableOpacity
          style={[styles.addressBtn, { backgroundColor: OP.surface, borderColor: OP.border }]}
          onPress={openAddressModal}
          activeOpacity={0.75}
        >
          <Ionicons name="location-outline" size={14} color={OP.accent} />
          <Text style={[styles.addressBtnText, { color: OP.accent }]}>Send my address</Text>
        </TouchableOpacity>
      )}

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

      <Modal visible={showAddressModal} transparent animationType="slide" onRequestClose={closeAddressModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: OP.card }]}>
            <Text style={[styles.modalTitle, { color: OP.text }]}>Send your address</Text>

            {loadingAddressBookings ? (
              <ActivityIndicator color={OP.accent} style={{ marginVertical: 20 }} />
            ) : addressBookings.length === 0 ? (
              <Text style={[styles.modalEmpty, { color: OP.sub }]}>
                No upcoming bookings with {providerName} yet.
              </Text>
            ) : (
              <>
                {addressBookings.length > 1 && (
                  <FlatList
                    data={addressBookings}
                    keyExtractor={b => b.id}
                    style={styles.bookingList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.bookingOption,
                          { borderColor: selectedBooking?.id === item.id ? OP.accent : OP.border },
                        ]}
                        onPress={() => selectAddressBooking(item)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.bookingOptionService, { color: OP.text }]}>
                          {item.service_name_snapshot}
                        </Text>
                        <Text style={[styles.bookingOptionDate, { color: OP.sub }]}>
                          {new Date(item.booking_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • {item.booking_time.slice(0, 5)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}

                <TextInput
                  style={[styles.addressInput, { backgroundColor: OP.surface, color: OP.text, borderColor: OP.border }]}
                  value={addressText}
                  onChangeText={setAddressText}
                  placeholder="Enter the address for this appointment"
                  placeholderTextColor={OP.sub}
                  multiline
                  editable={!!selectedBooking}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: OP.surface }]}
                    onPress={closeAddressModal}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.modalBtnText, { color: OP.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalBtn,
                      { backgroundColor: OP.accent, opacity: (!addressText.trim() || !selectedBooking || sendingAddress) ? 0.5 : 1 },
                    ]}
                    onPress={handleSendAddress}
                    disabled={!addressText.trim() || !selectedBooking || sendingAddress}
                    activeOpacity={0.75}
                  >
                    {sendingAddress ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.modalBtnText, { color: '#fff' }]}>Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  addressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addressBtnText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
    marginBottom: 14,
  },
  modalEmpty: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    marginVertical: 20,
    textAlign: 'center',
  },
  bookingList: { maxHeight: 150, marginBottom: 12 },
  bookingOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bookingOptionService: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
  bookingOptionDate: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: 2 },
  addressInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, fontWeight: '700' },
});
