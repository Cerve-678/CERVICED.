import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { isTargetOnScreen } from '../utils/coachMarkTargets';

const PAD = 8; // breathing room between the real element and the spotlight edge
const CARD_GAP = 16;
const BEAK = 12; // width/height of the square that's rotated 45° into a pointer
const HALO = 12; // how far the pulsing ring travels beyond the spotlight edge

// The scrim is dark in BOTH light and dark mode — a spotlight that dims the
// screen has to actually dim it. So anything drawn ON the scrim (the ring
// around the cutout, the halo) uses white rather than the palette accent:
// the light-mode accent on either hat is a dark colour (#3F1E36 plum /
// #5C4033 chocolate) and would disappear against it. Same rule the app
// already applies to icons drawn over photos (see PortfolioCard's unsaved
// heart). Inside the caption card — which is a normal P.card surface — the
// full palette is used normally.
const SCRIM = 'rgba(10,9,8,0.82)';
const ON_SCRIM = '#FFFFFF';

type Rect = { x: number; y: number; width: number; height: number };

// measureInWindow exists on the underlying native view via the NativeMethods
// mixin, but isn't in View/TouchableOpacity's TS surface (same cast used in
// InfoRegScreen's category auto-scroll).
type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void };

export interface CoachMarkStep {
  key: string;
  title: string;
  body: string;
  /** Either a live element to measure, or a precomputed screen rect (for
   *  targets like the floating tab bar that live outside the caller's tree). */
  target: { ref: React.RefObject<View | null> } | { rect: Rect };
  /** Corner radius of the spotlight cutout. Defaults to a rounded-card look. */
  radius?: number;
  /** Ionicons glyph shown in the caption card's header tile. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** The tour version this step first shipped in; absent means it was in the
   *  original tour (1). Someone who has already been walked through version N
   *  is shown only the steps above N — that is how a walkthrough for a NEW
   *  feature reaches existing users without replaying the whole thing. See
   *  src/utils/coachMarkTours.ts. */
  sinceVersion?: number;
}

interface CoachMarkTourProps {
  visible: boolean;
  steps: CoachMarkStep[];
  onFinish: () => void;
}

const AnimatedSvgRect = Animated.createAnimatedComponent(SvgRect);

