/**
 * The building blocks both provider Analytics screens are made of — the full
 * provider's ProviderAnalyticsScreen and the link-only LinkOnlyAnalyticsScreen
 * — so the two read as one design rather than two that drift apart: tinted
 * deck cards, the sliding period selector, a tap-to-read bar chart, coloured
 * stat tiles, section labels, the insight strip, and the staggered entrance.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { useTheme } from '../../contexts/ThemeContext';

export type AnalyticsTheme = ReturnType<typeof useTheme>['theme'];
export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ── Palette ───────────────────────────────────────────────────────────────────
//
// Chrome (backgrounds, headers, the completion ring, "your accent" moments)
// follows the real provider theme (theme.accent: #5C4033 light / #AF9197
// dark) via accentColor(dark) below, not a hardcoded brand color. Multi-series
// chart data (bars, per-service lines, status dots) still needs a distinct
// qualitative palette — a single accent can't visually separate 5+
// simultaneous series — so CHART keeps its own fixed set, used alongside the
// accent rather than instead of it.

export function accentColor(dark: boolean) {
  return dark ? '#AF9197' : '#5C4033';
}

export const CHART = {
  pink:  '#FF375F',
  teal:  '#5AC8FA',
  green: '#30D158',
  amber: '#FF9F0A',
  blue:  '#0A84FF',
  plum:  '#9B59D0',
};

// ── Entrance reveal (fade + rise, staggered by index) ────────────────────────

export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 480,
      // Capped so later sections don't keep pushing further out as more cards
      // are added above them — the stagger should read as a quick ripple, not
      // a growing wait.
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

export function PressScale({
  children,
  onPress,
  style,
  haptic = 'selection',
  disabled,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: 'selection' | 'light' | 'medium' | 'none';
  disabled?: boolean;
  accessibilityLabel?: string;
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
      accessibilityRole={accessibilityLabel ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

// ── Animated number ───────────────────────────────────────────────────────────

export function AnimatedNumber({ value, prefix = '', suffix = '', style }: {
  value: number; prefix?: string; suffix?: string; style?: StyleProp<TextStyle>;
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

export function DeckCard({
  children,
  style,
  dark,
  tint,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
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

/** The soft accent wash laid over the hero card. */
export function HeroGradient({ dark, accent }: { dark: boolean; accent: string }) {
  return (
    <LinearGradient
      colors={dark ? [accent + '35', accent + '12', 'transparent'] : [accent + '22', accent + '0C', 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1.5 }}
      style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
    />
  );
}

// ── Live pulse badge ──────────────────────────────────────────────────────────

