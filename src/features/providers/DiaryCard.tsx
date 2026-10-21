// src/features/providers/DiaryCard.tsx
// A link-only provider's diary on Home, read from their phone's own calendar
// (where Fresha, Treatwell, Acuity etc. already put their bookings). Nothing
// is sent to CERVICED's servers — see deviceCalendarService. Free for now;
// planned to sit behind a subscription once the product owner switches it on.
//
// Always the whole week, never behind a tap (owner's call, 2026-10-19), one
// line per day so it stays short: the first two appointments as chips and a
// "+N" for the rest, with free and closed days included so a gap is visible at
// a glance. Design B: https://claude.ai/artifact/MJfLyQ2BLudDpneHpqbVMx
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearDiaryCalendars,
  getCalendarAccess,
  getDeviceCalendars,
  getDiaryCalendarIds,
  getDiaryEvents,
  requestCalendarAccess,
  setDiaryCalendarIds,
  type DeviceCalendar,
  type DiaryEvent,
} from '../../services/deviceCalendarService';
import { dayName, monthName, formatDurationMinutes } from '../../utils/dateUtils';
import { useTranslation } from '../../i18n';
import type { UseTranslation } from '../../i18n/useTranslation';
import type { DbProviderAvailability } from '../../types/database';
import { DASHBOARD_WEEK_DAYS, buildDashboardWeek, diaryEventMinutes, type DashboardWeekDay } from './diaryDays';
import { compactTime } from './linkOnlyDashboard';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { logger } from '../../utils/logger';

export interface DiaryPalette {
  card: string;
  surface: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  onAccent: string;
  accentDim: string;
  bg: string;
}

/** Appointments shown as chips on a day's line; the rest become "+N". */
const CHIPS_PER_DAY = 2;

type Phase = 'loading' | 'disconnected' | 'denied' | 'connected' | 'failed';

/** "19–25 Oct", or "29 Oct – 4 Nov" across a month end. */
function weekRangeLabel(week: readonly DashboardWeekDay[]): string {
  const first = week[0]?.date;
  const last = week[week.length - 1]?.date;
  if (!first || !last) return '';
  const firstMonth = monthName(first.getMonth(), 'short');
  const lastMonth = monthName(last.getMonth(), 'short');
  return firstMonth === lastMonth
    ? `${first.getDate()}–${last.getDate()} ${lastMonth}`
    : `${first.getDate()} ${firstMonth} – ${last.getDate()} ${lastMonth}`;
}

function daySummary(day: DashboardWeekDay, t: UseTranslation['t'], tp: UseTranslation['tp']): string {
  if (day.events.length === 0) return day.closed ? t('providerBookings.diary.closed') : '';
  const minutes = day.events.reduce((sum, event) => sum + diaryEventMinutes(event), 0);
  const count = tp('providerBookings.diary.appointments', day.events.length);
  return minutes > 0 ? `${count} · ${formatDurationMinutes(minutes)}` : count;
}

/** `hours` — their weekly opening hours, so closed days read "Closed" rather
 *  than "Free all day". */
