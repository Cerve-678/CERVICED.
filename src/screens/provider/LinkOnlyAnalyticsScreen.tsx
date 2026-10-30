/**
 * Analytics for a link-only provider. The headline is Book taps — clients
 * sent to their own booking page — because CERVICED can't see whether those
 * clients finished booking there, and the footnote says so. Counters come from
 * provider_daily_stats (one row per provider per day); Saves is the number of
 * clients who bookmarked them.
 *
 * Built from the same AnalyticsKit pieces as the full provider's
 * ProviderAnalyticsScreen, so the two screens read as one design.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';
import { forgetCachedReads, getMyProviderDailyStats, getMyProviderSaverCount } from '../../services/databaseService';
import type { DbProviderDailyStat } from '../../types/database';
import {
  LINK_ONLY_PERIOD_DAYS,
  bookTapRatio,
  lastSevenDaysOfBookTaps,
  sumLinkOnlyStats,
  type LinkOnlyPeriod,
} from '../../features/providers/linkOnlyAnalytics';
import {
  AnalyticsHeader,
  AnimatedNumber,
  BarChart,
  CHART,
  DeckCard,
  HeroGradient,
  InsightStrip,
  RangeSelector,
  Reveal,
  SectionLabel,
  StatTile,
  accentColor,
  heroText,
  type IoniconName,
} from '../../components/analytics/AnalyticsKit';
import { formatShortDayDate } from '../../utils/dateUtils';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { logger } from '../../utils/logger';

const PERIODS: { key: LinkOnlyPeriod; labelKey: TranslationKey }[] = [
  { key: '7d', labelKey: 'providerProfile.analytics.period.7d' },
  { key: '30d', labelKey: 'providerProfile.analytics.period.30d' },
  { key: 'all', labelKey: 'providerProfile.analytics.period.all' },
];

/** The four counters sit in one row (design Concept B, chosen 2026-10-19). */
const TILE_COLUMNS = 4;

