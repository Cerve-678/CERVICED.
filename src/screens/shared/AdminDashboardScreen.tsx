import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { getAdminDashboardOverview } from '../../services/databaseService';
import {
  DASHBOARD_PERIODS, buildProblemRows, describeDelta, formatCount, pounds, updatedLabel, weekLabel,
  type DeltaView, type ProblemSeverity,
} from '../../features/admin/dashboardPresentation';
import type { AdminDashboardOverview, AdminDashboardPeriod } from '../../types/adminDashboard';
import { logger } from '../../utils/logger';

// ── Admin dashboard ────────────────────────────────────────────────────────
// The home for admin accounts (admin_users): how CERVICED is growing, how the
// marketplace is doing, and what's broken, plus the way into Money and the
// developer tools. Every number comes from admin_dashboard_overview(), which
// refuses anyone else. Internal tool, so its copy is English only.

const SENTRY_ISSUES_URL = 'https://sentry.io/issues/';

type Palette = ReturnType<typeof useTheme>['palette'];

function statusColors(isDarkMode: boolean): Record<ProblemSeverity, string> {
  return isDarkMode
    ? { critical: '#E05050', warning: '#E0A030', good: '#0CA30C' }
    : { critical: '#C0392B', warning: '#B8860B', good: '#0CA30C' };
}

function deltaColor(tone: DeltaView['tone'], P: Palette, isDarkMode: boolean): string {
  if (tone === 'flat') return P.sub;
  if (tone === 'good') return isDarkMode ? '#0CA30C' : '#006300';
  return isDarkMode ? '#E05050' : '#C0392B';
}

const SEVERITY_ICON: Record<ProblemSeverity, keyof typeof Ionicons.glyphMap> = {
  critical: 'alert-circle',
  warning: 'warning',
  good: 'checkmark-circle',
};

const SEVERITY_WORD: Record<ProblemSeverity, string> = {
  critical: 'Needs fixing',
  warning: 'Keep an eye on',
  good: 'All clear',
};

