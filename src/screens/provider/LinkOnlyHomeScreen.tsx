/**
 * Home for a link-only provider (booking_mode 'external') — a professional
 * who takes bookings on their own page (Fresha, Treatwell, Acuity…) and uses
 * CERVICED to be found. There's no booking calendar here, because CERVICED
 * doesn't hold their bookings. Instead:
 *
 *  - once live, this week's numbers: Book taps (the headline, with a bar per
 *    day), profile views, saves and search appearances — tapping through to
 *    the full Analytics screen
 *  - until then, the go-live checklist: the four things the server publishes
 *    them on (logo, About, opening hours, a portfolio photo) — goLiveStatus.ts
 *  - their diary, read from the phone's own calendar (DiaryCard)
 *  - Announce (to the clients who saved them) and Add work
 *  - Becca as a floating button, above the tab bar
 *
 * Product rules: docs/vault/Link-Only Providers.md.
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
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProviderDailyStats, getMyProviderProfile, getMyProviderSaverCount } from '../../services/databaseService';
import { lastSevenDaysOfBookTaps, sumLinkOnlyStats, type DayBar, type LinkOnlyTotals } from '../../features/providers/linkOnlyAnalytics';
import {
  buildLinkOnlyGoLiveSteps,
  fetchLinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStepKey,
} from '../../features/providers/goLiveStatus';
import { DiaryCard } from '../../features/providers/DiaryCard';
import { LinkOnlyAnnouncementSheet } from '../../features/providers/LinkOnlyAnnouncementSheet';
import { logger } from '../../utils/logger';
import type { ProviderHomeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProviderHomeStackParamList, 'LinkOnlyHomeMain'>;

export default function LinkOnlyHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { showAlert, DialogHost } = useAppDialog();
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
  const [week, setWeek] = useState<{ totals: LinkOnlyTotals; bars: DayBar[]; savers: number } | null>(null);
  const [weekFailed, setWeekFailed] = useState(false);
  const [status, setStatus] = useState<LinkOnlyGoLiveStatus | null>(null);
  const [hasRow, setHasRow] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  // Bumped on every open so the sheet remounts empty.
  const [announcementKey, setAnnouncementKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profile = await getMyProviderProfile();
          if (!active) return;
          setHasRow(!!profile);
          if (!profile) return;
          setName(profile.display_name);
          setLogoUrl(profile.logo_url);
          const next = await fetchLinkOnlyGoLiveStatus(profile);
          if (!active) return;
          setStatus(next);
          setLoadFailed(false);
          // Counting starts once they're live, so there's nothing to show before.
          if (!next?.isLive) return;
          try {
            const [rows, savers] = await Promise.all([getMyProviderDailyStats(7), getMyProviderSaverCount()]);
            if (!active) return;
            setWeek({ totals: sumLinkOnlyStats(rows), bars: lastSevenDaysOfBookTaps(rows, new Date()), savers });
            setWeekFailed(false);
          } catch (error) {
            // The rest of Home still works without the numbers.
            logger.error('[LinkOnlyHome] stats load failed', error);
            if (active) setWeekFailed(true);
          }
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
    (key: LinkOnlyGoLiveStepKey) => {
      Haptics.selectionAsync().catch(() => {});
      if (key === 'hours') { navigation.navigate('ProviderSchedule'); return; }
      if (key === 'portfolio') {
        navigation.getParent()?.navigate('LinkOnlyPortfolio', { screen: 'LinkOnlyPortfolioMain' });
        return;
      }
      // Logo and About both live on the profile editor's first pages.
      navigation.navigate('EditProfile');
    },
    [navigation],
  );

  const live = status?.isLive ?? false;
  const maxBar = Math.max(1, ...(week?.bars.map(bar => bar.value) ?? [0]));
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const openAnnouncement = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (!live) {
      showAlert('Go live first', "Announcements go to clients who saved you, and they can only find you once you're live.");
      return;
    }
    setAnnouncementKey(k => k + 1);
    setAnnouncementOpen(true);
  }, [live, showAlert]);

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
            <Text style={[styles.name, styles.flex]} numberOfLines={1}>Dashboard</Text>
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
              {live && <Text style={styles.liveSub}>Clients can find and book you</Text>}
            </View>
          )}

          {hasRow === null && !loadFailed && <ActivityIndicator color={P.accent} style={styles.loader} />}

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
                      <Text style={styles.headline}>{week.totals.bookTaps}</Text>
                      <Text style={styles.headlineLabel}>Book taps</Text>
                      <Text style={styles.stepHint}>Clients sent to your booking page</Text>
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
                    <View style={styles.miniStat}>
                      <Text style={styles.miniNum}>{week.totals.profileViews}</Text>
                      <Text style={styles.miniLabel}>Profile views</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniNum}>{week.savers}</Text>
                      <Text style={styles.miniLabel}>Saved you</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniNum}>{week.totals.searchAppearances}</Text>
                      <Text style={styles.miniLabel}>In searches</Text>
                    </View>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

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

          <DiaryCard P={P} />

          <View style={styles.tiles}>
            <TouchableOpacity style={styles.tile} onPress={openAnnouncement} activeOpacity={0.85} accessibilityRole="button">
              <View style={styles.tileIcon}><Ionicons name="megaphone-outline" size={20} color={P.accent} /></View>
              <Text style={styles.tileTitle}>Announce</Text>
              <Text style={styles.tileSub}>To clients who saved you</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tile} onPress={() => goToStep('portfolio')} activeOpacity={0.85} accessibilityRole="button">
              <View style={styles.tileIcon}><Ionicons name="camera-outline" size={20} color={P.accent} /></View>
              <Text style={styles.tileTitle}>Add work</Text>
              <Text style={styles.tileSub}>
                {status ? `${status.portfolioCount} photo${status.portfolioCount === 1 ? '' : 's'} so far` : 'Your best work'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <TouchableOpacity
        style={[styles.becca, { bottom: FLOATING_TAB_BAR_CLEARANCE + 12 }]}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('BeccaStack', { screen: 'BeccaMain', params: {} }); }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Ask Becca"
      >
        <Ionicons name="sparkles" size={24} color={P.onAccent} />
      </TouchableOpacity>

      <LinkOnlyAnnouncementSheet
        key={announcementKey}
        visible={announcementOpen}
        P={P}
        onClose={() => setAnnouncementOpen(false)}
        onSent={count => {
          setAnnouncementOpen(false);
          setTimeout(() => showAlert('Announcement sent', `Sent to ${count} client${count === 1 ? '' : 's'}.`), 400);
        }}
      />
      <DialogHost />
    </ThemedBackground>
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
    liveSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub },
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
    tiles: { flexDirection: 'row', gap: 10 },
    tile: { flex: 1, backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 14, gap: 6 },
    tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    becca: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    tileTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text },
    tileSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16, color: P.sub },
  });
