// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'ForgotPassword'>;

const L = { bg: '#F5F1EC', surface: '#EDE8E2', accent: '#AF9197', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)' };
const D = { bg: '#1A1815', surface: '#201D1A', accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)' };

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode ? D : L;
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Enter your email', 'Please enter the email address you signed up with.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert('Error', "We couldn't send a reset email. Please check your email address and try again.");
      return;
    }
    navigation.navigate('ResetPasswordOTP', { email: trimmed });
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>

            {/* Icon placeholder */}
            <View style={[styles.iconCircle, { backgroundColor: t.surface }]}>
              <Text style={[styles.iconGlyph, { color: t.accent }]}>🔒</Text>
            </View>

            <Text style={[styles.title, { color: t.text }]}>Forgot password?</Text>
            <Text style={[styles.subtitle, { color: t.sub }]}>
              Enter your email and we'll send you a code to reset your password.
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
              <TextInput
                style={[styles.input, { color: t.text }]}
                placeholder="Email address"
                placeholderTextColor={t.sub}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={t.accent}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: t.accent }]}
              onPress={handleSend}
              activeOpacity={0.75}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>SEND RESET CODE</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
              activeOpacity={0.6}
            >
              <Text style={[styles.backLinkText, { color: t.sub }]}>Back to log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconGlyph: { fontSize: 36 },
  title: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  inputWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 12 : 14,
    marginBottom: 16,
  },
  input: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    padding: 0,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  backLink: { paddingVertical: 8 },
  backLinkText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
  },
});
