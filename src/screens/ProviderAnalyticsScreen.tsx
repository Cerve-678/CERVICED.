import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Line as SvgLine, Circle as SvgCircle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { getProviderBookings, getMyProviderReviews, getMyBookmarkCount } from '../services/databaseService';
import type { BookingWithAddOns, ReviewWithUser } from '../types/database';
import { ThemedBackground } from '../components/ThemedBackground';

const { width: W } = Dimensions.get('window');
const BAR_W = W - 48;

// ── Palette ───────────────────────────────────────────────────────────────────

const P = {
  violet:  '#BF5AF2',
  purple:  '#9B59D0',
  pink:    '#FF375F',
  teal:    '#5AC8FA',
  green:   '#30D158',
  amber:   '#FF9F0A',
  blue:    '#0A84FF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGBP(n: number) {
  return n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n.toFixed(0)}`;
}

function monthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonthKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function totalForBookings(bs: BookingWithAddOns[]): number {
  return bs.reduce((s, b) => {
    const addOns = b.add_ons?.reduce((a, x) => a + x.price_snapshot, 0) ?? 0;
    return s + b.base_price + addOns;
  }, 0);
}

// ── Animated number ───────────────────────────────────────────────────────────

function AnimatedNumber({ value, prefix = '', suffix = '', style }: {
  value: number; prefix?: string; suffix?: string; style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration: 900, useNativeDriver: false }).start();
    const id = anim.addListener(({ value: v }) =>
      setDisplay(prefix + (Number.isInteger(value) ? Math.round(v).toString() : v.toFixed(2)) + suffix)
    );
    return () => anim.removeListener(id);
  }, [value]);

  return <Text style={style}>{display}</Text>;
}

// ── Liquid glass panel ────────────────────────────────────────────────────────

function GlassPanel({
  children,
  style,
  dark,
}: {
  children: React.ReactNode;
  style?: any;
  dark: boolean;
}) {
  return (
    <View style={[glass.outer, style]}>
      <BlurView
        intensity={dark ? 40 : 60}
        tint={dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={
          dark
            ? ['rgba(180,100,255,0.12)', 'rgba(90,60,160,0.06)', 'rgba(0,0,0,0)']
            : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.40)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* inner shimmer rim */}
      <LinearGradient
        colors={
          dark
            ? ['rgba(200,150,255,0.25)', 'transparent', 'rgba(90,200,250,0.12)']
            : ['rgba(255,255,255,0.9)', 'transparent', 'rgba(180,100,255,0.15)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, glass.rim]}
      />
      <View style={glass.content}>{children}</View>
    </View>
  );
}

const glass = StyleSheet.create({
  outer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200,150,255,0.2)',
  },
  rim: { borderRadius: 23 },
  content: { position: 'relative', zIndex: 1 },
});

// ── Bar chart ─────────────────────────────────────────────────────────────────

function RevenueChart({
  data,
  dark,
  theme,
}: {
  data: { label: string; revenue: number; bookings: number }[];
  dark: boolean;
  theme: any;
}) {
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const anims  = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      60,
      anims.map((a, i) =>
        Animated.spring(a, {
          toValue: data[i]!.revenue / maxRev,
          tension: 60,
          friction: 10,
          useNativeDriver: false,
        })
      )
    ).start();
  }, [data, maxRev]);

  const BAR_TOTAL_H = 100;

  return (
    <View style={chart.wrap}>
      <View style={chart.bars}>
        {data.map((d, i) => (
          <View key={d.label} style={chart.barCol}>
            <View style={[chart.barBg, { height: BAR_TOTAL_H }]}>
              <Animated.View
                style={[
                  chart.bar,
                  {
                    height: anims[i]!.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, BAR_TOTAL_H],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={[P.violet, P.purple]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
            <Text style={[chart.label, { color: theme.secondaryText }]}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const chart = StyleSheet.create({
  wrap:   { paddingTop: 8 },
  bars:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barBg:  { width: '100%', justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(150,100,220,0.12)' },
  bar:    { width: '100%', borderRadius: 6, overflow: 'hidden' },
  label:  { fontSize: 10, fontWeight: '500' },
});

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  icon,
  color,
  dark,
  theme,
  animate,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: string;
  color: string;
  dark: boolean;
  theme: any;
  animate?: boolean;
}) {
  return (
    <GlassPanel dark={dark} style={tile.panel}>
      <View style={tile.inner}>
        <View style={[tile.icon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={14} color={color} />
        </View>
        {animate ? (
          <AnimatedNumber
            value={value}
            prefix="£"
            style={[tile.value, { color: theme.text }]}
          />
        ) : (
          <Text style={[tile.value, { color: theme.text }]}>{value}</Text>
        )}
        <Text style={[tile.label, { color: theme.secondaryText }]}>{label}</Text>
        {sub ? <Text style={[tile.sub, { color: color }]}>{sub}</Text> : null}
      </View>
    </GlassPanel>
  );
}

const TILE_W = (W - 40 - 20) / 3; // body pad 20×2, two gaps of 10

const tile = StyleSheet.create({
  panel: { width: TILE_W },
  inner: { padding: 12, gap: 3 },
  icon:  { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  value: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  label: { fontSize: 10, fontWeight: '500' },
  sub:   { fontSize: 10, fontWeight: '600' },
});

// ── Top services ──────────────────────────────────────────────────────────────

function TopServices({
  bookings,
  dark,
  theme,
}: {
  bookings: BookingWithAddOns[];
  dark: boolean;
  theme: any;
}) {
  const ranked = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const b of bookings.filter(b => b.status === 'completed')) {
      const name = b.service_name_snapshot;
      const addOns = b.add_ons?.reduce((s, a) => s + a.price_snapshot, 0) ?? 0;
      const rev    = b.base_price + addOns;
      const cur    = map.get(name) ?? { count: 0, revenue: 0 };
      map.set(name, { count: cur.count + 1, revenue: cur.revenue + rev });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [bookings]);

  const maxRev = Math.max(...ranked.map(r => r.revenue), 1);

  if (ranked.length === 0) return null;

  return (
    <GlassPanel dark={dark} style={{ marginBottom: 16 }}>
      <View style={svc.inner}>
        <Text style={[svc.heading, { color: theme.text }]}>Top Services</Text>
        {ranked.map((item, i) => {
          const fill = item.revenue / maxRev;
          const COLORS = [P.violet, P.blue, P.teal, P.green, P.amber];
          const c = COLORS[i % COLORS.length]!;
          return (
            <View key={item.name} style={svc.row}>
              <View style={[svc.rank, { backgroundColor: c + '1A' }]}>
                <Text style={[svc.rankText, { color: c }]}>{i + 1}</Text>
              </View>
              <View style={svc.nameCol}>
                <Text style={[svc.name, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={[svc.track, { backgroundColor: c + '1A' }]}>
                  <View style={[svc.fill, { width: `${fill * 100}%`, backgroundColor: c }]} />
                </View>
              </View>
              <View style={svc.right}>
                <Text style={[svc.rev, { color: theme.text }]}>{fmtGBP(item.revenue)}</Text>
                <Text style={[svc.cnt, { color: theme.secondaryText }]}>{item.count}×</Text>
              </View>
            </View>
          );
        })}
      </View>
    </GlassPanel>
  );
}

const svc = StyleSheet.create({
  inner:    { padding: 20, gap: 14 },
  heading:  { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank:     { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText: { fontSize: 11, fontWeight: '800' },
  nameCol:  { flex: 1, gap: 5 },
  name:     { fontSize: 13, fontWeight: '600' },
  track:    { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill:     { height: 4, borderRadius: 2 },
  right:    { alignItems: 'flex-end', gap: 1 },
  rev:      { fontSize: 13, fontWeight: '700' },
  cnt:      { fontSize: 10 },
});

// ── Booking stream (recent) ───────────────────────────────────────────────────

function RecentStream({
  bookings,
  dark,
  theme,
  onPress,
}: {
  bookings: BookingWithAddOns[];
  dark: boolean;
  theme: any;
  onPress: (b: BookingWithAddOns) => void;
}) {
  const recent = useMemo(
    () =>
      [...bookings]
        .sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 6),
    [bookings]
  );

  if (recent.length === 0) return null;

  const STATUS_COL: Record<string, string> = {
    completed: P.green, cancelled: P.pink, pending: P.amber,
    confirmed: P.blue, no_show: P.amber, in_progress: P.violet,
  };

  return (
    <GlassPanel dark={dark} style={{ marginBottom: 16 }}>
      <View style={stream.inner}>
        <Text style={[stream.heading, { color: theme.text }]}>Recent Activity</Text>
        {recent.map((b, i) => {
          const color = STATUS_COL[b.status] ?? '#8E8E93';
          const addOns = b.add_ons?.reduce((s, a) => s + a.price_snapshot, 0) ?? 0;
          const total  = b.base_price + addOns;
          const isLast = i === recent.length - 1;
          return (
            <TouchableOpacity
              key={b.id}
              onPress={() => onPress(b)}
              activeOpacity={0.7}
              style={stream.row}
            >
              {/* timeline */}
              <View style={stream.timelineCol}>
                <View style={[stream.dot, { backgroundColor: color }]} />
                {!isLast && (
                  <View style={[stream.line, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />
                )}
              </View>
              <View style={stream.body}>
                <View style={stream.topRow}>
                  <Text style={[stream.service, { color: theme.text }]} numberOfLines={1}>
                    {b.service_name_snapshot}
                  </Text>
                  <Text style={[stream.price, { color: theme.text }]}>£{total.toFixed(2)}</Text>
                </View>
                <Text style={[stream.client, { color: theme.secondaryText }]} numberOfLines={1}>
                  {b.customer_name ?? '—'} · {new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassPanel>
  );
}

const stream = StyleSheet.create({
  inner:       { padding: 20, gap: 0 },
  heading:     { fontSize: 14, fontWeight: '700', letterSpacing: -0.2, marginBottom: 14 },
  row:         { flexDirection: 'row', gap: 12, paddingBottom: 14 },
  timelineCol: { width: 16, alignItems: 'center' },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  line:        { flex: 1, width: 1.5, marginTop: 4 },
  body:        { flex: 1, gap: 3 },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  service:     { fontSize: 13, fontWeight: '600', flex: 1 },
  price:       { fontSize: 13, fontWeight: '700' },
  client:      { fontSize: 12 },
});

// ── Completion ring (pure View arcs) ──────────────────────────────────────────

function CompletionRing({
  rate,
  dark,
  theme,
}: {
  rate: number;
  dark: boolean;
  theme: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: rate, duration: 1000, useNativeDriver: false }).start();
  }, [rate]);

  const SIZE  = 110;
  const THICK = 10;
  const R     = (SIZE - THICK) / 2;
  const CIRC  = 2 * Math.PI * R;

  return (
    <GlassPanel dark={dark} style={{ marginBottom: 16 }}>
      <View style={ring.inner}>
        <Text style={[ring.heading, { color: theme.text }]}>Completion Rate</Text>
        <View style={ring.row}>
          {/* SVG-less ring via border tricks */}
          <View style={[ring.container, { width: SIZE, height: SIZE }]}>
            {/* track */}
            <View style={[ring.track, { borderColor: dark ? 'rgba(150,100,220,0.15)' : 'rgba(150,100,220,0.12)', borderWidth: THICK, borderRadius: SIZE / 2, width: SIZE, height: SIZE }]} />
            {/* fill — use a conic approximation with two half-circles */}
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={[ring.pct, { color: P.violet }]}>{Math.round(rate * 100)}%</Text>
              <Text style={[ring.sub, { color: theme.secondaryText }]}>completed</Text>
            </View>
          </View>
          <View style={ring.stats}>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: P.green }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Completed</Text>
            </View>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: P.amber }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Pending</Text>
            </View>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: P.pink }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Cancelled</Text>
            </View>
          </View>
        </View>
      </View>
    </GlassPanel>
  );
}

const ring = StyleSheet.create({
  inner:     { padding: 20, gap: 14 },
  heading:   { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 24 },
  container: { alignItems: 'center', justifyContent: 'center' },
  track:     { position: 'absolute' },
  pct:       { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  sub:       { fontSize: 10, fontWeight: '500' },
  stats:     { flex: 1, gap: 10 },
  statRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  statLabel: { fontSize: 12 },
});

// ── Rating analytics ──────────────────────────────────────────────────────────

const RATING_CHART_W = W - 80; // body pad 20×2 + glass pad 20×2
const RATING_CHART_H = 88;
const RATING_MONTHS  = 6;

function StarDistRow({
  star, count, total, dark, theme,
}: {
  star: number; count: number; total: number; dark: boolean; theme: any;
}) {
  const pct  = total > 0 ? count / total : 0;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: pct, tension: 60, friction: 10, useNativeDriver: false }).start();
  }, [pct]);
  const color = star >= 4 ? P.green : star === 3 ? P.amber : P.pink;
  return (
    <View style={rta.starRow}>
      <View style={rta.starLabelGroup}>
        {Array.from({ length: star }, (_, i) => (
          <Ionicons key={i} name="star" size={9} color={P.amber} />
        ))}
      </View>
      <View style={[rta.track, { backgroundColor: dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)' }]}>
        <Animated.View
          style={[
            rta.trackFill,
            {
              backgroundColor: color,
              width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
      <Text style={[rta.starCount, { color: theme.secondaryText }]}>{count}</Text>
    </View>
  );
}

function RatingAnalytics({
  reviews,
  bookings,
  dark,
  theme,
}: {
  reviews: ReviewWithUser[];
  bookings: BookingWithAddOns[];
  dark: boolean;
  theme: any;
}) {
  const bookingServiceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) map.set(b.id, b.service_name_snapshot);
    return map;
  }, [bookings]);

  const stats = useMemo(() => {
    if (reviews.length === 0) return null;
    const avg  = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      const star = Math.round(r.rating);
      if (star >= 1 && star <= 5) dist[star]!++;
    }
    return { avg, dist };
  }, [reviews]);

  const monthlyRatings = useMemo(() =>
    Array.from({ length: RATING_MONTHS }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (RATING_MONTHS - 1 - i));
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-GB', { month: 'short' });
      const bucket = reviews.filter(r => r.created_at.startsWith(key));
      const avg    = bucket.length > 0 ? bucket.reduce((s, r) => s + r.rating, 0) / bucket.length : null;
      return { label, avg, count: bucket.length };
    }),
  [reviews]);

  const serviceRatings = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      const name = bookingServiceMap.get(r.booking_id);
      if (!name) continue;
      const cur = map.get(name) ?? { sum: 0, count: 0 };
      map.set(name, { sum: cur.sum + r.rating, count: cur.count + 1 });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, avg: v.sum / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);
  }, [reviews, bookingServiceMap]);

  if (!stats) return null;

  // build trend path — skip months with no data
  const pts = monthlyRatings.map((m, j) => ({
    x: j === 0 ? 0 : (j / (RATING_MONTHS - 1)) * RATING_CHART_W,
    y: m.avg !== null
      ? RATING_CHART_H - ((m.avg - 1) / 4) * (RATING_CHART_H - 10)
      : null,
  }));
  let trendPath = '';
  let firstPt   = true;
  for (const p of pts) {
    if (p.y === null) { firstPt = true; continue; }
    trendPath += `${firstPt ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    firstPt = false;
  }
  const validPts = monthlyRatings.filter(m => m.avg !== null).length;

  return (
    <GlassPanel dark={dark} style={rta.panel}>
      <View style={rta.inner}>

        {/* Title */}
        <View style={rta.titleRow}>
          <Ionicons name="star" size={14} color={P.amber} />
          <Text style={[rta.heading, { color: theme.text }]}>Rating Analytics</Text>
        </View>

        {/* Hero average */}
        <View style={rta.hero}>
          <Text style={[rta.avgBig, { color: P.amber }]}>{stats.avg.toFixed(1)}</Text>
          <View style={rta.starsRow}>
            {Array.from({ length: 5 }, (_, i) => {
              const full = i < Math.floor(stats.avg);
              const half = !full && i < stats.avg;
              return (
                <Ionicons
                  key={i}
                  name={full ? 'star' : half ? 'star-half' : 'star-outline'}
                  size={18}
                  color={P.amber}
                />
              );
            })}
          </View>
          <Text style={[rta.reviewCount, { color: theme.secondaryText }]}>
            {reviews.length} review{reviews.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Star distribution */}
        <View style={rta.distBlock}>
          {[5, 4, 3, 2, 1].map(star => (
            <StarDistRow
              key={star}
              star={star}
              count={stats.dist[star] ?? 0}
              total={reviews.length}
              dark={dark}
              theme={theme}
            />
          ))}
        </View>

        {/* Monthly trend line */}
        {validPts >= 2 && (
          <View style={rta.trendBlock}>
            <Text style={[rta.subheading, { color: theme.text }]}>Rating Trend</Text>
            <Svg width={RATING_CHART_W} height={RATING_CHART_H + 4} style={{ marginTop: 10 }}>
              {/* dashed reference lines at 3★ and 4★ */}
              {[3, 4].map(v => {
                const y = RATING_CHART_H - ((v - 1) / 4) * (RATING_CHART_H - 10);
                return (
                  <SvgLine
                    key={v}
                    x1={0} y1={y} x2={RATING_CHART_W} y2={y}
                    stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                );
              })}
              <SvgLine
                x1={0} y1={RATING_CHART_H} x2={RATING_CHART_W} y2={RATING_CHART_H}
                stroke={dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}
                strokeWidth={1}
              />
              {trendPath ? (
                <Path
                  d={trendPath}
                  stroke={P.amber}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {pts.map((p, j) =>
                p.y !== null ? (
                  <SvgCircle key={j} cx={p.x} cy={p.y} r={4} fill={P.amber} />
                ) : null
              )}
            </Svg>
            <View style={rta.axisRow}>
              {monthlyRatings.map((m, j) =>
                j === 0 || j === Math.floor(RATING_MONTHS / 2) || j === RATING_MONTHS - 1 ? (
                  <Text key={j} style={[rta.axisLabel, { color: theme.secondaryText }]}>{m.label}</Text>
                ) : null
              )}
            </View>
          </View>
        )}

        {/* Per-service ratings */}
        {serviceRatings.length > 0 && (
          <View style={rta.svcBlock}>
            <Text style={[rta.subheading, { color: theme.text }]}>By Service</Text>
            {serviceRatings.map((s, i) => {
              const SVC_COLORS = [P.violet, P.blue, P.teal, P.green];
              const c = SVC_COLORS[i % SVC_COLORS.length]!;
              return (
                <View key={s.name} style={rta.svcRow}>
                  <Text style={[rta.svcName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                  <View style={rta.svcRight}>
                    <View style={rta.svcStars}>
                      {Array.from({ length: 5 }, (_, k) => (
                        <Ionicons key={k} name={k < Math.round(s.avg) ? 'star' : 'star-outline'} size={10} color={P.amber} />
                      ))}
                    </View>
                    <Text style={[rta.svcAvg, { color: c }]}>{s.avg.toFixed(1)}</Text>
                    <Text style={[rta.svcCnt, { color: theme.secondaryText }]}>({s.count})</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </View>
    </GlassPanel>
  );
}

const rta = StyleSheet.create({
  panel:          { marginBottom: 16 },
  inner:          { padding: 20, gap: 16 },
  titleRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading:        { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  subheading:     { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },

  hero:           { alignItems: 'center', gap: 6, paddingVertical: 4 },
  avgBig:         { fontSize: 56, fontWeight: '900', letterSpacing: -2.5 },
  starsRow:       { flexDirection: 'row', gap: 4 },
  reviewCount:    { fontSize: 12, fontWeight: '500' },

  distBlock:      { gap: 9 },
  starRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starLabelGroup: { flexDirection: 'row', gap: 1, width: 50, justifyContent: 'flex-end' },
  track:          { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill:      { height: 6, borderRadius: 3 },
  starCount:      { fontSize: 11, fontWeight: '500', width: 22, textAlign: 'right' },

  trendBlock:     { gap: 0 },
  axisRow:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel:      { fontSize: 9, fontWeight: '500' },

  svcBlock:       { gap: 10 },
  svcRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  svcName:        { flex: 1, fontSize: 12, fontWeight: '600' },
  svcRight:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  svcStars:       { flexDirection: 'row', gap: 1 },
  svcAvg:         { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
  svcCnt:         { fontSize: 10 },
});

// ── Service quadrant line charts ──────────────────────────────────────────────

const QUAD_W        = (W - 92) / 2;  // two cols inside glass panel (padding 20) + gap 12
const QUAD_CHART_W  = QUAD_W - 24;   // 12px padding each side of quadrant
const QUAD_CHART_H  = 72;
const QUAD_COLORS   = [P.violet, P.teal, P.green, P.amber];

function ServiceQuadrantCharts({
  bookings,
  dark,
  theme,
}: {
  bookings: BookingWithAddOns[];
  dark: boolean;
  theme: any;
}) {
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        return {
          key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-GB', { month: 'short' }),
        };
      }),
    []
  );

  const topServices = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      map.set(b.service_name_snapshot, (map.get(b.service_name_snapshot) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
  }, [bookings]);

  const serviceData = useMemo(
    () =>
      topServices.map(name => ({
        name,
        monthly: months.map(m => ({
          label: m.label,
          count: bookings.filter(
            b => b.service_name_snapshot === name && monthKey(b.booking_date) === m.key
          ).length,
        })),
      })),
    [topServices, months, bookings]
  );

  if (topServices.length === 0) return null;

  return (
    <GlassPanel dark={dark} style={quad.panel}>
      <View style={quad.inner}>
        <View style={quad.titleRow}>
          <Ionicons name="trending-up" size={14} color={P.violet} />
          <Text style={[quad.heading, { color: theme.text }]}>Service Trends</Text>
        </View>
        <View style={quad.grid}>
          {serviceData.map((svc, i) => {
            const color   = QUAD_COLORS[i % QUAD_COLORS.length]!;
            const maxVal  = Math.max(...svc.monthly.map(m => m.count), 1);
            const pts     = svc.monthly.map((m, j) => ({
              x: j === 0 ? 0 : (j / (svc.monthly.length - 1)) * QUAD_CHART_W,
              y: QUAD_CHART_H - (m.count / maxVal) * (QUAD_CHART_H - 6),
            }));
            const linePath = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            const areaPath = `${linePath} L${pts[pts.length - 1]!.x.toFixed(1)},${QUAD_CHART_H} L0,${QUAD_CHART_H} Z`;
            const total    = svc.monthly.reduce((s, m) => s + m.count, 0);

            return (
              <View
                key={svc.name}
                style={[
                  quad.quadrant,
                  {
                    backgroundColor: dark ? color + '14' : color + '0D',
                    borderColor: color + '35',
                  },
                ]}
              >
                <Text style={[quad.svcName, { color: theme.text }]} numberOfLines={2}>
                  {svc.name}
                </Text>
                <Text style={[quad.totalCount, { color: color }]}>
                  {total}
                  <Text style={[quad.totalSuffix, { color: theme.secondaryText }]}> bkgs</Text>
                </Text>
                <Svg width={QUAD_CHART_W} height={QUAD_CHART_H + 2} style={quad.chart}>
                  <SvgLine
                    x1={0} y1={QUAD_CHART_H} x2={QUAD_CHART_W} y2={QUAD_CHART_H}
                    stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
                    strokeWidth={1}
                  />
                  <Path d={areaPath} fill={color + '28'} />
                  <Path
                    d={linePath}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {pts.map((p, j) => (
                    <SvgCircle key={j} cx={p.x} cy={p.y} r={3} fill={color} />
                  ))}
                </Svg>
                <View style={quad.axisRow}>
                  <Text style={[quad.axisLabel, { color: theme.secondaryText }]}>
                    {svc.monthly[0]!.label}
                  </Text>
                  <Text style={[quad.axisLabel, { color: theme.secondaryText }]}>
                    {svc.monthly[svc.monthly.length - 1]!.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </GlassPanel>
  );
}

const quad = StyleSheet.create({
  panel:       { marginBottom: 16 },
  inner:       { padding: 20, gap: 14 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading:     { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quadrant:    { width: QUAD_W, padding: 12, borderRadius: 16, borderWidth: 1, gap: 2 },
  svcName:     { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  totalCount:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  totalSuffix: { fontSize: 10, fontWeight: '500' },
  chart:       { marginTop: 6 },
  axisRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  axisLabel:   { fontSize: 9, fontWeight: '500' },
});

// ── Range pill ────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: '7d',  label: '7d'  },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProviderAnalyticsScreen({ navigation }: any) {
  const { theme, isDarkMode: dark } = useTheme();
  const [bookings, setBookings]         = useState<BookingWithAddOns[]>([]);
  const [reviews, setReviews]           = useState<ReviewWithUser[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [range, setRange]               = useState<Range>('30d');

  const fetchAll = useCallback(async () => {
    try {
      const [b, r, fc] = await Promise.all([
        getProviderBookings(),
        getMyProviderReviews(),
        getMyBookmarkCount(),
      ]);
      setBookings(b);
      setReviews(r);
      setFollowerCount(fc);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // Filter by range
  const inRange = useMemo(() => {
    if (range === 'all') return bookings;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return bookings.filter(b => new Date(b.booking_date + 'T00:00:00') >= cutoff);
  }, [bookings, range]);

  // KPIs
  const kpi = useMemo(() => {
    const completed  = inRange.filter(b => b.status === 'completed');
    const revenue    = totalForBookings(completed);
    const pending    = inRange.filter(b => b.status === 'pending').length;
    const cancelled  = inRange.filter(b => b.status === 'cancelled').length;
    const noShow     = inRange.filter(b => b.status === 'no_show').length;
    const total      = inRange.length;
    const cRate      = total > 0 ? completed.length / total : 0;

    // Month-over-month revenue
    const thisMonth  = totalForBookings(bookings.filter(b => b.status === 'completed' && monthKey(b.booking_date) === currentMonthKey()));
    const lastMonth  = totalForBookings(bookings.filter(b => b.status === 'completed' && monthKey(b.booking_date) === prevMonthKey()));
    const momDelta   = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

    return { revenue, pending, cancelled, noShow, total, cRate, thisMonth, lastMonth, momDelta };
  }, [inRange, bookings]);

  // 6-month bar chart data
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bs  = bookings.filter(b => b.status === 'completed' && monthKey(b.booking_date) === key);
      return {
        label:    d.toLocaleDateString('en-GB', { month: 'short' }),
        revenue:  totalForBookings(bs),
        bookings: bs.length,
      };
    });
  }, [bookings]);

  const momColor = kpi.momDelta >= 0 ? P.green : P.pink;
  const momSign  = kpi.momDelta >= 0 ? '+' : '';

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.violet} />
          }
        >

          {/* ── Header ── */}
          <View style={main.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[main.backBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </TouchableOpacity>
            <View style={main.titleRow}>
              <Ionicons name="stats-chart" size={18} color={P.violet} />
              <Text style={[main.title, { color: theme.text }]}>Provider Analytics</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          {/* ── Range selector + history button ── */}
          <View style={main.rangeArea}>
            <View style={main.rangeRow}>
              {RANGES.map(r => {
                const active = range === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => setRange(r.key)}
                    style={[
                      main.rangeBtn,
                      active
                        ? { backgroundColor: P.violet }
                        : { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' },
                    ]}
                  >
                    <Text style={[main.rangeTxt, { color: active ? '#fff' : theme.secondaryText }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Three-bar history button */}
            <TouchableOpacity
              onPress={() => navigation.navigate('BookingHistory')}
              style={[main.historyBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}
            >
              <Ionicons name="menu" size={20} color={theme.secondaryText} />
            </TouchableOpacity>
          </View>

          <View style={main.body}>

            {/* ── Hero revenue glass panel ── */}
            <GlassPanel dark={dark} style={main.heroPanel}>
              <LinearGradient
                colors={[P.violet + '30', P.purple + '18', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1.5 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
              <View style={main.heroInner}>
                <View style={main.heroTop}>
                  <View>
                    <Text style={[main.heroLabel, { color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }]}>
                      Total Revenue
                    </Text>
                    <AnimatedNumber
                      value={kpi.revenue}
                      prefix="£"
                      style={main.heroValue}
                    />
                  </View>
                  <View style={[main.momBadge, { backgroundColor: momColor + '20' }]}>
                    <Ionicons
                      name={kpi.momDelta >= 0 ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={momColor}
                    />
                    <Text style={[main.momTxt, { color: momColor }]}>
                      {momSign}{kpi.momDelta.toFixed(1)}%
                    </Text>
                  </View>
                </View>
                <Text style={[main.heroSub, { color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }]}>
                  vs £{kpi.lastMonth.toFixed(0)} last month
                </Text>

                {/* Inline bar chart */}
                <View style={{ marginTop: 20 }}>
                  <RevenueChart data={chartData} dark={dark} theme={theme} />
                </View>
              </View>
            </GlassPanel>

            {/* ── Stat tile grid (3×2) ── */}
            <View style={main.tileGrid}>
              <StatTile label="Bookings"  value={kpi.total}                                              icon="calendar"       color={P.blue}   dark={dark} theme={theme} />
              <StatTile label="Completed" value={inRange.filter(b => b.status === 'completed').length}   icon="checkmark-done" color={P.green}  dark={dark} theme={theme} />
              <StatTile label="Saved"     value={followerCount}                                          icon="bookmark"       color={P.violet} dark={dark} theme={theme} />
              <StatTile label="Pending"   value={kpi.pending}                                            icon="time"           color={P.amber}  dark={dark} theme={theme} />
              <StatTile label="No Shows"  value={kpi.noShow}                                             icon="alert-circle"   color={P.pink}   dark={dark} theme={theme} />
              <StatTile
                label="Avg Rating"
                value={reviews.length > 0 ? parseFloat((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)) : 0}
                sub={reviews.length > 0 ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''}` : 'No reviews yet'}
                icon="star"
                color={P.amber}
                dark={dark}
                theme={theme}
              />
              <StatTile label="Cancelled" value={kpi.cancelled}                                          icon="close-circle"   color={P.purple} dark={dark} theme={theme} />
            </View>

            {/* ── Completion rate ── */}
            <CompletionRing rate={kpi.cRate} dark={dark} theme={theme} />

            {/* ── Top services ── */}
            <TopServices bookings={inRange} dark={dark} theme={theme} />

            {/* ── Service quadrant line charts ── */}
            <ServiceQuadrantCharts bookings={bookings} dark={dark} theme={theme} />

            {/* ── Rating analytics ── */}
            <RatingAnalytics reviews={reviews} bookings={bookings} dark={dark} theme={theme} />

            {/* ── Recent activity ── */}
            <RecentStream
              bookings={inRange}
              dark={dark}
              theme={theme}
              onPress={b =>
                navigation.navigate('BookingDetail', { bookingId: b.id, booking: b })
              }
            />

          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const main = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title:      { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },


  rangeArea:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  rangeRow:   { flex: 1, flexDirection: 'row', gap: 8 },
  rangeBtn:   { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  rangeTxt:   { fontSize: 13, fontWeight: '600' },
  historyBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  body:       { paddingHorizontal: 20, gap: 12 },

  heroPanel:  { marginBottom: 4 },
  heroInner:  { padding: 24 },
  heroTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLabel:  { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  heroValue:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: '#fff' },
  heroSub:    { fontSize: 12, marginTop: 2 },
  momBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  momTxt:     { fontSize: 12, fontWeight: '700' },

  tileRow:    { flexDirection: 'row', gap: 12 },
  tileGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
