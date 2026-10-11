// src/features/maintenance/SetupFlow.tsx
//
// First-run setup, three steps (screen state, like the rest of Beauty Profile):
//   1. What we'll use — the Beauty Profile answers suggestions come from.
//   2. A few optional questions — protective style, events, last patch test.
//   3. Suggestions with switches, each citing its answer, plus an explicit,
//      UNTICKED opt-in for push reminders. Nothing is saved until "Add".
//
// The answers are saved to Maintenance (maintenance_settings), not to the
// Beauty Profile, so they never count toward its completeness.

import React, { useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import { MAINTENANCE_MAX_WEEKS, MAINTENANCE_MIN_WEEKS } from '../../constants/maintenanceServiceTypes';
import type { BeautyData } from '../../types/beautyProfile';
import type { MaintenanceSettings, MaintenanceSetupAnswers, NewMaintenanceItem, ProtectiveStyle } from '../../types/maintenance';
import { dateToYMD, formatShortDayDate, toLocalDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import { buildMaintenanceSuggestions, PROTECTIVE_STYLE_LABELS, type MaintenanceSuggestion } from '../../utils/maintenanceSuggestions';
import type { MaintenanceState } from './useMaintenance';
import {
  Chip, FONT_BODY, FONT_DISPLAY, GhostButton, Note, PrimaryButton, WeekStepper,
  semanticColors, ui, hapticError, hapticLight, hapticSelection, hapticSuccess,
} from './ui';

interface Props {
  profile: BeautyData;
  state: MaintenanceState;
  onClose: () => void;
  onDone: () => void;
}

type Step = 1 | 2 | 3;
const STYLES: ProtectiveStyle[] = ['braids', 'twists', 'locs', 'wigs_weaves'];
const DEFAULT_WEAR_WEEKS = 6;
const MAX_EVENTS = 3;

export function SetupFlow({ profile, state, onClose, onDone }: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => semanticColors(isDarkMode), [isDarkMode]);

  const [step, setStep] = useState<Step>(1);
  const [style, setStyle] = useState<ProtectiveStyle | null>(state.settings?.protectiveStyle ?? null);
  const [wearWeeks, setWearWeeks] = useState(state.settings?.protectiveWearWeeks ?? DEFAULT_WEAR_WEEKS);
  const [weeksIn, setWeeksIn] = useState<number | null>(null);
  const [events, setEvents] = useState<{ name: string; date: string | null }[]>([]);
  const [eventPicker, setEventPicker] = useState<number | null>(null);
  const [patchDate, setPatchDate] = useState<string | null>(state.settings?.lastPatchTestOn ?? null);
  const [patchPicker, setPatchPicker] = useState(false);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [optIn, setOptIn] = useState(false); // explicit opt-in: starts unticked
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const answers: MaintenanceSetupAnswers = useMemo(() => ({
    protectiveStyle: style,
    protectiveWearWeeks: wearWeeks,
    protectiveWeeksIn: style ? weeksIn : null,
    events: events.filter(e => e.date).map(e => ({ name: e.name, date: e.date! })),
    lastPatchTestOn: patchDate,
  }), [style, wearWeeks, weeksIn, events, patchDate]);

  // Step 1 shows exactly the profile answers the rules will use.
  const profileAnswers = useMemo(() => {
    const blank: MaintenanceSetupAnswers = { protectiveStyle: null, protectiveWearWeeks: DEFAULT_WEAR_WEEKS, protectiveWeeksIn: null, events: [], lastPatchTestOn: null };
    return [...new Set(buildMaintenanceSuggestions(profile, blank, [], today).map(s => s.answer))];
  }, [profile, today]);

  const suggestions = useMemo(
    () => buildMaintenanceSuggestions(profile, answers, state.items, today),
    [profile, answers, state.items, today],
  );
  const chosen = suggestions.filter(s => !off.has(s.id));

  const toggle = (s: MaintenanceSuggestion) => {
    hapticSelection();
    setOff(prev => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    const settings: MaintenanceSettings = {
      protectiveStyle: style,
      protectiveWearWeeks: style ? wearWeeks : null,
      lastPatchTestOn: patchDate,
      setupCompletedAt: new Date().toISOString(),
    };
    const newItems: NewMaintenanceItem[] = chosen.map(s => ({
      kind: s.kind,
      title: s.title,
      typeKey: s.typeKey,
      providerId: null,
      serviceId: null,
      providerName: null,
      repeatWeeks: s.repeatWeeks,
      dueOn: s.dueOn,
      eventOn: s.eventOn,
    }));
    try {
      // Settings first: an idempotent upsert, so a retry after a later
      // failure can't duplicate anything. Items then leave the suggestion list
      // as soon as they're added (they count as already covered).
      await state.saveSettings(settings);
      await Promise.all([
        state.addItems(newItems),
        optIn ? state.setRemindersOn(true) : Promise.resolve(),
      ]);
      hapticSuccess();
      onDone();
    } catch (err) {
      hapticError();
      setError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] setup'));
    } finally {
      setSaving(false);
    }
  };

  const onPickEvent = (event: DateTimePickerEvent, picked?: Date) => {
    const index = eventPicker;
    setEventPicker(null);
    if (event.type !== 'set' || !picked || index === null) return;
    setEvents(prev => prev.map((e, i) => (i === index ? { ...e, date: dateToYMD(picked) } : e)));
  };
  const onPickPatch = (event: DateTimePickerEvent, picked?: Date) => {
    setPatchPicker(false);
    if (event.type === 'set' && picked) setPatchDate(dateToYMD(picked));
  };

  const header = (title: string, right?: React.ReactNode) => (
    <View style={styles.header}>
      <TouchableOpacity
        style={[styles.circ, { backgroundColor: P.card, borderColor: P.border }]}
        onPress={() => { hapticLight(); if (step === 1) onClose(); else setStep((step - 1) as Step); }}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel={t('maintenance.back')}
      >
        <Ionicons name="chevron-back" size={18} color={P.accentText} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: P.text }]} numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );

  const steps = (
    <View style={styles.steps} accessibilityLabel={t('maintenance.setup.stepA11y', { step, total: 3 })}>
      {[1, 2, 3].map(n => <View key={n} style={[styles.stepBar, { backgroundColor: n <= step ? P.accentText : P.sep }]} />)}
    </View>
  );

  const question = (q: string, optional = true) => (
    <Text style={[styles.q, { color: P.text }]}>
      {q}{optional ? <Text style={[styles.opt, { color: P.sub }]}>{'  '}{t('maintenance.optional').toUpperCase()}</Text> : null}
    </Text>
  );

  const datePill = (label: string, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.datePill, { backgroundColor: P.surface, borderColor: P.border }]}
      onPress={() => { hapticLight(); onPress(); }}
      activeOpacity={0.5}
      accessibilityRole="button"
    >
      <Ionicons name="calendar-outline" size={15} color={P.accentText} />
      <Text style={[styles.dateText, { color: P.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <>
            {header(t('maintenance.setup.title'), (
              <TouchableOpacity onPress={() => { hapticLight(); setStep(3); }} activeOpacity={0.5} accessibilityRole="button">
                <Text style={[styles.link, { color: P.accentText }]}>{t('maintenance.setup.skip').toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            {steps}
            <Text style={[styles.h1, { color: P.text }]}>{t('maintenance.setup.s1.title')}</Text>
            <Text style={[ui.body, { color: P.sub, fontSize: 14 }]}>{t('maintenance.setup.s1.body')}</Text>
            <View style={[ui.card, styles.pad, { backgroundColor: P.card, borderColor: P.border }]}>
              <Text style={[ui.label, { color: P.sub, marginTop: 0 }]}>{t('maintenance.setup.s1.weUse').toUpperCase()}</Text>
              {profileAnswers.length > 0 ? (
                <View style={ui.chips}>
                  {profileAnswers.map(a => (
                    <View key={a} style={[ui.chip, { backgroundColor: P.accentDim, borderColor: P.accent }]}>
                      <Text style={[ui.chipText, { color: P.text }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[ui.body, { color: P.sub }]}>{t('maintenance.setup.s1.nothing')}</Text>
              )}
              <Text style={[ui.body, { color: P.sub, fontSize: 12 }]}>{t('maintenance.setup.s1.changeIn')}</Text>
            </View>
            <Note P={P} icon="notifications-outline" text={t('maintenance.firstRun.note')} />
            <PrimaryButton P={P} icon="chevron-forward" label={t('maintenance.setup.continue')} onPress={() => setStep(2)} />
            <GhostButton P={P} label={t('maintenance.setup.justSuggestions')} onPress={() => setStep(3)} />
          </>
        )}

        {step === 2 && (
          <>
            {header(t('maintenance.setup.s2.title'), (
              <TouchableOpacity onPress={() => { hapticLight(); setStep(3); }} activeOpacity={0.5} accessibilityRole="button">
                <Text style={[styles.link, { color: P.accentText }]}>{t('maintenance.setup.skipAll').toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            {steps}

            <View style={styles.field}>
              {question(t('maintenance.setup.q.style'))}
              <View style={ui.chips}>
                {STYLES.map(s => (
                  <Chip key={s} label={PROTECTIVE_STYLE_LABELS[s]} on={style === s} onPress={() => setStyle(style === s ? null : s)} P={P} />
                ))}
                <Chip label={t('maintenance.setup.q.styleNo')} on={style === null} onPress={() => setStyle(null)} P={P} />
              </View>
            </View>

            {style && style !== 'locs' && (
              <>
                <View style={styles.field}>
                  {question(t('maintenance.setup.q.wear'), false)}
                  <WeekStepper
                    value={wearWeeks} min={MAINTENANCE_MIN_WEEKS} max={MAINTENANCE_MAX_WEEKS} onChange={setWearWeeks} P={P}
                    unit={n => t(n === 1 ? 'maintenance.weeks.one' : 'maintenance.weeks.many', { count: n })}
                  />
                </View>
                <View style={styles.field}>
                  {question(t('maintenance.setup.q.weeksIn'))}
                  <View style={ui.chips}>
                    <Chip label={t('maintenance.setup.q.notInNow')} on={weeksIn === null} onPress={() => setWeeksIn(null)} P={P} />
                    <Chip label={t('maintenance.setup.q.inNow')} on={weeksIn !== null} onPress={() => setWeeksIn(weeksIn ?? 0)} P={P} />
                  </View>
                  {weeksIn !== null && (
                    <WeekStepper
                      value={weeksIn} min={0} max={wearWeeks} onChange={setWeeksIn} P={P}
                      unit={n => t(n === 1 ? 'maintenance.weeksIn.one' : 'maintenance.weeksIn.many', { count: n })}
                    />
                  )}
                </View>
              </>
            )}

            <View style={styles.field}>
              {question(t('maintenance.setup.q.events'))}
              {events.map((e, i) => (
                <View key={i} style={styles.eventRow}>
                  <TextInput
                    value={e.name}
                    onChangeText={name => setEvents(prev => prev.map((x, j) => (j === i ? { ...x, name } : x)))}
                    placeholder={t('maintenance.setup.q.eventName')}
                    placeholderTextColor={P.sub}
                    maxLength={60}
                    style={[ui.input, styles.eventName, { color: P.text, backgroundColor: P.surface, borderColor: P.border }]}
                    accessibilityLabel={t('maintenance.setup.q.eventName')}
                  />
                  {datePill(e.date ? formatShortDayDate(e.date) : t('maintenance.setup.q.eventDate'), () => setEventPicker(i))}
                  <TouchableOpacity
                    onPress={() => { hapticLight(); setEvents(prev => prev.filter((_, j) => j !== i)); }}
                    activeOpacity={0.5}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('maintenance.setup.q.removeEvent')}
                  >
                    <Ionicons name="close" size={18} color={P.sub} />
                  </TouchableOpacity>
                </View>
              ))}
              {eventPicker !== null && (
                <DateTimePicker
                  value={events[eventPicker]?.date ? toLocalDate(events[eventPicker]!.date!) : new Date()}
                  mode="date" display="default" minimumDate={new Date()} onChange={onPickEvent}
                />
              )}
              {events.length < MAX_EVENTS && (
                <GhostButton small P={P} icon="add" label={t('maintenance.setup.q.addEvent')} style={{ alignSelf: 'flex-start' }}
                  onPress={() => setEvents(prev => [...prev, { name: '', date: null }])} />
              )}
            </View>

            <View style={styles.field}>
              {question(t('maintenance.setup.q.patch'))}
              <View style={styles.patchRow}>
                {datePill(patchDate ? formatShortDayDate(patchDate) : t('maintenance.setup.q.patchAdd'), () => setPatchPicker(true))}
                {patchDate && (
                  <TouchableOpacity onPress={() => { hapticLight(); setPatchDate(null); }} activeOpacity={0.5} accessibilityRole="button">
                    <Text style={[styles.link, { color: P.accentText }]}>{t('maintenance.setup.q.patchClear').toUpperCase()}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {patchPicker && (
                <DateTimePicker value={patchDate ? toLocalDate(patchDate) : new Date()} mode="date" display="default" maximumDate={new Date()} onChange={onPickPatch} />
              )}
              <Text style={[ui.body, { color: P.sub, fontSize: 12 }]}>{t('maintenance.setup.q.patchHint')}</Text>
            </View>

            <PrimaryButton P={P} icon="chevron-forward" label={t('maintenance.setup.seeSuggestions')} onPress={() => setStep(3)} />
          </>
        )}

        {step === 3 && (
          <>
            {header(t('maintenance.setup.s3.title'))}
            {steps}
            <Text style={[ui.body, { color: P.sub }]}>{t('maintenance.setup.s3.body')}</Text>

            {suggestions.length === 0 && (
              <View style={[ui.card, styles.pad, { backgroundColor: P.card, borderColor: P.border }]}>
                <Text style={[ui.body, { color: P.sub }]}>{t('maintenance.setup.s3.none')}</Text>
              </View>
            )}
            {suggestions.map(s => {
              const on = !off.has(s.id);
              return (
                <View key={s.id} style={[ui.card, styles.sug, { backgroundColor: P.card, borderColor: P.border, opacity: on ? 1 : 0.6 }]}>
                  <View style={styles.sugTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sugTitle, { color: P.text }]}>{s.title}</Text>
                      <Text style={[ui.body, { color: P.sub }]}>
                        {s.kind === 'event' && s.eventOn
                          ? t('maintenance.setup.s3.bookBy', { date: formatShortDayDate(s.dueOn) })
                          : s.repeatWeeks
                            ? t(s.repeatWeeks === 1 ? 'maintenance.setup.s3.everyWeek' : 'maintenance.setup.s3.everyWeeks', { count: s.repeatWeeks })
                            : t('maintenance.setup.s3.onDate', { date: formatShortDayDate(s.dueOn) })}
                      </Text>
                    </View>
                    <Switch
                      value={on}
                      onValueChange={() => toggle(s)}
                      trackColor={{ false: '#D1D1D6', true: P.accent }}
                      thumbColor={on ? '#fff' : '#f4f3f4'}
                      accessibilityLabel={t('maintenance.setup.s3.includeA11y', { title: s.title })}
                    />
                  </View>
                  <View style={styles.because}>
                    <Ionicons name="information-circle-outline" size={13} color={P.sub} />
                    <Text style={[styles.becauseText, { color: P.sub }]}>{t('maintenance.setup.s3.fromAnswer', { answer: s.answer })}</Text>
                  </View>
                </View>
              );
            })}

            <View style={[ui.card, styles.pad, { backgroundColor: P.card, borderColor: P.border }]}>
              <View style={styles.sugTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sugTitle, { color: P.text }]}>{t('maintenance.setup.optIn.title')}</Text>
                  <Text style={[ui.body, { color: P.sub }]}>{t('maintenance.setup.optIn.sub')}</Text>
                </View>
                <Switch
                  value={optIn}
                  onValueChange={v => { hapticSelection(); setOptIn(v); }}
                  trackColor={{ false: '#D1D1D6', true: P.accent }}
                  thumbColor={optIn ? '#fff' : '#f4f3f4'}
                  accessibilityLabel={t('maintenance.setup.optIn.title')}
                />
              </View>
            </View>

            <Note P={P} icon="information-circle-outline" text={t('maintenance.disclaimer')} />
            {error && <Text style={[ui.inlineError, { color: S.bad }]}>{error}</Text>}
            <PrimaryButton
              P={P}
              disabled={saving}
              label={chosen.length > 0 ? t('maintenance.setup.add', { count: chosen.length }) : t('maintenance.setup.finish')}
              onPress={finish}
            />
          </>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1, flexShrink: 1 },
  link: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.2 },
  steps: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 4 },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 28, letterSpacing: 1, lineHeight: 32 },
  pad: { padding: 14, gap: 10 },
  field: { gap: 8 },
  q: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700' },
  opt: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.2 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventName: { flex: 1 },
  patchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  dateText: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  sug: { padding: 14, gap: 8 },
  sugTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sugTitle: { fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 0.7 },
  because: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  becauseText: { flex: 1, fontFamily: FONT_BODY, fontSize: 12, lineHeight: 16 },
});
