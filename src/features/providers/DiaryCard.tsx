// src/features/providers/DiaryCard.tsx
// A link-only provider's diary on Home, read from their phone's own calendar
// (where Fresha, Treatwell, Acuity etc. already put their bookings). Nothing
// is sent to CERVICED's servers — see deviceCalendarService. Free for now;
// planned to sit behind a subscription once the product owner switches it on.
//
// Always the whole week, never behind a tap (owner's call, 2026-10-19): a day
// strip counting each day's appointments, then every day listed — free and
// closed days included, so a gap is visible at a glance.
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
import { DAY_NAMES_ABBREV, DAY_NAMES_FULL, MONTH_NAMES_ABBREV, formatDurationMinutes, formatTime12Safe, relativeDayLabel } from '../../utils/dateUtils';
import type { DbProviderAvailability } from '../../types/database';
import { DASHBOARD_WEEK_DAYS, buildDashboardWeek, diaryEventMinutes, type DashboardWeekDay } from './diaryDays';
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
  bg: string;
}

type Phase = 'loading' | 'disconnected' | 'denied' | 'connected' | 'failed';

/** "19–25 Oct", or "29 Oct – 4 Nov" across a month end. */
function weekRangeLabel(week: readonly DashboardWeekDay[]): string {
  const first = week[0]?.date;
  const last = week[week.length - 1]?.date;
  if (!first || !last) return '';
  const firstMonth = MONTH_NAMES_ABBREV[first.getMonth()];
  const lastMonth = MONTH_NAMES_ABBREV[last.getMonth()];
  return firstMonth === lastMonth
    ? `${first.getDate()}–${last.getDate()} ${lastMonth}`
    : `${first.getDate()} ${firstMonth} – ${last.getDate()} ${lastMonth}`;
}

function daySummary(day: DashboardWeekDay): string {
  if (day.events.length === 0) return day.closed ? 'Closed' : '';
  const minutes = day.events.reduce((sum, event) => sum + diaryEventMinutes(event), 0);
  const count = `${day.events.length} appointment${day.events.length === 1 ? '' : 's'}`;
  return minutes > 0 ? `${count} · ${formatDurationMinutes(minutes)}` : count;
}

/** `hours` — their weekly opening hours, so closed days read "Closed" rather
 *  than "Free all day". */
