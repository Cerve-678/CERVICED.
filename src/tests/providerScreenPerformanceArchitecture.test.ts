import fs from 'fs';
import path from 'path';

const readProviderScreen = (name: string): string =>
  fs.readFileSync(
    path.join(__dirname, '..', 'screens', 'provider', `${name}.tsx`),
    'utf8',
  );

describe('provider screen performance contracts', () => {
  it('does not duplicate Home, Inbox, or Analytics loads on mount and focus', () => {
    const home = readProviderScreen('ProviderHomeScreen');
    const inbox = readProviderScreen('ProviderInboxScreen');
    const analytics = readProviderScreen('ProviderAnalyticsScreen');

    expect(home).not.toContain('useEffect(() => { loadBookings(true); }');
    expect(inbox).not.toContain(
      'Promise.all([fetchBookings(), fetchConversations()]).finally(() => setLoading(false))',
    );
    expect(analytics).not.toContain('getProviderBookings(Infinity),');
    expect(analytics).toContain("range === 'all' ? Infinity : 210");
  });

  it('does not reload Provider My Profile when switching category tabs', () => {
    const source = readProviderScreen('ProviderMyProfileScreen');

    expect(source).toContain('}, [user?.id])');
    expect(source).not.toContain('}, [user?.id, selectedCategory])');
    expect(source).toContain('getProviderReviews(providerId, { limit: 20 })');
    expect(source).toContain('includeExtendedSearch: false');
    expect(source).toContain('hasMyProviderTermsForm()');
    expect(source).toContain('<ProviderPortfolioSection');
    expect(source).toContain('interactiveImages={false}');
    expect(source).not.toContain('portfolioColumns.map(');
  });

  it('keeps provider booking realtime access behind databaseService', () => {
    const source = readProviderScreen('ProviderHomeScreen');

    expect(source).not.toContain("from '../../lib/supabase'");
    expect(source).toContain('subscribeToProviderBookingChanges(');
  });

  it('does not duplicate booking-history loads or hydrate inbox rows for a badge', () => {
    const source = readProviderScreen('ProviderBookingHistoryScreen');

    expect(source).not.toContain('getProviderConversations()');
    expect(source).toContain('getProviderUnreadConversationCount()');
    expect(source).not.toContain(
      'Promise.all([fetchBookings(), fetchWaitlist(), fetchUnreadMessages()]).finally(() => setLoading(false))',
    );
  });
});