export function DiaryCard({ P, hours }: { P: DiaryPalette; hours: readonly DbProviderAvailability[] }) {
  const { t, tp } = useTranslation();
  const styles = useMemo(() => createStyles(P), [P]);
  const bottomInset = useSystemBottomInset();
  const [phase, setPhase] = useState<Phase>('loading');
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const ids = await getDiaryCalendarIds();
      if (ids == null) { setPhase('disconnected'); return; }
      const access = await getCalendarAccess();
      if (access !== 'granted') { setPhase(access === 'denied' ? 'denied' : 'disconnected'); return; }
      setEvents(await getDiaryEvents(ids, DASHBOARD_WEEK_DAYS));
      setPhase('connected');
    } catch (error) {
      logger.warn('[DiaryCard] could not read the phone calendar', error);
      setPhase('failed');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openChooser = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const access = await requestCalendarAccess().catch(() => 'denied' as const);
    if (access !== 'granted') { setPhase('denied'); return; }
    try {
      const [list, saved] = await Promise.all([getDeviceCalendars(), getDiaryCalendarIds()]);
      setCalendars(list);
      // First time: everything on, they untick what isn't work.
      setChosen(new Set(saved ?? list.map(calendar => calendar.id)));
      setChooserOpen(true);
    } catch (error) {
      logger.warn('[DiaryCard] could not list calendars', error);
      setPhase('failed');
    }
  }, []);

  const saveChoice = useCallback(async () => {
    await setDiaryCalendarIds([...chosen]);
    setChooserOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    void load();
  }, [chosen, load]);

  const disconnect = useCallback(async () => {
    await clearDiaryCalendars();
    setChooserOpen(false);
    setEvents([]);
    setPhase('disconnected');
  }, []);

  const week = useMemo(() => buildDashboardWeek(events, hours, new Date()), [events, hours]);
  const connected = phase === 'connected';

  return (
    <View style={styles.card}>
      {connected ? (
        <View style={styles.headerRow}>
          <View style={styles.eventText}>
            <Text style={styles.title}>{t('providerBookings.diary.title')}</Text>
            <Text style={styles.headerSub}>{t('providerBookings.diary.subtitle', { range: weekRangeLabel(week) })}</Text>
          </View>
          {/* A bordered pill with an icon, not bare text, so it reads as a
              button at a glance (owner's call, 2026-10-19). */}
          <TouchableOpacity
            style={styles.calendarsButton}
            onPress={openChooser}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('providerBookings.diary.chooseCalendarsA11y')}
          >
            <Ionicons name="calendar-outline" size={14} color={P.accent} />
            <Text style={styles.link}>{t('providerBookings.diary.calendars')}</Text>
            <Ionicons name="chevron-down" size={12} color={P.accent} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Ionicons name="calendar-outline" size={22} color={P.accent} />
          <Text style={[styles.title, styles.eventText]}>{t('providerBookings.diary.connectTitle')}</Text>
          <Text style={styles.free}>{t('common.free')}</Text>
        </View>
      )}

      {phase === 'loading' && <ActivityIndicator color={P.accent} style={styles.spacer} />}

      {phase === 'disconnected' && (
        <>
          <Text style={styles.body}>
            {t('providerBookings.diary.connectBody')}
          </Text>
          <TouchableOpacity style={styles.button} onPress={openChooser} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('providerBookings.diary.connect')}</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'denied' && (
        <>
          <Text style={styles.body}>
            {t('providerBookings.diary.deniedBody')}
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => { void Linking.openSettings(); }} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('providerBookings.diary.openSettings')}</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'failed' && (
        <>
          <Text style={styles.body}>{t('providerBookings.diary.failed')}</Text>
          <TouchableOpacity style={styles.button} onPress={() => { void load(); }} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('common.tryAgain')}</Text>
          </TouchableOpacity>
        </>
      )}

      {connected && (
        <View>
          {week.map((day, index) => {
            const isToday = index === 0;
            const more = day.events.length - CHIPS_PER_DAY;
            return (
              <View
                key={day.ymd}
                style={[styles.dayLine, isToday ? styles.todayLine : index > 1 ? styles.lineDivider : null]}
                accessible
                accessibilityLabel={t('providerBookings.diary.dayA11y', {
                  day: dayName(day.date.getDay()),
                  date: day.date.getDate(),
                  summary: daySummary(day, t, tp) || t('providerBookings.diary.freeAllDayA11y'),
                })}
              >
                <View style={styles.dayCol}>
                  <Text style={[styles.dayName, isToday && styles.todayName]}>
                    {isToday ? t('common.date.today').toUpperCase() : dayName(day.date.getDay(), 'short').toUpperCase()}
                  </Text>
                  <Text style={[styles.dayNum, day.closed && day.events.length === 0 && styles.closedNum]}>{day.date.getDate()}</Text>
                </View>
                <View style={styles.chips}>
                  {day.events.slice(0, CHIPS_PER_DAY).map(event => (
                    <View
                      key={`${event.calendarId}-${event.id}-${event.start.getTime()}`}
                      style={[styles.chip, { backgroundColor: isToday ? P.card : P.surface }]}
                    >
                      <Text style={styles.chipText} numberOfLines={1}>
                        {event.allDay ? t('providerBookings.diary.allDay') : compactTime(event.start) ?? ''} {event.title}
                      </Text>
                    </View>
                  ))}
                  {more > 0 && (
                    <View style={[styles.chip, styles.moreChip]}>
                      <Text style={[styles.chipText, styles.onAccent]}>+{more}</Text>
                    </View>
                  )}
                  {day.events.length === 0 && (day.closed ? (
                    <Text style={styles.closedText}>{t('providerBookings.diary.closed')}</Text>
                  ) : (
                    <View style={styles.freeChip}>
                      <Text style={styles.freeText}>{t('providerBookings.diary.freeAllDay')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={chooserOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setChooserOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setChooserOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 20 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{t('providerBookings.diary.chooserTitle')}</Text>
            <Text style={styles.body}>{t('providerBookings.diary.chooserBody')}</Text>
            <ScrollView style={styles.sheetList}>
              {calendars.length === 0 ? (
                <Text style={styles.body}>{t('providerBookings.diary.noCalendars')}</Text>
              ) : calendars.map(calendar => (
                <View key={calendar.id} style={styles.calendarRow}>
                  <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                  <View style={styles.eventText}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{calendar.title}</Text>
                    {!!calendar.sourceName && <Text style={styles.eventWhen} numberOfLines={1}>{calendar.sourceName}</Text>}
                  </View>
                  <Switch
                    value={chosen.has(calendar.id)}
                    onValueChange={on => setChosen(prev => {
                      const next = new Set(prev);
                      if (on) next.add(calendar.id); else next.delete(calendar.id);
                      return next;
                    })}
                    trackColor={{ true: P.accent, false: P.border }}
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.button, chosen.size === 0 && styles.disabled]} disabled={chosen.size === 0} onPress={saveChoice} activeOpacity={0.85}>
              <Text style={styles.buttonText}>{t('providerBookings.diary.showThese')}</Text>
            </TouchableOpacity>
            {phase === 'connected' && (
              <TouchableOpacity style={styles.textButton} onPress={disconnect} activeOpacity={0.7}>
                <Text style={styles.disconnect}>{t('providerBookings.diary.disconnect')}</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (P: DiaryPalette) =>
  StyleSheet.create({
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    headerSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub, marginTop: 1 },
    dayLine: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 8, paddingVertical: 6 },
    todayLine: { borderRadius: 12, backgroundColor: P.accentDim },
    lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border },
    dayCol: { width: 42 },
    dayName: { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: P.sub },
    todayName: { color: P.accent },
    dayNum: { fontFamily: 'BakbakOne-Regular', fontSize: 16, lineHeight: 19, color: P.text },
    closedNum: { color: P.sub },
    chips: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, overflow: 'hidden' },
    chip: { flexShrink: 1, maxWidth: 132, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
    chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    moreChip: { flexShrink: 0, backgroundColor: P.accent },
    onAccent: { color: P.onAccent },
    freeChip: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: P.border },
    freeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    closedText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    free: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    link: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accent },
    calendarsButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1.5, borderColor: P.accent, backgroundColor: P.surface },
    body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, color: P.sub },
    spacer: { marginVertical: 8 },
    button: { height: 44, borderRadius: 22, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.6, color: P.onAccent },
    disabled: { opacity: 0.45 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    eventText: { flex: 1 },
    eventTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.text },
    eventWhen: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub, marginTop: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: P.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 10, gap: 10, maxHeight: '80%' },
    grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: P.border, marginBottom: 6 },
    sheetTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, color: P.text },
    sheetList: { flexGrow: 0 },
    calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
    textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    disconnect: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.sub, textDecorationLine: 'underline' },
  });
