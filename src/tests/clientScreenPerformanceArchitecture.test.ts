import fs from 'fs';
import path from 'path';

const readScreen = (name: string): string =>
  fs.readFileSync(
    path.join(__dirname, '..', 'screens', 'client', `${name}.tsx`),
    'utf8',
  );

describe('client screen performance contracts', () => {
  it('loads Explore filters on demand instead of prefetching every feed', () => {
    const source = readScreen('ExploreScreen');

    expect(source).not.toContain('hasStartedPrefetch');
    expect(source).not.toContain('prefetchRemaining');
  });

  it('bounds the initial Explore queries and never keeps the feed spinner forever', () => {
    const source = readScreen('ExploreScreen');

    expect(source).toContain('DISCOVER_PORTFOLIO_LIMIT = 60');
    expect(source).toContain("withTimeout(");
    expect(source).toContain("'Explore feed'");
  });

  it('uses a lean public projection for Explore portfolio cards', () => {
    const source = readScreen('ExploreScreen');
    const database = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'databaseService.ts'),
      'utf8',
    );

    expect(source).toContain('getExplorePortfolioItems(category, DISCOVER_PORTFOLIO_LIMIT)');
    expect(database).toContain('const EXPLORE_PORTFOLIO_SELECT');
    expect(database).toContain('.select(EXPLORE_PORTFOLIO_SELECT)');
  });

  it('progressively mounts Explore cards and only measures fallback ratios', () => {
    const source = readScreen('ExploreScreen');
    const cardSource = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'PortfolioCard.tsx'),
      'utf8',
    );

    expect(source).toContain('const INITIAL_EXPLORE_ITEMS = 24');
    expect(source).toContain('portfolioItems.slice(0, discoverVisibleCount)');
    expect(source).toContain('favouriteItems.slice(0, favouritesVisibleCount)');
    expect(source).toContain('.filter(i => i.aspectRatioIsFallback)');
    expect(source).toContain('data={visiblePortfolioItems}');
    expect(cardSource).toContain('const shouldAnimate = index < 10');
  });

  it('records only a settled Search query, not every keystroke', () => {
    const source = readScreen('SearchScreen');
    const inputHandler = source.slice(
      source.indexOf('const handleSearchChange'),
      source.indexOf('// ── Tracked filter chip selection'),
    );

    expect(inputHandler).not.toContain('trackSearch');
    expect(source).toContain('userLearningService.trackSearch(q, catCode)');
    expect(source).toContain('const ProviderCard = memo');
    expect(source).toContain('initialNumToRender={6}');
    expect(source).toContain('maxToRenderPerBatch={6}');
    expect(source).toContain("removeClippedSubviews={Platform.OS === 'android'}");
  });

  it('watches booking location only while the screen is focused', () => {
    const source = readScreen('BookingsScreen');

    expect(source).toContain('useFocusEffect(useCallback(() =>');
    expect(source).toContain('Location.watchPositionAsync(');
    expect(source).not.toContain('setInterval(getUserLocation');
    expect(source).toContain("type BookingsListRow =");
    expect(source).toContain('const WaitlistCard = React.memo');
    expect(source).toContain('data={virtualizedListRows}');
    expect(source).toContain('renderItem={renderBookingsListRow}');
    expect(source).toContain('ListHeaderComponent={(');
    expect(source).not.toContain('data={listItems}');
    expect(source).not.toContain('{waitlistEntries.map(entry => (');
  });

  it('opens appointment details from client booking cards and labels in-progress clearly', () => {
    const source = readScreen('BookingsScreen');

    expect(source).toContain("currentBooking.status === BookingStatus.IN_PROGRESS ? 'IN PROGRESS' : 'UPCOMING'");
    expect(source).toContain("const IN_PROGRESS_PURPLE = '#7B2FBE'");
    expect(source).toContain('onPress={() => handleBookingPress(currentBooking)}');
    expect(source).not.toContain('onPress={() => focusMapOnLocation(currentBooking.coordinates)}');
  });

  it('loads cart provider checkout metadata in one request', () => {
    const source = readScreen('CartScreen');

    expect(source).toContain('getProviderCheckoutMetadata(names)');
    expect(source).not.toContain('getMobileProviderDisplayNames(names)');
    expect(source).not.toContain(
      'getProviderDepositPoliciesByDisplayNames(names)',
    );
    expect(source).toContain('const CartProviderSection = memo');
    expect(source).toContain('const CartCheckoutFooter = memo');
    expect(source).toContain('const cartProviderRows = useMemo');
    expect(source).toContain('const renderCartProviderRow = useCallback');
    expect(source).toContain('data={items.length > 0 ? cartProviderRows : []}');
    expect(source).toContain('renderItem={renderCartProviderRow}');
    expect(source).toContain('initialNumToRender={3}');
    expect(source).toContain('maxToRenderPerBatch={3}');
    expect(source).toContain('ListFooterComponent={items.length > 0 ? (');
    expect(source).not.toContain('{Object.entries(itemsByProvider).map(');
  });

  it('uses an explicit public projection for provider discovery lists', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'databaseService.ts'),
      'utf8',
    );
    const providerListSection = source.slice(
      source.indexOf('const PUBLIC_PROVIDER_SUMMARY_SELECT'),
      source.indexOf('export async function getProviderPriceRanges'),
    );

    expect(providerListSection).toContain(
      '.select(PUBLIC_PROVIDER_SUMMARY_SELECT)',
    );
    expect(providerListSection).not.toContain('.select("*")');
  });

  it('virtualizes Home provider rails instead of mounting every image card', () => {
    const source = readScreen('HomeScreen');

    expect(source).toContain('const ProviderRail = React.memo');
    expect(source).toContain('const RoundProviderRail = React.memo');
    expect(source).toContain('initialNumToRender={4}');
    expect(source).toContain("removeClippedSubviews={Platform.OS === 'android'}");
    expect(source).not.toContain('{trending.map(provider => (');
    expect(source).not.toContain('{recentlyViewed.map(provider => (');
    expect(source).not.toContain('{nearbyProviders.slice(0, 15).map(provider => (');
  });
});
