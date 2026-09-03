// Client-side Messages screen — lists this user's conversations with
// providers. Chats persist per (provider, user) pair; tapping a row opens
// the same ProviderChatScreen used from "Get In Touch".
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getUserConversations,
  subscribeToUserConversationChanges,
  UserConversationWithProvider,
} from '../../services/databaseService';
import { ThemedBackground } from '../../components/ThemedBackground';
import { toUserMessage } from '../../utils/userFacingError';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export default function MessagesScreen({ navigation }: any) {
  const { palette: OP } = useTheme();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<UserConversationWithProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A failed fetch used to be swallowed, which rendered exactly like "you have
  // no conversations yet" (or silently left the last-loaded list on screen).
  // Keep whatever we already had — it's still the most recent thing we know —
  // but say plainly that it might not be current, and offer a retry.
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setConversations(await getUserConversations());
      setLoadError(null);
    } catch (err) {
      setLoadError(
        toUserMessage(
          err,
          "We couldn't load your messages just now.",
          '[MessagesScreen] load conversations failed',
        ),
      );
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    fetchConversations().finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchConversations]));

  // Live updates: refresh the list when any of my conversations change
  useEffect(() => {
    if (!user?.id) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToUserConversationChanges(user.id, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void fetchConversations(); }, 150);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [fetchConversations, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const openChat = useCallback((conv: UserConversationWithProvider) => {
    if (!conv.provider) return;
    navigation.navigate('ProviderChat', {
      providerId: conv.provider.slug,
      providerDbId: conv.provider.id,
      providerName: conv.provider.display_name,
    });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: UserConversationWithProvider }) => {
    const name = item.provider?.display_name ?? 'Provider';
    const unread = item.unread_count_user > 0;

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: OP.card, borderColor: OP.border }]}
        onPress={() => openChat(item)}
        activeOpacity={0.7}
      >
        {item.provider?.logo_url ? (
          <Image source={{ uri: item.provider.logo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: OP.surface }]}>
            <Text style={[styles.avatarInitials, { color: OP.accent }]}>{initials(name)}</Text>
          </View>
        )}

        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: OP.text }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.time, { color: OP.sub }]}>{timeAgo(item.last_message_at)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.preview, { color: unread ? OP.text : OP.sub }, unread && styles.previewUnread]}
              numberOfLines={1}
            >
              {item.last_message ?? 'Say hello 👋'}
            </Text>
            {unread && (
              <View style={[styles.badge, { backgroundColor: OP.accent }]}>
                <Text style={[styles.badgeText, { color: OP.onAccent }]}>
                  {item.unread_count_user > 9 ? '9+' : item.unread_count_user}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [OP, openChat]);

  if (loading) {
    return (
      <ThemedBackground style={styles.center}>
        <ActivityIndicator color={OP.accent} />
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, conversations.length === 0 && { flex: 1 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={OP.accent} />
        }
        ListHeaderComponent={
          // Only shown alongside rows — with an empty list the error takes over
          // the empty state instead, so "no messages" can never stand in for
          // "we couldn't check".
          loadError && conversations.length > 0 ? (
            <View style={[styles.errorBanner, { backgroundColor: OP.card, borderColor: OP.border }]}>
              <Text style={[styles.errorBannerText, { color: OP.text }]}>
                {loadError} This list may be out of date.
              </Text>
              <TouchableOpacity onPress={onRefresh} activeOpacity={0.7}>
                <Text style={[styles.errorRetry, { color: OP.accentText }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loadError ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: OP.accentText }]}>Couldn't load messages</Text>
              <Text style={[styles.emptyBody, { color: OP.sub }]}>{loadError}</Text>
              <TouchableOpacity
                onPress={onRefresh}
                activeOpacity={0.7}
                style={[styles.retryBtn, { borderColor: OP.border, backgroundColor: OP.card }]}
              >
                <Text style={[styles.retryBtnText, { color: OP.accentText }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: OP.accentText }]}>No messages yet</Text>
              <Text style={[styles.emptyBody, { color: OP.sub }]}>
                Start a conversation from any provider's profile with "Get In Touch"
              </Text>
            </View>
          )
        }
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 15, flex: 1, marginRight: 8 },
  time: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  preview: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, flex: 1, marginRight: 8 },
  previewUnread: { fontWeight: '700' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18, marginBottom: 8 },
  emptyBody: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  errorBannerText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, flex: 1, lineHeight: 17 },
  errorRetry: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  retryBtn: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  retryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
});
