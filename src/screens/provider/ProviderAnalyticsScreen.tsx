import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  useWindowDimensions,
  Easing,
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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { getProviderBookings, getMyProviderReviews, getMyBookmarkCount } from '../../services/databaseService';
import { mapDbBookingToConfirmed } from '../../services/bookingService';
import type { BookingWithAddOns, ReviewWithUser } from '../../types/database';
import { ThemedBackground } from '../../components/ThemedBackground';
import { formatShortDate } from '../../utils/dateUtils';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);


// ── Palette ───────────────────────────────────────────────────────────────────
//
// Chrome (backgrounds, headers, the completion ring, "your accent" moments)
// follows the real provider theme (theme.accent: #5C4033 light / #AF9197
// dark) via accentColor(dark) below, not a hardcoded brand color — this
// screen had drifted onto a standalone violet/purple identity that no other
// provider screen uses. Multi-series chart data (bars, per-service lines,
// status dots) still needs a distinct qualitative palette — a single accent
// can't visually separate 5+ simultaneous series — so CHART keeps its own
// fixed set, used alongside the accent rather than instead of it.

function accentColor(dark: boolean) {
  return dark ? '#AF9197' : '#5C4033';
}

const CHART = {
  pink:  '#FF375F',
  teal:  '#5AC8FA',
  green: '#30D158',
  amber: '#FF9F0A',
  blue:  '#0A84FF',
  plum:  '#9B59D0',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGBP(n: number) {
  return n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n.toFixed(0)}`;
}

// Anchors to the 1st before subtracting so short months (e.g. Feb) don't
// overflow into the next month when today's day-of-month doesn't exist there.
function monthsAgo(offset: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d;
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
  const d = monthsAgo(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function totalForBookings(bs: BookingWithAddOns[]): number {
  return bs.reduce((s, b) => {
    const addOns = b.add_ons?.reduce((a, x) => a + (x.price_snapshot ?? 0), 0) ?? 0;
    return s + (b.base_price ?? 0) + addOns;
  }, 0);
}

// ── Entrance reveal (fade + rise, staggered by index) ────────────────────────

function Reveal({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 480,
      // Capped so later sections (Rating Analytics, Recent Activity) don't
      // keep pushing further out as more cards are added above them — the
      // stagger should read as a quick ripple, not a growing wait.
      delay: Math.min(index, 5) * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ── Press scale wrapper (spring feedback + optional haptic) ─────────────────

function PressScale({
  children,
  onPress,
  style,
  haptic = 'selection',
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  haptic?: 'selection' | 'light' | 'medium' | 'none';
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };
  const handlePress = () => {
    if (haptic === 'selection') Haptics.selectionAsync().catch(() => {});
    else if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress?.();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

// ── Animated number ───────────────────────────────────────────────────────────

function AnimatedNumber({ value, prefix = '', suffix = '', style }: {
  value: number; prefix?: string; suffix?: string; style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: value, useNativeDriver: false, speed: 8, bounciness: 4 }).start();
    const id = anim.addListener(({ value: v }) =>
      setDisplay(prefix + (Number.isInteger(value) ? Math.round(v).toString() : v.toFixed(2)) + suffix)
    );
    return () => anim.removeListener(id);
  }, [anim, prefix, suffix, value]);

  return <Text style={style}>{display}</Text>;
}

// ── Deck card (flat, tinted-shadow — Command Deck) ────────────────────────────

function DeckCard({
  children,
  style,
  dark,
  tint,
}: {
  children: React.ReactNode;
  style?: any;
  dark: boolean;
  tint?: string;
}) {
  const c = tint ?? accentColor(dark);
  return (
    <View
      style={[
        deck.outer,
        {
          backgroundColor: dark ? '#221E1D' : '#FFFFFF',
          borderColor: dark ? 'rgba(175,145,151,0.14)' : 'rgba(92,64,51,0.08)',
          shadowColor: c,
        },
        style,
      ]}
    >
      <View style={deck.content}>{children}</View>
    </View>
  );
}

const deck = StyleSheet.create({
  outer: {
    borderRadius: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 3,
  },
  content: { position: 'relative' },
});

// ── Live pulse badge ──────────────────────────────────────────────────────────

function LivePulse({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <View style={pulse.wrap}>
      <Animated.View
        style={[
          pulse.ring,
          {
            borderColor: color,
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          },
        ]}
      />
      <View style={[pulse.dot, { backgroundColor: color }]} />
    </View>
  );
}

const pulse = StyleSheet.create({
  wrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot:  { width: 8, height: 8, borderRadius: 4 },
  ring: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
});

// ── Bar chart ─────────────────────────────────────────────────────────────────

function RevenueChart({
  data,
  dark,
  theme,
  accent,
}: {
  data: { label: string; revenue: number; bookings: number }[];
  dark: boolean;
  theme: any;
  accent: string;
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
  }, [anims, data, maxRev]);

  const BAR_TOTAL_H = 100;

  return (
    <View style={chart.wrap}>
      <View style={chart.bars}>
        {data.map((d, i) => (
          <View key={d.label} style={chart.barCol}>
            <View style={[chart.barBg, { height: BAR_TOTAL_H, backgroundColor: dark ? 'rgba(175,145,151,0.14)' : 'rgba(92,64,51,0.08)' }]}>
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
                  colors={[accent, accent + 'AA']}
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
  barBg:  { width: '100%', justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden' },
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
  const { width: screenWidth } = useWindowDimensions();
  return (
    <DeckCard dark={dark} tint={color} style={[tile.panel, { width: tileWidth(screenWidth) }]}>
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
    </DeckCard>
  );
}

/** Widths are derived from the live window width rather than a value frozen at
 *  module load, so they stay right after a rotation or in split-screen. */
const tileWidth = (screenWidth: number) => (screenWidth - 40 - 20) / 3; // body pad 20×2, two gaps of 10

const tile = StyleSheet.create({
  panel: {},
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
      const addOns = b.add_ons?.reduce((s, a) => s + (a.price_snapshot ?? 0), 0) ?? 0;
      const rev    = (b.base_price ?? 0) + addOns;
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
    <DeckCard dark={dark} style={{ marginBottom: 16 }}>
      <View style={svc.inner}>
        <Text style={[svc.heading, { color: theme.text }]}>Top Services</Text>
        {ranked.map((item, i) => {
          const fill = item.revenue / maxRev;
          const COLORS = [accentColor(dark), CHART.blue, CHART.teal, CHART.green, CHART.amber];
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
                  <AnimatedFillBar fraction={fill} color={c} />
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
    </DeckCard>
  );
}

function AnimatedFillBar({ fraction, color }: { fraction: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: fraction, tension: 50, friction: 9, useNativeDriver: false }).start();
  }, [anim, fraction]);
  return (
    <Animated.View
      style={[
        svc.fill,
        { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
      ]}
    />
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
    completed: CHART.green, cancelled: CHART.pink, pending: CHART.amber,
    confirmed: CHART.blue, no_show: CHART.amber, in_progress: accentColor(dark),
  };

  return (
    <DeckCard dark={dark} style={{ marginBottom: 16 }}>
      <View style={stream.inner}>
        <Text style={[stream.heading, { color: theme.text }]}>Recent Activity</Text>
        {recent.map((b, i) => {
          const color = STATUS_COL[b.status] ?? '#8E8E93';
          const addOns = b.add_ons?.reduce((s, a) => s + (a.price_snapshot ?? 0), 0) ?? 0;
          const total  = (b.base_price ?? 0) + addOns;
          const isLast = i === recent.length - 1;
          return (
            <PressScale key={b.id} onPress={() => onPress(b)} haptic="light" style={stream.row}>
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
                  {b.customer_name?.trim() || 'Client'} · {formatShortDate(b.booking_date)}
                </Text>
              </View>
            </PressScale>
          );
        })}
      </View>
    </DeckCard>
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

// ── Completion ring (true animated SVG arc) ───────────────────────────────────

function CompletionRing({
  rate,
  dark,
  theme,
}: {
  rate: number;
  dark: boolean;
  theme: any;
}) {
  const accent = accentColor(dark);
  const anim = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: rate,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    const id = anim.addListener(({ value: v }) => setDisplayPct(Math.round(v * 100)));
    return () => anim.removeListener(id);
  }, [anim, rate]);

  const SIZE  = 110;
  const THICK = 10;
  const R     = (SIZE - THICK) / 2;
  const CIRC  = 2 * Math.PI * R;

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });

  return (
    <DeckCard dark={dark} style={{ marginBottom: 16 }}>
      <View style={ring.inner}>
        <Text style={[ring.heading, { color: theme.text }]}>Completion Rate</Text>
        <View style={ring.row}>
          <View style={[ring.container, { width: SIZE, height: SIZE }]}>
            <Svg width={SIZE} height={SIZE}>
              <SvgCircle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={dark ? 'rgba(175,145,151,0.16)' : 'rgba(92,64,51,0.10)'}
                strokeWidth={THICK}
                fill="none"
              />
              <AnimatedCircle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={accent}
                strokeWidth={THICK}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={dashOffset}
                rotation={-90}
                originX={SIZE / 2}
                originY={SIZE / 2}
              />
            </Svg>
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={[ring.pct, { color: accent }]}>{displayPct}%</Text>
              <Text style={[ring.sub, { color: theme.secondaryText }]}>completed</Text>
            </View>
          </View>
          <View style={ring.stats}>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: CHART.green }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Completed</Text>
            </View>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: CHART.amber }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Pending</Text>
            </View>
            <View style={ring.statRow}>
              <View style={[ring.dot, { backgroundColor: CHART.pink }]} />
              <Text style={[ring.statLabel, { color: theme.secondaryText }]}>Cancelled</Text>
            </View>
          </View>
        </View>
      </View>
    </DeckCard>
  );
}

const ring = StyleSheet.create({
  inner:     { padding: 20, gap: 14 },
  heading:   { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 24 },
  container: { alignItems: 'center', justifyContent: 'center' },
  pct:       { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  sub:       { fontSize: 10, fontWeight: '500' },
  stats:     { flex: 1, gap: 10 },
  statRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  statLabel: { fontSize: 12 },
});

// ── Rating analytics ──────────────────────────────────────────────────────────

const ratingChartWidth = (screenWidth: number) => screenWidth - 80; // body pad 20×2 + card pad 20×2
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
  }, [anim, pct]);
  const color = star >= 4 ? CHART.green : star === 3 ? CHART.amber : CHART.pink;
  return (
    <View style={rta.starRow}>
      <View style={rta.starLabelGroup}>
        {Array.from({ length: star }, (_, i) => (
          <Ionicons key={i} name="star" size={9} color={CHART.amber} />
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
  const { width: screenWidth } = useWindowDimensions();
  const ratingChartW = ratingChartWidth(screenWidth);
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
      const d = monthsAgo(RATING_MONTHS - 1 - i);
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

  const trendAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!stats) return;
    trendAnim.setValue(0);
    Animated.timing(trendAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [stats, trendAnim]);

  if (!stats) return null;

  // build trend path — skip months with no data
  const pts = monthlyRatings.map((m, j) => ({
    x: j === 0 ? 0 : (j / (RATING_MONTHS - 1)) * ratingChartW,
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
  // Approximate path length for a draw-on effect (Manhattan estimate is fine for a stroke reveal).
  const pathLen = pts.reduce((sum, p, j) => {
    if (j === 0 || p.y === null) return sum;
    const prev = pts[j - 1]!;
    if (prev.y === null) return sum;
    return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0) || 1;

  return (
    <DeckCard dark={dark} style={rta.panel}>
      <View style={rta.inner}>

        {/* Title */}
        <View style={rta.titleRow}>
          <Ionicons name="star" size={14} color={CHART.amber} />
          <Text style={[rta.heading, { color: theme.text }]}>Rating Analytics</Text>
        </View>

        {/* Hero average */}
        <View style={rta.hero}>
          <Text style={[rta.avgBig, { color: CHART.amber }]}>{stats.avg.toFixed(1)}</Text>
          <View style={rta.starsRow}>
            {Array.from({ length: 5 }, (_, i) => {
              const full = i < Math.floor(stats.avg);
              const half = !full && i < stats.avg;
              return (
                <Ionicons
                  key={i}
                  name={full ? 'star' : half ? 'star-half' : 'star-outline'}
                  size={18}
                  color={CHART.amber}
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
            <Svg width={ratingChartW} height={RATING_CHART_H + 4} style={{ marginTop: 10 }}>
              {/* dashed reference lines at 3★ and 4★ */}
              {[3, 4].map(v => {
                const y = RATING_CHART_H - ((v - 1) / 4) * (RATING_CHART_H - 10);
                return (
                  <SvgLine
                    key={v}
                    x1={0} y1={y} x2={ratingChartW} y2={y}
                    stroke={dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                );
              })}
              <SvgLine
                x1={0} y1={RATING_CHART_H} x2={ratingChartW} y2={RATING_CHART_H}
                stroke={dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}
                strokeWidth={1}
              />
              {trendPath ? (
                <AnimatedPath
                  d={trendPath}
                  stroke={CHART.amber}
                  strokeWidth={2.5}
                  length={pathLen}
                  anim={trendAnim}
                />
              ) : null}
              {pts.map((p, j) =>
                p.y !== null ? (
                  <SvgCircle key={j} cx={p.x} cy={p.y} r={4} fill={CHART.amber} />
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
              const SVC_COLORS = [accentColor(dark), CHART.blue, CHART.teal, CHART.green];
              const c = SVC_COLORS[i % SVC_COLORS.length]!;
              return (
                <View key={s.name} style={rta.svcRow}>
                  <Text style={[rta.svcName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                  <View style={rta.svcRight}>
                    <View style={rta.svcStars}>
                      {Array.from({ length: 5 }, (_, k) => (
                        <Ionicons key={k} name={k < Math.round(s.avg) ? 'star' : 'star-outline'} size={10} color={CHART.amber} />
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
    </DeckCard>
  );
}

// draw-on stroke reveal via strokeDasharray/strokeDashoffset, matching the
// completion ring's technique instead of just cutting the path in statically
const AnimatedSvgPath = Animated.createAnimatedComponent(Path);

function AnimatedPath({
  d, stroke, strokeWidth, length, anim,
}: {
  d: string; stroke: string; strokeWidth: number; length: number; anim: Animated.Value;
}) {
  return (
    <AnimatedSvgPath
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${length} ${length}`}
      strokeDashoffset={anim.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
    />
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

// two cols inside card (padding 20) + gap 12; -1px guards against flexWrap
// rounding forcing a 3rd row
const quadWidth      = (screenWidth: number) => Math.floor((screenWidth - 92) / 2) - 1;
const quadChartWidth = (screenWidth: number) => quadWidth(screenWidth) - 24; // 12px padding each side of quadrant
const QUAD_CHART_H  = 72;
const QUAD_COLORS   = [CHART.blue, CHART.teal, CHART.green, CHART.amber, CHART.pink, CHART.plum];

function ServiceQuadrantCharts({
  bookings,
  dark,
  theme,
}: {
  bookings: BookingWithAddOns[];
  dark: boolean;
  theme: any;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const quadW = quadWidth(screenWidth);
  const quadChartW = quadChartWidth(screenWidth);
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = monthsAgo(5 - i);
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
      .slice(0, 6) // 2 columns × 3 rows max
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
    <DeckCard dark={dark} style={quad.panel}>
      <View style={quad.inner}>
        <View style={quad.titleRow}>
          <Ionicons name="trending-up" size={14} color={accentColor(dark)} />
          <Text style={[quad.heading, { color: theme.text }]}>Service Trends</Text>
          <View style={{ marginLeft: 'auto' }}>
            <LivePulse color={CHART.green} />
          </View>
        </View>
        <View style={quad.grid}>
          {serviceData.map((svc, i) => {
            const color   = QUAD_COLORS[i % QUAD_COLORS.length]!;
            const maxVal  = Math.max(...svc.monthly.map(m => m.count), 1);
            const pts     = svc.monthly.map((m, j) => ({
              x: j === 0 ? 0 : (j / (svc.monthly.length - 1)) * quadChartW,
              y: QUAD_CHART_H - (m.count / maxVal) * (QUAD_CHART_H - 6),
            }));
            const linePath = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            const areaPath = `${linePath} L${pts[pts.length - 1]!.x.toFixed(1)},${QUAD_CHART_H} L0,${QUAD_CHART_H} Z`;
            const total    = svc.monthly.reduce((s, m) => s + m.count, 0);

            return (
              <Reveal key={svc.name} index={i} style={{ width: quadW }}>
                <View
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
                  <Svg width={quadChartW} height={QUAD_CHART_H + 2} style={quad.chart}>
                    <SvgLine
                      x1={0} y1={QUAD_CHART_H} x2={quadChartW} y2={QUAD_CHART_H}
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
              </Reveal>
            );
          })}
        </View>
      </View>
    </DeckCard>
  );
}

const quad = StyleSheet.create({
  panel:       { marginBottom: 16 },
  inner:       { padding: 20, gap: 14 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading:     { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quadrant:    { padding: 12, borderRadius: 16, borderWidth: 1, gap: 2 },
  svcName:     { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  totalCount:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  totalSuffix: { fontSize: 10, fontWeight: '500' },
  chart:       { marginTop: 6 },
  axisRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  axisLabel:   { fontSize: 9, fontWeight: '500' },
});

// ── Range pill (sliding indicator) ────────────────────────────────────────────

type Range = '7d' | '30d' | '90d' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: '7d',  label: '7d'  },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

function RangeSelector({
  range,
  onChange,
  dark,
  theme,
}: {
  range: Range;
  onChange: (r: Range) => void;
  dark: boolean;
  theme: any;
}) {
  const accent = accentColor(dark);
  const [rowW, setRowW] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIdx = RANGES.findIndex(r => r.key === range);

  useEffect(() => {
    if (rowW === 0) return;
    const segW = rowW / RANGES.length;
    Animated.spring(indicatorX, {
      toValue: activeIdx * segW,
      useNativeDriver: true,
      speed: 24,
      bounciness: 7,
    }).start();
  }, [activeIdx, rowW, indicatorX]);

  const segW = rowW / RANGES.length;

  return (
    <View
      style={[rangeSel.row, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)' }]}
      onLayout={e => setRowW(e.nativeEvent.layout.width)}
    >
      {rowW > 0 && (
        <Animated.View
          style={[
            rangeSel.indicator,
            {
              width: segW,
              backgroundColor: accent,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
      )}
      {RANGES.map(r => {
        const active = range === r.key;
        return (
          <TouchableOpacity
            key={r.key}
            activeOpacity={0.5}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(r.key);
            }}
            style={rangeSel.btn}
          >
            <Text style={[rangeSel.txt, { color: active ? '#FFFFFF' : theme.secondaryText, fontWeight: active ? '700' : '600' }]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const rangeSel = StyleSheet.create({
  row:       { flex: 1, flexDirection: 'row', borderRadius: 20, position: 'relative', overflow: 'hidden' },
  indicator: { position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 17 },
  btn:       { flex: 1, paddingVertical: 8, alignItems: 'center', zIndex: 1 },
  txt:       { fontSize: 13 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProviderAnalyticsScreen({ navigation }: any) {
  const { theme, isDarkMode: dark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const accent = accentColor(dark);
  const [bookings, setBookings]         = useState<BookingWithAddOns[]>([]);
  const [reviews, setReviews]           = useState<ReviewWithUser[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);
  const [range, setRange]               = useState<Range>('30d');

  const fetchBookingsForRange = useCallback(async () => {
    try {
      // The default dashboard and six-month chart need only a bounded recent
      // window. Fetch lifetime history only when the provider explicitly
      // selects All; long-tenured accounts should not pay that cost on entry.
      setBookings(await getProviderBookings(range === 'all' ? Infinity : 210));
    } catch {}
  }, [range]);

  const fetchSupportingMetrics = useCallback(async () => {
    try {
      const [r, fc] = await Promise.all([
        getMyProviderReviews(),
        getMyBookmarkCount(),
      ]);
      setReviews(r);
      setFollowerCount(fc);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    void fetchBookingsForRange();
  }, [fetchBookingsForRange]));
  useFocusEffect(useCallback(() => {
    void fetchSupportingMetrics();
  }, [fetchSupportingMetrics]));

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    await Promise.all([fetchBookingsForRange(), fetchSupportingMetrics()]);
    setRefreshing(false);
  }, [fetchBookingsForRange, fetchSupportingMetrics]);

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
      const d = monthsAgo(5 - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bs  = bookings.filter(b => b.status === 'completed' && monthKey(b.booking_date) === key);
      return {
        label:    d.toLocaleDateString('en-GB', { month: 'short' }),
        revenue:  totalForBookings(bs),
        bookings: bs.length,
      };
    });
  }, [bookings]);

  const momColor = kpi.momDelta >= 0 ? CHART.green : CHART.pink;
  const momSign  = kpi.momDelta >= 0 ? '+' : '';

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
          }
        >

          {/* ── Header ── */}
          <View style={main.header}>
            <PressScale
              onPress={() => navigation.goBack()}
              haptic="light"
              style={[main.backBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </PressScale>
            <View style={main.titleRow}>
              <Ionicons name="stats-chart" size={18} color={accent} />
              <Text style={[main.title, { color: theme.text }]}>Provider Analytics</Text>
              <LivePulse color={CHART.green} />
            </View>
            <View style={{ width: 36 }} />
          </View>

          {/* ── Range selector + history button ── */}
          <View style={main.rangeArea}>
            <RangeSelector range={range} onChange={setRange} dark={dark} theme={theme} />
            <PressScale
              onPress={() => navigation.navigate('BookingHistory', { initialTab: 'history' })}
              haptic="light"
              style={[main.historyBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}
            >
              <Ionicons name="menu" size={20} color={theme.secondaryText} />
            </PressScale>
          </View>

          <View style={main.body}>

            {/* ── Hero revenue card ── */}
            <Reveal index={0}>
              <DeckCard dark={dark} style={main.heroPanel}>
                <LinearGradient
                  colors={dark ? [accent + '35', accent + '12', 'transparent'] : [accent + '22', accent + '0C', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1.5 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
                />
                <View style={main.heroInner}>
                  <View style={main.heroTop}>
                    <View>
                      <Text style={[main.heroLabel, { color: theme.secondaryText }]}>
                        Total Revenue
                      </Text>
                      <AnimatedNumber
                        value={kpi.revenue}
                        prefix="£"
                        style={[main.heroValue, { color: theme.text }]}
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
                  <Text style={[main.heroSub, { color: theme.secondaryText }]}>
                    vs £{kpi.lastMonth.toFixed(0)} last month
                  </Text>

                  {/* Inline bar chart */}
                  <View style={{ marginTop: 20 }}>
                    <RevenueChart data={chartData} dark={dark} theme={theme} accent={accent} />
                  </View>
                </View>
              </DeckCard>
            </Reveal>

            {/* ── Stat tile grid (3×2) ── */}
            <View style={main.tileGrid}>
              {[
                { label: 'Bookings',   value: kpi.total,                                                                                              icon: 'calendar',       color: CHART.blue },
                { label: 'Completed',  value: inRange.filter(b => b.status === 'completed').length,                                                   icon: 'checkmark-done', color: CHART.green },
                { label: 'Saved',      value: followerCount,                                                                                           icon: 'bookmark',       color: accent },
                { label: 'Pending',    value: kpi.pending,                                                                                             icon: 'time',           color: CHART.amber },
                { label: 'No Shows',   value: kpi.noShow,                                                                                              icon: 'alert-circle',   color: CHART.pink },
                {
                  label: reviews.length > 0 ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''}` : 'No reviews yet',
                  value: reviews.length > 0 ? parseFloat((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)) : 0,
                  icon: 'star', color: CHART.amber,
                },
                { label: 'Cancelled',  value: kpi.cancelled,                                                                                           icon: 'close-circle',   color: CHART.plum },
              ].map((t, i) => (
                <Reveal key={t.label} index={i + 1} style={{ width: tileWidth(screenWidth) }}>
                  <StatTile
                    label={t.label}
                    value={t.value}
                    sub={(t as any).sub}
                    icon={t.icon}
                    color={t.color}
                    dark={dark}
                    theme={theme}
                  />
                </Reveal>
              ))}
            </View>

            {/* ── Completion rate ── */}
            <Reveal index={8}>
              <CompletionRing rate={kpi.cRate} dark={dark} theme={theme} />
            </Reveal>

            {/* ── Top services ── */}
            <Reveal index={9}>
              <TopServices bookings={inRange} dark={dark} theme={theme} />
            </Reveal>

            {/* ── Service quadrant line charts ── */}
            <Reveal index={10}>
              <ServiceQuadrantCharts bookings={bookings} dark={dark} theme={theme} />
            </Reveal>

            {/* ── Rating analytics ── */}
            <Reveal index={11}>
              <RatingAnalytics reviews={reviews} bookings={bookings} dark={dark} theme={theme} />
            </Reveal>

            {/* ── Recent activity ── */}
            <Reveal index={12}>
              <RecentStream
                bookings={inRange}
                dark={dark}
                theme={theme}
                onPress={b =>
                  navigation.navigate('BookingDetail', { bookingId: b.id, booking: mapDbBookingToConfirmed(b) })
                }
              />
            </Reveal>

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
  historyBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  body:       { paddingHorizontal: 20, gap: 12 },

  heroPanel:  { marginBottom: 4 },
  heroInner:  { padding: 24 },
  heroTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLabel:  { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  heroValue:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  heroSub:    { fontSize: 12, marginTop: 2 },
  momBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  momTxt:     { fontSize: 12, fontWeight: '700' },

  tileGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
