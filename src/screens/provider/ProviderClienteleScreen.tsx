import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  Switch,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import {
  getProviderClientele,
  sendRebookPrompt,
  sendAnnouncement,
  queueScheduledAnnouncement,
  getClientBookingHistory,
  getClientBeautyProfileForProvider,
  getMyClientNote,
  saveMyClientNote,
  type ClientBeautyProfile,
  getMyAnnouncementFollowers,
  type AnnouncementFollower,
  getMyProviderProfile,
  getClientReliabilityStatsBatch,
  ClientReliabilityStats,
  getOrCreateConversation,
} from '../../services/databaseService';
import type { ClienteleMember, DbBooking } from '../../types/database';
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { formatTime12, formatTime12Safe } from '../../utils/dateUtils';
import SlidingTabs from '../../components/SlidingTabs';
import { toUserMessage, toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { reportError } from '../../utils/logger';
import { ClientBeautyProfileDetails } from '../../features/beauty-profile/ClientBeautyProfileDetails';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { interestedRecipientIds } from '../../features/providers/announcementAudience';
import { readableSheet } from '../../constants/readableWidth';
import { tr } from '../../i18n';
import { trp } from '../../i18n';
import { useTranslation } from '../../i18n';

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033', onAccent: '#FFFFFF',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  sep:     'rgba(126,102,103,0.08)',
  iconBg:  'rgba(92,64,51,0.12)',
};
const DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197', onAccent: '#1A1815',
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
function formatShort(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch { return iso; }
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}
// ── Tab Bar ───────────────────────────────────────────────────────────────────

type Tab = 'all' | 'repeat' | 'new' | 'lapsed';

function TabBar({ active, onChange, counts, P }: {
  active: Tab; onChange: (t: Tab) => void; counts: Record<Tab, number>; P: typeof LIGHT;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const tabs = [
    { key: 'all' as Tab, label: tr('common.all'), count: counts.all },
    { key: 'repeat' as Tab, label: tr('providerBusiness.clientele.tab.repeat'), count: counts.repeat },
    { key: 'new' as Tab, label: tr('common.new'), count: counts.new },
    { key: 'lapsed' as Tab, label: tr('providerBusiness.clientele.tab.lapsed'), count: counts.lapsed },
  ];
  return (
    <View style={[tbSt.wrap, { backgroundColor: P.surface }]}>
      <SlidingTabs
        tabs={tabs}
        activeKey={active}
        onPress={onChange}
        accentColor={P.accent}
        activeTextColor={P.onAccent}
        inactiveTextColor={P.sub}
        scrollable={false}
        height={40}
      />
    </View>
  );
}
const tbSt = StyleSheet.create({
  // Row + fixed height: SlidingTabs (scrollable={false}) renders a flex:1
  // wrapper, so its parent must be a bounded-height row or the bar collapses
  // thin and the sliding indicator overflows onto the list below.
  wrap: { flexDirection: 'row', height: 48, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 4 },
});

// ── Client sheet ──────────────────────────────────────────────────────────────
// Opens from a client's card: their Beauty Profile (once you've accepted a
// booking from them), your own private notes on them, and every booking
// they've had with you, newest first.

type Loadable<T> = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; value: T };

