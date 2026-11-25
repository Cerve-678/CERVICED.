// src/features/maintenance/MaintenanceHowTo.tsx
//
// "How Maintenance works", as a "Show me" walkthrough (2026-11-25, replacing
// the 2026-11-08 ticket movie): a copy of the real Maintenance screen with a
// fingertip tapping through it, a caption, and a progress bar along the bottom
// that you can tap to jump to a step. Shown the first time someone opens
// Maintenance, then from the ⓘ next to its title.
//
// The copy is drawn with the screen's own pieces — NextUpCard,
// MaintenanceItemCard and the grouping in presentation.ts — fed sample items
// and a pretend "today", so it can't drift from what the screen really does.
// Nothing in it can be pressed and nothing real changes. The items are
// examples, not the client's data.
//
// Two steps follow what the app really does: a reminder is made when an
// appointment is DONE (the server's handle_booking_completed_maintenance), not
// when it's booked; and "add your own" counts from when you last had it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import type { MaintenanceItem } from '../../types/maintenance';
import { dateToYMD, toLocalDate } from '../../utils/dateUtils';
import { ThemedBackground } from '../../components/ThemedBackground';
import { doneOutcome, groupMaintenanceItems, nextUpFrom, snoozedDueOn } from './presentation';
import { NextUpCard, type DemoTap } from './NextUpCard';
import { MaintenanceItemCard } from './MaintenanceItemCard';
import { TapMark } from './TapMark';
import {
  FONT_BODY, FONT_DISPLAY, GhostButton, PrimaryButton, SectionLabel, countedLabel, hapticLight, type SemanticColors,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** How long each step plays before the next one. */
export const STEP_MS = [7000, 7600, 7600, 7000];
const CAPTIONS: TranslationKey[] = [
  'maintenance.howto.frame1',
  'maintenance.howto.frame2',
  'maintenance.howto.frame3',
  'maintenance.howto.frame4',
];

/** What the fingertip is on: a NextUpCard button, or something the copy draws. */
type Tap = DemoTap | 'add' | 'banner' | 'repeat' | 'submit';

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
  banner?: boolean;
  sheet?: { typed: string; weeks: number } | null;
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
        {overlay.banner ? (
          <Appear style={[styles.banner, { backgroundColor: P.accentDim, borderColor: P.border }]}>
            <Ionicons name="sparkles-outline" size={16} color={P.accentText} />
            <Text style={[styles.bannerText, { color: P.text }]}>{t('maintenance.picked.one')}</Text>
            <Ionicons name="chevron-forward" size={14} color={P.sub} />
            {tap === 'banner' ? <TapMark colour={P.accentText} /> : null}
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
          demoTap={tap === 'book' || tap === 'done' || tap === 'snooze' ? tap : null}
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
              <View>
                <Text style={[styles.repeat, { color: P.text }]}>{t('maintenance.howto.everyWeeks', { weeks: overlay.sheet.weeks })}</Text>
                {tap === 'repeat' ? <TapMark colour={P.accentText} /> : null}
              </View>
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

// ── Step 1: a done appointment becomes a reminder; a suggestion is added ─────
function StepBooked({ today, P, S, t, k }: StepProps) {
  const [beat, setBeat] = useState(0);
  useBeats(k, [[400, () => setBeat(1)], [2000, () => setBeat(2)], [3200, () => setBeat(3)], [4300, () => setBeat(4)], [5000, () => setBeat(5)]]);
  const items = useMemo(() => {
    const out: MaintenanceItem[] = [];
    if (beat >= 2) {
      out.push(sample(today, 21, {
        id: 'lashes', title: t('maintenance.howto.sample.lashes'), typeKey: 'lash_infill', providerName: 'Studio Noor',
        providerId: 'demo', repeatWeeks: 3, intervalSource: 'provider',
      }));
    }
    if (beat >= 5) {
      out.push(sample(today, 42, {
        id: 'facial', title: t('maintenance.howto.sample.facial'), typeKey: 'facial', origin: 'client', repeatWeeks: 6,
      }));
    }
    return out;
  }, [beat, today, t]);
  return (
    <DemoScreen
      items={items}
      today={today}
      tap={beat === 4 ? 'banner' : null}
      overlay={{ toast: beat === 1, banner: beat === 3 || beat === 4 }}
      P={P} S={S} t={t}
    />
  );
}

// ── Step 2: the days count down; inside a week it needs you, then it's overdue
function StepCountdown({ today, P, S, t, k }: StepProps) {
  const [shift, setShift] = useState(0);
  useEffect(() => {
    setShift(0);
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => {
      timer = setInterval(() => setShift(x => (x >= 11 ? x : x + 1)), 450);
    }, 600);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [k]);
  const items = useMemo(() => [
    sample(today, 9, { id: 'nails', title: t('maintenance.howto.sample.nails'), typeKey: 'gel_nails', providerName: 'The Nail Bar', providerId: 'demo', repeatWeeks: 3 }),
    sample(today, 42, { id: 'trim', title: t('maintenance.howto.sample.trim'), typeKey: 'trim', providerName: 'Kinks & Co', providerId: 'demo', repeatWeeks: 12 }),
  ], [today, t]);
  return <DemoScreen items={items} today={addDays(today, shift)} tap={null} overlay={{}} P={P} S={S} t={t} />;
}

// ── Step 3: the big card's three actions, and the next one stepping up ───────
function StepActions({ today, P, S, t, k, onHint }: StepProps & { onHint: (key: TranslationKey | null) => void }) {
  const start = useMemo(() => [
    sample(today, -3, { id: 'lashes', title: t('maintenance.howto.sample.lashes'), typeKey: 'lash_infill', providerName: 'Studio Noor', providerId: 'demo', repeatWeeks: 3 }),
    sample(today, 4, { id: 'nails', title: t('maintenance.howto.sample.nails'), typeKey: 'gel_nails', providerName: 'The Nail Bar', providerId: 'demo', repeatWeeks: 3 }),
  ], [today, t]);
  const [items, setItems] = useState(start);
  const [tap, setTap] = useState<Tap>(null);
  // Acts on whichever item leads the big card at that moment, as the real one does.
  const act = (fn: (item: MaintenanceItem) => Partial<MaintenanceItem>) =>
    setItems(prev => {
      const first = nextUpFrom(groupMaintenanceItems(prev, today)).due?.item;
      return first ? prev.map(i => (i.id === first.id ? { ...i, ...fn(i) } : i)) : prev;
    });
  useBeats(k, [
    [0, () => { setItems(start); onHint(null); }],
    [900, () => { setTap('book'); onHint('maintenance.howto.hintBook'); }],
    [2200, () => setTap(null)],
    [2700, () => { setTap('snooze'); onHint('maintenance.howto.hintSnooze'); }],
    [3300, () => { setTap(null); act(i => ({ dueOn: snoozedDueOn(i, today) })); }],
    [4600, () => { setTap('done'); onHint('maintenance.howto.hintDone'); }],
    [5200, () => {
      setTap(null);
      act(i => { const o = doneOutcome(i, today); return o.kind === 'update' ? o.patch : {}; });
    }],
  ]);
  return <DemoScreen items={items} today={today} tap={tap} overlay={{}} P={P} S={S} t={t} />;
}

// ── Step 4: add your own ─────────────────────────────────────────────────────
function StepAdd({ today, P, S, t, k }: StepProps) {
  const word = t('maintenance.howto.sample.own');
  const [beat, setBeat] = useState(0);
  const [typed, setTyped] = useState(0);
  useBeats(k, [[600, () => setBeat(1)], [1100, () => setBeat(2)], [3000, () => setBeat(3)], [3500, () => setBeat(4)], [4100, () => setBeat(5)], [4700, () => setBeat(6)]]);
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
    const out = [
      sample(today, 35, { id: 'lashes', title: t('maintenance.howto.sample.lashes'), typeKey: 'lash_infill', providerName: 'Studio Noor', providerId: 'demo', repeatWeeks: 5 }),
      sample(today, 63, { id: 'trim', title: t('maintenance.howto.sample.trim'), typeKey: 'trim', providerName: 'Kinks & Co', providerId: 'demo', repeatWeeks: 12 }),
    ];
    if (beat >= 6) {
      out.push(sample(today, 28, { id: 'own', title: word, origin: 'client', intervalSource: 'client', repeatWeeks: 4, lastDoneOn: today }));
    }
    return out;
  }, [beat, today, t, word]);
  const tap: Tap = beat === 1 ? 'add' : beat === 4 ? 'repeat' : beat === 5 ? 'submit' : null;
  const sheet = beat >= 2 && beat <= 5 ? { typed: word.slice(0, typed), weeks: beat >= 4 ? 4 : 6 } : null;
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
  const [hint, setHint] = useState<TranslationKey | null>(null);
  const fill = useRef(new Animated.Value(0)).current;
  // How much of the current step has played, so Pause/Play carries on where it was.
  const played = useRef({ key: -1, ms: 0 });

  const goTo = useCallback((i: number) => {
    setStep(i);
    setRun(r => r + 1);
    setHint(null);
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
          {step === 1 && <StepCountdown key={k} today={today} P={P} S={S} t={t} k={k} />}
          {step === 2 && <StepActions key={k} today={today} P={P} S={S} t={t} k={k} onHint={setHint} />}
          {step === 3 && <StepAdd key={k} today={today} P={P} S={S} t={t} k={k} />}
        </View>

        <Text style={[styles.hint, { color: P.accentText }]}>{hint ? t(hint) : ' '}</Text>
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
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 11 },
  bannerText: { fontFamily: FONT_BODY, fontSize: 13, flex: 1 },
  scrim: { justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, padding: 16, paddingTop: 10, gap: 10 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4 },
  sheetTitle: { fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 0.8 },
  sheetLabel: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { borderWidth: 1, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 16 },
  inputText: { fontFamily: FONT_BODY, fontSize: 14 },
  repeat: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 0.8, paddingVertical: 6, paddingHorizontal: 4 },
  hint: { fontFamily: FONT_BODY, fontSize: 13, textAlign: 'center', minHeight: 18 },
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
