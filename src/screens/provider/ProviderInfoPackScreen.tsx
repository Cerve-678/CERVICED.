import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  FlatList,
  Animated,
  ActivityIndicator,
  Modal,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ProviderAccountStackParamList } from '../../navigation/types';
import { useProviderDialog } from '../../components/ProviderDialog';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { logger } from '../../utils/logger';
import { formatShortDate } from '../../utils/dateUtils';
import {
  getMyProviderServices,
  getProviderInfoPacksByUserId,
  createInfoPack,
  deleteInfoPack,
  getProviderBookings,
  attachInfoPackToBooking,
  ProviderInfoPackRow,
} from '../../services/databaseService';
import type { BookingWithAddOns } from '../../types/database';

type Props = NativeStackScreenProps<ProviderAccountStackParamList, 'InfoPacks'>;

const LIGHT_P = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#5C4033',
  ice: '#FFFFFF', text: '#000000', sub: '#7E6667',
  border: 'rgba(126,102,103,0.14)', iconBg: 'rgba(92,64,51,0.12)',
};
const DARK_P = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197',
  ice: '#FFFFFF', text: '#F0ECE7', sub: '#7E6667',
  border: 'rgba(126,102,103,0.18)', iconBg: 'rgba(175,145,151,0.10)',
};

interface InfoPack {
  id: string;
  title: string;
  service: string;
  /** Specific services this pack attaches to; empty = all services */
  serviceNames: string[];
  content: string;
  createdAt: string;
}


const SERVICE_COLORS: Record<string, { bg: string; text: string; dbg: string }> = {
  HAIR:       { bg: '#FFF0F6', text: '#C2185B', dbg: '#3D0F24' },
  NAILS:      { bg: '#F3E5F5', text: '#7B1FA2', dbg: '#2A0A35' },
  LASHES:     { bg: '#EDE7F6', text: '#512DA8', dbg: '#1C1040' },
  BROWS:      { bg: '#E8EAF6', text: '#3949AB', dbg: '#10153D' },
  MUA:        { bg: '#FCE4EC', text: '#AD1457', dbg: '#380919' },
  AESTHETICS: { bg: '#E0F7FA', text: '#00838F', dbg: '#002B30' },
  GENERAL:    { bg: '#F3F4F6', text: '#6B7280', dbg: '#1F2937' },
};

