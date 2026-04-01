import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';

// ── Input component ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  theme: any;
  isDarkMode: boolean;
  showToggle?: boolean;
  visible?: boolean;
  onToggleVisible?: () => void;
  autoCapitalize?: 'none' | 'sentences';
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  theme,
  isDarkMode,
  showToggle,
  visible,
  onToggleVisible,
  autoCapitalize = 'none',
}: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: theme.secondaryText }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: isDarkMode ? '#2C2C2E' : '#F2F2F7', borderColor: theme.border },
        ]}
      >
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.secondaryText}
          secureTextEntry={secureTextEntry && !visible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
        />
        {showToggle && (
          <TouchableOpacity onPress={onToggleVisible} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.secondaryText}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ChangeCredentialsScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const { user, session } = useAuth();

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ── Password update ──────────────────────────────────────────────────────

  const handlePasswordUpdate = async () => {
    if (!newPassword) return Alert.alert('Required', 'Please enter a new password.');
    if (newPassword.length < 8) return Alert.alert('Too short', 'Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Mismatch', 'New passwords do not match.');

    setPasswordLoading(true);
    try {
      if (!session) {
        Alert.alert('Session expired', 'Please log out and log back in, then try again.');
        return;
      }

      const accessToken = session.access_token;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.message ?? json?.msg ?? 'Failed to update password.');

      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Your password has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Change Password</Text>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
                <Field
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 8 characters"
                  secureTextEntry
                  showToggle
                  visible={showNew}
                  onToggleVisible={() => setShowNew((v) => !v)}
                  theme={theme}
                  isDarkMode={isDarkMode}
                />
                <Field
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat new password"
                  secureTextEntry
                  showToggle
                  visible={showConfirm}
                  onToggleVisible={() => setShowConfirm((v) => !v)}
                  theme={theme}
                  isDarkMode={isDarkMode}
                />

                {/* Strength indicator */}
                {newPassword.length > 0 && (
                  <View style={styles.strengthWrap}>
                    {[1, 2, 3, 4].map((i) => {
                      const strength =
                        (newPassword.length >= 8 ? 1 : 0) +
                        (/[A-Z]/.test(newPassword) ? 1 : 0) +
                        (/[0-9]/.test(newPassword) ? 1 : 0) +
                        (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0);
                      const colors = ['#FF3B30', '#FF9500', '#34C759', '#007AFF'];
                      return (
                        <View
                          key={i}
                          style={[
                            styles.strengthBar,
                            { backgroundColor: i <= strength ? colors[strength - 1] : (isDarkMode ? '#3A3A3C' : '#E5E5EA') },
                          ]}
                        />
                      );
                    })}
                    <Text style={[styles.strengthLabel, { color: theme.secondaryText }]}>
                      {newPassword.length < 8
                        ? 'Too short'
                        : !(/[A-Z]/.test(newPassword) || /[0-9]/.test(newPassword))
                        ? 'Weak'
                        : /[^A-Za-z0-9]/.test(newPassword)
                        ? 'Strong'
                        : 'Good'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.accent }, passwordLoading && styles.buttonDisabled]}
                  onPress={handlePasswordUpdate}
                  disabled={passwordLoading}
                  activeOpacity={0.8}
                >
                  {passwordLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Update Password</Text>
                  )}
                </TouchableOpacity>
              </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  content: { padding: 20, gap: 0 },
  section: { gap: 16 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', marginLeft: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  input: { flex: 1, fontSize: 16 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: -4 },
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, minWidth: 50 },
});
