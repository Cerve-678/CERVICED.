import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  getProviderClientele,
  getMyPromotions,
  sendPromoToClient,
  sendRebookPrompt,
  sendAnnouncement,
  getClientBookingHistory,
  getMyProviderProfile,
} from '../services/databaseService';
import type { ClienteleMember, DbPromotion, DbBooking } from '../types/database';
import { useProviderDialog } from '../components/ProviderDialog';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  sep:     'rgba(126,102,103,0.08)',
  iconBg:  'rgba(175,145,151,0.12)',
};
const DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  sep:     'rgba(126,102,103,0.10)',
  iconBg:  'rgba(175,145,151,0.10)',
};
const DANGER = '#FF6868';
const GREEN  = '#30D158';

const AVATAR_COLORS = ['#DA70D6','#BF5AF2','#0A84FF','#30D158','#FF9F0A','#FF453A','#64D2FF','#FFD60A'];

function avatarColor(name: string) {
  let n = 0; for (const c of name) n += c.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function formatShort(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch { return iso; }
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}
function discountLabel(p: DbPromotion) {
  if (p.discount_text) return p.discount_text;
  if (p.discount_percent) return `${p.discount_percent}% OFF`;
  if (p.discount_amount) return `£${p.discount_amount} OFF`;
  return 'OFFER';
}
function isExpired(v: string) { return new Date(v) < new Date(); }

// ── Tab Bar ───────────────────────────────────────────────────────────────────

type Tab = 'all' | 'repeat' | 'new' | 'lapsed';

function TabBar({ active, onChange, counts, P }: {
  active: Tab; onChange: (t: Tab) => void; counts: Record<Tab, number>; P: typeof LIGHT;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'repeat', label: 'Repeat' },
    { key: 'new', label: 'New' }, { key: 'lapsed', label: 'Lapsed' },
  ];
  return (
    <View style={[tbSt.row, { backgroundColor: P.surface }]}>
      {tabs.map(t => (
        <TouchableOpacity key={t.key}
          style={[tbSt.tab, active === t.key && { backgroundColor: P.accent }]}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(t.key); }} activeOpacity={0.7}>
          <Text style={[tbSt.label, { color: active === t.key ? P.ice : P.sub }]}>{t.label}</Text>
          <View style={[tbSt.badge, active === t.key && { backgroundColor: P.iconBg }]}>
            <Text style={[tbSt.badgeText, { color: active === t.key ? P.ice : P.sub }]}>{counts[t.key]}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const tbSt = StyleSheet.create({
  row:      { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 4 },
  tab:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  label:    { fontSize: 12, fontWeight: '700' },
  badge:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 7 },
  badgeText:{ fontSize: 10, fontWeight: '700' },
});

// ── Promo Picker Sheet ─────────────────────────────────────────────────────────

function PromoPickerSheet({ visible, promos, clientName, onClose, onSelect, P }: {
  visible: boolean; promos: DbPromotion[]; clientName: string;
  onClose: () => void; onSelect: (p: DbPromotion) => void; P: typeof LIGHT;
}) {
  const live = promos.filter(p => p.is_active && !isExpired(p.valid_until));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ppSt.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[ppSt.sheet, { backgroundColor: P.surface }]}>
        <View style={[ppSt.handle, { backgroundColor: P.border }]} />
        <View style={ppSt.header}>
          <View>
            <Text style={[ppSt.title, { color: P.text }]}>Send Promo</Text>
            <Text style={[ppSt.sub, { color: P.sub }]}>to {clientName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>
        {live.length === 0 ? (
          <View style={ppSt.empty}>
            <Ionicons name="pricetag-outline" size={28} color={P.sub} />
            <Text style={[ppSt.emptyText, { color: P.text }]}>No live promotions</Text>
            <Text style={[ppSt.emptySub, { color: P.sub }]}>Create a promotion first to send it to clients</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {live.map(p => (
              <TouchableOpacity key={p.id} style={[ppSt.promoRow, { borderBottomColor: P.border }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onSelect(p); }}
                activeOpacity={0.7}>
                <View style={[ppSt.badge, { backgroundColor: P.accent }]}>
                  <Text style={[ppSt.badgeText, { color: P.ice }]}>{discountLabel(p)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ppSt.promoTitle, { color: P.text }]} numberOfLines={1}>{p.title}</Text>
                  {p.promo_code ? (
                    <View style={ppSt.codeRow}>
                      <Ionicons name="ticket-outline" size={10} color={P.accent} />
                      <Text style={[ppSt.codeText, { color: P.accent }]}>{p.promo_code}</Text>
                    </View>
                  ) : p.description ? (
                    <Text style={[ppSt.promoDesc, { color: P.sub }]} numberOfLines={1}>{p.description}</Text>
                  ) : null}
                </View>
                <Ionicons name="send-outline" size={14} color={P.accent} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
const ppSt = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '70%' },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700' },
  sub:        { fontSize: 12, marginTop: 2 },
  empty:      { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText:  { fontSize: 15, fontWeight: '700' },
  emptySub:   { fontSize: 12, textAlign: 'center' },
  promoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  badge:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText:  { fontSize: 11, fontWeight: '800' },
  promoTitle: { fontSize: 14, fontWeight: '600' },
  promoDesc:  { fontSize: 12, marginTop: 2 },
  codeRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  codeText:   { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
});

// ── Client History Sheet ───────────────────────────────────────────────────────

function ClientHistorySheet({ visible, member, bookings, loading, onClose, P }: {
  visible: boolean; member: ClienteleMember | null; bookings: DbBooking[];
  loading: boolean; onClose: () => void; P: typeof LIGHT;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={chSt.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[chSt.sheet, { backgroundColor: P.surface }]}>
        <View style={[chSt.handle, { backgroundColor: P.border }]} />
        <View style={chSt.header}>
          {member && (
            <View style={[chSt.avatar, { backgroundColor: avatarColor(member.customer_name) + '22', borderColor: avatarColor(member.customer_name) + '44' }]}>
              <Text style={[chSt.avatarText, { color: avatarColor(member.customer_name) }]}>{initials(member.customer_name)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[chSt.title, { color: P.text }]}>{member?.customer_name ?? ''}</Text>
            <Text style={[chSt.sub, { color: P.sub }]}>{bookings.length} booking{bookings.length !== 1 ? 's' : ''} with you</Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={chSt.center}><ActivityIndicator color={P.accent} /></View>
        ) : bookings.length === 0 ? (
          <View style={chSt.center}><Text style={[chSt.emptySub, { color: P.sub }]}>No booking history</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 504 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {bookings.map(b => {
              const statusColor = b.status === 'completed' ? GREEN
                : b.status === 'cancelled' ? DANGER : P.sub;
              return (
                <View key={b.id} style={[chSt.bookingRow, { borderBottomColor: P.border }]}>
                  <View style={[chSt.dateBadge, { backgroundColor: P.card }]}>
                    <Text style={[chSt.dateDay, { color: P.text }]}>{new Date(b.booking_date).getDate()}</Text>
                    <Text style={[chSt.dateMon, { color: P.sub }]}>{new Date(b.booking_date).toLocaleString('en-GB', { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[chSt.svcName, { color: P.text }]} numberOfLines={1}>{b.service_name_snapshot}</Text>
                    <Text style={[chSt.timeText, { color: P.sub }]}>{b.booking_time?.substring(0, 5)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[chSt.amount, { color: P.text }]}>£{(b.base_price + b.add_ons_total).toFixed(0)}</Text>
                    <View style={[chSt.statusPill, { backgroundColor: statusColor + '22' }]}>
                      <Text style={[chSt.statusText, { color: statusColor }]}>{b.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
const chSt = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:       { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%' },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar:      { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '700' },
  title:       { fontSize: 18, fontWeight: '700' },
  sub:         { fontSize: 12, marginTop: 2 },
  center:      { paddingVertical: 32, alignItems: 'center' },
  emptySub:    { fontSize: 14 },
  bookingRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dateBadge:   { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateDay:     { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  dateMon:     { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  svcName:     { fontSize: 14, fontWeight: '600' },
  timeText:    { fontSize: 12, marginTop: 2 },
  amount:      { fontSize: 13, fontWeight: '700' },
  statusPill:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});

// ── Announcement Sheet ────────────────────────────────────────────────────────

type AudienceKey = 'all' | 'repeat' | 'new' | 'lapsed';

function AnnouncementSheet({ visible, counts, clients, onClose, onSent, onError, P }: {
  visible: boolean;
  counts: Record<AudienceKey, number>;
  clients: ClienteleMember[];
  onClose: () => void;
  onSent: (count: number) => void;
  onError: (msg: string) => void;
  P: typeof LIGHT;
}) {
  const [audience, setAudience] = useState<AudienceKey>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const audienceOptions: { key: AudienceKey; label: string; icon: string }[] = [
    { key: 'all',    label: 'All clients',    icon: 'people-outline' },
    { key: 'repeat', label: 'Repeat clients', icon: 'repeat-outline' },
    { key: 'new',    label: 'New clients',    icon: 'sparkles-outline' },
    { key: 'lapsed', label: 'Lapsed (60d+)',  icon: 'time-outline' },
  ];

  const recipientIds = (): string[] => {
    if (audience === 'all')    return clients.map(c => c.user_id);
    if (audience === 'repeat') return clients.filter(c => c.booking_count >= 2).map(c => c.user_id);
    if (audience === 'new')    return clients.filter(c => c.booking_count === 1).map(c => c.user_id);
    return clients.filter(c => daysSince(c.last_booking_date) > 60).map(c => c.user_id);
  };

  const recipientCount = counts[audience];
  const canSend = title.trim().length > 0 && body.trim().length > 0 && recipientCount > 0 && !sending;

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setErrorMsg('');
    setSending(true);
    try {
      const ids = recipientIds();
      const { sent } = await sendAnnouncement(title.trim(), body.trim(), ids);
      setTitle('');
      setBody('');
      setAudience('all');
      onSent(sent);
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={anSt.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[anSt.sheet, { backgroundColor: P.surface }]}>
          <View style={[anSt.handle, { backgroundColor: P.border }]} />
          <View style={anSt.header}>
            <View>
              <Text style={[anSt.title, { color: P.text }]}>New Announcement</Text>
              <Text style={[anSt.sub, { color: P.sub }]}>{recipientCount} client{recipientCount !== 1 ? 's' : ''} will receive this</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={P.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={[anSt.label, { color: P.sub }]}>AUDIENCE</Text>
            <View style={anSt.audienceRow}>
              {audienceOptions.map(opt => {
                const active = audience === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[anSt.audienceChip, { borderColor: active ? P.accent : P.border, backgroundColor: active ? P.accent + '18' : 'transparent' }]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setAudience(opt.key); }}
                    activeOpacity={0.7}>
                    <Ionicons name={opt.icon as any} size={12} color={active ? P.accent : P.sub} />
                    <Text style={[anSt.audienceLabel, { color: active ? P.accent : P.sub }]}>{opt.label}</Text>
                    <View style={[anSt.countBadge, { backgroundColor: active ? P.accent + '30' : P.border }]}>
                      <Text style={[anSt.countText, { color: active ? P.accent : P.sub }]}>{counts[opt.key]}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[anSt.label, { color: P.sub }]}>TITLE</Text>
            <TextInput
              style={[anSt.input, { backgroundColor: P.card, color: P.text, borderColor: P.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. New availability this weekend"
              placeholderTextColor={P.sub}
              maxLength={80}
            />

            <Text style={[anSt.label, { color: P.sub }]}>MESSAGE</Text>
            <TextInput
              style={[anSt.input, anSt.textArea, { backgroundColor: P.card, color: P.text, borderColor: P.border }]}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message to clients..."
              placeholderTextColor={P.sub}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={[anSt.charCount, { color: P.sub }]}>{body.length}/300</Text>

            <TouchableOpacity
              style={[anSt.sendBtn, { backgroundColor: canSend ? P.accent : P.border }]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.8}>
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="megaphone-outline" size={16} color="#fff" />
                  <Text style={anSt.sendBtnText}>Send to {recipientCount} client{recipientCount !== 1 ? 's' : ''}</Text>
                </>
              )}
            </TouchableOpacity>
            {!!errorMsg && (
              <Text style={anSt.errorText}>{errorMsg}</Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const anSt = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, maxHeight: '85%' },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title:        { fontSize: 18, fontWeight: '700' },
  sub:          { fontSize: 12, marginTop: 2 },
  label:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  audienceRow:  { gap: 8 },
  audienceChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  audienceLabel:{ fontSize: 13, fontWeight: '600', flex: 1 },
  countBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  countText:    { fontSize: 11, fontWeight: '700' },
  input:        { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  textArea:     { minHeight: 100, marginTop: 0 },
  charCount:    { fontSize: 11, textAlign: 'right', marginTop: 5 },
  sendBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  sendBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  errorText:    { fontSize: 13, color: '#FF6868', textAlign: 'center', marginTop: 10 },
});

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ member, onSendPromo, onRebook, onViewHistory, lapsed, P }: {
  member: ClienteleMember;
  onSendPromo: (m: ClienteleMember) => void;
  onRebook: (m: ClienteleMember) => void;
  onViewHistory: (m: ClienteleMember) => void;
  lapsed?: boolean;
  P: typeof LIGHT;
}) {
  const color = avatarColor(member.customer_name);
  const days = daysSince(member.last_booking_date);

  return (
    <TouchableOpacity style={[ccSt.wrap, { backgroundColor: P.surface }]} onPress={() => onViewHistory(member)} activeOpacity={0.8}>
      <View style={[ccSt.avatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <Text style={[ccSt.avatarText, { color }]}>{initials(member.customer_name)}</Text>
      </View>
      <View style={ccSt.info}>
        <View style={ccSt.nameRow}>
          <Text style={[ccSt.name, { color: P.text }]} numberOfLines={1}>{member.customer_name}</Text>
          {lapsed && (
            <View style={ccSt.lapsedBadge}>
              <Text style={[ccSt.lapsedText, { color: DANGER }]}>{days}d ago</Text>
            </View>
          )}
        </View>
        <Text style={[ccSt.meta, { color: P.sub }]}>
          {member.booking_count} {member.booking_count === 1 ? 'booking' : 'bookings'} · Last {formatShort(member.last_booking_date)}
        </Text>
      </View>
      <View style={ccSt.right}>
        {member.total_spent > 0 && (
          <Text style={[ccSt.spend, { color: P.text }]}>£{member.total_spent.toFixed(0)}</Text>
        )}
        <View style={ccSt.actions}>
          {lapsed && (
            <TouchableOpacity style={[ccSt.btn, { borderColor: GREEN + '60', borderWidth: StyleSheet.hairlineWidth }]}
              onPress={e => { e.stopPropagation(); Haptics.selectionAsync().catch(() => {}); onRebook(member); }}
              activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={11} color={GREEN} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[ccSt.btn, { borderColor: P.border }]}
            onPress={e => { e.stopPropagation(); Haptics.selectionAsync().catch(() => {}); onSendPromo(member); }}
            activeOpacity={0.7}>
            <Ionicons name="pricetag-outline" size={11} color={P.accent} />
            <Text style={[ccSt.btnText, { color: P.accent }]}>Promo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const ccSt = StyleSheet.create({
  wrap:        { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, gap: 12 },
  avatar:      { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '700' },
  info:        { flex: 1 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:        { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta:        { fontSize: 12, marginTop: 2 },
  right:       { alignItems: 'flex-end', gap: 5 },
  spend:       { fontSize: 12, fontWeight: '700' },
  actions:     { flexDirection: 'row', gap: 6 },
  btn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  btnText:     { fontSize: 11, fontWeight: '700' },
  lapsedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,104,104,0.15)' },
  lapsedText:  { fontSize: 10, fontWeight: '600' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProviderClienteleScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const [clients, setClients] = useState<ClienteleMember[]>([]);
  const [promos, setPromos] = useState<DbPromotion[]>([]);
  const [providerName, setProviderName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [promoPickerFor, setPromoPickerFor] = useState<ClienteleMember | null>(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<ClienteleMember | null>(null);
  const [historyBookings, setHistoryBookings] = useState<DbBooking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { showToast, DialogHost } = useProviderDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, promoData, profile] = await Promise.all([
        getProviderClientele(),
        getMyPromotions(),
        getMyProviderProfile(),
      ]);
      setClients(data);
      setPromos(promoData);
      setProviderName(profile?.display_name ?? '');
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch (e: any) {
      showToast(e.message ?? 'Could not load clientele', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fadeAnim.setValue(0);
    load();
  }, [load]));

  const repeatClients = clients.filter(c => c.booking_count >= 2);
  const newClients    = clients.filter(c => c.booking_count === 1);
  const lapsedClients = clients.filter(c => daysSince(c.last_booking_date) > 60);
  const displayed = tab === 'all' ? clients : tab === 'repeat' ? repeatClients : tab === 'new' ? newClients : lapsedClients;
  const counts = { all: clients.length, repeat: repeatClients.length, new: newClients.length, lapsed: lapsedClients.length };

  const handleSendPromo = async (promo: DbPromotion) => {
    if (!promoPickerFor) return;
    const client = promoPickerFor;
    setPromoPickerFor(null);
    try {
      await sendPromoToClient(promo, client.user_id);
      showToast(`Promo sent to ${client.customer_name}`);
    } catch (e: any) {
      showToast(e.message ?? 'Could not send promo', 'error');
    }
  };

  const handleAnnouncementSent = (count: number) => {
    setAnnouncementOpen(false);
    showToast(`Announcement sent to ${count} client${count !== 1 ? 's' : ''}`);
  };

  const handleRebook = async (member: ClienteleMember) => {
    try {
      await sendRebookPrompt(member.user_id, providerName);
      showToast(`Rebook nudge sent to ${member.customer_name}`);
    } catch (e: any) {
      showToast(e.message ?? 'Could not send rebook prompt', 'error');
    }
  };

  const handleViewHistory = async (member: ClienteleMember) => {
    setHistoryFor(member);
    setHistoryBookings([]);
    setHistoryLoading(true);
    try {
      const data = await getClientBookingHistory(member.user_id);
      setHistoryBookings(data);
    } catch (e: any) {
      showToast(e.message ?? 'Could not load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <ThemedBackground style={{ flex: 1 }}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={P.accent} size="large" />
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <View>
            <Text style={[s.headerTitle, { color: P.text }]}>My Clientele</Text>
            <Text style={[s.headerSub, { color: P.sub }]}>{clients.length} client{clients.length !== 1 ? 's' : ''} · {repeatClients.length} repeat</Text>
          </View>
          <View style={s.headerActions}>
            {clients.length > 0 && (
              <TouchableOpacity
                style={[s.announceBtn, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setAnnouncementOpen(true); }}
                activeOpacity={0.7}>
                <Ionicons name="megaphone-outline" size={15} color={P.accent} />
                <Text style={[s.announceBtnText, { color: P.accent }]}>Announce</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: P.surface }]} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={22} color={P.sub} />
            </TouchableOpacity>
          </View>
        </View>

        <TabBar active={tab} onChange={setTab} counts={counts} P={P} />

        <Animated.View style={[s.list, { opacity: fadeAnim }]}>
          {tab === 'lapsed' && lapsedClients.length > 0 && (
            <View style={s.lapsedBanner}>
              <Ionicons name="time-outline" size={13} color={DANGER} />
              <Text style={[s.lapsedBannerText, { color: DANGER }]}>
                {lapsedClients.length} client{lapsedClients.length > 1 ? 's' : ''} haven't booked in 60+ days
              </Text>
            </View>
          )}
          {displayed.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: P.surface }]}>
                <Ionicons name="people-outline" size={36} color={P.sub} />
              </View>
              <Text style={[s.emptyTitle, { color: P.text }]}>
                {tab === 'repeat' ? 'No repeat clients yet' : tab === 'new' ? 'No new clients'
                  : tab === 'lapsed' ? 'No lapsed clients' : 'No clients yet'}
              </Text>
              <Text style={[s.emptySub, { color: P.sub }]}>
                {tab === 'repeat' ? 'Clients who book twice or more will appear here'
                  : tab === 'new' ? 'First-time bookers will appear here'
                  : tab === 'lapsed' ? 'Clients inactive for 60+ days appear here'
                  : 'Clients who complete a booking will appear here'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayed}
              keyExtractor={item => item.user_id}
              renderItem={({ item }) => (
                <ClientCard
                  member={item}
                  lapsed={tab === 'lapsed' || daysSince(item.last_booking_date) > 60}
                  onSendPromo={m => setPromoPickerFor(m)}
                  onRebook={handleRebook}
                  onViewHistory={handleViewHistory}
                  P={P}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.listContent}
            />
          )}
        </Animated.View>
      </SafeAreaView>

      <AnnouncementSheet
        visible={announcementOpen}
        counts={counts}
        clients={clients}
        onClose={() => setAnnouncementOpen(false)}
        onSent={handleAnnouncementSent}
        onError={msg => showToast(msg, 'error')}
        P={P}
      />

      <PromoPickerSheet
        visible={promoPickerFor !== null}
        promos={promos}
        clientName={promoPickerFor?.customer_name ?? ''}
        onClose={() => setPromoPickerFor(null)}
        onSelect={handleSendPromo}
        P={P}
      />

      <ClientHistorySheet
        visible={historyFor !== null}
        member={historyFor}
        bookings={historyBookings}
        loading={historyLoading}
        onClose={() => setHistoryFor(null)}
        P={P}
      />

      <DialogHost />
    </ThemedBackground>
  );
}

const s = StyleSheet.create({
  root:             { flex: 1 },
  safe:             { flex: 1 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerTitle:      { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  headerSub:        { fontSize: 12, fontWeight: '500', marginTop: 2 },
  headerActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  announceBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  announceBtnText:  { fontSize: 12, fontWeight: '700' },
  closeBtn:         { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  list:             { flex: 1 },
  listContent:      { paddingHorizontal: 16, paddingBottom: 40 },
  lapsedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,104,104,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  lapsedBannerText: { fontSize: 12, flex: 1, fontWeight: '500' },
  empty:            { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 14, paddingHorizontal: 32 },
  emptyIcon:        { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:       { fontSize: 18, fontWeight: '700' },
  emptySub:         { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
