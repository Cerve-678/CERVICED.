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
import { BAKBAK, type InfoPackPalette } from './infoPackPalette';

// "How Info Packs work", shown once per account (tour key
// provider_info_packs) and reopened from the screen's ⓘ.
//
// One 14s timeline drives everything, built from the screen's own pieces: the
// pack card writes itself, a service chip lights up, it's sent, then the view
// turns to the client's phone where the notification lands and the pack opens
// with their booking. Native-driver opacity/transform only. With Reduce Motion
// on it doesn't play; each step shows its finished frame and the dots step
// through.

const TOTAL = 14;
const STEPS = [
  { start: 0, end: 3.4, caption: 'Write your aftercare, prep or what-to-bring notes once.' },
  { start: 3.4, end: 6.4, caption: 'Pick the services it goes with.' },
  { start: 6.4, end: 8.6, caption: 'Send it to clients already booked, or keep it for new bookings.' },
  { start: 8.6, end: TOTAL, caption: 'They get a notification and read it with their booking. New bookings get it automatically.' },
] as const;

function stepAt(t: number): number {
  for (let i = STEPS.length - 1; i >= 0; i--) if (t >= STEPS[i]!.start) return i;
  return 0;
}

export function InfoPackWelcome({
  visible, P, exampleTitle, exampleLines, serviceChips, onStart, onClose,
}: {
  visible: boolean;
  P: InfoPackPalette;
  exampleTitle: string;
  exampleLines: string[];
  serviceChips: string[];
  onStart: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
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
      setStep(prev => { const next = stepAt(value); return next === prev ? prev : next; });
    });
    return () => { alive = false; t.removeListener(id); };
  }, [t]);

  const play = useCallback((from: number) => {
    runRef.current?.stop();
    t.setValue(from);
    setPlaying(true);
    const run = Animated.timing(t, {
      toValue: TOTAL,
      duration: Math.max(0, (TOTAL - from) * 1000),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    runRef.current = run;
    run.start(({ finished }) => { if (finished) setPlaying(false); });
  }, [t]);

  const pause = useCallback(() => {
    runRef.current?.stop();
    setPlaying(false);
  }, []);

  const jumpTo = useCallback((i: number) => {
    Haptics.selectionAsync().catch(() => {});
    if (reduceMotion) {
      runRef.current?.stop();
      t.setValue(STEPS[i]!.end - 0.01);
      return;
    }
    play(STEPS[i]!.start);
  }, [play, reduceMotion, t]);

  useEffect(() => {
    if (visible) {
      Animated.spring(sheetY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }).start();
      if (reduceMotion) t.setValue(STEPS[0]!.end - 0.01);
      else play(0);
    } else {
      runRef.current?.stop();
      sheetY.setValue(600);
    }
  }, [visible, reduceMotion, play, sheetY, t]);

  // ── Timeline pieces ──
  const at = (input: number[], output: number[]) =>
    t.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });

  const editorOpacity = at([0, 0.2, 8.6, 9.1], [0, 1, 1, 0]);
  const editorScale = at([8.6, 9.1], [1, 0.94]);
  const writeLine = (start: number) => ({
    opacity: at([start, start + 0.45], [0, 1]),
    transform: [{ translateX: at([start, start + 0.45], [-10, 0]) }],
  });
  const chipsIn = { opacity: at([3.5, 3.9], [0, 1]), transform: [{ translateY: at([3.5, 3.9], [8, 0]) }] };
  const chipLit = at([4.5, 4.9], [0, 1]);
  const sentPill = { opacity: at([6.9, 7.2], [0, 1]), transform: [{ scale: at([6.9, 7.2, 7.4], [0.6, 1.08, 1]) }] };

  const phoneIn = { opacity: at([8.8, 9.3], [0, 1]), transform: [{ translateY: at([8.8, 9.4], [40, 0]) }] };
  const notif = {
    opacity: at([9.7, 10.0, 11.1, 11.4], [0, 1, 1, 0]),
    transform: [{ translateY: at([9.7, 10.0], [-26, 0]) }],
  };
  const packRow = { opacity: at([10.3, 10.6], [0, 1]), transform: [{ translateY: at([10.3, 10.6], [6, 0]) }] };
  const tapRing = { opacity: at([11.2, 11.35, 11.6], [0, 0.5, 0]), transform: [{ scale: at([11.2, 11.6], [0.6, 1.4]) }] };
  const packOpen = { transform: [{ translateY: at([11.5, 12.1], [180, 0]) }] };

  const chips = serviceChips.length > 0 ? serviceChips.slice(0, 3) : ['Your service'];
  const lines = exampleLines.slice(0, 3);
  const caption = STEPS[step]!.caption;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[st.sheet, { backgroundColor: P.card, paddingBottom: Math.max(24, insets.bottom + 12), transform: [{ translateY: sheetY }] }]}
          accessibilityViewIsModal
        >
          <View style={[st.handle, { backgroundColor: P.border }]} />
          <Text style={[st.heading, { color: P.text }]}>Write it once. We send it.</Text>

          {/* ── Stage ── */}
          <View style={[st.stage, { backgroundColor: P.surface, borderColor: P.border }]} accessible accessibilityLabel={caption}>
            {/* Editor: the pack card writing itself, then its service chips */}
            <Animated.View style={[st.editor, { opacity: editorOpacity, transform: [{ scale: editorScale }] }]}>
              <View style={[st.packCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}>
                <Animated.Text style={[st.packTitle, { color: P.text }, writeLine(0.3)]} numberOfLines={1}>{exampleTitle}</Animated.Text>
                {lines.map((line, i) => (
                  <Animated.Text key={line} style={[st.packLine, { color: P.sub }, writeLine(0.9 + i * 0.7)]} numberOfLines={1}>
                    {line}
                  </Animated.Text>
                ))}
                <Animated.View style={[st.sentPill, { backgroundColor: P.accent }, sentPill]}>
                  <Ionicons name="paper-plane" size={11} color={P.onAccent} />
                  <Text style={[st.sentPillText, { color: P.onAccent }]}>Sent</Text>
                </Animated.View>
              </View>
              <Animated.View style={[st.chips, chipsIn]}>
                {chips.map((name, i) => (
                  <View key={name} style={[st.chip, { backgroundColor: P.card, borderColor: P.border }]}>
                    {i === 0 && (
                      <Animated.View style={[StyleSheet.absoluteFill, st.chipLit, { borderColor: P.accent, backgroundColor: P.accentTint, opacity: chipLit }]} />
                    )}
                    <Text style={[st.chipText, { color: i === 0 ? P.text : P.sub }]} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </Animated.View>
            </Animated.View>

            {/* Client's phone: their booking, the notification, the pack */}
            <Animated.View style={[st.phone, { borderColor: P.text, backgroundColor: P.bg }, phoneIn]}>
              <View style={[st.phoneBooking, { backgroundColor: P.card }]}>
                <Text style={[st.phoneBookingTitle, { color: P.text }]} numberOfLines={1}>{chips[0]}</Text>
                <Text style={[st.phoneBookingMeta, { color: P.sub }]}>Your booking</Text>
              </View>
              <Text style={[st.phoneLabel, { color: P.sub }]}>INFO PACKS</Text>
              <Animated.View style={[st.phoneRow, { backgroundColor: P.card }, packRow]}>
                <Ionicons name="document-text-outline" size={11} color={P.text} />
                <Text style={[st.phoneRowText, { color: P.text }]} numberOfLines={1}>{exampleTitle}</Text>
                <Text style={[st.phoneNew, { color: P.accent }]}>NEW</Text>
                <Animated.View style={[st.tapRing, { borderColor: P.accent }, tapRing]} />
              </Animated.View>
              <Animated.View style={[st.notif, { backgroundColor: P.card, shadowColor: P.shadow }, notif]}>
                <Text style={[st.notifTitle, { color: P.text }]}>Info From Your Provider</Text>
                <Text style={[st.notifBody, { color: P.sub }]} numberOfLines={1}>Sent you “{exampleTitle}”</Text>
              </Animated.View>
              <Animated.View style={[st.phoneSheet, { backgroundColor: P.card }, packOpen]}>
                <Text style={[st.phoneSheetTitle, { color: P.text }]} numberOfLines={1}>{exampleTitle}</Text>
                {lines.map(line => (
                  <Text key={line} style={[st.phoneSheetLine, { color: P.text }]} numberOfLines={2}>{line}</Text>
                ))}
              </Animated.View>
            </Animated.View>
          </View>

          <Text style={[st.caption, { color: P.text }]}>{caption}</Text>

          <View style={st.controls}>
            <View style={st.dots}>
              {STEPS.map((s, i) => (
                <TouchableOpacity key={s.start} onPress={() => jumpTo(i)} hitSlop={8} accessibilityLabel={`Step ${i + 1}`}>
                  <View style={[st.dot, { backgroundColor: i === step ? P.accent : P.border, width: i === step ? 18 : 6 }]} />
                </TouchableOpacity>
              ))}
            </View>
            {!reduceMotion && (
              <TouchableOpacity
                onPress={() => (playing ? pause() : play(valueRef.current >= TOTAL - 0.05 ? 0 : valueRef.current))}
                style={[st.playBtn, { backgroundColor: P.iconBg }]}
                activeOpacity={0.75}
                accessibilityLabel={playing ? 'Pause' : 'Play'}
              >
                <Ionicons name={playing ? 'pause' : valueRef.current >= TOTAL - 0.05 ? 'refresh' : 'play'} size={14} color={P.text} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={[st.primary, { backgroundColor: P.accent }]} onPress={onStart} activeOpacity={0.85}>
            <Text style={[st.primaryText, { color: P.onAccent }]}>Start from an example</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.secondary} onPress={onClose} activeOpacity={0.7}>
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
  heading: { fontFamily: BAKBAK, fontSize: 22, textAlign: 'center', marginBottom: 14 },

  stage: { height: 236, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', justifyContent: 'center' },
  editor: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, padding: 14, justifyContent: 'center' },
  packCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  packTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2, marginRight: 64 },
  packLine: { fontSize: 13 },
  sentPill: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100 },
  sentPillText: { fontSize: 11, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 12 },
  chip: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, overflow: 'hidden', flexShrink: 1 },
  chipLit: { borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },

  phone: { position: 'absolute', alignSelf: 'center', top: 12, bottom: 12, width: 150, borderRadius: 22, borderWidth: 3, padding: 8, overflow: 'hidden' },
  phoneBooking: { borderRadius: 10, padding: 8, marginTop: 4 },
  phoneBookingTitle: { fontSize: 11, fontWeight: '800' },
  phoneBookingMeta: { fontSize: 9, marginTop: 1 },
  phoneLabel: { fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 7 },
  phoneRowText: { flex: 1, fontSize: 9, fontWeight: '700' },
  phoneNew: { fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  tapRing: { position: 'absolute', left: '40%', top: -4, width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  notif: { position: 'absolute', top: 6, left: 6, right: 6, borderRadius: 10, padding: 7, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  notifTitle: { fontSize: 8, fontWeight: '800' },
  notifBody: { fontSize: 8, marginTop: 1 },
  phoneSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 10, gap: 5 },
  phoneSheetTitle: { fontSize: 10, fontWeight: '800', marginBottom: 2 },
  phoneSheetLine: { fontSize: 8, lineHeight: 11 },

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
