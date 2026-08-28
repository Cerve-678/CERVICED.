import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';

const SECTIONS = [
  {
    heading: '1. Acceptance of Terms',
    body: 'By accessing or using the Cerviced app, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the app.',
  },
  {
    heading: '2. Use of the Platform',
    body: 'Cerviced connects clients with independent beauty professionals. We do not employ providers and are not responsible for the services they deliver. All bookings are agreements between you and the provider.',
  },
  {
    heading: '3. Account Responsibility',
    body: 'You are responsible for maintaining the security of your account and all activity under it. Please notify us immediately of any unauthorised access.',
  },
  {
    heading: '4. Cancellations & Refunds',
    body: 'Cancellation and refund policies are set by individual providers. Please review each provider\'s policy before booking. Cerviced is not liable for disputes arising from cancellations.',
  },
  {
    heading: '5. Deposits & Remaining Balances',
    body: 'Some providers accept a deposit through the app instead of full payment. Any remaining balance is owed directly to the provider and is settled between you and the provider in person — Cerviced does not collect, hold, verify, or guarantee payment of that balance, and is not responsible for resolving disputes about whether or how much was paid at the appointment.',
  },
  {
    heading: '6. Prohibited Conduct',
    body: 'You agree not to misuse the platform, post false reviews, or engage in fraudulent activity. Violations may result in account suspension.',
  },
  {
    heading: '7. Intellectual Property',
    body: 'All content, logos, and branding on Cerviced are owned by or licensed to Cerviced Ltd. You may not reproduce or distribute them without written permission.',
  },
  {
    heading: '8. Limitation of Liability',
    body: 'To the fullest extent permitted by law, Cerviced is not liable for indirect, incidental, or consequential damages arising from your use of the platform.',
  },
  {
    heading: '9. Changes to Terms',
    body: 'We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.',
  },
  {
    heading: '10. Contact',
    body: 'For questions about these terms, contact us at legal@cerviced.app.',
  },
];

export default function TermsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Terms & Conditions</Text>
        <Text style={[styles.updated, { color: P.sub }]}>Last updated: July 2026</Text>

        {SECTIONS.map(s => (
          <View key={s.heading} style={styles.section}>
            <Text style={[styles.heading, { color: P.text }]}>{s.heading}</Text>
            <Text style={[styles.body, { color: P.sub }]}>{s.body}</Text>
          </View>
        ))}

        <Text style={[styles.footer, { color: P.sub }]}>© 2026 Cerviced Ltd. All rights reserved.</Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 4 },
  updated: { fontSize: 12, marginBottom: 28 },
  section: { marginBottom: 22 },
  heading: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.5, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
