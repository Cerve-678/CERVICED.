// src/screens/auth/SignUpStep1Screen.tsx
import React, { useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import SignUpHeader from '../../components/SignUpHeader';
import { normalizeExternalBookingUrl } from '../../features/providers/externalBookingLink';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep1'>;

export default function SignUpStep1Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();
  const isProvider = data.accountType === 'provider';
  // Choosing Beauty Professional already means booking through CERVICED; the
  // own-link switch is the only exception, so it starts off unless a link
  // was already entered on an earlier visit to this step.
  const [usesOwnLink, setUsesOwnLink] = useState(data.externalBookingUrl !== '');
  const [bookingLink, setBookingLink] = useState(data.externalBookingUrl);

  const pick = (accountType: 'user' | 'provider') => {
    Haptics.selectionAsync().catch(() => {});
    updateData({ accountType });
  };

  const handleContinue = () => {
    let externalBookingUrl = '';
    if (isProvider && usesOwnLink) {
      const normalized = normalizeExternalBookingUrl(bookingLink);
      if (!normalized) {
        Alert.alert('Check your booking link', 'Paste the full link to your booking page, e.g. fresha.com/a/your-studio');
        return;
      }
      externalBookingUrl = normalized;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    updateData({ externalBookingUrl });
    navigation.navigate('SignUpStep2');
  };

  const tile = (accountType: 'user' | 'provider', title: string, desc: string) => {
    const selected = data.accountType === accountType;
    return (
      <TouchableOpacity
        style={[
          styles.tile,
          selected
            ? { backgroundColor: t.accent, borderColor: t.accent }
            : { backgroundColor: t.card, borderColor: t.border },
        ]}
        onPress={() => pick(accountType)}
        activeOpacity={0.6}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <View
          style={[
            styles.radio,
            selected ? { borderWidth: 7, borderColor: t.onAccent } : { borderWidth: 1.5, borderColor: t.sub },
          ]}
        />
        <View>
          <Text style={[styles.tileTitle, { color: selected ? t.onAccent : t.text }]}>{title}</Text>
          <Text style={[styles.tileDesc, { color: selected ? t.onAccent : t.sub }]}>{desc}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SignUpHeader onBack={() => navigation.goBack()} currentStep={1} totalSteps={totalSteps} />

          <Text style={[styles.headerTitle, { color: t.text }]}>Using CERVICED{'\n'}as a…</Text>

          <View style={styles.tiles} accessibilityRole="radiogroup">
            {tile('user', 'Client', 'Find and book beauty pros')}
            {tile('provider', 'Beauty Professional', 'Get found by clients')}
          </View>

          {isProvider && (
            <View style={styles.linkSection}>
              <View style={[styles.linkRow, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkTitle, { color: t.text }]}>I use my own booking link</Text>
                  <Text style={[styles.linkDesc, { color: t.sub }]}>Fresha, Treatwell, Booksy, Acuity…</Text>
                </View>
                <Switch
                  value={usesOwnLink}
                  onValueChange={v => { Haptics.selectionAsync().catch(() => {}); setUsesOwnLink(v); }}
                  trackColor={{ false: '#D1D1D6', true: t.accent }}
                  thumbColor="#fff"
                  accessibilityLabel="I use my own booking link"
                />
              </View>

              {usesOwnLink && (
                <>
                  <View style={[styles.inputWrap, { backgroundColor: t.card, borderColor: t.accent }]}>
                    <Ionicons name="link-outline" size={18} color={t.sub} />
                    <TextInput
                      style={[styles.input, { color: t.text }]}
                      value={bookingLink}
                      onChangeText={setBookingLink}
                      placeholder="Paste your booking link"
                      placeholderTextColor={t.sub}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="done"
                      accessibilityLabel="Your booking link"
                    />
                  </View>
                  <Text style={[styles.linkDesc, { color: t.sub }]}>
                    Clients still find you on CERVICED. Tapping Book opens your page inside the app.
                  </Text>
                </>
              )}
            </View>
          )}

          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: t.accent }]}
            onPress={handleContinue}
            activeOpacity={0.75}
          >
            <Text style={[styles.continueBtnText, { color: t.onAccent }]}>CONTINUE</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 16 },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 34, lineHeight: 40, letterSpacing: 0.5, marginBottom: 22 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 150, borderRadius: 22, borderWidth: 1, padding: 16, justifyContent: 'space-between' },
  radio: { width: 24, height: 24, borderRadius: 12 },
  tileTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, lineHeight: 23, letterSpacing: 0.3 },
  tileDesc: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', lineHeight: 17, marginTop: 4 },
  linkSection: { marginTop: 22, gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  linkTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '700' },
  linkDesc: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, marginTop: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '600' },
  continueBtn: { borderRadius: 100, paddingVertical: 17, alignItems: 'center', marginTop: 20 },
  continueBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
});
