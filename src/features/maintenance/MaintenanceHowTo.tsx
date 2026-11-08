// src/features/maintenance/MaintenanceHowTo.tsx
//
// "How Maintenance works" (approved 2026-11-08): a short animated sequence,
// not a sheet — four frames that play on their own, with dots to jump,
// pause and replay. Shown the first time someone opens Maintenance, then from
// "How this works" in its header.
//
// Two frames are worded to match what the app really does, where the mockup
// was looser: a reminder is made when an appointment is DONE (the server's
// handle_booking_completed_maintenance), not when it's booked; and "add your
// own" takes a name in your own words plus how often, counting from when you
// last had it, rather than starting with no date.
//
// The items in it are examples, not the client's data.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { FONT_BODY, FONT_DISPLAY, hapticLight, type SemanticColors } from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;
type Tone = 'bad' | 'warn' | 'ok' | 'mute';

const FRAME_MS = [7000, 7600, 7200, 6400];
const CAPTIONS: TranslationKey[] = [
  'maintenance.howto.frame1',
  'maintenance.howto.frame2',
  'maintenance.howto.frame3',
  'maintenance.howto.frame4',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  P: AppTheme;
  S: SemanticColors;
  t: T;
}

/** Fades and lifts in when it mounts. */
function Appear({ children, style }: { children: React.ReactNode; style?: object }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Schedules a frame's beats; every timer is cleared when the frame changes. */
function useBeats(frameKey: number, beats: [number, () => void][]) {
  useEffect(() => {
    const timers = beats.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per frame only
  }, [frameKey]);
}

/** Countdown wording for the demo, the same rule as countdownFor(). */
function demoCountdown(d: number, t: T): { n: number | null; unit: string; tone: Tone } {
  if (d < 0) return { n: -d, unit: t(d === -1 ? 'maintenance.countdown.dayOver' : 'maintenance.countdown.daysOver'), tone: 'bad' };
  if (d === 0) return { n: null, unit: t('maintenance.countdown.today'), tone: 'warn' };
  if (d <= 7) return { n: d, unit: t(d === 1 ? 'maintenance.countdown.day' : 'maintenance.countdown.days'), tone: 'warn' };
  if (d < 14) return { n: d, unit: t('maintenance.countdown.days'), tone: 'mute' };
  return { n: Math.round(d / 7), unit: t('maintenance.countdown.weeks'), tone: 'mute' };
}

function Ticket({ title, sub, n, unit, tone, P, S }: { title: string; sub: string; n: number | null; unit: string; tone: Tone; P: AppTheme; S: SemanticColors }) {
  const col = tone === 'bad' ? S.bad : tone === 'warn' ? S.warn : tone === 'ok' ? S.ok : P.sub;
  return (
    <View style={[styles.tk, { backgroundColor: P.card, borderColor: tone === 'bad' ? S.bad : P.border }]}>
      <View style={[styles.stub, { borderRightColor: P.border }]}>
        {n !== null ? <Text style={[styles.stubN, { color: col }]}>{n}</Text> : null}
        <Text style={[n !== null ? styles.stubU : styles.stubWord, { color: col }]}>{unit.toUpperCase()}</Text>
      </View>
      <View style={styles.tkBody}>
        <Text style={[styles.tkTitle, { color: P.text }]}>{title}</Text>
        <Text style={[styles.tkSub, { color: P.sub }]}>{sub}</Text>
      </View>
    </View>
  );
}

function Pressed({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <View style={on ? styles.pressed : undefined}>{children}</View>;
}

// ── Frame 1: a done appointment becomes a reminder; a suggestion is added ────
function FrameBooked({ P, S, t, k }: { P: AppTheme; S: SemanticColors; t: T; k: number }) {
  const [beat, setBeat] = useState(0);
  useBeats(k, [[300, () => setBeat(1)], [2000, () => setBeat(2)], [3000, () => setBeat(3)], [4800, () => setBeat(4)], [5300, () => setBeat(5)]]);
  return (
    <View style={styles.stage}>
      {beat === 1 && (
        <Appear style={[styles.coach, { backgroundColor: P.accent }]}>
          <Text style={[styles.coachKick, { color: P.onAccent }]}>{t('maintenance.howto.done').toUpperCase()}</Text>
          <Text style={[styles.coachText, { color: P.onAccent }]}>{t('maintenance.howto.sampleAppointment')}</Text>
        </Appear>
      )}
      {beat >= 2 && (
        <Appear>
          <Ticket title={t('maintenance.howto.sample.lashes')} sub={t('maintenance.howto.everyWeeks', { weeks: 3 })} n={3} unit={t('maintenance.countdown.weeks')} tone="mute" P={P} S={S} />
        </Appear>
      )}
      {beat >= 3 && beat < 5 && (
        <Appear style={[styles.sug, { borderColor: P.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.tkTitle, { color: P.text }]}>{t('maintenance.howto.sample.facial')}</Text>
            <Text style={[styles.tkSub, { color: P.sub }]}>{t('maintenance.howto.pickedForYou')}</Text>
          </View>
          <Pressed on={beat === 4}>
            <View style={[styles.miniBtn, { borderColor: P.border }]}>
              <Text style={[styles.miniBtnText, { color: P.accentText }]}>{t('maintenance.howto.add').toUpperCase()}</Text>
            </View>
          </Pressed>
        </Appear>
      )}
      {beat >= 5 && (
        <Appear>
          <Ticket title={t('maintenance.howto.sample.facial')} sub={t('maintenance.howto.everyWeeks', { weeks: 6 })} n={6} unit={t('maintenance.countdown.weeks')} tone="mute" P={P} S={S} />
        </Appear>
      )}
    </View>
  );
}

// ── Frame 2: counting down, amber then red ──────────────────────────────────
function FrameCountdown({ P, S, t, k }: { P: AppTheme; S: SemanticColors; t: T; k: number }) {
  const [d, setD] = useState(9);
  useEffect(() => {
    setD(9);
    const timer = setInterval(() => setD((x) => (x <= -2 ? x : x - 1)), 520);
    return () => clearInterval(timer);
  }, [k]);
  const c = demoCountdown(d, t);
  return (
    <View style={styles.stage}>
      <Ticket title={t('maintenance.howto.sample.nails')} sub={t('maintenance.howto.everyWeeks', { weeks: 3 })} n={c.n} unit={c.unit} tone={c.tone} P={P} S={S} />
      <Ticket title={t('maintenance.howto.sample.trim')} sub={t('maintenance.howto.everyWeeks', { weeks: 12 })} n={6} unit={t('maintenance.countdown.weeks')} tone="mute" P={P} S={S} />
      <Text style={[styles.hint, { color: P.sub }]}>{t('maintenance.howto.sameOnCard')}</Text>
    </View>
  );
}

// ── Frame 3: the big card's three actions ───────────────────────────────────
function FrameCard({ P, t, k }: { P: AppTheme; t: T; k: number }) {
  const [beat, setBeat] = useState(0);
  useBeats(k, [[700, () => setBeat(1)], [1700, () => setBeat(2)], [2400, () => setBeat(3)], [3500, () => setBeat(4)], [4400, () => setBeat(5)], [5400, () => setBeat(6)]]);
  const snoozed = beat >= 3;
  const done = beat >= 5;
  const n = done ? 3 : snoozed ? 7 : 3;
  const unit = t(done ? 'maintenance.countdown.weeks' : snoozed ? 'maintenance.countdown.days' : 'maintenance.countdown.daysOver');
  const hint = beat >= 5 ? 'maintenance.howto.hintDone' : beat >= 3 ? 'maintenance.howto.hintSnooze' : beat >= 1 ? 'maintenance.howto.hintBook' : null;
  const btn = (label: string, pressed: boolean, ghost = false) => (
    <Pressed on={pressed}>
      <View style={[styles.cardBtn, ghost ? { borderColor: P.onAccent } : { backgroundColor: P.onAccent, borderColor: P.onAccent }]}>
        <Text style={[styles.cardBtnText, { color: ghost ? P.onAccent : P.accent }]}>{label.toUpperCase()}</Text>
      </View>
    </Pressed>
  );
  return (
    <View style={styles.stage}>
      <View style={[styles.card, { backgroundColor: P.accent }]}>
        <Text style={[styles.coachKick, { color: P.onAccent }]}>
          {t(done ? 'maintenance.howto.doneNextIn' : 'maintenance.next.title').toUpperCase()}
        </Text>
        <View style={styles.bigRow}>
          <Text style={[styles.big, { color: P.onAccent }]}>{n}</Text>
          <Text style={[styles.bigUnit, { color: P.onAccent }]}>{unit.toUpperCase()}</Text>
        </View>
        <Text style={[styles.cardTitle, { color: P.onAccent }]}>{t('maintenance.howto.sample.lashes')}</Text>
        <View style={styles.cardActions}>
          {btn(t('maintenance.action.book'), beat === 1)}
          {btn(t('maintenance.action.doneIt'), beat === 5)}
          {btn(t('maintenance.action.snoozeWeek'), beat === 3, true)}
        </View>
      </View>
      <Text style={[styles.hint, { color: P.sub, textAlign: 'center' }]}>{hint ? t(hint) : ' '}</Text>
    </View>
  );
}

// ── Frame 4: add your own ───────────────────────────────────────────────────
function FrameAdd({ P, S, t, k }: { P: AppTheme; S: SemanticColors; t: T; k: number }) {
  const word = t('maintenance.howto.sample.own');
  const [typed, setTyped] = useState(0);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    setTyped(0);
    setBeat(0);
    let i = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        i += 1;
        setTyped(i);
        if (i >= word.length && timer) clearInterval(timer);
      }, 80);
    }, 400);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [k, word.length]);
  useBeats(k, [[2300, () => setBeat(1)], [3100, () => setBeat(2)], [3600, () => setBeat(3)]]);
  return (
    <View style={styles.stage}>
      <View style={[styles.input, { backgroundColor: P.surface, borderColor: P.border }]}>
        <Text style={[styles.inputText, { color: typed > 0 && beat < 3 ? P.text : P.sub }]}>
          {beat >= 3 ? t('maintenance.add.namePlaceholder') : typed > 0 ? word.slice(0, typed) : t('maintenance.add.namePlaceholder')}
        </Text>
      </View>
      <View style={styles.stepRow}>
        <Text style={[styles.tkSub, { color: P.sub }]}>{t('maintenance.add.repeats').toUpperCase()}</Text>
        <Pressed on={beat === 1}>
          <Text style={[styles.stepValue, { color: P.text }]}>{t('maintenance.howto.everyWeeks', { weeks: beat >= 1 ? 4 : 6 })}</Text>
        </Pressed>
        <View style={{ flex: 1 }} />
        <Pressed on={beat === 2}>
          <View style={[styles.miniBtn, { backgroundColor: P.accent, borderColor: P.accent }]}>
            <Text style={[styles.miniBtnText, { color: P.onAccent }]}>{t('maintenance.howto.add').toUpperCase()}</Text>
          </View>
        </Pressed>
      </View>
      {beat >= 3 && (
        <Appear>
          <Ticket title={word} sub={t('maintenance.rhythm.client', { weeks: 4 })} n={4} unit={t('maintenance.countdown.weeks')} tone="mute" P={P} S={S} />
        </Appear>
      )}
      <Ticket title={t('maintenance.howto.sample.trim')} sub={t('maintenance.howto.everyWeeks', { weeks: 12 })} n={6} unit={t('maintenance.countdown.weeks')} tone="mute" P={P} S={S} />
    </View>
  );
}

