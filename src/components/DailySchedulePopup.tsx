import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useFont } from '../contexts/FontContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getProviderBookings,
  getProviderWaitlist,
  getProviderUnreadConversationCount,
  getActiveRescheduleRequestsForBookings,
} from '../services/databaseService';
import type { BookingWithAddOns } from '../types/database';
import { buildDaySummary, greetingFor, type DaySummary } from '../utils/daySummary';
import { dateToYMD, formatLongDate, formatTime12Safe } from '../utils/dateUtils';
import { logger } from '../utils/logger';

/** Where a row in the popup leads. Screens are all in the ProviderHome
 *  (Calendar) stack, so the host decides how to get there — Notifications has
 *  to dismiss its own sheet first, the calendar can push directly. */
export type DailyScheduleDestination =
  | { screen: 'BookingDetail'; params: { bookingId: string } }
  | { screen: 'BookingHistory'; params: { initialTab: 'todo' } }
  | { screen: 'ProviderInbox'; params: { initialFilter: 'messages' } }
  | { screen: 'ProviderHomeMain'; params: { jumpToDate: string; viewMode: 'list' } };

interface Props {
  visible: boolean;
  /** YYYY-MM-DD — the day being summarised (the recap's own day). */
  date: string;
  onClose: () => void;
  onNavigate: (destination: DailyScheduleDestination) => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DailySchedulePopup({ visible, date, onClose, onNavigate }: Props) {
  const { isDarkMode, palette: P } = useTheme();
  const { textStyles } = useFont();
  const { user, myProviderId } = useAuth();
  const { height } = useWindowDimensions();

  const [summary, setSummary] = useState<DaySummary<BookingWithAddOns> | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Loaded fresh each time the popup opens rather than trusting the recap's
  // text, which was written at 07:00 and is stale the moment a booking moves.
  useEffect(() => {
    if (!visible || !myProviderId) return;
    let cancelled = false;
    setFailed(false);
    const today = dateToYMD(new Date());
    Promise.all([
      getProviderBookings(90, myProviderId),
      getProviderWaitlist(myProviderId),
      getProviderUnreadConversationCount(),
    ])
      .then(async ([bookings, waitlist, unreadMessages]) => {
        // Only bookings still ahead can carry a live reschedule request.
        const upcomingIds = bookings.filter(b => b.booking_date >= today).map(b => b.id);
        const requests = await getActiveRescheduleRequestsForBookings(upcomingIds);
        if (cancelled) return;
        setSummary(buildDaySummary({
          date,
          bookings,
          rescheduleRequests: Object.values(requests),
          unreadMessages,
          waitingOnWaitlist: waitlist.filter(e => e.status === 'waiting').length,
        }));
      })
      .catch(err => {
        logger.error('[DailySchedulePopup] load failed:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [visible, myProviderId, date, reloadKey]);

  const isToday = date === dateToYMD(new Date());
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? '';
  const greeting = `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ''}`;

  const headline = useMemo(() => {
    if (!summary) return '';
    const n = summary.appointments.length;
    const when = isToday ? 'today' : `on ${formatLongDate(date)}`;
    if (n === 0) return `You have no appointments ${when}.`;
    return `You have ${plural(n, 'appointment')} ${when}.`;
  }, [summary, isToday, date]);

  const todoRows = useMemo(() => {
    if (!summary) return [];
    const t = summary.todo;
    const rows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; to: DailyScheduleDestination }[] = [];
    if (t.bookingRequests > 0) rows.push({ key: 'requests', icon: 'hourglass-outline', label: `Respond to ${plural(t.bookingRequests, 'booking request')}`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    if (t.rescheduleRequests > 0) rows.push({ key: 'reschedules', icon: 'swap-horizontal-outline', label: `Answer ${plural(t.rescheduleRequests, 'reschedule request')}`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    if (t.unreadMessages > 0) rows.push({ key: 'messages', icon: 'chatbubble-ellipses-outline', label: `Reply to ${plural(t.unreadMessages, 'unread message')}`, to: { screen: 'ProviderInbox', params: { initialFilter: 'messages' } } });
    if (t.waitlist > 0) rows.push({ key: 'waitlist', icon: 'people-outline', label: `${plural(t.waitlist, 'client')} waiting on your waitlist`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    return rows;
  }, [summary]);

  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[st.card, { backgroundColor: P.card, borderColor: P.border, maxHeight: height * 0.78 }]}
        >
          <View style={st.headerRow}>
            <Text style={[textStyles.h3, st.greeting, { color: P.text }]} numberOfLines={2}>{greeting}</Text>
            <TouchableOpacity style={[st.close, { backgroundColor: P.surface }]} onPress={onClose} activeOpacity={0.7} accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={P.text} />
            </TouchableOpacity>
          </View>

          {/* No summary yet covers the first load and the brief moment before
              AuthContext has resolved the provider id. */}
          {!summary && !failed ? (
            <View style={st.centerBox}><ActivityIndicator color={P.accent} /></View>
          ) : failed ? (
            <View style={st.centerBox}>
              <Text style={[textStyles.body, { color: P.sub, textAlign: 'center' }]}>
                We couldn't load your schedule just now.
              </Text>
              <TouchableOpacity onPress={retry} activeOpacity={0.7} style={[st.retry, { borderColor: P.border }]}>
                <Text style={[textStyles.button, { color: P.accentText }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : summary ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>
              <Text style={[textStyles.body, st.headline, { color: P.sub }]}>{headline}</Text>

              {summary.appointments.length > 0 && (
                <View style={[st.section, { backgroundColor: P.surface }]}>
                  {summary.appointments.map((b, i) => {
                    const start = formatTime12Safe(b.booking_time);
                    const end = formatTime12Safe(b.end_time);
                    const awaitingReply = b.status === 'pending';
                    return (
                      <TouchableOpacity
                        key={b.id}
                        activeOpacity={0.7}
                        onPress={() => onNavigate({ screen: 'BookingDetail', params: { bookingId: b.id } })}
                        style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.sep }]}
                      >
                        <View style={st.timeCol}>
                          <Text style={[textStyles.body, st.time, { color: P.text }]}>{start ?? '—'}</Text>
                          {end && <Text style={[textStyles.caption, { color: P.sub }]}>{end}</Text>}
                        </View>
                        <View style={st.rowBody}>
                          <Text style={[textStyles.body, st.client, { color: P.text }]} numberOfLines={1}>
                            {b.customer_name?.trim() || 'Client'}
                          </Text>
                          <Text style={[textStyles.caption, { color: P.sub }]} numberOfLines={1}>
                            {b.service_name_snapshot}
                          </Text>
                          {awaitingReply && (
                            <Text style={[textStyles.caption, st.pending]}>Awaiting your reply</Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={P.sub} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={[textStyles.caption, st.sectionLabel, { color: P.sub }]}>TO DO</Text>
              {todoRows.length === 0 ? (
                <Text style={[textStyles.body, { color: P.sub }]}>Nothing else on your list — you're all caught up.</Text>
              ) : (
                <View style={[st.section, { backgroundColor: P.surface }]}>
                  {todoRows.map((r, i) => (
                    <TouchableOpacity
                      key={r.key}
                      activeOpacity={0.7}
                      onPress={() => onNavigate(r.to)}
                      style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.sep }]}
                    >
                      <View style={[st.todoIcon, { backgroundColor: P.accentDim }]}>
                        <Ionicons name={r.icon} size={16} color={P.accentText} />
                      </View>
                      <Text style={[textStyles.body, st.rowBody, { color: P.text }]}>{r.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={P.sub} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onNavigate({ screen: 'ProviderHomeMain', params: { jumpToDate: date, viewMode: 'list' } })}
                style={[st.calendarBtn, { backgroundColor: P.accent }]}
              >
                <Text style={[textStyles.button, { color: P.onAccent }]}>Open in calendar</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.12)' },
  card: { borderRadius: 24, borderWidth: 1, padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  greeting: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headline: { marginTop: 6, marginBottom: 16 },
  centerBox: { paddingVertical: 32, alignItems: 'center', gap: 14 },
  retry: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  scrollContent: { paddingBottom: 4 },
  section: { borderRadius: 16, paddingHorizontal: 14, marginBottom: 18 },
  sectionLabel: { letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  timeCol: { width: 64 },
  time: { fontWeight: '600' },
  rowBody: { flex: 1 },
  client: { fontWeight: '600' },
  pending: { color: '#B8730A', marginTop: 2 },
  todoIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calendarBtn: { marginTop: 4, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
