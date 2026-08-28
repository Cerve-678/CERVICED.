import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Constants from 'expo-constants';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { ThemedBackground } from '../../components/ThemedBackground';
import { invokeSendSupportRequest } from '../../services/databaseService';
import { SUPPORT_EMAIL } from '../../constants/support';
import { toUserMessage } from '../../utils/userFacingError';

const CATEGORIES = ['Bug / Crash', 'Booking Issue', 'Provider Issue', 'Payment', 'Account', 'Other'];

export default function ReportProblemScreen({ navigation }: any) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { activeMode } = useAuth();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!category) { Alert.alert('Select a category'); return; }
    if (!description.trim()) { Alert.alert('Please describe the issue'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { ticketNumber } = await invokeSendSupportRequest({
        category,
        description: description.trim(),
        platform: `${Platform.OS} ${String(Platform.Version)}`,
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        activeMode,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // The reference is the point of storing the report: it gives them
      // something to quote back at us. Deliberately not conditional on the
      // email having gone out — the report is saved either way.
      Alert.alert(
        'Report Sent',
        `Thank you — we'll look into this and get back to you if needed.\n\nYour reference is #${ticketNumber}.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // Never say it sent when it didn't — hand them the address instead, so a
      // report isn't simply lost because the send failed.
      Alert.alert(
        "Couldn't send your report",
        `${toUserMessage(e, 'Please try again in a moment.', 'ReportProblemScreen.handleSubmit')}\n\nYou can also email us at ${SUPPORT_EMAIL}.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const chipActive = (val: string) => val === category;

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
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

          <Text style={[styles.title, { color: P.text }]}>Report a Problem</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>
            Tell us what went wrong and we'll fix it
          </Text>

          <Text style={[styles.label, { color: P.sub }]}>CATEGORY</Text>
          <View style={styles.chips}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.chip,
                  {
                    backgroundColor: chipActive(cat) ? P.accent : P.accentDim,
                    borderColor: chipActive(cat) ? P.accent : P.border,
                  },
                ]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setCategory(cat); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: chipActive(cat) ? '#fff' : P.sub }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: P.sub, marginTop: 8 }]}>DESCRIPTION</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                color: P.text,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what happened..."
            placeholderTextColor={P.sub}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitBtn, {
              backgroundColor: P.accent,
              borderColor: 'transparent',
            }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.submitText, { color: '#fff' }]}>SEND REPORT</Text>
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
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  label: { fontSize: 11, letterSpacing: 1, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  chip: { borderRadius: 100, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16 },
  chipText: { fontSize: 12, letterSpacing: 0.5 },
  textArea: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    
    minHeight: 130,
    marginBottom: 24,
  },
  submitBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  submitText: { fontSize: 15, letterSpacing: 1 },
});
