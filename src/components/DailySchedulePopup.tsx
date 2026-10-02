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
import { useAuth } from '../contexts/AuthContext';
import {
  getProviderBookings,
  getProviderWaitlist,
  getProviderUnreadConversationCount,
  getActiveRescheduleRequestsForBookings,
} from '../services/databaseService';
import type { BookingWithAddOns } from '../types/database';
import { buildDaySummary, greetingFor, type DaySummary } from '../utils/daySummary';
import { dateToYMD, formatLongDateNoYear, formatTime12Safe } from '../utils/dateUtils';
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

  // "First at 9:00am · done by 4:30pm" under the big count. The finish is the
  // latest end time on the day, not the last start, so a long final service
  // still reads right; left off when no booking on the day has an end time.
  const span = useMemo(() => {
    const appts = summary?.appointments ?? [];
    if (appts.length === 0) return null;
    const first = formatTime12Safe(appts[0]!.booking_time);
    const lastEnd = appts.map(b => b.end_time).filter((t): t is string => !!t).sort().pop();
    const end = formatTime12Safe(lastEnd);
    if (!first) return null;
    return end ? `First at ${first} · done by ${end}` : `First at ${first}`;
  }, [summary]);

  const todoRows = useMemo(() => {
    if (!summary) return [];
    const t = summary.todo;
    const rows: { key: string; label: string; to: DailyScheduleDestination }[] = [];
    if (t.bookingRequests > 0) rows.push({ key: 'requests', label: `Respond to ${plural(t.bookingRequests, 'booking request')}`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    if (t.rescheduleRequests > 0) rows.push({ key: 'reschedules', label: `Answer ${plural(t.rescheduleRequests, 'reschedule request')}`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    if (t.unreadMessages > 0) rows.push({ key: 'messages', label: `Reply to ${plural(t.unreadMessages, 'unread message')}`, to: { screen: 'ProviderInbox', params: { initialFilter: 'messages' } } });
    if (t.waitlist > 0) rows.push({ key: 'waitlist', label: `${plural(t.waitlist, 'client')} waiting on your waitlist`, to: { screen: 'BookingHistory', params: { initialTab: 'todo' } } });
    return rows;
  }, [summary]);

  const retry = useCallback(() => setReloadKey(k => k + 1), []);
  const count = summary?.appointments.length ?? 0;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[st.card, { backgroundColor: P.bg, maxHeight: height * 0.82 }]}
        >
          {/* ── Header: date, greeting, the day's count ── */}
          <View style={[st.header, { backgroundColor: P.accent }]}>
            <View style={st.headerTop}>
              <View style={st.flex}>
                <Text style={[st.dateLabel, { color: P.onAccent }]}>
                  {formatLongDateNoYear(date).toUpperCase()}
                </Text>
                <Text style={[st.greeting, { color: P.onAccent }]} numberOfLines={2}>{greeting}</Text>
              </View>
              <TouchableOpacity style={st.close} onPress={onClose} activeOpacity={0.7} accessibilityLabel="Close">
                <Ionicons name="close" size={18} color={P.onAccent} />
              </TouchableOpacity>
            </View>
            {summary && (
              <View style={st.countRow}>
                <Text style={[st.count, { color: P.onAccent }]}>{count}</Text>
                <View style={st.flex}>
                  <Text style={[st.countLabel, { color: P.onAccent }]}>
                    {count === 1 ? 'appointment' : 'appointments'} {isToday ? 'today' : 'on this day'}
                  </Text>
                  {span && <Text style={[st.countSub, { color: P.onAccent }]}>{span}</Text>}
                </View>
              </View>
            )}
          </View>

          {/* No summary yet covers the first load and the brief moment before
              AuthContext has resolved the provider id. */}
          {!summary && !failed ? (
            <View style={st.centerBox}><ActivityIndicator color={P.accent} /></View>
          ) : failed ? (
            <View style={st.centerBox}>
              <Text style={[st.body, { color: P.sub, textAlign: 'center' }]}>
                We couldn't load your schedule just now.
              </Text>
              <TouchableOpacity onPress={retry} activeOpacity={0.7} style={[st.retry, { borderColor: P.border }]}>
                <Text style={[st.body, st.bold, { color: P.accentText }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : summary ? (
            <ScrollView style={st.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>
              {/* ── Clients, as a timeline of the day ── */}
              {count === 0 ? (
                <Text style={[st.body, { color: P.sub, marginBottom: 18 }]}>Nothing booked {isToday ? 'today' : 'on this day'}.</Text>
              ) : (
                <View style={st.timeline}>
                  {summary.appointments.map((b, i) => {
                    const start = formatTime12Safe(b.booking_time);
                    const end = formatTime12Safe(b.end_time);
                    const isLast = i === summary.appointments.length - 1;
                    return (
                      <View key={b.id} style={st.tlRow}>
                        <View style={st.tlTime}>
                          <Text style={[st.body, st.bold, { color: P.text }]}>{start ?? '—'}</Text>
                          {end && <Text style={[st.small, { color: P.sub }]}>{end}</Text>}
                        </View>
                        <View style={st.tlRail}>
                          <View style={[st.tlDot, { backgroundColor: P.accent, borderColor: P.surface }]} />
                          {!isLast && <View style={[st.tlLine, { backgroundColor: P.accentDim }]} />}
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => onNavigate({ screen: 'BookingDetail', params: { bookingId: b.id } })}
                          style={[st.tlCard, { backgroundColor: P.card }]}
                        >
                          <View style={st.flex}>
                            <Text style={[st.name, { color: P.text }]} numberOfLines={1}>
                              {b.customer_name?.trim() || 'Client'}
                            </Text>
                            <Text style={[st.small, { color: P.sub }]} numberOfLines={1}>{b.service_name_snapshot}</Text>
                            {b.status === 'pending' && (
                              <View style={[st.pendingPill, { backgroundColor: isDarkMode ? '#3D2E10' : '#FBF1E0' }]}>
                                <Text style={[st.pendingText, { color: isDarkMode ? '#E0A440' : '#9A5B06' }]}>Awaiting your reply</Text>
                              </View>
                            )}
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={P.sub} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── To do, as a checklist ── */}
              <View style={[st.todoBox, { backgroundColor: P.card }]}>
                <Text style={[st.sectionLabel, { color: P.sub }]}>TO DO</Text>
                {todoRows.length === 0 ? (
                  <Text style={[st.body, { color: P.sub, paddingBottom: 14 }]}>Nothing else on your list — you're all caught up.</Text>
                ) : todoRows.map(r => (
                  <TouchableOpacity
                    key={r.key}
                    activeOpacity={0.7}
                    onPress={() => onNavigate(r.to)}
                    style={[st.todoRow, { borderTopColor: P.sep }]}
                  >
                    <View style={[st.checkbox, { borderColor: P.accent }]} />
                    <Text style={[st.body, st.bold, st.flex, { color: P.text }]}>{r.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={P.sub} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : null}

          <View style={st.footer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onNavigate({ screen: 'ProviderHomeMain', params: { jumpToDate: date, viewMode: 'list' } })}
              style={[st.calendarBtn, { backgroundColor: P.accent }]}
            >
              <Text style={[st.calendarText, { color: P.onAccent }]}>OPEN IN CALENDAR</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const DISPLAY = 'BakbakOne-Regular';
const BODY = 'Jura-VariableFont_wght';

const st = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(40,30,24,0.18)' },
  card: { borderRadius: 30, overflow: 'hidden' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dateLabel: { fontFamily: BODY, fontSize: 13, fontWeight: '600', letterSpacing: 1.5, opacity: 0.75 },
  greeting: { fontFamily: DISPLAY, fontSize: 28, lineHeight: 32, marginTop: 6 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  count: { fontFamily: DISPLAY, fontSize: 64, lineHeight: 64 },
  countLabel: { fontFamily: BODY, fontSize: 16, fontWeight: '600' },
  countSub: { fontFamily: BODY, fontSize: 14, opacity: 0.75, marginTop: 2, marginBottom: 6 },
  centerBox: { paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', gap: 14 },
  retry: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18 },
  body: { fontFamily: BODY, fontSize: 15 },
  bold: { fontWeight: '700' },
  small: { fontFamily: BODY, fontSize: 13, marginTop: 2 },
  name: { fontFamily: BODY, fontSize: 16, fontWeight: '700' },
  timeline: { marginBottom: 6 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlTime: { width: 62, alignItems: 'flex-end', paddingTop: 12 },
  tlRail: { alignItems: 'center', paddingTop: 15 },
  tlDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  tlLine: { width: 2, flex: 1, marginTop: 4 },
  tlCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  pendingPill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pendingText: { fontFamily: BODY, fontSize: 12, fontWeight: '700' },
  todoBox: { borderRadius: 18, paddingHorizontal: 14, marginBottom: 16 },
  sectionLabel: { fontFamily: DISPLAY, fontSize: 13, letterSpacing: 1.5, paddingTop: 14, paddingBottom: 8 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2 },
  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  calendarBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  calendarText: { fontFamily: DISPLAY, fontSize: 15, letterSpacing: 1 },
});
