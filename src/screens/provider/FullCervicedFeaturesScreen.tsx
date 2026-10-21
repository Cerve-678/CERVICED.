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

const SECTIONS: { title: string; features: Feature[] }[] = [
  {
    title: 'Bookings',
    features: [
      { icon: 'calendar-outline', title: 'Clients book in the app', body: 'Your diary, booking requests and confirmations all in one place, with your opening hours and availability shown live.' },
      { icon: 'swap-horizontal-outline', title: 'Reschedules and cancellations', body: 'Clients reschedule and cancel in the app, within your reschedule limits, and your cancellation policy decides what they get back.' },
      { icon: 'people-outline', title: 'A waitlist', body: 'When you\'re full, clients can join your waitlist and get offered a slot when one opens.' },
    ],
  },
  {
    title: 'Getting paid',
    features: [
      { icon: 'card-outline', title: 'Card, Apple Pay, Google Pay and PayPal', body: 'Clients pay when they book and the money is paid out to your bank through Stripe, on the timing you choose.' },
      { icon: 'lock-closed-outline', title: 'Deposits', body: 'Take a deposit to secure a booking instead of the full price.' },
      { icon: 'alarm-outline', title: 'Late and no-show fees', body: 'Charge a fee when a client is very late or doesn\'t turn up.' },
      { icon: 'heart-outline', title: 'Tips', body: 'Clients can tip you in the app after their appointment.' },
    ],
  },
  {
    title: 'Being found',
    features: [
      { icon: 'pricetags-outline', title: 'Your price list on your profile', body: 'Clients see your services and prices before they book.' },
      { icon: 'star-outline', title: 'Star ratings and reviews', body: 'Clients can rate you after their appointment, and good reviews help you stand out.' },
      { icon: 'search-outline', title: 'More of Search', body: 'Show up when clients filter by price, availability, rating or hair type. Right now you only appear by category, speciality, area and accessibility.' },
      { icon: 'gift-outline', title: 'Offers and promo codes', body: 'Run offers and give clients codes to use at checkout.' },
    ],
  },
  {
    title: 'Looking after clients',
    features: [
      { icon: 'document-text-outline', title: 'Info packs and consultation forms', body: 'Send aftercare and prep info, and collect consultation answers before the appointment.' },
      { icon: 'albums-outline', title: 'Your client list', body: 'Every client\'s bookings and notes in one place.' },
      { icon: 'notifications-outline', title: 'Reminders and automations', body: 'Appointment reminders, aftercare check-ins and birthday greetings go out for you.' },
      { icon: 'stats-chart-outline', title: 'Booking and earnings analytics', body: 'See your bookings and earnings, not just profile views and Book taps.' },
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
      <StatusBar barStyle={theme.statusBar} translucent />
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
