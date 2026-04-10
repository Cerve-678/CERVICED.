import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Image,
  StatusBar,
  Animated,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { BeccaScreenProps } from '../navigation/types';
import enhancedAIChatService, { ChatMessage, ChatSuggestion } from '../services/enhancedAIChatService';
import beccaStorageService, { StoredSession } from '../services/beccaStorageService';
import { ChatBubble, Suggestions, ProviderRecommendations, ChatInput } from '../components/ChatComponents';
import { Provider } from '../services/ProviderDataService';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';

// ==================== TYPES ====================

// (SavedChat replaced by StoredSession from beccaStorageService)

// ==================== TYPING DOTS ====================

function TypingDots() {
  const { isDarkMode } = useTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();

    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={styles.typingRow}>
      <View style={[styles.typingBubble, { backgroundColor: isDarkMode ? 'rgba(58,58,60,0.7)' : 'rgba(255,255,255,0.6)' }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              { backgroundColor: isDarkMode ? '#E580E8' : '#a342c3' },
              dotStyle(dot),
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ==================== MAIN SCREEN ====================

export default function BeccaScreen({ navigation }: BeccaScreenProps<'BeccaMain'>) {
  const { theme, isDarkMode } = useTheme();
  const { bookings } = useBooking();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Chat history
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const buildWelcomeMessage = useCallback((): ChatMessage => {
    const isProvider = user?.accountType === 'provider';

    if (isProvider) {
      const pendingCount = bookings.filter(b => b.status === 'pending').length;
      let welcomeText = "Hi! I'm Becca, your business assistant!\n\n";
      if (pendingCount > 0) {
        welcomeText += `You have ${pendingCount} booking${pendingCount > 1 ? 's' : ''} awaiting confirmation. `;
      }
      welcomeText += "I can help you manage your clients, answer questions, and grow your business.";
      return {
        id: `welcome-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'assistant',
        content: welcomeText,
        timestamp: new Date(),
        suggestions: [
          { id: 'my-bookings', text: 'My Bookings', action: 'navigate', data: { screen: 'Bookings' } },
          { id: 'business-tips', text: 'Business Tips', action: 'message', data: { message: 'Give me tips to grow my beauty business' } },
          { id: 'client-faq', text: 'Client FAQ', action: 'message', data: { message: 'What do clients commonly ask about beauty services?' } },
        ],
      };
    }

    const upcomingCount = bookings.filter(b => b.status === 'upcoming').length;
    let welcomeText = "Hi! I'm Becca, your beauty booking assistant!\n\n";
    if (upcomingCount > 0) {
      welcomeText += `You have ${upcomingCount} upcoming appointment${upcomingCount > 1 ? 's' : ''}. `;
    }
    welcomeText += 'I can help you find and book amazing beauty services. What are you looking for today?';

    return {
      id: `welcome-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'assistant',
      content: welcomeText,
      timestamp: new Date(),
      suggestions: [
        { id: 'my-bookings', text: 'My Bookings', action: 'navigate', data: { screen: 'Bookings' } },
        { id: 'find-near-me', text: 'Find Services Near Me', action: 'message', data: { message: 'Find beauty services near me' } },
        { id: 'browse', text: 'Browse All Services', action: 'message', data: { message: 'Show me all services' } },
      ],
    };
  }, [bookings, user?.accountType]);

  // Initialize
  useEffect(() => {
    enhancedAIChatService.setBookings(bookings);
    setMessages([buildWelcomeMessage()]);
  }, [bookings, buildWelcomeMessage]);

  // Load sessions from Supabase on mount
  useEffect(() => {
    if (!user?.id) return;
    setHistoryLoading(true);
    beccaStorageService.loadSessions(user.id)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [user?.id]);

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
      const updated = await beccaStorageService.loadSessions(user.id);
      setSessions(updated);
    } catch (_) {}
  }, [user?.id]);

  const handleImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Failed to open photo library.');
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || inputText.trim();
    const imageToSend = selectedImage;
    if (!textToSend && !imageToSend) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend || 'Sent an image',
      timestamp: new Date(),
    };
    if (imageToSend) userMessage.imageUri = imageToSend;

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsTyping(true);

    // Create session on first user message
    let sessionId = currentSessionId;
    if (!sessionId && user?.id) {
      try {
        const title = userMessage.content.length > 40
          ? userMessage.content.substring(0, 40) + '...'
          : userMessage.content;
        sessionId = await beccaStorageService.createSession(user.id, title, userMessage.content.substring(0, 80));
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
      const response = await enhancedAIChatService.generateResponse(
        textToSend || 'What can you tell me about this?',
        imageToSend || undefined,
      );
      setMessages(prev => [...prev, response]);
      setIsTyping(false);

      // Save assistant response
      if (sessionId) {
        beccaStorageService.saveMessage(sessionId, response).catch(() => {});
        // Update session preview with last assistant message
        const preview = response.content.length > 80 ? response.content.substring(0, 80) + '...' : response.content;
        const title = messages.find(m => m.role === 'user')?.content ?? userMessage.content;
        const shortTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
        beccaStorageService.updateSession(sessionId, shortTitle, preview).catch(() => {});
        refreshSessions();
      }
    }, 800);
  };

  const handleNewChat = () => {
    Alert.alert('New Chat', 'Start a new conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New Chat',
        onPress: () => {
          setCurrentSessionId(null);
          setMessages([buildWelcomeMessage()]);
          setInputText('');
          setSelectedImage(null);
          enhancedAIChatService.resetConversation();
        },
      },
    ]);
  };

  const handleLoadChat = async (session: StoredSession) => {
    setShowHistory(false);
    try {
      const msgs = await beccaStorageService.loadMessages(session.id);
      setMessages(msgs.length > 0 ? msgs : [buildWelcomeMessage()]);
      setCurrentSessionId(session.id);
      enhancedAIChatService.resetConversation();
    } catch (_) {
      Alert.alert('Error', 'Could not load chat.');
    }
  };

  const handleDeleteChat = async (sessionId: string) => {
    try {
      await beccaStorageService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([buildWelcomeMessage()]);
        enhancedAIChatService.resetConversation();
      }
    } catch (_) {}
  };

  const handleSuggestionPress = (suggestion: ChatSuggestion) => {
    if (suggestion.action === 'message') {
      handleSend(suggestion.data.message);
    } else if (suggestion.action === 'navigate') {
      if (suggestion.data.screen === 'Bookings') {
        navigation.navigate('Bookings');
      } else if (suggestion.data.screen === 'Explore') {
        navigation.getParent()?.navigate('Explore', { screen: 'ExploreMain' });
      }
    }
  };

  const handleProviderPress = (provider: Provider) => {
    navigation.navigate('ProviderProfile', { providerId: provider.id, source: 'becca' });
  };

  const lastMessage = messages[messages.length - 1];
  const showSuggestions = lastMessage?.role === 'assistant' && lastMessage?.suggestions;
  const showRecommendations = lastMessage?.role === 'assistant' && lastMessage?.providerRecommendations;

  return (
    <ThemedBackground style={styles.background}>
      <StatusBar barStyle={theme.statusBar} />
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* ==================== HEADER ==================== */}
          <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerName, { color: theme.text }]}>Becca</Text>
              <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]}>AI Beauty Assistant</Text>
            </View>
            <View style={styles.headerButtons}>
              {/* Chat History Button */}
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}
                onPress={() => setShowHistory(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.headerBtnIcon, { color: isDarkMode ? '#E580E8' : '#a342c3' }]}>☰</Text>
              </TouchableOpacity>
              {/* New Chat Button */}
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: isDarkMode ? 'rgba(229,128,232,0.15)' : 'rgba(163,66,195,0.1)' }]}
                onPress={handleNewChat}
                activeOpacity={0.7}
              >
                <Text style={[styles.headerBtnIcon, { color: isDarkMode ? '#E580E8' : '#a342c3' }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ==================== CHAT MESSAGES ==================== */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isTyping && <TypingDots />}

            {showSuggestions && (
              <Suggestions suggestions={lastMessage.suggestions!} onSuggestionPress={handleSuggestionPress} />
            )}

            {showRecommendations && (
              <ProviderRecommendations providers={lastMessage.providerRecommendations!} onProviderPress={handleProviderPress} />
            )}
          </ScrollView>

          {/* ==================== IMAGE PREVIEW ==================== */}
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <View style={[styles.imagePreviewCard, { backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF' }]}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
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

          {/* ==================== INPUT ==================== */}
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={() => handleSend()}
            onImagePick={handleImagePick}
            placeholder="Ask me anything..."
            hasImage={!!selectedImage}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ==================== CHAT HISTORY MODAL ==================== */}
      <Modal
        visible={showHistory}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={styles.historyOverlay}>
          <View style={[styles.historyPanel, { backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF' }]}>
            <View style={[styles.historyHeader, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Text style={[styles.historyTitle, { color: theme.text }]}>Chat History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} activeOpacity={0.7}>
                <Text style={[styles.historyClose, { color: isDarkMode ? '#E580E8' : '#a342c3' }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <View style={styles.historyEmpty}>
                <Text style={[styles.historyEmptyText, { color: theme.secondaryText }]}>Loading...</Text>
              </View>
            ) : sessions.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={[styles.historyEmptyText, { color: theme.secondaryText }]}>
                  No saved chats yet. Start a conversation and it will appear here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.historyList}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.historyItem,
                      { backgroundColor: item.id === currentSessionId
                          ? (isDarkMode ? 'rgba(229,128,232,0.12)' : 'rgba(163,66,195,0.08)')
                          : (isDarkMode ? '#2C2C2E' : '#F8F8F8') },
                    ]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => handleLoadChat(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.historyItemContent}>
                        <Text style={[styles.historyItemTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.historyItemPreview, { color: theme.secondaryText }]} numberOfLines={2}>
                          {item.preview}
                        </Text>
                        <Text style={[styles.historyItemDate, { color: theme.secondaryText }]}>
                          {new Date(item.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyDeleteBtn}
                      onPress={() => handleDeleteChat(item.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.historyDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    justifyContent: 'center',
  },
  headerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 24,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '500',
    marginTop: -2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnIcon: {
    fontSize: 20,
    fontWeight: '400',
  },

  // Chat area
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 20,
  },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 22,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Image preview
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  imagePreviewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 8,
  },
  imagePreview: {
    width: '100%',
    height: 120,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Chat History Modal
  historyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  historyPanel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    minHeight: '40%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  historyClose: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
  },
  historyEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  historyEmptyText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  historyList: {
    padding: 16,
    gap: 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  historyItemContent: {
    flex: 1,
    marginRight: 12,
  },
  historyItemTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    marginBottom: 4,
  },
  historyItemPreview: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  historyItemDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
  },
  historyDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,59,48,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '700',
  },
});
