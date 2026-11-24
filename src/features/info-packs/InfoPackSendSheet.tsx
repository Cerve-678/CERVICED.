import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BookingWithAddOns } from '../../types/database';
import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';
import { BAKBAK, type InfoPackPalette } from './infoPackPalette';
import { packServiceLabel } from './infoPackLogic';

export interface SendSheetPack {
  id: string;
  title: string;
  serviceNames: string[];
}

// Sends by attaching the pack to one real booking (attach_info_pack_to_booking
// — the same booking_info_packs row + notification the DB triggers create).
// Upcoming bookings only, the ones the pack is for first; the rest sit under
// their own tab for the times a pack helps a different service too.

export function InfoPackSendSheet({
  pack, visible, P, matching, other, sentBookingIds, loading, error, sendingBookingId,
  onRetry, onPickBooking, onClose,
}: {
  pack: SendSheetPack | null;
  visible: boolean;
  P: InfoPackPalette;
  matching: BookingWithAddOns[];
  other: BookingWithAddOns[];
  sentBookingIds: ReadonlySet<string>;
  loading: boolean;
  error: boolean;
  sendingBookingId: string | null;
  onRetry: () => void;
  onPickBooking: (booking: BookingWithAddOns) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(520)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [tab, setTab] = useState<'matching' | 'other'>('matching');
  // Keep the pack while the close animation runs; the parent clears it on the
  // same tick it hides the sheet.
  const [shown, setShown] = useState<SendSheetPack | null>(pack);

  useEffect(() => {
    if (visible) {
      setShown(pack);
      setTab('matching');
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 520, duration: 200, useNativeDriver: true }),
      ]).start(() => setShown(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const rows = tab === 'matching' ? matching : other;
  const hint = useMemo(() => {
    if (!shown) return '';
    if (tab === 'other') return 'Booked for other services. Send it anyway if it helps.';
    return shown.serviceNames.length === 0
      ? 'Every upcoming booking.'
      : `Booked for ${shown.serviceNames.join(', ')}.`;
  }, [shown, tab]);

  if (!visible && !shown) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[st.overlay, { opacity: fade }]} pointerEvents={visible ? 'auto' : 'none'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[st.sheet, {
            backgroundColor: P.card,
            borderColor: P.border,
            paddingBottom: Math.max(28, insets.bottom + 16),
            transform: [{ translateY: slide }],
          }]}
        >
          <View style={[st.handle, { backgroundColor: P.border }]} />
          <Text style={[st.title, { color: P.text }]}>Send Info Pack</Text>
          {shown && (
            <Text style={[st.packName, { color: P.sub }]} numberOfLines={1}>
              {shown.title} · {packServiceLabel(shown.serviceNames)}
            </Text>
          )}

          <View style={[st.tabs, { backgroundColor: P.surface }]}>
            {(['matching', 'other'] as const).map(key => {
              const active = tab === key;
              const count = key === 'matching' ? matching.length : other.length;
              return (
                <TouchableOpacity
                  key={key}
                  style={[st.tab, active && { backgroundColor: P.card, shadowColor: P.shadow }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (tab === key) return;
                    Haptics.selectionAsync().catch(() => {});
                    setTab(key);
                  }}
                >
                  <Text style={[st.tabText, { color: active ? P.text : P.sub }]}>
                    {key === 'matching' ? 'Matching' : 'Other upcoming'}{loading || error ? '' : ` ${count}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={st.state}><ActivityIndicator color={P.accent} /></View>
          ) : error ? (
            <View style={st.state}>
              <Text style={[st.stateText, { color: P.sub }]}>Couldn't load your bookings.</Text>
              <TouchableOpacity onPress={onRetry} activeOpacity={0.7} style={[st.retry, { backgroundColor: P.iconBg }]}>
                <Text style={[st.retryText, { color: P.accent }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[st.hint, { color: P.sub }]}>{hint}</Text>
              {rows.length === 0 ? (
                <View style={st.state}>
                  <Text style={[st.stateText, { color: P.sub }]}>
                    {tab === 'matching' ? 'No upcoming bookings for these services yet.' : 'No other upcoming bookings.'}
                  </Text>
                </View>
              ) : (
                <ScrollView style={st.list} showsVerticalScrollIndicator={false}>
                  {rows.map(b => {
                    const sent = sentBookingIds.has(b.id);
                    const isSending = sendingBookingId === b.id;
                    const name = b.customer_name || 'Client';
                    const time = formatTime12Safe(b.booking_time);
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[st.row, { borderBottomColor: P.border, opacity: sendingBookingId && !isSending ? 0.5 : 1 }]}
                        activeOpacity={0.7}
                        disabled={sent || !!sendingBookingId}
                        onPress={() => onPickBooking(b)}
                        accessibilityLabel={sent ? `${name}, already sent` : `Send to ${name}`}
                      >
                        <View style={[st.avatar, { backgroundColor: P.iconBg }]}>
                          <Text style={[st.avatarText, { color: P.accent }]}>{name.trim().charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.client, { color: P.text }]} numberOfLines={1}>{name}</Text>
                          <Text style={[st.meta, { color: P.sub }]} numberOfLines={1}>
                            {b.service_name_snapshot} · {formatShortDayDate(b.booking_date)}{time ? `, ${time}` : ''}
                          </Text>
                        </View>
                        {isSending ? (
                          <ActivityIndicator size="small" color={P.accent} />
                        ) : sent ? (
                          <View style={st.sent}>
                            <Ionicons name="checkmark" size={14} color={P.sub} />
                            <Text style={[st.sentText, { color: P.sub }]}>Sent</Text>
                          </View>
                        ) : (
                          <Ionicons name="paper-plane-outline" size={18} color={P.accent} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, maxHeight: '78%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  title: { fontFamily: BAKBAK, fontSize: 20, letterSpacing: -0.2 },
  packName: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  tabs: { flexDirection: 'row', borderRadius: 100, padding: 3, marginBottom: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 100, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  tabText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, marginBottom: 4, marginLeft: 2 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  client: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sentText: { fontSize: 13, fontWeight: '600' },
  state: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  stateText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retry: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100 },
  retryText: { fontSize: 13, fontWeight: '700' },
});
