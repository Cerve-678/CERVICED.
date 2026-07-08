import React, { useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';

export default function ChangePasswordScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    },
  ];

  const handleSave = async () => {
    if (!next.trim() || !confirm.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) {
      Alert.alert('Error', 'Couldn\'t update your password. Please try again.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Done', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: theme.text }]}>Change Password</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>Update your account credentials</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.secondaryText }]}>NEW PASSWORD</Text>
            <TextInput
              style={inputStyle}
              value={next}
              onChangeText={setNext}
              placeholder="Min. 8 characters"
              placeholderTextColor={theme.secondaryText}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.secondaryText }]}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              style={inputStyle}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter new password"
              placeholderTextColor={theme.secondaryText}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: '#AF9197' }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>UPDATE PASSWORD</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 32, lineHeight: 20 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    
  },
  saveBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: 1, color: '#fff' },
});
