import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { updateCurrentPassword, invokeSendAccountEmail } from '../../services/databaseService';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { validatePassword } from '../../utils/validation';
import { logger } from '../../utils/logger';
import { useAppDialog } from '../../components/AppDialog';
import { toUserMessage, SAME_PASSWORD_MESSAGE } from '../../utils/userFacingError';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

export default function ChangePasswordScreen({ navigation }: any) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirmField, setShowConfirmField] = useState(false);

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
      showAlert(tr('shared.changePassword.missingFields.title'), tr('shared.changePassword.missingFields.body'), 'center');
      return;
    }
    if (next !== confirm) {
      showAlert(tr('shared.changePassword.mismatch.title'), tr('shared.changePassword.mismatch.body'), 'center');
      return;
    }
    const passwordError = validatePassword(next);
    if (passwordError) {
      showAlert(tr('shared.changePassword.weak.title'), passwordError, 'center');
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await updateCurrentPassword(next);
    } catch (e) {
      const message = toUserMessage(e, "Couldn't update your password. Please try again.", 'ChangePasswordScreen.updateCurrentPassword');
      // Rejecting a no-op (new password same as the current one) isn't really
      // a failure, so "Error" reads wrong as the title for it specifically.
      const title = message === SAME_PASSWORD_MESSAGE ? 'Please try again' : 'Error';
      showAlert(title, message, 'center');
      return;
    } finally {
      setLoading(false);
    }
    {
      // Non-blocking, logged rather than swallowed — a failed notification
      // shouldn't stop the user from seeing their password actually changed.
      invokeSendAccountEmail('password_changed').catch((e) => {
        logger.error('[email] password-changed email failed to send:', e);
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showConfirm(tr('common.done'), tr('shared.changePassword.updated'), [
        { text: tr('common.ok'), onPress: () => navigation.goBack() },
      ], 'center');
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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

          <Text style={[styles.title, { color: P.text }]}>{tr('profile.account.password.title')}</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>{tr('shared.changePassword.subtitle')}</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>{tr('shared.changePassword.newLabel')}</Text>
            <View style={rowStyle}>
              <TextInput
                style={inputStyle}
                value={next}
                onChangeText={setNext}
                placeholder={tr('shared.changePassword.newPlaceholder')}
                placeholderTextColor={P.sub}
                secureTextEntry={!showNext}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowNext(v => !v); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: P.sub }]}>{showNext ? tr('shared.password.hide') : tr('shared.password.show')}</Text>
              </TouchableOpacity>
            </View>
            {next.length > 0 && (
              <PasswordRequirements password={next} goodColor={P.accent} pendingColor={P.sub} />
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: P.sub }]}>{tr('shared.changePassword.confirmLabel')}</Text>
            <View style={rowStyle}>
              <TextInput
                style={inputStyle}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={tr('shared.changePassword.confirmPlaceholder')}
                placeholderTextColor={P.sub}
                secureTextEntry={!showConfirmField}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowConfirmField(v => !v); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: P.sub }]}>{showConfirmField ? tr('shared.password.hide') : tr('shared.password.show')}</Text>
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
              : <Text style={[styles.saveBtnText, { color: P.onAccent }]}>{tr('shared.changePassword.submit')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardDismissView>
      <DialogHost />
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