const measureStep = (step: CoachMarkStep): Promise<Rect | null> => {
  if ('rect' in step.target) return Promise.resolve(step.target.rect);
  const node = step.target.ref.current as unknown as Measurable | null;
  if (!node?.measureInWindow) return Promise.resolve(null);
  return new Promise(resolve => {
    node.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
};

/**
 * Full-screen spotlight tour: dims everything except a rounded cutout around
 * the current step's real, on-screen element, with a caption card that points
 * at it via a beak. Steps whose target fails to measure — not rendered, or
 * scrolled out of view — are skipped rather than blocking the tour.
 */
export const CoachMarkTour: React.FC<CoachMarkTourProps> = ({ visible, steps, onFinish }) => {
  const { palette: P } = useTheme();
  // Measured per render, not captured at module load: the spotlight mask and
  // card placement are absolute coordinates, so a stale screen size puts them
  // in the wrong place after a rotation or in split-screen.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const cardW = Math.min(screenW - 36, 344);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const hasPositioned = useRef(false);
  // Indices actually landed on, in order — Back walks this rather than
  // decrementing stepIndex, so it can't stop on a step forward navigation
  // already skipped as unmeasurable.
  const historyRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardLift = useRef(new Animated.Value(10)).current;
  const cutX = useRef(new Animated.Value(0)).current;
  const cutY = useRef(new Animated.Value(0)).current;
  const cutW = useRef(new Animated.Value(0)).current;
  const cutH = useRef(new Animated.Value(0)).current;
  // 0 → 1 on repeat, driving the halo's outward travel and fade. Gated by
  // haloGate so the ring stays hidden while the cutout springs between
  // steps and only breathes once it has settled on the new target.
  const haloPulse = useRef(new Animated.Value(0)).current;
  const haloGate = useRef(new Animated.Value(0)).current;

  const halo = useMemo(() => {
    const grow = haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0, HALO] });
    return {
      left: Animated.subtract(cutX, grow),
      top: Animated.subtract(cutY, grow),
      width: Animated.add(cutW, Animated.multiply(grow, 2)),
      height: Animated.add(cutH, Animated.multiply(grow, 2)),
      opacity: Animated.multiply(
        haloGate,
        haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] })
      ),
    };
  }, [cutX, cutY, cutW, cutH, haloPulse, haloGate]);

  useEffect(() => {
    if (!visible) return;
    haloPulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(haloPulse, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.quad),
        // Layout props (left/top/width/height) can't run on the native
        // driver, and the opacity is multiplied off the same node.
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [visible, haloPulse]);

  const goToStep = useCallback(async (index: number, dir: 1 | -1 = 1) => {
    if (index >= steps.length) { onFinish(); return; }
    if (index < 0) return;
    const step = steps[index]!;
    const r = await measureStep(step);
    if (!mountedRef.current) return;
    if (!r || !isTargetOnScreen(r, { width: screenW, height: screenH })) { goToStep(index + dir, dir); return; }

    setStepIndex(index);
    setRect(r);
    historyRef.current.push(index);
    const padded = { x: r.x - PAD, y: r.y - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };

    cardOpacity.setValue(0);
    cardLift.setValue(10);
    haloGate.setValue(0);
    const reveal = Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(cardLift, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 240 }),
    ]);

    if (!hasPositioned.current) {
      hasPositioned.current = true;
      cutX.setValue(padded.x);
      cutY.setValue(padded.y);
      cutW.setValue(padded.width);
      cutH.setValue(padded.height);
      reveal.start();
      Animated.timing(haloGate, { toValue: 1, duration: 300, delay: 240, useNativeDriver: false }).start();
    } else {
      Animated.parallel([
        Animated.spring(cutX, { toValue: padded.x, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutY, { toValue: padded.y, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutW, { toValue: padded.width, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutH, { toValue: padded.height, useNativeDriver: false, damping: 20, stiffness: 220 }),
      ]).start();
      Animated.sequence([Animated.delay(150), reveal]).start();
      Animated.timing(haloGate, { toValue: 1, duration: 300, delay: 400, useNativeDriver: false }).start();
    }
  }, [steps, onFinish, cardOpacity, cardLift, cutX, cutY, cutW, cutH, haloGate, screenW, screenH]);

  useEffect(() => {
    if (!visible) {
      hasPositioned.current = false;
      historyRef.current = [];
      setRect(null);
      return;
    }
    goToStep(0);
    // Only (re)start when the tour opens — steps is stable in identity terms
    // per caller (useMemo'd), and re-running this on every parent render
    // would restart the tour from step 0 underneath the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || !rect) return null;
  const step = steps[stepIndex];
  if (!step) return null;
  const radius = step.radius ?? 16;
  const isLast = stepIndex === steps.length - 1;
  const canGoBack = historyRef.current.length > 1;

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  const advance = () => { tap(); goToStep(stepIndex + 1, 1); };
  const goBack = () => {
    tap();
    const hist = historyRef.current;
    hist.pop();                                   // the step being left
    const prev = hist.pop();                      // re-pushed by goToStep
    if (prev === undefined) return;
    goToStep(prev, -1);
  };
  const skip = () => { tap(); onFinish(); };

  const spaceBelow = screenH - (rect.y + rect.height);
  const spaceAbove = rect.y;
  const placeBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
  const cardTop = placeBelow ? Math.min(rect.y + rect.height + PAD + CARD_GAP, screenH - 240) : undefined;
  const cardBottom = !placeBelow ? screenH - rect.y + PAD + CARD_GAP : undefined;
  const cardLeft = Math.max(18, Math.min(screenW - cardW - 18, rect.x + rect.width / 2 - cardW / 2));
  // The beak tracks the spotlight's centre, but stays clear of the card's
  // rounded corners so it never pokes out of a curve.
  const beakLeft = Math.max(
    20,
    Math.min(cardW - 20 - BEAK, rect.x + rect.width / 2 - cardLeft - BEAK / 2)
  );

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={skip}>
      <View style={StyleSheet.absoluteFill}>
        {/* Tapping the dimmed area advances, so the whole screen is the
            "next" button — the footer controls stay for Back/Skip. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
          <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill}>
            <Defs>
              <Mask id="coachmark-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={screenW} height={screenH}>
                <SvgRect x={0} y={0} width={screenW} height={screenH} fill="#fff" />
                <AnimatedSvgRect x={cutX} y={cutY} width={cutW} height={cutH} rx={radius} fill="#000" />
              </Mask>
            </Defs>
            <SvgRect x={0} y={0} width={screenW} height={screenH} fill={SCRIM} mask="url(#coachmark-mask)" />
            <AnimatedSvgRect
              x={cutX} y={cutY} width={cutW} height={cutH} rx={radius}
              stroke={ON_SCRIM} strokeWidth={2} fill="none"
            />
          </Svg>

          {/* Pulsing halo — the thing that actually draws the eye to the
              cutout. pointerEvents none so it never eats the scrim tap. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                left: halo.left,
                top: halo.top,
                width: halo.width,
                height: halo.height,
                opacity: halo.opacity,
                borderRadius: radius + HALO,
                borderColor: ON_SCRIM,
              },
            ]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.cardWrap,
            {
              left: cardLeft,
              width: cardW,
              top: cardTop,
              bottom: cardBottom,
              opacity: cardOpacity,
              transform: [{ translateY: cardLift }],
            },
          ]}
        >
          {/* Beak — a square rotated 45°, half-buried under the card so only
              the two outward-facing edges (and their border) show. */}
          <View
            style={[
              styles.beak,
              {
                left: beakLeft,
                backgroundColor: P.card,
                borderColor: P.border,
                ...(placeBelow
                  ? { top: -BEAK / 2, borderTopWidth: 1, borderLeftWidth: 1 }
                  : { bottom: -BEAK / 2, borderBottomWidth: 1, borderRightWidth: 1 }),
              },
            ]}
          />
          <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={styles.header}>
              {step.icon && (
                <View style={[styles.iconTile, { backgroundColor: P.accentDim }]}>
                  <Ionicons name={step.icon} size={15} color={P.accentText} />
                </View>
              )}
              <Text style={[styles.stepLabel, { color: P.accentText }]}>
                STEP {stepIndex + 1} OF {steps.length}
              </Text>
              <View style={{ flex: 1 }} />
              {!isLast && (
                <TouchableOpacity onPress={skip} activeOpacity={0.5} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.skipText, { color: P.sub }]}>Skip</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.title, { color: P.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: P.sub }]}>{step.body}</Text>

            <View style={[styles.footer, { borderTopColor: P.sep }]}>
              <View style={styles.segments}>
                {steps.map((s, i) => (
                  <View
                    key={s.key}
                    style={[
                      styles.segment,
                      i === stepIndex
                        ? { width: 18, backgroundColor: P.accent }
                        : { width: 6, backgroundColor: i < stepIndex ? P.accent : P.border, opacity: i < stepIndex ? 0.4 : 1 },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.actions}>
                {canGoBack && (
                  <TouchableOpacity
                    onPress={goBack}
                    activeOpacity={0.5}
                    style={styles.backBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="chevron-back" size={13} color={P.sub} />
                    <Text style={[styles.backText, { color: P.sub }]}>BACK</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.nextBtn, { backgroundColor: P.accent }]}
                  onPress={advance}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.nextText, { color: P.onAccent }]}>{isLast ? 'GOT IT' : 'NEXT'}</Text>
                  {!isLast && <Ionicons name="arrow-forward" size={13} color={P.onAccent} style={{ marginLeft: 5 }} />}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    borderWidth: 2,
  },
  cardWrap: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 14,
  },
  beak: {
    position: 'absolute',
    width: BEAK,
    height: BEAK,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1.6,
  },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600' },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
    letterSpacing: 0.3,
    marginBottom: 5,
  },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13.5, lineHeight: 19 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segment: { height: 4, borderRadius: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  backText: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  nextText: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.2 },
});