export function LivePulse({ color }: { color: string }) {
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

// ── Header (back button, icon + title, live pulse) ───────────────────────────

export function AnalyticsHeader({
  title,
  onBack,
  dark,
  theme,
}: {
  title: string;
  onBack: () => void;
  dark: boolean;
  theme: AnalyticsTheme;
}) {
  return (
    <View style={header.row}>
      <PressScale
        onPress={onBack}
        haptic="light"
        accessibilityLabel="Back"
        style={[header.backBtn, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
      >
        <Ionicons name="chevron-back" size={18} color={theme.text} />
      </PressScale>
      <View style={header.titleRow}>
        <Ionicons name="stats-chart" size={18} color={accentColor(dark)} />
        <Text style={[header.title, { color: theme.text }]}>{title}</Text>
        <LivePulse color={CHART.green} />
      </View>
      <View style={{ width: 36 }} />
    </View>
  );
}

const header = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  backBtn:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title:    { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
});

// ── Bar chart (tap a bar to read it) ─────────────────────────────────────────

export interface ChartBar {
  label: string;
  value: number;
}

export function BarChart({
  data,
  dark,
  theme,
  accent,
  selectedIndex,
  onSelect,
}: {
  data: ChartBar[];
  dark: boolean;
  theme: AnalyticsTheme;
  accent: string;
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const anims  = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Denser charts (30 daily bars) stagger faster so the last bar doesn't
    // sit waiting a second and a half after the first one starts.
    Animated.stagger(
      Math.min(60, Math.floor(900 / data.length)),
      anims.map((a, i) =>
        Animated.spring(a, {
          toValue: data[i]!.value / maxValue,
          tension: 60,
          friction: 10,
          useNativeDriver: false,
        })
      )
    ).start();
  }, [anims, data, maxValue]);

  const BAR_TOTAL_H = 100;
  // A 7- or 3-bar chart labels every bar; a 30-bar daily chart would collide
  // labels into an unreadable smear, so it shows only a handful, evenly
  // spaced, always including the last (today).
  const labelEvery = data.length > 10 ? Math.ceil(data.length / 5) : 1;
  const barGap = data.length > 15 ? 2 : data.length > 8 ? 4 : 6;

  return (
    <View style={chart.wrap}>
      <View style={[chart.bars, { gap: barGap }]}>
        {data.map((d, i) => {
          const isSel = i === selectedIndex;
          return (
            <TouchableOpacity
              key={i}
              style={chart.barCol}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(i);
              }}
            >
              <View style={[chart.barBg, { height: BAR_TOTAL_H, backgroundColor: dark ? 'rgba(175,145,151,0.14)' : 'rgba(92,64,51,0.08)' }]}>
                <Animated.View
                  style={[
                    chart.bar,
                    {
                      // The selected bar reads at full strength; the rest dim
                      // back so the one being read is unmistakable.
                      opacity: isSel ? 1 : 0.32,
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
              <Text
                style={[chart.label, { color: isSel ? accent : theme.secondaryText, fontWeight: isSel ? '700' : '500' }]}
                numberOfLines={1}
              >
                {(i % labelEvery === 0 || i === data.length - 1 || isSel) ? d.label : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
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

/** Widths are derived from the live window width rather than a value frozen at
 *  module load, so they stay right after a rotation or in split-screen. Body
 *  padding is 20 a side and the gap between tiles is 10. */
export const tileWidth = (screenWidth: number, columns: number = 3) =>
  (screenWidth - 40 - 10 * (columns - 1)) / columns;

export function StatTile({
  label,
  value,
  sub,
  icon,
  color,
  dark,
  theme,
  animate,
  columns = 3,
}: {
  label: string;
  value: number;
  sub?: string | undefined;
  icon: IoniconName;
  color: string;
  dark: boolean;
  theme: AnalyticsTheme;
  animate?: boolean;
  columns?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  // flexGrow fills the row-stretched Reveal wrapper, so a tile whose label
  // wraps to two lines ("Instagram taps") doesn't hang lower than its row.
  return (
    <DeckCard dark={dark} tint={color} style={{ width: tileWidth(screenWidth, columns), flexGrow: 1 }}>
      <View style={tile.inner}>
        <View style={[tile.icon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon} size={14} color={color} />
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

const tile = StyleSheet.create({
  inner: { padding: 12, gap: 3 },
  icon:  { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  value: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  label: { fontSize: 10, fontWeight: '500' },
  sub:   { fontSize: 10, fontWeight: '600' },
});

// ── Range selector (sliding pill) ─────────────────────────────────────────────

export function RangeSelector<K extends string>({
  options,
  range,
  onChange,
  dark,
  theme,
}: {
  options: readonly { key: K; label: string }[];
  range: K;
  onChange: (r: K) => void;
  dark: boolean;
  theme: AnalyticsTheme;
}) {
  const accent = accentColor(dark);
  const [rowW, setRowW] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIdx = options.findIndex(r => r.key === range);

  useEffect(() => {
    if (rowW === 0) return;
    const segW = rowW / options.length;
    Animated.spring(indicatorX, {
      toValue: activeIdx * segW,
      useNativeDriver: true,
      speed: 24,
      bounciness: 7,
    }).start();
  }, [activeIdx, rowW, indicatorX, options.length]);

  const segW = rowW / options.length;

  return (
    <View
      style={[rangeSel.row, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)' }]}
      onLayout={e => setRowW(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
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
      {options.map(r => {
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
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
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

// ── Section label ─────────────────────────────────────────────────────────────

export function SectionLabel({ children, theme }: { children: React.ReactNode; theme: AnalyticsTheme }) {
  return <Text style={[sect.label, { color: theme.secondaryText }]}>{children}</Text>;
}

const sect = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 8, marginBottom: 2, marginLeft: 2 },
});

// ── Insight strip (plain-English read of the period) ──────────────────────────

export function InsightStrip({ text, dark, theme, accent }: {
  text: React.ReactNode; dark: boolean; theme: AnalyticsTheme; accent: string;
}) {
  return (
    <View style={[insight.wrap, { backgroundColor: accent + (dark ? '1F' : '14'), borderColor: accent + (dark ? '2E' : '1F') }]}>
      <View style={[insight.icon, { backgroundColor: accent }]}>
        <Ionicons name="sparkles" size={13} color={dark ? '#201817' : '#FFFFFF'} />
      </View>
      <Text style={[insight.text, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const insight = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 16 },
  icon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  text: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: '500' },
});

/** Shared hero/chart typography, so both screens' headline cards match. */
export const heroText = StyleSheet.create({
  panel:      { marginBottom: 4 },
  inner:      { padding: 24 },
  label:      { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  value:      { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  sub:        { fontSize: 12, marginTop: 2 },
  chartHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  chartHeadK: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  roLabel:    { fontSize: 11, fontWeight: '600' },
  roVal:      { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  roSub:      { fontSize: 11 },
  chartHint:  { fontSize: 11, textAlign: 'center', marginTop: 10, opacity: 0.8 },
});
