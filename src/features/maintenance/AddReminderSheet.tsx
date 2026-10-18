// src/features/maintenance/AddReminderSheet.tsx
//
// "Add my own reminder": a name, a type (which only decides the icon and which
// Search tab "Find a provider" opens), repeating or a single date, and an
// optional link to a provider the client has booked before.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import {
  MAINTENANCE_MAX_WEEKS, MAINTENANCE_MIN_WEEKS, type MaintenanceTypeKey,
} from '../../constants/maintenanceServiceTypes';
import type { MaintenancePastProvider, NewMaintenanceItem } from '../../types/maintenance';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { dateToYMD, formatShortDayDate, toLocalDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import {
  Chip, FONT_BODY, FONT_DISPLAY, PrimaryButton, SectionLabel, Sheet, WeekStepper,
  type SemanticColors, ui, hapticError, hapticLight, hapticSuccess,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

const TYPE_OPTIONS: { key: MaintenanceTypeKey | null; label: TranslationKey }[] = [
  { key: 'hair_general', label: 'maintenance.add.type.hair' },
  { key: 'lashes_general', label: 'maintenance.add.type.lashes' },
  { key: 'nails_general', label: 'maintenance.add.type.nails' },
  { key: 'facial', label: 'maintenance.add.type.skin' },
  { key: 'brows_general', label: 'maintenance.add.type.brows' },
  { key: null, label: 'maintenance.add.type.other' },
];

/** Shown when the client picks no provider. */
const DEFAULT_REPEAT_WEEKS = 4;
const MAX_PROVIDER_CHIPS = 8;

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

export function AddReminderSheet({ visible, pastProviders, P, S, t, onClose, onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [typeKey, setTypeKey] = useState<MaintenanceTypeKey | null>('hair_general');
  const [repeats, setRepeats] = useState(true);
  const [weeks, setWeeks] = useState(DEFAULT_REPEAT_WEEKS);
  const [date, setDate] = useState<string>(() => addWeeksFromToday(1));
  const [showPicker, setShowPicker] = useState(false);
  const [provider, setProvider] = useState<MaintenancePastProvider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setTypeKey('hair_general'); setRepeats(true); setWeeks(DEFAULT_REPEAT_WEEKS);
    setDate(addWeeksFromToday(1)); setShowPicker(false); setProvider(null); setBusy(false); setError(null);
  }, [visible]);

  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed) { setError(t('maintenance.add.nameRequired')); hapticError(); return; }
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        kind: 'service',
        title: trimmed.slice(0, 80),
        typeKey,
        providerId: provider?.providerId ?? null,
        serviceId: null,
        providerName: provider?.name ?? null,
        repeatWeeks: repeats ? weeks : null,
        dueOn: repeats ? addWeeksFromToday(weeks) : date,
        eventOn: null,
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
    setShowPicker(false);
    if (event.type === 'set' && picked) setDate(dateToYMD(picked));
  };

  return (
    <Sheet visible={visible} onClose={onClose} P={P}>
      <Text style={[ui.sheetTitle, { color: P.text }]}>{t('maintenance.add.title')}</Text>

      <View style={styles.field}>
        <SectionLabel text={t('maintenance.add.whatFor').toUpperCase()} P={P} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={t('maintenance.add.namePlaceholder')}
          placeholderTextColor={P.sub}
          style={[ui.input, { color: P.text, backgroundColor: P.surface, borderColor: P.border }]}
          accessibilityLabel={t('maintenance.add.whatFor')}
          returnKeyType="done"
        />
      </View>

      <View style={styles.field}>
        <SectionLabel text={t('maintenance.add.type').toUpperCase()} P={P} />
        <View style={ui.chips}>
          {TYPE_OPTIONS.map(o => (
            <Chip key={o.key ?? 'other'} label={t(o.label)} on={typeKey === o.key} onPress={() => setTypeKey(o.key)} P={P} />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <SectionLabel text={t('maintenance.add.when').toUpperCase()} P={P} />
        <View style={[styles.seg, { backgroundColor: P.surface, borderColor: P.border }]}>
          {([true, false] as const).map(r => (
            <TouchableOpacity
              key={String(r)}
              style={[styles.segBtn, repeats === r && { backgroundColor: P.card }]}
              onPress={() => { hapticLight(); setRepeats(r); }}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityState={{ selected: repeats === r }}
            >
              <Text style={[styles.segText, { color: repeats === r ? P.text : P.sub }]}>
                {(r ? t('maintenance.add.repeats') : t('maintenance.add.oneDate')).toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {repeats ? (
          <WeekStepper
            value={weeks} min={MAINTENANCE_MIN_WEEKS} max={MAINTENANCE_MAX_WEEKS} onChange={setWeeks} P={P}
            unit={n => t(n === 1 ? 'maintenance.weeks.one' : 'maintenance.weeks.many', { count: n })}
          />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.datePill, { backgroundColor: P.surface, borderColor: P.border }]}
              onPress={() => { hapticLight(); setShowPicker(true); }}
              activeOpacity={0.5}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={15} color={P.accentText} />
              <Text style={[styles.dateText, { color: P.text }]}>{formatShortDayDate(date)}</Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker value={toLocalDate(date)} mode="date" display="default" minimumDate={new Date()} onChange={onPickDate} />
            )}
          </>
        )}
      </View>

      {pastProviders.length > 0 && (
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
  segText: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1.1 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  dateText: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
});