function ClientSheet({ member, onClose, P, isDark }: {
  member: ClienteleMember | null;
  onClose: () => void;
  P: typeof LIGHT;
  isDark: boolean;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  // Inside a <Modal>, so the live inset, not SafeAreaView (inert here).
  const bottomInset = useSystemBottomInset();
  const clientId = member?.user_id ?? null;
  const [history, setHistory] = useState<Loadable<DbBooking[]>>({ state: 'loading' });
  const [profile, setProfile] = useState<Loadable<ClientBeautyProfile | null>>({ state: 'loading' });
  const [noteState, setNoteState] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Shown in the notes box itself: a toast would sit behind this Modal.
  const [saveError, setSaveError] = useState('');
  // Which client the in-flight loads belong to, so a slow answer for the
  // last client opened can't land in this one's sheet.
  const forId = useRef<string | null>(null);

  const loadHistory = useCallback((id: string) => {
    setHistory({ state: 'loading' });
    getClientBookingHistory(id)
      .then(v => { if (forId.current === id) setHistory({ state: 'ready', value: v }); })
      .catch(e => {
        if (forId.current !== id) return;
        setHistory({ state: 'failed' });
        reportError(e, 'ProviderClienteleScreen.history');
      });
  }, []);
  const loadProfile = useCallback((id: string) => {
    setProfile({ state: 'loading' });
    getClientBeautyProfileForProvider(id)
      .then(v => { if (forId.current === id) setProfile({ state: 'ready', value: v }); })
      .catch(e => {
        if (forId.current !== id) return;
        setProfile({ state: 'failed' });
        reportError(e, 'ProviderClienteleScreen.beautyProfile');
      });
  }, []);
  const loadNote = useCallback((id: string) => {
    setNoteState('loading');
    getMyClientNote(id)
      .then(n => {
        if (forId.current !== id) return;
        setNote(n?.note ?? '');
        setSavedNote(n?.note ?? '');
        setSavedAt(n?.updatedAt ?? null);
        setNoteState('ready');
      })
      .catch(e => {
        if (forId.current !== id) return;
        setNoteState('failed');
        reportError(e, 'ProviderClienteleScreen.note');
      });
  }, []);

  useEffect(() => {
    forId.current = clientId;
    if (!clientId) return;
    setNote(''); setSavedNote(''); setSavedAt(null); setSaveError('');
    loadHistory(clientId);
    loadProfile(clientId);
    loadNote(clientId);
  }, [clientId, loadHistory, loadProfile, loadNote]);

  const dirty = noteState === 'ready' && note.trim() !== savedNote.trim();

  const saveNote = async (): Promise<boolean> => {
    if (!clientId || !dirty || saving) return true;
    setSaving(true);
    setSaveError('');
    try {
      const at = await saveMyClientNote(clientId, note);
      const trimmed = note.trim();
      setNote(trimmed);
      setSavedNote(trimmed);
      setSavedAt(at);
      return true;
    } catch (e) {
      setSaveError(`${toUserMessageAllowingDbGuard(e, tr('providerBusiness.ui.noteSaveFailed'), 'ProviderClienteleScreen.saveNote')} ${tr('providerBusiness.ui.tapSaveAgain')}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Closing keeps what you typed: an unsaved note is saved on the way out.
  // If that save fails the sheet stays open with the reason, and closing a
  // second time lets the change go rather than trapping them here.
  const close = async () => {
    if (dirty && !saveError && !(await saveNote())) return;
    onClose();
  };

  const bookings = history.state === 'ready' ? history.value : [];
  const sectionLabel = (label: string) => (
    <Text style={[csSt.sectionLabel, { color: P.sub }]}>{label}</Text>
  );
  const retry = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={csSt.center}>
      <Text style={[csSt.emptySub, { color: P.sub }]}>{tr('providerBusiness.ui.couldntLoad', { what: label })}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={member !== null} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The dim fills the whole window BEHIND the sheet, so the sheet's
          rounded top corners show the dim, not the screen, through them. */}
      <View style={csSt.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityRole="button" accessibilityLabel={tr('common.close')} />
      <View style={[csSt.sheet, { backgroundColor: P.surface, paddingBottom: bottomInset }]}>
        <View style={[csSt.handle, { backgroundColor: P.border }]} />
        <View style={csSt.header}>
          {member && (
            <View style={[csSt.avatar, { backgroundColor: avatarColor(member.customer_name) + '22', borderColor: avatarColor(member.customer_name) + '44' }]}>
              <Text style={[csSt.avatarText, { color: avatarColor(member.customer_name) }]}>{initials(member.customer_name)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[csSt.title, { color: P.text }]}>{member?.customer_name ?? ''}</Text>
            <Text style={[csSt.sub, { color: P.sub }]}>
              {member ? trp('providerBusiness.ui.bookingsWithYou', member.booking_count) : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={close} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={tr('common.close')}>
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
          {/* ── Beauty Profile ── */}
          {sectionLabel('Beauty Profile')}
          <View style={[csSt.block, { backgroundColor: P.card }]}>
            {profile.state === 'loading' ? (
              <View style={csSt.center}><ActivityIndicator color={P.accent} /></View>
            ) : profile.state === 'failed' ? (
              retry('their Beauty Profile', () => clientId && loadProfile(clientId))
            ) : profile.value === null ? (
              // Null is "not shared yet", never "nothing on file" — saying
              // nothing here would read as "no allergies".
              <Text style={[csSt.emptySub, csSt.blockText, { color: P.sub }]}>
                {tr('providerBusiness.ui2.sharedWithYouOnceYouVe')}
              </Text>
            ) : (
              <ClientBeautyProfileDetails
                profile={profile.value}
                text={P.text}
                sub={P.sub}
                surface={P.surface}
                divider={P.border}
                isDark={isDark}
              />
            )}
          </View>

          {/* ── Your notes ── */}
          {sectionLabel('Your notes')}
          <View style={[csSt.block, { backgroundColor: P.card }]}>
            {noteState === 'loading' ? (
              <View style={csSt.center}><ActivityIndicator color={P.accent} /></View>
            ) : noteState === 'failed' ? (
              retry('your notes', () => clientId && loadNote(clientId))
            ) : (
              <>
                <TextInput
                  value={note}
                  onChangeText={t => { setNote(t); if (saveError) setSaveError(''); }}
                  placeholder={tr('providerBusiness.ui2.anythingToRememberAboutThemPreferences')}
                  placeholderTextColor={P.sub}
                  multiline
                  maxLength={2000}
                  style={[csSt.noteInput, { color: P.text }]}
                  accessibilityLabel={tr('providerBusiness.ui2.yourNotesOnThisClient')}
                />
                <View style={csSt.noteFooter}>
                  <Text style={[csSt.noteHint, { color: saveError ? DANGER : P.sub }]}>
                    {saveError ? saveError : dirty ? 'Not saved yet' : savedAt ? `Only you can see this · Saved ${formatShort(savedAt)}` : 'Only you can see this'}
                  </Text>
                  {dirty && (
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); saveNote(); }}
                      disabled={saving}
                      activeOpacity={0.7}
                      style={[csSt.saveBtn, { backgroundColor: P.accent }]}
                    >
                      {saving
                        ? <ActivityIndicator size="small" color={P.onAccent} />
                        : <Text style={[csSt.saveText, { color: P.onAccent }]}>{tr('common.save')}</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ── Booking history ── */}
          {sectionLabel('Booking history')}
          {history.state === 'loading' ? (
            <View style={csSt.center}><ActivityIndicator color={P.accent} /></View>
          ) : history.state === 'failed' ? (
            retry('their history', () => clientId && loadHistory(clientId))
          ) : bookings.length === 0 ? (
            <View style={csSt.center}><Text style={[csSt.emptySub, { color: P.sub }]}>{tr('providerBusiness.clientele.history.empty')}</Text></View>
          ) : (
            bookings.map(b => {
              const statusColor = b.status === 'completed' ? GREEN
                : b.status === 'cancelled' ? DANGER : P.sub;
              const d = new Date(b.booking_date);
              return (
                <View key={b.id} style={[csSt.bookingRow, { borderBottomColor: P.border }]}>
                  <View style={[csSt.dateBadge, { backgroundColor: P.card }]}>
                    <Text style={[csSt.dateDay, { color: P.text }]}>{d.getDate()}</Text>
                    <Text style={[csSt.dateMon, { color: P.sub }]}>{d.toLocaleString('en-GB', { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[csSt.svcName, { color: P.text }]} numberOfLines={1}>{b.service_name_snapshot}</Text>
                    <Text style={[csSt.timeText, { color: P.sub }]}>
                      {[d.getFullYear() !== new Date().getFullYear() ? String(d.getFullYear()) : null,
                        b.booking_time ? formatTime12Safe(b.booking_time) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[csSt.amount, { color: P.text }]}>£{(b.base_price + b.add_ons_total).toFixed(0)}</Text>
                    <View style={[csSt.statusPill, { backgroundColor: statusColor + '22' }]}>
                      <Text style={[csSt.statusText, { color: statusColor }]}>{b.status.replace(/_/g, ' ')}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const csSt = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { ...readableSheet, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%' },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  avatar:       { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 15, fontWeight: '700' },
  title:        { fontSize: 18, fontWeight: '700' },
  sub:          { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  block:        { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  blockText:    { paddingVertical: 12 },
  center:       { paddingVertical: 24, alignItems: 'center' },
  emptySub:     { fontSize: 14 },
  noteInput:    { fontSize: 14, lineHeight: 20, minHeight: 88, paddingTop: 10, paddingBottom: 6, textAlignVertical: 'top' },
  noteFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, gap: 8 },
  noteHint:     { fontSize: 12, flex: 1 },
  saveBtn:      { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, minWidth: 64, alignItems: 'center' },
  saveText:     { fontSize: 13, fontWeight: '700' },
  bookingRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dateBadge:    { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateDay:      { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  dateMon:      { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  svcName:      { fontSize: 14, fontWeight: '600' },
  timeText:     { fontSize: 12, marginTop: 2 },
  amount:       { fontSize: 13, fontWeight: '700' },
  statusPill:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});

// ── Announcement Sheet ────────────────────────────────────────────────────────

type AudienceKey = 'all' | 'interested' | 'repeat' | 'new' | 'lapsed' | 'followers';

/** Audiences counted in people rather than clients: they reach people who haven't booked. */
const countsPeople = (a: AudienceKey) => a === 'followers' || a === 'interested';

const clientCount = (n: number) => `${n} client${n !== 1 ? 's' : ''}`;
const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

function tomorrow9am() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function AnnouncementSheet({ visible, counts, clients, followers, onClose, onSent, onScheduled, onError, P }: {
  visible: boolean;
  counts: Record<AudienceKey, number>;
  clients: ClienteleMember[];
  /** People who saved you or have your bell on (ids only). */
  followers: AnnouncementFollower[];
  onClose: () => void;
  onSent: (who: string) => void;
  onScheduled: (when: Date) => void;
  onError: (msg: string) => void;
  P: typeof LIGHT;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const [audience, setAudience] = useState<AudienceKey>(clients.length > 0 ? 'all' : 'followers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [schedAt, setSchedAt] = useState<Date>(tomorrow9am);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const { isDarkMode } = useTheme();
  const bottomSafeGap = useSystemBottomInset() + 16;

  const audienceOptions: { key: AudienceKey; label: string; icon: string }[] = [
    { key: 'all',    label: tr('providerBusiness.clientele.audience.all'),    icon: 'people-outline' },
    { key: 'interested', label: tr('providerBusiness.promotions.notify.interested'), icon: 'heart-outline' },
    { key: 'repeat', label: tr('providerBusiness.clientele.audience.repeat'), icon: 'repeat-outline' },
    { key: 'new',    label: tr('providerBusiness.clientele.audience.new'),    icon: 'sparkles-outline' },
    { key: 'lapsed', label: tr('providerBusiness.clientele.audience.lapsed'),  icon: 'time-outline' },
    { key: 'followers', label: tr('providerBusiness.ui2.savedYouOrBellOn'), icon: 'notifications-outline' },
  ];

  const recipientIds = (): string[] => {
    if (audience === 'all')    return clients.map(c => c.user_id);
    if (audience === 'interested') return interestedRecipientIds(clients.map(c => c.user_id), followers.map(f => f.userId));
    if (audience === 'repeat') return clients.filter(c => c.booking_count >= 2).map(c => c.user_id);
    if (audience === 'new')    return clients.filter(c => c.booking_count === 1).map(c => c.user_id);
    if (audience === 'followers') return followers.map(f => f.userId);
    return clients.filter(c => daysSince(c.last_booking_date) > 60).map(c => c.user_id);
  };

  const recipientCount = counts[audience];
  const recipients = countsPeople(audience) ? peopleCount(recipientCount) : clientCount(recipientCount);
  const canSend = title.trim().length > 0 && body.trim().length > 0 && recipientCount > 0 && !sending;

  const sheetRef = useRef<BottomSheet>(null);
  const [everOpened, setEverOpened] = useState(false);
  // "90%" — NOT "%90". @gorhom/bottom-sheet silently fails to parse the
  // reversed form, which makes the sheet behave like a full-height modal
  // instead of snapping to the intended height. Tall enough that the Send
  // button clears the home indicator instead of being cut off at the bottom.
  const snapPoints = useMemo(() => ['90%'], []);

  useEffect(() => {
    if (visible) {
      setEverOpened(true);
      setAudience(clients.length > 0 ? 'all' : 'followers');
      setTitle('');
      setBody('');
      setErrorMsg('');
      setScheduleMode(false);
      setSchedAt(tomorrow9am());
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  // Waits for the `everOpened` render to actually commit before snapping
  // open. Calling snapToIndex in the same effect pass that flips that flag
  // fires it while the backdrop prop is still unset (state hasn't
  // re-rendered yet), so the sheet starts animating without a backdrop and
  // then jumps once the backdrop mounts mid-flight — visible as a double
  // slide-up instead of one continuous motion.
  useEffect(() => {
    if (visible && everOpened) {
      sheetRef.current?.snapToIndex(0);
    }
  }, [visible, everOpened]);

  // Gated on index < 0 (not just onClose) so a drag-to-dismiss or a close()
  // racing the backdrop's own fade can't leave the backdrop settled at a
  // non-zero opacity with nothing left to drive it back down.
  const handleSheetChange = useCallback((index: number) => {
    if (index < 0) {
      setEverOpened(false);
      onClose();
    }
  }, [onClose]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setErrorMsg('');
    setSending(true);
    try {
      const ids = recipientIds();
      if (scheduleMode) {
        await queueScheduledAnnouncement(title.trim(), body.trim(), ids, schedAt);
        onScheduled(schedAt);
      } else {
        const { sent } = await sendAnnouncement(title.trim(), body.trim(), ids);
        onSent(countsPeople(audience) ? peopleCount(sent) : clientCount(sent));
      }
      setTitle('');
      setBody('');
      setAudience(clients.length > 0 ? 'all' : 'followers');
    } catch (err) {
      setErrorMsg(toUserMessage(err, 'Something went wrong. Please try again.', 'ProviderClienteleScreen.sendAnnouncement'));
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      // v5 defaults enableDynamicSizing=true, which sizes the sheet to its
      // content and SILENTLY IGNORES snapPoints — that's why raising the
      // snap % did nothing. Off, so the 90% snap point actually applies and
      // the Send button clears the bottom.
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={false}
      onChange={handleSheetChange}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: P.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
      handleIndicatorStyle={{ backgroundColor: P.border }}
      {...(everOpened
        ? {
            backdropComponent: (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
              <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                pressBehavior="close"
              />
            ),
          }
        : {})}
    >
      <View style={anSt.header}>
        <View>
          <Text style={[anSt.title, { color: P.text }]}>{tr('providerBusiness.clientele.announce.title')}</Text>
          <Text style={[anSt.sub, { color: P.sub }]}>
            {tr('providerBusiness.ui.willReceive', { recipients })}
          </Text>
        </View>
        <TouchableOpacity onPress={() => sheetRef.current?.close()} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={P.sub} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        style={anSt.scrollFlex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[anSt.scroll, { paddingBottom: bottomSafeGap }]}
      >
        <Text style={[anSt.label, { color: P.sub }]}>{tr('providerBusiness.clientele.announce.audience')}</Text>
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

        <Text style={[anSt.label, { color: P.sub }]}>{tr('providerBusiness.clientele.announce.titleLabel')}</Text>
        <BottomSheetTextInput
          style={[anSt.input, { backgroundColor: P.card, color: P.text, borderColor: P.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder={tr('providerBusiness.clientele.announce.titlePlaceholder')}
          placeholderTextColor={P.sub}
          maxLength={80}
        />

        <Text style={[anSt.label, { color: P.sub }]}>{tr('providerBusiness.clientele.announce.message')}</Text>
        <BottomSheetTextInput
          style={[anSt.input, anSt.textArea, { backgroundColor: P.card, color: P.text, borderColor: P.border }]}
          value={body}
          onChangeText={setBody}
          placeholder={tr('providerBusiness.clientele.announce.messagePlaceholder')}
          placeholderTextColor={P.sub}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />
        <Text style={[anSt.charCount, { color: P.sub }]}>{body.length}/300</Text>

        <View style={[anSt.scheduleRow, { backgroundColor: P.card, borderColor: P.border }]}>
          <Ionicons name="alarm-outline" size={16} color={scheduleMode ? P.accent : P.sub} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[anSt.scheduleLabel, { color: P.text }]}>{tr('providerBusiness.clientele.announce.schedule')}</Text>
            <Text style={[anSt.scheduleSub, { color: P.sub }]}>{tr('providerBusiness.clientele.announce.scheduleSub')}</Text>
          </View>
          <Switch value={scheduleMode} onValueChange={setScheduleMode}
            trackColor={{ false: P.border, true: P.accent }} thumbColor="#fff" />
        </View>

        {scheduleMode && (
          <View style={anSt.pickerRow}>
            <TouchableOpacity
              style={[anSt.pickerBtn, { backgroundColor: P.card, borderColor: P.border }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={14} color={P.accent} />
              <Text style={[anSt.pickerText, { color: P.text }]}>
                {schedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[anSt.pickerBtn, { backgroundColor: P.card, borderColor: P.border }]}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}>
              <Ionicons name="time-outline" size={14} color={P.accent} />
              <Text style={[anSt.pickerText, { color: P.text }]}>{formatTime12(schedAt)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Android's native dialogs render as OS overlays with no wrapper
            needed. iOS's inline "default" picker doesn't — it renders into
            the surrounding layout in place, which inside this bottom sheet
            meant it could push/cover the header above it. Matches the modal
            wrapper RescheduleScreen already uses for the same picker. */}
        {showDatePicker && Platform.OS === 'android' && (
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
        {showTimePicker && Platform.OS === 'android' && (
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
        {(showDatePicker || showTimePicker) && Platform.OS === 'ios' && (
          <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" visible onRequestClose={() => { setShowDatePicker(false); setShowTimePicker(false); }}>
            <View style={anSt.pickerModalWrap}>
              <TouchableOpacity
                style={anSt.pickerDismiss}
                activeOpacity={1}
                onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }}
              />
              <View style={[anSt.pickerSheet, { backgroundColor: P.card, paddingBottom: Math.max(20, bottomSafeGap) }]}>
                <View style={[anSt.pickerHeader, { borderBottomColor: P.border }]}>
                  <Text style={[anSt.pickerHeaderLabel, { color: P.text }]}>
                    {showDatePicker ? tr('providerBusiness.clientele.announce.selectDate') : tr('providerBusiness.clientele.announce.selectTime')}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }}>
                    <Text style={[anSt.pickerDoneLabel, { color: P.accent }]}>{tr('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                {showDatePicker ? (
                  <DateTimePicker
                    value={schedAt}
                    mode="date"
                    minimumDate={new Date()}
                    display="spinner"
                    themeVariant={isDarkMode ? 'dark' : 'light'}
                    textColor={P.text}
                    style={{ width: '100%' }}
                    onChange={(_, date) => {
                      if (date) {
                        const updated = new Date(schedAt);
                        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                        setSchedAt(updated);
                      }
                    }}
                  />
                ) : (
                  <DateTimePicker
                    value={schedAt}
                    mode="time"
                    display="spinner"
                    themeVariant={isDarkMode ? 'dark' : 'light'}
                    textColor={P.text}
                    minuteInterval={5}
                    style={{ width: '100%' }}
                    onChange={(_, date) => {
                      if (date) {
                        const updated = new Date(schedAt);
                        updated.setHours(date.getHours(), date.getMinutes());
                        setSchedAt(updated);
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </Modal>
        )}

        <TouchableOpacity
          style={[anSt.sendBtn, { backgroundColor: canSend ? P.accent : P.border }]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.8}>
          {sending ? (
            <ActivityIndicator size="small" color={canSend ? P.onAccent : P.text} />
          ) : (
            <>
              <Ionicons name={scheduleMode ? 'alarm-outline' : 'megaphone-outline'} size={16} color={canSend ? P.onAccent : P.text} />
              <Text style={[anSt.sendBtnText, { color: canSend ? P.onAccent : P.text }]}>
                {scheduleMode
                  ? tr('providerBusiness.ui.scheduleFor', { recipients })
                  : tr('providerBusiness.ui.sendTo', { recipients })}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {!!errorMsg && (
          <Text style={anSt.errorText}>{errorMsg}</Text>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const anSt = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 12 },
  title:        { fontSize: 18, fontWeight: '700' },
  sub:          { fontSize: 12, marginTop: 2 },
  scrollFlex:   { flex: 1 },
  scroll:       { paddingHorizontal: 20 },
  label:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  audienceRow:  { gap: 8 },
  audienceChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  audienceLabel:{ fontSize: 13, fontWeight: '600', flex: 1 },
  countBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  countText:    { fontSize: 11, fontWeight: '700' },
  input:        { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  textArea:     { minHeight: 100, marginTop: 0 },
  charCount:    { fontSize: 11, textAlign: 'right', marginTop: 5 },
  scheduleRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  scheduleLabel:{ fontSize: 14, fontWeight: '600' },
  scheduleSub:  { fontSize: 12, marginTop: 2 },
  pickerRow:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  pickerBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 11 },
  pickerText:   { fontSize: 13, fontWeight: '600' },
  // Bottom clearance belongs to the scroll container. Keeping another safe
  // gap on this button double-counted it whenever the keyboard was open.
  sendBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  sendBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  errorText:    { fontSize: 13, color: '#FF6868', textAlign: 'center', marginTop: 10 },
  pickerModalWrap: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end' },
  pickerDismiss:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { ...readableSheet, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 20 },
  pickerHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerHeaderLabel: { fontSize: 15, fontWeight: '600' },
  pickerDoneLabel:   { fontSize: 15, fontWeight: '700' },
});

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ member, onMessage, onRebook, onOpen, lapsed, reliability, P }: {
  member: ClienteleMember;
  onMessage: (m: ClienteleMember) => void;
  onRebook: (m: ClienteleMember) => void;
  /** Tapping the card opens the client sheet: Beauty Profile, notes, history. */
  onOpen: (m: ClienteleMember) => void;
  lapsed?: boolean;
  // No-show / late-cancel history this client has with THIS provider
  // (client_provider_reliability, batch-fetched once for the whole list —
  // see getClientReliabilityStatsBatch). Undefined/zero = nothing to show.
  reliability?: ClientReliabilityStats | undefined;
  P: typeof LIGHT;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const color = avatarColor(member.customer_name);
  const days = daysSince(member.last_booking_date);
  const hasReliabilityFlag = !!reliability && (reliability.noShowCount > 0 || reliability.lateCancelCount > 0);

  return (
    <TouchableOpacity
      style={[ccSt.wrap, { backgroundColor: P.surface }]}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpen(member); }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityHint={tr('providerBusiness.ui2.opensTheirBeautyProfileYourNotes')}
    >
      <View style={[ccSt.avatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <Text style={[ccSt.avatarText, { color }]}>{initials(member.customer_name)}</Text>
      </View>
      <View style={ccSt.info}>
        <View style={ccSt.nameRow}>
          <Text style={[ccSt.name, { color: P.text }]} numberOfLines={1}>{member.customer_name}</Text>
          {lapsed && (
            <View style={ccSt.lapsedBadge}>
              <Text style={[ccSt.lapsedText, { color: DANGER }]}>{tr('providerBusiness.ui.daysAgo', { days })}</Text>
            </View>
          )}
        </View>
        <Text style={[ccSt.meta, { color: P.sub }]}>
          {trp('providerBusiness.ui.bookings', member.booking_count)} · {tr('providerBusiness.ui.lastOn', { date: formatShort(member.last_booking_date) })}
        </Text>
        {hasReliabilityFlag && (
          <View style={ccSt.reliabilityRow}>
            <Ionicons name="alert-circle-outline" size={11} color="#FF9500" />
            <Text style={[ccSt.reliabilityText, { color: '#FF9500' }]}>
              {[
                reliability!.noShowCount > 0 ? `${reliability!.noShowCount} no-show${reliability!.noShowCount === 1 ? '' : 's'}` : null,
                reliability!.lateCancelCount > 0 ? `${reliability!.lateCancelCount} late cancel${reliability!.lateCancelCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}
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
            onPress={e => { e.stopPropagation(); Haptics.selectionAsync().catch(() => {}); onMessage(member); }}
            activeOpacity={0.7}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={P.accent} />
            <Text style={[ccSt.btnText, { color: P.accent }]}>{tr('providerBusiness.clientele.card.message')}</Text>
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
  reliabilityRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  reliabilityText: { fontSize: 11, fontWeight: '600' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProviderClienteleScreen({ navigation }: any) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const [clients, setClients] = useState<ClienteleMember[]>([]);
  const [reliabilityByClient, setReliabilityByClient] = useState<Record<string, ClientReliabilityStats>>({});
  const [providerName, setProviderName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [followers, setFollowers] = useState<AnnouncementFollower[]>([]);
  const [sheetFor, setSheetFor] = useState<ClienteleMember | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { showToast, DialogHost } = useAppDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, profile] = await Promise.all([
        getProviderClientele(),
        getMyProviderProfile(),
      ]);
      setClients(data);
      setProviderName(profile?.display_name ?? '');
      setProviderId(profile?.id ?? '');
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();

      // Batched, not per-card — one query for the whole list's reliability
      // history (see CLAUDE.md's no-N+1 rule). Best-effort: a failure here
      // shouldn't block the clientele list itself from rendering.
      if (data.length > 0) {
        getClientReliabilityStatsBatch(data.map(c => c.user_id))
          .then(setReliabilityByClient)
          .catch(() => {});
      }
      // Who else an announcement can reach. Best-effort too: without it the
      // "Saved you or bell on" audience just shows 0.
      getMyAnnouncementFollowers()
        .then(setFollowers)
        .catch(() => setFollowers([]));
    } catch (e: any) {
      showToast(toUserMessage(e, 'Could not load your clientele.', 'ProviderClienteleScreen.load'), 'error');
    } finally {
      setLoading(false);
    }
  }, [fadeAnim, showToast]);

  useFocusEffect(useCallback(() => {
    fadeAnim.setValue(0);
    load();
  }, [fadeAnim, load]));

  const repeatClients = clients.filter(c => c.booking_count >= 2);
  const newClients    = clients.filter(c => c.booking_count === 1);
  const lapsedClients = clients.filter(c => daysSince(c.last_booking_date) > 60);
  const displayed = tab === 'all' ? clients : tab === 'repeat' ? repeatClients : tab === 'new' ? newClients : lapsedClients;
  const counts = { all: clients.length, repeat: repeatClients.length, new: newClients.length, lapsed: lapsedClients.length };
  const audienceCounts = {
    ...counts,
    interested: interestedRecipientIds(clients.map(c => c.user_id), followers.map(f => f.userId)).length,
    followers: followers.length,
  };

  const handleAnnouncementSent = (who: string) => {
    setAnnouncementOpen(false);
    showToast(tr('providerBusiness.ui.announcementSent', { who }));
  };

  const handleAnnouncementScheduled = (when: Date) => {
    setAnnouncementOpen(false);
    showToast(tr('providerBusiness.clientele.toast.scheduled', { date: when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), time: formatTime12(when) }));
  };

  // Opens the real in-app conversation with this client rather than a
  // one-off announcement — same path the Calendar tab and Inbox use, so the
  // thread is shared instead of forking into a separate broadcast channel.
  const handleMessage = useCallback(async (member: ClienteleMember) => {
    if (!providerId) return;
    try {
      const conversationId = await getOrCreateConversation(providerId, member.user_id);
      navigation.navigate('ProviderConversation', {
        conversationId,
        clientUserId: member.user_id,
        clientName: member.customer_name,
      });
    } catch (e: any) {
      showToast(toUserMessage(e, 'Could not open that conversation.', 'ProviderClienteleScreen.message'), 'error');
    }
  }, [providerId, navigation, showToast]);

  const handleRebook = async (member: ClienteleMember) => {
    try {
      await sendRebookPrompt(member.user_id, providerName);
      showToast(tr('providerBusiness.clientele.toast.rebook', { name: member.customer_name }));
    } catch (e: any) {
      showToast(toUserMessage(e, 'Could not send that rebook prompt.', 'ProviderClienteleScreen.rebook'), 'error');
    }
  };

  const handleOpenClient = useCallback((member: ClienteleMember) => setSheetFor(member), []);
  const handleCloseClient = useCallback(() => setSheetFor(null), []);

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
            <Text style={[s.headerTitle, { color: P.text }]}>{tr('providerBusiness.clientele.title')}</Text>
            <Text style={[s.headerSub, { color: P.sub }]}>{clients.length} {tr('providerBusiness.inbox.clientLower')}{clients.length !== 1 ? 's' : ''} · {repeatClients.length} repeat</Text>
          </View>
          <View style={s.headerActions}>
            {(clients.length > 0 || followers.length > 0) && (
              <TouchableOpacity
                style={[s.announceBtn, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setAnnouncementOpen(true); }}
                activeOpacity={0.7}>
                <Ionicons name="megaphone-outline" size={15} color={P.accent} />
                <Text style={[s.announceBtnText, { color: P.accent }]}>{tr('providerBusiness.clientele.announceBtn')}</Text>
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
                {trp('providerBusiness.ui.lapsed', lapsedClients.length)}
              </Text>
            </View>
          )}
          {displayed.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: P.surface }]}>
                <Ionicons name="people-outline" size={36} color={P.sub} />
              </View>
              <Text style={[s.emptyTitle, { color: P.text }]}>
                {tab === 'repeat' ? tr('providerBusiness.clientele.empty.repeat') : tab === 'new' ? 'No new clients'
                  : tab === 'lapsed' ? 'No lapsed clients' : 'No clients yet'}
              </Text>
              <Text style={[s.emptySub, { color: P.sub }]}>
                {tab === 'repeat' ? tr('providerBusiness.clientele.empty.repeatSub')
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
                  reliability={reliabilityByClient[item.user_id]}
                  onMessage={handleMessage}
                  onRebook={handleRebook}
                  onOpen={handleOpenClient}
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
        counts={audienceCounts}
        clients={clients}
        followers={followers}
        onClose={() => setAnnouncementOpen(false)}
        onSent={handleAnnouncementSent}
        onScheduled={handleAnnouncementScheduled}
        onError={msg => showToast(msg, 'error')}
        P={P}
      />

      <ClientSheet
        member={sheetFor}
        onClose={handleCloseClient}
        P={P}
        isDark={isDarkMode}
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
  modalBackdrop:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { ...readableSheet, maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle:       { fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  modalRow:         { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalRowTitle:    { fontSize: 15, fontWeight: '600' },
  modalRowSub:      { fontSize: 12, marginTop: 3 },
});
