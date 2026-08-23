import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { updateCurrentPassword } from '../../services/databaseService';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { validatePassword } from '../../utils/validation';

export default function ChangePasswordScreen({ navigation }: any) {
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const rowStyle = [
    styles.inputRow,
    {
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    },
  ];
  const inputStyle = [styles.inputWithEye, { color: P.text }];

  const handleSave = async () => {
    if (!next.trim() || !confirm.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    const passwordError = validatePassword(next);
    if (passwordError) {
      Alert.alert('Weak password', passwordError);
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await updateCurrentPassword(next);
    } catch {
      Alert.alert('Error', 'Couldn\'t update your password. Please try again.');
      return;
    } finally {
      setLoading(false);
    }
    {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Done', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardDismissView style={{ flex: 1 }}>
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
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: P.text }]}>Change Password</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>Update your account credentials</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>NEW PASSWORD</Text>
            <View style={rowStyle}>
              <TextInput
                style={inputStyle}
                value={next}
                onChangeText={setNext}
                placeholder="Min. 8 characters"
                placeholderTextColor={P.sub}
                secureTextEntry={!showNext}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowNext(v => !v); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: P.sub }]}>{showNext ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {next.length > 0 && (
              <PasswordRequirements password={next} goodColor={P.accent} pendingColor={P.sub} />
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>CONFIRM NEW PASSWORD</Text>
            <View style={rowStyle}>
              <TextInput
                style={inputStyle}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter new password"
                placeholderTextColor={P.sub}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowConfirm(v => !v); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: P.sub }]}>{showConfirm ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: P.accent }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={P.onAccent} />
              : <Text style={[styles.saveBtnText, { color: P.onAccent }]}>UPDATE PASSWORD</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardDismissView>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  inputWithEye: { flex: 1, paddingVertical: 14, fontSize: 15 },
  eyeBtn: { paddingLeft: 8 },
  eyeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600' },
  saveBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
