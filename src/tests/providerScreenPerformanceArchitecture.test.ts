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

  it('loads Provider My Services once per focus, reusing the provider row it fetched', () => {
    const source = readProviderScreen('ProviderMyProfileScreen');

    // One focus effect keyed on the user, not on any piece of view state.
    expect(source).toContain('}, [user?.id])');

    // The provider row is read ONCE and then passed around. Re-resolving it
    // per consumer is what made this screen read the same row several times:
    // an id lookup, a reviews lookup, a catalogue lookup, a go-live lookup.
    expect(source).toContain('getMyProviderProfile()');
    expect(source).not.toContain('getProviderIdForUserId');
    expect(source).toContain('getMyServiceCatalogue(profile.id)');
    expect(source).toContain('getProviderReviews(profile.id, { limit: 20 })');
    expect(source).toContain('fetchGoLiveStatus(profile)');
    expect(source).toContain('includeExtendedSearch: false');
  });

  it('manages the service catalogue in place rather than linking to the big form', () => {
    const source = readProviderScreen('ProviderMyProfileScreen');

    // The whole point of the screen: per-service writes, not
    // replaceProviderServiceCatalog via InfoRegScreen's document save.
    expect(source).toContain('createMyService(');
    expect(source).toContain('updateMyService(');
    expect(source).toContain('setMyServiceActive(');
    expect(source).not.toContain('replaceProviderServiceCatalog');

    // Hiding, never deleting: a service row is referenced by every booking
    // ever made from it, so a delete would orphan the provider's history.
    expect(source).not.toContain('deleteMyService');

    // Portfolio is managed here too.
    expect(source).toContain('addPortfolioItem(');
    expect(source).toContain('deletePortfolioItem(');
  });

  it('keeps Provider My Services on one go-live source of truth', () => {
    const source = readProviderScreen('ProviderMyProfileScreen');

    // Status comes from the shared module, never from a locally-invented
    // readiness score. A second checklist here is what let the old "Profile
    // Health 5/7" card contradict the database's own has_gone_live.
    expect(source).toContain("from '../../features/providers/goLiveStatus'");
    expect(source).not.toContain('profileReadiness');

    // The client-view replica is gone. InfoRegScreen's PREVIEW modal is where
    // a provider sees what clients see.
    expect(source).not.toContain('<ProviderPortfolioSection');
    expect(source).not.toContain('<CategoryTabPill');
    expect(source).not.toContain('<SlidingTabs');
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
