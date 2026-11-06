import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeArea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ProviderAccountStackParamList } from '../../navigation/types';
import { useAppDialog } from '../../components/AppDialog';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { ThemedBackground } from '../../components/ThemedBackground';
import { logger } from '../../utils/logger';
import { dateToYMD } from '../../utils/dateUtils';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import {
  attachInfoPackToBooking,
  createInfoPack,
  deleteInfoPack,
  getInfoPackDeliveries,
  getMyProviderProfile,
  getMyProviderServices,
  getProviderBookings,
  getProviderInfoPacksByUserId,
  updateInfoPack,
  type ProviderInfoPackRow,
} from '../../services/databaseService';
import { recordTourSeen, resolveTourForUser } from '../../services/tourService';
import { TOUR_KEYS } from '../../utils/coachMarkTours';
import type { BookingWithAddOns } from '../../types/database';
import { declaredCategories } from '../../features/intake-forms/formTemplates';
import {
  EMPTY_REACH,
  PACK_SECTIONS,
  clientPreviewNames,
  countClients,
  hasPlaceholder,
  hasSection,
  insertSection,
  isHeadingLine,
  packServiceLabel,
  splitUpcomingForPack,
  summarizeDeliveries,
  type PackDelivery,
} from '../../features/info-packs/infoPackLogic';
import {
  packTemplatesFor,
  rankPackTemplates,
  servicesForTemplate,
  type PackTemplate,
} from '../../features/info-packs/packTemplates';
import { BAKBAK, INFO_PACK_DARK, INFO_PACK_LIGHT, type InfoPackPalette } from '../../features/info-packs/infoPackPalette';
import { InfoPackSendSheet } from '../../features/info-packs/InfoPackSendSheet';
import { InfoPackWelcome } from '../../features/info-packs/InfoPackWelcome';

type Props = NativeStackScreenProps<ProviderAccountStackParamList, 'InfoPacks'>;

interface InfoPack {
  id: string;
  title: string;
  serviceNames: string[];
  content: string;
  createdAt: string;
}

