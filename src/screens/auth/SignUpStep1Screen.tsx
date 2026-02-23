// src/screens/auth/SignUpStep1Screen.tsx
import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep1'>;

export default function SignUpStep1Screen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();

  const glassStyle = (active?: boolean) => ({
    backgroundColor: active
      ? (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.35)')
      : (isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.15)'),
    borderTopColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)'),
    borderLeftColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)'),
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const isSelected = data.accountType;

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, glassStyle()]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.backIcon, { color: theme.text }]}>{'<'}</Text>
        </TouchableOpacity>

        {/* Progress */}
        <StepProgressIndicator currentStep={1} totalSteps={totalSteps} />

        {/* Header */}
        <Text style={[styles.headerTitle, { color: theme.text }]}>I am a...</Text>

        {/* Selection Cards */}
        <View style={styles.cardsContainer}>
          {/* User Card */}
          <TouchableOpacity
            style={[
              styles.selectionCard,
              glassStyle(isSelected === 'user'),
              isSelected === 'user' && styles.selectedCard,
            ]}
            onPress={() => updateData({ accountType: 'user' })}
            activeOpacity={0.7}
          >
            <Text style={[styles.cardEmoji]}>{"✨"}</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Looking for Services</Text>
            <Text style={[styles.cardDesc, { color: theme.secondaryText }]}>
              Find and book beauty professionals near you
            </Text>
          </TouchableOpacity>

          {/* Provider Card */}
          <TouchableOpacity
            style={[
              styles.selectionCard,
              glassStyle(isSelected === 'provider'),
              isSelected === 'provider' && styles.selectedCard,
            ]}
            onPress={() => updateData({ accountType: 'provider' })}
            activeOpacity={0.7}
          >
            <Text style={[styles.cardEmoji]}>{"💼"}</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Beauty Professional</Text>
            <Text style={[styles.cardDesc, { color: theme.secondaryText }]}>
              List your services and manage bookings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Continue Button */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={() => navigation.navigate('SignUpStep2')}
            activeOpacity={0.8}
          >
            <Text style={[styles.continueBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
              CONTINUE
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  backIcon: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 28,
  },
  cardsContainer: {
    flex: 1,
    gap: 16,
  },
  selectionCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    overflow: 'hidden',
  },
  selectedCard: {
    borderColor: 'rgba(218,112,214,0.6)',
  },
  cardEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cardDesc: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  continueBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  continueBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
});
