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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { MaintenanceBookingNote, MaintenanceItem } from '../../types/maintenance';
import { dateToYMD, formatShortDate, formatShortDayDate, formatTime12Safe, toLocalDate } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import { groupMaintenanceItems, type PresentedItem } from './presentation';
import { MaintenanceItemCard, type ItemAction } from './MaintenanceItemCard';
import { ItemMenuSheet } from './ItemMenuSheet';
import { AddReminderSheet } from './AddReminderSheet';
import type { MaintenanceState } from './useMaintenance';
import {
  FONT_BODY, FONT_DISPLAY, GhostButton, Note, PrimaryButton, SectionLabel,
  semanticColors, ui, hapticError, hapticLight,
} from './ui';

interface Props {
  state: MaintenanceState;
  focusItemId?: string | undefined;
  /** Item id currently resolving a rebook, so its button can show busy. */
  busyItemId: string | null;
  onBack: () => void;
  onItemAction: (item: MaintenanceItem, action: ItemAction) => void;
  onOpenSetup: () => void;
  onMessageProviders: () => void;
  onViewBooking: (bookingId: string) => void;
}

export function MaintenanceView({
  state, focusItemId, busyItemId, onBack, onItemAction, onOpenSetup, onMessageProviders, onViewBooking,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => semanticColors(isDarkMode), [isDarkMode]);
  const [menuItem, setMenuItem] = useState<MaintenanceItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [patchPicker, setPatchPicker] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const today = dateToYMD(new Date());
  // Events are removed server-side the day after; hide them here meanwhile.
  const visibleItems = useMemo(
    () => state.items.filter(i => i.kind !== 'event' || (i.eventOn ?? today) >= today),
    [state.items, today],
  );
  const groups = useMemo(
    () => groupMaintenanceItems(visibleItems, today, state.coverage),
    [visibleItems, today, state.coverage],
  );

  // Landing from a push / notification: scroll to the item and outline it.
  const scrollRef = useRef<ScrollView>(null);
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

  const isEmpty = visibleItems.length === 0 && state.context.prep.length === 0 && state.context.aftercare.length === 0 && !patchDate;

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
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
            {bannerError && <Text style={[ui.inlineError, { color: S.bad }]}>{bannerError}</Text>}

            {isEmpty ? (
              <View style={[ui.card, styles.empty, { backgroundColor: P.card, borderColor: P.border }]}>
                <Text style={[styles.emptyTitle, { color: P.text }]}>{t('maintenance.empty.title')}</Text>
                <Text style={[ui.body, { color: P.sub }]}>{t('maintenance.firstRun.note')}</Text>
              </View>
            ) : (
              <View style={styles.summary}>
                {([
                  [groups.summary.overdue, 'maintenance.summary.overdue', true],
                  [groups.summary.dueSoon, 'maintenance.summary.dueSoon', false],
                  [groups.summary.onTrack, 'maintenance.summary.onTrack', false],
                ] as const).map(([n, key, bad]) => (
                  <View key={key} style={[ui.card, styles.summaryCard, { backgroundColor: P.card, borderColor: P.border }]}>
                    <Text style={[styles.summaryNum, { color: bad && n > 0 ? S.bad : P.text }]}>{n}</Text>
                    <Text style={[styles.summaryLabel, { color: P.sub }]}>{t(key).toUpperCase()}</Text>
                  </View>
                ))}
              </View>
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
  summary: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  summaryNum: { fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 30 },
  summaryLabel: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.2 },
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
