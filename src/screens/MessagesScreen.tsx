// Client-side Messages screen — lists this user's conversations with
// providers. Chats persist per (provider, user) pair; tapping a row opens
// the same ProviderChatScreen used from "Get In Touch".
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { getUserConversations, UserConversationWithProvider } from '../services/databaseService';

const OL = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  accent: '#AF9197',
};
const OD = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  accent: '#AF9197',
};

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
  const { isDarkMode } = useTheme();
  const OP = isDarkMode ? OD : OL;

  const [conversations, setConversations] = useState<UserConversationWithProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      setConversations(await getUserConversations());
    } catch { /* offline — keep whatever we have */ }
  }, []);

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  useFocusEffect(useCallback(() => { fetchConversations(); }, [fetchConversations]));

  // Live updates: refresh the list when any of my conversations change
  useEffect(() => {
    const channel = supabase
      .channel('user-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'provider_conversations' },
        () => { fetchConversations(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

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
                <Text style={styles.badgeText}>
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
      <View style={[styles.center, { backgroundColor: OP.bg }]}>
        <ActivityIndicator color={OP.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: OP.bg }}>
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, conversations.length === 0 && { flex: 1 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={OP.accent} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: OP.accent }]}>No messages yet</Text>
            <Text style={[styles.emptyBody, { color: OP.sub }]}>
              Start a conversation from any provider's profile with "Get In Touch"
            </Text>
          </View>
        }
      />
    </View>
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
});
