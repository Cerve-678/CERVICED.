/**
 * Analytics for a link-only provider. The headline is Book taps — clients
 * sent to their own booking page — because CERVICED can't see whether those
 * clients finished booking there, and the footnote says so. Counters come from
 * provider_daily_stats (one row per provider per day); Saves is the number of
 * clients who bookmarked them.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyProviderDailyStats, getMyProviderSaverCount } from '../../services/databaseService';
import type { DbProviderDailyStat } from '../../types/database';
import {
  LINK_ONLY_PERIOD_DAYS,
  bookTapRatio,
  lastSevenDaysOfBookTaps,
  sumLinkOnlyStats,
  type LinkOnlyPeriod,
} from '../../features/providers/linkOnlyAnalytics';
import { logger } from '../../utils/logger';

const PERIODS: { key: LinkOnlyPeriod; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export default function LinkOnlyAnalyticsScreen() {
  const navigation = useNavigation();
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const [period, setPeriod] = useState<LinkOnlyPeriod>('7d');
  const [rows, setRows] = useState<DbProviderDailyStat[] | null>(null);
  const [saves, setSaves] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setRows(null);
      setFailed(false);
      Promise.all([
        getMyProviderDailyStats(LINK_ONLY_PERIOD_DAYS[period]),
        getMyProviderSaverCount(),
      ])
        .then(([periodRows, saveCount]) => {
          if (!active) return;
          setRows(periodRows);
          setSaves(saveCount);
        })
        .catch(error => {
          logger.error('[LinkOnlyAnalytics] load failed', error);
          if (active) setFailed(true);
        });
      return () => { active = false; };
    }, [period]),
  );

  const totals = useMemo(() => sumLinkOnlyStats(rows ?? []), [rows]);
  // Every period covers at least the last seven days, so the chart reads
  // them out of the same rows.
  const bars = useMemo(() => lastSevenDaysOfBookTaps(rows ?? [], new Date()), [rows]);
  const maxBar = Math.max(1, ...bars.map(bar => bar.value));
  const ratio = bookTapRatio(totals);

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.back}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color={P.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Analytics</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.segment} accessibilityRole="tablist">
            {PERIODS.map(option => {
              const selected = option.key === period;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.segmentItem, selected && styles.segmentSelected]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriod(option.key); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {failed ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Couldn't load your numbers</Text>
              <Text style={styles.note}>Check your connection and come back to this screen to try again.</Text>
            </View>
          ) : rows == null ? (
            <ActivityIndicator color={P.accent} style={styles.loader} />
          ) : (
            <>
              <View style={styles.hero}>
                <View style={styles.heroLabelRow}>
                  <Ionicons name="open-outline" size={14} color={P.onAccent} />
                  <Text style={styles.heroLabel}>BOOK BUTTON TAPS</Text>
                </View>
                <Text style={styles.heroNumber}>{totals.bookTaps.toLocaleString('en-GB')}</Text>
                <Text style={styles.heroSub}>Clients sent to your booking page</Text>
                <View style={styles.bars} accessibilityLabel="Book taps over the last seven days">
                  {bars.map((bar, index) => (
                    <View key={bar.ymd} style={styles.barColumn}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            { height: `${Math.max(6, (bar.value / maxBar) * 100)}%` },
                            index === bars.length - 1 ? styles.barToday : null,
                          ]}
                        />
                      </View>
                      <Text style={styles.barLetter}>{bar.letter}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.grid}>
                {[
                  { label: 'PROFILE VIEWS', value: totals.profileViews },
                  { label: 'IN SEARCH', value: totals.searchAppearances },
                  { label: 'INSTAGRAM TAPS', value: totals.instagramTaps },
                  { label: 'SAVES', value: saves ?? 0 },
                ].map(stat => (
                  <View key={stat.label} style={styles.stat}>
                    <Text style={styles.cardLabel}>{stat.label}</Text>
                    <Text style={styles.statValue}>{stat.value.toLocaleString('en-GB')}</Text>
                  </View>
                ))}
              </View>

              {ratio != null && (
                <View style={styles.insight}>
                  <Text style={styles.insightText}>
                    <Text style={styles.insightStrong}>1 in {ratio}</Text> people who view your profile tap Book. Adding more portfolio photos usually helps.
                  </Text>
                </View>
              )}

              <Text style={styles.note}>
                We count taps on your Book button. Bookings happen on your own page, so CERVICED can't see whether they finished booking. Saves is everyone who's saved you, not just this period.
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    back: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.card, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 26, color: P.text },
    content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
    segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: P.surface, marginBottom: 4 },
    segmentItem: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    segmentSelected: { backgroundColor: P.card },
    segmentText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.sub },
    segmentTextSelected: { color: P.text },
    loader: { marginVertical: 40 },
    hero: { backgroundColor: P.accent, borderRadius: 22, padding: 18, gap: 4 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', letterSpacing: 1, color: P.onAccent, opacity: 0.85 },
    heroNumber: { fontFamily: 'BakbakOne-Regular', fontSize: 52, lineHeight: 60, color: P.onAccent },
    heroSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600', color: P.onAccent, opacity: 0.85 },
    bars: { flexDirection: 'row', gap: 6, marginTop: 12 },
    barColumn: { flex: 1, alignItems: 'center', gap: 4 },
    barTrack: { height: 56, width: '100%', justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
    barToday: { backgroundColor: '#FFFFFF' },
    barLetter: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', color: P.onAccent, opacity: 0.8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    stat: { width: '48%', flexGrow: 1, backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 14, gap: 4 },
    card: { backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 16, gap: 6 },
    cardLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: P.sub },
    statValue: { fontFamily: 'BakbakOne-Regular', fontSize: 28, color: P.text },
    insight: { backgroundColor: P.accentDim, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
    insightText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.text },
    insightStrong: { fontWeight: '700' },
    note: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, color: P.sub },
  });