export function MaintenanceHowTo({ visible, onClose, P, S, t }: Props) {
  const insets = useSafeAreaInsets();
  const [frame, setFrame] = useState(0);
  // Bumped on every (re)start so a frame's timers restart from zero.
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);

  const goTo = useCallback((i: number) => {
    setFrame(i);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    if (visible) { setPlaying(true); goTo(0); }
  }, [visible, goTo]);

  useEffect(() => {
    if (!visible || !playing) return;
    const timer = setTimeout(() => goTo((frame + 1) % CAPTIONS.length), FRAME_MS[frame]);
    return () => clearTimeout(timer);
  }, [visible, playing, frame, run, goTo]);

  const k = run * 10 + frame;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { backgroundColor: P.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: P.text }]}>{t('maintenance.title')}</Text>
          <Text style={[styles.headSub, { color: P.sub }]}>{t('maintenance.howto.link')}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.close, { backgroundColor: P.card, borderColor: P.border }]}
            onPress={() => { hapticLight(); onClose(); }}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('maintenance.howto.close')}
          >
            <Ionicons name="close" size={18} color={P.accentText} />
          </TouchableOpacity>
        </View>

        <View style={styles.stageWrap}>
          {frame === 0 && <FrameBooked key={k} P={P} S={S} t={t} k={k} />}
          {frame === 1 && <FrameCountdown key={k} P={P} S={S} t={t} k={k} />}
          {frame === 2 && <FrameCard key={k} P={P} t={t} k={k} />}
          {frame === 3 && <FrameAdd key={k} P={P} S={S} t={t} k={k} />}
        </View>

        <Text style={[styles.caption, { color: P.text }]} accessibilityLiveRegion="polite">{t(CAPTIONS[frame]!)}</Text>
        <View style={styles.controls}>
          {CAPTIONS.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => { hapticLight(); goTo(i); }}
              hitSlop={8}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('maintenance.howto.frameN', { n: i + 1 })}
              accessibilityState={{ selected: i === frame }}
            >
              <View style={[styles.dot, { backgroundColor: i === frame ? P.accent : P.border }, i === frame && styles.dotOn]} />
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => { hapticLight(); setPlaying((p) => !p); }} activeOpacity={0.5} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.ctl, { color: P.accentText }]}>{t(playing ? 'maintenance.howto.pause' : 'maintenance.howto.play').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticLight(); goTo(frame); }} activeOpacity={0.5} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.ctl, { color: P.accentText }]}>{t('maintenance.howto.replay').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: P.accent }]}
          onPress={() => { hapticLight(); onClose(); }}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Text style={[styles.doneText, { color: P.onAccent }]}>{t('maintenance.howto.gotIt').toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 1 },
  headSub: { fontFamily: FONT_BODY, fontSize: 13 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  stageWrap: { flex: 1, justifyContent: 'center' },
  stage: { gap: 8 },
  coach: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  coachKick: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4, opacity: 0.8 },
  coachText: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 19 },
  tk: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  stub: { width: 82, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1.5, borderStyle: 'dashed' },
  stubN: { fontFamily: FONT_DISPLAY, fontSize: 30, lineHeight: 32 },
  stubU: { fontFamily: FONT_DISPLAY, fontSize: 9.5, letterSpacing: 1.2 },
  stubWord: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  tkBody: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, justifyContent: 'center' },
  tkTitle: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  tkSub: { fontFamily: FONT_BODY, fontSize: 11.5, marginTop: 1 },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  miniBtn: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 12 },
  miniBtnText: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1 },
  pressed: { transform: [{ scale: 0.92 }], opacity: 0.7 },
  hint: { fontFamily: FONT_BODY, fontSize: 12.5, marginTop: 6, minHeight: 18 },
  card: { borderRadius: 28, padding: 20 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  big: { fontFamily: FONT_DISPLAY, fontSize: 64, lineHeight: 68 },
  bigUnit: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1.4 },
  cardTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: 0.8, marginTop: 4 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  cardBtn: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 14 },
  cardBtnText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  input: { borderWidth: 1, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 16 },
  inputText: { fontFamily: FONT_BODY, fontSize: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  stepValue: { fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 0.8 },
  caption: { fontFamily: FONT_BODY, fontSize: 15, lineHeight: 21, minHeight: 42 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 22 },
  ctl: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1.2, marginLeft: 8 },
  doneBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center' },
  doneText: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1 },
});
