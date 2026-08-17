// ExploreScreen.tsx - Pinterest Discovery
import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import { useExploreFocusStore } from '../../stores/useExploreFocusStore';
import { exploreScrollHandler, resetExplorePillTracking, settleExplorePillTracking } from '../../utils/exploreTabBarScroll';
import { ExploreStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import TabIcon from '../../components/TabIcon';
import SlidingTabs from '../../components/SlidingTabs';
import { dimensions, fonts, spacing } from '../../constants/PlatformDimensions';

// Discover components
import { MasonryGrid } from '../../components/MasonryGrid';
import { PortfolioCard } from '../../components/PortfolioCard';
import { ImageDetailModal } from '../../components/ImageDetailModal';

// Data types
import { PortfolioItem, ServiceCategory } from '../../types/providers';
import {
  getPortfolioItems,
  getDiscoverProviders,
  getDiscoverServices,
  getDiscoverUnclaimedProviders,
  getSavedPortfolioDetails,
} from '../../services/databaseService';
import type { DiscoverUnclaimedProvider } from '../../services/databaseService';
import type { PortfolioItemWithProvider, DiscoverServiceWithProvider, DbProvider } from '../../types/database';

// Stores
import { useBookmarkStore } from '../../stores/useBookmarkStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mixes portfolio photos with provider and service cards for a Pinterest-style
// feed, instead of stacking every source back-to-back — a run of portfolio
// items with one provider/service card dropped in periodically.
function interleaveDiscoverFeed(
  portfolioCards: PortfolioItem[],
  serviceCards: PortfolioItem[],
  providerCards: PortfolioItem[]
): PortfolioItem[] {
  const PORTFOLIO_RUN = 4;
  const result: PortfolioItem[] = [];
  let pIdx = 0;
  let sIdx = 0;
  let vIdx = 0;

  while (pIdx < portfolioCards.length || sIdx < serviceCards.length || vIdx < providerCards.length) {
    for (let k = 0; k < PORTFOLIO_RUN && pIdx < portfolioCards.length; k++) {
      result.push(portfolioCards[pIdx++]!);
    }
    if (sIdx < serviceCards.length) {
      result.push(serviceCards[sIdx++]!);
    }
    if (vIdx < providerCards.length) {
      result.push(providerCards[vIdx++]!);
    }
  }

  return result;
}

// ── Skeleton Masonry Grid ────────────────────────────────────────────────
function SkeletonMasonryGrid() {
  const { palette: P } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });
  const base = P.surface;
  const colWidth = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;
  const leftHeights = [200, 140, 180, 120, 160];
  const rightHeights = [160, 210, 130, 175, 150];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: 12 }}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        {leftHeights.map((h, i) => (
          <Animated.View key={i} style={{ width: colWidth, height: h, borderRadius: 12, backgroundColor: base, opacity }} />
        ))}
      </View>
      <View style={{ flex: 1, gap: spacing.sm }}>
        {rightHeights.map((h, i) => (
          <Animated.View key={i} style={{ width: colWidth, height: h, borderRadius: 12, backgroundColor: base, opacity }} />
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// SUB-TAB SELECTOR
// ============================================================================
interface SubTabProps {
  activeTab: 'discover' | 'favourites';
  onTabChange: (tab: 'discover' | 'favourites') => void;
}

const SUB_TABS = [
  { key: 'discover' as const,   label: 'Discover' },
  { key: 'favourites' as const, label: 'Favourites' },
];

// Both tabs match — same heavier BakbakOne treatment, sitting side by side
// on the left. Underline-when-active, no shared SlidingTabs pill (that
// treatment is used elsewhere — Bookings, the filter chips below).
const SubTabBar = memo<SubTabProps>(({ activeTab, onTabChange }) => {
  const { palette: P } = useTheme();
  return (
    <View style={[styles.subTabBar, { backgroundColor: P.bg }]}>
      {SUB_TABS.map(tab => {
        const active = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onTabChange(tab.key);
            }}
            activeOpacity={0.5}
            style={styles.subTab}
          >
            <Text style={[styles.discoverLabel, { color: active ? P.text : P.sub }]}>
              {tab.label}
            </Text>
            <View style={[styles.subTabUnderline, { backgroundColor: active ? P.accent : 'transparent' }]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
});
SubTabBar.displayName = 'SubTabBar';

// ============================================================================
// MAIN EXPLORE SCREEN
// ============================================================================
const ExploreScreen = memo(() => {
  const navigation = useNavigation<NavigationProp<ExploreStackParamList>>();
  const { isDarkMode, palette: P } = useTheme();
  const setExploreFocused = useExploreFocusStore(s => s.setExploreFocused);

  // Tell the floating tab bar it should apply its scroll-hide/opacity
  // treatment only while this exact screen (not Search, not a provider
  // profile pushed on top of it) is the visible one — and always start
  // fully shown when arriving here.
  useFocusEffect(
    useCallback(() => {
      resetExplorePillTracking();
      setExploreFocused(true);
      return () => setExploreFocused(false);
    }, [setExploreFocused])
  );

  // State
  const [activeTab, setActiveTab] = useState<'discover' | 'favourites'>('discover');

  // Switching Discover <-> Favourites swaps in a different ScrollView at
  // offset 0 — reset the pill's tracking so it doesn't carry over a
  // scrolled-away state (or stale direction baseline) from the other tab.
  useEffect(() => {
    resetExplorePillTracking();
  }, [activeTab]);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [selectedImage, setSelectedImage] = useState<PortfolioItem | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);

  // Stores
  const { loadSavedPortfolio, savedPortfolioIds } = useBookmarkStore();

  // Favourites — anything the user hearted, resolved from useBookmarkStore's
  // saved ids (a mix of portfolio/provider/service ids from the mixed feed)
  const [favouriteItems, setFavouriteItems] = useState<PortfolioItem[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(false);

  // Portfolio items from Supabase
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Map a Supabase portfolio row to the local PortfolioItem shape
  const mapDbPortfolioItem = useCallback((item: PortfolioItemWithProvider): PortfolioItem => {
    const p = item.provider;
    return {
      id: item.id,
      image: { uri: item.image_url },
      caption: item.caption ?? '',
      // Falls back to the provider's own service_category rather than a
      // fixed literal — addPortfolioItem now stamps category on insert
      // (see databaseService.ts), but any legacy row still sitting at
      // category = NULL should read as whatever its provider's real
      // category is, not silently masquerade as Nails.
      category: (item.category?.toUpperCase() as ServiceCategory) ?? (p.service_category as unknown as ServiceCategory),
      aspectRatio: item.aspect_ratio,
      providerId: p?.slug ?? item.provider_id,
      tags: item.tags ?? [],
      imageUri: item.image_url,
      providerName: p.display_name,
      providerSlug: p.slug,
      providerRating: p.rating,
      providerReviewCount: p.review_count,
      kind: 'portfolio',
      ...(item.price != null ? { price: `£${item.price}` } : {}),
      ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
    };
  }, []);

  // Map a provider row to a cover-photo card for the mixed discovery feed.
  // No real dimensions for a cover photo, so a portrait 4:5 default keeps it
  // in line with typical portfolio photos rather than defaulting to square.
  const mapDbProviderToCard = useCallback((p: DbProvider): PortfolioItem => ({
    id: `provider-${p.id}`,
    image: { uri: p.background_image_url ?? p.logo_url ?? '' },
    caption: p.about_text ?? '',
    category: p.service_category as unknown as ServiceCategory,
    aspectRatio: 0.8,
    providerId: p.slug,
    providerName: p.display_name,
    providerSlug: p.slug,
    providerRating: p.rating,
    providerReviewCount: p.review_count,
    kind: 'provider',
    ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
  }), []);

  // Map an unclaimed/scraped provider row to a "ready to claim" card. No
  // rating/review data exists for these (never onboarded), so those fields
  // are simply omitted rather than faked as 0 — PortfolioCard already
  // treats them as optional. providerId uses the real id, and providerSlug
  // is deliberately omitted: ImageDetailModal navigates via
  // `item.providerSlug ?? item.providerId`, and getProviderBySlug requires
  // has_gone_live = true, which no unclaimed row ever has — so resolving by
  // slug would 404. Leaving providerSlug unset makes that fallback resolve
  // to the real id, which ProviderProfileScreen's unclaimed-fallback lookup
  // (getUnclaimedProviderDetail) expects.
  const mapDbUnclaimedProviderToCard = useCallback((p: DiscoverUnclaimedProvider): PortfolioItem => ({
    id: `provider-${p.id}`,
    image: { uri: p.logo_url ?? '' },
    caption: p.about_text ?? '',
    category: p.service_category as unknown as ServiceCategory,
    aspectRatio: 0.8,
    providerId: p.id,
    providerName: p.display_name,
    kind: 'provider',
    isUnclaimed: true,
    ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
  }), []);

  // Map a service to one card PER photo in its carousel (not just the cover
  // shot) — each carries the same serviceId/price/provider so tapping any of
  // them books the same service. Ids carry a `__<imageIndex>` suffix so each
  // photo is independently favouritable and uniquely keyed; see the matching
  // strip-and-dedupe in getSavedPortfolioDetails.
  const mapDbServiceToCards = useCallback((s: DiscoverServiceWithProvider): PortfolioItem[] => {
    const images = [...s.service_images].sort((a, b) => a.sort_order - b.sort_order);
    const imageSources = images.map(img => ({ uri: img.url }));
    const p = s.provider;
    return images.map((img, idx) => ({
      id: `service-${s.id}__${idx}`,
      image: { uri: img.url },
      images: imageSources,
      caption: s.description ?? '',
      serviceName: s.name,
      category: p.service_category as unknown as ServiceCategory,
      aspectRatio: 0.8,
      providerId: p.slug,
      price: `£${s.price}`,
      providerName: p.display_name,
      providerSlug: p.slug,
      providerRating: p.rating,
      providerReviewCount: p.review_count,
      kind: 'service' as const,
      serviceId: s.id,
      ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
    }));
  }, []);

  // Load stores on mount
  useEffect(() => {
    loadSavedPortfolio();
  }, [loadSavedPortfolio]);

  // Filters
  const filters = useMemo(() => ['All', 'Hair', 'Nails', 'Makeup', 'Aesthetics', 'Brows', 'Lashes'], []);
  const filterTabs = useMemo(() => filters.map(f => ({ key: f, label: f })), [filters]);

  const filterMap: Record<string, ServiceCategory> = useMemo(() => ({
    Hair: 'HAIR',
    Nails: 'NAILS',
    Makeup: 'MUA',
    Aesthetics: 'AESTHETICS',
    Brows: 'BROWS',
    Lashes: 'LASHES',
  }), []);

  // Fetch the mixed discovery feed whenever the category filter changes.
  // Explore's search bar isn't a live filter — tapping it opens SearchScreen
  // instead — so there's no text-query branch here any more.
  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    const category = selectedFilter !== 'All' ? filterMap[selectedFilter] : undefined;

    const load = async () => {
      try {
        const [portfolioData, providerData, serviceData, unclaimedData] = await Promise.all([
          getPortfolioItems(category),
          getDiscoverProviders(category),
          getDiscoverServices(category),
          getDiscoverUnclaimedProviders(category),
        ]);

        if (!cancelled) {
          setPortfolioItems(
            interleaveDiscoverFeed(
              portfolioData.map(mapDbPortfolioItem),
              serviceData.flatMap(mapDbServiceToCards),
              [
                ...providerData.map(mapDbProviderToCard),
                ...unclaimedData.map(mapDbUnclaimedProviderToCard),
              ]
            )
          );
        }
      } catch {
        if (!cancelled) setPortfolioItems([]);
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedFilter, filterMap, mapDbPortfolioItem, mapDbProviderToCard, mapDbUnclaimedProviderToCard, mapDbServiceToCards]);

  // Fetch favourites whenever the tab is opened or the saved-ids list changes
  // (e.g. hearting/unhearting something while already on this tab).
  useEffect(() => {
    if (activeTab !== 'favourites') return;
    if (savedPortfolioIds.length === 0) {
      setFavouriteItems([]);
      return;
    }

    let cancelled = false;
    setFavouritesLoading(true);

    const load = async () => {
      try {
        const { portfolioItems: savedPortfolio, providers, services } =
          await getSavedPortfolioDetails(savedPortfolioIds);
        if (cancelled) return;

        // getSavedPortfolioDetails returns each saved service's full row —
        // every photo in its carousel, not just the specific one(s) that
        // were actually saved — so the flat-mapped cards need filtering back
        // down to exactly the saved ids before they're shown as favourites.
        const savedIdSet = new Set(savedPortfolioIds);
        const cards = [
          ...savedPortfolio.map(mapDbPortfolioItem),
          ...providers.map(mapDbProviderToCard),
          ...services.flatMap(mapDbServiceToCards).filter(c => savedIdSet.has(c.id)),
        ];
        // Most-recently-saved first, matching save order in savedPortfolioIds.
        const order = new Map(savedPortfolioIds.map((id, i) => [id, i]));
        cards.sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
        setFavouriteItems(cards);
      } catch {
        if (!cancelled) setFavouriteItems([]);
      } finally {
        if (!cancelled) setFavouritesLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeTab, savedPortfolioIds, mapDbPortfolioItem, mapDbProviderToCard, mapDbServiceToCards]);

  // Column width for masonry
  const columnWidth = useMemo(() => {
    return (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;
  }, []);

  // Masonry item height calculator — aspectRatio is width/height, so height = width / ratio.
  const getItemHeight = useCallback(
    (item: PortfolioItem, colWidth: number) => {
      return colWidth / item.aspectRatio;
    },
    []
  );

  // Handlers
  const handleOpenSearch = useCallback(() => {
    // morph: true — this search bar is a real search-bar mockup (unlike
    // HomeScreen's plain icon button), so it should float-up-and-merge into
    // SearchScreen's own search bar the same way a Home "Choose Service"
    // pill tap does, instead of popping in at rest. The screen-level
    // transition itself is suppressed by the `animation: 'none'` static
    // option on ExploreNavigator's Search screen, not by a per-navigate
    // override (navigate() has no such 3rd argument).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('Search', { morph: true });
  }, [navigation]);

  const handleImagePress = useCallback((item: PortfolioItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedImage(item);
    setIsDetailVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
    setSelectedImage(null);
  }, []);

  const handleViewProfile = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      navigation.navigate('ProviderProfile', {
        providerId,
        source: 'explore',
      });
    },
    [navigation]
  );

  // Was previously adding a fake placeholder cart item (£75, "1 hour",
  // service id 1 — not a real services row) before navigating away. Now it
  // just navigates, passing the real service id when this card is backed by
  // one (kind === 'service') — ProviderProfileScreen picks openServiceId up
  // on load and opens that exact service's booking modal automatically,
  // ready for date/time, instead of leaving a fake item sitting in the cart.
  const handleBookNow = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any, serviceId?: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      navigation.navigate('ProviderProfile', {
        providerId,
        source: 'explore',
        ...(serviceId ? { openServiceId: serviceId } : {}),
      });
    },
    [navigation]
  );

  const renderPortfolioCard = useCallback(
    (item: PortfolioItem, index: number) => (
      <PortfolioCard
        item={item}
        columnWidth={columnWidth}
        onPress={handleImagePress}
        index={index}
      />
    ),
    [columnWidth, handleImagePress]
  );


  return (
    <ThemedBackground style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        {/* Sub-tab bar */}
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ============ DISCOVER TAB ============ */}
        {activeTab === 'discover' && (
          <>
            {/* Search Bar — not a live filter; tapping it opens SearchScreen,
                same as "about to start typing" jumping straight there. */}
            <View style={[styles.searchContainer, { backgroundColor: P.bg }]}>
              <TouchableOpacity
                style={[styles.searchBar, { backgroundColor: P.card }]}
                activeOpacity={0.7}
                onPress={handleOpenSearch}
              >
                <TabIcon name="magnifying-glass" size={18} color={P.sub} />
                <Text style={[styles.searchInput, { color: P.sub }]} numberOfLines={1}>
                  Search looks, styles, providers...
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.savedButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  navigation.navigate('BookmarkedProviders' as any);
                }}
              >
                <TabIcon name="bookmark" size={20} color={P.text} />
              </TouchableOpacity>
            </View>

            {/* Filter Chips */}
            <View style={[styles.filterSection, { backgroundColor: P.bg, borderBottomColor: P.sep }]}>
              <SlidingTabs
                tabs={filterTabs}
                activeKey={selectedFilter}
                onPress={(key) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedFilter(key);
                }}
                accentColor={P.accent}
                activeTextColor={P.onAccent}
                inactiveTextColor={P.sub}
                containerStyle={styles.filterScrollContent}
              />
            </View>

            {/* Masonry Grid */}
            {portfolioLoading ? (
              <SkeletonMasonryGrid />
            ) : (
              <MasonryGrid
                data={portfolioItems}
                renderItem={renderPortfolioCard}
                getItemHeight={getItemHeight}
                keyExtractor={item => item.id}
                onScroll={exploreScrollHandler}
                onScrollEndDrag={settleExplorePillTracking}
                onMomentumScrollEnd={settleExplorePillTracking}
                ListHeaderComponent={
                  <View style={styles.gridHeader}>
                    <Text style={[styles.gridCount, { color: P.sub }]}>
                      {portfolioItems.length} results
                    </Text>
                  </View>
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <TabIcon name="magnifying-glass" size={48} color={P.sub} />
                    <Text style={[styles.emptyText, { color: P.text }]}>No looks found</Text>
                    <Text style={[styles.emptySubtext, { color: P.sub }]}>
                      Try a different search or filter
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}

        {/* ============ FAVOURITES TAB ============ */}
        {activeTab === 'favourites' && (
          favouritesLoading ? (
            <SkeletonMasonryGrid />
          ) : (
            <MasonryGrid
              data={favouriteItems}
              renderItem={renderPortfolioCard}
              getItemHeight={getItemHeight}
              keyExtractor={item => item.id}
              onScroll={exploreScrollHandler}
              onScrollEndDrag={settleExplorePillTracking}
              onMomentumScrollEnd={settleExplorePillTracking}
              ListHeaderComponent={
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridCount, { color: P.sub }]}>
                    {favouriteItems.length} saved
                  </Text>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <TabIcon name="heart" size={48} color={P.sub} />
                  <Text style={[styles.emptyText, { color: P.text }]}>No favourites yet</Text>
                  <Text style={[styles.emptySubtext, { color: P.sub }]}>
                    Tap the heart on any look, provider or service to save it here
                  </Text>
                </View>
              }
            />
          )
        )}
      </SafeAreaView>

      {/* Modals */}
      <ImageDetailModal
        visible={isDetailVisible}
        item={selectedImage}
        onClose={handleCloseDetail}
        onViewProfile={handleViewProfile}
        onBookNow={handleBookNow}
        similarItems={portfolioItems}
        onSelectItem={setSelectedImage}
      />
    </ThemedBackground>
  );
});

ExploreScreen.displayName = 'ExploreScreen';
export default ExploreScreen;

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Jura-VariableFont_wght',
  },

  savedButton: {
    padding: spacing.sm,
  },

  // Sub-tabs
  subTabBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  subTab: {
    alignItems: 'center',
  },
  discoverLabel: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  subTabUnderline: {
    marginTop: 4,
    height: 2,
    width: '100%',
    borderRadius: 1,
  },
  // Search Bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Filter Section
  filterSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  filterScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  // Grid
  gridHeader: {
    paddingBottom: spacing.sm,
  },
  gridCount: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: fonts.title.small,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
    marginTop: spacing.lg,
  },
  emptySubtext: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: spacing.sm,
  },

});
