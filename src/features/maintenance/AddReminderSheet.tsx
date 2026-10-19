// src/features/maintenance/AddReminderSheet.tsx
//
// "Add your own": a name (typed, or a quick pick that also sets the type and a
// starting interval), a type (which only decides the icon and which Search tab
// "Find a provider" opens), when (repeats from the last visit, before an
// event, or just once), an optional link to a provider the client has booked
// before, and a private note to self. The dates come from
// scheduleNewReminder() so they match what setup would have made.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import {
  getMaintenanceServiceType,
  MAINTENANCE_MAX_WEEKS, MAINTENANCE_MIN_WEEKS, type MaintenanceTypeKey,
} from '../../constants/maintenanceServiceTypes';
import type { MaintenancePastProvider, NewMaintenanceItem } from '../../types/maintenance';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { dateToYMD, formatShortDayDate, toLocalDate } from '../../utils/dateUtils';
import { scheduleNewReminder, type ReminderTiming } from '../../utils/maintenanceSuggestions';
import { toUserMessage } from '../../utils/userFacingError';
import {
  Chip, FONT_BODY, FONT_DISPLAY, PrimaryButton, SectionLabel, Sheet, WeekStepper,
  type SemanticColors, ui, hapticError, hapticLight, hapticSuccess,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;
type Mode = ReminderTiming['mode'];
type PickerTarget = 'lastDone' | 'date';

const TYPE_OPTIONS: { key: MaintenanceTypeKey | null; label: TranslationKey }[] = [
  { key: 'hair_general', label: 'maintenance.add.type.hair' },
  { key: 'lashes_general', label: 'maintenance.add.type.lashes' },
  { key: 'nails_general', label: 'maintenance.add.type.nails' },
  { key: 'facial', label: 'maintenance.add.type.skin' },
  { key: 'brows_general', label: 'maintenance.add.type.brows' },
  { key: null, label: 'maintenance.add.type.other' },
];

/** Common things people keep up with that the profile can't suggest. A pick
 *  fills the name, sets the type and starts the interval at that type's
 *  neutral default; the client can change all three. */
const QUICK_PICKS: { label: TranslationKey; key: MaintenanceTypeKey | null }[] = [
  { label: 'maintenance.add.pick.waxing', key: 'waxing' },
  { label: 'maintenance.add.pick.brazilian', key: 'waxing' },
  { label: 'maintenance.add.pick.browLamination', key: 'brow_lamination' },
  { label: 'maintenance.add.pick.browTint', key: 'brow_tint' },
  { label: 'maintenance.add.pick.threading', key: 'brows_general' },
  { label: 'maintenance.add.pick.lashLift', key: 'lash_lift' },
  { label: 'maintenance.add.pick.pedicure', key: 'pedicure' },
  { label: 'maintenance.add.pick.wigInstall', key: 'hair_general' },
  { label: 'maintenance.add.pick.blowDry', key: 'hair_general' },
  { label: 'maintenance.add.pick.barberCut', key: 'trim' },
  { label: 'maintenance.add.pick.sprayTan', key: null },
  { label: 'maintenance.add.pick.massage', key: null },
];

const MODES: { mode: Mode; label: TranslationKey }[] = [
  { mode: 'repeats', label: 'maintenance.add.repeats' },
  { mode: 'event', label: 'maintenance.add.beforeEvent' },
  { mode: 'once', label: 'maintenance.add.justOnce' },
];

/** Shown when nothing has set an interval yet. */
const DEFAULT_REPEAT_WEEKS = 4;
const MAX_PROVIDER_CHIPS = 8;
const NOTE_MAX = 200;

interface Props {
  visible: boolean;
  pastProviders: MaintenancePastProvider[];
  P: AppTheme;
  S: SemanticColors;
  t: T;
  onClose: () => void;
  onAdd: (item: NewMaintenanceItem) => Promise<void>;
}

function addWeeksFromToday(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return dateToYMD(d);
}

/** The type chip a key belongs to: same Search category, or Other. */
function chipFor(key: MaintenanceTypeKey | null): MaintenanceTypeKey | null {
  const category = getMaintenanceServiceType(key)?.searchCategory;
  return TYPE_OPTIONS.find(o => o.key && getMaintenanceServiceType(o.key)?.searchCategory === category)?.key ?? null;
}

export function AddReminderSheet({ visible, pastProviders, P, S, t, onClose, onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [typeKey, setTypeKey] = useState<MaintenanceTypeKey | null>('hair_general');
  const [mode, setMode] = useState<Mode>('repeats');
  const [weeks, setWeeks] = useState(DEFAULT_REPEAT_WEEKS);
  const [lastDone, setLastDone] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => addWeeksFromToday(1));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [provider, setProvider] = useState<MaintenancePastProvider | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setTypeKey('hair_general'); setMode('repeats'); setWeeks(DEFAULT_REPEAT_WEEKS);
    setLastDone(null); setDate(addWeeksFromToday(1)); setPicker(null); setProvider(null);
    setNote(''); setBusy(false); setError(null);
  }, [visible]);

  const trimmed = title.trim();
  const timing: ReminderTiming = mode === 'repeats'
    ? { mode, weeks, lastDoneOn: lastDone }
    : mode === 'event' ? { mode, eventOn: date } : { mode, date };
  const scheduled = scheduleNewReminder(timing, new Date());

  const pick = (label: TranslationKey, key: MaintenanceTypeKey | null) => {
    setTitle(t(label));
    setTypeKey(key);
    const type = getMaintenanceServiceType(key);
    if (type) setWeeks(type.defaultWeeks);
  };

  const submit = async () => {
    if (!trimmed) {
      setError(t(mode === 'event' ? 'maintenance.add.eventNameRequired' : 'maintenance.add.nameRequired'));
      hapticError();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        ...scheduled,
        title: trimmed.slice(0, 80),
        // An event is a date, not a service: no type, no Search tab.
        typeKey: mode === 'event' ? null : typeKey,
        providerId: provider?.providerId ?? null,
        serviceId: null,
        providerName: provider?.name ?? null,
        note: note.trim() || null,
      });
      hapticSuccess();
      onClose();
    } catch (err) {
      hapticError();
      setError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] add reminder'));
    } finally {
      setBusy(false);
    }
  };

  const onPickDate = (event: DateTimePickerEvent, picked?: Date) => {
    const target = picker;
    setPicker(null);
    if (event.type !== 'set' || !picked) return;
    if (target === 'lastDone') setLastDone(dateToYMD(picked));
    else setDate(dateToYMD(picked));
  };

  const datePill = (label: string, target: PickerTarget) => (
    <TouchableOpacity
      style={[styles.datePill, { backgroundColor: P.surface, borderColor: P.border }]}
      onPress={() => { hapticLight(); setPicker(target); }}
      activeOpacity={0.5}
      accessibilityRole="button"
    >
      <Ionicons name="calendar-outline" size={15} color={P.accentText} />
      <Text style={[styles.dateText, { color: P.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <Sheet visible={visible} onClose={onClose} P={P}>
      <Text style={[ui.sheetTitle, { color: P.text }]}>{t('maintenance.add.title')}</Text>

      <View style={styles.field}>
        <SectionLabel text={t(mode === 'event' ? 'maintenance.add.eventName' : 'maintenance.add.whatFor').toUpperCase()} P={P} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={t(mode === 'event' ? 'maintenance.add.eventPlaceholder' : 'maintenance.add.namePlaceholder')}
          placeholderTextColor={P.sub}
          style={[ui.input, { color: P.text, backgroundColor: P.surface, borderColor: P.border }]}
          accessibilityLabel={t(mode === 'event' ? 'maintenance.add.eventName' : 'maintenance.add.whatFor')}
          returnKeyType="done"
        />
        {mode !== 'event' && (
          <View style={ui.chips}>
            {QUICK_PICKS.map(q => (
              <Chip key={q.label} label={t(q.label)} on={trimmed === t(q.label)} onPress={() => pick(q.label, q.key)} P={P} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.field}>
        <SectionLabel text={t('maintenance.add.when').toUpperCase()} P={P} />
        <View style={[styles.seg, { backgroundColor: P.surface, borderColor: P.border }]}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.mode}
              style={[styles.segBtn, mode === m.mode && { backgroundColor: P.card }]}
              onPress={() => { hapticLight(); setMode(m.mode); setPicker(null); }}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m.mode }}
            >
              <Text style={[styles.segText, { color: mode === m.mode ? P.text : P.sub }]}>{t(m.label).toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'repeats' ? (
          <>
            <WeekStepper
              value={weeks} min={MAINTENANCE_MIN_WEEKS} max={MAINTENANCE_MAX_WEEKS} onChange={setWeeks} P={P}
              unit={n => t(n === 1 ? 'maintenance.weeks.one' : 'maintenance.weeks.many', { count: n })}
            />
            <Text style={[ui.label, { color: P.sub }]}>{t('maintenance.add.lastDone').toUpperCase()}</Text>
            {datePill(lastDone ? formatShortDayDate(lastDone) : t('maintenance.add.lastDoneUnknown'), 'lastDone')}
          </>
        ) : (
          datePill(formatShortDayDate(date), 'date')
        )}
        {picker && (
          <DateTimePicker
            value={toLocalDate(picker === 'lastDone' ? (lastDone ?? dateToYMD(new Date())) : date)}
            mode="date"
            display="default"
            {...(picker === 'lastDone' ? { maximumDate: new Date() } : { minimumDate: mode === 'event' ? tomorrow : new Date() })}
            onChange={onPickDate}
          />
        )}
        <Text style={[ui.body, { color: P.sub, fontSize: 12 }]}>
          {t(mode === 'event' ? 'maintenance.add.bookBy' : 'maintenance.add.nextOn', { date: formatShortDayDate(scheduled.dueOn) })}
        </Text>
      </View>

      {mode !== 'event' && (
        <View style={styles.field}>
          <SectionLabel text={t('maintenance.add.type').toUpperCase()} P={P} />
          <View style={ui.chips}>
            {TYPE_OPTIONS.map(o => (
              <Chip key={o.key ?? 'other'} label={t(o.label)} on={chipFor(typeKey) === o.key} onPress={() => setTypeKey(o.key)} P={P} />
            ))}
          </View>
        </View>
      )}

      {mode !== 'event' && pastProviders.length > 0 && (
        <View style={styles.field}>
          <Text style={[ui.label, { color: P.sub }]}>
            {t('maintenance.add.provider').toUpperCase()}  <Text style={styles.optional}>{t('maintenance.optional').toUpperCase()}</Text>
          </Text>
          <View style={ui.chips}>
            {pastProviders.slice(0, MAX_PROVIDER_CHIPS).map(p => (
              <Chip key={p.providerId} label={p.name} on={provider?.providerId === p.providerId} onPress={() => setProvider(p)} P={P} />
            ))}
            <Chip label={t('maintenance.add.none')} on={provider === null} onPress={() => setProvider(null)} P={P} />
          </View>
          <Text style={[ui.body, { color: P.sub, fontSize: 12 }]}>{t('maintenance.add.providerHint')}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={[ui.label, { color: P.sub }]}>
          {t('maintenance.add.note').toUpperCase()}  <Text style={styles.optional}>{t('maintenance.add.noteOnlyYou').toUpperCase()}</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
          placeholder={t('maintenance.add.notePlaceholder')}
          placeholderTextColor={P.sub}
          style={[ui.input, styles.note, { color: P.text, backgroundColor: P.surface, borderColor: P.border }]}
          accessibilityLabel={t('maintenance.add.note')}
        />
      </View>

      {error && <Text style={[ui.inlineError, { color: S.bad }]}>{error}</Text>}
      <PrimaryButton P={P} label={t('maintenance.add.submit')} disabled={busy} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  optional: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.2 },
  seg: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4 },
  segBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  segText: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  dateText: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  note: { minHeight: 64, textAlignVertical: 'top' },
});
