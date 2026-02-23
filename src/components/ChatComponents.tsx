import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ChatMessage, ChatSuggestion } from '../services/enhancedAIChatService';
import { Provider } from '../services/ProviderDataService';
import { useTheme } from '../contexts/ThemeContext';

// ==================== CHAT BUBBLE ====================

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const { theme, isDarkMode } = useTheme();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <BlurView
          intensity={isUser ? 40 : 35}
          tint={isDarkMode ? 'dark' : 'light'}
          style={styles.bubbleBlur}
        >
          <View
            style={[
              styles.bubbleInner,
              isUser
                ? {
                    backgroundColor: isDarkMode
                      ? 'rgba(163, 66, 195, 0.35)'
                      : 'rgba(163, 66, 195, 0.25)',
                  }
                : {
                    backgroundColor: isDarkMode
                      ? 'rgba(58, 58, 60, 0.7)'
                      : 'rgba(255, 255, 255, 0.5)',
                  },
            ]}
          >
            {message.imageUri && (
              <Image source={{ uri: message.imageUri }} style={styles.messageImage} resizeMode="cover" />
            )}
            <Text style={[styles.messageText, { color: isUser ? '#FFFFFF' : theme.text }]}>
              {message.content}
            </Text>
            <Text
              style={[
                styles.timestamp,
                { color: isUser ? 'rgba(255,255,255,0.6)' : theme.secondaryText },
              ]}
            >
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </BlurView>
      </View>
    </View>
  );
}

// ==================== SUGGESTIONS ====================

interface SuggestionsProps {
  suggestions: ChatSuggestion[];
  onSuggestionPress: (suggestion: ChatSuggestion) => void;
}

export function Suggestions({ suggestions, onSuggestionPress }: SuggestionsProps) {
  const { isDarkMode } = useTheme();

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View style={styles.suggestionsWrap}>
      {suggestions.map((suggestion) => (
        <TouchableOpacity
          key={suggestion.id}
          style={[
            styles.suggestionPill,
            {
              backgroundColor: isDarkMode ? 'rgba(229,128,232,0.12)' : 'rgba(163,66,195,0.08)',
              borderColor: isDarkMode ? 'rgba(229,128,232,0.25)' : 'rgba(163,66,195,0.2)',
            },
          ]}
          onPress={() => onSuggestionPress(suggestion)}
          activeOpacity={0.7}
        >
          {suggestion.icon && (
            <View style={styles.suggestionIconWrap}>
              <Image source={suggestion.icon} style={styles.suggestionIcon} resizeMode="contain" />
            </View>
          )}
          <Text style={[styles.suggestionText, { color: isDarkMode ? '#E580E8' : '#a342c3' }]}>
            {suggestion.text}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ==================== PROVIDER RECOMMENDATIONS ====================

interface ProviderRecommendationsProps {
  providers: Provider[];
  onProviderPress: (provider: Provider) => void;
}

export function ProviderRecommendations({ providers, onProviderPress }: ProviderRecommendationsProps) {
  const { theme, isDarkMode } = useTheme();

  if (!providers || providers.length === 0) return null;

  return (
    <View style={styles.recommendationsContainer}>
      <Text style={[styles.recommendationsTitle, { color: theme.text }]}>Recommended Providers</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recommendationsScroll}>
        {providers.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            style={styles.providerCardOuter}
            onPress={() => onProviderPress(provider)}
            activeOpacity={0.8}
          >
            <BlurView intensity={40} tint={isDarkMode ? 'dark' : 'light'} style={styles.providerCardBlur}>
              <View
                style={[
                  styles.providerCardInner,
                  {
                    backgroundColor: isDarkMode
                      ? 'rgba(58, 58, 60, 0.6)'
                      : 'rgba(255, 255, 255, 0.45)',
                  },
                ]}
              >
                <View style={[styles.logoContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)' }]}>
                  <Image source={provider.logo} style={styles.providerLogo} resizeMode="contain" />
                </View>
                <Text style={[styles.providerName, { color: theme.text }]} numberOfLines={1}>
                  {provider.name}
                </Text>
                <View style={[styles.serviceBadge, { backgroundColor: isDarkMode ? '#E580E8' : '#a342c3' }]}>
                  <Text style={styles.serviceText}>{provider.service}</Text>
                </View>
              </View>
            </BlurView>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ==================== CHAT INPUT ====================

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onImagePick: () => void;
  placeholder?: string;
  hasImage?: boolean;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onImagePick,
  placeholder = 'Ask me anything...',
  hasImage = false,
}: ChatInputProps) {
  const { theme, isDarkMode } = useTheme();

  return (
    <View style={styles.inputContainer}>
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: isDarkMode ? 'rgba(28,28,30,0.9)' : 'rgba(255,255,255,0.9)',
            borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.imageButton} onPress={onImagePick} activeOpacity={0.6}>
            <Text style={styles.imageButtonIcon}>📷</Text>
          </TouchableOpacity>

          <View style={[styles.textInputContainer, { backgroundColor: isDarkMode ? '#2C2C2E' : '#F2F2F7' }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={isDarkMode ? '#8E8E93' : '#C7C7CC'}
              multiline
              maxLength={500}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  value.trim() || hasImage
                    ? isDarkMode
                      ? '#E580E8'
                      : '#a342c3'
                    : isDarkMode
                    ? '#3A3A3C'
                    : '#E0E0E0',
              },
            ]}
            onPress={onSend}
            disabled={!value.trim() && !hasImage}
            activeOpacity={0.6}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  // Chat Bubble
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 22,
    overflow: 'hidden',
  },
  bubbleUser: {
    borderWidth: 1.5,
    borderTopColor: 'rgba(163, 66, 195, 0.5)',
    borderLeftColor: 'rgba(163, 66, 195, 0.4)',
    borderRightColor: 'rgba(163, 66, 195, 0.15)',
    borderBottomColor: 'rgba(163, 66, 195, 0.15)',
    shadowColor: 'rgba(163, 66, 195, 0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  bubbleAssistant: {
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  bubbleBlur: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  bubbleInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  timestamp: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
    fontWeight: '400',
  },

  // Suggestions
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  suggestionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(163,66,195,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestionIcon: {
    width: 18,
    height: 18,
  },
  suggestionText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    fontWeight: '600',
  },

  // Provider Recommendations
  recommendationsContainer: {
    marginVertical: 12,
    paddingLeft: 16,
  },
  recommendationsTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  recommendationsScroll: {
    flexGrow: 0,
  },
  providerCardOuter: {
    width: 140,
    height: 160,
    marginRight: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  providerCardBlur: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  providerCardInner: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  providerLogo: {
    width: 48,
    height: 48,
  },
  providerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  serviceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  serviceText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Chat Input
  inputContainer: {
    paddingBottom: Platform.OS === 'ios' ? 105 : 85,
    backgroundColor: 'transparent',
  },
  inputWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  imageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  imageButtonIcon: {
    fontSize: 20,
  },
  textInputContainer: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    maxHeight: 100,
    justifyContent: 'center',
  },
  input: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 16,
    fontWeight: '400',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonText: {
    fontSize: 18,
    color: '#FFF',
    fontWeight: '700',
  },
});