function serviceColor(s: string) {
  return SERVICE_COLORS[s.toUpperCase()] ?? SERVICE_COLORS['GENERAL']!;
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Pack Card ────────────────────────────────────────────────────────────────

function PackCard({
  pack, dark, P, index, onPress, onSend, onDelete,
}: {
  pack: InfoPack; dark: boolean; P: typeof LIGHT_P; index: number;
  onPress: () => void; onSend: () => void; onDelete: () => void;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    const delay = Math.min(index * 60, 300);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  const sc = serviceColor(pack.service);
  const pillBg = dark ? sc.dbg : sc.bg;
  const pillLabel = pack.serviceNames.length === 0
    ? 'ALL SERVICES'
    : pack.serviceNames.length === 1
      ? pack.serviceNames[0]!.toUpperCase()
      : `${pack.serviceNames[0]!.toUpperCase()} +${pack.serviceNames.length - 1}`;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <View style={[pc.card, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={pc.cardTop}>
            <View style={[pc.servicePill, { backgroundColor: pillBg }]}>
              <Text style={[pc.servicePillText, { color: sc.text }]} numberOfLines={1}>{pillLabel}</Text>
            </View>
            <Text style={[pc.date, { color: P.sub }]}>{fmtDate(pack.createdAt)}</Text>
          </View>
          <Text style={[pc.title, { color: P.text }]} numberOfLines={1}>{pack.title}</Text>
          <Text style={[pc.preview, { color: P.sub }]} numberOfLines={2}>{pack.content}</Text>
          <View style={[pc.actions, { borderTopColor: P.border }]}>
            <TouchableOpacity
              style={[pc.actionBtn, { backgroundColor: dark ? 'rgba(255,59,48,0.10)' : 'rgba(255,59,48,0.07)' }]}
              onPress={onDelete} activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={14} color="#FF453A" />
              <Text style={[pc.actionText, { color: '#FF453A' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pc.actionBtn, { flex: 1, backgroundColor: P.iconBg }]}
              onPress={onSend} activeOpacity={0.75}
            >
              <Ionicons name="send-outline" size={14} color={P.accent} />
              <Text style={[pc.actionText, { color: P.accent }]}>Send to client</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const pc = StyleSheet.create({
  card:            { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12, overflow: 'hidden' },
  cardTop:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, marginBottom: 8 },
  servicePill:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  servicePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  date:            { fontSize: 11 },
  title:           { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 16, marginBottom: 6 },
  preview:         { fontSize: 13, lineHeight: 19, paddingHorizontal: 16, marginBottom: 14 },
  actions:         { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, paddingHorizontal: 16 },
  actionText:      { fontSize: 13, fontWeight: '600' },
});

// ─── Send sheet ───────────────────────────────────────────────────────────────
//
// Sends by attaching the pack to a real booking via attachInfoPackToBooking()
// — the same booking_info_packs row + in-app/push notification the auto-attach
// DB trigger creates, and the same RPC ProviderBookingDetailScreen's own
// "Send Info Pack" picker already calls from the booking side. This used to
// just open the device's mailto:/sms: composer with the pack's text pasted
// in — the app had no way to know whether that ever actually reached anyone,
// unlike a form's "Send to client", which is a real in-app record. Picking a
// booking here does the same thing forms do.

function SendSheet({
  pack, visible, dark, P, bookings, loading, sendingBookingId, onPickBooking, onClose,
}: {
  pack: InfoPack | null; visible: boolean; dark: boolean; P: typeof LIGHT_P;
  bookings: BookingWithAddOns[]; loading: boolean; sendingBookingId: string | null;
  onPickBooking: (booking: BookingWithAddOns) => void; onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  // `pack` goes null the instant `visible` does (both come from the same
  // parent state), so reading `pack` directly for the render guard/title
  // would unmount this on the very same tick — before the close animation
  // below ever gets a frame. Keep the last pack around until that animation
  // actually finishes.
  const [renderPack, setRenderPack] = useState(pack);

  useEffect(() => {
    if (visible) {
      setRenderPack(pack);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }),
      ]).start(() => setRenderPack(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible && !renderPack) return null;

  // Rendered inside a native Modal — a screen-local absolute overlay can never
  // outrank the floating pill tab bar, which mounts at the navigator level,
  // above individual screens. Modal renders in its own top-level layer instead.

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[ss.overlay, { opacity: fadeAnim }]} pointerEvents={visible ? 'auto' : 'none'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[ss.sheet, { backgroundColor: P.card, borderColor: P.border, transform: [{ translateY: slideAnim }] }]}>
          <View style={[ss.handle, { backgroundColor: P.border }]} />
          <Text style={[ss.title, { color: P.text }]}>Send Info Pack</Text>
          {renderPack && <Text style={[ss.packName, { color: P.sub }]} numberOfLines={1}>{renderPack.title}</Text>}
          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator color={P.accent} />
            </View>
          ) : bookings.length === 0 ? (
            <Text style={[ss.emptyText, { color: P.sub }]}>
              No upcoming bookings to send this to yet.
            </Text>
          ) : (
            <ScrollView style={ss.bookingList} showsVerticalScrollIndicator={false}>
              {bookings.map(b => {
                const isSending = sendingBookingId === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[ss.bookingRow, { borderColor: P.border, opacity: sendingBookingId && !isSending ? 0.5 : 1 }]}
                    activeOpacity={0.7}
                    disabled={!!sendingBookingId}
                    onPress={() => onPickBooking(b)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[ss.bookingClient, { color: P.text }]} numberOfLines={1}>
                        {b.customer_name || 'Client'}
                      </Text>
                      <Text style={[ss.bookingMeta, { color: P.sub }]} numberOfLines={1}>
                        {b.service_name_snapshot} · {formatShortDate(b.booking_date)}
                      </Text>
                    </View>
                    {isSending ? (
                      <ActivityIndicator size="small" color={P.accent} />
                    ) : (
                      <Ionicons name="send-outline" size={16} color={P.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  overlay:  { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)', zIndex: 10 },
  sheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, maxHeight: '70%' },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:    { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 },
  packName: { fontSize: 13, marginBottom: 16 },
  emptyText:{ fontSize: 13, lineHeight: 19, textAlign: 'center', paddingVertical: 30 },
  bookingList: { flexGrow: 0 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  bookingClient: { fontSize: 14, fontWeight: '700' },
  bookingMeta:   { fontSize: 12, marginTop: 2 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderInfoPackScreen({ navigation }: Props) {
  const { isDarkMode: dark } = useTheme();
  const { user } = useAuth();
  const { showToast, showConfirm, DialogHost } = useProviderDialog();
  const P = dark ? DARK_P : LIGHT_P;

  const [view,       setView]       = useState<'list' | 'create'>('list');
  const [title,      setTitle]      = useState('');
  const [content,    setContent]    = useState('');
  const [packs,      setPacks]      = useState<InfoPack[]>([]);
  const [sending,    setSending]    = useState<InfoPack | null>(null);
  const [sendBookings, setSendBookings]   = useState<BookingWithAddOns[]>([]);
  const [loadingSendBookings, setLoadingSendBookings] = useState(false);
  const [sendingBookingId, setSendingBookingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<InfoPack | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const [myServices, setMyServices] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const resetForm = useCallback(() => { setTitle(''); setSelectedServices([]); setContent(''); }, []);

  const toggleService = useCallback((name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedServices(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }, []);

  // Load packs + the provider's services on mount
  useEffect(() => {
    if (!user?.id) { setIsLoading(false); return; }
    getMyProviderServices()
      // A provider can have legacy duplicate service records with the same
      // display name. The attachment UI is name-based, so show each name once
      // rather than rendering duplicate chips with duplicate React keys.
      .then(services => setMyServices(Array.from(new Set(
        services.map((s: any) => s.name).filter(Boolean),
      ))))
      .catch(() => {});
    getProviderInfoPacksByUserId(user.id)
      .then((rows: ProviderInfoPackRow[]) => {
        setPacks(rows.map(r => ({
          id: r.id,
          title: r.title,
          service: r.service ?? 'GENERAL',
          serviceNames: r.service_names ?? [],
          content: r.content,
          createdAt: r.created_at.split('T')[0]!,
        })));
        setIsLoading(false);
      })
      .catch(e => {
        console.warn('[InfoPacks] fetch error:', e.message);
        setIsLoading(false);
      });
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !content.trim()) { showToast('Please add a title and content.', 'warning'); return; }
    if (!user?.id) return;
    let data: ProviderInfoPackRow;
    try {
      data = await createInfoPack({
        provider_id: user.id,
        title: title.trim(),
        // Legacy display label — matching now runs on service_names
        service: selectedServices.length > 0 ? selectedServices[0]!.toUpperCase() : 'GENERAL',
        service_names: selectedServices,
        content: content.trim(),
      });
    } catch {
      showToast('Could not save info pack.', 'error'); return;
    }
    const newPack: InfoPack = {
      id: data.id,
      title: data.title,
      service: data.service ?? 'GENERAL',
      serviceNames: data.service_names ?? [],
      content: data.content,
      createdAt: data.created_at.split('T')[0]!,
    };
    setPacks(prev => [newPack, ...prev]);
    resetForm();
    Keyboard.dismiss();
    setView('list');
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [title, selectedServices, content, user?.id, resetForm, showToast]);

  const performDelete = useCallback(async (id: string) => {
    try {
      await deleteInfoPack(id);
      setPacks(prev => prev.filter(p => p.id !== id));
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('[InfoPacks] delete failed:', error);
      showToast('Could not delete this pack. Please try again.', 'error');
    }
  }, [showToast]);

  const handleDelete = useCallback((pack: InfoPack) => {
    showConfirm(
      'Delete this pack?',
      `"${pack.title}" will be permanently deleted. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void performDelete(pack.id); } },
      ],
    );
  }, [performDelete, showConfirm]);

  const handleOpenSend = useCallback(async (pack: InfoPack) => {
    setSending(pack);
    setLoadingSendBookings(true);
    try {
      const all = await getProviderBookings();
      setSendBookings(all.filter(b => b.status === 'pending' || b.status === 'confirmed'));
    } catch (error) {
      logger.error('[InfoPacks] failed to load bookings to send to:', error);
      showToast('Could not load your bookings. Please try again.', 'error');
      setSendBookings([]);
    } finally {
      setLoadingSendBookings(false);
    }
  }, [showToast]);

  const handlePickBookingForSend = useCallback(async (booking: BookingWithAddOns) => {
    if (!sending) return;
    setSendingBookingId(booking.id);
    try {
      await attachInfoPackToBooking(booking.id, sending.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`Sent to ${booking.customer_name || 'client'}.`, 'success');
      setSending(null);
    } catch (error) {
      logger.error('[InfoPacks] send failed:', error);
      showToast('Could not send this pack. Please try again.', 'error');
    } finally {
      setSendingBookingId(null);
    }
  }, [sending, showToast]);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerY    = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(headerY,    { toValue: 0, tension: 90, friction: 14, useNativeDriver: true }),
    ]).start();
  }, [headerFade, headerY]);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ───────────────────────────────────────── */}
        <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateY: headerY }] }]}>
          <TouchableOpacity
            onPress={() => {
              if (view === 'create') {
                Keyboard.dismiss();
                resetForm();
                setView('list');
              } else navigation.goBack();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
          >
            <Ionicons name={view === 'create' ? 'close' : 'chevron-back'} size={18} color={P.text} />
          </TouchableOpacity>

          <Text style={[s.screenTitle, { color: P.text }]}>
            {view === 'list' ? 'Info Packs' : 'New Pack'}
          </Text>

          {view === 'list' ? (
            <TouchableOpacity onPress={() => setView('create')} style={[s.newBtn, { backgroundColor: P.accent }]} activeOpacity={0.82}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.newBtnText}>New</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setPreviewing({
                id: 'draft',
                title: title.trim() || 'Untitled pack',
                service: selectedServices.length > 0 ? selectedServices[0]!.toUpperCase() : 'GENERAL',
                serviceNames: selectedServices,
                content: content.trim() || 'Nothing written yet.',
                createdAt: '',
              })}
              style={[s.newBtn, { backgroundColor: '#30D158' }]}
              activeOpacity={0.82}
            >
              <Ionicons name="eye-outline" size={15} color="#fff" />
              <Text style={s.newBtnText}>Preview</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── List ─────────────────────────────────────────── */}
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={P.accent} />
          </View>
        ) : view === 'list' ? (
          <FlatList
            data={packs}
            keyExtractor={p => p.id}
            contentContainerStyle={[s.listContent, packs.length === 0 && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <PackCard
                pack={item} dark={dark} P={P} index={index}
                onPress={() => setPreviewing(item)}
                onSend={() => handleOpenSend(item)}
                onDelete={() => handleDelete(item)}
              />
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                  <Ionicons name="document-text-outline" size={36} color={P.sub} />
                </View>
                <Text style={[s.emptyTitle, { color: P.text }]}>No info packs yet</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>Create aftercare guides, prep tips, and more to send clients instantly</Text>
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: P.accent }]} onPress={() => setView('create')} activeOpacity={0.85}>
                  <Text style={s.emptyBtnText}>Create first pack</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ) : (
          /* ── Create form ──────────────────────────────── */
          <KeyboardDismissView style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.formContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              <Text style={[s.fieldLabel, { color: P.sub }]}>TITLE</Text>
              <View style={[s.inputWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                <TextInput
                  style={[s.input, { color: P.text }]}
                  placeholder="e.g. Lash Aftercare Guide"
                  placeholderTextColor={P.sub}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                  returnKeyType="next"
                />
              </View>

              <View style={s.fieldLabelRow}>
                <Text style={[s.fieldLabel, { color: P.sub, marginBottom: 0 }]}>ATTACHES TO SERVICES</Text>
                {myServices.length > 1 && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedServices(selectedServices.length === myServices.length ? [] : myServices);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.selectAllText, { color: P.accent }]}>
                      {selectedServices.length === myServices.length ? 'Clear all' : 'Select all'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[s.fieldHint, { color: P.sub }]}>
                Pick the services this pack goes with — it's sent automatically when a client books them. Leave empty to attach to every booking.
              </Text>
              <View style={s.serviceChipsWrap}>
                {myServices.length === 0 ? (
                  <Text style={[s.fieldHint, { color: P.sub }]}>No services on your profile yet — the pack will attach to all bookings.</Text>
                ) : myServices.map((name, index) => {
                  const selected = selectedServices.includes(name);
                  return (
                    <TouchableOpacity
                      key={`${name}-${index}`}
                      style={[s.serviceChip, {
                        borderColor: selected ? P.accent : P.border,
                        backgroundColor: selected ? P.accent + '18' : P.card,
                      }]}
                      onPress={() => toggleService(name)}
                      activeOpacity={0.7}
                    >
                      {selected && <Ionicons name="checkmark" size={12} color={P.accent} />}
                      <Text style={[s.serviceChipText, { color: selected ? P.accent : P.sub }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { color: P.sub }]}>CONTENT</Text>
              <View style={[s.inputWrap, s.textAreaWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                <TextInput
                  style={[s.input, s.textArea, { color: P.text }]}
                  placeholder={'Aftercare instructions, prep tips, what to expect…'}
                  placeholderTextColor={P.sub}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity style={[s.saveBtn, { backgroundColor: P.accent }]} onPress={handleSave} activeOpacity={0.85}>
                <Text style={s.saveBtnText}>Save Info Pack</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardDismissView>
        )}
      </SafeAreaView>

      <SendSheet
        pack={sending} visible={!!sending} dark={dark} P={P}
        bookings={sendBookings} loading={loadingSendBookings} sendingBookingId={sendingBookingId}
        onPickBooking={handlePickBookingForSend}
        onClose={() => { if (!sendingBookingId) setSending(null); }}
      />

      {/* Full-content preview — tapping a card only ever showed the 2-line
          truncated snippet before; this is where you actually read it. */}
      <Modal
        visible={!!previewing}
        animationType="fade"
        transparent statusBarTranslucent navigationBarTranslucent
        onRequestClose={() => setPreviewing(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPreviewing(null)} />
          <View style={{ maxHeight: '78%', backgroundColor: P.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, backgroundColor: P.border }} />
            {previewing && (
              <>
                <Text style={{ fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: P.text, marginBottom: 4 }} numberOfLines={2}>
                  {previewing.title}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: P.accent, marginBottom: 14 }}>
                  {previewing.serviceNames.length === 0 ? 'ALL SERVICES' : previewing.serviceNames.join(', ').toUpperCase()}
                </Text>
                <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <Text style={{ fontSize: 15, lineHeight: 23, color: P.text }}>
                    {previewing.content}
                  </Text>
                </ScrollView>
                <TouchableOpacity
                  style={{ marginTop: 18, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: P.accent }}
                  activeOpacity={0.85}
                  onPress={() => setPreviewing(null)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <DialogHost />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  newBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 },

  fieldLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  selectAllText: { fontSize: 12, fontWeight: '700' },
  fieldHint:   { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  serviceChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  serviceChipText: { fontSize: 13, fontWeight: '600' },
  inputWrap:   { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  textAreaWrap:{ alignItems: 'flex-start', paddingVertical: 14 },
  input:       { flex: 1, fontSize: 15 },
  textArea:    { minHeight: 140, lineHeight: 22 },

  formContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 20 },
  saveBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingTop: 40 },
  emptyIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySub:    { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22 },
  emptyBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
