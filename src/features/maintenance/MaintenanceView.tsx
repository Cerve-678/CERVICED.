// src/features/maintenance/MaintenanceView.tsx
//
// The full Maintenance screen inside Beauty Profile (screen state, not a
// route — see BeautyProfileScreen). Layout approved 2026-11-23 (canvas board
// D, "Sentence + cards"): one item said in plain words at the top with its
// actions, then everything else as cards grouped by what the client should
// do, not by type. Tapping a card brings it up into the sentence.
// Provider-written prep and aftercare (in the "Notes from your providers"
// sheet) are quoted in full and credited, never paraphrased, and nothing is
// shown when the provider wrote nothing. The patch-test card shows only the
// client's own recorded date: no countdown, no verdict.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
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
import {
  byDue, doneOutcome, groupMaintenanceItems, needsAttention, nextUpFrom, snoozedDueOn, type PresentedItem,
} from './presentation';
import { MaintenanceItemCard, type ItemAction } from './MaintenanceItemCard';
import { SentenceHero } from './SentenceHero';
import { MaintenanceHowTo } from './MaintenanceHowTo';
import { recordTourSeen, resolveTourForUser } from '../../services/tourService';
import { TOUR_KEYS } from '../../utils/coachMarkTours';
import { logger } from '../../utils/logger';
import { ItemMenuSheet } from './ItemMenuSheet';
import { AddReminderSheet } from './AddReminderSheet';
import type { MaintenanceState } from './useMaintenance';
import {
  FONT_BODY, FONT_DISPLAY, GhostButton, Note, PrimaryButton, SectionLabel, Sheet,
  semanticColors, ui, hapticError, hapticLight,
} from './ui';

interface Props {
  /** For showing "How Maintenance works" once per account. */
  userId: string | null;
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
  userId, state, focusItemId, busyItemId, onBack, onItemAction, onOpenSetup, pickedCount, onOpenPicked,
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
  const [notesOpen, setNotesOpen] = useState(false);
  /** The item the client tapped up into the sentence; null = the default. */
  const [heroId, setHeroId] = useState<string | null>(focusItemId ?? null);

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
  const nextUp = useMemo(() => nextUpFrom(groups), [groups]);

  // Landing from a push / notification puts that item in the sentence.
  useEffect(() => { if (focusItemId) setHeroId(focusItemId); }, [focusItemId]);

  // The sentence shows the tapped item, else what needs the client soonest,
  // else the soonest thing coming up. Acting on the default one (Done it,
  // Snooze) moves its date, so the next one steps up on the next render.
  const hero = useMemo<PresentedItem | null>(() => {
    const all = [...groups.needsAttention, ...groups.comingUp, ...groups.events, ...groups.paused];
    const picked = heroId ? all.find(p => p.item.id === heroId) : undefined;
    return picked ?? nextUp.due ?? nextUp.upcoming ?? groups.comingUp[0] ?? groups.events[0] ?? groups.paused[0] ?? null;
  }, [groups, nextUp, heroId]);

  // Everything else, as cards: what needs the client, then later, then paused.
  const lists = useMemo(() => {
    const notHero = (p: PresentedItem) => p.item.id !== hero?.item.id;
    const dueEvents = groups.events.filter(p => needsAttention(p.view.state));
    const laterEvents = groups.events.filter(p => !needsAttention(p.view.state));
    return {
      needs: [...groups.needsAttention, ...dueEvents].sort(byDue).filter(notHero),
      later: [...groups.comingUp, ...laterEvents].sort(byDue).filter(notHero),
      paused: groups.paused.filter(notHero),
    };
  }, [groups, hero]);

