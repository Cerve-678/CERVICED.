import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAppDialog } from '../../components/AppDialog';
import { toUserMessage } from '../../utils/userFacingError';
import {
  getProviderConversations,
  ProviderConversationWithClient,
  markConversationReadByProvider,
  sendConversationQuickReply,
  getMyProviderMessageTemplates,
  replaceMyProviderMessageTemplates,
  ProviderMessageTemplate,
} from '../../services/databaseService';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { logger } from '../../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = 'enquiries' | 'messages';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'enquiries', label: 'General enquiries' },
  { key: 'messages', label: 'Messages' },
];

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

// ─── Main screen ──────────────────────────────────────────────────────────────

// ─── Brand palette ────────────────────────────────────────────────────────────
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
  const { showToast, DialogHost } = useAppDialog();
  const { isDarkMode: dark } = useTheme();
  const { user } = useAuth();
  const P = dark ? DARK_P : LIGHT_P;
  const bottomInset = useSystemBottomInset();

  const [conversations, setConversations] = useState<ProviderConversationWithClient[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [filter,        setFilter]        = useState<FilterKey>(route?.params?.initialFilter === 'enquiries' ? 'enquiries' : 'messages');

  const [loadError,     setLoadError]     = useState<string | null>(null);

  const [replyTarget,  setReplyTarget]  = useState<ProviderConversationWithClient | null>(null);
  const [replyText,    setReplyText]    = useState('');
  const [replySending, setReplySending] = useState(false);

  // Message templates — the reusable replies that fill the composer in a
  // conversation. Managed here (where they're used) rather than buried under
  // Account → Contact Preferences. Loaded lazily when the editor is opened.
  const [templatesOpen,    setTemplatesOpen]    = useState(false);
  const [templates,        setTemplates]        = useState<Pick<ProviderMessageTemplate, 'label' | 'content'>[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesSaving,  setTemplatesSaving]  = useState(false);

  // Apply initialFilter on re-navigation too — navigate() to an already-mounted
  // inbox only updates params, so the useState initializer never re-runs
  useEffect(() => {
    const f = route?.params?.initialFilter as FilterKey | undefined;
    if (f === 'enquiries' || f === 'messages') setFilter(f);
  }, [route?.params?.initialFilter]);

  const loadSequence = useRef(0);
  const loadInbox = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const data = await getProviderConversations();
      if (sequence !== loadSequence.current) return;
      setConversations(data);
      setLoadError(null);
      // A generic message notification can belong to either section.
      if (route?.params?.initialFilter === 'unread') {
        const latestUnread = data.find(c => c.unread_count_provider > 0);
        if (latestUnread) setFilter(latestUnread.has_booking ? 'messages' : 'enquiries');
      }
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setLoadError(toUserMessage(error, "We couldn't refresh your inbox just now.", '[ProviderInbox] load failed'));
    }
  }, [route?.params?.initialFilter]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadInbox().finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; loadSequence.current += 1; };
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

  const openTemplates = useCallback(async () => {
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      const data = await getMyProviderMessageTemplates();
      setTemplates(data.map(({ label, content }) => ({ label, content })));
    } catch (err) {
      logger.error('[ProviderInbox] load templates failed:', err);
      showToast(toUserMessage(err, "We couldn't load your templates just now.", '[ProviderInbox] templates load'), 'error');
      setTemplatesOpen(false);
    } finally {
      setTemplatesLoading(false);
    }
  }, [showToast]);

  const handleSaveTemplates = useCallback(async () => {
    if (templatesSaving) return;
    // Drop rows the provider left blank rather than persisting empty templates.
    const cleaned = templates.filter(t => t.label.trim() || t.content.trim());
    setTemplatesSaving(true);
    try {
      await replaceMyProviderMessageTemplates(cleaned);
      setTemplates(cleaned);
      setTemplatesOpen(false);
      Keyboard.dismiss();
      showToast('Templates saved.', 'success');
    } catch (err) {
      logger.error('[ProviderInbox] save templates failed:', err);
      showToast(toUserMessage(err, "We couldn't save your templates just now.", '[ProviderInbox] templates save'), 'error');
    }
    setTemplatesSaving(false);
  }, [templates, templatesSaving, showToast]);

  const updateTemplate = useCallback((index: number, field: 'label' | 'content', value: string) => {
    setTemplates(prev => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }, []);

  const addTemplate = useCallback(() => {
    setTemplates(prev => (prev.length >= 12 ? prev : [...prev, { label: '', content: '' }]));
  }, []);

  const removeTemplate = useCallback((index: number) => {
    setTemplates(prev => prev.filter((_, i) => i !== index));
  }, []);

  const unreadCounts = useMemo(() => ({
    enquiries: conversations.filter(c => !c.has_booking && c.unread_count_provider > 0).length,
    messages: conversations.filter(c => c.has_booking && c.unread_count_provider > 0).length,
  }), [conversations]);
  const outstandingCount = unreadCounts.enquiries + unreadCounts.messages;
  const flatItems = useMemo(
    () => conversations.filter(c => filter === 'messages' ? c.has_booking : !c.has_booking),
    [conversations, filter],
  );

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
            {outstandingCount > 0 && (
              <View style={[s.badge, { backgroundColor: '#FF3B30' }]}>
                <Text style={s.badgeText}>{outstandingCount}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={openTemplates}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
            accessibilityLabel="Message templates"
          >
            <Ionicons name="documents-outline" size={18} color={P.text} />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Filter tabs ─────────────────────────────────────────── */}
        <View style={[s.filterRow, { backgroundColor: P.card, borderBottomColor: P.border }]}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            const badgeCount = unreadCounts[f.key];
            const isNew  = badgeCount > 0;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => {
                  setFilter(f.key);
                  navigation.setParams({ initialFilter: f.key });
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${f.label}, ${badgeCount} unread conversations`}
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
            data={flatItems}
            keyExtractor={item => item.id}
            style={{ backgroundColor: P.card, flex: 1 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
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
                onReply={() => { setReplyText(''); setReplyTarget(item); }}
                onMarkRead={() => handleMarkConversationRead(item)}
              />
            )}
            ListHeaderComponent={
              // With rows on screen the banner sits above them; with none, the
              // empty state below shows the failure instead of an empty inbox.
              loadError && flatItems.length > 0 ? (
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
                    <Ionicons name={filter === 'messages' ? 'chatbubble-outline' : 'mail-open-outline'} size={36} color={P.sub} />
                  </View>
                  <Text style={[s.emptyTitle, { color: P.text }]}>{filter === 'enquiries' ? 'No general enquiries yet' : 'No client messages yet'}</Text>
                  <Text style={[s.emptySub, { color: P.sub }]}>
                    {filter === 'messages' ? 'Conversations with clients who have booked with you appear here.' : 'Questions sent through Get In Touch appear here until the person books with you.'}
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
            <KeyboardDismissView style={m.positioner}>
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
            </KeyboardDismissView>
          )}
        </Modal>

        {/* ── Message templates editor ───────────────────────────────── */}
        <Modal
          visible={templatesOpen}
          transparent statusBarTranslucent navigationBarTranslucent
          animationType="slide"
          onRequestClose={() => { setTemplatesOpen(false); Keyboard.dismiss(); }}
        >
          <View style={t.overlay}>
            <TouchableOpacity
              style={t.overlayTap}
              activeOpacity={1}
              onPress={() => { setTemplatesOpen(false); Keyboard.dismiss(); }}
            />
            <View style={[t.sheet, { backgroundColor: P.bg }]}>
              <View style={[t.sheetHeader, { borderBottomColor: P.border }]}>
                <Text style={[t.sheetTitle, { color: P.text }]}>Message Templates</Text>
                <TouchableOpacity
                  onPress={() => { setTemplatesOpen(false); Keyboard.dismiss(); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[s.iconBtn, { backgroundColor: P.iconBg }]}
                >
                  <Ionicons name="close" size={20} color={P.sub} />
                </TouchableOpacity>
              </View>

              {templatesLoading ? (
                <View style={t.loading}>
                  <ActivityIndicator color={P.accent} size="large" />
                </View>
              ) : (
                <KeyboardDismissView style={{ flex: 1 }}>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={t.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                  >
                    <Text style={[t.intro, { color: P.sub }]}>
                      Private to you. Tapping a template fills the message box in a
                      conversation — you can always edit it before sending.
                    </Text>

                    {templates.length === 0 ? (
                      <Text style={[t.empty, { color: P.sub }]}>
                        No templates yet. Create reusable replies for confirming an
                        address, availability, or booking details.
                      </Text>
                    ) : templates.map((template, index) => (
                      <View key={index} style={[t.item, { backgroundColor: P.card, borderColor: P.border }]}>
                        <View style={t.itemHeader}>
                          <TextInput
                            style={[t.labelInput, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
                            value={template.label}
                            onChangeText={value => updateTemplate(index, 'label', value)}
                            placeholder="Template name"
                            placeholderTextColor={P.sub}
                            maxLength={60}
                          />
                          <TouchableOpacity onPress={() => removeTemplate(index)} hitSlop={10}>
                            <Ionicons name="trash-outline" size={18} color="#FF6868" />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[t.contentInput, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
                          value={template.content}
                          onChangeText={value => updateTemplate(index, 'content', value)}
                          placeholder="Message text"
                          placeholderTextColor={P.sub}
                          maxLength={1000}
                          multiline
                          scrollEnabled
                          textAlignVertical="top"
                        />
                      </View>
                    ))}

                    <TouchableOpacity
                      style={[t.addBtn, { borderColor: P.accent, opacity: templates.length >= 12 ? 0.4 : 1 }]}
                      onPress={addTemplate}
                      disabled={templates.length >= 12}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={18} color={P.accent} />
                      <Text style={[t.addText, { color: P.accent }]}>
                        {templates.length >= 12 ? 'Template limit reached' : 'Add template'}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>

                  <View style={[t.footer, { borderTopColor: P.border, backgroundColor: P.bg, paddingBottom: 14 + bottomInset }]}>
                    <TouchableOpacity
                      style={[t.saveBtn, { backgroundColor: P.accent, opacity: templatesSaving ? 0.6 : 1 }]}
                      onPress={handleSaveTemplates}
                      disabled={templatesSaving}
                      activeOpacity={0.8}
                    >
                      {templatesSaving
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Text style={t.saveText}>Save Templates</Text>}
                    </TouchableOpacity>
                  </View>
                </KeyboardDismissView>
              )}
            </View>
          </View>
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
  filterChip:   { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterLabel:  { fontSize: 13, fontWeight: '600' },
  filterBadge:  { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
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

// ─── Templates editor styles ────────────────────────────────────────────────────

const t = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  overlayTap:  { flex: 1 },
  sheet:       { height: '85%', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },

  loading:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  intro:       { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  empty:       { fontSize: 13, lineHeight: 18, marginBottom: 16 },

  item:        { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, marginBottom: 12 },
  itemHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelInput:  { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, fontWeight: '600' },
  contentInput:{ borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, marginTop: 8, minHeight: 68, fontSize: 13, textAlignVertical: 'top' },

  addBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginTop: 2 },
  addText:     { fontSize: 14, fontWeight: '700' },

  footer:      { paddingHorizontal: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveText:    { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
