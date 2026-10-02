// src/screens/auth/SignUpStep1Screen.tsx
import React, { useEffect } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep1'>;


export default function SignUpStep1Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const { pendingSocialSignup, cancelSocialSignup } = useAuth();
  const insets = useSafeAreaInsets();
  const isSelected = data.accountType;

  // A first-time Apple sign-in lands here with a live session. The switch
  // flags belong to the logged-in upgrade flows — a draft left over from one
  // of those would send Step 5 down the wrong submit path.
  useEffect(() => {
    if (pendingSocialSignup && (data.fromClientSwitch || data.fromProviderSwitch)) {
      updateData({ fromClientSwitch: false, fromProviderSwitch: false });
    }
  }, [pendingSocialSignup, data.fromClientSwitch, data.fromProviderSwitch, updateData]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Nothing to go back to on the Apple path: backing out of signup means not
    // creating the account, so end the session and return to Welcome.
    if (pendingSocialSignup) {
      cancelSocialSignup().catch(() => {});
      return;
    }
    navigation.goBack();
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={handleBack}
          activeOpacity={0.6}
        >
          <Text style={[styles.backIcon, { color: t.text }]}>{'<'}</Text>
        </TouchableOpacity>

        {/* Progress */}
        <StepProgressIndicator currentStep={1} totalSteps={totalSteps} />

        {/* Header */}
        <Text style={[styles.headerTitle, { color: t.text }, pendingSocialSignup && { marginBottom: 8 }]}>I am a...</Text>
        {pendingSocialSignup && (
          <Text style={[styles.headerSubtitle, { color: t.sub }]}>
            You're signed in with Apple — just a few details to finish setting up your account.
          </Text>
        )}

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
  headerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
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
