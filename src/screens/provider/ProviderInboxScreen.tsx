import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProviderDialog } from '../../components/ProviderDialog';
import { toUserMessage } from '../../utils/userFacingError';
import {
  getProviderConversations,
  ProviderConversationWithClient,
  markConversationReadByProvider,
  sendConversationQuickReply,
} from '../../services/databaseService';
import { logger } from '../../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = 'messages' | 'queries';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'messages', label: 'Messages' },
  { key: 'queries',  label: 'Queries'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgoISO(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function SkeletonRow({ dark }: { dark: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const op   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const base = dark ? '#3A3A3C' : '#D8D8DC';
  return (
    <View style={[sk.row, { borderBottomColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
      <Animated.View style={[sk.avatar, { backgroundColor: base, opacity: op }]} />
      <View style={sk.body}>
        <View style={sk.topRow}>
          <Animated.View style={[sk.name,      { backgroundColor: base, opacity: op }]} />
          <Animated.View style={[sk.timestamp, { backgroundColor: base, opacity: op }]} />
        </View>
        <Animated.View style={[sk.line1, { backgroundColor: base, opacity: op }]} />
        <Animated.View style={[sk.line2, { backgroundColor: base, opacity: op }]} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  row:       { flexDirection: 'row', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  avatar:    { width: 48, height: 48, borderRadius: 24, marginRight: 14, flexShrink: 0 },
  body:      { flex: 1, gap: 8 },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  name:      { height: 14, width: '42%', borderRadius: 7 },
  timestamp: { height: 11, width: '20%', borderRadius: 5 },
  line1:     { height: 12, width: '78%', borderRadius: 6 },
  line2:     { height: 11, width: '52%', borderRadius: 5 },
});

const row = StyleSheet.create({
  wrap:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  unreadBar:   { width: 3, height: 40, borderRadius: 2, marginRight: 10, flexShrink: 0 },
  avatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 },
  avatarText:  { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  body:        { flex: 1, gap: 3 },
  topLine:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:        { fontSize: 15, flex: 1, marginRight: 8, letterSpacing: -0.2 },
  timestamp:   { fontSize: 12 },
  service:     { fontSize: 13 },

  swipeActions: { flexDirection: 'row', height: '100%' },
  swipeBtn:     { width: 76, alignItems: 'center', justifyContent: 'center', gap: 2 },
  swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConversationRow({
  conversation,
  index,
  text,
  sub,
  accent,
  border,
  onPress,
  onReply,
  onMarkRead,
}: {
  conversation: ProviderConversationWithClient;
  index: number;
  text: string;
  sub: string;
  accent: string;
  border: string;
  onPress: () => void;
  onReply: () => void;
  onMarkRead: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const swipeRef  = useRef<Swipeable>(null);

  useEffect(() => {
    const delay = Math.min(index * 45, 300);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  const isUnread = conversation.unread_count_provider > 0;
  const clientName = conversation.client?.name ?? 'Client';
  const init = initials(clientName);

  const renderRightActions = () => (
    <View style={row.swipeActions}>
      <TouchableOpacity
        style={[row.swipeBtn, { backgroundColor: '#8E8E93' }]}
        onPress={() => { swipeRef.current?.close(); onMarkRead(); }}
      >
        <Ionicons name="checkmark-done" size={18} color="#fff" />
        <Text style={row.swipeBtnText}>Mark read</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[row.swipeBtn, { backgroundColor: accent }]}
        onPress={() => { swipeRef.current?.close(); onReply(); }}
      >
        <Ionicons name="arrow-undo" size={18} color="#fff" />
        <Text style={row.swipeBtnText}>Reply</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={onPress}
          style={[row.wrap, { borderBottomColor: border }]}
        >
          {isUnread && (
            <View style={[row.unreadBar, { backgroundColor: accent }]} />
          )}

          <View style={[row.avatar, { backgroundColor: `${accent}22` }]}>
            <Text style={[row.avatarText, { color: accent }]}>{init}</Text>
          </View>

          <View style={row.body}>
            <View style={row.topLine}>
              <Text style={[row.name, { color: text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>
                {clientName}
              </Text>
              <Text style={[row.timestamp, { color: sub }]}>{timeAgoISO(conversation.last_message_at)}</Text>
            </View>

            <Text style={[row.service, { color: isUnread ? text : sub, fontWeight: isUnread ? '600' : '400' }]} numberOfLines={1}>
              {conversation.last_message ?? 'No messages yet'}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={14} color={sub} style={{ opacity: 0.35, marginTop: 2, marginLeft: 4 }} />
        </TouchableOpacity>
      </Swipeable>
    </Animated.View>
  );
}

const LIGHT_P = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  iconBg:  'rgba(92,64,51,0.12)',
};
const DARK_P = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  iconBg:  'rgba(175,145,151,0.10)',
};

export default function ProviderInboxScreen({ navigation, route }: any) {
  const { showToast, DialogHost } = useProviderDialog();
  const { isDarkMode: dark } = useTheme();
  const { user } = useAuth();
  const P = dark ? DARK_P : LIGHT_P;

  const [conversations, setConversations] = useState<ProviderConversationWithClient[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [filter,        setFilter]        = useState<FilterKey>(route?.params?.initialFilter ?? 'messages');

  // The fetch used to log and swallow, so a failed load rendered as the empty
  // state — the single most misleading thing an inbox can say to a provider
  // who actually has unread messages waiting on them.
  const [loadError,     setLoadError]     = useState<string | null>(null);

  const [replyTarget,  setReplyTarget]  = useState<ProviderConversationWithClient | null>(null);
  const [replyText,    setReplyText]    = useState('');
  const [replySending, setReplySending] = useState(false);

  // Apply initialFilter on re-navigation too — navigate() to an already-mounted
  // inbox only updates params, so the useState initializer never re-runs
  useEffect(() => {
    const f = route?.params?.initialFilter as FilterKey | undefined;
    if (f) setFilter(f);
  }, [route?.params?.initialFilter]);

  const fetchConversations = useCallback(async () => {
    setConversations(await getProviderConversations());
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      await fetchConversations();
      setLoadError(null);
    } catch (err) {
      setLoadError(
        toUserMessage(
          err,
          "We couldn't refresh your inbox just now.",
          '[ProviderInbox] load failed',
        ),
      );
    }
  }, [fetchConversations]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadInbox().finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadInbox]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInbox();
    setRefreshing(false);
  }, [loadInbox]);

  const handleMarkConversationRead = useCallback((conversation: ProviderConversationWithClient) => {
    markConversationReadByProvider(conversation.id)
      .then(() => loadInbox())
      .catch((err) => {
        logger.error('[ProviderInbox] mark-read failed:', err);
        Alert.alert('Could not mark as read', 'Check your connection and try again.');
      });
  }, [loadInbox]);

  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || !replyTarget || !user?.id || replySending) return;
    setReplySending(true);
    try {
      await sendConversationQuickReply({
        conversationId: replyTarget.id,
        senderId: user.id,
        content: text,
      });
      setReplyText('');
      setReplyTarget(null);
      Keyboard.dismiss();
      void loadInbox();
    } catch (err) {
      logger.error('[ProviderInbox] quick reply failed:', err);
      showToast('Message not sent. Check your connection and try again.', 'error');
    }
    setReplySending(false);
  }, [replyText, replyTarget, user?.id, replySending, loadInbox, showToast]);

  const unreadConversationCount = useMemo(
    () => conversations.filter(c => c.unread_count_provider > 0).length,
    [conversations],
  );
  // Messages are from clients who have booked; Queries are Get In Touch
  // enquiries from people who haven't.
  const messageConversations = useMemo(() => conversations.filter(c => c.has_booked), [conversations]);
  const queryConversations   = useMemo(() => conversations.filter(c => !c.has_booked), [conversations]);
  const unreadMessageCount = useMemo(() => messageConversations.filter(c => c.unread_count_provider > 0).length, [messageConversations]);
  const unreadQueryCount   = useMemo(() => queryConversations.filter(c => c.unread_count_provider > 0).length, [queryConversations]);

  // Every "you have a new chat" deep link asks for the Messages tab without
  // knowing which kind it was. If the only unread thread is an enquiry, land
  // on Queries instead of an apparently-empty Messages tab. Once per arrival —
  // never fights a tab the provider picked themselves.
  const deepLinkSettled = useRef(false);
  useEffect(() => { deepLinkSettled.current = false; }, [route?.params?.initialFilter]);
  useEffect(() => {
    if (deepLinkSettled.current || conversations.length === 0) return;
    deepLinkSettled.current = true;
    if (route?.params?.initialFilter === 'messages' && unreadMessageCount === 0 && unreadQueryCount > 0) {
      setFilter('queries');
    }
  }, [conversations, unreadMessageCount, unreadQueryCount, route?.params?.initialFilter]);

  const visibleConversations = filter === 'messages' ? messageConversations : queryConversations;

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerY    = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(headerY,    { toValue: 0, tension: 90, friction: 14, useNativeDriver: true }),
    ]).start();
  }, [headerFade, headerY]);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateY: headerY }] }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={[s.title, { color: P.text }]}>Inbox</Text>
            {unreadConversationCount > 0 && (
              <View style={[s.badge, { backgroundColor: '#FF3B30' }]}>
                <Text style={s.badgeText}>{unreadConversationCount}</Text>
              </View>
            )}
          </View>

          <View style={[s.iconBtn, { backgroundColor: 'transparent' }]} />
        </Animated.View>

        {/* ── Filter tabs ─────────────────────────────────────────── */}
        <View style={[s.filterRow, { backgroundColor: P.card, borderBottomColor: P.border }]}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            const badgeCount = f.key === 'messages' ? unreadMessageCount : unreadQueryCount;
            const isNew  = badgeCount > 0;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[s.filterChip, active && { borderBottomColor: P.accent, borderBottomWidth: 2 }]}
              >
                <Text style={[s.filterLabel, { color: active ? P.accent : P.sub }]}>{f.label}</Text>
                {isNew && (
                  <View style={[s.filterBadge, { backgroundColor: '#FF3B30' }]}>
                    <Text style={s.filterBadgeText}>{badgeCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── List ────────────────────────────────────────────────── */}
        {loading ? (
          <View style={{ backgroundColor: P.card, flex: 1 }}>
            {[1, 2, 3, 4, 5, 6].map(k => <SkeletonRow key={k} dark={dark} />)}
          </View>
        ) : (
          <FlatList
            data={visibleConversations}
            keyExtractor={item => item.id}
            style={{ backgroundColor: P.card, flex: 1 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            renderItem={({ item, index }) => (
              <ConversationRow
                conversation={item}
                index={index}
                text={P.text}
                sub={P.sub}
                accent={P.accent}
                border={P.border}
                onPress={() => navigation.navigate('ProviderConversation', {
                  conversationId: item.id,
                  clientUserId: item.user_id,
                  clientName: item.client?.name ?? 'Client',
                })}
                onReply={() => setReplyTarget(item)}
                onMarkRead={() => handleMarkConversationRead(item)}
              />
            )}
            ListHeaderComponent={
              // With rows on screen the banner sits above them; with none, the
              // empty state below takes over, so "All clear" is never shown
              // for an inbox we simply failed to read.
              loadError && visibleConversations.length > 0 ? (
                <View style={[s.errorBanner, { backgroundColor: P.iconBg, borderBottomColor: P.border }]}>
                  <Text style={[s.errorBannerText, { color: P.text }]}>
                    {loadError} This list may be out of date.
                  </Text>
                  <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.errorRetry, { color: P.accent }]}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            ListEmptyComponent={
              loadError ? (
                <View style={s.empty}>
                  <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                    <Ionicons name="cloud-offline-outline" size={36} color={P.sub} />
                  </View>
                  <Text style={[s.emptyTitle, { color: P.text }]}>Couldn't load your inbox</Text>
                  <Text style={[s.emptySub, { color: P.sub }]}>{loadError}</Text>
                  <TouchableOpacity
                    onPress={onRefresh}
                    style={[s.retryBtn, { borderColor: P.border }]}
                  >
                    <Text style={[s.retryBtnText, { color: P.accent }]}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.empty}>
                  <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                    <Ionicons name={filter === 'messages' ? 'chatbubble-outline' : 'help-circle-outline'} size={36} color={P.sub} />
                  </View>
                  <Text style={[s.emptyTitle, { color: P.text }]}>{filter === 'messages' ? 'No messages' : 'No queries'}</Text>
                  <Text style={[s.emptySub, { color: P.sub }]}>
                    {filter === 'messages'
                      ? 'No messages from clients yet'
                      : 'No queries yet. They land here when someone taps Get In Touch on your profile.'}
                  </Text>
                </View>
              )
            }
          />
        )}

        {/* ── Quick-reply dialog ─────────────────────────────────────── */}
        <Modal
          visible={!!replyTarget}
          transparent statusBarTranslucent navigationBarTranslucent
          animationType="fade"
          onRequestClose={() => setReplyTarget(null)}
        >
          <TouchableOpacity
            style={m.overlay}
            activeOpacity={1}
            onPress={() => { setReplyTarget(null); setReplyText(''); Keyboard.dismiss(); }}
          />
          {replyTarget && (
            <View style={m.positioner} pointerEvents="box-none">
              <View style={[m.replyDialog, { backgroundColor: P.card }]}>
                <Text style={[m.dialogTitle, { color: P.text }]}>
                  Reply to {replyTarget.client?.name ?? 'client'}
                </Text>
                <TextInput
                  style={[m.replyInput, { color: P.text, borderColor: P.border }]}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Type a reply…"
                  placeholderTextColor={P.sub}
                  multiline
                  autoFocus
                  editable={!replySending}
                />
                <View style={m.replyActions}>
                  <TouchableOpacity
                    style={m.replyCancelBtn}
                    activeOpacity={0.7}
                    onPress={() => { setReplyTarget(null); setReplyText(''); Keyboard.dismiss(); }}
                  >
                    <Text style={[m.dialogBtnText, { color: P.sub }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[m.replySendBtn, { backgroundColor: P.accent, opacity: replyText.trim() && !replySending ? 1 : 0.5 }]}
                    activeOpacity={0.8}
                    onPress={handleSendReply}
                    disabled={!replyText.trim() || replySending}
                  >
                    <Text style={m.replySendText}>{replySending ? 'Sending…' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Modal>
        <DialogHost />
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title:        { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  badge:        { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  filterRow:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  filterChip:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', position: 'relative' },
  filterLabel:  { fontSize: 13, fontWeight: '600' },
  filterBadge:  { position: 'absolute', top: 7, right: 8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySub:   { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  errorBannerText: { fontSize: 12, flex: 1, lineHeight: 17 },
  errorRetry: { fontSize: 13, fontWeight: '700' },
  retryBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700' },
});

// ─── Modal styles ───────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  positioner:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog:      { width: '100%', borderRadius: 14, overflow: 'hidden' },
  dialogTitle:   { fontSize: 16, fontWeight: '700', textAlign: 'center', paddingTop: 18, paddingHorizontal: 16 },
  dialogMessage: { fontSize: 13, textAlign: 'center', paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16, lineHeight: 18 },
  divider:     { height: StyleSheet.hairlineWidth, width: '100%' },
  dialogBtn:      { paddingVertical: 13, alignItems: 'center' },
  dialogBtnText:  { fontSize: 15, fontWeight: '600' },

  replyDialog: { width: '100%', borderRadius: 14, padding: 16, gap: 12 },
  replyInput:  { borderWidth: 1.5, borderRadius: 10, padding: 12, minHeight: 80, maxHeight: 160, fontSize: 14, textAlignVertical: 'top' },
  replyActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  replyCancelBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  replySendBtn:   { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  replySendText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
});
