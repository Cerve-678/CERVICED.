// src/features/providers/DiaryCard.tsx
// A link-only provider's diary on Home, read from their phone's own calendar
// (where Fresha, Treatwell, Acuity etc. already put their bookings). Nothing
// is sent to CERVICED's servers — see deviceCalendarService. Free for now;
// planned to sit behind a subscription once the product owner switches it on.
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
import { formatTime12Safe, relativeDayLabel, formatShortDayDate } from '../../utils/dateUtils';
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

const DIARY_DAYS = 7;
const DIARY_ROWS = 6;

type Phase = 'loading' | 'disconnected' | 'denied' | 'connected' | 'failed';

export function DiaryCard({ P }: { P: DiaryPalette }) {
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
      setEvents(await getDiaryEvents(ids, DIARY_DAYS));
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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="calendar-outline" size={22} color={P.accent} />
        <Text style={styles.title}>{phase === 'connected' ? 'Your diary' : 'Connect your calendar'}</Text>
        {phase === 'connected' ? (
          <TouchableOpacity onPress={openChooser} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
            <Text style={styles.link}>Manage</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.free}>Free</Text>
        )}
      </View>

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

      {phase === 'connected' && (
        events.length === 0 ? (
          <Text style={styles.body}>Nothing in your calendar for the next {DIARY_DAYS} days.</Text>
        ) : (
          <View style={styles.list}>
            {events.slice(0, DIARY_ROWS).map(event => (
              <View key={`${event.calendarId}-${event.id}-${event.start.getTime()}`} style={styles.eventRow}>
                <View style={[styles.dot, { backgroundColor: event.calendarColor }]} />
                <View style={styles.eventText}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.eventWhen} numberOfLines={1}>
                    {relativeDayLabel(event.start) ?? formatShortDayDate(event.start)}
                    {event.allDay ? ' · All day' : ` · ${formatTime12Safe(event.start) ?? ''}`}
                  </Text>
                </View>
              </View>
            ))}
            {events.length > DIARY_ROWS && (
              <Text style={styles.more}>+{events.length - DIARY_ROWS} more this week</Text>
            )}
          </View>
        )
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
    card: { backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 14, gap: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text },
    free: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    link: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accent },
    body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, color: P.sub },
    spacer: { marginVertical: 8 },
    button: { height: 44, borderRadius: 22, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.6, color: P.onAccent },
    disabled: { opacity: 0.45 },
    list: { gap: 10 },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    eventText: { flex: 1 },
    eventTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.text },
    eventWhen: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub, marginTop: 1 },
    more: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.sub },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: P.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 10, gap: 10, maxHeight: '80%' },
    grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: P.border, marginBottom: 6 },
    sheetTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, color: P.text },
    sheetList: { flexGrow: 0 },
    calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
    textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    disconnect: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.sub, textDecorationLine: 'underline' },
  });
