import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Keyboard,
  Animated,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useProviderDialog } from '../components/ProviderDialog';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import {
  getMyPromotions,
  upsertPromotion,
  patchPromotion,
  togglePromotion,
  deletePromotion,
  getProviderClientele,
  getMyProviderServices,
  sendPromotionNotificationsToClients,
  markScheduledNotifSent,
  type UpsertPromotionInput,
} from '../services/databaseService';
import type { DbPromotion, ClienteleMember, DbService } from '../types/database';
import { supabase } from '../lib/supabase';

const { width: SW } = Dimensions.get('window');

// ── Brand Palette ──────────────────────────────────────────────────────────────
// Static fallback used for StyleSheet.create (always dark variant for now,
// overridden at render time via P where needed)
const CP_DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  sep:     'rgba(126,102,103,0.10)',
  danger:  '#FF6868',
  warn:    '#AF9197',
};
const CP_LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  sep:     'rgba(126,102,103,0.08)',
  danger:  '#FF6868',
  warn:    '#AF9197',
};
// CP used for static StyleSheet values — dark variant as fallback
const CP = CP_DARK;

const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER'];

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'flash',
    name: 'Flash Sale',
    tagline: 'Limited time discount',
    icon: 'flash-outline' as const,
    gradient: ['#C0392B', '#922B21'] as [string, string],
    prefill: { title: 'Flash Sale', description: "Limited time only — book before it's gone!", discountType: 'percent' as const, discountPercent: '20' },
  },
  {
    id: 'loyalty',
    name: 'Loyalty Reward',
    tagline: 'Reward your regulars',
    icon: 'star-outline' as const,
    gradient: ['#5B1E32', '#3D1420'] as [string, string],
    prefill: { title: 'Loyalty Reward', description: 'A thank you to our valued clients — you deserve it.', discountType: 'percent' as const, discountPercent: '15' },
  },
  {
    id: 'new_client',
    name: 'New Client',
    tagline: 'Attract first-timers',
    icon: 'person-add-outline' as const,
    gradient: ['#1A5C4E', '#0D3D34'] as [string, string],
    prefill: { title: 'New Client Welcome', description: 'Special offer for first-time bookings.', discountType: 'percent' as const, discountPercent: '10' },
  },
  {
    id: 'seasonal',
    name: 'Seasonal Special',
    tagline: 'Season-themed offer',
    icon: 'sparkles-outline' as const,
    gradient: ['#4A1942', '#2E0F28'] as [string, string],
    prefill: { title: 'Seasonal Special', description: 'Make the most of the season with an exclusive offer.', discountType: 'text' as const, discountText: 'Special Rate' },
  },
  {
    id: 'bundle',
    name: 'Bundle Deal',
    tagline: 'Book more, save more',
    icon: 'gift-outline' as const,
    gradient: ['#1A3A5C', '#0D2240'] as [string, string],
    prefill: { title: 'Bundle & Save', description: 'Book multiple services and save.', discountType: 'text' as const, discountText: 'Bundle Offer' },
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'Start from scratch',
    icon: 'create-outline' as const,
    gradient: ['#3D2230', '#2A1520'] as [string, string],
    prefill: { title: '', description: '', discountType: 'text' as const, discountText: '' },
  },
] as const;


// ── Helpers ────────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().substring(0, 10); }
function isExpired(validUntil: string) { return new Date(validUntil) < new Date(); }
function isUpcoming(validFrom: string) { return new Date(validFrom) > new Date(); }

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function discountLabel(p: DbPromotion) {
  if (p.discount_text) return p.discount_text;
  if (p.discount_percent) return `${p.discount_percent}% OFF`;
  if (p.discount_amount) return `£${p.discount_amount} OFF`;
  return 'OFFER';
}

async function uploadPromoImage(uri: string): Promise<string | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('promotion-images')
      .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('promotion-images').getPublicUrl(data.path);
    return publicUrl;
  } catch { return null; }
}

// ── Tab Bar ────────────────────────────────────────────────────────────────────

type PromoTab = 'live' | 'upcoming' | 'past';