  // "How Maintenance works": once per account on the first visit, then from
  // the link under the title.
  const [howTo, setHowTo] = useState(false);
  const howToChecked = useRef(false);
  useEffect(() => {
    if (howToChecked.current || !userId) return;
    howToChecked.current = true;
    let alive = true;
    resolveTourForUser(TOUR_KEYS.CLIENT_MAINTENANCE_HOWTO, [{ key: 'howto' }], userId)
      .then((decision) => {
        if (!alive || !decision.show) return;
        setHowTo(true);
        void recordTourSeen(TOUR_KEYS.CLIENT_MAINTENANCE_HOWTO, userId);
      })
      .catch((err: unknown) => logger.error('[Maintenance] how-to check failed:', err));
    return () => { alive = false; };
  }, [userId]);
  const [doneBusyId, setDoneBusyId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const openMenu = useCallback((item: MaintenanceItem) => setMenuItem(item), []);
  const bringUp = useCallback((item: MaintenanceItem) => {
    setHeroId(item.id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const renderItems = (list: PresentedItem[]) =>
    list.map(({ item, view }) => (
      <MaintenanceItemCard key={item.id} item={item} view={view} P={P} S={S} t={t} onPress={bringUp} />
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
        <GhostButton small P={P} label={t('maintenance.ctx.viewBooking')} onPress={() => { setNotesOpen(false); onViewBooking(note.bookingId); }} />
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
    state.updateItem(item.id, { dueOn: snoozedDueOn(item, today) }).then(() => setHeroId(null), err => {
      hapticError();
      setBannerError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] snooze'));
    });
  };

  const markDone = (item: MaintenanceItem) => {
    setBannerError(null);
    setDoneBusyId(item.id);
    const outcome = doneOutcome(item, today);
    const work = outcome.kind === 'update' ? state.updateItem(item.id, outcome.patch) : state.deleteItem(item.id);
    work
      .then(() => setHeroId(null), err => {
        hapticError();
        setBannerError(toUserMessage(err, t('maintenance.error.save'), '[Maintenance] done it'));
      })
      .finally(() => setDoneBusyId(null));
  };

  const noteCount = state.context.prep.length + state.context.aftercare.length;

  const isEmpty = visibleItems.length === 0 && state.context.prep.length === 0 && state.context.aftercare.length === 0 && !patchDate;

  return (
    <ThemedBackground style={styles.bg}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
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
          <View style={{ flex: 1 }} />
          <GhostButton small P={P} icon="add" label={t('maintenance.addMine')} onPress={() => setAdding(true)} />
        </View>
        <View>
          <Text style={[styles.title, { color: P.text }]}>{t('maintenance.title').toUpperCase()}</Text>
          <Text style={[styles.subtitle, { color: P.sub }]}>{t('maintenance.schedule').toUpperCase()}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { hapticLight(); setHowTo(true); }}
          activeOpacity={0.5}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.howLink}
        >
          <Text style={[styles.howLinkText, { color: P.accentText }]}>{t('maintenance.howto.link').toUpperCase()} ›</Text>
        </TouchableOpacity>

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
            ) : hero ? (
              <SentenceHero
                presented={hero}
                P={P}
                S={S}
                t={t}
                busy={(doneBusyId ?? busyItemId) === hero.item.id}
                onAction={onItemAction}
                onDone={markDone}
                onSnooze={snooze}
                onMore={openMenu}
              />
            ) : null}

            {lists.needs.length > 0 && (
              <SectionLabel
                text={t(hero && needsAttention(hero.view.state) ? 'maintenance.section.alsoAttention' : 'maintenance.section.attention').toUpperCase()}
                P={P}
              />
            )}
            {renderItems(lists.needs)}
            {lists.later.length > 0 && <SectionLabel text={t('maintenance.section.comingUp').toUpperCase()} P={P} />}
            {renderItems(lists.later)}
            {lists.paused.length > 0 && <SectionLabel text={t('maintenance.section.paused').toUpperCase()} P={P} />}
            {renderItems(lists.paused)}

            {noteCount > 0 && (
              <TouchableOpacity
                style={[styles.notesRow, { backgroundColor: P.surface }]}
                onPress={() => { hapticLight(); setNotesOpen(true); }}
                activeOpacity={0.6}
                accessibilityRole="button"
              >
                <Ionicons name="chatbox-outline" size={18} color={P.sub} />
                <Text style={[styles.notesText, { color: P.text }]}>{t('maintenance.notes.row')}</Text>
                <View style={[styles.count, { backgroundColor: P.accentDim }]}>
                  <Text style={[styles.countText, { color: P.accentText }]}>{noteCount}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={P.sub} />
              </TouchableOpacity>
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

            <Note P={P} icon="information-circle-outline" text={t('maintenance.disclaimer')} />
          </>
        )}
      </ScrollView>

      <Sheet visible={notesOpen} onClose={() => setNotesOpen(false)} P={P}>
        <Text style={[ui.sheetTitle, { color: P.text }]}>{t('maintenance.section.bookings')}</Text>
        {state.context.prep.map(n => renderNote(n, 'prep'))}
        {state.context.aftercare.map(n => renderNote(n, 'aftercare'))}
      </Sheet>
      <ItemMenuSheet
        item={menuItem}
        P={P}
        S={S}
        t={t}
        onClose={() => setMenuItem(null)}
        onUpdate={state.updateItem}
        onDelete={state.deleteItem}
      />
      <MaintenanceHowTo visible={howTo} onClose={() => setHowTo(false)} P={P} S={S} t={t} />
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
  title: { fontFamily: FONT_DISPLAY, fontSize: 36, lineHeight: 40, letterSpacing: 1 },
  subtitle: { fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: 4, marginTop: 2 },
  howLink: { alignSelf: 'flex-start', marginTop: -4 },
  howLinkText: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.2 },
  errorBlock: { marginTop: 40, gap: 16, paddingHorizontal: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12 },
  empty: { padding: 16, gap: 8 },
  emptyTitle: { fontFamily: FONT_DISPLAY, fontSize: 17, letterSpacing: 0.8 },
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
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, minHeight: 48, paddingHorizontal: 14, marginTop: 8 },
  notesText: { flex: 1, fontFamily: FONT_BODY, fontSize: 14, fontWeight: '600' },
  count: { borderRadius: 100, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center' },
  countText: { fontFamily: FONT_DISPLAY, fontSize: 11 },
});
