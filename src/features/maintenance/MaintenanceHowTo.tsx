// src/features/maintenance/MaintenanceHowTo.tsx
//
// "How Maintenance works", as a "Show me" walkthrough (2026-11-25, replacing
// the 2026-11-08 ticket movie): a copy of the real Maintenance screen with a
// fingertip tapping through it, a caption, and a progress bar along the bottom
// that you can tap to jump to a step. Shown the first time someone opens
// Maintenance, then from the ⓘ next to its title.
//
// Kept deliberately small (cut from four steps the same day, "too much going
// on"): three steps, one short line and at most one tap each, following the
// same Lash infill from appointment to reminder to Book. Snooze, Done it and
// suggestions aren't acted out; the real screen labels them plainly.
//
// The copy is drawn with the screen's own pieces — NextUpCard,
// MaintenanceItemCard and the grouping in presentation.ts — fed sample items
// and a pretend "today", so it can't drift from what the screen really does.
// Nothing in it can be pressed and nothing real changes. The items are
// examples, not the client's data.
//
// Step 1 follows what the app really does: a reminder is made when an
// appointment is DONE (the server's handle_booking_completed_maintenance), not
// when it's booked.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import type { MaintenanceItem } from '../../types/maintenance';
import { dateToYMD, toLocalDate } from '../../utils/dateUtils';
import { ThemedBackground } from '../../components/ThemedBackground';
import { groupMaintenanceItems, nextUpFrom } from './presentation';
import { NextUpCard, type DemoTap } from './NextUpCard';
import { MaintenanceItemCard } from './MaintenanceItemCard';
import { TapMark } from './TapMark';
import {
  FONT_BODY, FONT_DISPLAY, GhostButton, PrimaryButton, SectionLabel, countedLabel, hapticLight, type SemanticColors,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** How long each step plays before the next one. */
export const STEP_MS = [4800, 5200, 6000];
const CAPTIONS: TranslationKey[] = [
  'maintenance.howto.frame1',
  'maintenance.howto.frame2',
  'maintenance.howto.frame3',
];

/** What the fingertip is on: the big card's Book, or something the copy draws. */
type Tap = DemoTap | 'add' | 'submit';

interface Props {
  visible: boolean;
  onClose: () => void;
  P: AppTheme;
  S: SemanticColors;
  t: T;
}

const noop = () => {};

function addDays(ymd: string, days: number): string {
  const d = toLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return dateToYMD(d);
}

/** A sample item, due `inDays` from `today`, last done one interval before. */
function sample(today: string, inDays: number, p: Partial<MaintenanceItem> & Pick<MaintenanceItem, 'id' | 'title'>): MaintenanceItem {
  const dueOn = addDays(today, inDays);
  const weeks = p.repeatWeeks ?? null;
  const lastDoneOn = weeks ? addDays(dueOn, -weeks * 7) : today;
  return {
    kind: 'service', origin: 'booking', typeKey: null, providerId: null, serviceId: null, providerName: null,
    repeatWeeks: null, intervalEdited: false, intervalSource: 'default', learnedDays: null, learnedFrom: null,
    lastDoneOn, dueOn, eventOn: null, paused: false, note: null, createdAt: `${lastDoneOn}T09:00:00Z`,
    ...p,
  };
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

/** Schedules a step's beats; every timer is cleared when the step changes. */
function useBeats(stepKey: number, beats: [number, () => void][]) {
  useEffect(() => {
    const timers = beats.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per step only
  }, [stepKey]);
}

interface Overlay {
  toast?: boolean;
  sheet?: { typed: string } | null;
}

/** The copy of the Maintenance screen: header, big card, then the lists. */
function DemoScreen({ items, today, tap, overlay, P, S, t }: {
  items: MaintenanceItem[]; today: string; tap: Tap; overlay: Overlay; P: AppTheme; S: SemanticColors; t: T;
}) {
  const groups = useMemo(() => groupMaintenanceItems(items, today), [items, today]);
  const nextUp = useMemo(() => nextUpFrom(groups), [groups]);
  const list = (key: TranslationKey, rows: typeof groups.comingUp) => rows.length > 0 && (
    <>
      <SectionLabel text={countedLabel(t(key), rows.length)} P={P} />
      {rows.map(({ item, view }) => (
        <Appear key={item.id}>
          <MaintenanceItemCard item={item} view={view} P={P} S={S} t={t} onAction={noop} onMenu={noop} />
        </Appear>
      ))}
    </>
  );

  return (
    <View style={[styles.frame, { backgroundColor: P.bg, borderColor: P.border }]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={[styles.circ, { backgroundColor: P.card, borderColor: P.border }]}>
            <Ionicons name="chevron-back" size={16} color={P.accentText} />
          </View>
          <Text style={[styles.title, { color: P.text }]}>{t('maintenance.title')}</Text>
          <Ionicons name="information-circle-outline" size={18} color={P.accentText} />
          <View style={{ flex: 1 }} />
          <View>
            <GhostButton small P={P} icon="add" label={t('maintenance.addMine')} onPress={noop} />
            {tap === 'add' ? <TapMark colour={P.accentText} /> : null}
          </View>
        </View>

        {overlay.toast ? (
          <Appear style={[styles.toast, { backgroundColor: P.accent }]}>
            <Text style={[styles.toastKick, { color: P.onAccent }]}>{t('maintenance.howto.done').toUpperCase()}</Text>
            <Text style={[styles.toastText, { color: P.onAccent }]}>{t('maintenance.howto.sampleAppointment')}</Text>
          </Appear>
        ) : null}

        <NextUpCard
          nextUp={nextUp}
          P={P}
          t={t}
          onBook={noop}
          onDone={noop}
          onSnooze={noop}
          busyItemId={null}
          demoTap={tap === 'book' ? 'book' : null}
        />
        {list('maintenance.section.attention', groups.needsAttention)}
        {list('maintenance.section.comingUp', groups.comingUp)}
      </View>

      {overlay.sheet ? (
        <View style={[StyleSheet.absoluteFill, styles.scrim]}>
          <Appear style={[styles.sheet, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={[styles.grabber, { backgroundColor: P.border }]} />
            <Text style={[styles.sheetTitle, { color: P.text }]}>{t('maintenance.add.title')}</Text>
            <Text style={[styles.sheetLabel, { color: P.sub }]}>{t('maintenance.add.whatFor').toUpperCase()}</Text>
            <View style={[styles.input, { backgroundColor: P.surface, borderColor: P.border }]}>
              <Text style={[styles.inputText, { color: overlay.sheet.typed ? P.text : P.sub }]}>
                {overlay.sheet.typed || t('maintenance.add.namePlaceholder')}
              </Text>
            </View>
            <View style={styles.sheetRow}>
              <Text style={[styles.sheetLabel, { color: P.sub }]}>{t('maintenance.add.repeats').toUpperCase()}</Text>
              <Text style={[styles.repeat, { color: P.text }]}>{t('maintenance.howto.everyWeeks', { weeks: 4 })}</Text>
            </View>
            <View>
              <PrimaryButton P={P} label={t('maintenance.add.submit')} onPress={noop} />
              {tap === 'submit' ? <TapMark colour={P.onAccent} /> : null}
            </View>
          </Appear>
        </View>
      ) : null}
    </View>
  );
}

/** The one item the walkthrough follows from start to finish. */
function lashes(today: string, inDays: number, t: T): MaintenanceItem {
  return sample(today, inDays, {
    id: 'lashes', title: t('maintenance.howto.sample.lashes'), typeKey: 'lash_infill', providerName: 'Studio Noor',
    providerId: 'demo', repeatWeeks: 3, intervalSource: 'provider',
  });
}

function trim(today: string, inDays: number, t: T): MaintenanceItem {
  return sample(today, inDays, {
    id: 'trim', title: t('maintenance.howto.sample.trim'), typeKey: 'trim', providerName: 'Kinks & Co', providerId: 'demo', repeatWeeks: 12,
  });
}

// ── Step 1: a done appointment becomes a reminder ───────────────────────────
function StepBooked({ today, P, S, t, k }: StepProps) {
  const [beat, setBeat] = useState(0);
  useBeats(k, [[400, () => setBeat(1)], [1800, () => setBeat(2)]]);
  const items = useMemo(() => (beat >= 2 ? [lashes(today, 21, t)] : []), [beat, today, t]);
  return <DemoScreen items={items} today={today} tap={null} overlay={{ toast: beat === 1 }} P={P} S={S} t={t} />;
}

// ── Step 2: when it's due it moves up to the big card; tap Book ─────────────
// One jump a week on rather than a ticking count: the lash infill goes from
// nine days away to two, and up to the big card.
function StepDue({ today, P, S, t, k }: StepProps) {
  const [beat, setBeat] = useState(0);
  useBeats(k, [[1400, () => setBeat(1)], [2900, () => setBeat(2)], [4100, () => setBeat(3)]]);
  const items = useMemo(() => [lashes(today, 9, t), trim(today, 42, t)], [today, t]);
  return (
    <DemoScreen
      items={items}
      today={beat >= 1 ? addDays(today, 7) : today}
      tap={beat === 2 ? 'book' : null}
      overlay={{}}
      P={P} S={S} t={t}
    />
  );
}

// ── Step 3: add your own ─────────────────────────────────────────────────────
function StepAdd({ today, P, S, t, k }: StepProps) {
  const word = t('maintenance.howto.sample.own');
  const [beat, setBeat] = useState(0);
  const [typed, setTyped] = useState(0);
  useBeats(k, [[600, () => setBeat(1)], [1100, () => setBeat(2)], [3300, () => setBeat(3)], [3900, () => setBeat(4)]]);
  useEffect(() => {
    if (beat !== 2) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= word.length) clearInterval(timer);
    }, 85);
    return () => clearInterval(timer);
  }, [beat, word.length]);
  const items = useMemo(() => {
    const out = [lashes(today, 35, t), trim(today, 63, t)];
    if (beat >= 4) {
      out.push(sample(today, 28, { id: 'own', title: word, origin: 'client', intervalSource: 'client', repeatWeeks: 4, lastDoneOn: today }));
    }
    return out;
  }, [beat, today, t, word]);
  const tap: Tap = beat === 1 ? 'add' : beat === 3 ? 'submit' : null;
  const sheet = beat === 2 || beat === 3 ? { typed: word.slice(0, typed) } : null;
  return <DemoScreen items={items} today={today} tap={tap} overlay={{ sheet }} P={P} S={S} t={t} />;
}

interface StepProps { today: string; P: AppTheme; S: SemanticColors; t: T; k: number }

export function MaintenanceHowTo({ visible, onClose, P, S, t }: Props) {
  const insets = useSafeAreaInsets();
  const today = dateToYMD(new Date());
  const [step, setStep] = useState(0);
  // Bumped on every (re)start so a step's timers restart from zero.
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const fill = useRef(new Animated.Value(0)).current;
  // How much of the current step has played, so Pause/Play carries on where it was.
  const played = useRef({ key: -1, ms: 0 });

  const goTo = useCallback((i: number) => {
    setStep(i);
    setRun(r => r + 1);
  }, []);

  useEffect(() => {
    if (visible) { setPlaying(true); goTo(0); }
  }, [visible, goTo]);

  const k = run * 10 + step;

  useEffect(() => {
    if (!visible || !playing) return;
    if (played.current.key !== k) played.current = { key: k, ms: 0 };
    const already = played.current.ms;
    const total = STEP_MS[step]!;
    const remaining = Math.max(0, total - already);
    const startedAt = Date.now();
    fill.setValue(already / total);
    Animated.timing(fill, { toValue: 1, duration: remaining, easing: Easing.linear, useNativeDriver: false }).start();
    const timer = setTimeout(() => goTo((step + 1) % CAPTIONS.length), remaining);
    return () => {
      clearTimeout(timer);
      fill.stopAnimation();
      if (played.current.key === k) played.current.ms = already + (Date.now() - startedAt);
    };
  }, [visible, playing, step, k, goTo, fill]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <ThemedBackground style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <Text style={[styles.heading, { color: P.text }]}>{t('maintenance.howto.link')}</Text>
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

        <View style={styles.stage}>
          {step === 0 && <StepBooked key={k} today={today} P={P} S={S} t={t} k={k} />}
          {step === 1 && <StepDue key={k} today={today} P={P} S={S} t={t} k={k} />}
          {step === 2 && <StepAdd key={k} today={today} P={P} S={S} t={t} k={k} />}
        </View>

        <Text style={[styles.caption, { color: P.text }]} accessibilityLiveRegion="polite">{t(CAPTIONS[step]!)}</Text>

        <View style={styles.bars}>
          {CAPTIONS.map((_, i) => (
            <TouchableOpacity
              key={i}
              style={styles.barHit}
              onPress={() => { hapticLight(); goTo(i); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('maintenance.howto.frameN', { n: i + 1 })}
              accessibilityState={{ selected: i === step }}
            >
              <View style={[styles.bar, { backgroundColor: P.border }]}>
                {i < step ? <View style={[styles.barFill, { backgroundColor: P.accent, width: '100%' }]} /> : null}
                {i === step ? <Animated.View style={[styles.barFill, { backgroundColor: P.accent, width }]} /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.controls}>
          <TouchableOpacity onPress={() => { hapticLight(); setPlaying(p => !p); }} activeOpacity={0.5} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.ctl, { color: P.accentText }]}>{t(playing ? 'maintenance.howto.pause' : 'maintenance.howto.play').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticLight(); goTo(step); }} activeOpacity={0.5} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.ctl, { color: P.accentText }]}>{t('maintenance.howto.replay').toUpperCase()}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: P.accent }]}
            onPress={() => { hapticLight(); onClose(); }}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={[styles.doneText, { color: P.onAccent }]}>{t('maintenance.howto.gotIt').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </ThemedBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center' },
  heading: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1 },
  // The copy of the screen: clipped at the bottom like a phone screen.
  frame: { flex: 1, borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  inner: { padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  circ: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1 },
  toast: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  toastKick: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4, opacity: 0.85 },
  toastText: { fontFamily: FONT_BODY, fontSize: 14 },
  scrim: { justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, padding: 16, paddingTop: 10, gap: 10 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4 },
  sheetTitle: { fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 0.8 },
  sheetLabel: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { borderWidth: 1, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 16 },
  inputText: { fontFamily: FONT_BODY, fontSize: 14 },
  repeat: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 0.8, paddingVertical: 6, paddingHorizontal: 4 },
  caption: { fontFamily: FONT_BODY, fontSize: 15, lineHeight: 21, minHeight: 42 },
  bars: { flexDirection: 'row', gap: 6 },
  barHit: { flex: 1, paddingVertical: 8 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ctl: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1.2 },
  doneBtn: { borderRadius: 100, paddingVertical: 13, paddingHorizontal: 26, alignItems: 'center' },
  doneText: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1 },
});