export function DiaryCard({ P, hours }: { P: DiaryPalette; hours: readonly DbProviderAvailability[] }) {
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

  const renderEvent = (event: (typeof events)[number]) => {
    const minutes = diaryEventMinutes(event);
    const detail = [minutes ? formatDurationMinutes(minutes) : null, event.location].filter(Boolean).join(' · ');
    return (
      <View key={`${event.calendarId}-${event.id}-${event.start.getTime()}`} style={styles.eventRow}>
        <Text style={styles.eventTime}>{event.allDay ? 'All day' : formatTime12Safe(event.start) ?? ''}</Text>
        <View style={styles.eventBlock}>
          <View style={[styles.eventBar, { backgroundColor: event.calendarColor }]} />
          <View style={styles.eventText}>
            <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
            {!!detail && <Text style={styles.eventWhen} numberOfLines={1}>{detail}</Text>}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      {connected ? (
        <View style={styles.headerRow}>
          <View style={styles.eventText}>
            <Text style={styles.title}>Your week</Text>
            <Text style={styles.headerSub}>{weekRangeLabel(week)} · from your phone calendar</Text>
          </View>
          <TouchableOpacity
            onPress={openChooser}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose calendars"
          >
            <Text style={styles.link}>Calendars</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Ionicons name="calendar-outline" size={22} color={P.accent} />
          <Text style={[styles.title, styles.eventText]}>Connect your calendar</Text>
          <Text style={styles.free}>Free</Text>
        </View>
      )}

      {phase === 'loading' && <ActivityIndicator color={P.accent} style={styles.spacer} />}

      {phase === 'disconnected' && (
        <>
          <Text style={styles.body}>
            See your appointments here. We read the calendars on your phone — iPhone Calendar, and Google if it's added to your phone — and nothing leaves your device.
          </Text>
          <TouchableOpacity style={styles.button} onPress={openChooser} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'denied' && (
        <>
          <Text style={styles.body}>
            CERVICED doesn't have access to your calendar. You can turn it on in your phone's Settings.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => { void Linking.openSettings(); }} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'failed' && (
        <>
          <Text style={styles.body}>Couldn't read your calendar just now.</Text>
          <TouchableOpacity style={styles.button} onPress={() => { void load(); }} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </>
      )}

      {connected && (
        <>
          <View style={styles.strip}>
            {week.map((day, index) => {
              const isToday = index === 0;
              return (
                <View
                  key={day.ymd}
                  style={[styles.stripDay, isToday && styles.stripToday]}
                  accessibilityLabel={`${DAY_NAMES_FULL[day.date.getDay()]} ${day.date.getDate()}: ${daySummary(day) || 'free'}`}
                >
                  <Text style={[styles.stripName, isToday && styles.onAccent]}>{DAY_NAMES_ABBREV[day.date.getDay()]}</Text>
                  <Text style={[styles.stripNum, isToday && styles.onAccent, day.closed && !isToday && styles.closedNum]}>
                    {day.date.getDate()}
                  </Text>
                  <View style={styles.stripDots}>
                    {day.events.slice(0, 3).map(event => (
                      <View
                        key={`${event.calendarId}-${event.id}-${event.start.getTime()}`}
                        style={[styles.stripDot, { backgroundColor: isToday ? P.onAccent : P.accent }]}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {week.map(day => {
            const summary = daySummary(day);
            const label = relativeDayLabel(day.date) ?? `${DAY_NAMES_FULL[day.date.getDay()]} ${day.date.getDate()}`;
            return (
              <View key={day.ymd} style={styles.list}>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{label}</Text>
                  {!!summary && <Text style={styles.daySummary}>{summary}</Text>}
                </View>
                {day.events.map(renderEvent)}
                {day.events.length === 0 && !day.closed && (
                  <View style={styles.eventRow}>
                    <View style={styles.eventTimeSpacer} />
                    <View style={styles.freeBlock}>
                      <Text style={styles.freeText}>Free all day</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <Modal visible={chooserOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setChooserOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setChooserOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: bottomInset + 20 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Which calendars?</Text>
            <Text style={styles.body}>Choose the ones your bookings land in. This stays on this phone.</Text>
            <ScrollView style={styles.sheetList}>
              {calendars.length === 0 ? (
                <Text style={styles.body}>No calendars found on this phone.</Text>
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
              <Text style={styles.buttonText}>Show these</Text>
            </TouchableOpacity>
            {phase === 'connected' && (
              <TouchableOpacity style={styles.textButton} onPress={disconnect} activeOpacity={0.7}>
                <Text style={styles.disconnect}>Disconnect on this phone</Text>
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
    dayRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    dayLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: P.sub, textTransform: 'uppercase' },
    daySummary: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', color: P.sub },
    strip: { flexDirection: 'row', gap: 4 },
    stripDay: { flex: 1, alignItems: 'center', borderRadius: 14, paddingTop: 7, paddingBottom: 8, backgroundColor: P.surface },
    stripToday: { backgroundColor: P.accent },
    stripName: { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: P.sub },
    stripNum: { fontFamily: 'BakbakOne-Regular', fontSize: 17, lineHeight: 22, color: P.text },
    closedNum: { opacity: 0.45 },
    onAccent: { color: P.onAccent },
    stripDots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 3 },
    stripDot: { width: 5, height: 5, borderRadius: 3 },
    eventTimeSpacer: { width: 64 },
    freeBlock: { flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: P.border, paddingVertical: 10, paddingHorizontal: 12 },
    freeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', color: P.sub },
    free: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    link: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accent },
    body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, color: P.sub },
    spacer: { marginVertical: 8 },
    button: { height: 44, borderRadius: 22, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.6, color: P.onAccent },
    disabled: { opacity: 0.45 },
    list: { gap: 10 },
    eventRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
    eventTime: { width: 64, paddingTop: 10, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.text },
    eventBlock: { flex: 1, flexDirection: 'row', gap: 10, backgroundColor: P.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
    eventBar: { width: 3, borderRadius: 2 },
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
