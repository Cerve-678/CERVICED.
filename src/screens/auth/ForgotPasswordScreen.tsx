// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import * as Haptics from 'expo-haptics';
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
import { useTheme } from '../../contexts/ThemeContext';
import { sendPasswordReset } from '../../services/databaseService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { Ionicons } from '@expo/vector-icons';
import { FieldRow, FormCard, ScreenTitle, useFieldInputStyle } from '../../components/signup/FormKit';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { BOTTOM_SAFE_GAP } from '../../utils/bottomSafeGap';
import { toUserMessage } from '../../utils/userFacingError';

type Props = StackScreenProps<RootStackParamList, 'ForgotPassword'>;


export default function ForgotPasswordScreen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
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
    try {
      await sendPasswordReset(trimmed);
      navigation.navigate('ResetPasswordOTP', { email: trimmed });
    } catch (error) {
      Alert.alert('Could not send reset code', toUserMessage(
        error,
        "We couldn't send a reset email. Please check your email address and try again.",
        'ForgotPasswordScreen.sendPasswordReset',
      ));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = useFieldInputStyle();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <KeyboardDismissView>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: BOTTOM_SAFE_GAP }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={20} color={t.text} />
            </TouchableOpacity>

            <View style={[styles.iconTile, { backgroundColor: t.accentDim }]}>
              <Ionicons name="key-outline" size={28} color={t.accentText} />
            </View>
            <ScreenTitle title="Forgot password?" subtitle="Enter your email and we'll send you a code to reset your password." />

            <FormCard>
              <FieldRow label="EMAIL">
                <TextInput
                  style={inputStyle} value={email} onChangeText={setEmail}
                  placeholder="sarah@example.com" placeholderTextColor={t.sub}
                  keyboardType="email-address" autoCapitalize="none" autoFocus textContentType="emailAddress"
                  returnKeyType="send" onSubmitEditing={handleSend}
                />
              </FieldRow>
            </FormCard>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: t.accent }]}
              onPress={handleSend}
              activeOpacity={0.75}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.primaryBtnText, { color: t.onAccent }]}>SEND RESET CODE</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()} activeOpacity={0.6}>
              <Text style={[styles.backLinkText, { color: t.sub }]}>Back to log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  iconTile: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  primaryBtn: { minHeight: 56, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  primaryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
  backLink: { alignSelf: 'center', paddingVertical: 14 },
  backLinkText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
