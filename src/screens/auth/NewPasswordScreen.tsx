// src/screens/auth/NewPasswordScreen.tsx
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

type Props = StackScreenProps<RootStackParamList, 'NewPassword'>;


export default function NewPasswordScreen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSave = async () => {
    if (password.length < 8) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('No match', 'Passwords do not match.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Error', "Couldn't update your password. Please try again.");
      return;
    }
    await supabase.auth.signOut();
    Alert.alert('Password updated!', 'Please log in with your new password.', [
      { text: 'OK', onPress: () => navigation.navigate('Login') },
    ]);
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>

            <View style={[styles.iconCircle, { backgroundColor: t.surface }]}>
              <Text style={[styles.iconGlyph, { color: t.accent }]}>🛡️</Text>
            </View>

            <Text style={[styles.title, { color: t.text }]}>New password</Text>
            <Text style={[styles.subtitle, { color: t.sub }]}>
              Choose a strong password for your account.
            </Text>

            {/* Password */}
            <View style={[styles.inputWrapper, { backgroundColor: t.surface, borderColor: t.border }]}>
              <TextInput
                style={[styles.input, { color: t.text }]}
                placeholder="New password"
                placeholderTextColor={t.sub}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                selectionColor={t.accent}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
              >
                <Text style={[styles.eyeText, { color: t.sub }]}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm */}
            <View style={[styles.inputWrapper, { backgroundColor: t.surface, borderColor: t.border }]}>
              <TextInput
                style={[styles.input, { color: t.text }]}
                placeholder="Confirm password"
                placeholderTextColor={t.sub}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                selectionColor={t.accent}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowConfirm(v => !v); }}
              >
                <Text style={[styles.eyeText, { color: t.sub }]}>{showConfirm ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: t.accent }]}
              onPress={handleSave}
              activeOpacity={0.75}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>SAVE PASSWORD</Text>
              )}
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
  inputWrapper: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 10 : 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    padding: 0,
    paddingRight: 8,
  },
  eyeBtn: { paddingLeft: 8 },
  eyeText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
