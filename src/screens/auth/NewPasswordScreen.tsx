// src/screens/auth/NewPasswordScreen.tsx
import React, { useState, useCallback } from 'react';
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
import { ShieldCheckIcon } from '../../components/IconLibrary';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'NewPassword'>;

export default function NewPasswordScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(false);
    }, [])
  );

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: isDarkMode ? 'rgba(58,58,60,0.8)' : 'rgba(255,255,255,0.6)',
      borderColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.6)',
    },
  ];

  const handleSave = async () => {
    if (password.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('No match', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await Promise.race([
        supabase.auth.updateUser({ password }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), 15000)
        ),
      ]);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      // Sign out so the user logs in fresh with new password
      // Non-fatal timeout — if signOut hangs, still proceed to login screen
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      Alert.alert('Password updated!', 'Please log in with your new password.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
          <ShieldCheckIcon size={64} color="#a342c3" style={{ marginBottom: 24 }} />

          <Text style={[styles.title, { color: theme.text }]}>New password</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            Choose a strong password for your account.
          </Text>

          {/* Password */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={inputStyle}
              placeholder="New password"
              placeholderTextColor={theme.secondaryText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              selectionColor={theme.accent}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
            >
              <Text style={{ color: theme.secondaryText, fontSize: 13 }}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Confirm */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={inputStyle}
              placeholder="Confirm password"
              placeholderTextColor={theme.secondaryText}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              selectionColor={theme.accent}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm(v => !v)}
            >
              <Text style={{ color: theme.secondaryText, fontSize: 13 }}>
                {showConfirm ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDarkMode ? '#fff' : theme.text} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
                SAVE PASSWORD
              </Text>
            )}
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
  inputWrapper: {
    width: '100%',
    marginBottom: 16,
    position: 'relative',
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingRight: 60,
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
