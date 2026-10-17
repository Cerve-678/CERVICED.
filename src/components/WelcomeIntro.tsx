// src/components/WelcomeIntro.tsx
//
// First-launch intro for WelcomeScreen: "booked → serviced → CERVICED."
// (spec: FUTURE_LOGIC.md, "Welcome + booking-confirmed motion").
//
//   1. Three booking cards from three different providers deal in — one
//      checkout can book several people.
//   2. They fold into a circle and a tick draws itself; "BOOKED." drops in.
//   3. That gives way to "SERVICED"; the S flips over into an accent C and
//      the full stop lands: CERVICED.
//
// The timeline is fixed, so the screen is told it has finished with a plain
// timer rather than a worklet callback. With Reduce Motion on, it reports
// finished immediately and the screen shows its final state.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import type { AppTheme } from '../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Total length of the intro, after which onFinished fires. */
export const WELCOME_INTRO_DURATION_MS = 4600;

// Illustrative only — three services from three different providers, to show
// that one checkout can cover several people.
const CARDS = [
  { service: 'Lace frontal', provider: 'Crown Hair Studio', time: 'Sat · 10:00' },
  { service: 'Lash lift', provider: 'The Lash Lab', time: 'Sat · 13:30' },
  { service: 'Almond nails', provider: 'Nail Room', time: 'Sat · 15:00' },
] as const;
const FAN = [
  { x: -78, y: 10, rotate: -9 },
  { x: 0, y: -6, rotate: 0 },
  { x: 78, y: 10, rotate: 9 },
] as const;

const RING_R = 30;
const RING_LEN = 2 * Math.PI * RING_R;
const TICK_LEN = 40;

interface WelcomeIntroProps {
  palette: AppTheme;
  onFinished: () => void;
}

export default function WelcomeIntro({ palette: t, onFinished }: WelcomeIntroProps) {
  const reduceMotion = useReducedMotion();
  const deal0 = useSharedValue(0);
  const deal1 = useSharedValue(0);
  const deal2 = useSharedValue(0);
  const collapse = useSharedValue(0);
  const tick = useSharedValue(0);
  const booked = useSharedValue(0);
  const serviced = useSharedValue(0);
  const flip = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      onFinished();
      return;
    }
    [deal0, deal1, deal2].forEach((v, i) => { v.value = withDelay(150 + i * 160, withSpring(1, { damping: 14, stiffness: 120 })); });
    collapse.value = withDelay(1500, withTiming(1, { duration: 380 }));
    tick.value = withDelay(1800, withTiming(1, { duration: 520 }));
    booked.value = withDelay(2050, withTiming(1, { duration: 600 }));
    serviced.value = withDelay(2950, withTiming(1, { duration: 450 }));
    flip.value = withDelay(3500, withTiming(1, { duration: 520 }));
    dot.value = withDelay(4000, withSpring(1, { damping: 9, stiffness: 180 }));
    const timer = setTimeout(onFinished, WELCOME_INTRO_DURATION_MS);
    return () => clearTimeout(timer);
    // Runs once per mount; the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(deal2.value, [0, 1], [0, 1], Extrapolation.CLAMP) * (1 - collapse.value),
  }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * (1 - Math.min(tick.value * 1.6, 1)) }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: TICK_LEN * (1 - interpolate(tick.value, [0.45, 1], [0, 1], Extrapolation.CLAMP)),
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tick.value, [0, 0.15], [0, 1], Extrapolation.CLAMP) * (1 - serviced.value),
    transform: [{ scale: interpolate(tick.value, [0, 0.4], [0.6, 1], Extrapolation.CLAMP) }],
  }));
  const bookedRowStyle = useAnimatedStyle(() => ({ opacity: 1 - serviced.value }));
  const servicedRowStyle = useAnimatedStyle(() => ({
    opacity: serviced.value,
    transform: [{ translateY: interpolate(serviced.value, [0, 1], [14, 0]) }],
  }));
  const sStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateX: `${interpolate(flip.value, [0, 0.5], [0, 90], Extrapolation.CLAMP)}deg` }],
  }));
  const cStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateX: `${interpolate(flip.value, [0.5, 1], [-90, 0], Extrapolation.CLAMP)}deg` }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value > 0.02 ? 1 : 0,
    transform: [{ translateY: interpolate(dot.value, [0, 1], [-26, 0]) }],
  }));

  if (reduceMotion) return null;

  return (
    <View style={styles.stage} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.cardsArea}>
        {([deal0, deal1, deal2] as const).map((deal, i) => {
          const card = CARDS[i];
          const fan = FAN[i];
          if (!card || !fan) return null;
          return <DealtCard key={card.service} fan={fan} deal={deal} collapse={collapse} palette={t} {...card} />;
        })}
      </View>
      <Animated.View style={[styles.chip, { backgroundColor: t.accentDim }, chipStyle]}>
        <Text style={[styles.chipText, { color: t.accentText }]}>3 pros · 1 checkout</Text>
      </Animated.View>

      <Animated.View style={[styles.badge, badgeStyle]}>
        <Svg width={76} height={76} viewBox="0 0 76 76">
          <AnimatedCircle
            cx={38} cy={38} r={RING_R} stroke={t.accent} strokeWidth={4} fill="none"
            strokeDasharray={RING_LEN} animatedProps={ringProps} strokeLinecap="round"
            rotation={-90} origin="38, 38"
          />
          <AnimatedPath
            d="M25 39 l9 9 l17 -19" stroke={t.accent} strokeWidth={5} fill="none"
            strokeDasharray={TICK_LEN} animatedProps={tickProps} strokeLinecap="round" strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>

      <View style={styles.wordArea}>
        <Animated.View style={[styles.wordRow, bookedRowStyle]}>
          {'BOOKED.'.split('').map((ch, i) => (
            <DroppingLetter key={`b${i}`} char={ch} index={i} progress={booked} color={ch === '.' ? t.accent : t.text} />
          ))}
        </Animated.View>
        <Animated.View style={[styles.wordRow, servicedRowStyle]}>
          <View>
            <Animated.Text style={[styles.word, { color: t.text }, sStyle]}>S</Animated.Text>
            <Animated.Text style={[styles.word, styles.letterOverlay, { color: t.accent }, cStyle]}>C</Animated.Text>
          </View>
          <Text style={[styles.word, { color: t.text }]}>ERVICED</Text>
          <Animated.Text style={[styles.word, { color: t.accent }, dotStyle]}>.</Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}

