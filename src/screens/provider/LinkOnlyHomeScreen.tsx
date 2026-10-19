/**
 * Home for a link-only provider (booking_mode 'external') — a professional
 * who takes bookings on their own page (Fresha, Treatwell, Acuity…) and uses
 * CERVICED to be found. There's no booking calendar here, because CERVICED
 * doesn't hold their bookings. Instead, top to bottom:
 *
 *  - a greeting, the Live pill and today's opening hours
 *  - until they're live, the go-live checklist: the four things the server
 *    publishes them on (logo, About, opening hours, a portfolio photo)
 *  - their whole week, read from the phone's own calendar (DiaryCard)
 *  - once live: this week's numbers against last week (tapping through to
 *    Analytics); Profile strength (what's still missing); and one fact from
 *    their own numbers ("Becca noticed")
 *  - shortcuts: Add work, Hours, Branding
 *
 * No Announcements: the product owner removed them for link-only pros
 * (2026-10-19), so the free-day nudge from the design went with them.
 *  - Becca as a floating button, above the tab bar
 *
 * Product rules: docs/vault/Link-Only Providers.md. Design (approved
 * 2026-10-19): https://claude.ai/artifact/DrnMGFGGk5HJZW9ij1F9FN
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyProviderDailyStats,
  getMyProviderProfile,
  getMyProviderSaverCount,
  getProviderSpecialties,
} from '../../services/databaseService';
import { lastSevenDaysOfBookTaps, type DayBar } from '../../features/providers/linkOnlyAnalytics';
import {
  buildProfileStrength,
  busiestBookTapLine,
  compareWeeks,
  greetingFor,
  todayHoursLabel,
  trendLabel,
  type ProfileStrengthKey,
  type WeekComparison,
} from '../../features/providers/linkOnlyDashboard';
import { buildPolicyDisplayRows } from '../../utils/policyDisplay';
import { DAY_NAMES_ABBREV, MONTH_NAMES_ABBREV } from '../../utils/dateUtils';
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

export default function LinkOnlyHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { palette } = useTheme();
  const { user } = useAuth();
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
  const [weekFailed, setWeekFailed] = useState(false);
  const [status, setStatus] = useState<LinkOnlyGoLiveStatus | null>(null);
  const [hasRow, setHasRow] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

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
  const greeting = `${greetingFor(now)}${firstName ? `, ${firstName}` : ''} · ${DAY_NAMES_ABBREV[now.getDay()]} ${now.getDate()} ${MONTH_NAMES_ABBREV[now.getMonth()]}`;
  const hoursLabel = status ? todayHoursLabel(status.hours, now) : null;

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
  const finished = strength?.items.filter(item => item.done) ?? [];

  const beccaLine = week ? busiestBookTapLine(week.bars, now) : null;
  const tapsTrend = week ? trendLabel(week.comparison.thisWeek.bookTaps, week.comparison.lastWeek.bookTaps) : null;
  const openBecca = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('BeccaStack', { screen: 'BeccaMain', params: {} });
  }, [navigation]);

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView
          // Extra room so the floating Becca button never sits over the last card.
          contentContainerStyle={[styles.content, { paddingBottom: 96 + FLOATING_TAB_BAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.avatar} contentFit="cover" transition={0} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>Dashboard</Text>
              <Text style={styles.greeting} numberOfLines={1}>{greeting}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Notifications'); }}
              style={styles.iconButton}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <Ionicons name="notifications-outline" size={18} color={P.sub} />
            </TouchableOpacity>
          </View>

          {status && (
            <View style={styles.liveRow}>
              <View style={styles.livePill}>
                <View style={[styles.liveDot, { backgroundColor: live ? '#3D8B5A' : '#B07A3C' }]} />
                <Text style={styles.liveText}>{live ? 'Live on CERVICED' : 'Not live yet'}</Text>
              </View>
              {!!hoursLabel && (
                <View style={styles.livePill}>
                  <Text style={styles.liveText}>{hoursLabel}</Text>
                </View>
              )}
            </View>
          )}

          {hasRow === null && !loadFailed && <ActivityIndicator color={P.accent} style={styles.loader} />}

          {loadFailed && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Couldn't load your profile</Text>
              <Text style={styles.body}>Check your connection and pull back to this screen to try again.</Text>
            </View>
          )}

          {hasRow === false && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Set up your profile</Text>
              <Text style={styles.body}>
                Add your logo, a few lines about you, your booking link and some photos of your work — then clients can find you and book on your page.
              </Text>
              <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.85}>
                <Text style={styles.primaryText}>Get started</Text>
              </TouchableOpacity>
            </View>
          )}

          {status && !live && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Go live in {steps.length} steps</Text>
                <Text style={styles.count}>{doneCount} of {steps.length}</Text>
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
              <Text style={styles.footnote}>You won't appear in Search or Explore until all four are done.</Text>
            </View>
          )}

          <DiaryCard P={P} hours={status?.hours ?? []} />

          {live && (
            <TouchableOpacity
              style={styles.card}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('LinkOnlyAnalytics'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="This week's numbers. Open analytics"
            >
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>This week</Text>
                <Text style={styles.count}>All analytics</Text>
              </View>
              {weekFailed ? (
                <Text style={styles.body}>Couldn't load your numbers. Come back to this screen to try again.</Text>
              ) : !week ? (
                <ActivityIndicator color={P.accent} style={styles.loader} />
              ) : (
                <>
                  <View style={styles.headlineRow}>
                    <View>
                      <Text style={styles.headline}>{week.comparison.thisWeek.bookTaps}</Text>
                      <Text style={styles.headlineLabel}>Book taps</Text>
                      {tapsTrend ? (
                        <Text style={[styles.trend, !tapsTrend.up && styles.trendDown]}>{tapsTrend.text} on last week</Text>
                      ) : (
                        <Text style={styles.stepHint}>Clients sent to your booking page</Text>
                      )}
                    </View>
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
                  </View>
                  <View style={styles.miniStats}>
                    <MiniStat styles={styles} value={week.comparison.thisWeek.profileViews} before={week.comparison.lastWeek.profileViews} label="Profile views" />
                    {/* Saves are a running total, so there's no week to compare. */}
                    <MiniStat styles={styles} value={week.savers} label="Saved you" />
                    <MiniStat styles={styles} value={week.comparison.thisWeek.searchAppearances} before={week.comparison.lastWeek.searchAppearances} label="In searches" />
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          {live && strength && missing.length > 0 && (
            <View style={styles.card}>
              <View style={styles.strengthHead}>
                <StrengthRing percent={strength.percent} P={P} styles={styles} />
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>Profile strength</Text>
                  <Text style={styles.body}>You're live. These help clients choose you.</Text>
                </View>
              </View>
              <View>
                {missing.map(item => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.todoRow}
                    onPress={() => goToStep(item.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <View style={styles.todoIcon}><Ionicons name={STRENGTH_ICONS[item.key]} size={16} color={P.accent} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.stepLabel}>{item.label}</Text>
                      <Text style={styles.stepHint}>{item.hint}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={P.sub} />
                  </TouchableOpacity>
                ))}
              </View>
              {finished.length > 0 && (
                <View style={styles.doneChips}>
                  {finished.map(item => (
                    <View key={item.key} style={styles.doneChip}>
                      <Ionicons name="checkmark" size={12} color={P.sub} />
                      <Text style={styles.doneChipText}>{item.doneLabel}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {live && beccaLine && (
            <TouchableOpacity style={styles.card} onPress={openBecca} activeOpacity={0.85} accessibilityRole="button">
              <View style={styles.tipRow}>
                <View style={styles.tipIcon}><Ionicons name="sparkles" size={18} color={P.onAccent} /></View>
                <View style={styles.flex}>
                  <Text style={styles.tipEyebrow}>Becca noticed</Text>
                  <Text style={styles.tipText}>{beccaLine}</Text>
                </View>
              </View>
              <Text style={styles.count}>Ask Becca about it</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actions}>
            <QuickAction styles={styles} P={P} icon="camera-outline" label="Add work" onPress={() => goToStep('portfolio')} />
            <QuickAction styles={styles} P={P} icon="time-outline" label="Hours" onPress={() => goToStep('hours')} />
            <QuickAction
              styles={styles}
              P={P}
              icon="color-palette-outline"
              label="Branding"
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
        accessibilityLabel="Ask Becca"
      >
        <Ionicons name="sparkles" size={24} color={P.onAccent} />
      </TouchableOpacity>

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

function MiniStat({ styles, value, before, label }: { styles: HomeStyles; value: number; before?: number; label: string }) {
  const trend = before === undefined ? null : trendLabel(value, before);
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniNum}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
      {trend && <Text style={[styles.miniTrend, !trend.up && styles.trendDown]}>{trend.text}</Text>}
    </View>
  );
}

const RING_SIZE = 64;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function StrengthRing({ percent, P, styles }: { percent: number; P: HomePalette; styles: HomeStyles }) {
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * RING_LENGTH;
  return (
    <View style={styles.ring} accessibilityLabel={`Profile ${percent}% complete`}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={P.accentDim} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={P.accent}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${RING_LENGTH}`}
          fill="none"
          // Start at 12 o'clock.
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{percent}%</Text>
    </View>
  );
}

function QuickAction({
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
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.tileIcon}><Ionicons name={icon} size={20} color={P.accent} /></View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: P.surface },
    avatarEmpty: { backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.onAccent },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    name: { fontFamily: 'BakbakOne-Regular', fontSize: 26, color: P.text },
    livePill: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: P.accentDim, flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    liveText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
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
    headlineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
    headline: { fontFamily: 'BakbakOne-Regular', fontSize: 48, lineHeight: 52, color: P.text },
    headlineLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.text },
    bars: { flex: 1, height: 64, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
    bar: { flex: 1, borderRadius: 4 },
    miniStats: { flexDirection: 'row', gap: 8 },
    miniStat: { flex: 1, backgroundColor: P.surface, borderRadius: 14, padding: 12 },
    miniNum: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.text },
    miniLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', color: P.sub },
    tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    becca: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    greeting: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', color: P.sub, marginTop: 2 },
    trend: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: '#3D8B5A', marginTop: 1 },
    trendDown: { color: '#B0563C' },
    miniTrend: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', color: '#3D8B5A', marginTop: 2 },
    strengthHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
    ringText: { position: 'absolute', fontFamily: 'BakbakOne-Regular', fontSize: 16, color: P.text },
    todoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border },
    todoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    doneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12, backgroundColor: P.surface },
    doneChipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', color: P.sub },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    tipIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    tipEyebrow: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: P.sub, marginBottom: 3 },
    tipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.text },
    actions: { flexDirection: 'row', gap: 8 },
    action: { flex: 1, backgroundColor: P.card, borderRadius: 18, borderWidth: 1, borderColor: P.border, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', gap: 6 },
    actionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, color: P.text },
  });