export default function LinkOnlyAnalyticsScreen() {
  const navigation = useNavigation();
  const { theme, isDarkMode: dark } = useTheme();
  const { t } = useTranslation();
  const accent = accentColor(dark);
  const periods = useMemo(() => PERIODS.map(p => ({ key: p.key, label: t(p.labelKey) })), [t]);
  const [period, setPeriod] = useState<LinkOnlyPeriod>('7d');
  const [rows, setRows] = useState<DbProviderDailyStat[] | null>(null);
  const [saves, setSaves] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The bar the provider tapped to read; null reads today, the last bar.
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [periodRows, saveCount] = await Promise.all([
        getMyProviderDailyStats(LINK_ONLY_PERIOD_DAYS[period]),
        getMyProviderSaverCount(),
      ]);
      setRows(periodRows);
      setSaves(saveCount);
    } catch (error) {
      logger.error('[LinkOnlyAnalytics] load failed', error);
      setFailed(true);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      setRows(null);
      void load();
    }, [load]),
  );
  useEffect(() => { setSelectedBar(null); }, [period]);

  const onRefresh = useCallback(async () => {
    // Pull-to-refresh asks for the latest, not the short read cache.
    forgetCachedReads();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totals = useMemo(() => sumLinkOnlyStats(rows ?? []), [rows]);
  // Every period covers at least the last seven days, so the chart reads
  // them out of the same rows.
  const days = useMemo(() => lastSevenDaysOfBookTaps(rows ?? [], new Date()), [rows]);
  const bars = useMemo(() => days.map(day => ({ label: day.letter, value: day.value })), [days]);
  const selectedIndex = selectedBar ?? days.length - 1;
  const selectedDay = days[selectedIndex];
  const ratio = bookTapRatio(totals);

  const tiles = useMemo<{ label: string; value: number; icon: IoniconName; color: string }[]>(() => [
    { label: t('providerProfile.analytics.tile.views'),     value: totals.profileViews,      icon: 'eye',            color: CHART.blue },
    { label: t('providerProfile.analytics.tile.search'),    value: totals.searchAppearances, icon: 'search',         color: CHART.teal },
    { label: t('providerProfile.analytics.tile.instagram'), value: totals.instagramTaps,     icon: 'logo-instagram', color: CHART.pink },
    { label: t('providerProfile.analytics.tile.saves'),     value: saves ?? 0,               icon: 'bookmark',       color: accent },
  ], [totals, saves, accent, t]);

  return (
    <ThemedBackground style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        >
          <AnalyticsHeader title={t('providerProfile.analytics.title')} onBack={() => navigation.goBack()} dark={dark} theme={theme} />

          <View style={styles.rangeArea}>
            <RangeSelector options={periods} range={period} onChange={setPeriod} dark={dark} theme={theme} />
          </View>

          <View style={styles.body}>
            {failed ? (
              <DeckCard dark={dark}>
                <View style={styles.message}>
                  <Text style={[styles.messageTitle, { color: theme.text }]}>{t('providerProfile.analytics.loadFailed')}</Text>
                  <Text style={[styles.note, { color: theme.secondaryText }]}>
                    {t('providerProfile.analytics.loadFailedBody')}
                  </Text>
                </View>
              </DeckCard>
            ) : rows == null ? (
              <ActivityIndicator color={accent} style={styles.loader} />
            ) : (
              <>
                <Reveal index={0}>
                  <DeckCard dark={dark} style={heroText.panel}>
                    <HeroGradient dark={dark} accent={accent} />
                    <View style={heroText.inner}>
                      <Text style={[heroText.label, { color: theme.secondaryText }]}>{t('providerProfile.analytics.hero.label')}</Text>
                      <AnimatedNumber value={totals.bookTaps} style={[heroText.value, { color: theme.text }]} />
                      <Text style={[heroText.sub, { color: theme.secondaryText }]}>{t('providerProfile.analytics.hero.sub')}</Text>

                      <View style={styles.chartArea}>
                        <View style={heroText.chartHead}>
                          <Text style={[heroText.chartHeadK, { color: theme.secondaryText }]}>{t('providerProfile.analytics.chart.title')}</Text>
                          {selectedDay && (
                            <View style={styles.readout}>
                              <Text style={[heroText.roLabel, { color: theme.secondaryText }]}>
                                {formatShortDayDate(selectedDay.ymd)}
                              </Text>
                              <Text style={[heroText.roVal, { color: accent }]}>{selectedDay.value}</Text>
                              <Text style={[heroText.roSub, { color: theme.secondaryText }]}>
                                {selectedDay.value === 1 ? t('providerProfile.analytics.chart.tapSingle') : t('providerProfile.analytics.chart.tapSeveral')}
                              </Text>
                            </View>
                          )}
                        </View>
                        <BarChart
                          key={`${period}-${rows.length}`}
                          data={bars}
                          dark={dark}
                          theme={theme}
                          accent={accent}
                          selectedIndex={selectedIndex}
                          onSelect={setSelectedBar}
                        />
                        <Text style={[heroText.chartHint, { color: theme.secondaryText }]}>{t('providerProfile.analytics.chart.hint')}</Text>
                      </View>
                    </View>
                  </DeckCard>
                </Reveal>

                {ratio != null && (
                  <Reveal index={1}>
                    <InsightStrip
                      dark={dark}
                      theme={theme}
                      accent={accent}
                      text={
                        <>
                          <Text style={styles.strong}>{t('providerProfile.analytics.insight.ratio', { ratio })}</Text>{t('providerProfile.analytics.insight.body')}
                        </>
                      }
                    />
                  </Reveal>
                )}

                <SectionLabel theme={theme}>{t('providerProfile.analytics.atAGlance')}</SectionLabel>
                <View style={styles.tileGrid}>
                  {tiles.map((t, i) => (
                    <Reveal key={t.label} index={i + 1}>
                      <StatTile
                        label={t.label}
                        value={t.value}
                        icon={t.icon}
                        color={t.color}
                        dark={dark}
                        theme={theme}
                        columns={TILE_COLUMNS}
                      />
                    </Reveal>
                  ))}
                </View>

                <Text style={[styles.note, styles.footnote, { color: theme.secondaryText }]}>
                  {t('providerProfile.analytics.footnote')}
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 60 },
  rangeArea: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  body: { paddingHorizontal: 20, gap: 12 },
  loader: { marginVertical: 40 },
  chartArea: { marginTop: 20 },
  readout: { alignItems: 'flex-end' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  message: { padding: 20, gap: 6 },
  messageTitle: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17 },
  footnote: { marginTop: 4 },
  strong: { fontWeight: '700' },
});
