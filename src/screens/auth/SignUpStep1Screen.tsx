// src/screens/auth/SignUpStep1Screen.tsx
import React from 'react';
import * as Haptics from 'expo-haptics';
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
import StepProgressIndicator from '../../components/StepProgressIndicator';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep1'>;

const L = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)' };
const D = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)' };

export default function SignUpStep1Screen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode ? D : L;
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();
  const isSelected = data.accountType;

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.6}
        >
          <Text style={[styles.backIcon, { color: t.text }]}>{'<'}</Text>
        </TouchableOpacity>

        {/* Progress */}
        <StepProgressIndicator currentStep={1} totalSteps={totalSteps} />

        {/* Header */}
        <Text style={[styles.headerTitle, { color: t.text }]}>I am a...</Text>

        {/* Selection Cards */}
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[
              styles.selectionCard,
              {
                backgroundColor: t.card,
                borderColor: isSelected === 'user' ? t.accent : t.border,
                borderWidth: isSelected === 'user' ? 1.5 : 1,
              },
            ]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); updateData({ accountType: 'user' }); }}
            activeOpacity={0.6}
          >
            <Text style={styles.cardEmoji}>✨</Text>
            <Text style={[styles.cardTitle, { color: t.text }]}>Looking for Services</Text>
            <Text style={[styles.cardDesc, { color: t.sub }]}>
              Find and book beauty professionals near you
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectionCard,
              {
                backgroundColor: t.card,
                borderColor: isSelected === 'provider' ? t.accent : t.border,
                borderWidth: isSelected === 'provider' ? 1.5 : 1,
              },
            ]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); updateData({ accountType: 'provider' }); }}
            activeOpacity={0.6}
          >
            <Text style={styles.cardEmoji}>💼</Text>
            <Text style={[styles.cardTitle, { color: t.text }]}>Beauty Professional</Text>
            <Text style={[styles.cardDesc, { color: t.sub }]}>
              List your services and manage bookings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Continue */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: t.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); navigation.navigate('SignUpStep2'); }}
            activeOpacity={0.75}
          >
            <Text style={styles.continueBtnText}>CONTINUE</Text>
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
    borderWidth: 1,
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
    letterSpacing: 1,
    marginBottom: 28,
  },
  cardsContainer: {
    flex: 1,
    gap: 16,
  },
  selectionCard: {
    borderRadius: 20,
    padding: 24,
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
  },
  continueBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