export default function AdminDashboardScreen({ navigation }: any) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<AdminDashboardPeriod>(30);
  const [data, setData] = useState<AdminDashboardOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [series, setSeries] = useState<'accounts' | 'providers'>('accounts');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  // A slow answer for an old period must not overwrite the one asked for since.
  const requestRef = useRef(0);

  const load = useCallback(async (period: AdminDashboardPeriod) => {
    const id = ++requestRef.current;
    setLoadError(false);
    try {
      const overview = await getAdminDashboardOverview(period);
      if (id === requestRef.current) setData(overview);
    } catch (err) {
      logger.error('[AdminDashboard] overview failed to load:', err);
      if (id === requestRef.current) setLoadError(true);
    }
  }, []);

  useEffect(() => { void load(days); }, [load, days]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(days);
    setRefreshing(false);
  }, [load, days]);

  const problems = useMemo(() => (data ? buildProblemRows(data.problems) : []), [data]);
  const colors = statusColors(isDarkMode);
  const moneyBadge = data ? data.problems.payouts_failed + data.problems.refunds_need_you : 0;
  const card = [styles.card, { backgroundColor: P.card, borderColor: P.border }];
  const span = data?.period_days ?? days;
  const moneyDelta = data
    ? describeDelta(data.money.paid_in_pence, data.money.paid_in_prev_pence, span, { format: pounds })
    : null;

  const go = (route: 'AdminMoney' | 'DevSettings') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate(route);
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={P.accent} />}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: P.text }]}>ADMIN</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          How CERVICED is growing, and anything that's broken. Only admin accounts can see this screen.
        </Text>

        <View style={styles.chips}>
          {DASHBOARD_PERIODS.map(p => {
            const selected = days === p.days;
            return (
              <TouchableOpacity
                key={p.days}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setDays(p.days); }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.chip, { backgroundColor: selected ? P.accent : P.card, borderColor: P.border }]}
              >
                <Text style={[styles.chipLabel, { color: selected ? P.onAccent : P.accentText }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loadError && !data ? (
          <View style={card}>
            <Text style={[styles.body, { color: P.text }]}>Couldn't load the dashboard.</Text>
            <TouchableOpacity onPress={() => void load(days)} activeOpacity={0.7} style={{ marginTop: 8 }}>
              <Text style={{ color: P.accentText, fontWeight: '600' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !data ? (
          <ActivityIndicator color={P.accent} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <View style={card}>
              <Text style={[styles.label, { color: P.sub }]}>ACCOUNTS</Text>
              <Text style={[styles.hero, { color: P.text }]}>{formatCount(data.accounts.total)}</Text>
              <Text style={[styles.body, { color: P.text }]}>
                {formatCount(data.providers.total)} providers · {formatCount(data.accounts.clients_total)} with a client profile
              </Text>
              <Text style={[styles.small, { color: P.sub }]}>
                Someone with both counts once as an account and once in each group.
              </Text>
            </View>

            {/* ── Growth ───────────────────────────────────────────────── */}
            <Text style={[styles.section, { color: P.sub }]}>GROWTH, LAST {span} DAYS</Text>
            <View style={styles.grid}>
              <StatTile P={P} isDarkMode={isDarkMode} label="New sign-ups" value={data.accounts.new}
                delta={describeDelta(data.accounts.new, data.accounts.new_prev, span)} />
              <StatTile P={P} isDarkMode={isDarkMode} label="New providers" value={data.providers.new}
                delta={describeDelta(data.providers.new, data.providers.new_prev, span)} />
              <StatTile P={P} isDarkMode={isDarkMode} label="New clients" value={data.accounts.clients_new}
                delta={describeDelta(data.accounts.clients_new, data.accounts.clients_new_prev, span)} />
              <StatTile P={P} isDarkMode={isDarkMode} label="Signed in" value={data.accounts.active}
                note={`of ${formatCount(data.accounts.total)} accounts`} />
            </View>
            <Text style={[styles.small, { color: P.sub, marginBottom: 18 }]}>
              {data.accounts.deleted === 0
                ? 'No accounts were deleted in this period.'
                : `${formatCount(data.accounts.deleted)} account${data.accounts.deleted === 1 ? ' was' : 's were'} deleted in this period.`}
            </Text>

            <WeeklyChart
              P={P}
              weeks={data.weekly}
              series={series}
              onSeries={s => { Haptics.selectionAsync().catch(() => {}); setSeries(s); setSelectedWeek(null); }}
              selected={selectedWeek}
              onSelect={i => { Haptics.selectionAsync().catch(() => {}); setSelectedWeek(i); }}
            />

            {/* ── Marketplace ─────────────────────────────────────────── */}
            <Text style={[styles.section, { color: P.sub }]}>PROVIDERS</Text>
            <View style={card}>
              <Row P={P} label="Live on CERVICED" value={formatCount(data.providers.live)} />
              <Row P={P} label="Not live yet" value={formatCount(data.providers.not_live)} />
              <Row P={P} label="Book through their own link" value={formatCount(data.providers.link_only)} />
              <Row P={P} label="Directory listings nobody has claimed" value={formatCount(data.providers.listings_unclaimed)} />
              <Row P={P} label="Claims waiting for a decision" value={formatCount(data.providers.claims_pending)} last />
            </View>

            <Text style={[styles.section, { color: P.sub }]}>BOOKINGS, LAST {span} DAYS</Text>
            <View style={styles.grid}>
              <StatTile P={P} isDarkMode={isDarkMode} label="Booked" value={data.bookings.made}
                delta={describeDelta(data.bookings.made, data.bookings.made_prev, span)} />
              <StatTile P={P} isDarkMode={isDarkMode} label="Completed" value={data.bookings.completed} />
              <StatTile P={P} isDarkMode={isDarkMode} label="Cancelled" value={data.bookings.cancelled} />
              <StatTile P={P} isDarkMode={isDarkMode} label="Coming up" value={data.bookings.upcoming} note="from today on" />
            </View>

            <Text style={[styles.section, { color: P.sub, marginTop: 6 }]}>MONEY, LAST {span} DAYS</Text>
            <View style={card}>
              <Row P={P} label="Paid through the app" value={pounds(data.money.paid_in_pence)} />
              {moneyDelta && (
                <Text style={[styles.small, { color: deltaColor(moneyDelta.tone, P, isDarkMode), marginTop: -4, marginBottom: 6 }]}>
                  {moneyDelta.text}
                </Text>
              )}
              <Row P={P} label="CERVICED fees in that" value={pounds(data.money.fees_pence)} />
              <Row P={P} label="Refunded" value={pounds(data.money.refunded_pence)} last />
            </View>

            {/* ── Problems ────────────────────────────────────────────── */}
            <Text style={[styles.section, { color: P.sub }]}>PROBLEMS</Text>
            <View style={card}>
              {problems.map((p, i) => {
                const body = (
                  <View style={styles.problem}>
                    <Ionicons name={SEVERITY_ICON[p.severity]} size={20} color={colors[p.severity]} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.body, { color: P.text }]}>{p.label}</Text>
                      <Text style={[styles.small, { color: P.sub }]}>
                        {SEVERITY_WORD[p.severity]}{p.detail ? `. ${p.detail}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.amount, { color: P.text }]}>{formatCount(p.count)}</Text>
                    {p.target && <Ionicons name="chevron-forward" size={16} color={P.sub} />}
                  </View>
                );
                return (
                  <View key={p.id}>
                    {i > 0 && <View style={[styles.sep, { backgroundColor: P.sep }]} />}
                    {p.target ? (
                      <TouchableOpacity onPress={() => go('AdminMoney')} activeOpacity={0.7} accessibilityRole="button">
                        {body}
                      </TouchableOpacity>
                    ) : body}
                  </View>
                );
              })}
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <TouchableOpacity
                style={styles.problem}
                onPress={() => { Linking.openURL(SENTRY_ISSUES_URL).catch(err => logger.error('[AdminDashboard] open Sentry failed:', err)); }}
                activeOpacity={0.7}
                accessibilityRole="link"
              >
                <Ionicons name="bug-outline" size={20} color={P.sub} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { color: P.text }]}>App crashes and errors</Text>
                  <Text style={[styles.small, { color: P.sub }]}>These go to Sentry, not here. Opens Sentry.</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={P.sub} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.small, { color: P.sub, marginTop: -4, marginBottom: 18 }]}>
              {data.problems.checkouts_abandoned === 0
                ? 'No checkouts ran out of time in this period.'
                : `${formatCount(data.problems.checkouts_abandoned)} checkout${data.problems.checkouts_abandoned === 1 ? '' : 's'} ran out of time before payment in this period.`}
            </Text>

            {/* ── Tools ───────────────────────────────────────────────── */}
            <Text style={[styles.section, { color: P.sub }]}>TOOLS</Text>
            <View style={card}>
              <ToolRow P={P} icon="cash-outline" title="Money" subtitle="Failed payments, money owed, refund requests"
                badge={moneyBadge} onPress={() => go('AdminMoney')} />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <ToolRow P={P} icon="construct-outline" title="Developer tools" subtitle="Test pushes and emails, debug logs, resets for your own account"
                onPress={() => go('DevSettings')} />
            </View>

            <Text style={[styles.footnote, { color: P.sub }]}>
              {[updatedLabel(data.generated_at), 'Pull down to refresh.'].filter(Boolean).join('. ')}
            </Text>
          </>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function StatTile({ P, isDarkMode, label, value, delta, note }: {
  P: Palette; isDarkMode: boolean; label: string; value: number; delta?: DeltaView; note?: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: P.card, borderColor: P.border }]}>
      <Text style={[styles.small, { color: P.sub }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: P.text }]}>{formatCount(value)}</Text>
      {delta ? (
        <Text style={[styles.tileNote, { color: deltaColor(delta.tone, P, isDarkMode) }]}>{delta.text}</Text>
      ) : note ? (
        <Text style={[styles.tileNote, { color: P.sub }]}>{note}</Text>
      ) : null}
    </View>
  );
}

function Row({ P, label, value, last }: { P: Palette; label: string; value: string; last?: boolean }) {
  return (
    <>
      <View style={styles.rowBetween}>
        <Text style={[styles.body, { color: P.text, flex: 1 }]}>{label}</Text>
        <Text style={[styles.amount, { color: P.text }]}>{value}</Text>
      </View>
      {!last && <View style={[styles.sep, { backgroundColor: P.sep }]} />}
    </>
  );
}

function ToolRow({ P, icon, title, subtitle, badge, onPress }: {
  P: Palette; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; badge?: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.problem} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={P.text} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: P.text }]}>{title}</Text>
        <Text style={[styles.small, { color: P.sub }]}>{subtitle}</Text>
      </View>
      {!!badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: P.accent }]}>
          <Text style={[styles.badgeText, { color: P.onAccent }]}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={P.sub} />
    </TouchableOpacity>
  );
}

const CHART_HEIGHT = 120;

/**
 * Twelve weeks of new accounts (or new provider profiles), one bar each.
 * Single series, so no legend: the toggle names it. Tapping a bar shows its
 * week and count above the chart; with nothing tapped, the latest week shows.
 */
function WeeklyChart({ P, weeks, series, onSeries, selected, onSelect }: {
  P: Palette;
  weeks: AdminDashboardOverview['weekly'];
  series: 'accounts' | 'providers';
  onSeries: (s: 'accounts' | 'providers') => void;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const values = weeks.map(w => Number(w[series]) || 0);
  const max = Math.max(0, ...values);
  const active = selected ?? weeks.length - 1;
  const noun = series === 'accounts' ? 'new account' : 'new provider';
  const activeWeek = weeks[active];
  const activeValue = values[active] ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.label, { color: P.sub }]}>NEW EACH WEEK</Text>
        <View style={styles.segment}>
          {(['accounts', 'providers'] as const).map(s => {
            const on = series === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onSeries(s)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.segmentBtn, { backgroundColor: on ? P.accent : 'transparent', borderColor: P.border }]}
              >
                <Text style={[styles.segmentText, { color: on ? P.onAccent : P.accentText }]}>
                  {s === 'accounts' ? 'ACCOUNTS' : 'PROVIDERS'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {activeWeek && (
        <Text style={[styles.body, { color: P.text }]}>
          <Text style={{ fontWeight: '700' }}>{formatCount(activeValue)}</Text>
          {` ${noun}${activeValue === 1 ? '' : 's'} in the week of ${weekLabel(activeWeek.week_start)}`}
        </Text>
      )}

      {max === 0 ? (
        <Text style={[styles.small, { color: P.sub, marginVertical: 24 }]}>None in the last 12 weeks.</Text>
      ) : (
        <View>
          <View style={styles.axisRow}>
            <Text style={[styles.axisText, { color: P.sub }]}>{formatCount(max)}</Text>
          </View>
          <View style={[styles.plot, { borderBottomColor: P.border, borderTopColor: P.sep }]}>
            {weeks.map((w, i) => {
              const v = values[i] ?? 0;
              const h = v === 0 ? 0 : Math.max(4, (v / max) * CHART_HEIGHT);
              const isActive = i === active;
              return (
                <TouchableOpacity
                  key={w.week_start}
                  style={styles.barSlot}
                  onPress={() => onSelect(i)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Week of ${weekLabel(w.week_start)}: ${v} ${noun}${v === 1 ? '' : 's'}`}
                >
                  <View style={[styles.bar, { height: h, backgroundColor: P.accent, opacity: isActive ? 1 : 0.4 }]} />
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.axisRow}>
            <Text style={[styles.axisText, { color: P.sub }]}>{weeks[0] ? weekLabel(weeks[0].week_start) : ''}</Text>
            <Text style={[styles.axisText, { color: P.sub }]}>This week</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 32, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  chip: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.5 },
  section: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 2, marginTop: 6, marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8, marginBottom: 12 },
  hero: { fontSize: 52, fontWeight: '700', letterSpacing: -1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  tile: { width: '48%', flexGrow: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  tileValue: { fontSize: 28, fontWeight: '700' },
  tileNote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 16, letterSpacing: 1 },
  amount: { fontSize: 17, fontWeight: '700' },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  segment: { flexDirection: 'row', gap: 6 },
  segmentBtn: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 6, paddingHorizontal: 10, minHeight: 32, justifyContent: 'center' },
  segmentText: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.2 },
  plot: {
    height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    borderBottomWidth: 1, borderTopWidth: StyleSheet.hairlineWidth,
  },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  axisText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11 },
  footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
