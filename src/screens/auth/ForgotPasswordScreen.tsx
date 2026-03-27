// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { LockIcon } from '../../components/IconLibrary';
import { supabase } from '../../lib/supabase';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Enter your email', 'Please enter the email address you signed up with.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.navigate('ResetPasswordOTP', { email: trimmed });
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
          <LockIcon size={64} color="#a342c3" style={{ marginBottom: 24 }} />

          <Text style={[styles.title, { color: theme.text }]}>Forgot password?</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            Enter your email and we'll send you a code to reset your password.
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: isDarkMode ? 'rgba(58,58,60,0.8)' : 'rgba(255,255,255,0.6)',
                borderColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.6)',
              },
            ]}
            placeholder="Email address"
            placeholderTextColor={theme.secondaryText}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={theme.accent}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDarkMode ? '#fff' : theme.text} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
                SEND RESET CODE
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={[styles.backLinkText, { color: theme.secondaryText }]}>
              Back to log in
            </Text>
          </TouchableOpacity>
        </View>
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

  title: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 16,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  backLink: { paddingVertical: 8 },
  backLinkText: { fontSize: 14 },
});
