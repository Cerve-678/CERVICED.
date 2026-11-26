/**
 * What a link-only provider (booking_mode 'external') would get if they took
 * bookings through CERVICED instead of their own booking page. Opened from the
 * card on their Home and the row in their Profile tab.
 *
 * Concept A, "You keep every penny" (product owner, 2026-11-03,
 * https://claude.ai/artifact/CGxJoPPhJ66jNjUvSRkjPm): it leads with money,
 * because full providers pay CERVICED nothing on bookings: the client pays the
 * platform fee on top (docs/PAYMENTS_AND_LOGIC.md §1.2). If that ever changes,
 * this page changes in the same PR. The CERVICED fee itself and card fees are
 * deliberately not shown (product owner, 2026-11-03). Opened from Home, so it
 * hides the bottom nav itself; from Settings the Settings rule already does.
 *
 * Ends with the "Become a full member" button (product decision 2026-11-02,
 * replacing the 2026-10-21 "information only" rule), which opens the same
 * confirm sheet as Home. Every item here must be something full providers
 * actually have today — check the code before adding one, and remove one that
 * goes away.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';
import { useHideTabBar } from '../../navigation/useHideTabBar';
import { BecomeFullMemberSheet } from '../../features/providers/BecomeFullMemberSheet';
import { FULL_MEMBER_FREE_LINE } from '../../constants/fullMembership';
import { PAYOUT_INTERVALS, payoutIntervalLabel } from '../../constants/payoutSchedule';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IconName; title: string; body: string };

// Every bank payout schedule a full provider can pick in Payments.
const PAYOUT_CHOICES = PAYOUT_INTERVALS.map(payoutIntervalLabel);

// In-app chat and Becca are NOT listed: link-only pros already have both.
const SECTIONS: { title: string; features: Feature[] }[] = [
  {
    get title() { return tr('providerBusiness.newp.yourDiaryFillsItself'); },
    features: [
      { icon: 'notifications-outline', get title() { return tr('providerBusiness.newp.followersHearWhenYouReFree'); }, get body() { return tr('providerBusiness.newp.whenYouVeBeenFullyBooked'); } },
      { icon: 'refresh-outline', get title() { return tr('providerBusiness.newp.clientsRemindedToRebookYou'); }, get body() { return tr('providerBusiness.newp.afterEachVisitWeRemindThem'); } },
      { icon: 'people-outline', get title() { return tr('providerBusiness.newp.cancellationsRefill'); }, get body() { return tr('providerBusiness.newp.turnYourWaitlistOnAndA'); } },
      { icon: 'megaphone-outline', get title() { return tr('providerBusiness.newp.announcements'); }, get body() { return tr('providerBusiness.newp.messageAllYourClientsOrJust'); } },
      { icon: 'pricetag-outline', get title() { return tr('providerBusiness.promotions.title'); }, get body() { return tr('providerBusiness.newp.runAFlashSaleALoyalty'); } },
    ],
  },
  {
    get title() { return tr('providerBusiness.newp.moreClientsFindYou'); },
    features: [
      { icon: 'search-outline', get title() { return tr('providerBusiness.newp.everySearchFilter'); }, get body() { return tr('providerBusiness.newp.priceAvailabilityRatingAndHairType'); } },
      { icon: 'flash-outline', get title() { return tr('providerBusiness.newp.availableThisWeek'); }, get body() { return tr('providerBusiness.newp.showUpOnClientsHomeWhen'); } },
    ],
  },
  {
    get title() { return tr('providerBusiness.newp.lookAfterEveryClient'); },
    features: [
      { icon: 'sparkles-outline', get title() { return tr('providerBusiness.newp.knowThemBeforeTheyArrive'); }, get body() { return tr('providerBusiness.newp.theirHairSkinAndPreferencesFor'); } },
      { icon: 'document-text-outline', get title() { return tr('providerProfile.myProfile.quick.infoPacks'); }, get body() { return tr('providerBusiness.newp.prepAndAftercareNotesForA'); } },
      { icon: 'alarm-outline', get title() { return tr('providerBusiness.newp.reminders'); }, get body() { return tr('providerBusiness.newp.clientsGetAReminderTheDay'); } },
    ],
  },
  {
    get title() { return tr('providerBusiness.newp.yourBrandAndYourNumbers'); },
    features: [
      { icon: 'color-palette-outline', get title() { return tr('providerBusiness.newp.allOfBranding'); }, get body() { return tr('providerBusiness.newp.everyColourSetFontAndHero'); } },
      { icon: 'ribbon-outline', get title() { return tr('providerBusiness.newp.achievements'); }, get body() { return tr('providerBusiness.newp.sealsForMilestonesLikeYourFirst'); } },
      { icon: 'stats-chart-outline', get title() { return tr('providerBusiness.newp.fullAnalytics'); }, get body() { return tr('providerBusiness.newp.earningsOverTimeYourTopServices'); } },
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
  'Consultation forms',
  'Client list',
  'Auto-confirm',
];

export default function FullCervicedFeaturesScreen() {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const [showSheet, setShowSheet] = useState(false);
  useHideTabBar();

  return (
    <ThemedBackground style={styles.flex}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={tr('common.back')}
        >
          <Text style={styles.backArrow}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={styles.kicker}>FULL CERVICED EXPERIENCE</Text>
        <Text style={styles.title}>You keep every penny</Text>

        <View style={styles.hero}>
          <View style={styles.heroHalo} pointerEvents="none" />
          <Text style={[styles.kicker, styles.onAccentSoft]}>OF EVERY BOOKING, YOU KEEP</Text>
          <Text style={styles.heroNum}>100%</Text>
          <Text style={styles.heroSub}>No commission. Tips reach you whole.</Text>
        </View>

        <View style={styles.payout}>
          <Text style={styles.payoutTitle}>You choose when you're paid</Text>
          <Text style={styles.payoutSub}>How often your money is paid into your bank. Change it any time in Payments.</Text>
          <View style={styles.chips}>
            {PAYOUT_CHOICES.map(label => (
              <View key={label} style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </View>
            ))}
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
          <Text style={styles.primaryText}>{tr('providerProfile.ui.becomeAFullMember')}</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>{FULL_MEMBER_FREE_LINE}.</Text>
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
    payout: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 4, marginBottom: 20 },
    payoutTitle: { fontSize: 15, fontWeight: '700', color: P.text },
    payoutSub: { fontSize: 13, lineHeight: 18, color: P.sub, marginBottom: 8 },
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
