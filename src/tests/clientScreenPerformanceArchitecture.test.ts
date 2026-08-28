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
