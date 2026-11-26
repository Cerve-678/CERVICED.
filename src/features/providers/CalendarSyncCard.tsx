// src/features/providers/CalendarSyncCard.tsx
// Calendar sync for a full provider, on Scheduling & Availability. For
// providers still taking bookings somewhere else too: they choose the phone
// calendars those bookings land in, and clients can't book them on CERVICED
// when they're busy there. Only the busy times are sent, never what the
// appointments are (see calendarBusySync).
//
// The link-only version is DiaryCard on their Home: it shows the week and
// sends nothing.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearDiaryCalendars,
  getCalendarAccess,
  getDeviceCalendars,
  getDiaryCalendarIds,
  requestCalendarAccess,
  setDiaryCalendarIds,
  type DeviceCalendar,
} from '../../services/deviceCalendarService';
import { clearMyCalendarBusyBlocks, getMyCalendarSyncStatus, type CalendarSyncStatus } from '../../services/databaseService';
import { timeAgo } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';
import { CalendarChooserSheet } from './CalendarChooserSheet';
import { resetCalendarSyncThrottle, syncCalendarBusyTimes } from './calendarBusySync';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

export interface CalendarSyncPalette {
  bg: string;
  card: string;
  surface: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
}

type Phase = 'loading' | 'disconnected' | 'denied' | 'connected';

function blockedLine(status: CalendarSyncStatus | null): string {
  if (!status) return 'Not synced yet';
  const count = status.blockCount === 1 ? '1 busy time' : `${status.blockCount} busy times`;
  return `${count} blocked · synced ${timeAgo(status.syncedAt).toLowerCase()}`;
}

export function CalendarSyncCard({ C }: { C: CalendarSyncPalette }) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<CalendarSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const sync = useCallback(async (force: boolean) => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncCalendarBusyTimes({ force });
      if (result.outcome === 'no_access') { setPhase('denied'); return; }
      if (result.outcome === 'not_connected') { setPhase('disconnected'); return; }
      setStatus(await getMyCalendarSyncStatus());
    } catch (e) {
      logger.error('[CalendarSyncCard] sync failed', e);
      setError(tr('discover.page.couldnTSyncJustNowCheck'));
    } finally {
      setSyncing(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const ids = await getDiaryCalendarIds();
      if (ids == null || ids.length === 0) { setPhase('disconnected'); return; }
      const access = await getCalendarAccess();
      if (access !== 'granted') { setPhase(access === 'denied' ? 'denied' : 'disconnected'); return; }
      setPhase('connected');
      setStatus(await getMyCalendarSyncStatus());
      // Opening this screen counts as a visit: sync unless one just ran.
      void sync(false);
    } catch (e) {
      logger.error('[CalendarSyncCard] could not load calendar sync', e);
      setPhase('connected');
      setError(tr('discover.page.couldnTCheckYourCalendarSync'));
    }
  }, [sync]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openChooser = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const access = await requestCalendarAccess().catch(() => 'denied' as const);
    if (access !== 'granted') { setPhase('denied'); return; }
    try {
      const [list, saved] = await Promise.all([getDeviceCalendars(), getDiaryCalendarIds()]);
      setCalendars(list);
      // First time: nothing on. Here a wrong tick blocks real booking time,
      // so they switch on only the calendars their other bookings go into.
      setChosen(new Set(saved ?? []));
      setChooserOpen(true);
    } catch (e) {
      logger.error('[CalendarSyncCard] could not list calendars', e);
      setError(tr('discover.page.couldnTReadTheCalendarsOn'));
    }
  }, []);

  const toggleCalendar = useCallback((calendarId: string, on: boolean) => {
    setChosen(prev => {
      const next = new Set(prev);
      if (on) next.add(calendarId); else next.delete(calendarId);
      return next;
    });
  }, []);

  const saveChoice = useCallback(async () => {
    await setDiaryCalendarIds([...chosen]);
    setChooserOpen(false);
    setPhase('connected');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    void sync(true);
  }, [chosen, sync]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      // Server first: if this fails the times stay blocked, so stay connected
      // and say so rather than looking disconnected while still blocking.
      await clearMyCalendarBusyBlocks();
      await clearDiaryCalendars();
      resetCalendarSyncThrottle();
      setChooserOpen(false);
      setStatus(null);
      setPhase('disconnected');
    } catch (e) {
      logger.error('[CalendarSyncCard] disconnect failed', e);
      setChooserOpen(false);
      setError(tr('discover.page.couldnTDisconnectJustNowYour'));
    }
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: C.accent + '18' }]}>
          <Ionicons name="sync-outline" size={18} color={C.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: C.text }]}>{tr('discover.page.calendarSync')}</Text>
          <Text style={[styles.sub, { color: C.sub }]}>
            {phase === 'connected' ? blockedLine(status) : tr('discover.page.takeBookingsSomewhereElseTooStop')}
          </Text>
        </View>
        {phase === 'connected' && (
          <TouchableOpacity
            style={[styles.pill, { borderColor: C.accent, backgroundColor: C.surface }]}
            onPress={openChooser}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={tr('discover.page.chooseCalendars')}
          >
            <Text style={[styles.pillText, { color: C.accent }]}>{tr('discover.page.calendars')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {phase === 'loading' && <ActivityIndicator color={C.accent} style={styles.spacer} />}

      {phase === 'disconnected' && (
        <>
          <Text style={[styles.body, { color: C.sub }]}>
            {tr('discover.page.connectCalendarBody')}
          </Text>
          <Text style={[styles.body, { color: C.sub }]}>
            {tr('discover.page.weOnlySendTheTimesYou')}
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: C.accent }]} onPress={openChooser} activeOpacity={0.85}>
            <Text style={[styles.buttonText, { color: C.onAccent }]}>{tr('discover.page.connectCalendar')}</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'denied' && (
        <>
          <Text style={[styles.body, { color: C.sub }]}>
            {tr('discover.page.cervicedDoesnTHaveAccessTo')}
          </Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: C.accent }]} onPress={() => { void Linking.openSettings(); }} activeOpacity={0.85}>
            <Text style={[styles.buttonText, { color: C.onAccent }]}>{tr('discover.page.openSettings')}</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'connected' && (
        <>
          <Text style={[styles.body, { color: C.sub }]}>
            {tr('discover.page.clientsCanTBookTimesYou')}
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.outlineButton, { borderColor: C.accent }, syncing && styles.disabled]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); void sync(true); }}
            disabled={syncing}
            activeOpacity={0.85}
          >
            {syncing
              ? <ActivityIndicator color={C.accent} />
              : <Text style={[styles.buttonText, { color: C.accent }]}>{tr('discover.page.syncNow')}</Text>}
          </TouchableOpacity>
        </>
      )}

      {error && <Text style={[styles.error, { color: C.danger }]}>{error}</Text>}

      <CalendarChooserSheet
        P={C}
        visible={chooserOpen}
        calendars={calendars}
        chosen={chosen}
        onToggle={toggleCalendar}
        onSave={saveChoice}
        onClose={() => setChooserOpen(false)}
        onDisconnect={phase === 'connected' ? disconnect : undefined}
        body={tr('discover.page.switchOnTheCalendarsYourOther')}
        saveLabel={tr('discover.page.blockTheseBusyTimes')}
        disconnectLabel={tr('discover.page.disconnectCalendarSync')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 10, marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.3 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: 2, lineHeight: 16 },
  pill: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700' },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  spacer: { marginVertical: 8 },
  button: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  outlineButton: { backgroundColor: 'transparent', borderWidth: 1.5 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.6 },
  disabled: { opacity: 0.5 },
  error: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
});
