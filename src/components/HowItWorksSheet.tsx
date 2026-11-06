import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The animated "how it works" sheet behind the Info Packs and Forms welcomes.
// Each welcome supplies only its stage (what is drawn) and its story steps; the
// timeline, step dots, play/pause, Reduce Motion handling and the sheet itself
// live here so the two can't drift apart.
//
// A story is written in story-seconds and plays at PLAYBACK_SPEED, so the pace
// is tuned in one place without re-timing every interpolation. Native-driver
// opacity/transform only. With Reduce Motion on it doesn't play: each step
// shows its finished frame and the dots step through.

/** 1 = real time. Raised from 1 on 2026-11-06 ("slightly faster"). */
const PLAYBACK_SPEED = 1.25;

export interface StoryStep {
  start: number;
  end: number;
  caption: string;
}

export interface HowItWorksPalette {
  card: string;
  surface: string;
  border: string;
  text: string;
  accent: string;
  onAccent: string;
  iconBg: string;
}

/** Interpolates the story clock, clamped: `at([1, 2], [0, 1])`. */
export type StoryAt = (input: number[], output: number[]) => Animated.AnimatedInterpolation<number>;

function stepAt(steps: readonly StoryStep[], t: number): number {
  for (let i = steps.length - 1; i >= 0; i--) if (t >= steps[i]!.start) return i;
  return 0;
}

export function HowItWorksSheet({
  visible, P, heading, headingFont, steps, primaryLabel, onPrimary, onClose, renderStage,
}: {
  visible: boolean;
  P: HowItWorksPalette;
  heading: string;
  headingFont?: string;
  /** A module-level constant: a new array each render restarts the story. */
  steps: readonly StoryStep[];
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
  renderStage: (at: StoryAt) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const total = steps[steps.length - 1]!.end;
  const t = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(600)).current;
  const runRef = useRef<Animated.CompositeAnimation | null>(null);
  const valueRef = useRef(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(on => { if (alive) setReduceMotion(on); })
      .catch(() => {});
    const id = t.addListener(({ value }) => {
      valueRef.current = value;
      setStep(prev => { const next = stepAt(steps, value); return next === prev ? prev : next; });
    });
    return () => { alive = false; t.removeListener(id); };
  }, [t, steps]);

  const play = useCallback((from: number) => {
    runRef.current?.stop();
    t.setValue(from);
    setPlaying(true);
    const run = Animated.timing(t, {
      toValue: total,
      duration: Math.max(0, ((total - from) * 1000) / PLAYBACK_SPEED),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    runRef.current = run;
    run.start(({ finished }) => { if (finished) setPlaying(false); });
  }, [t, total]);

  const pause = useCallback(() => {
    runRef.current?.stop();
    setPlaying(false);
  }, []);

  const jumpTo = useCallback((i: number) => {
    Haptics.selectionAsync().catch(() => {});
    if (reduceMotion) {
      runRef.current?.stop();
      t.setValue(steps[i]!.end - 0.01);
      return;
    }
    play(steps[i]!.start);
  }, [play, reduceMotion, steps, t]);

  useEffect(() => {
    if (visible) {
      Animated.spring(sheetY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }).start();
      if (reduceMotion) t.setValue(steps[0]!.end - 0.01);
      else play(0);
    } else {
      runRef.current?.stop();
      sheetY.setValue(600);
    }
  }, [visible, reduceMotion, play, sheetY, steps, t]);

  const at: StoryAt = (input, output) =>
    t.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });

  const caption = steps[step]!.caption;
  const ended = valueRef.current >= total - 0.05;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[st.sheet, { backgroundColor: P.card, paddingBottom: Math.max(24, insets.bottom + 12), transform: [{ translateY: sheetY }] }]}
          accessibilityViewIsModal
        >
          <View style={[st.handle, { backgroundColor: P.border }]} />
          <Text style={[st.heading, { color: P.text }, headingFont ? { fontFamily: headingFont } : st.headingFallback]}>{heading}</Text>

          <View style={[st.stage, { backgroundColor: P.surface, borderColor: P.border }]} accessible accessibilityLabel={caption}>
            {renderStage(at)}
          </View>

          <Text style={[st.caption, { color: P.text }]}>{caption}</Text>

          <View style={st.controls}>
            <View style={st.dots}>
              {steps.map((s, i) => (
                <TouchableOpacity key={s.start} onPress={() => jumpTo(i)} hitSlop={8} accessibilityLabel={`Step ${i + 1}`}>
                  <View style={[st.dot, { backgroundColor: i === step ? P.accent : P.border, width: i === step ? 18 : 6 }]} />
                </TouchableOpacity>
              ))}
            </View>
            {!reduceMotion && (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); if (playing) pause(); else play(ended ? 0 : valueRef.current); }}
                style={[st.playBtn, { backgroundColor: P.iconBg }]}
                activeOpacity={0.75}
                accessibilityLabel={playing ? 'Pause' : 'Play'}
              >
                <Ionicons name={playing ? 'pause' : ended ? 'refresh' : 'play'} size={14} color={P.text} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={[st.primary, { backgroundColor: P.accent }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPrimary(); }} activeOpacity={0.75}>
            <Text style={[st.primaryText, { color: P.onAccent }]}>{primaryLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.secondary} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClose(); }} activeOpacity={0.7}>
            <Text style={[st.secondaryText, { color: P.accent }]}>Not now</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  heading: { fontSize: 22, textAlign: 'center', marginBottom: 14 },
  headingFallback: { fontWeight: '700', letterSpacing: -0.3 },
  stage: { height: 236, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', justifyContent: 'center' },
  caption: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14, minHeight: 40, paddingHorizontal: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6, marginBottom: 14 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  playBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { borderRadius: 100, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
