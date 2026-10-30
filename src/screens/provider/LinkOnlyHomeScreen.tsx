/**
 * Home for a link-only provider (booking_mode 'external') — a professional
 * who takes bookings on their own page (Fresha, Treatwell, Acuity…) and uses
 * CERVICED to be found. There's no booking calendar here, because CERVICED
 * doesn't hold their bookings. Instead, top to bottom:
 *
 *  - a greeting, today's date and opening hours, and whether they're live
 *  - until they're live, the go-live checklist: the four things the server
 *    publishes them on (logo, About, opening hours, a portfolio photo)
 *  - once live, tiles: Book taps this week (→ Analytics), new enquiries
 *    (→ Messages), saves (+ new this week), profile views and "Said they
 *    booked" (clients who answered Yes to "Did you book?"); and one fact
 *    from their own numbers from Becca
 *  - their whole week, one line per day, from the phone's calendar (DiaryCard)
 *  - once live, Profile strength: the next missing thing, the rest on a tap
 *  - their Book button's link, with Test it and Change link
 *  - once live, their most-saved photo, if anyone has saved one
 *  - shortcuts: Add work, Hours, Branding
 *  - Becca as a floating button, above the tab bar
 *
 * No Announcements: the product owner removed them for link-only pros
 * (2026-10-19).
 *
 * Product rules: docs/vault/Link-Only Providers.md. Design B (chosen
 * 2026-10-19): https://claude.ai/artifact/MJfLyQ2BLudDpneHpqbVMx
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation, tr } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useAppDialog } from '../../components/AppDialog';
import {
  getMyProviderDailyStats,
  getMyProviderProfile,
  getMyLinkOnlyDashboardExtras,
  getMyProviderSaverCount,
  getProviderEnquirySummary,
  getProviderSpecialties,
  type LinkOnlyDashboardExtras,
  type ProviderEnquirySummary,
} from '../../services/databaseService';
import { lastSevenDaysOfBookTaps, type DayBar } from '../../features/providers/linkOnlyAnalytics';
import {
  buildProfileStrength,
  busiestBookTapLine,
  compareWeeks,
  greetingFor,
  remainingStepsLine,
  todayHoursLabel,
  trendLabel,
  type ProfileStrengthKey,
  type WeekComparison,
} from '../../features/providers/linkOnlyDashboard';
import { displayExternalBookingUrl, openExternalBookingPage } from '../../features/providers/externalBookingLink';
import { buildPolicyDisplayRows } from '../../utils/policyDisplay';
import { dayName, monthName } from '../../utils/dateUtils';
import type { DbProvider } from '../../types/database';
import {
  buildLinkOnlyGoLiveSteps,
  fetchLinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStepKey,
} from '../../features/providers/goLiveStatus';
import { DiaryCard } from '../../features/providers/DiaryCard';
import { logger } from '../../utils/logger';
import type { ProviderHomeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProviderHomeStackParamList, 'LinkOnlyHomeMain'>;

const UP = '#3D8B5A';
const DOWN = '#B0563C';
const NOT_LIVE = '#B07A3C';

export default function LinkOnlyHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { palette } = useTheme();
  const { t, tp } = useTranslation();
  const { user } = useAuth();
  const { showToast, DialogHost } = useAppDialog();
  const P = useMemo(
    () => ({
      bg: palette.bg,
      card: palette.card,
      surface: palette.surface,
      text: palette.text,
      sub: palette.sub,
      border: palette.border,
      accent: palette.accent,
      onAccent: palette.onAccent,
      accentDim: palette.accentDim,
    }),
    [palette],
  );
  const styles = useMemo(() => createStyles(P), [P]);

  const [name, setName] = useState<string>(user?.businessName ?? '');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<DbProvider | null>(null);
  const [week, setWeek] = useState<{ comparison: WeekComparison; bars: DayBar[]; savers: number } | null>(null);
  const [specialityCount, setSpecialityCount] = useState<number | null>(null);
  const [enquiries, setEnquiries] = useState<ProviderEnquirySummary | null>(null);
  const [extras, setExtras] = useState<LinkOnlyDashboardExtras | null>(null);
  const [weekFailed, setWeekFailed] = useState(false);
  const [status, setStatus] = useState<LinkOnlyGoLiveStatus | null>(null);
  const [hasRow, setHasRow] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const row = await getMyProviderProfile();
          if (!active) return;
          setHasRow(!!row);
          setProfile(row);
          if (!row) return;
          setName(row.display_name);
          setLogoUrl(row.logo_url);
          const next = await fetchLinkOnlyGoLiveStatus(row);
          if (!active) return;
          setStatus(next);
          setLoadFailed(false);
          // Counting starts once they're live, so there's nothing to show before.
          if (!next?.isLive) return;
          const today = new Date();
          await Promise.all([
            (async () => {
              try {
                // Two weeks, so this week can be compared with the last.
                const [rows, savers] = await Promise.all([getMyProviderDailyStats(14), getMyProviderSaverCount()]);
                if (!active) return;
                setWeek({ comparison: compareWeeks(rows, today), bars: lastSevenDaysOfBookTaps(rows, today), savers });
                setWeekFailed(false);
              } catch (error) {
                // The rest of Home still works without the numbers.
                logger.error('[LinkOnlyHome] stats load failed', error);
                if (active) setWeekFailed(true);
              }
            })(),
            (async () => {
              try {
                const specialities = await getProviderSpecialties(row.id);
                if (active) setSpecialityCount(specialities.length);
              } catch (error) {
                // Profile strength just stays hidden without it.
                logger.error('[LinkOnlyHome] specialities load failed', error);
              }
            })(),
            (async () => {
              try {
                const summary = await getProviderEnquirySummary(row.id);
                if (active) setEnquiries(summary);
              } catch (error) {
                // The tile still opens Messages, just without a count.
                logger.error('[LinkOnlyHome] enquiries load failed', error);
              }
            })(),
            (async () => {
              try {
                const next = await getMyLinkOnlyDashboardExtras();
                if (active) setExtras(next);
              } catch (error) {
                // "Said they booked" shows a dash and the photo card stays hidden.
                logger.error('[LinkOnlyHome] dashboard extras load failed', error);
              }
            })(),
          ]);
        } catch (error) {
          logger.error('[LinkOnlyHome] load failed', error);
          if (active) setLoadFailed(true);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  const steps = status ? buildLinkOnlyGoLiveSteps(status) : [];
  const doneCount = steps.filter(step => step.done).length;

  const goToStep = useCallback(
    (key: LinkOnlyGoLiveStepKey | ProfileStrengthKey) => {
      Haptics.selectionAsync().catch(() => {});
      switch (key) {
        case 'hours': navigation.navigate('ProviderSchedule'); return;
        case 'portfolio':
        case 'photos':
        case 'specialities':
          // Specialities are edited on the Portfolio tab, above the photos.
          navigation.getParent()?.navigate('LinkOnlyPortfolio', { screen: 'LinkOnlyPortfolioMain' });
          return;
        case 'policies': navigation.navigate('Policies'); return;
        case 'instagram':
        case 'accessibility':
        case 'payments':
          navigation.navigate('BusinessInfo');
          return;
        default:
          // Logo and About both live on the profile editor's first pages.
          navigation.navigate('EditProfile');
      }
    },
    [navigation],
  );

  const live = status?.isLive ?? false;
  const maxBar = Math.max(1, ...(week?.bars.map(bar => bar.value) ?? [0]));
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const now = new Date();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? '';
  const hoursLabel = status ? todayHoursLabel(status.hours, now) : null;
  const dateLine = `${dayName(now.getDay(), 'short')} ${now.getDate()} ${monthName(now.getMonth(), 'short')}${hoursLabel ? ` · ${hoursLabel}` : ''}`;

  const strength = useMemo(() => {
    if (!status || !profile || specialityCount == null) return null;
    return buildProfileStrength({
      logoSet: status.logoSet,
      aboutSet: status.aboutSet,
      hoursSet: status.hoursSet,
      portfolioCount: status.portfolioCount,
      specialityCount,
      instagram: profile.instagram,
      policiesSet:
        buildPolicyDisplayRows(profile.booking_policies, profile.cancellation_notice_hours).length > 0 ||
        !!profile.booking_policies?.policyImageUrl,
      accessibilityNotes: profile.accessibility_notes,
      paymentMethods: profile.preferred_payment_methods,
    });
  }, [status, profile, specialityCount]);
  const missing = strength?.items.filter(item => !item.done) ?? [];
  const nextStep = missing[0];
  const restSteps = missing.slice(1);
  const restLine = remainingStepsLine(restSteps);

  const beccaLine = week ? busiestBookTapLine(week.bars, now) : null;
  const tapsTrend = week ? trendLabel(week.comparison.thisWeek.bookTaps, week.comparison.lastWeek.bookTaps) : null;
  const bookingLink = displayExternalBookingUrl(profile?.external_booking_url);

  const openBecca = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('BeccaStack', { screen: 'BeccaMain', params: {} });
  }, [navigation]);

  const openMessages = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    navigation.getParent()?.navigate('LinkOnlyMessages', { screen: 'ProviderInbox' });
  }, [navigation]);

  const testBookingLink = useCallback(async () => {
    if (!profile?.external_booking_url) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await openExternalBookingPage(profile.external_booking_url);
    } catch (error) {
      logger.error('[LinkOnlyHome] booking link did not open', error);
      showToast(tr('providerProfile.home.linkFailed'), 'error');
    }
  }, [profile?.external_booking_url, showToast]);

  const latest = enquiries?.latest;
  const enquiryPreview = latest?.message
    ? `${latest.clientName?.trim().split(/\s+/)[0] ?? t('providerProfile.home.aClient')}: ${latest.message}`
    : enquiries
      ? t('providerProfile.home.allCaughtUp')
      : t('providerProfile.home.questions');

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView
          // Extra room so the floating Becca button never sits over the last card.
          contentContainerStyle={[styles.content, { paddingBottom: 96 + FLOATING_TAB_BAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.greeting}>{greetingFor(now)}{firstName ? `, ${firstName}` : ''}</Text>
              <Text style={styles.dateLine}>{dateLine}</Text>
              {status && (
                <View style={styles.liveLine}>
                  <View style={[styles.liveDot, { backgroundColor: live ? UP : NOT_LIVE }]} />
                  <Text style={styles.liveText}>{live ? t('providerProfile.home.live') : t('providerProfile.home.notLive')}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Notifications'); }}
              style={styles.iconButton}
              accessibilityLabel={t('providerProfile.home.notificationsA11y')}
              accessibilityRole="button"
            >
              <Ionicons name="notifications-outline" size={18} color={P.sub} />
            </TouchableOpacity>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.avatar} contentFit="cover" transition={0} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
          </View>

          {hasRow === null && !loadFailed && <ActivityIndicator color={P.accent} style={styles.loader} />}

          {loadFailed && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('providerProfile.home.loadFailed')}</Text>
              <Text style={styles.body}>{t('providerProfile.home.loadFailedBody')}</Text>
            </View>
          )}

          {hasRow === false && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('providerProfile.home.setupTitle')}</Text>
              <Text style={styles.body}>
                {t('providerProfile.home.setupBody')}
              </Text>
              <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.85}>
                <Text style={styles.primaryText}>{t('providerProfile.home.getStarted')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {status && !live && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{tp('providerProfile.home.goLiveSteps', steps.length)}</Text>
                <Text style={styles.count}>{t('providerProfile.home.doneOf', { done: doneCount, total: steps.length })}</Text>
              </View>
              <View style={styles.progress}>
                {steps.map(step => (
                  <View key={step.key} style={[styles.progressBar, { backgroundColor: step.done ? P.accent : P.accentDim }]} />
                ))}
              </View>
              {steps.map(step => (
                <TouchableOpacity
                  key={step.key}
                  style={styles.stepRow}
                  onPress={() => goToStep(step.key)}
                  disabled={step.done}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ checked: step.done }}
                >
                  <View style={[styles.check, step.done ? { backgroundColor: P.accent, borderColor: P.accent } : null]}>
                    {step.done && <Ionicons name="checkmark" size={14} color={P.onAccent} />}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.stepLabel, step.done && styles.stepDone]}>{step.label}</Text>
                    {!step.done && <Text style={styles.stepHint}>{step.hint}</Text>}
                  </View>
                  {!step.done && <Ionicons name="chevron-forward" size={16} color={P.sub} />}
                </TouchableOpacity>
              ))}
              <Text style={styles.footnote}>{t('providerProfile.home.goLiveFootnote')}</Text>
            </View>
          )}

          {live && (
            <View style={styles.tiles}>
              <TouchableOpacity
                style={[styles.tile, styles.wideTile]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('LinkOnlyAnalytics'); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('providerProfile.home.tapsA11y')}
              >
                <View>
                  <Text style={styles.eyebrow}>{t('providerProfile.home.tapsTitle')}</Text>
                  {weekFailed ? (
                    <Text style={styles.body}>{t('providerProfile.home.numbersFailed')}</Text>
                  ) : !week ? (
                    <ActivityIndicator color={P.accent} style={styles.tileLoader} />
                  ) : (
                    <>
                      <Text style={styles.wideNum}>{week.comparison.thisWeek.bookTaps}</Text>
                      {tapsTrend ? (
                        <Text style={[styles.trend, !tapsTrend.up && styles.trendDown]}>{t('providerProfile.home.onLastWeek', { trend: tapsTrend.text })}</Text>
                      ) : (
                        <Text style={styles.stepHint}>{t('providerProfile.home.tapsSub')}</Text>
                      )}
                    </>
                  )}
                </View>
                <View style={styles.wideRight}>
                  <Text style={styles.count}>{t('providerProfile.home.allAnalytics')}</Text>
                  {week && (
                    <View style={styles.bars}>
                      {week.bars.map((bar, index) => (
                        <View
                          key={bar.ymd}
                          style={[
                            styles.bar,
                            {
                              height: `${Math.max(8, (bar.value / maxBar) * 100)}%`,
                              backgroundColor: index === week.bars.length - 1 ? P.accent : P.accentDim,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.tileRow}>
                <TouchableOpacity
                  style={[styles.tile, styles.accentTile]}
                  onPress={openMessages}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('providerProfile.home.enquiriesA11y', { count: enquiries?.unread ?? 0 })}
                >
                  <Ionicons name="chatbubble-outline" size={20} color={P.onAccent} />
                  <Text style={[styles.tileNum, styles.onAccent]}>{enquiries ? enquiries.unread : '–'}</Text>
                  <Text style={[styles.tileLabel, styles.onAccent]}>{enquiries?.unread === 1 ? t('providerProfile.home.newEnquiry') : t('providerProfile.home.newEnquiries')}</Text>
                  <Text style={[styles.tileSub, styles.onAccentSoft]} numberOfLines={1}>{enquiryPreview}</Text>
                </TouchableOpacity>
                <StatTile
                  styles={styles}
                  P={P}
                  icon="bookmark-outline"
                  value={week?.savers}
                  label={t('providerProfile.home.savedYou')}
                  // A running total, so the week shows as new saves, not a trend.
                  sub={extras && extras.newSaversWeek > 0 ? t('providerProfile.home.newThisWeek', { count: extras.newSaversWeek }) : t('providerProfile.home.savedYouSub')}
                  subUp={!!extras && extras.newSaversWeek > 0}
                />
              </View>

              <View style={styles.tileRow}>
                <StatTile
                  styles={styles}
                  P={P}
                  icon="eye-outline"
                  value={week?.comparison.thisWeek.profileViews}
                  before={week?.comparison.lastWeek.profileViews}
                  label={t('providerProfile.analytics.tile.views')}
                />
                <StatTile
                  styles={styles}
                  P={P}
                  icon="checkmark-done-outline"
                  value={extras?.saidBookedWeek}
                  before={extras?.saidBookedLastWeek}
                  label={t('providerProfile.home.saidBooked')}
                  sub={t('providerProfile.home.saidBookedSub')}
                />
              </View>
            </View>
          )}

          {live && beccaLine && (
            <TouchableOpacity style={styles.beccaLine} onPress={openBecca} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="sparkles" size={18} color={P.accent} />
              <Text style={[styles.body, styles.beccaText]}>
                <Text style={styles.beccaName}>{t('providerProfile.home.beccaPrefix')}</Text>
                {beccaLine}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={P.sub} />
            </TouchableOpacity>
          )}

          <DiaryCard P={P} hours={status?.hours ?? []} />

          {live && strength && nextStep && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{t('providerProfile.home.strength')}</Text>
                <Text style={styles.percent}>{strength.percent}%</Text>
              </View>
              <View style={styles.track} accessibilityLabel={t('providerProfile.home.strengthA11y', { percent: strength.percent })}>
                <View style={[styles.fill, { width: `${strength.percent}%` }]} />
              </View>
              <StrengthRow styles={styles} P={P} item={nextStep} eyebrow={t('providerProfile.home.next')} onPress={() => goToStep(nextStep.key)} />
              {showAllSteps && restSteps.map(item => (
                <StrengthRow key={item.key} styles={styles} P={P} item={item} onPress={() => goToStep(item.key)} />
              ))}
              {restLine && (
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowAllSteps(open => !open); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.count}>{showAllSteps ? t('providerProfile.home.showLess') : restLine}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {hasRow && (
            <View style={styles.card}>
              <View style={styles.linkHead}>
                <View style={styles.tileIcon}><Ionicons name="link-outline" size={20} color={P.accent} /></View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{t('providerProfile.home.bookButton')}</Text>
                  <Text style={styles.stepHint} numberOfLines={1}>{bookingLink ?? t('providerProfile.home.noLink')}</Text>
                </View>
              </View>
              <View style={styles.linkButtons}>
                <TouchableOpacity
                  style={[styles.outlineButton, !bookingLink && styles.disabled]}
                  onPress={testBookingLink}
                  disabled={!bookingLink}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.outlineButtonText}>{t('providerProfile.home.testIt')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.softButton}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('BusinessInfo'); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.outlineButtonText}>{bookingLink ? t('providerProfile.home.changeLink') : t('providerProfile.home.addLink')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {live && extras?.topPhoto && (
            <View style={[styles.card, styles.photoCard]}>
              <Image source={{ uri: extras.topPhoto.imageUrl }} style={styles.topPhoto} contentFit="cover" transition={0} />
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>{t('providerProfile.home.topPhoto')}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{extras.topPhoto.label ?? t('providerProfile.home.yourWork')}</Text>
                <Text style={styles.stepHint}>
                  Saved {extras.topPhoto.saves === 1 ? 'once' : `${extras.topPhoto.saves} times`} in Explore
                </Text>
                <TouchableOpacity onPress={() => goToStep('photos')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button">
                  <Text style={[styles.count, styles.photoLink]}>{t('providerProfile.home.addMoreLikeThis')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.shortcuts}>
            <Shortcut styles={styles} P={P} icon="camera-outline" label={t('providerProfile.home.addWork')} onPress={() => goToStep('portfolio')} />
            <Shortcut styles={styles} P={P} icon="time-outline" label={t('providerProfile.home.hours')} onPress={() => goToStep('hours')} />
            <Shortcut
              styles={styles}
              P={P}
              icon="color-palette-outline"
              label={t('providerProfile.home.branding')}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Branding'); }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      <TouchableOpacity
        style={[styles.becca, { bottom: FLOATING_TAB_BAR_CLEARANCE + 12 }]}
        onPress={openBecca}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('providerProfile.home.askBecca')}
      >
        <Ionicons name="sparkles" size={24} color={P.onAccent} />
      </TouchableOpacity>

      <DialogHost />
    </ThemedBackground>
  );
}

type HomeStyles = ReturnType<typeof createStyles>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STRENGTH_ICONS: Record<ProfileStrengthKey, IconName> = {
  logo: 'image-outline',
  about: 'create-outline',
  hours: 'time-outline',
  specialities: 'star-outline',
  instagram: 'logo-instagram',
  policies: 'document-text-outline',
  photos: 'images-outline',
  accessibility: 'accessibility-outline',
  payments: 'card-outline',
};

/** A small numbers tile. `value` undefined = still loading. */
function StatTile({
  styles,
  P,
  icon,
  value,
  before,
  label,
  sub,
  subUp,
}: {
  styles: HomeStyles;
  P: HomePalette;
  icon: IconName;
  value: number | undefined;
  before?: number | undefined;
  label: string;
  sub?: string;
  /** Show `sub` in the trend-up colour. */
  subUp?: boolean;
}) {
  const trend = value === undefined || before === undefined ? null : trendLabel(value, before);
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={20} color={P.accent} />
      <Text style={styles.tileNum}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {trend ? (
        <Text style={[styles.trend, !trend.up && styles.trendDown]}>{trend.text}</Text>
      ) : sub ? (
        <Text style={subUp ? styles.trend : styles.tileSub} numberOfLines={1}>{sub}</Text>
      ) : null}
    </View>
  );
}

