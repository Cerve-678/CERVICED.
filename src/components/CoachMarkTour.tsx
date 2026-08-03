import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ACCENT = '#AF9197';
const PAD = 8; // breathing room between the real element and the spotlight edge
const CARD_GAP = 14;
const CARD_W = Math.min(SCREEN_W - 40, 340);

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
 * the current step's real, on-screen element, with a caption card pointing
 * at it. Steps whose target fails to measure (not rendered, e.g. a checklist
 * that's already complete) are skipped rather than blocking the tour.
 */
export const CoachMarkTour: React.FC<CoachMarkTourProps> = ({ visible, steps, onFinish }) => {
  const { isDarkMode } = useTheme();
  const accent = isDarkMode ? '#AF9197' : '#5C4033';
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const hasPositioned = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cutX = useRef(new Animated.Value(0)).current;
  const cutY = useRef(new Animated.Value(0)).current;
  const cutW = useRef(new Animated.Value(0)).current;
  const cutH = useRef(new Animated.Value(0)).current;

  const goToStep = useCallback(async (index: number) => {
    if (index >= steps.length) { onFinish(); return; }
    const step = steps[index]!;
    const r = await measureStep(step);
    if (!mountedRef.current) return;
    if (!r) { goToStep(index + 1); return; }

    setStepIndex(index);
    setRect(r);
    const padded = { x: r.x - PAD, y: r.y - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };

    cardOpacity.setValue(0);
    if (!hasPositioned.current) {
      hasPositioned.current = true;
      cutX.setValue(padded.x);
      cutY.setValue(padded.y);
      cutW.setValue(padded.width);
      cutH.setValue(padded.height);
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    } else {
      Animated.parallel([
        Animated.spring(cutX, { toValue: padded.x, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutY, { toValue: padded.y, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutW, { toValue: padded.width, useNativeDriver: false, damping: 20, stiffness: 220 }),
        Animated.spring(cutH, { toValue: padded.height, useNativeDriver: false, damping: 20, stiffness: 220 }),
      ]).start();
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, delay: 150, useNativeDriver: true }).start();
    }
  }, [steps, onFinish, cardOpacity, cutX, cutY, cutW, cutH]);

  useEffect(() => {
    if (!visible) { hasPositioned.current = false; setRect(null); return; }
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

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    goToStep(stepIndex + 1);
  };
  const skip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onFinish();
  };

  const spaceBelow = SCREEN_H - (rect.y + rect.height);
  const spaceAbove = rect.y;
  const placeBelow = spaceBelow >= 170 || spaceBelow >= spaceAbove;
  const cardTop = placeBelow ? Math.min(rect.y + rect.height + PAD + CARD_GAP, SCREEN_H - 210) : undefined;
  const cardBottom = !placeBelow ? SCREEN_H - rect.y + PAD + CARD_GAP : undefined;
  const cardLeft = Math.max(20, Math.min(SCREEN_W - CARD_W - 20, rect.x + rect.width / 2 - CARD_W / 2));

  const textColor = isDarkMode ? '#F0ECE7' : '#1C1C1E';
  const subColor = isDarkMode ? 'rgba(240,236,231,0.75)' : 'rgba(28,28,30,0.7)';
  const dotOff = isDarkMode ? 'rgba(240,236,231,0.25)' : 'rgba(28,28,30,0.18)';
  const skipColor = isDarkMode ? 'rgba(240,236,231,0.55)' : 'rgba(28,28,30,0.5)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={skip}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="coachmark-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={SCREEN_W} height={SCREEN_H}>
              <SvgRect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="#fff" />
              <AnimatedSvgRect x={cutX} y={cutY} width={cutW} height={cutH} rx={radius} fill="#000" />
            </Mask>
          </Defs>
          <SvgRect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="rgba(10,9,8,0.80)" mask="url(#coachmark-mask)" />
          <AnimatedSvgRect
            x={cutX} y={cutY} width={cutW} height={cutH} rx={radius}
            stroke={accent} strokeWidth={2.5} fill="none"
          />
        </Svg>

        <Animated.View
          style={[
            styles.card,
            {
              left: cardLeft,
              width: CARD_W,
              top: cardTop,
              bottom: cardBottom,
              opacity: cardOpacity,
            },
          ]}
        >
          <BlurView
            intensity={isDarkMode ? 50 : 70}
            tint={isDarkMode ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardInner}>
            <Text style={[styles.title, { color: textColor }]}>{step.title}</Text>
            <Text style={[styles.body, { color: subColor }]}>{step.body}</Text>
            <View style={styles.footer}>
              <View style={styles.dots}>
                {steps.map((s, i) => (
                  <View key={s.key} style={[styles.dot, { backgroundColor: i === stepIndex ? accent : dotOff }]} />
                ))}
              </View>
              <View style={styles.actions}>
                {!isLast && (
                  <TouchableOpacity onPress={skip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.skipText, { color: skipColor }]}>Skip</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.nextBtn, { backgroundColor: accent }]} onPress={advance} activeOpacity={0.85}>
                  <Text style={styles.nextText}>{isLast ? 'Got it' : 'Next'}</Text>
                  {!isLast && <Ionicons name="arrow-forward" size={14} color="#fff" style={{ marginLeft: 4 }} />}
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
  card: {
    position: 'absolute',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(175,145,151,0.3)',
  },
  cardInner: { padding: 18, gap: 6 },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  body: { fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  skipText: { fontSize: 13, fontWeight: '600' },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18,
    backgroundColor: ACCENT,
  },
  nextText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