function DealtCard({
  fan, deal, collapse, palette: t, service, provider, time,
}: {
  fan: { x: number; y: number; rotate: number }; deal: SharedValue<number>; collapse: SharedValue<number>; palette: AppTheme;
  service: string; provider: string; time: string;
}) {
  const style = useAnimatedStyle(() => {
    const c = collapse.value;
    return {
      opacity: Math.min(deal.value, 1) * (1 - c),
      transform: [
        { translateX: fan.x * (1 - c) },
        { translateY: interpolate(deal.value, [0, 1], [260, fan.y]) * (1 - c) + c * 70 },
        { rotate: `${fan.rotate * deal.value * (1 - c)}deg` },
        { scale: 1 - c * 0.7 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>
      <View style={[styles.cardAvatar, { backgroundColor: t.accentDim }]}>
        <Text style={[styles.cardAvatarText, { color: t.accentText }]}>{provider.charAt(0)}</Text>
      </View>
      <Text style={[styles.cardService, { color: t.text }]} numberOfLines={1}>{service}</Text>
      <Text style={[styles.cardProvider, { color: t.sub }]} numberOfLines={1}>{provider}</Text>
      <Text style={[styles.cardTime, { color: t.accentText }]}>{time}</Text>
    </Animated.View>
  );
}

function DroppingLetter({ char, index, progress, color }: { char: string; index: number; progress: SharedValue<number>; color: string }) {
  const start = index * 0.08;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, start + 0.25], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [start, start + 0.45], [-22, 0], Extrapolation.CLAMP) }],
  }));
  return <Animated.Text style={[styles.word, { color }, style]}>{char}</Animated.Text>;
}

const styles = StyleSheet.create({
  stage: { height: 300, alignItems: 'center', justifyContent: 'flex-start' },
  cardsArea: { height: 150, width: '100%', alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', width: 118, borderRadius: 18, borderWidth: 1, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardAvatarText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  cardService: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  cardProvider: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '600', marginTop: 2 },
  cardTime: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', marginTop: 6 },
  chip: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  badge: { position: 'absolute', top: 70 },
  wordArea: { position: 'absolute', top: 160, left: 0, right: 0, height: 60 },
  wordRow: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  letterOverlay: { position: 'absolute', left: 0, top: 0 },
  word: { fontFamily: 'BakbakOne-Regular', fontSize: 44, letterSpacing: 1.5 },
});
