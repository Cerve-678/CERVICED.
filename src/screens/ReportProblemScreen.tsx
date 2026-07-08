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

const CATEGORIES = ['Bug / Crash', 'Booking Issue', 'Provider Issue', 'Payment', 'Account', 'Other'];

export default function ReportProblemScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!category) { Alert.alert('Select a category'); return; }
    if (!description.trim()) { Alert.alert('Please describe the issue'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Report Sent', 'Thank you — we\'ll look into this and get back to you if needed.', [
      { text: 'Done', onPress: () => navigation.goBack() },
    ]);
  };

  const chipActive = (val: string) => val === category;

  return (
    <View style={[styles.bg, { backgroundColor: isDarkMode ? '#1A1815' : '#F5F1EC' }]}>
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

          <Text style={[styles.title, { color: theme.text }]}>Report a Problem</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            Tell us what went wrong and we'll fix it
          </Text>

          <Text style={[styles.label, { color: theme.secondaryText }]}>CATEGORY</Text>
          <View style={styles.chips}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.chip,
                  {
                    backgroundColor: chipActive(cat)
                      ? '#AF9197'
                      : (isDarkMode ? 'rgba(175,145,151,0.08)' : 'rgba(175,145,151,0.06)'),
                    borderColor: chipActive(cat) ? '#AF9197' : theme.border,
                  },
                ]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setCategory(cat); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: chipActive(cat) ? '#fff' : theme.secondaryText }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.secondaryText, marginTop: 8 }]}>DESCRIPTION</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                color: theme.text,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what happened..."
            placeholderTextColor={theme.secondaryText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitBtn, {
              backgroundColor: '#AF9197',
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
      </KeyboardAvoidingView>
    </View>
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
