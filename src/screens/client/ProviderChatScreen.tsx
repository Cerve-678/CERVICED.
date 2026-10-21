import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Modal,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { HomeStackParamList } from "../../navigation/types";
import { useTheme } from "../../contexts/ThemeContext";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../components/IslandPillTabBar";
import { KeyboardDismissView } from "../../components/KeyboardDismissView";
import { ThemedBackground } from "../../components/ThemedBackground";
import { useAuth } from "../../contexts/AuthContext";
import {
  getProviderAddressPolicy,
  getClientBookingsForAddressShare,
  setBookingClientAddress,
  insertProviderNotification,
  getOrCreateConversation,
  markConversationReadByUser,
  getConversationMessages,
  sendProviderMessage,
  updateConversationLastMessage,
  DbProviderMessage,
  ProviderAddressPolicy,
  ClientBookingSummary,
  subscribeToConversationMessages,
} from "../../services/databaseService";
import { formatShortDate, formatTime12 } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import { useTranslation, tr } from "../../i18n";

type Props = NativeStackScreenProps<HomeStackParamList, "ProviderChat">;

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "user" | "provider";
  content: string;
  created_at: string;
  read_at: string | null;
}

export default function ProviderChatScreen({ navigation, route }: Props) {
  const { providerDbId, providerName, promptMode = "conversation" } = route.params;
  const { palette: OP } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Set when the thread genuinely cannot be opened, so the screen says why
  // instead of showing an empty conversation that silently swallows sends.
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const userId = user?.id ?? null;
  const flatListRef = useRef<FlatList>(null);

  // Address-sharing (mobile providers only — client sends the address they want visited)
  const [addressSettings, setAddressSettings] =
    useState<ProviderAddressPolicy | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressBookings, setAddressBookings] = useState<
    ClientBookingSummary[]
  >([]);
  const [loadingAddressBookings, setLoadingAddressBookings] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<ClientBookingSummary | null>(null);
  const [addressText, setAddressText] = useState("");
  const [sendingAddress, setSendingAddress] = useState(false);
  // The floating tab bar auto-hides while the keyboard is up (tabBarHideOnKeyboard),
  // so the input row only needs extra bottom clearance to clear the pill while
  // it's resting (keyboard down) — otherwise that clearance just becomes a dead
  // gap above the keyboard.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvt, () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!providerDbId) return;
    // Policy only — this is a CLIENT screen and only needs business_type to
    // show the mobile address-share affordance.
    getProviderAddressPolicy(providerDbId)
      .then(setAddressSettings)
      .catch((err) => logger.error('[ProviderChat] address policy load failed:', err));
  }, [providerDbId]);

  // Get or create conversation
  useEffect(() => {
    if (!userId || !providerDbId) return;

    async function initConversation() {
      setLoading(true);
      setConversationId(null);
      setConversationError(null);
      setMessages([]);
      try {
        const id = await getOrCreateConversation(providerDbId, userId!);
        setConversationId(id);
      } catch (err) {
        logger.error('[ProviderChat] failed to get/create conversation:', err);
        // The RPC raises self_conversation_not_allowed when a provider opens
        // a thread with their own profile. Never let a raw Postgres message
        // reach the client — name the two cases plainly instead.
        const raw = err instanceof Error ? err.message : String(err);
        setConversationError(
          raw.includes('self_conversation_not_allowed')
            ? tr('clientAccount.chat.selfConversation')
            : tr('clientAccount.chat.openFailed'),
        );
      }
      setLoading(false);
    }

    initConversation();
  }, [userId, providerDbId]);

  // Mark conversation as read by the user on open (mirrors provider side)
  useEffect(() => {
    if (!conversationId) return;
    markConversationReadByUser(conversationId).catch((err) =>
      logger.error('[ProviderChat] mark-read failed:', err),
    );
  }, [conversationId]);

  // Load initial messages
  useEffect(() => {
    if (!conversationId) return;
    getConversationMessages(conversationId)
      .then((data) => {
        setMessages(data as Message[]);
      })
      .catch((err) => logger.error('[ProviderChat] load messages failed:', err));
  }, [conversationId]);

  // Realtime new messages
  useEffect(() => {
    if (!conversationId) return;

    return subscribeToConversationMessages(
      conversationId,
      (row) => {
          const msg = row as Message;
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Reading it live — clear the unread counter the sender just bumped
          if (msg.sender_type === "provider") {
            markConversationReadByUser(conversationId).catch((err) =>
              logger.error('[ProviderChat] mark-read (realtime) failed:', err),
            );
          }
          setTimeout(
            () => flatListRef.current?.scrollToEnd({ animated: true }),
            80,
          );
      },
    );
  }, [conversationId]);

  // Set header
  useEffect(() => {
    navigation.setOptions({
      title: providerName,
      headerShown: true,
      headerBackTitle: t('common.back'),
    });
  }, [navigation, providerName, t]);

  const postMessage = useCallback(
    async (text: string) => {
      if (!text || !conversationId || !userId) return;

      const inserted: DbProviderMessage = await sendProviderMessage({
        conversationId,
        senderId: userId,
        senderType: "user",
        content: text,
      });

      setMessages((prev) => {
        if (prev.find((m) => m.id === inserted.id)) return prev;
        return [...prev, inserted as Message];
      });
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        80,
      );

      await updateConversationLastMessage({
        conversationId,
        message: text,
        senderType: "user",
      });
    },
    [conversationId, userId],
  );

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !userId || sending) return;

    setSending(true);
    setInputText("");
    Keyboard.dismiss();

    try {
      await postMessage(text);
    } catch (err) {
      logger.error('[ProviderChat] send message failed:', err);
      // Message never reached the provider — put the text back so it isn't lost
      setInputText(text);
      Alert.alert(t('clientAccount.chat.messageNotSent'), t('clientAccount.chat.checkConnection'));
    }
    setSending(false);
  }, [inputText, conversationId, userId, sending, postMessage]);

  // Prompts go into the composer rather than sending immediately, so the
  // client can review or edit every message. Get In Touch opens with booking
  // queries; an existing conversation opens with the everyday messages a
  // client actually needs around an appointment. Address details never appear
  // in a template; they use the booking-scoped address flow instead.
  const isMobileProvider = addressSettings?.business_type === "mobile";

  const enquiryPrompts = [
    {
      label: t('clientAccount.chat.prompt.serviceQuestion'),
      text: t('clientAccount.chat.promptText.serviceQuestion', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.pricePackages'),
      text: t('clientAccount.chat.promptText.pricePackages', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.availability'),
      text: t('clientAccount.chat.promptText.availability', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.beforeBook'),
      text: t('clientAccount.chat.promptText.beforeBook', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.patchTest'),
      text: t('clientAccount.chat.promptText.patchTest', { name: providerName }),
    },
    {
      label: isMobileProvider ? t('clientAccount.chat.prompt.travelArea') : t('clientAccount.chat.prompt.locationAccess'),
      text: isMobileProvider
        ? t('clientAccount.chat.promptText.travelArea', { name: providerName })
        : t('clientAccount.chat.promptText.locationAccess', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.suitable'),
      text: t('clientAccount.chat.promptText.suitable', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.general'),
      text: t('clientAccount.chat.promptText.general', { name: providerName }),
    },
  ];

  const conversationPrompts = [
    {
      label: t('clientAccount.chat.prompt.hello'),
      text: t('clientAccount.chat.promptText.hello', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.bookingDetails'),
      text: t('clientAccount.chat.promptText.bookingDetails', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.reschedule'),
      text: t('clientAccount.chat.promptText.reschedule', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.runningLate'),
      text: t('clientAccount.chat.promptText.runningLate', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.arrived'),
      text: t('clientAccount.chat.promptText.arrived', { name: providerName }),
    },
    {
      label: isMobileProvider ? t('clientAccount.chat.prompt.addressAccess') : t('clientAccount.chat.prompt.locationAccess'),
      text: isMobileProvider
        ? t('clientAccount.chat.promptText.addressAccess', { name: providerName })
        : t('clientAccount.chat.promptText.locationAccessBooking', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.payment'),
      text: t('clientAccount.chat.promptText.payment', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.cancelBooking'),
      text: t('clientAccount.chat.promptText.cancelBooking', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.aftercare'),
      text: t('clientAccount.chat.promptText.aftercare', { name: providerName }),
    },
    {
      label: t('clientAccount.chat.prompt.thankYou'),
      text: t('clientAccount.chat.promptText.thankYou', { name: providerName }),
    },
  ];

  const quickPrompts = promptMode === "enquiry" ? enquiryPrompts : conversationPrompts;

  // A navigator can reuse this component for another provider. Never render a
  // stale thread while the next conversation is being resolved.
  const visibleMessages = messages.filter(
    (message) => message.conversation_id === conversationId,
  );

  const openAddressModal = useCallback(async () => {
    if (!providerDbId) return;
    setShowAddressModal(true);
    setLoadingAddressBookings(true);
    setSelectedBooking(null);
    setAddressText("");
    try {
      const bookings = await getClientBookingsForAddressShare(providerDbId);
      setAddressBookings(bookings);
      const [only] = bookings;
      if (bookings.length === 1 && only) {
        setSelectedBooking(only);
        setAddressText(only.client_address ?? "");
      }
    } catch (err) {
      logger.error('[ProviderChat] address bookings load failed:', err);
    } finally {
      setLoadingAddressBookings(false);
    }
  }, [providerDbId]);

  const closeAddressModal = useCallback(() => {
    setShowAddressModal(false);
  }, []);

  const selectAddressBooking = useCallback((b: ClientBookingSummary) => {
    setSelectedBooking(b);
    setAddressText(b.client_address ?? "");
  }, []);

  const handleSendAddress = useCallback(async () => {
    const address = addressText.trim();
    if (!address || !selectedBooking || sendingAddress) return;

    setSendingAddress(true);
    try {
      await setBookingClientAddress(selectedBooking.id, address);
      await postMessage(
        `📍 Sent my address for ${selectedBooking.service_name_snapshot}: ${address}`,
      );
      insertProviderNotification({
        provider_id: providerDbId,
        type: "new_message",
        title: "Address received",
        message: `A client sent their address for their ${selectedBooking.service_name_snapshot} appointment.`,
        priority: "medium",
        is_actionable: false,
        booking_id: selectedBooking.id,
      }).catch((err) => logger.error('[ProviderChat] address notification failed:', err));
      setShowAddressModal(false);
    } catch (err) {
      logger.error('[ProviderChat] send address failed:', err);
      Alert.alert(t('clientAccount.chat.addressNotSent'), t('clientAccount.chat.checkConnection'));
    }
    setSendingAddress(false);
  }, [addressText, selectedBooking, sendingAddress, postMessage, providerDbId]);

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isUser = item.sender_type === "user";
      const prev = messages[index - 1];
      const showTime =
        !prev ||
        new Date(item.created_at).getTime() -
          new Date(prev.created_at).getTime() >
          5 * 60 * 1000;

      return (
        <View>
          {showTime && (
            <Text style={[styles.timeStamp, { color: OP.sub }]}>
              {formatShortDate(item.created_at)},{" "}
              {formatTime12(new Date(item.created_at))}
            </Text>
          )}
          <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
            <View
              style={[
                styles.bubble,
                isUser
                  ? [styles.bubbleUser, { backgroundColor: OP.accent }]
                  : [
                      styles.bubbleProvider,
                      { backgroundColor: OP.surface, borderColor: OP.border },
                    ],
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  { color: isUser ? OP.onAccent : OP.text },
                ]}
              >
                {item.content}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [messages, OP],
  );

  if (loading) {
    return (
      <ThemedBackground style={styles.center}>
        <ActivityIndicator color={OP.accent} />
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={{ flex: 1 }}>
      {/* This view starts below the native stack header, so it already knows
          its screen position. Adding the header height as an extra keyboard
          offset would lift the composer by that amount a second time. */}
      <KeyboardDismissView style={{ flex: 1 }}>
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ref={flatListRef}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.listContent,
            visibleMessages.length === 0 && { flex: 1 },
          ]}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: OP.accentText }]}>
                {providerName}
              </Text>
              <Text style={[styles.emptyBody, { color: OP.sub }]}>
                {conversationError ?? t('clientAccount.chat.emptyHint')}
              </Text>
            </View>
          }
        />

        {addressSettings?.business_type === "mobile" && (
          <TouchableOpacity
            style={[
              styles.addressBtn,
              { backgroundColor: OP.surface, borderColor: OP.border },
            ]}
            onPress={openAddressModal}
            activeOpacity={0.75}
          >
            <Ionicons name="location-outline" size={14} color={OP.accentText} />
            <Text style={[styles.addressBtnText, { color: OP.accentText }]}>
              {t('clientAccount.chat.sendMyAddress')}
            </Text>
          </TouchableOpacity>
        )}

        <View
          style={[
            styles.quickPromptRow,
            { borderTopColor: OP.border, backgroundColor: OP.bg },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptScrollContent}
          >
            {quickPrompts.map((prompt) => (
              <TouchableOpacity
                key={prompt.label}
                style={[
                  styles.quickPrompt,
                  { backgroundColor: OP.surface, borderColor: OP.border },
                ]}
                onPress={() => setInputText(prompt.text)}
                activeOpacity={0.75}
              >
                <Text style={[styles.quickPromptText, { color: OP.accentText }]}>
                  {prompt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input bar */}
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: OP.bg,
              borderTopColor: OP.border,
              paddingBottom: keyboardVisible
                ? 12
                : FLOATING_TAB_BAR_CLEARANCE,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: OP.surface,
                color: OP.text,
                borderColor: OP.border,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('clientAccount.chat.messagePlaceholder')}
            placeholderTextColor={OP.sub}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor: OP.accent,
                opacity: !inputText.trim() || sending ? 0.4 : 1,
              },
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.75}
          >
            {sending ? (
              <ActivityIndicator size="small" color={OP.onAccent} />
            ) : (
              <Text style={[styles.sendIcon, { color: OP.onAccent }]}>↑</Text>
            )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={showAddressModal}
          transparent statusBarTranslucent navigationBarTranslucent
          animationType="fade"
          onRequestClose={closeAddressModal}
        >
          <KeyboardDismissView style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: OP.card }]}>
              <Text style={[styles.modalTitle, { color: OP.text }]}>
                {t('clientAccount.chat.sendYourAddress')}
              </Text>

              {loadingAddressBookings ? (
                <ActivityIndicator
                  color={OP.accent}
                  style={{ marginVertical: 20 }}
                />
              ) : addressBookings.length === 0 ? (
                <Text style={[styles.modalEmpty, { color: OP.sub }]}>
                  {t('clientAccount.chat.noUpcoming', { name: providerName })}
                </Text>
              ) : (
                <>
                  {addressBookings.length > 1 && (
                    <FlatList
                      data={addressBookings}
                      keyExtractor={(b) => b.id}
                      style={styles.bookingList}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.bookingOption,
                            {
                              borderColor:
                                selectedBooking?.id === item.id
                                  ? OP.accent
                                  : OP.border,
                            },
                          ]}
                          onPress={() => selectAddressBooking(item)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.bookingOptionService,
                              { color: OP.text },
                            ]}
                          >
                            {item.service_name_snapshot}
                          </Text>
                          <Text
                            style={[
                              styles.bookingOptionDate,
                              { color: OP.sub },
                            ]}
                          >
                            {formatShortDate(item.booking_date)} •{" "}
                            {formatTime12(item.booking_time)}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  )}

                  <TextInput
                    style={[
                      styles.addressInput,
                      {
                        backgroundColor: OP.surface,
                        color: OP.text,
                        borderColor: OP.border,
                      },
                    ]}
                    value={addressText}
                    onChangeText={setAddressText}
                    placeholder={t('clientAccount.chat.addressPlaceholder')}
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
                      <Text style={[styles.modalBtnText, { color: OP.text }]}>
                        {t('common.cancel')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalBtn,
                        {
                          backgroundColor: OP.accent,
                          opacity:
                            !addressText.trim() ||
                            !selectedBooking ||
                            sendingAddress
                              ? 0.5
                              : 1,
                        },
                      ]}
                      onPress={handleSendAddress}
                      disabled={
                        !addressText.trim() ||
                        !selectedBooking ||
                        sendingAddress
                      }
                      activeOpacity={0.75}
                    >
                      {sendingAddress ? (
                        <ActivityIndicator size="small" color={OP.onAccent} />
                      ) : (
                        <Text
                          style={[styles.modalBtnText, { color: OP.onAccent }]}
                        >
                          {t('common.send')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </KeyboardDismissView>
        </Modal>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 8 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 20,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    textAlign: "center",
    opacity: 0.7,
  },
  timeStamp: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 10,
    textAlign: "center",
    marginVertical: 10,
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", marginBottom: 6 },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "76%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleProvider: {
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
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
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { color: "#fff", fontSize: 20, fontWeight: "700" },
  addressBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addressBtnText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    fontWeight: "600",
  },
  quickPromptRow: {
    paddingTop: 16,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickPromptScrollContent: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
  },
  quickPrompt: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  quickPromptText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 17,
    marginBottom: 14,
  },
  modalEmpty: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    marginVertical: 20,
    textAlign: "center",
  },
  bookingList: { maxHeight: 150, marginBottom: 12 },
  bookingOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bookingOptionService: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    fontWeight: "600",
  },
  bookingOptionDate: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    marginTop: 2,
  },
  addressInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    fontWeight: "700",
  },
});
