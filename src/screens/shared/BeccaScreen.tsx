import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
  TouchableOpacity,
  Image,
  StatusBar,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { KeyboardDismissView } from "../../components/KeyboardDismissView";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../components/IslandPillTabBar";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { BeccaScreenProps } from "../../navigation/types";
import type {
  ChatMessage,
  ChatSuggestion,
  ConversationContext,
} from "../../services/becca/types";
import { converse as beccaConverse } from "../../services/becca/engine";
import beccaStorageService, {
  StoredSession,
  type BeccaHat,
} from "../../services/beccaStorageService";
import {
  Mark,
  AmbientMark,
  ChatBubble,
  Suggestions,
  ProviderRecommendations,
  ChatInput,
  ThinkingIndicator,
  stripRichText,
} from "../../components/ChatComponents";
import { Provider } from "../../services/ProviderDataService";
import { formatTime12, DAY_NAMES_FULL, ordinalSuffix } from "../../utils/dateUtils";
import { useTheme } from "../../contexts/ThemeContext";
import { useBooking } from "../../contexts/BookingContext";
import { useAuth } from "../../contexts/AuthContext";
import { ThemedBackground } from "../../components/ThemedBackground";
import { useAppDialog } from "../../components/AppDialog";

// Accent is mode-specific in the real app (src/constants/theme.ts): chocolate
// brown in light mode, dusty rose only in dark mode — not the same value in
// both, despite DESIGN_SYSTEM.md's doc previously showing one accent for
// both modes (now corrected there too).
const L = {
  bg: "#F5F1EC", surface: "#EDE8E2", card: "#FFFFFF",
  accent: "#5C4033", text: "#000000",
  sub: "#7E6667", border: "rgba(126,102,103,0.14)",
  sep: "rgba(126,102,103,0.08)", iconBg: "rgba(92,64,51,0.12)",
};
const D = {
  bg: "#1A1815", surface: "#201D1A", card: "#252220",
  accent: "#AF9197", text: "#F0ECE7",
  sub: "#7E6667", border: "rgba(126,102,103,0.18)",
  sep: "rgba(126,102,103,0.10)", iconBg: "rgba(175,145,151,0.10)",
};

// "Wednesday 5th" — compact day+date for the hero screen's top-right label.
// No such formatter exists in dateUtils.ts (formatLongDate also includes
// month/year, too long for this spot), so it's composed here from the
// primitives dateUtils.ts already exports rather than duplicating a new
// full formatter for one call site.
function formatHeroDate(date: Date): string {
  return `${DAY_NAMES_FULL[date.getDay()]} ${ordinalSuffix(date.getDate())}`;
}

// ==================== MAIN SCREEN ====================