function StrengthRow({
  styles,
  P,
  item,
  eyebrow,
  onPress,
}: {
  styles: HomeStyles;
  P: HomePalette;
  item: { key: ProfileStrengthKey; label: string; hint: string };
  eyebrow?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.todoRow} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={styles.todoIcon}><Ionicons name={STRENGTH_ICONS[item.key]} size={16} color={P.accent} /></View>
      <View style={styles.flex}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.stepLabel}>{item.label}</Text>
        {!eyebrow && <Text style={styles.stepHint}>{item.hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={P.sub} />
    </TouchableOpacity>
  );
}

function Shortcut({
  styles,
  P,
  icon,
  label,
  onPress,
}: {
  styles: HomeStyles;
  P: HomePalette;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.shortcut} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={P.accent} />
      <Text style={styles.shortcutLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

type HomePalette = {
  bg: string; card: string; surface: string; text: string; sub: string;
  border: string; accent: string; onAccent: string; accentDim: string;
};

const createStyles = (P: HomePalette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    greeting: { fontFamily: 'BakbakOne-Regular', fontSize: 26, lineHeight: 31, color: P.text },
    dateLine: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', color: P.sub, marginTop: 3 },
    liveLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    liveText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.surface },
    avatarEmpty: { backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.onAccent },
    loader: { marginVertical: 24 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 10 },
    cardTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.sub },
    rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    count: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accent },
    progress: { flexDirection: 'row', gap: 4 },
    progressBar: { flex: 1, height: 4, borderRadius: 2 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
    check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: P.border, alignItems: 'center', justifyContent: 'center' },
    stepLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.text },
    stepDone: { color: P.sub, textDecorationLine: 'line-through' },
    stepHint: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: P.sub, marginTop: 1 },
    footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub },
    primary: { height: 48, borderRadius: 24, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.onAccent },
    tiles: { gap: 8 },
    tileRow: { flexDirection: 'row', gap: 8 },
    tile: { flex: 1, backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 14, gap: 3 },
    wideTile: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingHorizontal: 16 },
    wideRight: { flex: 1, alignItems: 'flex-end', gap: 8 },
    wideNum: { fontFamily: 'BakbakOne-Regular', fontSize: 44, lineHeight: 50, color: P.text, marginTop: 2 },
    tileLoader: { marginVertical: 16, alignSelf: 'flex-start' },
    accentTile: { backgroundColor: P.accent, borderColor: P.accent },
    tileNum: { fontFamily: 'BakbakOne-Regular', fontSize: 28, lineHeight: 34, color: P.text, marginTop: 4 },
    tileLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.text },
    tileSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub },
    onAccent: { color: P.onAccent },
    onAccentSoft: { color: P.onAccent, opacity: 0.8 },
    eyebrow: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: P.sub },
    bars: { width: '100%', height: 56, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
    bar: { flex: 1, borderRadius: 4 },
    trend: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: UP },
    trendDown: { color: DOWN },
    beccaLine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: P.accentDim, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
    beccaText: { flex: 1, fontSize: 13, lineHeight: 18, color: P.text },
    beccaName: { fontWeight: '700' },
    percent: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.accent },
    track: { height: 8, borderRadius: 4, backgroundColor: P.accentDim, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4, backgroundColor: P.accent },
    todoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
    todoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    linkHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    linkButtons: { flexDirection: 'row', gap: 8 },
    outlineButton: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    softButton: { flex: 1, height: 44, borderRadius: 22, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    outlineButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, color: P.accent },
    disabled: { opacity: 0.45 },
    photoCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
    topPhoto: { width: 76, height: 76, borderRadius: 14, backgroundColor: P.surface },
    photoLink: { marginTop: 4 },
    shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    shortcut: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
    shortcutLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, color: P.text },
    becca: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  });
