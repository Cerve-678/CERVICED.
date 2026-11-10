// src/components/WelcomeIntro.tsx
//
// First-launch intro for WelcomeScreen: "booked → serviced → CERVICED."
// (spec: FUTURE_LOGIC.md, "Welcome + booking-confirmed motion").
//
//   1. Three booking cards from three different providers deal in and fan
//      out — one checkout can book several people.
//   2. They fold into a circle and a tick draws itself; "BOOKED." drops in.
//   3. That gives way to "SERVICED"; the S flips over into an accent C and
//      the full stop lands: CERVICED.
//   4. CERVICED. shrinks and glides up into the screen's top-left wordmark,
//      where WelcomeScreen takes over.
//
// The timeline is fixed, so the screen is told it has finished with a plain
// timer rather than a worklet callback. With Reduce Motion on, it reports
// finished immediately and the screen shows its final state.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
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
export const WELCOME_INTRO_DURATION_MS = 4950;

/** Gap between the top of the screen's content and the intro stage. The
 *  glide uses it to land CERVICED. on the wordmark, which sits at the very
 *  top of that content, so WelcomeScreen must place the intro with it. */
export const WELCOME_INTRO_TOP_MARGIN = 40;

// Must match WelcomeScreen's wordmark size so the glide lands at the right scale.
const WORDMARK_FONT_SIZE = 18;
const WORD_FONT_SIZE = 44;
const WORD_AREA_TOP = 160;

// Illustrative only — three services from three different providers, to show
// that one checkout can cover several people.
const CARDS = [
  { service: 'Lace frontal', provider: 'Hair by Tami', initials: 'HT', time: 'Sat 10:00am', price: '£85' },
  { service: 'Lash lift', provider: 'Lashed by Kemi', initials: 'LK', time: 'Sat 1:30pm', price: '£45' },
  { service: 'Almond nails', provider: 'Amara Nails', initials: 'AN', time: 'Sat 4:00pm', price: '£38' },
] as const;
// Each card lands in a loose stack, then fans out vertically before folding.
const FAN = [
  { y: -76, rotate: -4 },
  { y: 0, rotate: 2 },
  { y: 76, rotate: -2 },
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
  const fan = useSharedValue(0);
  const collapse = useSharedValue(0);
  const tick = useSharedValue(0);
  const booked = useSharedValue(0);
  const serviced = useSharedValue(0);
  const flip = useSharedValue(0);
  const dot = useSharedValue(0);
  const glide = useSharedValue(0);
  const wordX = useSharedValue(0);
  const wordY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      onFinished();
      return;
    }
    [deal0, deal1, deal2].forEach((v, i) => { v.value = withDelay(150 + i * 110, withSpring(1, { damping: 15, stiffness: 130 })); });
    fan.value = withDelay(650, withSpring(1, { damping: 14, stiffness: 120 }));
    collapse.value = withDelay(1500, withTiming(1, { duration: 380 }));
    tick.value = withDelay(1800, withTiming(1, { duration: 520 }));
    booked.value = withDelay(2050, withTiming(1, { duration: 600 }));
    serviced.value = withDelay(2950, withTiming(1, { duration: 450 }));
    flip.value = withDelay(3500, withTiming(1, { duration: 520 }));
    dot.value = withDelay(4000, withSpring(1, { damping: 9, stiffness: 180 }));
    glide.value = withDelay(4350, withTiming(1, { duration: 550 }));
    const timer = setTimeout(onFinished, WELCOME_INTRO_DURATION_MS);
    return () => clearTimeout(timer);
    // Runs once per mount; the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

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
  // Shrinks the finished word from where it sits onto the wordmark's spot:
  // the top-left of the screen's content, WELCOME_INTRO_TOP_MARGIN above
  // this stage. Scaled from its own top-left corner so the two line up.
  const glideStyle = useAnimatedStyle(() => {
    const g = glide.value;
    const scale = 1 - g * (1 - WORDMARK_FONT_SIZE / WORD_FONT_SIZE);
    return {
      transform: [
        { translateX: -wordX.value * g },
        { translateY: -(WELCOME_INTRO_TOP_MARGIN + WORD_AREA_TOP + wordY.value) * g },
        { scale },
      ],
    };
  });
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

  const onWordLayout = (e: LayoutChangeEvent) => {
    wordX.value = e.nativeEvent.layout.x;
    wordY.value = e.nativeEvent.layout.y;
  };

  if (reduceMotion) return null;

  return (
    <View style={styles.stage} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.cardsArea}>
        {([deal0, deal1, deal2] as const).map((deal, i) => {
          const card = CARDS[i];
          const spot = FAN[i];
          if (!card || !spot) return null;
          return <DealtCard key={card.service} index={i} spot={spot} deal={deal} fan={fan} collapse={collapse} palette={t} {...card} />;
        })}
      </View>

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
          <Animated.View style={[styles.wordInner, glideStyle]} onLayout={onWordLayout}>
            <View>
              <Animated.Text style={[styles.word, { color: t.text }, sStyle]}>S</Animated.Text>
              <Animated.Text style={[styles.word, styles.letterOverlay, { color: t.accent }, cStyle]}>C</Animated.Text>
            </View>
            <Text style={[styles.word, { color: t.text }]}>ERVICED</Text>
            <Animated.Text style={[styles.word, { color: t.text }, dotStyle]}>.</Animated.Text>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

