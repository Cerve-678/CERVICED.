// ExploreScreen.tsx - Pinterest Discovery
import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { ExploreStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

// Discover components
import { MasonryGrid } from '../components/MasonryGrid';
import { PortfolioCard } from '../components/PortfolioCard';
import { ImageDetailModal } from '../components/ImageDetailModal';

// Data types
import { PortfolioItem, ServiceCategory } from '../types/providers';
import {
  getPortfolioItems,
  getDiscoverProviders,
  getDiscoverServices,
  getSavedPortfolioDetails,
} from '../services/databaseService';
import type { PortfolioItemWithProvider, DiscoverServiceWithProvider, DbProvider } from '../types/database';

// Stores
import { useBookmarkStore } from '../stores/useBookmarkStore';

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
function SkeletonMasonryGrid({ isDarkMode }: { isDarkMode: boolean }) {
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
  const base = isDarkMode ? '#2A2724' : '#EDE8E2';
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
// FILTER CHIP
// ============================================================================
interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip = memo<FilterChipProps>(({ label, isSelected, onPress }) => {
  const { isDarkMode, palette: P } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        { backgroundColor: P.card, borderColor: P.border },
        isSelected && { backgroundColor: P.accent, borderColor: P.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isSelected ? '#FFFFFF' : P.sub },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});
FilterChip.displayName = 'FilterChip';

// ============================================================================
// SUB-TAB SELECTOR
// ============================================================================
interface SubTabProps {
  activeTab: 'discover' | 'favourites';
  onTabChange: (tab: 'discover' | 'favourites') => void;
}

const SubTabBar = memo<SubTabProps>(({ activeTab, onTabChange }) => {
  const { palette: P } = useTheme();
  return (
    <View style={[styles.subTabBar, { backgroundColor: P.bg }]}>
      <TouchableOpacity
        style={[styles.subTab, activeTab === 'discover' && { borderBottomColor: P.accent }]}
        onPress={() => onTabChange('discover')}
      >
        <Text style={[styles.subTabText, { color: activeTab === 'discover' ? P.accent : P.sub }]}>
          Discover
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.subTab, activeTab === 'favourites' && { borderBottomColor: P.accent }]}
        onPress={() => onTabChange('favourites')}
      >
        <Text style={[styles.subTabText, { color: activeTab === 'favourites' ? P.accent : P.sub }]}>
          Favourites
        </Text>
      </TouchableOpacity>
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

  // State
  const [activeTab, setActiveTab] = useState<'discover' | 'favourites'>('discover');
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
      category: (item.category?.toUpperCase() as ServiceCategory) ?? 'NAILS',
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

  // Map a service + its first photo to a card for the mixed discovery feed.
  const mapDbServiceToCard = useCallback((s: DiscoverServiceWithProvider): PortfolioItem => {
    const images = [...s.service_images].sort((a, b) => a.sort_order - b.sort_order);
    const p = s.provider;
    return {
      id: `service-${s.id}`,
      image: { uri: images[0]?.url ?? '' },
      caption: s.name,
      category: p.service_category as unknown as ServiceCategory,
      aspectRatio: 0.8,
      providerId: p.slug,
      price: `£${s.price}`,
      providerName: p.display_name,
      providerSlug: p.slug,
      providerRating: p.rating,
      providerReviewCount: p.review_count,
      kind: 'service',
      serviceId: s.id,
      ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
    };
  }, []);

  // Load stores on mount
  useEffect(() => {
    loadSavedPortfolio();
  }, []);

  // Filters
  const filters = useMemo(() => ['All', 'Hair', 'Nails', 'Makeup', 'Aesthetics', 'Brows', 'Lashes'], []);

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
        const [portfolioData, providerData, serviceData] = await Promise.all([
          getPortfolioItems(category),
          getDiscoverProviders(category),
          getDiscoverServices(category),
        ]);

        if (!cancelled) {
          setPortfolioItems(
            interleaveDiscoverFeed(
              portfolioData.map(mapDbPortfolioItem),
              serviceData.map(mapDbServiceToCard),
              providerData.map(mapDbProviderToCard)
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
  }, [selectedFilter, filterMap, mapDbPortfolioItem, mapDbProviderToCard, mapDbServiceToCard]);

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

        const cards = [
          ...savedPortfolio.map(mapDbPortfolioItem),
          ...providers.map(mapDbProviderToCard),
          ...services.map(mapDbServiceToCard),
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
  }, [activeTab, savedPortfolioIds, mapDbPortfolioItem, mapDbProviderToCard, mapDbServiceToCard]);

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
    navigation.navigate('Search', { morph: true });
  }, [navigation]);

  const handleImagePress = useCallback((item: PortfolioItem) => {
    setSelectedImage(item);
    setIsDetailVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
    setSelectedImage(null);
  }, []);

  const handleViewProfile = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any) => {
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
  // ready for date/time (and the consultation flow if this provider
  // requires one), instead of leaving a fake item sitting in the cart.
  const handleBookNow = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any, serviceId?: string) => {
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
                onPress={() => navigation.navigate('BookmarkedProviders' as any)}
              >
                <TabIcon name="bookmark" size={20} color={P.text} />
              </TouchableOpacity>
            </View>

            {/* Filter Chips */}
            <View style={[styles.filterSection, { backgroundColor: P.bg, borderBottomColor: P.sep }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
              >
                {filters.map(filter => (
                  <FilterChip
                    key={filter}
                    label={filter}
                    isSelected={selectedFilter === filter}
                    onPress={() => setSelectedFilter(filter)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Masonry Grid */}
            {portfolioLoading ? (
              <SkeletonMasonryGrid isDarkMode={isDarkMode} />
            ) : (
              <MasonryGrid
                data={portfolioItems}
                renderItem={renderPortfolioCard}
                getItemHeight={getItemHeight}
                keyExtractor={item => item.id}
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
            <SkeletonMasonryGrid isDarkMode={isDarkMode} />
          ) : (
            <MasonryGrid
              data={favouriteItems}
              renderItem={renderPortfolioCard}
              getItemHeight={getItemHeight}
              keyExtractor={item => item.id}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  subTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
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
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
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
