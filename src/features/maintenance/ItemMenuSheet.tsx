// src/features/maintenance/ItemMenuSheet.tsx
//
// The "⋯" menu for one item: change the interval (or the date, for a one-off)
// and the private note, mark it done, pause it, or delete it. Delete is a hard delete and asks
// inline first — a dialog can't layer over this Modal.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import { MAINTENANCE_MAX_WEEKS, MAINTENANCE_MIN_WEEKS } from '../../constants/maintenanceServiceTypes';
import type { MaintenanceItem } from '../../types/maintenance';
import type { MaintenanceItemPatch } from '../../services/databaseService';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { dateToYMD, formatShortDayDate, toLocalDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import {
  FONT_BODY, GhostButton, PrimaryButton, SectionLabel, Sheet, SwitchRow, WeekStepper,
  type SemanticColors, ui, hapticError, hapticSuccess, hapticLight,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

interface Props {
  item: MaintenanceItem | null;
  P: AppTheme;
  S: SemanticColors;
  t: T;
  onClose: () => void;
  onUpdate: (id: string, patch: MaintenanceItemPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function addWeeksYMD(fromYMD: string, weeks: number): string {
  const d = toLocalDate(fromYMD);
  d.setDate(d.getDate() + weeks * 7);
  return dateToYMD(d);
}

export function ItemMenuSheet({ item, P, S, t, onClose, onUpdate, onDelete }: Props) {
  const [weeks, setWeeks] = useState(4);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed every time a different item opens (memory: state in these
  // sheets is seeded on open — stale values are where bugs come from).
  useEffect(() => {
    if (!item) return;
    setWeeks(item.repeatWeeks ?? 4);
    setDueOn(item.dueOn);
    setNote(item.note ?? '');
    setShowPicker(false);
    setConfirmDelete(false);
    setBusy(false);
    setError(null);
  }, [item]);

  if (!item) return <Sheet visible={false} onClose={onClose} P={P}>{null}</Sheet>;

  const repeating = item.repeatWeeks !== null;
  const today = dateToYMD(new Date());

  const run = async (work: () => Promise<void>, fallback: string, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      hapticSuccess();
      if (close) onClose();
    } catch (err) {
      hapticError();
      setError(toUserMessage(err, fallback, '[Maintenance] item menu'));
    } finally {
      setBusy(false);
    }
  };

  const intervalChanged = repeating && weeks !== item.repeatWeeks;
  const dateChanged = !repeating && dueOn !== null && dueOn !== item.dueOn;
  const noteChanged = note.trim() !== (item.note ?? '');

  const saveChanges = () => run(async () => {
    if (noteChanged && !intervalChanged && !dateChanged) {
      await onUpdate(item.id, { note });
    } else if (repeating) {
      // Due date moves with the interval, from the last time it was done.
      const base = item.lastDoneOn ?? today;
      await onUpdate(item.id, {
        repeatWeeks: weeks, intervalEdited: true, dueOn: addWeeksYMD(base, weeks),
        ...(noteChanged ? { note } : {}),
      });
    } else if (dueOn) {
      await onUpdate(item.id, { dueOn, ...(noteChanged ? { note } : {}) });
    }
  }, t('maintenance.error.save'));

  const markDone = () => run(async () => {
    if (repeating) {
      await onUpdate(item.id, { lastDoneOn: today, dueOn: addWeeksYMD(today, item.repeatWeeks!) });
    } else {
      // A one-off that's done has nothing left to remind about.
      await onDelete(item.id);
    }
  }, t('maintenance.error.save'));

  const onPickDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowPicker(false);
    if (event.type !== 'set' || !date) return;
    setDueOn(dateToYMD(date));
  };

  const origin =
    item.origin === 'booking'
      ? t('maintenance.menu.fromBooking', { date: item.lastDoneOn ? formatShortDayDate(item.lastDoneOn) : '—' })
      : t('maintenance.menu.mine');

  return (
    <Sheet visible onClose={onClose} P={P}>
      <View>
        <Text style={[ui.sheetTitle, { color: P.text }]}>{item.title}</Text>
        <Text style={[ui.body, { color: P.sub, marginTop: 4 }]}>{origin}</Text>
      </View>

      {item.kind !== 'event' && (
        repeating ? (
          <View style={styles.field}>
            <SectionLabel text={t('maintenance.menu.repeatEvery').toUpperCase()} P={P} />
            <WeekStepper
              value={weeks}
              min={MAINTENANCE_MIN_WEEKS}
              max={MAINTENANCE_MAX_WEEKS}
              onChange={setWeeks}
              P={P}
              unit={n => t(n === 1 ? 'maintenance.weeks.one' : 'maintenance.weeks.many', { count: n })}
            />
          </View>
        ) : (
          <View style={styles.field}>
            <SectionLabel text={t('maintenance.menu.date').toUpperCase()} P={P} />
            <TouchableOpacity
              style={[styles.datePill, { backgroundColor: P.surface, borderColor: P.border }]}
              onPress={() => { hapticLight(); setShowPicker(true); }}
              activeOpacity={0.5}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={15} color={P.accentText} />
              <Text style={[styles.dateText, { color: P.text }]}>{dueOn ? formatShortDayDate(dueOn) : '—'}</Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={dueOn ? toLocalDate(dueOn) : new Date()}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={onPickDate}
              />
            )}
          </View>
        )
      )}

      <View style={styles.field}>
        <Text style={[ui.label, { color: P.sub }]}>{t('maintenance.add.note').toUpperCase()}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
          placeholder={t('maintenance.add.notePlaceholder')}
          placeholderTextColor={P.sub}
          style={[ui.input, styles.note, { color: P.text, backgroundColor: P.surface, borderColor: P.border }]}
          accessibilityLabel={t('maintenance.add.note')}
        />
      </View>

      {(intervalChanged || dateChanged || noteChanged) && (
        <PrimaryButton P={P} label={t('maintenance.menu.save')} disabled={busy} onPress={saveChanges} />
      )}

      {item.kind !== 'event' && (
        <GhostButton P={P} icon="checkmark" label={t('maintenance.menu.done')} disabled={busy} onPress={markDone} />
      )}

      <View style={[styles.hr, { backgroundColor: P.sep }]} />

      <SwitchRow
        P={P}
        title={t('maintenance.menu.pause')}
        sub={t('maintenance.menu.pauseSub')}
        value={item.paused}
        disabled={busy}
        onChange={v => run(() => onUpdate(item.id, { paused: v }), t('maintenance.error.save'), false)}
      />

      {!confirmDelete ? (
        <GhostButton P={P} icon="trash-outline" label={t('maintenance.menu.delete')} colour={S.bad} disabled={busy} onPress={() => setConfirmDelete(true)} />
      ) : (
        <View style={[styles.confirm, { borderColor: S.bad, backgroundColor: S.badDim }]}>
          <Text style={[ui.body, { color: P.text }]}>
            {item.origin === 'booking' ? t('maintenance.menu.deleteConfirmBooking') : t('maintenance.menu.deleteConfirm')}
          </Text>
          <View style={styles.confirmRow}>
            <GhostButton small P={P} label={t('maintenance.menu.deleteYes')} colour={S.bad} disabled={busy} style={{ flex: 1 }}
              onPress={() => run(() => onDelete(item.id), t('maintenance.error.delete'))} />
            <GhostButton small P={P} label={t('maintenance.menu.keep')} disabled={busy} style={{ flex: 1 }} onPress={() => setConfirmDelete(false)} />
          </View>
        </View>
      )}

      {error && <Text style={[ui.inlineError, { color: S.bad }]}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  dateText: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  hr: { height: 1 },
  note: { minHeight: 56, textAlignVertical: 'top' },
  confirm: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  confirmRow: { flexDirection: 'row', gap: 8 },
});
