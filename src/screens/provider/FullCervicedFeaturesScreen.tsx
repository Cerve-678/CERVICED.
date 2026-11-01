/**
 * What a link-only provider (booking_mode 'external') would get if they took
 * bookings through CERVICED instead of their own booking page. Opened from the
 * card on their Home and the row in their Profile tab.
 *
 * Information only, by product decision (2026-10-21): no switch button and no
 * prices, because nothing paid is built yet and switching isn't available in
 * the app. Every item here must be something full providers actually have
 * today — check the code before adding one, and remove one that goes away.
 */
import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IconName; title: string; body: string };

// Ordered by what other booking apps are least likely to have (user,
// 2026-10-21): the client-knowledge and growth tools lead, the booking and
// payment basics come last. In-app chat is NOT listed: link-only pros
// already have Messages.
const SECTIONS: { title: string; features: Feature[] }[] = [
  {
    title: 'Know every client',
    features: [
      { icon: 'sparkles-outline', title: 'Client beauty profiles', body: 'Before each appointment, see the client\'s hair, skin and preferences for that treatment, with allergies and medical notes flagged.' },
      { icon: 'document-text-outline', title: 'Info packs and consultation forms', body: 'Send prep and aftercare info with each booking, and get consultation answers back before the client arrives.' },
      { icon: 'albums-outline', title: 'Your client list', body: 'Every client\'s bookings, history and notes in one place.' },
    ],
  },
  {
    title: 'Grow your business',
    features: [
      { icon: 'megaphone-outline', title: 'Announcements', body: 'Message all your clients, or just the ones you pick, straight away or scheduled for later.' },
      { icon: 'gift-outline', title: 'Promotions and promo codes', body: 'Run offers and give clients codes to use at checkout.' },
      { icon: 'calendar-number-outline', title: 'Release-day alerts', body: 'Pick a day each month and clients who follow you get a reminder to book.' },
      { icon: 'stats-chart-outline', title: 'Full analytics', body: 'Your bookings and earnings over time, not just profile views and Book taps.' },
    ],
  },
  {
    title: 'Runs itself',
    features: [
      { icon: 'notifications-outline', title: 'Reminders and check-ins', body: 'Appointment reminders, review requests, aftercare check-ins and birthday greetings go out for you.' },
      { icon: 'sunny-outline', title: 'Daily booking recap', body: 'Start each morning with a summary of your day.' },
      { icon: 'checkmark-done-outline', title: 'Auto-confirm and waitlist', body: 'Confirm bookings automatically, and when you\'re full, offer freed-up slots to your waitlist without lifting a finger.' },
    ],
  },
  {
    title: 'Bookings and payments',
    features: [
      { icon: 'calendar-outline', title: 'Clients book in the app', body: 'Your diary, requests and confirmations in one place, with reschedules and cancellations handled under your own policy.' },
      { icon: 'card-outline', title: 'Card, Apple Pay, Google Pay and PayPal', body: 'Paid out to your bank through Stripe, on the timing you choose. Take deposits, late and no-show fees, and tips.' },
      { icon: 'star-outline', title: 'Price list, ratings and reviews', body: 'Clients see your prices and reviews before they book.' },
      { icon: 'search-outline', title: 'More of Search', body: 'Show up when clients filter by price, availability, rating or hair type. Right now you only appear by category, speciality, area and accessibility.' },
    ],
  },
];

export default function FullCervicedFeaturesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);

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

        <Text style={styles.title}>What full CERVICED adds</Text>
        <Text style={styles.subtitle}>
          Right now clients find you here and book on your own page. Providers who take bookings through CERVICED also get all of this.
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

        <Text style={styles.footnote}>
          Switching to bookings through CERVICED isn't available in the app yet. Everything you have now stays as it is.
        </Text>
      </ScrollView>
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
    footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, color: P.sub, textAlign: 'center', marginTop: 4, paddingHorizontal: 12 },
  });