function PromoTabBar({ active, onChange, counts, P }: {
  active: PromoTab;
  onChange: (t: PromoTab) => void;
  counts: Record<PromoTab, number>;
  P: typeof CP_LIGHT;
}) {
  const tabs: { key: PromoTab; label: string }[] = [
    { key: 'live', label: 'Live' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ];
  return (
    <View style={[tabSt.row, { backgroundColor: P.surface }]}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[tabSt.tab, active === t.key && [tabSt.tabActive, { backgroundColor: P.accent }]]}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(t.key); }}
          activeOpacity={0.7}
        >
          <Text style={[tabSt.label, { color: active === t.key ? P.ice : P.sub }]}>
            {t.label}
          </Text>
          {counts[t.key] > 0 && (
            <View style={[tabSt.dot, { backgroundColor: active === t.key ? P.ice : P.sub }]} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tabSt = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: {},
  label: { fontSize: 14, fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});

// ── Promo Card ─────────────────────────────────────────────────────────────────

function PromoCard({ promo, services, onToggle, onEdit, onDelete, onNotify, onDuplicate, onExtend }: {
  promo: DbPromotion;
  services: DbService[];
  onToggle: (id: string, active: boolean) => void;
  onEdit: (p: DbPromotion) => void;
  onDelete: (id: string) => void;
  onNotify: (p: DbPromotion) => void;
  onDuplicate: (p: DbPromotion) => void;
  onExtend: (p: DbPromotion) => void;
}) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  const expired = isExpired(promo.valid_until);
  const upcoming = isUpcoming(promo.valid_from);
  const badge = discountLabel(promo);

  return (
    <View style={[pcSt.wrap, { backgroundColor: C.surface }]}>
      {/* Banner */}
      <View>
        {promo.image_url ? (
          <Image source={{ uri: promo.image_url }} style={pcSt.image} resizeMode="cover" />
        ) : (
          <View style={[pcSt.banner, { backgroundColor: C.card }]}>
            <Ionicons name="pricetag-outline" size={26} color={C.sub} />
          </View>
        )}
        <View style={pcSt.bannerOverlay}>
          <View style={pcSt.discountBadge}>
            <Text style={pcSt.discountText}>{badge}</Text>
          </View>
          {promo.service_category && (
            <View style={pcSt.catBadge}>
              <Text style={[pcSt.catBadgeText, { color: '#FFFFFF' }]}>{promo.service_category}</Text>
            </View>
          )}
          {expired && (
            <View style={[pcSt.statusBadge, { backgroundColor: 'rgba(255,104,104,0.25)' }]}>
              <Text style={[pcSt.statusBadgeText, { color: C.danger }]}>EXPIRED</Text>
            </View>
          )}
          {upcoming && !expired && (
            <View style={[pcSt.statusBadge, { backgroundColor: 'rgba(175,145,151,0.25)' }]}>
              <Text style={[pcSt.statusBadgeText, { color: C.accent }]}>UPCOMING</Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={pcSt.content}>
        <View style={pcSt.titleRow}>
          <Text style={[pcSt.title, { color: C.text }]} numberOfLines={2}>{promo.title}</Text>
          <Switch
            value={promo.is_active && !expired}
            onValueChange={v => {
              if (expired) return;
              Haptics.selectionAsync().catch(() => {});
              onToggle(promo.id, v);
            }}
            trackColor={{ false: C.border, true: C.accent }}
            thumbColor={C.ice}
            disabled={expired}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>

        {promo.description ? (
          <Text style={[pcSt.desc, { color: C.sub }]} numberOfLines={2}>{promo.description}</Text>
        ) : null}

        <Text style={[pcSt.date, { color: expired ? C.danger : C.sub }]}>
          {expired
            ? `Expired ${formatDate(promo.valid_until)}`
            : upcoming
            ? `Starts ${formatDate(promo.valid_from)} · Ends ${formatDate(promo.valid_until)}`
            : `Live until ${formatDate(promo.valid_until)}`
          }
        </Text>

        {/* Meta chips row */}
        {(promo.promo_code || (promo.service_ids && promo.service_ids.length > 0) || promo.scheduled_notify_at) && (
          <View style={pcSt.metaRow}>
            {promo.promo_code && (
              <View style={[pcSt.codeBadge, { backgroundColor: C.accent + '20' }]}>
                <Ionicons name="ticket-outline" size={10} color={C.accent} />
                <Text style={[pcSt.codeText, { color: C.accent }]}>{promo.promo_code}</Text>
              </View>
            )}
            {promo.service_ids && promo.service_ids.length > 0 && (() => {
              const names = promo.service_ids
                .map(id => services.find(s => s.id === id)?.name)
                .filter(Boolean) as string[];
              const display = names.length > 0 ? names : [`${promo.service_ids.length} service${promo.service_ids.length > 1 ? 's' : ''}`];
              return display.map((name, i) => (
                <View key={i} style={[pcSt.svcBadge, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Text style={[pcSt.svcText, { color: C.sub }]}>{name}</Text>
                </View>
              ));
            })()}
            {promo.scheduled_notify_at && !promo.notify_sent_at && (
              <View style={[pcSt.schedBadge, { backgroundColor: C.accent + '15' }]}>
                <Ionicons name="alarm-outline" size={10} color={C.accent} />
                <Text style={[pcSt.schedText, { color: C.accent }]}>
                  Sends {formatDate(promo.scheduled_notify_at.substring(0, 10))}
                </Text>
              </View>
            )}
            {promo.notify_sent_at && (
              <View style={[pcSt.schedBadge, { backgroundColor: 'rgba(48,209,88,0.12)' }]}>
                <Ionicons name="checkmark-circle-outline" size={10} color="#30D158" />
                <Text style={[pcSt.schedText, { color: '#30D158' }]}>Notified</Text>
              </View>
            )}
          </View>
        )}

        <View style={[pcSt.sep, { backgroundColor: C.border }]} />

        <View style={pcSt.actions}>
          <TouchableOpacity style={[pcSt.actionBtn, { borderColor: C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onEdit(promo); }} activeOpacity={0.7}>
            <Ionicons name="pencil-outline" size={12} color={C.sub} />
            <Text style={[pcSt.actionText, { color: C.sub }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[pcSt.actionBtn, { borderColor: C.accent + '50' }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onNotify(promo); }} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={12} color={C.accent} />
            <Text style={[pcSt.actionText, { color: C.accent }]}>Notify</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[pcSt.actionBtn, { borderColor: C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onDuplicate(promo); }} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={12} color={C.sub} />
            <Text style={[pcSt.actionText, { color: C.sub }]}>Copy</Text>
          </TouchableOpacity>
          {(expired || !promo.is_active) && (
            <TouchableOpacity style={[pcSt.actionBtn, { borderColor: C.accent + '50' }]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onExtend(promo); }} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={12} color={C.accent} />
              <Text style={[pcSt.actionText, { color: C.accent }]}>Extend</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[pcSt.actionBtn, { borderColor: 'rgba(255,104,104,0.3)' }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onDelete(promo.id); }} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={12} color={C.danger} />
            <Text style={[pcSt.actionText, { color: C.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const pcSt = StyleSheet.create({
  wrap: { marginBottom: 10, borderRadius: 16, overflow: 'hidden', backgroundColor: CP.surface },
  image: { width: '100%', height: 140 },
  banner: { height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: CP.card },
  bannerOverlay: { position: 'absolute', bottom: 10, left: 12, flexDirection: 'row', gap: 6 },
  discountBadge: { backgroundColor: CP.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: CP.ice + '30' },
  discountText: { color: CP.ice, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)' },
  catBadgeText: { color: CP.text, fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  content: { padding: 14, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: CP.text, fontSize: 16, fontWeight: '700', flex: 1, letterSpacing: -0.3 },
  desc: { color: CP.sub, fontSize: 13, lineHeight: 18 },
  date: { fontSize: 11, fontWeight: '500' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: CP.border, marginVertical: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  codeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(183,225,218,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  codeText: { color: CP.ice, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  svcBadge: { backgroundColor: CP.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5, borderColor: CP.border },
  svcText: { color: CP.sub, fontSize: 10, fontWeight: '600' },
  schedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(183,225,218,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  schedText: { color: CP.warn, fontSize: 10, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 0.5, borderColor: CP.border },
  actionText: { fontSize: 11, fontWeight: '600' },
});

// ── Template Picker Sheet ──────────────────────────────────────────────────────

function TemplatePickerSheet({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (t: typeof TEMPLATES[number]) => void;
  onClose: () => void;
}) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={tpSt.container}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[tpSt.sheet, { backgroundColor: C.surface }]}>
        <View style={[tpSt.handle, { backgroundColor: C.border }]} />
        <Text style={[tpSt.heading, { color: C.text }]}>Start with a template</Text>
        <Text style={[tpSt.sub, { color: C.sub }]}>Choose a style and we'll pre-fill the details</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tpSt.grid}>
          {TEMPLATES.map(tmpl => (
            <TouchableOpacity
              key={tmpl.id}
              style={tpSt.card}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onSelect(tmpl); }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={tmpl.gradient}
                style={tpSt.cardGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name={tmpl.icon} size={24} color="#FFFFFF" />
                <Text style={[tpSt.cardName, { color: '#FFFFFF' }]}>{tmpl.name}</Text>
                <Text style={[tpSt.cardTagline, { color: 'rgba(255,255,255,0.8)' }]}>{tmpl.tagline}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const tpSt = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: CP.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 12, paddingHorizontal: 20, maxHeight: '80%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: CP.border, alignSelf: 'center', marginBottom: 20 },
  heading: { fontSize: 20, fontWeight: '700', color: CP.text, marginBottom: 4 },
  sub: { fontSize: 13, color: CP.sub, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 40 },
  card: { width: (SW - 60) / 2, borderRadius: 14, overflow: 'hidden' },
  cardGrad: { padding: 16, gap: 8, minHeight: 110, justifyContent: 'flex-end', borderWidth: 0.5, borderColor: CP.border, borderRadius: 14 },
  cardName: { color: CP.text, fontSize: 14, fontWeight: '800' },
  cardTagline: { color: CP.sub, fontSize: 11, fontWeight: '500' },
});

// ── Notify Modal ───────────────────────────────────────────────────────────────

type Audience = 'all' | 'repeat' | 'bookmarked';

function tomorrow9am() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function NotifyModal({ visible, promo, clients, onClose, onSend }: {
  visible: boolean;
  promo: DbPromotion | null;
  clients: ClienteleMember[];
  onClose: () => void;
  onSend: (audience: Audience, scheduledAt?: string) => Promise<void>;
}) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  const [audience, setAudience] = useState<Audience>('all');
  const [sending, setSending] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [schedAt, setSchedAt] = useState<Date>(tomorrow9am);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setAudience('all');
      setSending(false);
      setScheduleMode(false);
      setSchedAt(tomorrow9am());
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
  }, [visible]);

  const repeatCount = clients.filter(c => c.booking_count >= 2).length;

  const audienceOptions: { key: Audience; label: string; sub: string; count: number | null }[] = [
    { key: 'all',        label: 'All',       sub: 'Everyone who has booked you',    count: clients.length },
    { key: 'repeat',     label: 'Repeat',    sub: '2+ bookings with you',           count: repeatCount },
    { key: 'bookmarked', label: 'Followers', sub: 'People who saved your profile',  count: null },
  ];

  const handleSend = async () => {
    const scheduledAt = scheduleMode ? schedAt.toISOString() : undefined;
    setSending(true);
    try { await onSend(audience, scheduledAt); } finally { setSending(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={nmSt.container}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[nmSt.sheet, { backgroundColor: C.surface }]}>
        <View style={[nmSt.handle, { backgroundColor: C.border }]} />
        <View style={nmSt.header}>
          <Text style={[nmSt.title, { color: C.text }]}>Notify Clients</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={C.sub} />
          </TouchableOpacity>
        </View>

        {promo && (
          <View style={[nmSt.promoPreview, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={nmSt.promoBadge}>
              <Text style={nmSt.promoBadgeText}>{discountLabel(promo)}</Text>
            </View>
            <Text style={[nmSt.promoTitle, { color: C.text }]} numberOfLines={1}>{promo.title}</Text>
          </View>
        )}

        <Text style={[nmSt.sectionLabel, { color: C.sub }]}>AUDIENCE</Text>

        {audienceOptions.map(opt => {
          const selected = audience === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[nmSt.option, { backgroundColor: C.card, borderColor: C.border }, selected && [nmSt.optionActive, { backgroundColor: C.accent, borderColor: C.accent }]]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setAudience(opt.key); }}
              activeOpacity={0.7}
            >
              <View style={[nmSt.radio, { borderColor: C.border }, selected && [nmSt.radioActive, { borderColor: C.ice }]]}>
                {selected && <View style={nmSt.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[nmSt.optLabel, { color: selected ? C.ice : C.text }]}>{opt.label}</Text>
                <Text style={[nmSt.optSub, { color: selected ? 'rgba(255,255,255,0.7)' : C.sub }]}>{opt.sub}</Text>
              </View>
              {opt.count !== null && (
                <View style={[nmSt.countBadge, { backgroundColor: C.surface }, selected && nmSt.countBadgeActive]}>
                  <Text style={[nmSt.countText, { color: selected ? C.ice : C.sub }]}>{opt.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Schedule toggle */}
        <View style={[nmSt.option, { marginTop: 4, backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="alarm-outline" size={16} color={scheduleMode ? C.accent : C.sub} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[nmSt.optLabel, { color: C.text }]}>Schedule Send</Text>
            <Text style={[nmSt.optSub, { color: C.sub }]}>Send at a specific date & time</Text>
          </View>
          <Switch value={scheduleMode} onValueChange={setScheduleMode}
            trackColor={{ false: C.border, true: C.accent }} thumbColor={C.ice} />
        </View>

        {scheduleMode && (
          <View style={nmSt.pickerRow}>
            <TouchableOpacity
              style={[nmSt.pickerBtn, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={14} color={C.accent} />
              <Text style={[nmSt.pickerText, { color: C.text }]}>
                {schedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[nmSt.pickerBtn, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={14} color={C.accent} />
              <Text style={[nmSt.pickerText, { color: C.text }]}>
                {schedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={schedAt}
            mode="date"
            minimumDate={new Date()}
            display="default"
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) {
                const updated = new Date(schedAt);
                updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                setSchedAt(updated);
              }
            }}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={schedAt}
            mode="time"
            display="default"
            onChange={(_, date) => {
              setShowTimePicker(false);
              if (date) {
                const updated = new Date(schedAt);
                updated.setHours(date.getHours(), date.getMinutes());
                setSchedAt(updated);
              }
            }}
          />
        )}

        <TouchableOpacity style={[nmSt.sendBtn, sending && { opacity: 0.6 }]}
          onPress={handleSend} activeOpacity={0.8} disabled={sending}>
          {sending
            ? <ActivityIndicator color={C.ice} size="small" />
            : <>
                <Ionicons name={scheduleMode ? 'alarm-outline' : 'notifications-outline'} size={16} color={C.ice} />
                <Text style={nmSt.sendBtnText}>{scheduleMode ? 'Schedule' : 'Send Now'}</Text>
              </>
          }
        </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const nmSt = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: CP.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: CP.border, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: CP.text },
  promoPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: CP.border, borderRadius: 12, padding: 12, marginBottom: 20, backgroundColor: CP.card },
  promoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: CP.accent },
  promoBadgeText: { fontSize: 11, fontWeight: '800', color: CP.ice },
  promoTitle: { fontSize: 14, fontWeight: '600', color: CP.text, flex: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, color: CP.sub, textTransform: 'uppercase' },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: CP.border, borderRadius: 12, padding: 14, marginBottom: 8, backgroundColor: CP.card },
  optionActive: { borderColor: CP.ice + '40', backgroundColor: CP.accent },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: CP.border, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: CP.ice },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CP.ice },
  optLabel: { fontSize: 15, fontWeight: '600' },
  optSub: { fontSize: 12, marginTop: 1, color: CP.sub },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: CP.surface },
  countBadgeActive: { backgroundColor: 'rgba(183,225,218,0.15)' },
  countText: { fontSize: 13, fontWeight: '700' },
  pickerRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
  pickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CP.card, borderWidth: 0.5, borderColor: CP.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pickerText: { color: CP.ice, fontSize: 13, fontWeight: '600', flex: 1 },
  sendBtn: { marginTop: 16, borderRadius: 14, backgroundColor: CP.accent, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: CP.ice + '30' },
  sendBtnText: { color: CP.ice, fontSize: 15, fontWeight: '700' },
});

// ── Form State ─────────────────────────────────────────────────────────────────

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

interface FormState {
  title: string;
  description: string;
  discountType: 'text' | 'percent' | 'amount';
  discountText: string;
  discountPercent: string;
  discountAmount: string;
  category: string;
  serviceIds: string[];
  promoCode: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  imageUri: string | null;
  existingImageUrl: string | null;
  scheduleNotify: boolean;
  scheduleDate: string;
  scheduleTime: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  discountType: 'text',
  discountText: '',
  discountPercent: '',
  discountAmount: '',
  category: '',
  serviceIds: [],
  promoCode: '',
  validFrom: today(),
  validUntil: '',
  isActive: true,
  imageUri: null,
  existingImageUrl: null,
  scheduleNotify: false,
  scheduleDate: '',
  scheduleTime: '09:00',
};

function promoToForm(p: DbPromotion): FormState {
  let discountType: FormState['discountType'] = 'text';
  if (p.discount_percent) discountType = 'percent';
  else if (p.discount_amount) discountType = 'amount';
  let scheduleDate = '';
  let scheduleTime = '09:00';
  if (p.scheduled_notify_at && !p.notify_sent_at) {
    const d = new Date(p.scheduled_notify_at);
    scheduleDate = d.toISOString().substring(0, 10);
    scheduleTime = d.toTimeString().substring(0, 5);
  }
  return {
    title: p.title,
    description: p.description ?? '',
    discountType,
    discountText: p.discount_text ?? '',
    discountPercent: p.discount_percent?.toString() ?? '',
    discountAmount: p.discount_amount?.toString() ?? '',
    category: p.service_category ?? '',
    serviceIds: p.service_ids ?? [],
    promoCode: p.promo_code ?? '',
    validFrom: p.valid_from,
    validUntil: p.valid_until,
    isActive: p.is_active,
    imageUri: null,
    existingImageUrl: p.image_url ?? null,
    scheduleNotify: !!scheduleDate,
    scheduleDate,
    scheduleTime,
  };
}

function templateToForm(t: typeof TEMPLATES[number]): FormState {
  return {
    ...EMPTY_FORM,
    title: t.prefill.title,
    description: t.prefill.description,
    discountType: t.prefill.discountType,
    discountText: 'discountText' in t.prefill ? (t.prefill as any).discountText : '',
    discountPercent: 'discountPercent' in t.prefill ? (t.prefill as any).discountPercent : '',
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    serviceIds: t.id === 'bundle' ? [] : [],
  };
}

// ── Form Modal ─────────────────────────────────────────────────────────────────

function PromoFormModal({ visible, editing, initialForm, services, onClose, onSave }: {
  visible: boolean;
  editing: DbPromotion | null;
  initialForm: FormState | null;
  services: DbService[];
  onClose: () => void;
  onSave: (input: UpsertPromotionInput) => Promise<void>;
}) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Date picker state
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [untilDate, setUntilDate] = useState<Date>(new Date(Date.now() + 30*24*60*60*1000));
  const [schedAt, setSchedAt] = useState<Date>(tomorrow9am());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showUntilPicker, setShowUntilPicker] = useState(false);
  const [showSchedDatePicker, setShowSchedDatePicker] = useState(false);
  const [showSchedTimePicker, setShowSchedTimePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      const f = editing ? promoToForm(editing) : initialForm ?? EMPTY_FORM;
      setForm(f);
      const fd = f.validFrom ? new Date(f.validFrom + 'T12:00:00') : new Date();
      const ud = f.validUntil ? new Date(f.validUntil + 'T12:00:00') : new Date(Date.now() + 30*24*60*60*1000);
      setFromDate(isNaN(fd.getTime()) ? new Date() : fd);
      setUntilDate(isNaN(ud.getTime()) ? new Date(Date.now() + 30*24*60*60*1000) : ud);
      if (f.scheduleDate) {
        const sd = new Date(`${f.scheduleDate}T${f.scheduleTime || '09:00'}:00`);
        setSchedAt(isNaN(sd.getTime()) ? tomorrow9am() : sd);
      } else {
        setSchedAt(tomorrow9am());
      }
    }
  }, [visible, editing, initialForm]);

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleServiceId = (id: string) =>
    setForm(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter(s => s !== id)
        : [...prev.serviceIds, id],
    }));

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) field('imageUri', result.assets[0].uri);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (form.scheduleNotify && !form.scheduleDate.trim()) return;

    setSaving(true);
    try {
      let imageUrl: string | null | undefined = editing ? form.existingImageUrl : undefined;
      if (form.imageUri) {
        setUploadingImage(true);
        imageUrl = await uploadPromoImage(form.imageUri);
        setUploadingImage(false);
      }

      const descTrimmed = form.description.trim();
      const discTextTrimmed = form.discountText.trim();
      const discPct = parseFloat(form.discountPercent);
      const discAmt = parseFloat(form.discountAmount);
      const codeTrimmed = form.promoCode.trim().toUpperCase();

      const isoDate = (d: Date) => d.toISOString().substring(0, 10);

      let scheduledNotifyAt: string | null = null;
      if (form.scheduleNotify) {
        scheduledNotifyAt = schedAt.toISOString();
      }

      const input: UpsertPromotionInput = {
        ...(editing?.id ? { id: editing.id } : {}),
        title: form.title.trim(),
        ...(descTrimmed ? { description: descTrimmed } : {}),
        ...(form.discountType === 'text' && discTextTrimmed ? { discount_text: discTextTrimmed } : {}),
        ...(form.discountType === 'percent' && !isNaN(discPct) ? { discount_percent: discPct } : {}),
        ...(form.discountType === 'amount' && !isNaN(discAmt) ? { discount_amount: discAmt } : {}),
        ...(form.category ? { service_category: form.category } : {}),
        service_ids: form.serviceIds.length > 0 ? form.serviceIds : null,
        promo_code: codeTrimmed || null,
        valid_from: isoDate(fromDate),
        valid_until: isoDate(untilDate),
        is_active: form.isActive,
        ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
        scheduled_notify_at: scheduledNotifyAt,
        ...(form.scheduleNotify ? { notify_sent_at: null } : {}),
      };
      await onSave(input);
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const coverUri = form.imageUri ?? form.existingImageUrl;

  // Group services by category
  const serviceGroups = services.reduce<Record<string, DbService[]>>((acc, s) => {
    const key = s.category_name || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Header */}
        <View style={[fmSt.header, { borderBottomColor: C.border, backgroundColor: C.bg }]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={fmSt.headerClose}>
            <Text style={[fmSt.headerCloseText, { color: C.sub }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[fmSt.headerTitle, { color: C.text }]}>{editing ? 'Edit Promotion' : 'New Promotion'}</Text>
          <TouchableOpacity onPress={handleSave} activeOpacity={0.8} disabled={saving} style={fmSt.headerSave}>
            {saving
              ? <ActivityIndicator color={C.accent} size="small" />
              : <Text style={[fmSt.headerSaveText, { color: C.accent }]}>{editing ? 'Save' : 'Create'}</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={fmSt.scroll}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
          >

            {/* Cover image */}
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={fmSt.coverWrap}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={fmSt.cover} resizeMode="cover" />
              ) : (
                <View style={[fmSt.coverEmpty, { backgroundColor: C.card }]}>
                  <Ionicons name="image-outline" size={30} color={C.sub} />
                  <Text style={[fmSt.coverEmptyText, { color: C.sub }]}>Add Cover Photo</Text>
                  <Text style={[fmSt.coverEmptyHint, { color: C.sub }]}>Makes your promotion stand out</Text>
                </View>
              )}
              {coverUri && (
                <View style={fmSt.coverEditBadge}>
                  <Ionicons name="pencil-outline" size={13} color="#FFFFFF" />
                  <Text style={fmSt.coverEditText}>Change Photo</Text>
                </View>
              )}
            </TouchableOpacity>
            {uploadingImage && (
              <View style={fmSt.uploadingRow}>
                <ActivityIndicator color={C.accent} size="small" />
                <Text style={[fmSt.uploadingText, { color: C.sub }]}>Uploading image…</Text>
              </View>
            )}

            {/* Title */}
            <Text style={[fmSt.label, { color: C.sub }]}>Title *</Text>
            <TextInput style={[fmSt.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="e.g. Summer Hair Special"
              placeholderTextColor={C.sub} value={form.title}
              onChangeText={v => field('title', v)} maxLength={80} />

            {/* Description */}
            <Text style={[fmSt.label, { color: C.sub }]}>Description</Text>
            <TextInput style={[fmSt.input, { height: 80, textAlignVertical: 'top', paddingTop: 12, backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Tell clients what's included…" placeholderTextColor={C.sub}
              value={form.description} onChangeText={v => field('description', v)}
              multiline maxLength={200} />

            {/* Discount type */}
            <Text style={[fmSt.label, { color: C.sub }]}>Discount Type</Text>
            <View style={[fmSt.segRow, { backgroundColor: C.surface }]}>
              {(['text', 'percent', 'amount'] as const).map(t => (
                <TouchableOpacity key={t} style={[fmSt.seg, form.discountType === t && [fmSt.segActive, { backgroundColor: C.accent }]]}
                  onPress={() => field('discountType', t)} activeOpacity={0.7}>
                  <Text style={[fmSt.segText, { color: form.discountType === t ? C.ice : C.sub }]}>
                    {t === 'text' ? 'Custom' : t === 'percent' ? '% Off' : '£ Off'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.discountType === 'text' && (
              <TextInput style={[fmSt.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder='"20% OFF" or "Free Toner"'
                placeholderTextColor={C.sub} value={form.discountText}
                onChangeText={v => field('discountText', v)} maxLength={40} />
            )}
            {form.discountType === 'percent' && (
              <TextInput style={[fmSt.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="e.g. 20" placeholderTextColor={C.sub}
                value={form.discountPercent} onChangeText={v => field('discountPercent', v)} keyboardType="numeric" />
            )}
            {form.discountType === 'amount' && (
              <TextInput style={[fmSt.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="e.g. 15" placeholderTextColor={C.sub}
                value={form.discountAmount} onChangeText={v => field('discountAmount', v)} keyboardType="numeric" />
            )}

            {/* Promo Code */}
            <Text style={[fmSt.label, { color: C.sub }]}>Promo Code <Text style={fmSt.labelOptional}>(optional)</Text></Text>
            <View style={fmSt.codeRow}>
              <TextInput
                style={[fmSt.input, { flex: 1, letterSpacing: 2, textTransform: 'uppercase', backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="e.g. SUMMER20"
                placeholderTextColor={C.sub}
                value={form.promoCode}
                onChangeText={v => field('promoCode', v.toUpperCase())}
                maxLength={12}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[fmSt.genBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); field('promoCode', genCode()); }}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={14} color={C.accent} />
                <Text style={[fmSt.genBtnText, { color: C.accent }]}>Generate</Text>
              </TouchableOpacity>
            </View>

            {/* Services */}
            {services.length > 0 && (
              <>
                {/* Section header with count + All button on right */}
                <View style={fmSt.serviceHeader}>
                  <View>
                    <Text style={fmSt.label}>Applies to Services</Text>
                    <Text style={fmSt.serviceSub}>
                      {form.serviceIds.length === 0
                        ? 'Tap services to include in this promotion'
                        : form.serviceIds.length === services.length
                        ? 'All services included'
                        : `${form.serviceIds.length} of ${services.length} selected`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {form.serviceIds.length > 0 && (
                      <TouchableOpacity onPress={() => field('serviceIds', [])} activeOpacity={0.7}>
                        <Text style={fmSt.clearAll}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    {form.serviceIds.length < services.length && (
                      <TouchableOpacity
                        style={fmSt.selectAllPill}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); field('serviceIds', services.map(s => s.id)); }}
                        activeOpacity={0.7}
                      >
                        <View style={fmSt.selectAllDot} />
                        <Text style={fmSt.selectAllText}>All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={[fmSt.serviceSectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
                  {Object.entries(serviceGroups).map(([cat, svcs], gi) => (
                    <View key={cat} style={{ marginBottom: gi < Object.keys(serviceGroups).length - 1 ? 12 : 0 }}>
                      {Object.keys(serviceGroups).length > 1 && (
                        <Text style={[fmSt.serviceGroupLabel, { color: C.sub }]}>{cat}</Text>
                      )}
                      <View style={fmSt.serviceGrid}>
                        {svcs.map(svc => {
                          const selected = form.serviceIds.includes(svc.id);
                          return (
                            <TouchableOpacity
                              key={svc.id}
                              style={[fmSt.serviceChip, { backgroundColor: C.surface, borderColor: C.border }, selected && fmSt.serviceChipActive]}
                              onPress={() => { Haptics.selectionAsync().catch(() => {}); toggleServiceId(svc.id); }}
                              activeOpacity={0.7}
                            >
                              {selected
                                ? <Ionicons name="checkmark-circle" size={14} color={C.ice} />
                                : <View style={[fmSt.serviceChipCircle, { borderColor: C.border }]} />
                              }
                              <View style={{ flex: 1 }}>
                                <Text style={[fmSt.serviceChipName, { color: selected ? C.ice : C.text }]} numberOfLines={1}>
                                  {svc.name}
                                </Text>
                                <Text style={[fmSt.serviceChipPrice, { color: selected ? C.ice + 'AA' : C.sub }]}>£{svc.price.toFixed(0)}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Category */}
            <Text style={[fmSt.label, { color: C.sub }]}>Service Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {SERVICE_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat}
                  style={[fmSt.catChip, { backgroundColor: C.card, borderColor: C.border }, form.category === cat && fmSt.catChipActive]}
                  onPress={() => field('category', form.category === cat ? '' : cat)} activeOpacity={0.7}>
                  <Text style={[fmSt.catText, { color: form.category === cat ? C.ice : C.sub }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Dates */}
            <Text style={[fmSt.label, { color: C.sub }]}>Promotion Dates *</Text>
            <View style={fmSt.datePickerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[fmSt.datePickerLabel, { color: C.sub }]}>FROM</Text>
                <TouchableOpacity
                  style={[fmSt.datePickerBtn, { backgroundColor: C.card, borderColor: C.border }, showFromPicker && fmSt.datePickerBtnActive]}
                  onPress={() => { setShowFromPicker(v => !v); setShowUntilPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={15} color={C.accent} />
                  <Text style={[fmSt.datePickerText, { color: C.text }]}>
                    {fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Ionicons name={showFromPicker ? 'chevron-up' : 'chevron-down'} size={12} color={C.sub} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
              <View style={fmSt.dateSep}>
                <Text style={[fmSt.dateSepText, { color: C.sub }]}>→</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[fmSt.datePickerLabel, { color: C.sub }]}>UNTIL</Text>
                <TouchableOpacity
                  style={[fmSt.datePickerBtn, { backgroundColor: C.card, borderColor: C.border }, showUntilPicker && fmSt.datePickerBtnActive]}
                  onPress={() => { setShowUntilPicker(v => !v); setShowFromPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={15} color={C.accent} />
                  <Text style={[fmSt.datePickerText, { color: C.text }]}>
                    {untilDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Ionicons name={showUntilPicker ? 'chevron-up' : 'chevron-down'} size={12} color={C.sub} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
            </View>
            {showFromPicker && (
              <View style={[fmSt.calendarCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <DateTimePicker
                  value={fromDate}
                  mode="date"
                  display="inline"
                  accentColor={C.accent}
                  textColor={C.text}
                  style={{ width: '100%' }}
                  onChange={(_, date) => {
                    if (date) {
                      setFromDate(date);
                      if (date > untilDate) setUntilDate(date);
                    }
                  }}
                />
                <TouchableOpacity style={fmSt.calendarDoneBtn} onPress={() => setShowFromPicker(false)} activeOpacity={0.7}>
                  <Text style={[fmSt.calendarDoneText, { color: C.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
            {showUntilPicker && (
              <View style={[fmSt.calendarCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <DateTimePicker
                  value={untilDate}
                  mode="date"
                  display="inline"
                  accentColor={C.accent}
                  textColor={C.text}
                  minimumDate={fromDate}
                  style={{ width: '100%' }}
                  onChange={(_, date) => {
                    if (date) setUntilDate(date);
                  }}
                />
                <TouchableOpacity style={fmSt.calendarDoneBtn} onPress={() => setShowUntilPicker(false)} activeOpacity={0.7}>
                  <Text style={[fmSt.calendarDoneText, { color: C.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Active toggle */}
            <View style={[fmSt.toggleRow, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={fmSt.toggleLeft}>
                <Ionicons name="toggle-outline" size={18} color={C.accent} />
                <View>
                  <Text style={[fmSt.toggleLabel, { color: C.text }]}>Active</Text>
                  <Text style={[fmSt.toggleSub, { color: C.sub }]}>Visible to clients on the Offers screen</Text>
                </View>
              </View>
              <Switch value={form.isActive} onValueChange={v => field('isActive', v)}
                trackColor={{ false: C.surface, true: C.accent }} thumbColor={C.ice} />
            </View>

            {/* Schedule notification */}
            <View style={[fmSt.toggleRow, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={fmSt.toggleLeft}>
                <Ionicons name="alarm-outline" size={18} color={C.accent} />
                <View>
                  <Text style={[fmSt.toggleLabel, { color: C.text }]}>Schedule Notification</Text>
                  <Text style={[fmSt.toggleSub, { color: C.sub }]}>Send to clients at a specific time</Text>
                </View>
              </View>
              <Switch value={form.scheduleNotify} onValueChange={v => field('scheduleNotify', v)}
                trackColor={{ false: C.surface, true: C.accent }} thumbColor={C.ice} />
            </View>

            {form.scheduleNotify && (
              <>
                <Text style={[fmSt.label, { marginTop: 14, color: C.sub }]}>Send At</Text>
                <View style={fmSt.datePickerRow}>
                  <TouchableOpacity
                    style={[fmSt.datePickerBtn, { flex: 1, backgroundColor: C.card, borderColor: C.border }]}
                    onPress={() => { setShowSchedDatePicker(v => !v); setShowSchedTimePicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={15} color={C.accent} />
                    <Text style={[fmSt.datePickerText, { color: C.text }]}>
                      {schedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[fmSt.datePickerBtn, { flex: 1, backgroundColor: C.card, borderColor: C.border }]}
                    onPress={() => { setShowSchedTimePicker(v => !v); setShowSchedDatePicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={15} color={C.accent} />
                    <Text style={[fmSt.datePickerText, { color: C.text }]}>
                      {schedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showSchedDatePicker && (
                  <DateTimePicker
                    value={schedAt}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date()}
                    textColor={C.text}
                    onChange={(_, date) => {
                      setShowSchedDatePicker(false);
                      if (date) {
                        const updated = new Date(schedAt);
                        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                        setSchedAt(updated);
                      }
                    }}
                  />
                )}
                {showSchedTimePicker && (
                  <DateTimePicker
                    value={schedAt}
                    mode="time"
                    display="spinner"
                    textColor={C.text}
                    onChange={(_, date) => {
                      setShowSchedTimePicker(false);
                      if (date) {
                        const updated = new Date(schedAt);
                        updated.setHours(date.getHours(), date.getMinutes());
                        setSchedAt(updated);
                      }
                    }}
                  />
                )}
              </>
            )}

            {/* Save button */}
            <TouchableOpacity style={[fmSt.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave} activeOpacity={0.8} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.ice} size="small" />
                : <Text style={fmSt.saveBtnText}>{editing ? 'Save Changes' : 'Create Promotion'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const fmSt = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 16 : 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CP.border },
  headerClose: { minWidth: 60 },
  headerCloseText: { fontSize: 16, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: CP.text },
  headerSave: { minWidth: 60, alignItems: 'flex-end' },
  headerSaveText: { color: CP.ice, fontSize: 16, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },
  coverWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  cover: { width: '100%', height: 180 },
  coverEmpty: { height: 140, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CP.card, borderRadius: 14 },
  coverEmptyText: { fontSize: 14, fontWeight: '700', color: CP.sub },
  coverEmptyHint: { fontSize: 12, color: CP.sub },
  coverEditBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  coverEditText: { color: CP.text, fontSize: 12, fontWeight: '600' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  uploadingText: { fontSize: 12, color: CP.sub },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', color: CP.sub },
  input: { borderWidth: 0.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '500', borderColor: CP.border, backgroundColor: CP.card, color: CP.text },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 10, backgroundColor: CP.surface, borderRadius: 10, padding: 4 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segActive: { backgroundColor: CP.accent },
  segText: { fontSize: 12, fontWeight: '700' },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 0.5, marginRight: 6, borderColor: CP.border, backgroundColor: CP.card },
  catChipActive: { backgroundColor: CP.accent, borderColor: CP.ice + '30' },
  catText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  labelOptional: { fontWeight: '400', opacity: 0.6, textTransform: 'none', letterSpacing: 0 },
  codeRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  genBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 0.5, borderColor: CP.border, backgroundColor: CP.card },
  genBtnText: { color: CP.ice, fontSize: 12, fontWeight: '700' },
  serviceHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 },
  serviceSub: { fontSize: 11, color: CP.sub, marginTop: 2 },
  serviceSectionCard: { backgroundColor: CP.card, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: CP.border, marginBottom: 4 },
  serviceGroupLabel: { fontSize: 10, color: CP.sub, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: CP.border, backgroundColor: CP.surface, maxWidth: (SW - 60) / 2 },
  serviceChipActive: { backgroundColor: CP.accent, borderColor: CP.ice + '30' },
  serviceChipCircle: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: CP.border },
  serviceChipName: { fontSize: 12, fontWeight: '600' },
  serviceChipPrice: { fontSize: 11, marginTop: 1 },
  clearAll: { fontSize: 12, color: CP.danger, fontWeight: '600', opacity: 0.8 },
  selectAllPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CP.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: CP.ice + '30' },
  selectAllDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CP.ice },
  selectAllText: { fontSize: 11, fontWeight: '700', color: CP.ice },
  datePickerRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  datePickerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: CP.sub, marginBottom: 5 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: CP.card, borderWidth: 0.5, borderColor: CP.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  datePickerBtnActive: { borderColor: CP.accent + '80', backgroundColor: CP.surface },
  datePickerText: { color: CP.ice, fontSize: 13, fontWeight: '600', flex: 1 },
  dateSep: { justifyContent: 'flex-end', paddingBottom: 12 },
  dateSepText: { color: CP.sub, fontSize: 16 },
  dateRow: { flexDirection: 'row', gap: 10 },
  calendarCard: { backgroundColor: CP.card, borderRadius: 14, borderWidth: 0.5, borderColor: CP.border, overflow: 'hidden', marginBottom: 8 },
  calendarDoneBtn: { alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CP.border },
  calendarDoneText: { color: CP.accent, fontSize: 15, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 0.5, borderColor: CP.border, borderRadius: 12, padding: 14, marginTop: 14, backgroundColor: CP.card },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: CP.text },
  toggleSub: { fontSize: 11, marginTop: 1, color: CP.sub },
  saveBtn: { marginTop: 24, borderRadius: 14, backgroundColor: CP.accent, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: CP.ice + '30' },
  saveBtnText: { color: CP.ice, fontSize: 16, fontWeight: '700' },
});

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastSt.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <View style={toastSt.inner}>
        <View style={toastSt.checkCircle}>
          <Ionicons name="checkmark" size={14} color={CP.bg} />
        </View>
        <Text style={toastSt.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const toastSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    zIndex: 999,
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CP.ice,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CP.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: CP.bg, fontSize: 14, fontWeight: '700' },
});

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ProviderPromotionsScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? CP_DARK : CP_LIGHT;
  const { showConfirm, DialogHost } = useProviderDialog();
  const [promos, setPromos] = useState<DbPromotion[]>([]);
  const [clients, setClients] = useState<ClienteleMember[]>([]);
  const [services, setServices] = useState<DbService[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PromoTab>('live');
  const [templateVisible, setTemplateVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingPromo, setEditingPromo] = useState<DbPromotion | null>(null);
  const [pendingForm, setPendingForm] = useState<FormState | null>(null);
  const [notifyPromo, setNotifyPromo] = useState<DbPromotion | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, clientData, svcData] = await Promise.all([
        getMyPromotions(),
        getProviderClientele(),
        getMyProviderServices(),
      ]);
      setPromos(data);
      setClients(clientData);
      setServices(svcData);

      // Fallback sender for scheduled notifications that are now due — the
      // scheduled-promotion cron job (client_automation_jobs.sql) normally
      // handles these; claim first so clients never get the blast twice.
      const now = new Date();
      const duePromos = data.filter(
        p => p.scheduled_notify_at && !p.notify_sent_at && new Date(p.scheduled_notify_at) <= now
      );
      for (const p of duePromos) {
        try {
          const claimed = await markScheduledNotifSent(p.id);
          if (claimed) await sendPromotionNotificationsToClients(p, 'all');
        } catch {}
      }
      if (duePromos.length > 0) {
        const refreshed = await getMyPromotions();
        setPromos(refreshed);
      }

      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (e: any) {
      showToast(e.message ?? 'Could not load promotions');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fadeAnim.setValue(0);
    load();
  }, [load]));

  const livePromos = promos.filter(p => p.is_active && !isExpired(p.valid_until) && !isUpcoming(p.valid_from));
  const upcomingPromos = promos.filter(p => p.is_active && isUpcoming(p.valid_from));
  const pastPromos = promos.filter(p => isExpired(p.valid_until) || !p.is_active);
  const displayed = tab === 'live' ? livePromos : tab === 'upcoming' ? upcomingPromos : pastPromos;

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: active } : p));
    try {
      await togglePromotion(id, active);
    } catch (e: any) {
      showToast(e.message ?? 'Could not update promotion');
      setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !active } : p));
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    showConfirm('Delete Promotion', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setPromos(prev => prev.filter(p => p.id !== id));
          try { await deletePromotion(id); }
          catch (e: any) { showToast(e.message ?? 'Could not delete promotion'); load(); }
        },
      },
    ]);
  }, [load]);

  const handleSave = useCallback(async (input: UpsertPromotionInput) => {
    await upsertPromotion(input);
    setFormVisible(false);
    setEditingPromo(null);
    setPendingForm(null);
    await load();
  }, [load]);

  const openEdit = useCallback((p: DbPromotion) => {
    setEditingPromo(p);
    setPendingForm(null);
    setFormVisible(true);
  }, []);

  const handleTemplateSelect = useCallback((tmpl: typeof TEMPLATES[number]) => {
    setTemplateVisible(false);
    setEditingPromo(null);
    setPendingForm(templateToForm(tmpl));
    setFormVisible(true);
  }, []);

  const handleDuplicate = useCallback((p: DbPromotion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const base = promoToForm(p);
    const dupForm: FormState = {
      ...base,
      title: `${p.title} (Copy)`,
      validFrom: today(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      isActive: false,
      imageUri: null,
      existingImageUrl: p.image_url ?? null,
      scheduleNotify: false,
      scheduleDate: '',
      scheduleTime: '09:00',
    };
    setEditingPromo(null);
    setPendingForm(dupForm);
    setFormVisible(true);
  }, []);

  const handleExtend = useCallback((p: DbPromotion) => {
    const extendBy = async (days: number) => {
      const base = isExpired(p.valid_until) ? new Date() : new Date(p.valid_until);
      base.setDate(base.getDate() + days);
      const newUntil = base.toISOString().substring(0, 10);
      try {
        await patchPromotion(p.id, { valid_until: newUntil, is_active: true });
        showToast(`Extended by ${days} days`);
        await load();
      } catch (e: any) { showToast((e as Error).message ?? 'Could not extend'); }
    };
    showConfirm('Extend Promotion', 'How long would you like to extend it?', [
      { text: 'Cancel', style: 'cancel' },
      { text: '+7 days',  onPress: () => extendBy(7)  },
      { text: '+14 days', onPress: () => extendBy(14) },
      { text: '+30 days', onPress: () => extendBy(30) },
    ]);
  }, [load, showToast, showConfirm]);

  const handleNotifySend = useCallback(async (audience: Audience, scheduledAt?: string) => {
    if (!notifyPromo) return;
    try {
      if (scheduledAt) {
        // Patch only the notify fields — leaves all other promo data intact
        await patchPromotion(notifyPromo.id, { scheduled_notify_at: scheduledAt, notify_sent_at: null });
        setPromos(prev => prev.map(p => p.id === notifyPromo.id
          ? { ...p, scheduled_notify_at: scheduledAt, notify_sent_at: null }
          : p
        ));
        setNotifyPromo(null);
        showToast(`Notification scheduled`);
      } else {
        const { sent } = await sendPromotionNotificationsToClients(notifyPromo, audience);
        await markScheduledNotifSent(notifyPromo.id);
        setPromos(prev => prev.map(p => p.id === notifyPromo.id
          ? { ...p, notify_sent_at: new Date().toISOString() }
          : p
        ));
        setNotifyPromo(null);
        showToast(`Sent to ${sent} client${sent !== 1 ? 's' : ''}`);
      }
    } catch (e: any) {
      showToast(e.message ?? 'Could not send notification');
    }
  }, [notifyPromo, showToast, load]);

  const counts = { live: livePromos.length, upcoming: upcomingPromos.length, past: pastPromos.length };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={scSt.safe} edges={['top']}>

        {/* Header */}
        <View style={scSt.header}>
          <Text style={[scSt.headerTitle, { color: P.text }]}>Promotions</Text>
          <View style={scSt.headerRight}>
            <TouchableOpacity
              style={[scSt.iconBtn, { backgroundColor: P.surface }]}
              onPress={() => navigation.navigate('Clientele')}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={18} color={P.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[scSt.iconBtn, { backgroundColor: P.accent }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setTemplateVisible(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={22} color={P.ice} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subtitle */}
        <Text style={[scSt.headerSub, { color: P.sub }]}>{livePromos.length} live · {clients.length} clients</Text>

        <PromoTabBar active={tab} onChange={setTab} counts={counts} P={P} />

        {loading ? (
          <View style={scSt.center}>
            <ActivityIndicator color={P.accent} size="large" />
          </View>
        ) : (
          <Animated.ScrollView
            style={{ opacity: fadeAnim }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {displayed.length === 0 && (
              <View style={scSt.empty}>
                <View style={[scSt.emptyIcon, { backgroundColor: P.card }]}>
                  <Ionicons name="pricetag-outline" size={32} color={P.sub} />
                </View>
                <Text style={[scSt.emptyTitle, { color: P.text }]}>
                  {tab === 'live' ? 'No live promotions' : tab === 'upcoming' ? 'Nothing scheduled' : 'No past promotions'}
                </Text>
                <Text style={[scSt.emptySub, { color: P.sub }]}>
                  {tab === 'live'
                    ? 'Tap + to create your first promotion and reach your clients'
                    : tab === 'upcoming'
                    ? 'Schedule a future promotion by setting a future start date'
                    : 'Expired and disabled promotions will appear here'}
                </Text>
                {tab === 'live' && (
                  <TouchableOpacity
                    style={[scSt.emptyBtn, { backgroundColor: P.accent }]}
                    onPress={() => setTemplateVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={16} color={P.ice} />
                    <Text style={[scSt.emptyBtnText, { color: P.ice }]}>Create Promotion</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {displayed.map(p => (
              <PromoCard
                key={p.id}
                promo={p}
                services={services}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={handleDelete}
                onNotify={p2 => { Haptics.selectionAsync().catch(() => {}); setNotifyPromo(p2); }}
                onDuplicate={handleDuplicate}
                onExtend={handleExtend}
              />
            ))}
          </Animated.ScrollView>
        )}
      </SafeAreaView>

      <TemplatePickerSheet
        visible={templateVisible}
        onSelect={handleTemplateSelect}
        onClose={() => setTemplateVisible(false)}
      />

      <PromoFormModal
        visible={formVisible}
        editing={editingPromo}
        initialForm={pendingForm}
        services={services}
        onClose={() => { setFormVisible(false); setEditingPromo(null); setPendingForm(null); }}
        onSave={handleSave}
      />

      <NotifyModal
        visible={notifyPromo !== null}
        promo={notifyPromo}
        clients={clients}
        onClose={() => setNotifyPromo(null)}
        onSend={handleNotifySend}
      />

      <Toast message={toastMsg} visible={toastVisible} />
      <DialogHost />
    </ThemedBackground>
  );
}

const scSt = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, marginBottom: 20, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  emptyBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyBtnText: { fontSize: 14, fontWeight: '700' },
});
