/**
 * What a link-only provider (booking_mode 'external') would get if they took
 * bookings through CERVICED instead of their own booking page. Opened from the
 * card on their Home and the row in their Profile tab.
 *
 * Concept A, "You keep every penny" (product owner, 2026-11-03,
 * https://claude.ai/artifact/CGxJoPPhJ66jNjUvSRkjPm): it leads with money,
 * because full providers pay CERVICED nothing on bookings: the client pays the
 * platform fee on top (docs/PAYMENTS_AND_LOGIC.md §1.2). If that ever changes,
 * this page changes in the same PR. The example receipt uses the real fee
 * function, so it can't drift from checkout. Card fees are deliberately not
 * mentioned (product owner, 2026-11-03).
 *
 * Ends with the "Become a full member" button (product decision 2026-11-02,
 * replacing the 2026-10-21 "information only" rule), which opens the same
 * confirm sheet as Home. Every item here must be something full providers
 * actually have today — check the code before adding one, and remove one that
 * goes away.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';
import { BecomeFullMemberSheet } from '../../features/providers/BecomeFullMemberSheet';
import { FULL_MEMBER_FREE_LINE, FULL_MEMBER_PRICE_LINE } from '../../constants/fullMembership';
import { calculatePlatformFeePence } from '../../features/cart/platformFee';
import { PAYOUT_HOLD_DAY_OPTIONS } from '../../constants/payoutTiming';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IconName; title: string; body: string };

// The receipt's example booking. Only the price is made up; the fee comes
// from the same function checkout uses.
const EXAMPLE_PRICE_PENCE = 6000;
const EXAMPLE_FEE_PENCE = calculatePlatformFeePence(EXAMPLE_PRICE_PENCE);
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
// The shortest payout hold a provider can pick, in hours.
const FASTEST_PAYOUT_HOURS = PAYOUT_HOLD_DAY_OPTIONS[0] * 24;

// In-app chat and Becca are NOT listed: link-only pros already have both.
const SECTIONS: { title: string; features: Feature[] }[] = [
  {
    title: 'Your diary fills itself',
    features: [
      { icon: 'notifications-outline', title: 'Followers hear when you\'re free', body: 'When you\'ve been fully booked and space opens up, everyone who rang your bell gets told.' },
      { icon: 'refresh-outline', title: 'Clients reminded to rebook you', body: 'After each visit we remind them when they\'re due, with a Rebook button straight back to you.' },
      { icon: 'people-outline', title: 'Cancellations refill', body: 'Turn your waitlist on and a cancelled slot goes to it first.' },
      { icon: 'megaphone-outline', title: 'Announcements', body: 'Message all your clients, or just repeat, new or lapsed ones, straight away or scheduled for later.' },
    ],
  },
  {
    title: 'More clients find you',
    features: [
      { icon: 'search-outline', title: 'Every Search filter', body: 'Price, availability, rating and hair type, not just category, speciality and area.' },
      { icon: 'flash-outline', title: 'Available this week', body: 'Show up on clients\' Home when you have space.' },
    ],
  },
  {
    title: 'Know your clients and your numbers',
    features: [
      { icon: 'sparkles-outline', title: 'Know them before they arrive', body: 'Their hair, skin and preferences for that treatment, with allergies and medical notes flagged.' },
      { icon: 'stats-chart-outline', title: 'Full analytics', body: 'Earnings over time, your top services, completions and no-shows, and ratings by service.' },
    ],
  },
];

// The basics every booking app has. Still true for full members, but not
// why anyone switches, so they sit in one quiet row at the end.
const OF_COURSE = [
  'Card, Apple Pay, Google Pay and PayPal',
  'Deposits',
  'Late and no-show fees',
  'Reviews',
  'Price list',
  'Reminders',
  'Promo codes',
  'Consultation forms',
  'Info packs',
  'Client list',
  'Auto-confirm',
];

export default function FullCervicedFeaturesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const [showSheet, setShowSheet] = useState(false);

  return (
    <ThemedBackground style={styles.flex}>
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backArrow}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={styles.kicker}>FULL CERVICED</Text>
        <Text style={styles.title}>You keep every penny</Text>

        <View style={styles.hero}>
          <View style={styles.heroHalo} pointerEvents="none" />
          <Text style={[styles.kicker, styles.onAccentSoft]}>OF EVERY BOOKING, YOU KEEP</Text>
          <Text style={styles.heroNum}>100%</Text>
          <Text style={styles.heroSub}>No commission. Tips reach you whole.</Text>
          <View style={styles.receipt} accessibilityLabel={`For example, the client pays ${pounds(EXAMPLE_PRICE_PENCE + EXAMPLE_FEE_PENCE)}, including our ${pounds(EXAMPLE_FEE_PENCE)} fee, and you get ${pounds(EXAMPLE_PRICE_PENCE)}`}>
            <Text style={styles.receiptEg}>EXAMPLE</Text>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptText}>Client pays</Text>
              <Text style={styles.receiptText}>{pounds(EXAMPLE_PRICE_PENCE + EXAMPLE_FEE_PENCE)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptText, styles.flex]}>CERVICED fee, paid by the client</Text>
              <Text style={styles.receiptText}>{pounds(EXAMPLE_FEE_PENCE)}</Text>
            </View>
            <View style={[styles.receiptRow, styles.receiptTotal]}>
              <Text style={[styles.receiptText, styles.bold]}>You get</Text>
              <Text style={[styles.receiptText, styles.bold]}>{pounds(EXAMPLE_PRICE_PENCE)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.stubs}>
          <View style={styles.stub}>
            <Text style={styles.stubNum}>{FASTEST_PAYOUT_HOURS}h</Text>
            <Text style={styles.stubLabel}>fastest payout, you pick</Text>
          </View>
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            <View style={styles.card}>
              {section.features.map((feature, index) => (
                <View key={feature.title} style={[styles.row, index > 0 && styles.rowDivider]}>
                  <View style={styles.icon}>
                    <Ionicons name={feature.icon} size={18} color={P.accent} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{feature.title}</Text>
                    <Text style={styles.rowBody}>{feature.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AND OF COURSE</Text>
          <View style={styles.chips}>
            {OF_COURSE.map(item => (
              <View key={item} style={styles.chip}>
                <Text style={styles.chipText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.primary}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowSheet(true); }}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Become a full member</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>{FULL_MEMBER_FREE_LINE}. {FULL_MEMBER_PRICE_LINE}.</Text>
      </ScrollView>
      <BecomeFullMemberSheet visible={showSheet} onClose={() => setShowSheet(false)} />
    </ThemedBackground>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    bold: { fontWeight: '700' },
    scroll: { paddingHorizontal: 16 },
    backBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 20 },
    backArrow: { fontSize: 22, fontWeight: '900', color: P.text },
    kicker: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.6, color: P.sub },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, lineHeight: 33, color: P.text, marginTop: 2, marginBottom: 16 },
    hero: {
      backgroundColor: P.accent, borderRadius: 26, padding: 20, overflow: 'hidden', marginBottom: 10,
      shadowColor: '#26201E', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6,
    },
    heroHalo: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 18, borderColor: 'rgba(255,255,255,0.10)', top: -70, right: -60 },
    onAccentSoft: { color: P.onAccent, opacity: 0.8 },
    heroNum: { fontFamily: 'BakbakOne-Regular', fontSize: 64, lineHeight: 70, color: P.onAccent, marginTop: 4 },
    heroSub: { fontSize: 14, lineHeight: 20, color: P.onAccent, opacity: 0.92 },
    receipt: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
    receiptEg: { fontSize: 10, letterSpacing: 1, color: P.onAccent, opacity: 0.75 },
    receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    receiptTotal: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: P.onAccent, paddingTop: 6 },
    receiptText: { fontSize: 13, color: P.onAccent, fontVariant: ['tabular-nums'] },
    stubs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    stub: { flex: 1, backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.border, paddingVertical: 10, paddingHorizontal: 12 },
    stubNum: { fontFamily: 'BakbakOne-Regular', fontSize: 22, color: P.text },
    stubLabel: { fontSize: 11, color: P.sub, marginTop: 1 },
    section: { marginBottom: 18 },
    sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, color: P.sub, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, paddingHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border },
    icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 15, fontWeight: '700', color: P.text },
    rowBody: { fontSize: 13, lineHeight: 18, color: P.sub, marginTop: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 100, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { fontSize: 12, color: P.sub },
    primary: { height: 52, borderRadius: 100, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 16, color: P.onAccent },
    footnote: { fontSize: 12, lineHeight: 17, color: P.sub, textAlign: 'center', marginTop: 10, paddingHorizontal: 12 },
  });
