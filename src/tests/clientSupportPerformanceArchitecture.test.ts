import fs from 'fs';
import path from 'path';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('client support screen performance contracts', () => {
  const database = read('services', 'databaseService.ts');

  it('keeps realtime access out of notification and conversation screens', () => {
    for (const screen of [
      ['screens', 'client', 'MessagesScreen.tsx'],
      ['screens', 'shared', 'NotificationsScreen.tsx'],
      ['screens', 'client', 'ProviderChatScreen.tsx'],
      ['screens', 'provider', 'ProviderConversationScreen.tsx'],
    ]) {
      expect(read(...screen)).not.toContain("from '../../lib/supabase'");
    }

    expect(database).toContain('subscribeToUserConversationChanges');
    expect(database).toContain('filter: `user_id=eq.${userId}`');
    expect(database).toContain('subscribeToConversationMessages');
    expect(database).toContain('filter: `conversation_id=eq.${conversationId}`');
  });

  it('does not perform duplicate mount and focus conversation loads', () => {
    const source = read('screens', 'client', 'MessagesScreen.tsx');
    const initialLoadSection = source.slice(
      source.indexOf('useFocusEffect(useCallback(() =>'),
      source.indexOf('// Live updates:'),
    );

    expect(initialLoadSection).toContain('fetchConversations()');
    expect(source).not.toContain(
      'useEffect(() => {\n    fetchConversations().finally',
    );
  });

  it('bounds inboxes, notifications, promotions and chat history', () => {
    const conversationSection = database.slice(
      database.indexOf('export async function getUserConversations'),
      database.indexOf('export async function getProviderBookingsByDate'),
    );
    const notificationSection = database.slice(
      database.indexOf('export async function getMyNotifications'),
      database.indexOf('export async function markNotificationRead'),
    );
    const messageSection = database.slice(
      database.indexOf('export async function getConversationMessages'),
      database.indexOf('export async function sendProviderMessage'),
    );
    const promotionSection = database.slice(
      database.indexOf('export async function getActivePromotions'),
      database.indexOf('export async function getProviderActivePromotions'),
    );

    expect(conversationSection).toContain('.limit(DEFAULT_PROVIDER_QUERY_LIMIT)');
    expect(notificationSection).toContain('.limit(100)');
    expect(messageSection).toContain('.limit(');
    expect(promotionSection).toContain('.limit(DEFAULT_PROVIDER_QUERY_LIMIT)');
    expect(promotionSection).not.toContain('.select("*")');
    expect(promotionSection).not.toContain('scheduled_notify_at');
  });

  it('renders bookmarked providers before loading offer badge metadata', () => {
    const source = read('screens', 'client', 'BookmarkedProvidersScreen.tsx');
    const renderReady = source.indexOf('setLoading(false);');
    const offerBadges = source.indexOf('getProviderIdsWithActivePromotions()');

    expect(renderReady).toBeGreaterThan(-1);
    expect(offerBadges).toBeGreaterThan(renderReady);
    expect(source).not.toContain('getActivePromotions()');
  });

  it('virtualizes and memoizes the bookmarked provider grid', () => {
    const source = read('screens', 'client', 'BookmarkedProvidersScreen.tsx');

    expect(source).toContain('const BookmarkGridCard = React.memo');
    expect(source).toContain('const renderProviderCard: ListRenderItem<Provider> = useCallback');
    expect(source).toContain('data={filteredProviders}');
    expect(source).toContain('renderItem={renderProviderCard}');
    expect(source).toContain('numColumns={2}');
    expect(source).toContain('initialNumToRender={6}');
    expect(source).toContain('maxToRenderPerBatch={6}');
    expect(source).not.toContain('{filteredProviders.map(');
  });

  it('debounces claimable-provider search and sanitizes its PostgREST filter', () => {
    const source = read('screens', 'auth', 'ClaimProviderScreen.tsx');
    const searchSection = database.slice(
      database.indexOf('export async function searchUnclaimedProviders'),
      database.indexOf('export interface UnclaimedProviderDetailRow'),
    );

    expect(source).toContain('}, 300);');
    expect(source).toContain('if (active) setResults(found)');
    expect(source).toContain('onChangeText={setQuery}');
    expect(searchSection).toContain('sanitizeIlikeTerm(query.trim())');
    expect(searchSection).not.toContain('ilike.%${query}%');
  });

  it('flushes a pending notification preference when leaving the screen', () => {
    const source = read('screens', 'client', 'NotificationsSettingsScreen.tsx');

    expect(source).toContain('const pendingPrefs = useRef<NotificationPreferences | null>(null)');
    expect(source).toContain('if (saveTimer.current) clearTimeout(saveTimer.current)');
    expect(source).toContain('saveNotificationPreferences(pendingPrefs.current)');
  });
});