function DealtCard({
  index, spot, deal, fan, collapse, palette: t, service, provider, initials, time, price,
}: {
  index: number; spot: { y: number; rotate: number }; deal: SharedValue<number>; fan: SharedValue<number>;
  collapse: SharedValue<number>; palette: AppTheme;
  service: string; provider: string; initials: string; time: string; price: string;
}) {
  const style = useAnimatedStyle(() => {
    const c = collapse.value;
    const f = fan.value;
    // Loose stack while dealing (each card a little higher and more tilted),
    // then fanned out to its own spot.
    const stackY = -8 * index;
    const stackRotate = -2 + index * 2.5;
    const settledY = stackY + (spot.y - stackY) * f;
    const settledRotate = stackRotate + (spot.rotate - stackRotate) * f;
    return {
      opacity: Math.min(deal.value, 1) * (1 - c),
      transform: [
        { translateY: interpolate(deal.value, [0, 1], [260, settledY]) * (1 - c) },
        { rotate: `${settledRotate * Math.min(deal.value, 1) * (1 - c)}deg` },
        { scale: 1 - c * 0.8 },
      ],
    };
  });
  // Alternate a solid and a tinted avatar so three different providers read
  // as three different people, using only pairings the palette guarantees.
  const solid = index % 2 === 0;
  return (
    <Animated.View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>
      <View style={[styles.cardAvatar, { backgroundColor: solid ? t.accent : t.accentDim }]}>
        <Text style={[styles.cardAvatarText, { color: solid ? t.onAccent : t.accentText }]}>{initials}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardService, { color: t.text }]} numberOfLines={1}>{service}</Text>
        <Text style={[styles.cardMeta, { color: t.sub }]} numberOfLines={1}>{provider} · {time}</Text>
      </View>
      <Text style={[styles.cardPrice, { color: t.accentText }]}>{price}</Text>
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
  // Centred on the badge (top 70 + half its 76pt height), so the cards fold
  // straight into the circle.
  cardsArea: { position: 'absolute', top: 0, left: 0, right: 0, height: 216, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', width: '88%', flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardAvatarText: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  cardText: { flex: 1, minWidth: 0 },
  cardService: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  cardMeta: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '600', marginTop: 2 },
  cardPrice: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  badge: { position: 'absolute', top: 70 },
  wordArea: { position: 'absolute', top: WORD_AREA_TOP, left: 0, right: 0, height: 60 },
  wordRow: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  wordInner: { flexDirection: 'row', alignItems: 'flex-end', transformOrigin: 'left top' },
  letterOverlay: { position: 'absolute', left: 0, top: 0 },
  word: { fontFamily: 'BakbakOne-Regular', fontSize: WORD_FONT_SIZE, letterSpacing: 1.5 },
});
