// The dashboard's two graphs of what clients book: which services are most
// popular now, and how the top three have moved over six months. The analytics
// screen owns revenue and the full detail.
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { chartTicks, type ServiceBookingSummary } from './serviceBookingSummary';

type Palette = { text: string; sub: string; sep: string; card: string; accent: string };

// Checked for colour-blind separation and contrast in light and dark. The dash
// patterns mean a line is never told apart by colour alone, on any provider theme.
const SERIES = [
  { color: '#0A7AE8', dash: {} },
  { color: '#D97800', dash: { strokeDasharray: '7 5' } },
  { color: '#9B59D0', dash: { strokeDasharray: '2 5' } },
] as const;

const CHART_HEIGHT = 124;
const AXIS_WIDTH = 22;
const POINT_INSET = 8;

function MostBookedCard({ ranked, palette: P }: { ranked: ServiceBookingSummary['ranked']; palette: Palette }) {
  const max = Math.max(...ranked.map(r => r.count), 1);
  return (
    <View style={[st.card, { backgroundColor: P.card, borderColor: P.sep }]}>
      <Text style={[st.title, { color: P.text }]}>Most booked</Text>
      <Text style={[st.sub, { color: P.sub }]}>Last 90 days and booked ahead</Text>
      {ranked.map(row => (
        <View
          key={row.name}
          style={st.barRow}
          accessible
          accessibilityLabel={`${row.name}, ${row.count} ${row.count === 1 ? 'booking' : 'bookings'}`}
        >
          <View style={st.barLabels}>
            <Text style={[st.barName, { color: P.text }]} numberOfLines={1}>{row.name}</Text>
            <Text style={[st.barValue, { color: P.text }]}>{row.count}</Text>
          </View>
          <View style={[st.barTrack, { backgroundColor: P.sep }]}>
            <View style={[st.barFill, { width: `${(row.count / max) * 100}%`, backgroundColor: P.accent }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TrendCard({ months, trend, palette: P }: Pick<ServiceBookingSummary, 'months' | 'trend'> & { palette: Palette }) {
  const [width, setWidth] = useState(0);
  // A tap picks the month the key below reads out. Starts on the current one.
  const [selected, setSelected] = useState(months.length - 1);

  const ticks = useMemo(() => chartTicks(Math.max(...trend.flatMap(t => t.counts), 0)), [trend]);
  const top = ticks[ticks.length - 1]!;
  const plotWidth = Math.max(width - AXIS_WIDTH, 0);
  const xFor = (i: number) => AXIS_WIDTH + POINT_INSET + (i / (months.length - 1)) * (plotWidth - POINT_INSET * 2);
  const yFor = (n: number) => CHART_HEIGHT - 6 - (n / top) * (CHART_HEIGHT - 16);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const summary = months
    .map((m, i) => `${m.label}: ${trend.map(t => `${t.name} ${t.counts[i] ?? 0}`).join(', ')}`)
    .join('. ');

  return (
    <View style={[st.card, { backgroundColor: P.card, borderColor: P.sep }]}>
      <Text style={[st.title, { color: P.text }]}>Your top services over time</Text>
      <Text style={[st.sub, { color: P.sub }]}>Bookings a month. Tap a month to see it.</Text>

      <View style={st.plot} onLayout={onLayout} accessible accessibilityLabel={summary}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            {ticks.map(tick => (
              <Line
                key={tick}
                x1={AXIS_WIDTH}
                x2={width}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke={P.sep}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            <Line x1={xFor(selected)} x2={xFor(selected)} y1={4} y2={CHART_HEIGHT - 6} stroke={P.sub} strokeWidth={1} opacity={0.4} />
            {trend.map((series, s) => (
              <Path
                key={series.name}
                d={series.counts.map((n, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(n).toFixed(1)}`).join(' ')}
                stroke={SERIES[s]!.color}
                strokeWidth={2}
                {...SERIES[s]!.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {trend.map((series, s) => (
              <Circle
                key={series.name}
                cx={xFor(selected)}
                cy={yFor(series.counts[selected] ?? 0)}
                r={4}
                fill={SERIES[s]!.color}
                stroke={P.card}
                strokeWidth={2}
              />
            ))}
          </Svg>
        )}
        {ticks.map(tick => (
          <Text key={tick} style={[st.tick, { color: P.sub, top: yFor(tick) - 7 }]}>{tick}</Text>
        ))}
        <View style={[st.tapRow, { left: AXIS_WIDTH }]}>
          {months.map((m, i) => (
            <Pressable
              key={m.key}
              style={st.tapZone}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelected(i); }}
              accessibilityRole="button"
              accessibilityLabel={`Show ${m.label}`}
              accessibilityState={{ selected: selected === i }}
            />
          ))}
        </View>
      </View>

      <View style={[st.monthRow, { marginLeft: AXIS_WIDTH }]}>
        {months.map((m, i) => (
          <Text
            key={m.key}
            style={[st.month, { color: selected === i ? P.text : P.sub, fontWeight: selected === i ? '700' : '500' }]}
          >
            {m.label}
          </Text>
        ))}
      </View>

      <View style={st.legend}>
        {trend.map((series, s) => (
          <View key={series.name} style={st.legendRow}>
            <Svg width={24} height={10}>
              <Line x1={1} x2={23} y1={5} y2={5} stroke={SERIES[s]!.color} strokeWidth={2} {...SERIES[s]!.dash} strokeLinecap="round" />
            </Svg>
            <Text style={[st.legendName, { color: P.text }]} numberOfLines={1}>{series.name}</Text>
            <Text style={[st.legendValue, { color: P.text }]}>{series.counts[selected] ?? 0}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ServiceBookingCharts({ summary, palette }: { summary: ServiceBookingSummary | null; palette: Palette }) {
  // Holds the space while loading, so the page doesn't jump when it arrives.
  if (!summary) {
    return <View style={[st.card, st.placeholder, { backgroundColor: palette.card, borderColor: palette.sep }]} />;
  }
  // Nothing booked yet: the Most booked tile above already says so.
  if (summary.ranked.length === 0 && summary.trend.length === 0) return null;
  return (
    <>
      {summary.ranked.length > 0 && <MostBookedCard ranked={summary.ranked} palette={palette} />}
      {summary.trend.length > 0 && <TrendCard months={summary.months} trend={summary.trend} palette={palette} />}
    </>
  );
}

const st = StyleSheet.create({
  card: { padding: 18, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, marginBottom: 14 },
  placeholder: { height: 220 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, marginBottom: 12 },
  barRow: { marginTop: 10 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 5 },
  barName: { flex: 1, fontSize: 13 },
  barValue: { fontSize: 13, fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  plot: { height: CHART_HEIGHT },
  tick: { position: 'absolute', left: 0, width: AXIS_WIDTH - 4, fontSize: 10, textAlign: 'right' },
  tapRow: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  tapZone: { flex: 1 },
  monthRow: { flexDirection: 'row', marginTop: 4 },
  month: { flex: 1, fontSize: 11, textAlign: 'center' },
  legend: { marginTop: 12, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendName: { flex: 1, fontSize: 13 },
  legendValue: { fontSize: 13, fontWeight: '700' },
});