export default function BeccaScreen({
  navigation,
}: BeccaScreenProps<"BeccaMain">) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  const { bookings } = useBooking();
  const { user, activeMode } = useAuth();
  const isProviderMode = activeMode === "provider";
  // The single source of truth for which Becca this is — drives the engine,
  // the persisted session's `hat`, and the screen's identity treatment.
  const beccaHat: BeccaHat = isProviderMode ? "provider" : "client";
  // In-app themed dialogs/toasts instead of the OS Alert. DialogHost must be
  // rendered (see bottom of the tree) for these to appear.
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // Attached to an `Animated.ScrollView` (see the hero⇄chat transition), which
  // forwards its ref to the underlying ScrollView — so `scrollToEnd` below
  // still resolves and the `ScrollView` type annotation stays accurate.
  const scrollViewRef = useRef<ScrollView>(null);

  // Floating tab-bar clearance below ChatInput — rendered as its own sibling
  // spacer AFTER ChatInput (both still inside KeyboardDismissView, so it
  // rides up with the keyboard exactly like the input does) rather than as
  // padding baked into ChatInput itself. That used to double-count: the
  // KeyboardAvoidingView already pushes the whole wrapped area up by the
  // exact keyboard height, so any additional keyboard-reactive padding
  // inside ChatInput was pure extra dead space stacked on top of that shift
  // — this is what made the input visibly float far above the keyboard.
  // Collapses to 0 when the keyboard is open (nothing below the input needs
  // clearing then); restores when closed so the floating tab bar doesn't
  // overlap the input.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // The hero's natural (keyboard-closed) height, measured once on layout.
  // KeyboardAvoidingView's `padding` behavior shrinks this whole wrapped area
  // when the keyboard opens; because heroScroll is flexGrow:1, that shrink
  // redistributes the hero's content upward and the greeting ends up tucked
  // directly under the mark. Pinning the content container to its original
  // height while the keyboard is up means the layout keeps its shape and
  // simply scrolls instead of reflowing.
  const [heroNaturalHeight, setHeroNaturalHeight] = useState<number | null>(null);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Chat history — native partial-height sheet (not a full-screen modal).
  // BottomSheet stays mounted at all times (index -1 = closed) rather than
  // conditionally rendered, since @gorhom/bottom-sheet's open/close is a
  // driven animation on an always-present component, not a visible prop.
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historySheetRef = useRef<BottomSheet>(null);
  // Conversation context carried between turns — reset on new chat and when
  // loading a past chat, since neither continues the current thread.
  const conversationRef = useRef<ConversationContext | undefined>(undefined);

  // "50%" — NOT "%50". The percent sign trails the number; @gorhom/bottom-sheet
  // silently fails to parse the reversed form, which is what made this sheet
  // behave like a full-height modal instead of snapping to half the screen.
  const historySnapPoints = useMemo(() => ["55%", "85%"], []);
  // Backdrop is only ever needed once the sheet has actually been opened —
  // rendering it from first mount made @gorhom/bottom-sheet run its internal
  // appear/disappear setup immediately on screen entrance, which showed up
  // as a brief full-screen dim flash right as Becca mounted.
  const [historySheetEverOpened, setHistorySheetEverOpened] = useState(false);

  // Live clock for the hero's date/time row. Rendering `new Date()` inline
  // freezes it at whatever the last render happened to be, so the time slowly
  // goes stale while the user sits on the hero. Ticking to the top of each
  // minute (rather than every 60s from mount) keeps it aligned with the real
  // clock — a fixed interval drifts and can show a minute that's already gone.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNextTick = () => {
      const current = new Date();
      // ms remaining until the next minute boundary.
      const msToNextMinute =
        (60 - current.getSeconds()) * 1000 - current.getMilliseconds();
      timeoutId = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, msToNextMinute);
    };
    scheduleNextTick();
    return () => clearTimeout(timeoutId);
  }, []);

  // Fully unmount the backdrop once the sheet is closed. Leaving it mounted
  // is what strands a dim layer over the screen: if the sheet's close is
  // interrupted (drag-to-dismiss released mid-flight, or close() racing the
  // backdrop's own fade), the backdrop can settle at a non-zero opacity with
  // nothing left to drive it back down. Gating on index < 0 guarantees the
  // dim is gone rather than merely animated toward transparent.
  const handleHistorySheetChange = useCallback((index: number) => {
    if (index < 0) setHistorySheetEverOpened(false);
  }, []);

  const buildWelcomeMessage = useCallback((): ChatMessage => {
    const base = {
      id: `welcome-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: "assistant" as const,
      timestamp: new Date(),
    };

    // Provider hat → business assistant. Suggestions route to provider screens
    // only (semantic `screen` keys resolved in handleSuggestionPress).
    if (isProviderMode) {
      return {
        ...base,
        content:
          "Hi! I'm Becca, your business assistant.\n\nI can help you manage your bookings, clients, schedule, promotions, analytics and services. What do you need?",
        suggestions: [
          {
            id: "today",
            text: "Today's Bookings",
            action: "navigate",
            data: { screen: "home" },
          },
          {
            id: "clients",
            text: "My Clients",
            action: "navigate",
            data: { screen: "clients" },
          },
          {
            id: "messages",
            text: "Messages",
            action: "navigate",
            data: { screen: "messages" },
          },
          {
            id: "analytics",
            text: "Analytics",
            action: "navigate",
            data: { screen: "analytics" },
          },
        ],
      };
    }

    const upcomingCount = bookings.filter(
      (b) => b.status === "upcoming",
    ).length;
    let welcomeText = "Hi! I'm Becca, your beauty booking assistant!\n\n";
    if (upcomingCount > 0) {
      welcomeText += `You have ${upcomingCount} upcoming appointment${upcomingCount > 1 ? "s" : ""}. `;
    }
    welcomeText +=
      "I can help you find and book amazing beauty services. What are you looking for today?";

    return {
      ...base,
      content: welcomeText,
      suggestions: [
        {
          id: "my-bookings",
          text: "My Bookings",
          action: "navigate",
          data: { screen: "Bookings" },
        },
        {
          id: "find-near-me",
          text: "Find Services Near Me",
          action: "message",
          data: { message: "Find beauty services near me" },
        },
        {
          id: "browse",
          text: "Browse All Services",
          action: "message",
          data: { message: "Show me all services" },
        },
      ],
    };
  }, [bookings, isProviderMode]);

  // Initialize. The engine is stateless — hat and bookings are passed per
  // call rather than held on a singleton, so there's no cross-mode state to
  // pin before replying and no stale booking list to invalidate.
  useEffect(() => {
    setMessages([buildWelcomeMessage()]);
  }, [buildWelcomeMessage]);

  // Load sessions from Supabase on mount, and again whenever the hat changes.
  // History is per-hat: a provider must never see their client-side chats in
  // their business history, so switching hats swaps the whole list.
  useEffect(() => {
    if (!user?.id) return;
    setHistoryLoading(true);
    beccaStorageService
      .loadSessions(user.id, beccaHat)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [user?.id, beccaHat]);

  // Scroll to bottom
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Save current chat title/preview into sessions list (for UI update)
  const refreshSessions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const updated = await beccaStorageService.loadSessions(user.id, beccaHat);
      setSessions(updated);
    } catch (_) {}
  }, [user?.id, beccaHat]);

  const handleImagePick = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showAlert(
          "Permission Required",
          "Please allow access to your photo library in Settings.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error: any) {
      showAlert("Error", "Couldn't open photo library. Please try again.");
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || inputText.trim();
    const imageToSend = selectedImage;
    if (!textToSend && !imageToSend) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend || "Sent an image",
      timestamp: new Date(),
    };
    if (imageToSend) userMessage.imageUri = imageToSend;

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setSelectedImage(null);
    setIsTyping(true);

    // Create session on first user message
    let sessionId = currentSessionId;
    if (!sessionId && user?.id) {
      try {
        const title =
          userMessage.content.length > 40
            ? userMessage.content.substring(0, 40) + "..."
            : userMessage.content;
        sessionId = await beccaStorageService.createSession(
          user.id,
          title,
          userMessage.content.substring(0, 80),
          beccaHat,
        );
        setCurrentSessionId(sessionId);
        // Save welcome message too
        const welcome = messages[0];
        if (welcome) await beccaStorageService.saveMessage(sessionId, welcome);
      } catch (_) {}
    }

    // Save user message
    if (sessionId) {
      beccaStorageService.saveMessage(sessionId, userMessage).catch(() => {});
    }

    setTimeout(async () => {
      const { message: response, context } = await beccaConverse({
        message: textToSend || "What can you tell me about this?",
        hat: isProviderMode ? "provider" : "client",
        bookings,
        ...(user?.id ? { userId: user.id } : {}),
        // What the last turn established. Without this every follow-up
        // ("what about Saturday?", "the first one") arrives with no idea
        // what came before and matches nothing.
        ...(conversationRef.current ? { conversation: conversationRef.current } : {}),
      });
      // A ref, not state: the next turn reads it inside this same async
      // callback, and a state update wouldn't have landed by then.
      conversationRef.current = context;
      setMessages((prev) => [...prev, response]);
      setIsTyping(false);

      // Save assistant response
      if (sessionId) {
        beccaStorageService.saveMessage(sessionId, response).catch(() => {});
        // Update session preview with last assistant message. Markers are
        // stripped BEFORE truncating, so the 80-char budget counts real text
        // rather than markup — and a preview can never be cut mid-`**`,
        // which would leave a stray asterisk on screen.
        const previewText = stripRichText(response.content);
        const preview =
          previewText.length > 80
            ? previewText.substring(0, 80) + "..."
            : previewText;
        const title =
          messages.find((m) => m.role === "user")?.content ??
          userMessage.content;
        const shortTitle =
          title.length > 40 ? title.substring(0, 40) + "..." : title;
        beccaStorageService
          .updateSession(sessionId, shortTitle, preview)
          .catch(() => {});
        refreshSessions();
      }
    }, 800);
  };

  const handleNewChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // In-app themed dialog, not the OS Alert — a system popup breaks the
    // screen's visual language and can't be styled to match Becca.
    showConfirm("New Chat", "Start a new conversation?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "New Chat",
        onPress: () => {
          setCurrentSessionId(null);
          setMessages([buildWelcomeMessage()]);
          setInputText("");
          setSelectedImage(null);
          conversationRef.current = undefined;
        },
      },
    ]);
  };

  const handleLoadChat = async (session: StoredSession) => {
    historySheetRef.current?.close();
    try {
      const msgs = await beccaStorageService.loadMessages(session.id);
      setMessages(msgs.length > 0 ? msgs : [buildWelcomeMessage()]);
      setCurrentSessionId(session.id);
      // A loaded chat is not a continuation of the current thread.
      conversationRef.current = undefined;
    } catch (_) {
      showAlert("Error", "Could not load chat.");
    }
  };

  const handleDeleteChat = async (sessionId: string) => {
    try {
      await beccaStorageService.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([buildWelcomeMessage()]);
        conversationRef.current = undefined;
      }
    } catch (_) {
      // Say so rather than leaving the row on screen with no explanation —
      // a silent failure here reads as an unresponsive button.
      showAlert("Couldn't delete", "That chat couldn't be deleted. Please try again.");
    }
  };

  // Clear-all is destructive and irreversible, so it always confirms first and
  // names exactly which history is going — clearing business chats must never
  // read as though it might also wipe the user's beauty chats.
  const handleClearHistory = () => {
    if (!user?.id || sessions.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const scope = isProviderMode ? "business" : "beauty";
    showConfirm(
      "Clear chat history?",
      `This permanently deletes all ${sessions.length} of your ${scope} chats with Becca. ` +
        `Your ${isProviderMode ? "beauty" : "business"} chats aren't affected. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              await beccaStorageService.clearSessions(user.id, beccaHat);
              setSessions([]);
              setCurrentSessionId(null);
              setMessages([buildWelcomeMessage()]);
              conversationRef.current = undefined;
              historySheetRef.current?.close();
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
            } catch (_) {
              showAlert(
                "Couldn't clear history",
                "Your chats couldn't be deleted. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  // Client-hat navigation targets Becca is allowed to reach. Every entry is a
  // screen registered on BeccaStackParamList, so navigation can't be pointed
  // at something the stack doesn't own.
  const CLIENT_NAV_SCREENS = useMemo(
    () =>
      new Set([
        "Bookings",
        "BookingDetail",
        "Reschedule",
        "ProviderProfile",
        "ProviderChat",
        "ClientIntakeForm",
        "Notifications",
      ]),
    [],
  );

  // Provider Becca routes to sibling PROVIDER tabs only, so the assistant can
  // action business concerns while staying fully isolated from client screens.
  // Keys here match the semantic `screen` values emitted by the AI service.
  const PROVIDER_NAV: Record<string, { tab: string; screen: string }> = {
    home: { tab: "ProviderHome", screen: "ProviderHomeMain" },
    schedule: { tab: "ProviderHome", screen: "ProviderSchedule" },
    clients: { tab: "ProviderHome", screen: "Clientele" },
    messages: { tab: "ProviderHome", screen: "ProviderInbox" },
    promotions: { tab: "ProviderHome", screen: "Promotions" },
    infopacks: { tab: "ProviderHome", screen: "InfoPacks" },
    analytics: { tab: "Profile", screen: "Analytics" },
    history: { tab: "Profile", screen: "BookingHistory" },
    automations: { tab: "Profile", screen: "Automations" },
    services: { tab: "MyServices", screen: "ProviderServicesMain" },
  };

  const handleSuggestionPress = (suggestion: ChatSuggestion) => {
    const data = suggestion.data;
    if (!data) return;

    if (suggestion.action === "message") {
      // `message` is only present on the message-shaped payload; a navigate
      // chip that reached here would have no message to send.
      if (data.message) handleSend(data.message);
      return;
    }
    if (suggestion.action !== "navigate" || !data.screen) return;

    // Navigate chips used to fire silently — the user tapped "Today's
    // Bookings", the app jumped screens, and nothing was ever added to the
    // thread. Coming back to Becca then showed no trace of what was asked.
    // Record the tap as a user turn (with Becca acknowledging) so the
    // conversation stays a faithful history of the interaction, exactly as
    // it already does for `message` chips via handleSend.
    const navUserMessage: ChatMessage = {
      id: `${Date.now()}-nav`,
      role: "user",
      content: suggestion.text,
      timestamp: new Date(),
    };
    const navReply: ChatMessage = {
      id: `${Date.now()}-nav-reply`,
      role: "assistant",
      content: `Opening ${suggestion.text} for you now.`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, navUserMessage, navReply]);
    if (currentSessionId) {
      beccaStorageService.saveMessage(currentSessionId, navUserMessage).catch(() => {});
      beccaStorageService.saveMessage(currentSessionId, navReply).catch(() => {});
    }

    const { screen, params } = data;

    if (isProviderMode) {
      // Provider hat → jump to the matching provider tab/screen. Client-side
      // targets simply have no mapping here, so they can never fire.
      const target = PROVIDER_NAV[screen];
      if (target) {
        (navigation.getParent() as any)?.navigate(target.tab, {
          screen: target.screen,
          ...(params ? { params } : {}),
        });
      }
      return;
    }

    // Client hat. Explicit allowlist rather than a pass-through: a capability
    // can only ever reach a screen named here, so a bad `screen` value is
    // inert instead of navigating somewhere unintended.
    if (screen === "Explore") {
      navigation.getParent()?.navigate("Explore", { screen: "ExploreMain" });
      return;
    }
    if (CLIENT_NAV_SCREENS.has(screen)) {
      // Params are forwarded so deep links land on the actual record —
      // "reschedule my nail booking" opens Reschedule with that booking
      // preloaded rather than a bare screen the user has to navigate again.
      (navigation as any).navigate(screen, params);
    }
  };

  const handleProviderPress = (provider: Provider) => {
    if (isProviderMode) return;
    navigation.navigate("ProviderProfile", {
      providerId: provider.id,
      source: "becca",
    });
  };

  const lastMessage = messages[messages.length - 1];
  const showSuggestions =
    lastMessage?.role === "assistant" && lastMessage?.suggestions;
  const showRecommendations =
    lastMessage?.role === "assistant" && lastMessage?.providerRecommendations;

  const upcomingCount = !isProviderMode
    ? bookings.filter((b) => b.status === "upcoming").length
    : 0;

  // The hero screen only makes sense before any real exchange has happened —
  // once the user has sent something, it's a full-screen greeting sitting
  // above an active conversation, which is exactly the state this design
  // scopes it out of.
  const showHero = messages.length <= 1 && !isTyping;

  // ==================== HERO ⇄ CHAT TRANSITION ====================
  // The two states are still a hard mount/unmount swap — they have different
  // layouts and rendering both at once would double the ScrollViews. What's
  // animated is each side's ENTRANCE, keyed off `showHero`, so the change
  // reads as Becca settling into conversation instead of a hard cut.
  //
  // Deliberately asymmetric, because the two directions mean different
  // things: entering the chat rises from below (moving forward into the
  // conversation), while returning to the hero settles down from above
  // (coming back to rest). Same duration both ways so neither feels laggier.
  const transition = useRef(new Animated.Value(showHero ? 0 : 1)).current;
  const enter = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // `enter` restarts from 0 on every switch so the incoming side always
    // animates in, rather than only on first mount.
    enter.setValue(0);
    Animated.parallel([
      Animated.timing(transition, {
        toValue: showHero ? 0 : 1,
        duration: 340,
        easing: Easing.bezier(0.22, 1, 0.36, 1), // gentle overshoot-free settle
        useNativeDriver: true,
      }),
      Animated.timing(enter, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [showHero, transition, enter]);

  const heroAnimStyle = useMemo(
    () => ({
      opacity: enter,
      transform: [
        {
          translateY: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [-10, 0], // settles down into rest
          }),
        },
        {
          scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }),
        },
      ],
    }),
    [enter],
  );

  const chatAnimStyle = useMemo(
    () => ({
      opacity: enter,
      transform: [
        {
          translateY: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [14, 0], // rises forward into the conversation
          }),
        },
      ],
    }),
    [enter],
  );

  return (
    <ThemedBackground style={styles.background}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardDismissView style={styles.keyboardView}>
          {showHero ? (
            /* ==================== HERO SCREEN ==================== */
            <Animated.ScrollView
              style={[styles.heroScrollContainer, heroAnimStyle]}
              contentContainerStyle={[
                styles.heroScroll,
                // Only measured once, while the keyboard is closed — that's the
                // natural height we want to preserve. Once pinned, the keyboard
                // shrinking the container scrolls this content rather than
                // squeezing it, so the greeting stays put relative to the mark.
                keyboardVisible && heroNaturalHeight
                  ? { minHeight: heroNaturalHeight, flexGrow: 0 }
                  : null,
              ]}
              onLayout={(e) => {
                if (!keyboardVisible && heroNaturalHeight === null) {
                  setHeroNaturalHeight(e.nativeEvent.layout.height);
                }
              }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.heroDateTimeRow}>
                <Text style={[styles.heroDateTime, { color: P.sub }]}>
                  <Text style={{ color: P.text }}>{formatHeroDate(now)}</Text>
                  {"  ·  "}
                  {formatTime12(now)}
                </Text>
              </View>

              <View style={styles.heroMarkWrap}>
                <AmbientMark size={80} />
              </View>

              <View style={styles.heroSpacer} />

              <View style={styles.heroBody}>
                {/* Hat badge, not a bare label: the two Beccas answer from
                    different data and have separate histories, so which one
                    you're talking to has to be unmistakable at a glance. */}
                <View
                  style={[
                    styles.hatBadge,
                    { borderColor: P.accent, backgroundColor: P.iconBg },
                  ]}
                >
                  <Ionicons
                    name={isProviderMode ? "briefcase" : "sparkles"}
                    size={11}
                    color={P.accent}
                  />
                  <Text style={[styles.hatBadgeText, { color: P.accent }]}>
                    {isProviderMode ? "BUSINESS ASSISTANT" : "BEAUTY ASSISTANT"}
                  </Text>
                </View>
                <Text style={[styles.heroGreeting, { color: P.text }]}>
                  Hi, I'm{"\n"}
                  <Text style={{ color: P.accent }}>Becca</Text>.
                </Text>
                <Text style={[styles.heroQuestion, { color: P.sub }]}>
                  How can I help?
                </Text>
                {!isProviderMode && upcomingCount > 0 && (
                  <View style={styles.heroStatusLine}>
                    <View style={styles.liveDot} />
                    <Text style={[styles.heroStatusText, { color: P.sub }]}>
                      {upcomingCount} upcoming appointment{upcomingCount > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}

                {lastMessage?.suggestions && (
                  <View style={styles.heroActionsWrap}>
                    <Suggestions
                      suggestions={lastMessage.suggestions}
                      onSuggestionPress={handleSuggestionPress}
                      indented={false}
                    />
                  </View>
                )}
              </View>
            </Animated.ScrollView>
          ) : (
            <>
              {/* ==================== HEADER (fixed card layer, mark is plain/static) ==================== */}
              <Animated.View style={[styles.header, chatAnimStyle, { backgroundColor: P.surface, borderBottomColor: P.border }]}>
                <View style={styles.headerId}>
                  <Mark size={32} />
                  <View>
                    <Text style={[styles.headerName, { color: P.text }]}>Becca</Text>
                    <View style={styles.headerStatusRow}>
                      <Ionicons
                        name={isProviderMode ? "briefcase" : "sparkles"}
                        size={10}
                        color={P.accent}
                      />
                      <Text style={[styles.headerStatus, { color: P.sub }]}>
                        {isProviderMode ? "Business Assistant" : "Beauty Assistant"}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.headerButtons}>
                  <TouchableOpacity
                    style={[styles.headerBtn, { backgroundColor: P.iconBg, borderColor: P.border }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setHistorySheetEverOpened(true);
                      // snapToIndex(0), not expand() — expand() jumps to the
                      // LARGEST snap point (85%), which is the full-screen
                      // feel we don't want. Open at 55%; the user can drag up.
                      historySheetRef.current?.snapToIndex(0);
                    }}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="time-outline" size={17} color={P.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.headerBtn, { backgroundColor: P.iconBg, borderColor: P.border }]}
                    onPress={handleNewChat}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="add" size={18} color={P.accent} />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              {/* ==================== CHAT THREAD ==================== */}
              <Animated.ScrollView
                ref={scrollViewRef}
                style={[styles.scrollContainer, chatAnimStyle]}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
              >
                <View style={styles.daySep}>
                  <Text style={[styles.daySepText, { color: P.sub, backgroundColor: P.surface }]}>TODAY</Text>
                </View>

                {messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}

                {isTyping && <ThinkingIndicator />}

                {showSuggestions && (
                  <Suggestions
                    suggestions={lastMessage.suggestions!}
                    onSuggestionPress={handleSuggestionPress}
                    indented
                  />
                )}

                {showRecommendations && (
                  <ProviderRecommendations
                    providers={lastMessage.providerRecommendations!}
                    onProviderPress={handleProviderPress}
                  />
                )}
              </Animated.ScrollView>
            </>
          )}

          {/* ==================== IMAGE PREVIEW ==================== */}
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <View style={[styles.imagePreviewCard, { backgroundColor: P.card, borderColor: P.border }]}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                  fadeDuration={0}
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setSelectedImage(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ==================== INPUT (fixed card layer) ==================== */}
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={() => handleSend()}
            onImagePick={handleImagePick}
            placeholder="Ask me anything..."
            hasImage={!!selectedImage}
          />

          {/* Floating tab-bar clearance — collapses when the keyboard is
              open (see keyboardVisible above) instead of living as padding
              inside ChatInput, which double-counted the KeyboardAvoidingView
              shift and made the input float far above the keyboard. */}
          {!keyboardVisible && <View style={{ height: FLOATING_TAB_BAR_CLEARANCE }} />}
        </KeyboardDismissView>
      </SafeAreaView>

      {/* ==================== CHAT HISTORY SHEET ====================
          Native partial-height bottom sheet (@gorhom/bottom-sheet) — real
          drag handle, spring physics, backdrop tap-to-dismiss, snaps to 55%
          or 85% of the screen rather than covering it fully. Always mounted
          (closed = index -1); opened via historySheetRef.snapToIndex(0). */}
      <BottomSheet
        ref={historySheetRef}
        index={-1}
        snapPoints={historySnapPoints}
        enablePanDownToClose
        onChange={handleHistorySheetChange}
        backgroundStyle={{ backgroundColor: P.bg }}
        handleIndicatorStyle={{ backgroundColor: P.sub }}
        {...(historySheetEverOpened
          ? {
              backdropComponent: (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
                <BottomSheetBackdrop
                  {...props}
                  appearsOnIndex={0}
                  disappearsOnIndex={-1}
                  pressBehavior="close"
                />
              ),
            }
          : {})}
      >
        <View style={[styles.historyHeader, { borderBottomColor: P.sep }]}>
          {/* Titled by hat, because the two lists are genuinely separate —
              without this a provider can't tell why their client-side chats
              aren't here. */}
          <View>
            <Text style={[styles.historyTitle, { color: P.text }]}>Chat History</Text>
            <View style={styles.headerStatusRow}>
              <Ionicons
                name={isProviderMode ? "briefcase" : "sparkles"}
                size={10}
                color={P.accent}
              />
              <Text style={[styles.historySubtitle, { color: P.sub }]}>
                {isProviderMode ? "Business chats" : "Beauty chats"}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              historySheetRef.current?.close();
            }}
            activeOpacity={0.5}
          >
            <Text style={[styles.historyClose, { color: P.accent }]}>Done</Text>
          </TouchableOpacity>
        </View>

        {historyLoading ? (
          <View style={styles.historyEmpty}>
            <Text style={[styles.historyEmptyText, { color: P.sub }]}>Loading...</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={[styles.historyEmptyText, { color: P.sub }]}>
              {isProviderMode
                ? "No business chats yet. Your client-side Becca keeps its own separate history."
                : "No beauty chats yet. Start a conversation and it will appear here."}
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.historyList}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.historyItem,
                  {
                    backgroundColor:
                      item.id === currentSessionId ? P.iconBg : P.surface,
                  },
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    handleLoadChat(item);
                  }}
                  activeOpacity={0.5}
                >
                  <View style={styles.historyItemContent}>
                    <Text
                      style={[styles.historyItemTitle, { color: P.text }]}
                      numberOfLines={1}
                    >
                      {stripRichText(item.title)}
                    </Text>
                    <Text
                      style={[styles.historyItemPreview, { color: P.sub }]}
                      numberOfLines={2}
                    >
                      {/* Stripped at render too, not just on write: sessions
                          saved before markers were handled still have raw **
                          in their stored preview. */}
                      {stripRichText(item.preview)}
                    </Text>
                    <Text style={[styles.historyItemDate, { color: P.sub }]}>
                      {new Date(item.updated_at).toLocaleDateString(
                        "en-GB",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        },
                      )}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.historyDeleteBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleDeleteChat(item.id);
                  }}
                  activeOpacity={0.5}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.historyDeleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            ListFooterComponent={
              // Inside the list's footer rather than the sheet header: a
              // destructive "clear everything" must not sit beside "Done",
              // and it should scroll away with the content it acts on.
              <TouchableOpacity
                style={[
                  styles.historyClearBtn,
                  { borderColor: P.border, backgroundColor: P.surface },
                ]}
                onPress={handleClearHistory}
                activeOpacity={0.5}
              >
                <Ionicons name="trash-outline" size={14} color="#C1666B" />
                <Text style={[styles.historyClearText, { color: "#C1666B" }]}>
                  Clear {isProviderMode ? "business" : "beauty"} chat history
                </Text>
              </TouchableOpacity>
            }
          />
        )}
      </BottomSheet>

      {/* Last in the tree so dialogs/toasts layer above the history sheet. */}
      <DialogHost />
    </ThemedBackground>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  keyboardView: {
    flex: 1,
  },

  // Hero screen
  heroScrollContainer: {
    flex: 1,
    // A ScrollView clips its overflow by default, which cut the mark's outer
    // haze off long before it reached the top of the screen. The glow spans
    // ~3.7x the mark's size, so it needs to paint outside the scroll bounds.
    overflow: "visible",
  },
  heroScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  // Everything in the hero (date/time, mark, greeting block) shifts down
  // together via heroScroll's paddingTop; heroMarkWrap adds a further,
  // smaller nudge so the mark sits lower than the date/time row above it.
  heroSpacer: {
    flexGrow: 1,
    flexBasis: 0,
    maxHeight: 28,
  },
  // Slight, deliberate nudge down for the mark and everything below it,
  // while heroDateTimeRow above is left untouched.
  heroMarkWrap: {
    marginTop: 30,
    // Must not clip — the mark's glow paints well outside this wrapper.
    overflow: "visible",
  },
  heroDateTimeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  heroDateTime: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  // Greeting block — its own container so its left edge (no extra padding)
  // matches the action cards' left edge below (sectionWrap's 16px padding is
  // cancelled out by heroActionsWrap's -16px margin, so "Hi, Becca" and the
  // quick-action pills share the same start position).
  heroBody: {
    paddingBottom: 12,
  },
  heroEyebrow: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 10,
  },
  // Hat badge — the bordered pill that makes "which Becca" unmistakable.
  hatBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  hatBadgeText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    // Tightened from 2 when the badge went from "BEAUTY" to the full
    // "BEAUTY ASSISTANT" — at 2 the longer string stretched the pill most of
    // the way across the screen and stopped reading as a badge.
    letterSpacing: 1.2,
  },
  heroGreeting: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 48,
    lineHeight: 48,
    letterSpacing: -0.5,
  },
  heroQuestion: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 18,
    lineHeight: 25,
    marginTop: 14,
    maxWidth: 260,
  },
  heroStatusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#4CAF50",
  },
  heroStatusText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
  },
  heroActionsWrap: {
    marginTop: 40,
    marginHorizontal: -16,
  },

  // Header — fixed card layer, mark is plain/static (no glow)
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerId: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerName: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 22,
    letterSpacing: 0.4,
    lineHeight: 25,
  },
  headerStatus: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    letterSpacing: 0.2,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  // Chat area
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },

  daySep: {
    alignItems: "center",
  },
  daySepText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 9,
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: "hidden",
  },

  // Image preview
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  imagePreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 8,
  },
  imagePreview: {
    width: "100%",
    height: 120,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  // Chat History Sheet — native partial-height bottom sheet
  // (@gorhom/bottom-sheet handles rounded corners, safe-area bottom inset,
  // and the backdrop itself; only inner content styling lives here).
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 20,
    letterSpacing: 0.5,
  },
  historySubtitle: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    letterSpacing: 0.2,
  },
  // Destructive action, pinned below the list rather than in the header —
  // it must never sit next to "Done" where a mis-tap wipes the history.
  historyClearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  historyClearText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  historyClose: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 16,
    fontWeight: "600",
  },
  historyEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  historyEmptyText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  historyList: {
    padding: 16,
    gap: 10,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
  },
  historyItemContent: {
    flex: 1,
    marginRight: 12,
  },
  historyItemTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 15,
    marginBottom: 4,
  },
  historyItemPreview: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  historyItemDate: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
  },
  historyDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,104,104,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  historyDeleteText: {
    color: "#FF6868",
    fontSize: 12,
    fontWeight: "700",
  },
});
