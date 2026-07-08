import React, { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import Icon from '../components/IconLibrary';

const FAQS = [
  {
    q: 'How do I book an appointment?',
    a: "Browse providers on the Explore tab, tap a provider, then select a service and available time slot. You'll receive a confirmation notification.",
  },
  {
    q: 'Can I reschedule or cancel?',
    a: "Yes. Go to Bookings, tap your appointment, and choose Reschedule or Cancel. Cancellations may be subject to the provider's policy.",
  },
  {
    q: 'How does Becca work?',
    a: 'Becca is your AI beauty assistant. Ask her anything — she can recommend providers, explain services, and help you find the right look.',
  },
  {
    q: 'How do I earn points?',
    a: 'You earn points by completing bookings, leaving reviews, referring friends, and on your first booking. Points can be redeemed for discounts.',
  },
  {
    q: 'Is my payment info secure?',
    a: 'All payment data is encrypted end-to-end. We never store full card numbers — payments are processed via PCI-DSS compliant providers.',
  },
];

function FAQItem({ q, a, theme }: { q: string; a: string; theme: any }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.faqItem, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }}
      activeOpacity={0.8}
    >
      <View style={styles.faqHeader}>
        <Text style={[styles.faqQ, { color: theme.text }]}>{q}</Text>
        <Icon name={open ? 'expand-less' : 'expand-more'} size={20} color={theme.secondaryText} />
      </View>
      {open && <Text style={[styles.faqA, { color: theme.secondaryText }]}>{a}</Text>}
    </TouchableOpacity>
  );
}

function handleContactSupport() {
  Haptics.selectionAsync().catch(() => {});
  Linking.openURL('mailto:support@cerviced.app');
}

function showMoreOptions() {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Contact Support', 'Cancel'], cancelButtonIndex: 1 },
      (idx) => { if (idx === 0) handleContactSupport(); },
    );
  } else {
    Alert.alert('More Options', undefined, [
      { text: 'Contact Support', onPress: handleContactSupport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

export default function HelpCentreScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={showMoreOptions}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Help Centre</Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          Answers to common questions
        </Text>

        <Text style={[styles.section, { color: theme.accent }]}>FAQS</Text>
        {FAQS.map(item => (
          <FAQItem key={item.q} q={item.q} a={item.a} theme={theme} />
        ))}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: {},
  backArrow: { fontSize: 22, fontWeight: '900' },
  moreBtn: { padding: 4 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  section: { fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  faqItem: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 10,
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqQ: { fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 8 },
  faqA: { fontSize: 13, lineHeight: 19, marginTop: 10 },
});
