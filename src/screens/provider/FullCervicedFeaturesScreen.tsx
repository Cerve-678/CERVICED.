/**
 * What a link-only provider (booking_mode 'external') would get if they took
 * bookings through CERVICED instead of their own booking page. Opened from the
 * card on their Home and the row in their Profile tab.
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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IconName; title: string; body: string };

// Leads with what a booking site can't do (product owner, 2026-11-03: "remove
// basic things other apps offer"). Everything here only works because the
// booking happens in CERVICED: the beauty profile is shared at booking, a
// completed booking starts the client's Beauty Maintenance reminder, the
// waitlist and Available this week read the real diary. In-app chat and
// Becca are NOT listed: link-only pros already have both.
const SECTIONS: { title: string; features: Feature[] }[] = [
  {
    title: 'Know them before they sit down',
    features: [
      { icon: 'sparkles-outline', title: 'Client beauty profiles', body: 'Before every appointment, see the client\'s hair, skin and what they like for that treatment, with allergies and medical notes flagged.' },
    ],
  },
  {
    title: 'Clients come back on their own',
    features: [
      { icon: 'refresh-outline', title: 'Beauty Maintenance', body: 'After each appointment with you, CERVICED keeps track of when the client is due again and reminds them, with a Rebook button that comes straight back to you.' },
      { icon: 'people-outline', title: 'A waitlist that fills your gaps', body: 'Turn your waitlist on and when someone cancels, the slot goes to it first, without you lifting a finger.' },
      { icon: 'calendar-number-outline', title: 'Release-day alerts', body: 'Pick a day each month and everyone who follows you gets a reminder to book.' },
    ],
  },
  {
    title: 'Get found by more clients',
    features: [
      { icon: 'search-outline', title: 'Every Search filter', body: 'Show up when clients filter by price, availability, rating or hair type. Right now you only appear by category, speciality, area and accessibility.' },
      { icon: 'flash-outline', title: 'Available this week', body: 'When you have space, you can appear on clients\' Home in Available this week.' },
      { icon: 'layers-outline', title: 'Booked alongside other pros', body: 'Clients can book you and another pro, like hair then nails, in one checkout.' },
    ],
  },
  {
    title: 'Celebrate the wins',
    features: [
      { icon: 'ribbon-outline', title: 'Your Fully Booked certificate', body: 'Fill a whole month and CERVICED celebrates it with you, plus milestones for bookings, five-star reviews, tips and returning clients.' },
    ],
  },
];

// The basics every booking app has. Still true for full members, but not
// why anyone switches, so they sit in one quiet line at the end.
const OF_COURSE = [
  'Bookings in the app',
  'Your diary',
  'Card, Apple Pay, Google Pay and PayPal',
  'Payouts through Stripe',
  'Deposits',
  'Late and no-show fees',
  'Tips',
  'Reminders',
  'Price list',
  'Reviews',
  'Promo codes',
  'Announcements',
  'Consultation forms',
  'Info packs',
  'Client list',
  'Auto-confirm',
  'Full analytics',
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

        <Text style={styles.title}>What your booking site can't do</Text>
        <Text style={styles.subtitle}>
          Take your bookings through CERVICED and you get all of this, on top of everything you have now.
        </Text>

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
    scroll: { paddingHorizontal: 16 },
    backBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 20 },
    backArrow: { fontSize: 22, fontWeight: '900', color: P.text },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 26, lineHeight: 31, color: P.text },
    subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.sub, marginTop: 6, marginBottom: 20 },
    section: { marginBottom: 18 },
    sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, color: P.sub, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, paddingHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border },
    icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.text },
    rowBody: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18, color: P.sub, marginTop: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 100, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub },
    primary: { height: 52, borderRadius: 100, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 16, color: P.onAccent },
    footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, color: P.sub, textAlign: 'center', marginTop: 10, paddingHorizontal: 12 },
  });
