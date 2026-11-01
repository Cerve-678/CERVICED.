// src/features/maintenance/MaintenanceView.tsx
//
// The full Maintenance screen inside Beauty Profile (screen state, not a
// route — see BeautyProfileScreen). Items are grouped by what the client
// should do, not by type. Provider-written prep and aftercare are quoted in
// full and credited, never paraphrased, and nothing is shown when the provider
// wrote nothing. The patch-test card shows only the client's own recorded
// date: no countdown, no verdict.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { MaintenanceBookingNote, MaintenanceItem } from '../../types/maintenance';
import { dateToYMD, formatShortDate, formatShortDayDate, formatTime12Safe, toLocalDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import type { MaintenanceSearchCategory } from '../../constants/maintenanceServiceTypes';
import {
  categoryOf, groupMaintenanceItems, rhythmLineFor, snoozedDueOn, type PresentedItem, type RhythmLine,
} from './presentation';
import { itemPill, MaintenanceItemCard, primaryActionFor, type ItemAction } from './MaintenanceItemCard';
import { ItemMenuSheet } from './ItemMenuSheet';
import { AddReminderSheet } from './AddReminderSheet';
import type { MaintenanceState } from './useMaintenance';
import {
  Chip, FONT_BODY, FONT_DISPLAY, GhostButton, Note, Pill, PrimaryButton, SectionLabel,
  semanticColors, ui, hapticError, hapticLight,
} from './ui';
import type { TranslationKey } from '../../i18n';

type Filter = 'ALL' | MaintenanceSearchCategory | 'OTHER';

/** Chip order and labels. "Other" holds events and untyped reminders. */
const FILTERS: { key: Filter; label: TranslationKey }[] = [
  { key: 'ALL', label: 'maintenance.filter.all' },
  { key: 'HAIR', label: 'maintenance.add.type.hair' },
  { key: 'NAILS', label: 'maintenance.add.type.nails' },
  { key: 'LASHES', label: 'maintenance.add.type.lashes' },
  { key: 'BROWS', label: 'maintenance.add.type.brows' },
  { key: 'AESTHETICS', label: 'maintenance.add.type.skin' },
  { key: 'OTHER', label: 'maintenance.add.type.other' },
];

const filterOf = (item: MaintenanceItem): Filter => categoryOf(item) ?? 'OTHER';

/** 3.5 → "3½": learned gaps are read to the half week. */
function weeksText(weeks: number): string {
  return Number.isInteger(weeks) ? String(weeks) : `${Math.floor(weeks)}½`;
}

interface Props {
  state: MaintenanceState;
  focusItemId?: string | undefined;
  /** Item id currently resolving a rebook, so its button can show busy. */
  busyItemId: string | null;
  onBack: () => void;
  onItemAction: (item: MaintenanceItem, action: ItemAction) => void;
  onOpenSetup: () => void;
  /** Profile-based suggestions not yet added; shown once setup is done. */
  pickedCount: number;
  onOpenPicked: () => void;
  onMessageProviders: () => void;
  onViewBooking: (bookingId: string) => void;
}

export function MaintenanceView({
  state, focusItemId, busyItemId, onBack, onItemAction, onOpenSetup, pickedCount, onOpenPicked,
  onMessageProviders, onViewBooking,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => semanticColors(isDarkMode), [isDarkMode]);
  const [menuItem, setMenuItem] = useState<MaintenanceItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [patchPicker, setPatchPicker] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const today = dateToYMD(new Date());
  // Events are removed server-side the day after; hide them here meanwhile.
  const visibleItems = useMemo(
    () => state.items.filter(i => i.kind !== 'event' || (i.eventOn ?? today) >= today),
    [state.items, today],
  );
  // "Next up" looks across everything; the chips only narrow the list below.
  const nextUp = useMemo(() => {
    const all = groupMaintenanceItems(visibleItems, today, state.coverage);
    return all.next ?? all.comingUp[0] ?? null;
  }, [visibleItems, today, state.coverage]);
  const filterCounts = useMemo(() => {
    const counts = new Map<Filter, number>([['ALL', visibleItems.length]]);
    for (const i of visibleItems) counts.set(filterOf(i), (counts.get(filterOf(i)) ?? 0) + 1);
    return counts;
  }, [visibleItems]);
  // A filter whose last item went away falls back to All.
  const activeFilter: Filter = filterCounts.has(filter) ? filter : 'ALL';
  const groups = useMemo(
    () => groupMaintenanceItems(
      activeFilter === 'ALL' ? visibleItems : visibleItems.filter(i => filterOf(i) === activeFilter),
      today,
      state.coverage,
    ),
    [visibleItems, activeFilter, today, state.coverage],
  );

  // Landing from a push / notification: scroll to the item and outline it.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef(new Map<string, number>());
  const scrolledFor = useRef<string | null>(null);
  const tryScroll = useCallback(() => {
    if (!focusItemId || scrolledFor.current === focusItemId) return;
    const y = offsets.current.get(focusItemId);
    if (y === undefined) return;
    scrolledFor.current = focusItemId;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  }, [focusItemId]);
  useEffect(() => { tryScroll(); }, [tryScroll, state.items]);

  const openMenu = useCallback((item: MaintenanceItem) => setMenuItem(item), []);

  const renderItems = (list: PresentedItem[]) =>
    list.map(({ item, view }) => (
      <View
        key={item.id}
        onLayout={e => { offsets.current.set(item.id, e.nativeEvent.layout.y); if (item.id === focusItemId) tryScroll(); }}
      >
        <MaintenanceItemCard
          item={item}
          view={view}
          P={P}
          S={S}
          t={t}
          highlighted={item.id === focusItemId}
          busy={busyItemId === item.id}
          onAction={onItemAction}
          onMenu={openMenu}
        />
      </View>
    ));

  const renderNote = (note: MaintenanceBookingNote, kind: 'prep' | 'aftercare') => (
    <View key={`${kind}:${note.bookingId}`} style={[ui.card, styles.ctx, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.when}>
        <Ionicons name={kind === 'prep' ? 'calendar-outline' : 'checkmark'} size={13} color={P.sub} />
        <Text style={[styles.whenText, { color: P.sub }]}>
          {(kind === 'prep'
            ? t('maintenance.ctx.prepWhen', {
                date: formatShortDayDate(note.bookingDate),
                time: formatTime12Safe(note.bookingTime) ?? '',
              })
            : t('maintenance.ctx.aftercareWhen', { date: formatShortDayDate(note.bookingDate) })
          ).toUpperCase()}
        </Text>
      </View>
      <Text style={[styles.ctxTitle, { color: P.text }]}>
        {t('maintenance.ctx.serviceWith', { service: note.serviceName, provider: note.providerName })}
      </Text>
      {note.notes.map((n, i) => (
        <View key={i} style={[styles.quote, { borderLeftColor: P.accentText, backgroundColor: P.surface }]}>
          <Text style={[styles.quoteFrom, { color: P.sub }]}>
            {t('maintenance.ctx.from', { provider: note.providerName })}{n.title ? ` ${n.title}` : ''}
          </Text>
          {/* Full text: not truncated, not paraphrased. */}
          <Text style={[styles.quoteText, { color: P.text }]} selectable>{n.text}</Text>
          <Text style={[styles.quoteMeta, { color: P.sub }]}>
            {n.sentAt
              ? t('maintenance.ctx.sent', { date: formatShortDate(n.sentAt) })
              : t('maintenance.ctx.currentNote')}
          </Text>
        </View>
      ))}
      <View style={styles.ctxFoot}>
        <GhostButton small P={P} label={t('maintenance.ctx.viewBooking')} onPress={() => onViewBooking(note.bookingId)} />
      </View>
    </View>
  );

  const patchDate = state.settings?.lastPatchTestOn ?? null;
  const onPickPatch = (event: DateTimePickerEvent, picked?: Date) => {
    setPatchPicker(false);
    if (event.type !== 'set' || !picked || !state.settings) return;
    const next = { ...state.settings, lastPatchTestOn: dateToYMD(picked) };
    state.saveSettings(next).catch(err => {
      hapticError();
      setBannerError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] patch date'));
    });
  };

  const turnOnReminders = () => {
    setBannerError(null);
    state.setRemindersOn(true).catch(err => {
      hapticError();
      setBannerError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] reminders opt-in'));
    });
  };

  const snooze = (item: MaintenanceItem) => {
    setBannerError(null);
    state.updateItem(item.id, { dueOn: snoozedDueOn(item, today) }).catch(err => {
      hapticError();
      setBannerError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] snooze'));
    });
  };

  const rhythmText = (line: RhythmLine): string | null => {
    if (!line) return null;
    const weeks = weeksText(line.weeks);
    switch (line.kind) {
      case 'learned': return t('maintenance.rhythm.learned', { from: line.from, weeks });
      case 'provider': return t('maintenance.rhythm.provider', { provider: line.provider, weeks });
      case 'client': return t('maintenance.rhythm.client', { weeks });
    }
  };

  const renderNextUp = ({ item, view }: PresentedItem) => {
    const pill = itemPill(item, view, t);
    const action = primaryActionFor(item, view);
    const rhythm = rhythmText(rhythmLineFor(item));
    const canSnooze = item.kind !== 'event' && view.state !== 'booked' && view.state !== 'paused';
    return (
      <View style={[styles.next, { backgroundColor: P.accent }]}>
        <View style={styles.nextTop}>
          <Text style={[styles.nextEyebrow, { color: P.onAccent }]}>{t('maintenance.next.title').toUpperCase()}</Text>
          <Pill text={pill.text} tone={pill.tone} P={P} S={S} />
        </View>
        <Text style={[styles.nextTitle, { color: P.onAccent }]} numberOfLines={2}>{item.title}</Text>
        {rhythm && (
          <View style={styles.nextRhythm}>
            <Ionicons name="repeat" size={15} color={P.onAccent} />
            <Text style={[styles.nextRhythmText, { color: P.onAccent }]}>{rhythm}</Text>
          </View>
        )}
        {(action || canSnooze) && (
          <View style={styles.nextFoot}>
            {action && (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: P.onAccent }]}
                onPress={() => { hapticLight(); onItemAction(item, action); }}
                disabled={busyItemId === item.id}
                activeOpacity={0.75}
                accessibilityRole="button"
              >
                <Text style={[styles.nextBtnText, { color: P.accent }]}>
                  {t(action === 'rebook' ? 'maintenance.action.rebook' : action === 'find' ? 'maintenance.action.find' : 'maintenance.action.resume').toUpperCase()}
                </Text>
              </TouchableOpacity>
            )}
            {canSnooze && (
              <TouchableOpacity
                style={[styles.nextBtn, styles.nextGhost, { borderColor: P.onAccent }]}
                onPress={() => { hapticLight(); snooze(item); }}
                activeOpacity={0.6}
                accessibilityRole="button"
              >
                <Text style={[styles.nextBtnText, { color: P.onAccent }]}>{t('maintenance.action.snooze').toUpperCase()}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const isEmpty = visibleItems.length === 0 && state.context.prep.length === 0 && state.context.aftercare.length === 0 && !patchDate;

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.circ, { backgroundColor: P.card, borderColor: P.border }]}
            onPress={() => { hapticLight(); onBack(); }}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('maintenance.back')}
          >
            <Ionicons name="chevron-back" size={18} color={P.accentText} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.text }]}>{t('maintenance.title')}</Text>
          <View style={{ flex: 1 }} />
          <GhostButton small P={P} icon="add" label={t('maintenance.addMine')} onPress={() => setAdding(true)} />
        </View>

        {state.loading && state.items.length === 0 ? (
          <ActivityIndicator color={P.accent} style={{ marginTop: 40 }} />
        ) : state.error ? (
          <View style={styles.errorBlock}>
            <Text style={[ui.body, { color: P.text, textAlign: 'center' }]}>{t('maintenance.error.load')}</Text>
            <PrimaryButton P={P} label={t('maintenance.tryAgain')} onPress={() => { void state.reload(); }} />
          </View>
        ) : (
          <>
            {state.remindersOn === false && (
              <View style={[styles.banner, { backgroundColor: P.surface, borderColor: P.border }]}>
                <Ionicons name="notifications-off-outline" size={18} color={P.sub} />
                <Text style={[ui.body, { color: P.sub, flex: 1 }]}>{t('maintenance.remindersOff')}</Text>
                <GhostButton small P={P} label={t('maintenance.turnOn')} onPress={turnOnReminders} />
              </View>
            )}
            {!state.settings?.setupCompletedAt && (
              <TouchableOpacity
                style={[styles.banner, { backgroundColor: P.surface, borderColor: P.border }]}
                onPress={() => { hapticLight(); onOpenSetup(); }}
                activeOpacity={0.5}
                accessibilityRole="button"
              >
                <Ionicons name="sparkles-outline" size={18} color={P.accentText} />
                <Text style={[ui.body, { color: P.text, flex: 1 }]}>{t('maintenance.finishSetup')}</Text>
                <Ionicons name="chevron-forward" size={16} color={P.sub} />
              </TouchableOpacity>
            )}
            {state.settings?.setupCompletedAt && pickedCount > 0 && (
              <TouchableOpacity
                style={[styles.banner, { backgroundColor: P.accentDim, borderColor: P.border }]}
                onPress={() => { hapticLight(); onOpenPicked(); }}
                activeOpacity={0.5}
                accessibilityRole="button"
              >
                <Ionicons name="sparkles-outline" size={18} color={P.accentText} />
                <Text style={[ui.body, { color: P.text, flex: 1 }]}>
                  {t(pickedCount === 1 ? 'maintenance.picked.one' : 'maintenance.picked.many', { count: pickedCount })}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={P.sub} />
              </TouchableOpacity>
            )}
            {bannerError && <Text style={[ui.inlineError, { color: S.bad }]}>{bannerError}</Text>}

            {isEmpty ? (
              <View style={[ui.card, styles.empty, { backgroundColor: P.card, borderColor: P.border }]}>
                <Text style={[styles.emptyTitle, { color: P.text }]}>{t('maintenance.empty.title')}</Text>
                <Text style={[ui.body, { color: P.sub }]}>
                  {state.remindersOn ? t('maintenance.firstRun.note') : t('maintenance.empty.bookingNote')}
                </Text>
              </View>
            ) : (
              <>
                {nextUp && renderNextUp(nextUp)}
                {/* Chips only when there's more than one kind of thing to filter. */}
                {filterCounts.size > 2 && (
                  <View style={ui.chips}>
                    {FILTERS.filter(f => filterCounts.has(f.key)).map(f => (
                      <Chip
                        key={f.key}
                        label={`${t(f.label)} · ${filterCounts.get(f.key)}`}
                        on={activeFilter === f.key}
                        onPress={() => setFilter(f.key)}
                        P={P}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            {groups.needsAttention.length > 0 && <SectionLabel text={t('maintenance.section.attention').toUpperCase()} P={P} />}
            {renderItems(groups.needsAttention)}
            {groups.comingUp.length > 0 && <SectionLabel text={t('maintenance.section.comingUp').toUpperCase()} P={P} />}
            {renderItems(groups.comingUp)}

            {(state.context.prep.length > 0 || state.context.aftercare.length > 0) && (
              <SectionLabel text={t('maintenance.section.bookings').toUpperCase()} P={P} />
            )}
            {state.context.prep.map(n => renderNote(n, 'prep'))}
            {state.context.aftercare.map(n => renderNote(n, 'aftercare'))}

            {(groups.events.length > 0 || patchDate) && (
              <SectionLabel text={t('maintenance.section.patchEvents').toUpperCase()} P={P} />
            )}
            {patchDate && (
              <View style={[ui.card, styles.ctx, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.patchTop}>
                  <View style={[styles.ico, { borderColor: P.accentText }]}>
                    <Ionicons name="shield-outline" size={18} color={P.accentText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ctxTitle, { color: P.text }]}>{t('maintenance.patch.title')}</Text>
                    <Text style={[ui.body, { color: P.sub }]}>
                      {t('maintenance.patch.recorded', { date: formatShortDayDate(patchDate) + ' ' + toLocalDate(patchDate).getFullYear() })}
                    </Text>
                  </View>
                </View>
                <View style={styles.ctxFoot}>
                  <GhostButton small P={P} label={t('maintenance.patch.change')} onPress={() => setPatchPicker(true)} />
                  <PrimaryButton small P={P} label={t('maintenance.patch.check')} onPress={onMessageProviders} />
                </View>
                {patchPicker && (
                  <DateTimePicker value={toLocalDate(patchDate)} mode="date" display="default" maximumDate={new Date()} onChange={onPickPatch} />
                )}
              </View>
            )}
            {renderItems(groups.events)}

            {groups.paused.length > 0 && <SectionLabel text={t('maintenance.section.paused').toUpperCase()} P={P} />}
            {renderItems(groups.paused)}

            {visibleItems.length > 0 && (
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: P.accentDim }]} />
                  <Text style={[styles.legendText, { color: P.sub }]}>{t('maintenance.legend.booking')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: P.accentText }]} />
                  <Text style={[styles.legendText, { color: P.sub }]}>{t('maintenance.legend.mine')}</Text>
                </View>
              </View>
            )}

            <Note P={P} icon="information-circle-outline" text={t('maintenance.disclaimer')} />
          </>
        )}
      </ScrollView>

      <ItemMenuSheet
        item={menuItem}
        P={P}
        S={S}
        t={t}
        onClose={() => setMenuItem(null)}
        onUpdate={state.updateItem}
        onDelete={state.deleteItem}
      />
      <AddReminderSheet
        visible={adding}
        pastProviders={state.context.pastProviders}
        P={P}
        S={S}
        t={t}
        onClose={() => setAdding(false)}
        onAdd={item => state.addItems([item])}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 1 },
  errorBlock: { marginTop: 40, gap: 16, paddingHorizontal: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  empty: { padding: 16, gap: 8 },
  emptyTitle: { fontFamily: FONT_DISPLAY, fontSize: 17, letterSpacing: 0.8 },
  next: { borderRadius: 20, padding: 18, gap: 10 },
  nextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextEyebrow: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.4, opacity: 0.85 },
  nextTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: 0.8, lineHeight: 26 },
  nextRhythm: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nextRhythmText: { flex: 1, fontFamily: FONT_BODY, fontSize: 14, lineHeight: 19, opacity: 0.92 },
  nextFoot: { flexDirection: 'row', gap: 10, marginTop: 4 },
  nextBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextGhost: { flex: 0, paddingHorizontal: 16, borderWidth: 1, backgroundColor: 'transparent' },
  nextBtnText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1.1 },
  ctx: { padding: 14, gap: 8 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4 },
  ctxTitle: { fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 0.8 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  quoteFrom: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.1 },
  quoteText: { fontFamily: FONT_BODY, fontSize: 14.5, lineHeight: 21 },
  quoteMeta: { fontFamily: FONT_BODY, fontSize: 11.5 },
  ctxFoot: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 2 },
  patchTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  ico: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 16, height: 16, borderRadius: 8 },
  legendText: { fontFamily: FONT_BODY, fontSize: 11.5 },
});
