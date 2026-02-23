import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Image, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { BeccaScreenProps } from '../navigation/types';
import aiChatService, { ChatMessage, ChatSuggestion } from '../services/aiChatService';
import { ChatBubble, Suggestions, ProviderRecommendations, ChatInput } from '../components/ChatComponents';
import { Provider } from '../services/ProviderDataService';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

export default function BeccaScreen({ navigation }: BeccaScreenProps<'BeccaMain'>) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMessage: ChatMessage = {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm Becca, your beauty booking assistant! 💜\n\nI can help you find and book amazing beauty services. What are you looking for today?",
      timestamp: new Date(),
      suggestions: [
        {
          id: 'find-near-me',
          text: 'Find Services Near Me',
          action: 'message',
          data: { message: 'Find beauty services near me' }
        },
        {
          id: 'book-appointment',
          text: 'Book an Appointment',
          action: 'message',
          data: { message: 'I want to book an appointment' }
        },
        {
          id: 'browse',
          text: 'Browse All Services',
          action: 'message',
          data: { message: 'Show me all services' }
        },
        {
          id: 'upload-inspo',
          text: 'Upload Inspiration Photo',
          action: 'message',
          data: { message: 'I have an inspiration photo to share' }
        }
      ]
    };
    setMessages([welcomeMessage]);
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || inputText.trim();
    const imageToSend = selectedImage;

    if (!textToSend && !imageToSend) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend || 'Sent an image',
      timestamp: new Date(),
    };

    if (imageToSend) {
      userMessage.imageUri = imageToSend;
    }

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsTyping(true);

    // Simulate typing delay
    setTimeout(async () => {
      const response = await aiChatService.generateResponse(textToSend || 'What can you tell me about this?', imageToSend || undefined);
      setMessages(prev => [...prev, response]);
      setIsTyping(false);
    }, 800);
  };

  const handleNewChat = () => {
    Alert.alert(
      'New Chat',
      'Start a new conversation? Current chat will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Chat',
          onPress: () => {
            setMessages([{
              id: '0',
              role: 'assistant',
              content: "Hi! I'm Becca, your beauty booking assistant! 💜\n\nI can help you find and book amazing beauty services. What are you looking for today?",
              timestamp: new Date(),
              suggestions: [
                {
                  id: 'find-near-me',
                  text: 'Find Services Near Me',
                  action: 'message',
                  data: { message: 'Find beauty services near me' }
                },
                {
                  id: 'book-appointment',
                  text: 'Book an Appointment',
                  action: 'message',
                  data: { message: 'I want to book an appointment' }
                },
                {
                  id: 'browse',
                  text: 'Browse All Services',
                  action: 'message',
                  data: { message: 'Show me all services' }
                },
                {
                  id: 'upload-inspo',
                  text: 'Upload Inspiration Photo',
                  action: 'message',
                  data: { message: 'I have an inspiration photo to share' }
                }
              ]
            }]);
            setInputText('');
            setSelectedImage(null);
            aiChatService.resetConversation();
          }
        }
      ]
    );
  };

  const handleSuggestionPress = (suggestion: ChatSuggestion) => {
    if (suggestion.action === 'message') {
      handleSend(suggestion.data.message);
    } else if (suggestion.action === 'navigate') {
      if (suggestion.data.screen === 'Bookings') {
        navigation.navigate('Bookings');
      } else if (suggestion.data.screen === 'Explore') {
        navigation.navigate('Home', { screen: 'ExploreMain' } as any);
      }
    }
  };

  const handleProviderPress = (provider: Provider) => {
    navigation.navigate('ProviderProfile', {
      providerId: provider.id,
      source: 'becca'
    } as any);
  };

  const lastMessage = messages[messages.length - 1];
  const showSuggestions = lastMessage?.role === 'assistant' && lastMessage?.suggestions;
  const showRecommendations = lastMessage?.role === 'assistant' && lastMessage?.providerRecommendations;

  return (
    <ThemedBackground style={styles.background}>
      <StatusBar barStyle={theme.statusBar} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Becca</Text>
                <Text style={[styles.subtitle, { color: theme.secondaryText }]}>Your AI Beauty Assistant</Text>
              </View>
              <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat} activeOpacity={0.7}>
                <BlurView intensity={35} tint={theme.blurTint} style={styles.newChatBlur}>
                  <Text style={[styles.newChatText, { color: theme.text }]}>+ New</Text>
                </BlurView>
              </TouchableOpacity>
            </View>
          </View>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isTyping && (
              <View style={styles.typingContainer}>
                <BlurView intensity={40} tint={theme.blurTint} style={styles.typingBlur}>
                  <Text style={[styles.typingText, { color: theme.secondaryText }]}>Becca is typing...</Text>
                </BlurView>
              </View>
            )}

            {showSuggestions && (
              <Suggestions
                suggestions={lastMessage.suggestions!}
                onSuggestionPress={handleSuggestionPress}
              />
            )}

            {showRecommendations && (
              <ProviderRecommendations
                providers={lastMessage.providerRecommendations!}
                onProviderPress={handleProviderPress}
              />
            )}
          </ScrollView>

          {/* Selected Image Preview */}
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <BlurView intensity={40} tint={theme.blurTint} style={styles.imagePreviewBlur}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setSelectedImage(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          )}

          {/* Chat Input */}
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
    </ThemedBackground>
  );
}

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
  header: {
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    marginBottom: 4,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
  },
  newChatButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  newChatBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowOpacity: 0.1,
  },
  newChatText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 100,
  },
  typingBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    alignSelf: 'flex-start',
  },
  typingText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  imagePreviewBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});