function toPack(r: ProviderInfoPackRow): InfoPack {
  return {
    id: r.id,
    title: r.title,
    serviceNames: r.service_names ?? [],
    content: r.content,
    createdAt: r.created_at,
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** First body line of a pack, skipping its section headings. */
function previewText(content: string): string {
  return content.split('\n').map(l => l.trim()).filter(l => l && !isHeadingLine(l)).join(' ');
}

const RAIL_COUNT = 4;
const STARTER_COUNT = 3;

type Editing = { mode: 'create' } | { mode: 'edit'; pack: InfoPack };

// ─── Pack card ────────────────────────────────────────────────────────────────

function PackCard({
  pack, P, index, sent, opened, onEdit, onSend, onDelete,
}: {
  pack: InfoPack; P: InfoPackPalette; index: number; sent: number; opened: number;
  onEdit: () => void; onSend: () => void; onDelete: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    const delay = Math.min(index * 50, 250);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, delay, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, [fade, index, lift]);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: lift }] }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onEdit} accessibilityHint="Opens the pack to edit it">
        <View style={[pc.card, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}>
          <View style={pc.top}>
            <Ionicons name="document-text-outline" size={13} color={P.sub} />
            <Text style={[pc.kicker, { color: P.sub }]} numberOfLines={1}>{packServiceLabel(pack.serviceNames).toUpperCase()}</Text>
            <View style={[pc.editBtn, { backgroundColor: P.iconBg }]}>
              <Ionicons name="pencil" size={13} color={P.text} />
            </View>
          </View>
          <Text style={[pc.title, { color: P.text }]} numberOfLines={1}>{pack.title}</Text>
          <Text style={[pc.preview, { color: P.sub }]} numberOfLines={2}>{previewText(pack.content)}</Text>
          <View style={pc.meta}>
            <Ionicons name="eye-outline" size={13} color={P.sub} />
            <Text style={[pc.metaText, { color: P.sub }]}>
              {sent === 0 ? 'Not sent yet' : (
                <>Sent to <Text style={[pc.metaStrong, { color: P.text }]}>{sent}</Text> · <Text style={[pc.metaStrong, { color: P.text }]}>{opened}</Text> opened</>
              )}
            </Text>
            <Text style={[pc.date, { color: P.sub }]}>{fmtDate(pack.createdAt)}</Text>
          </View>
          <View style={pc.actions}>
            <TouchableOpacity style={[pc.delete, { backgroundColor: P.dangerBg }]} onPress={onDelete} activeOpacity={0.75} accessibilityLabel={`Delete ${pack.title}`}>
              <Ionicons name="trash-outline" size={16} color={P.danger} />
            </TouchableOpacity>
            <TouchableOpacity style={[pc.send, { backgroundColor: P.accent }]} onPress={onSend} activeOpacity={0.85}>
              <Ionicons name="paper-plane-outline" size={15} color={P.onAccent} />
              <Text style={[pc.sendText, { color: P.onAccent }]}>Send to client</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const pc = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  kicker: { flex: 1, fontFamily: BAKBAK, fontSize: 10, letterSpacing: 1.2 },
  editBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 },
  preview: { fontSize: 13, lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { flex: 1, fontSize: 12 },
  metaStrong: { fontWeight: '800' },
  date: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  delete: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  send: { flex: 1, height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { fontSize: 15, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderInfoPackScreen({ navigation }: Props) {
  const { isDarkMode: dark } = useTheme();
  const { user } = useAuth();
  const { showToast, showConfirm, DialogHost } = useAppDialog();
  const insets = useSafeAreaInsets();
  const P = dark ? INFO_PACK_DARK : INFO_PACK_LIGHT;

  // ── Data ──
  const [packs, setPacks] = useState<InfoPack[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [deliveries, setDeliveries] = useState<PackDelivery[]>([]);
  const [myServices, setMyServices] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [upcoming, setUpcoming] = useState<BookingWithAddOns[]>([]);
  const [upcomingState, setUpcomingState] = useState<'loading' | 'ready' | 'error'>('loading');

  // ── Form ──
  const [editing, setEditing] = useState<Editing | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [sendNow, setSendNow] = useState(false);
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<TextInputInstance>(null);

  // ── Sheets ──
  const [sending, setSending] = useState<InfoPack | null>(null);
  const [sendingBookingId, setSendingBookingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<InfoPack | null>(null);
  const [showAllExamples, setShowAllExamples] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const todayYmd = useMemo(() => dateToYMD(new Date()), []);
  const reach = useMemo(() => summarizeDeliveries(deliveries), [deliveries]);
  const templates = useMemo(() => packTemplatesFor(categories), [categories]);
  const rankedTemplates = useMemo(
    () => rankPackTemplates(templates, myServices, { title, content }),
    [templates, myServices, title, content],
  );
  const starterTemplates = useMemo(() => rankPackTemplates(templates, myServices, { title: '', content: '' }), [templates, myServices]);

  const loadUpcoming = useCallback(async () => {
    setUpcomingState('loading');
    try {
      // From today onwards; past and cancelled bookings never get a pack sent
      // from here (see isUpcomingOpenBooking).
      const rows = await getProviderBookings(0);
      setUpcoming(rows);
      setUpcomingState('ready');
    } catch (error) {
      logger.error('[InfoPacks] upcoming bookings load failed:', error);
      setUpcomingState('error');
    }
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoadState('loading');
    try {
      const [rows, services, profile] = await Promise.all([
        getProviderInfoPacksByUserId(user.id),
        getMyProviderServices(),
        getMyProviderProfile(),
      ]);
      const list = rows.map(toPack);
      setPacks(list);
      // Legacy duplicate service rows can share a display name; the chips are
      // name-based, so show each name once.
      setMyServices(Array.from(new Set(services.map(s => s.name).filter((n): n is string => !!n))));
      setCategories(declaredCategories(
        profile?.service_category,
        (profile as { service_categories?: string[] | null } | null)?.service_categories,
      ));
      setLoadState('ready');
      // Counts are secondary: a failure leaves the cards showing "Not sent yet"
      // rather than hiding the list.
      getInfoPackDeliveries(list.map(p => p.id))
        .then(setDeliveries)
        .catch(error => logger.error('[InfoPacks] deliveries load failed:', error));
    } catch (error) {
      logger.error('[InfoPacks] load failed:', error);
      setLoadState('error');
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
    void loadUpcoming();
  }, [load, loadUpcoming]);

  // First visit: the welcome, once per account (users.seen_tours).
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    resolveTourForUser(TOUR_KEYS.PROVIDER_INFO_PACKS, [{ key: 'welcome' }], user.id)
      .then(decision => {
        if (!alive || !decision.show) return;
        setWelcomeOpen(true);
        void recordTourSeen(TOUR_KEYS.PROVIDER_INFO_PACKS, user.id);
      })
      .catch(error => logger.error('[InfoPacks] welcome check failed:', error));
    return () => { alive = false; };
  }, [user?.id]);

  // ── Form helpers ──
  const isFirstPack = packs.length === 0;

  const openCreate = useCallback((template?: PackTemplate) => {
    setEditing({ mode: 'create' });
    setTitle(template?.title ?? '');
    setContent(template?.content ?? '');
    setSelectedServices(template ? servicesForTemplate(template, myServices) : []);
    setPickedTemplateId(template?.id ?? null);
    // Sending to clients already booked is a choice. It starts on only for a
    // provider's very first pack, the one time it's what they'd expect.
    setSendNow(isFirstPack);
  }, [isFirstPack, myServices]);

  const openEdit = useCallback((pack: InfoPack) => {
    setEditing({ mode: 'edit', pack });
    setTitle(pack.title);
    setContent(pack.content);
    setSelectedServices(pack.serviceNames);
    setPickedTemplateId(null);
    setSendNow(false);
  }, []);

  const closeForm = useCallback(() => {
    Keyboard.dismiss();
    setEditing(null);
    setShowAllExamples(false);
  }, []);

  const applyTemplate = useCallback((tpl: PackTemplate) => {
    Haptics.selectionAsync().catch(() => {});
    setTitle(tpl.title);
    setContent(tpl.content);
    setSelectedServices(servicesForTemplate(tpl, myServices));
    setPickedTemplateId(tpl.id);
    setShowAllExamples(false);
  }, [myServices]);

  const toggleService = useCallback((name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedServices(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  }, []);

  const addSection = useCallback((heading: string) => {
    Haptics.selectionAsync().catch(() => {});
    setContent(prev => insertSection(prev, heading));
    setTimeout(() => contentRef.current?.focus(), 50);
  }, []);

  // Who saving would reach right now, if the provider switches sending on.
  const formSplit = useMemo(
    () => splitUpcomingForPack(upcoming, selectedServices, todayYmd),
    [upcoming, selectedServices, todayYmd],
  );
  const reachCount = countClients(formSplit.matching);
  const reachNames = clientPreviewNames(formSplit.matching);
  const canSendNow = upcomingState === 'ready' && reachCount > 0;

  const handleSave = useCallback(async () => {
    if (!editing || !user?.id || saving) return;
    if (!title.trim() || !content.trim()) { showToast('Add a title and some content first.', 'warning'); return; }
    const fields = {
      title: title.trim(),
      // Legacy display label; matching runs on service_names.
      service: selectedServices.length > 0 ? selectedServices[0]!.toUpperCase() : 'GENERAL',
      service_names: selectedServices,
      content: content.trim(),
    };
    setSaving(true);
    try {
      if (editing.mode === 'edit') {
        const row = await updateInfoPack(editing.pack.id, fields);
        const updated = toPack(row);
        setPacks(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        showToast('Changes saved.', 'success');
      } else {
        const willSend = sendNow && canSendNow;
        const row = await createInfoPack({ provider_id: user.id, ...fields, send_to_upcoming: willSend });
        setPacks(prev => [toPack(row), ...prev]);
        showToast(willSend ? `Saved and sent to ${reachCount} upcoming client${reachCount === 1 ? '' : 's'}.` : 'Saved. New bookings will get it.', 'success');
        if (willSend) {
          getInfoPackDeliveries([row.id])
            .then(rows => setDeliveries(prev => [...prev.filter(d => d.infoPackId !== row.id), ...rows]))
            .catch(error => logger.error('[InfoPacks] deliveries refresh failed:', error));
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeForm();
    } catch (error) {
      logger.error('[InfoPacks] save failed:', error);
      showToast("Couldn't save this pack. Please try again.", 'error');
    } finally {
      setSaving(false);
    }
  }, [editing, user?.id, saving, title, content, selectedServices, sendNow, canSendNow, reachCount, showToast, closeForm]);

  const performDelete = useCallback(async (id: string) => {
    try {
      await deleteInfoPack(id);
      setPacks(prev => prev.filter(p => p.id !== id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (error) {
      logger.error('[InfoPacks] delete failed:', error);
      showToast("Couldn't delete this pack. Please try again.", 'error');
    }
  }, [showToast]);

  const handleDelete = useCallback((pack: InfoPack) => {
    showConfirm(
      'Delete this pack?',
      `"${pack.title}" will be deleted. Clients who already have it keep their copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void performDelete(pack.id); } },
      ],
    );
  }, [performDelete, showConfirm]);

  // ── Send sheet ──
  const sendSplit = useMemo(
    () => (sending ? splitUpcomingForPack(upcoming, sending.serviceNames, todayYmd) : { matching: [], other: [] }),
    [sending, upcoming, todayYmd],
  );
  const sentToBookings = sending ? (reach[sending.id] ?? EMPTY_REACH).bookingIds : EMPTY_REACH.bookingIds;

  const handlePickBooking = useCallback(async (booking: BookingWithAddOns) => {
    if (!sending) return;
    setSendingBookingId(booking.id);
    try {
      await attachInfoPackToBooking(booking.id, sending.id);
      setDeliveries(prev => [...prev, { infoPackId: sending.id, bookingId: booking.id, viewedAt: null }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`Sent to ${booking.customer_name || 'your client'}.`, 'success');
    } catch (error) {
      logger.error('[InfoPacks] send failed:', error);
      showToast(toUserMessageAllowingDbGuard(error, "Couldn't send this pack. Please try again.", 'InfoPacks.send'), 'error');
    } finally {
      setSendingBookingId(null);
    }
  }, [sending, showToast]);

  // ── Header ──
  const inForm = editing !== null;
  const headerTitle = !inForm ? 'Info Packs' : editing.mode === 'edit' ? 'Edit Pack' : 'New Pack';
  const draftPreview: InfoPack = {
    id: 'draft',
    title: title.trim() || 'Untitled pack',
    serviceNames: selectedServices,
    content: content.trim() || 'Nothing written yet.',
    createdAt: new Date().toISOString(),
  };

  const welcomeExample = starterTemplates[0];
  const welcomeLines = welcomeExample
    ? welcomeExample.content.split('\n').filter(l => !isHeadingLine(l) && !hasPlaceholder(l))
    : [];

  return (
    <ThemedBackground style={{ backgroundColor: P.bg }}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => (inForm ? closeForm() : navigation.goBack())}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
            accessibilityLabel={inForm ? 'Close' : 'Back'}
          >
            <Ionicons name={inForm ? 'close' : 'chevron-back'} size={18} color={P.text} />
          </TouchableOpacity>
          <View style={s.titleWrap}>
            <Text style={[s.screenTitle, { color: P.text }]}>{headerTitle}</Text>
            {!inForm && (
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setWelcomeOpen(true); }} hitSlop={10} activeOpacity={0.7} style={[s.infoBtn, { backgroundColor: P.iconBg }]} accessibilityLabel="How Info Packs work">
                <Ionicons name="information" size={13} color={P.text} />
              </TouchableOpacity>
            )}
          </View>
          {!inForm ? (
            <TouchableOpacity onPress={() => openCreate()} style={[s.newBtn, { backgroundColor: P.accent }]} activeOpacity={0.82}>
              <Ionicons name="add" size={16} color={P.onAccent} />
              <Text style={[s.newBtnText, { color: P.onAccent }]}>New</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setPreviewing(draftPreview)} style={[s.iconBtn, { backgroundColor: P.iconBg }]} activeOpacity={0.8} accessibilityLabel="See it as your client will">
              <Ionicons name="eye-outline" size={18} color={P.text} />
            </TouchableOpacity>
          )}
        </View>

        {!inForm ? (
          loadState === 'loading' ? (
            <View style={s.listContent}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[pc.card, { backgroundColor: P.card, borderColor: P.border, shadowOpacity: 0 }]}>
                  <View style={[s.skLine, { width: '30%', backgroundColor: P.skeleton }]} />
                  <View style={[s.skLine, { width: '70%', height: 16, backgroundColor: P.skeleton }]} />
                  <View style={[s.skLine, { width: '90%', backgroundColor: P.skeleton }]} />
                  <View style={[s.skBlock, { backgroundColor: P.skeleton }]} />
                </View>
              ))}
            </View>
          ) : loadState === 'error' ? (
            <View style={s.center}>
              <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                <Ionicons name="cloud-offline-outline" size={30} color={P.sub} />
              </View>
              <Text style={[s.emptyTitle, { color: P.text }]}>Couldn't load your packs</Text>
              <Text style={[s.emptySub, { color: P.sub }]}>Check your connection and try again.</Text>
              <TouchableOpacity style={[s.pillBtn, { backgroundColor: P.accent }]} onPress={() => void load()} activeOpacity={0.85}>
                <Text style={[s.pillBtnText, { color: P.onAccent }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={packs}
              keyExtractor={p => p.id}
              contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 90 }]}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={packs.length > 0 ? (
                <Text style={[s.listSub, { color: P.sub }]}>Sent automatically when a client books a matching service.</Text>
              ) : undefined}
              renderItem={({ item, index }) => {
                const r = reach[item.id] ?? EMPTY_REACH;
                return (
                  <PackCard
                    pack={item} P={P} index={index} sent={r.sent} opened={r.opened}
                    onEdit={() => openEdit(item)}
                    onSend={() => { setSending(item); if (upcomingState === 'error') void loadUpcoming(); }}
                    onDelete={() => handleDelete(item)}
                  />
                );
              }}
              ListEmptyComponent={
                <View>
                  <View style={s.emptyTop}>
                    <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                      <Ionicons name="document-text-outline" size={30} color={P.sub} />
                    </View>
                    <Text style={[s.emptyTitle, { color: P.text }]}>No info packs yet</Text>
                    <Text style={[s.emptySub, { color: P.sub }]}>Write aftercare, prep and what-to-bring notes once. They go to clients automatically.</Text>
                  </View>
                  <Text style={[s.label, { color: P.sub }]}>STARTER PACKS</Text>
                  {starterTemplates.slice(0, STARTER_COUNT).map(tpl => (
                    <TouchableOpacity
                      key={tpl.id}
                      style={[s.starter, { backgroundColor: P.card, borderColor: P.border }]}
                      activeOpacity={0.85}
                      onPress={() => openCreate(tpl)}
                    >
                      <View style={[s.starterIcon, { backgroundColor: P.iconBg }]}>
                        <Ionicons name="document-text-outline" size={17} color={P.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.exKind, { color: P.sub }]}>{tpl.kind.toUpperCase()}</Text>
                        <Text style={[s.starterTitle, { color: P.text }]} numberOfLines={1}>{tpl.title}</Text>
                        <Text style={[s.starterPreview, { color: P.sub }]} numberOfLines={1}>{previewText(tpl.content)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {starterTemplates.length > STARTER_COUNT && (
                    <TouchableOpacity style={s.textBtn} onPress={() => { openCreate(); setShowAllExamples(true); }} activeOpacity={0.7}>
                      <Text style={[s.textBtnText, { color: P.accent }]}>See all {starterTemplates.length}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.textBtn} onPress={() => openCreate()} activeOpacity={0.7}>
                    <Text style={[s.textBtnText, { color: P.accent }]}>Write your own</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )
        ) : (
          <KeyboardDismissView style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[s.form, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              {editing.mode === 'create' && rankedTemplates.length > 0 && (
                <View>
                  <View style={s.labelRow}>
                    <Text style={[s.label, { color: P.sub, marginBottom: 0 }]}>START FROM AN EXAMPLE</Text>
                    {rankedTemplates.length > RAIL_COUNT && (
                      <TouchableOpacity onPress={() => setShowAllExamples(true)} activeOpacity={0.7} hitSlop={8}>
                        <Text style={[s.labelAction, { color: P.accent }]}>See all {rankedTemplates.length}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} style={s.railWrap} keyboardShouldPersistTaps="handled">
                    {rankedTemplates.slice(0, RAIL_COUNT).map(tpl => {
                      const picked = pickedTemplateId === tpl.id;
                      return (
                        <TouchableOpacity
                          key={tpl.id}
                          style={[s.exCard, { backgroundColor: picked ? P.accentTint : P.card, borderColor: picked ? P.accent : P.border }]}
                          activeOpacity={0.85}
                          onPress={() => applyTemplate(tpl)}
                        >
                          <View style={s.exTop}>
                            <Text style={[s.exKind, { color: P.sub, flex: 1 }]} numberOfLines={1}>{tpl.kind.toUpperCase()}</Text>
                            {picked && <Ionicons name="checkmark" size={14} color={P.accent} />}
                          </View>
                          <Text style={[s.exTitle, { color: P.text }]} numberOfLines={2}>{tpl.title}</Text>
                          <Text style={[s.exPreview, { color: P.sub }]} numberOfLines={3}>{previewText(tpl.content)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View>
                <Text style={[s.label, { color: P.sub }]}>TITLE</Text>
                <View style={[s.inputWrap, { backgroundColor: P.card, borderColor: P.border }]}>
                  <TextInput
                    style={[s.input, { color: P.text }]}
                    placeholder="e.g. Lash Lift aftercare"
                    placeholderTextColor={P.sub}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={80}
                    returnKeyType="next"
                    onSubmitEditing={() => contentRef.current?.focus()}
                  />
                </View>
              </View>

              <View>
                <View style={s.labelRow}>
                  <Text style={[s.label, { color: P.sub, marginBottom: 0 }]}>ATTACHES TO SERVICES</Text>
                  {myServices.length > 1 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedServices(selectedServices.length === myServices.length ? [] : myServices);
                      }}
                      activeOpacity={0.7}
                      hitSlop={8}
                    >
                      <Text style={[s.labelAction, { color: P.accent }]}>
                        {selectedServices.length === myServices.length ? 'Clear all' : 'Select all'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[s.hint, { color: P.sub }]}>
                  {selectedServices.length === 0
                    ? 'None picked, so it goes with every booking.'
                    : 'New bookings for these get it automatically.'}
                </Text>
                <View style={s.chips}>
                  {myServices.length === 0 ? (
                    <Text style={[s.hint, { color: P.sub }]}>No services on your profile yet.</Text>
                  ) : myServices.map(name => {
                    const on = selectedServices.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[s.chip, { borderColor: on ? P.accent : P.border, backgroundColor: on ? P.accentTint : P.card }]}
                        onPress={() => toggleService(name)}
                        activeOpacity={0.7}
                      >
                        {on && <Ionicons name="checkmark" size={12} color={P.text} />}
                        <Text style={[s.chipText, { color: on ? P.text : P.sub }]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={[s.label, { color: P.sub }]}>CONTENT</Text>
                <View style={[s.contentBox, { backgroundColor: P.card, borderColor: P.border }]}>
                  <TextInput
                    ref={contentRef}
                    style={[s.input, s.textArea, { color: P.text }]}
                    placeholder="Write it in your own words."
                    placeholderTextColor={P.sub}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={[s.insertRow, { backgroundColor: P.surface, borderTopColor: P.border }]}>
                    <Text style={[s.insertLabel, { color: P.sub }]}>ADD</Text>
                    {PACK_SECTIONS.map(sec => {
                      const used = hasSection(content, sec.heading);
                      return (
                        <TouchableOpacity
                          key={sec.key}
                          disabled={used}
                          onPress={() => addSection(sec.heading)}
                          style={[s.insertChip, { backgroundColor: used ? 'transparent' : P.card, opacity: used ? 0.45 : 1 }]}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.insertChipText, { color: P.text }]}>{sec.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                {hasPlaceholder(content) && (
                  <Text style={[s.hint, { color: P.sub, marginTop: 8, marginBottom: 0 }]}>
                    Replace the [bracketed] parts with your own details before saving.
                  </Text>
                )}
              </View>

              {editing.mode === 'edit' ? (
                <View style={[s.reach, { backgroundColor: P.surface }]}>
                  <View style={[s.reachIcon, { backgroundColor: P.iconBg }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={P.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reachTitle, { color: P.text }]}>Clients who already have it keep their copy</Text>
                    <Text style={[s.reachSub, { color: P.sub }]}>Changes apply to bookings from now on.</Text>
                  </View>
                </View>
              ) : (
                <View style={[s.reach, { backgroundColor: P.surface }]}>
                  <View style={[s.reachIcon, { backgroundColor: canSendNow ? P.accent : P.iconBg }]}>
                    <Ionicons name="person-outline" size={16} color={canSendNow ? P.onAccent : P.sub} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reachTitle, { color: canSendNow ? P.text : P.sub }]}>
                      {upcomingState === 'loading'
                        ? 'Checking your upcoming bookings…'
                        : upcomingState === 'error'
                          ? "Couldn't check your upcoming bookings"
                          : canSendNow
                            ? `Send to ${reachCount} upcoming client${reachCount === 1 ? '' : 's'} now`
                            : 'No upcoming bookings match yet'}
                    </Text>
                    <Text style={[s.reachSub, { color: P.sub }]} numberOfLines={2}>
                      {canSendNow && sendNow ? `${reachNames} will get a notification.` : 'Bookings made from now on get it automatically.'}
                    </Text>
                  </View>
                  <Switch
                    value={canSendNow && sendNow}
                    onValueChange={v => { Haptics.selectionAsync().catch(() => {}); setSendNow(v); }}
                    disabled={!canSendNow}
                    trackColor={{ false: P.border, true: P.accent }}
                    thumbColor={Platform.OS === 'android' ? P.card : undefined}
                    accessibilityLabel="Send to upcoming clients now"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: P.accent, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color={P.onAccent} />
                  : <Text style={[s.saveBtnText, { color: P.onAccent }]}>{editing.mode === 'edit' ? 'Save changes' : 'Save'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardDismissView>
        )}
      </SafeAreaView>

      <InfoPackSendSheet
        pack={sending}
        visible={!!sending}
        P={P}
        matching={sendSplit.matching}
        other={sendSplit.other}
        sentBookingIds={sentToBookings}
        loading={upcomingState === 'loading'}
        error={upcomingState === 'error'}
        sendingBookingId={sendingBookingId}
        onRetry={() => void loadUpcoming()}
        onPickBooking={handlePickBooking}
        onClose={() => { if (!sendingBookingId) setSending(null); }}
      />

      {/* All examples for the provider's service types */}
      <Modal visible={showAllExamples} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShowAllExamples(false)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAllExamples(false)} />
          <View style={[s.sheet, { backgroundColor: P.card, paddingBottom: Math.max(28, insets.bottom + 16) }]}>
            <View style={[s.handle, { backgroundColor: P.border }]} />
            <Text style={[s.sheetTitle, { color: P.text }]}>Examples</Text>
            <Text style={[s.hint, { color: P.sub }]}>Pick one to start from. You can change every word.</Text>
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              {rankedTemplates.map(tpl => (
                <TouchableOpacity key={tpl.id} style={[s.sheetRow, { borderBottomColor: P.border }]} activeOpacity={0.75} onPress={() => applyTemplate(tpl)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.exKind, { color: P.sub }]}>{tpl.kind.toUpperCase()}</Text>
                    <Text style={[s.starterTitle, { color: P.text }]}>{tpl.title}</Text>
                    <Text style={[s.starterPreview, { color: P.sub }]} numberOfLines={1}>{previewText(tpl.content)}</Text>
                  </View>
                  {pickedTemplateId === tpl.id
                    ? <Ionicons name="checkmark" size={16} color={P.accent} />
                    : <Ionicons name="chevron-forward" size={16} color={P.sub} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* How the client sees it */}
      <Modal visible={!!previewing} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPreviewing(null)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPreviewing(null)} />
          <View style={[s.sheet, { backgroundColor: P.bg, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '80%' }]}>
            <View style={[s.handle, { backgroundColor: P.border }]} />
            {previewing && (
              <>
                <Text style={[s.exKind, { color: P.sub }]}>HOW YOUR CLIENT SEES IT</Text>
                <Text style={[s.previewTitle, { color: P.text }]} numberOfLines={2}>{previewing.title}</Text>
                <Text style={[s.previewServices, { color: P.sub }]}>{packServiceLabel(previewing.serviceNames)}</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  {previewing.content.split('\n').map((line, i) => (
                    isHeadingLine(line)
                      ? <Text key={i} style={[s.previewHeading, { color: P.sub }]}>{line.trim()}</Text>
                      : <Text key={i} style={[s.previewLine, { color: P.text }]}>{line}</Text>
                  ))}
                </ScrollView>
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: P.accent, marginTop: 18 }]} activeOpacity={0.85} onPress={() => setPreviewing(null)}>
                  <Text style={[s.saveBtnText, { color: P.onAccent }]}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <InfoPackWelcome
        visible={welcomeOpen}
        P={P}
        exampleTitle={welcomeExample?.title ?? 'Aftercare'}
        exampleLines={welcomeLines.length > 0 ? welcomeLines : ['Keep it dry for 24 hours.', 'Message me with any questions.']}
        serviceChips={myServices}
        onStart={() => { setWelcomeOpen(false); openCreate(); }}
        onClose={() => setWelcomeOpen(false)}
      />

      <DialogHost />
    </ThemedBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  screenTitle: { fontFamily: BAKBAK, fontSize: 22, letterSpacing: -0.2 },
  infoBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 100 },
  newBtnText: { fontSize: 13, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listSub: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 14, paddingHorizontal: 20 },
  skLine: { height: 10, borderRadius: 5, marginBottom: 10 },
  skBlock: { height: 46, borderRadius: 14, marginTop: 6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyTop: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 22, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  pillBtn: { marginTop: 10, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 },
  pillBtnText: { fontSize: 14, fontWeight: '700' },

  label: { fontFamily: BAKBAK, fontSize: 11, letterSpacing: 1.3, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  labelAction: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 10 },

  starter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 10 },
  starterIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  starterTitle: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  starterPreview: { fontSize: 12, marginTop: 2 },
  textBtn: { alignItems: 'center', paddingVertical: 12 },
  textBtnText: { fontSize: 14, fontWeight: '700' },

  form: { paddingHorizontal: 16, paddingTop: 8, gap: 22 },
  railWrap: { marginHorizontal: -16 },
  rail: { paddingHorizontal: 16, gap: 10 },
  exCard: { width: 176, borderRadius: 16, borderWidth: 1, padding: 12 },
  exTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  exKind: { fontFamily: BAKBAK, fontSize: 9, letterSpacing: 1.1 },
  exTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  exPreview: { fontSize: 12, lineHeight: 17 },

  inputWrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  input: { fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  contentBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  textArea: { minHeight: 150, lineHeight: 22, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  insertLabel: { fontFamily: BAKBAK, fontSize: 9, letterSpacing: 1.1, marginRight: 2 },
  insertChip: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  insertChipText: { fontSize: 12, fontWeight: '600' },

  reach: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  reachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reachTitle: { fontSize: 14, fontWeight: '700' },
  reachSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  saveBtn: { borderRadius: 100, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: BAKBAK, fontSize: 20, marginBottom: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  previewTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 6 },
  previewServices: { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 14 },
  previewHeading: { fontFamily: BAKBAK, fontSize: 11, letterSpacing: 1.3, marginTop: 10, marginBottom: 4 },
  previewLine: { fontSize: 15, lineHeight: 23 },
});
