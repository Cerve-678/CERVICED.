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
import { useNavigation, useFocusEffect, useIsFocused, NavigationProp } from '@react-navigation/native';
import { useExploreFocusStore } from '../../stores/useExploreFocusStore';
import { exploreScrollHandler, resetExplorePillTracking, settleExplorePillTracking } from '../../utils/exploreTabBarScroll';
import { getMasonryItemHeight } from '../../utils/masonryHeight';
import { useMeasuredAspectRatios } from '../../utils/useMeasuredAspectRatios';
import { shuffle } from '../../utils/shuffle';
import { pickTourCardId } from '../../utils/coachMarkTargets';
import { ExploreStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { CoachMarkTour, CoachMarkStep } from '../../components/CoachMarkTour';
import TabIcon from '../../components/TabIcon';
import SlidingTabs from '../../components/SlidingTabs';
import { dimensions, fonts, spacing } from '../../constants/PlatformDimensions';

// Discover components
import { MasonryGrid, MasonryGridHandle } from '../../components/MasonryGrid';
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
  prefetchProviderBySlug,
} from '../../services/databaseService';
import type { DiscoverUnclaimedProvider } from '../../services/databaseService';
import type { PortfolioItemWithProvider, DiscoverServiceWithProvider, DbProvider } from '../../types/database';

// Stores
import { useBookmarkStore } from '../../stores/useBookmarkStore';
import { TOUR_KEYS } from '../../utils/coachMarkTours';
import { resolveTourForUser, recordTourSeen } from '../../services/tourService';
import { logger } from '../../utils/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mixes portfolio photos with provider and service ("bookable") cards for a
// Pinterest-style feed, instead of stacking every source back-to-back or
// front-loading bookable cards near the top. Portfolio cards vastly
// outnumber bookable ones, so a random weighted draw exhausts the bookable
// pool early and leaves the rest of the scroll portfolio-only — instead,
// bookable cards are spread at even intervals across the FULL feed length
// (see interleaveDiscoverFeed), so every stretch of scrolling has some.

// The four discover sources are queried independently and share no dedupe,
// so the same photo file can legitimately arrive from more than one of them:
// a provider's cover photo (providers.background_image_url) is very often
// also one of their own portfolio_items rows, and a service_images row can
// be the same upload as a portfolio photo. The card ids differ
// (`provider-<id>` vs the portfolio row's own id), so nothing errors and
// React keys stay unique — it just reads as the same picture appearing twice
// in the feed. Dedupe on the image URL, which is the thing the user actually
// perceives as duplicated.
//
// Keeps the FIRST occurrence in the order given, so callers control which
// source wins by argument order: portfolio photos (the richest cards — real
// aspect ratio, caption, tags) are passed first and therefore beat a
// provider cover or service photo pointing at the same file.
// A card with no image file behind it has nothing to show in a masonry feed
// — it renders as an empty box. Filtered out rather than papered over with a
// placeholder, so the feed only ever contains real photographs.
function hasFeedImage(card: PortfolioItem): boolean {
  return !!(card.image as { uri?: string } | undefined)?.uri;
}

function dedupeByImageUri(cards: PortfolioItem[]): PortfolioItem[] {
  const seen = new Set<string>();
  return cards.filter(card => {
    const uri = (card.image as { uri?: string } | undefined)?.uri;
    // A card with no usable URL can't be compared — keep it rather than
    // collapsing every such card into one.
    if (!uri) return true;
    if (seen.has(uri)) return false;
    seen.add(uri);
    return true;
  });
}

function interleaveDiscoverFeed(
  portfolioCards: PortfolioItem[],
  serviceCards: PortfolioItem[],
  providerCards: PortfolioItem[]
): PortfolioItem[] {
  // Service and provider cards are both "bookable" — merged and reshuffled
  // together so neither type clusters ahead of the other within this pool.
  const bookable = shuffle([...serviceCards, ...providerCards]);
  const total = portfolioCards.length + bookable.length;
  if (total === 0) return [];

  const result: PortfolioItem[] = [];
  let pIdx = 0;
  let bIdx = 0;

  for (let i = 0; i < total; i++) {
    // A bookable card belongs here if, by this point in the feed, fewer
    // bookable cards have been placed than its fair share of the whole
    // feed's length — that's what spreads it evenly instead of letting it
    // all land near the top.
    const fairShareSoFar = ((i + 1) * bookable.length) / total;
    const wantsBookable = bIdx < fairShareSoFar;

    if (wantsBookable && bIdx < bookable.length) {
      result.push(bookable[bIdx++]!);
    } else if (pIdx < portfolioCards.length) {
      result.push(portfolioCards[pIdx++]!);
    } else if (bIdx < bookable.length) {
      result.push(bookable[bIdx++]!);
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
  // Coach-mark target for the first-visit tour's "where your saves land" step.
  favouritesRef?: React.RefObject<View | null>;
}

const SUB_TABS = [
  { key: 'discover' as const,   label: 'Discover' },
  { key: 'favourites' as const, label: 'Favourites' },
];

// Both tabs match — same heavier BakbakOne treatment, sitting side by side
// on the left. Underline-when-active, no shared SlidingTabs pill (that
// treatment is used elsewhere — Bookings, the filter chips below).
const SubTabBar = memo<SubTabProps>(({ activeTab, onTabChange, favouritesRef }) => {
  const { palette: P } = useTheme();
  return (
    <View style={[styles.subTabBar, { backgroundColor: P.bg }]}>
      {SUB_TABS.map(tab => {
        const active = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            {...(tab.key === 'favourites' && favouritesRef ? { ref: favouritesRef } : {})}
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

  // Discover's MasonryGrid is one persistent ScrollView for the whole tab,
  // not one per filter — swapping `data` when selectedFilter changes doesn't
  // reset native scroll position on its own, so without this a filter switch
  // leaves the grid wherever the previous filter happened to be scrolled to
  // instead of jumping back to the top.
  const discoverGridRef = useRef<MasonryGridHandle>(null);
  useEffect(() => {
    discoverGridRef.current?.scrollToTop();
  }, [selectedFilter]);

  // Stores
  const { loadSavedPortfolio, savedPortfolioIds } = useBookmarkStore();

  // ---------------------------------------------------------------------
  // First-visit coach-mark tour for Explore.
  //
  // Deliberately a SEPARATE flag from HomeScreen's `@client_tour_seen_*`:
  // the home tour runs the moment a new client lands in the app, and the
  // grid's own affordances (heart, price badge) only exist once this screen
  // has been opened and its feed has actually loaded. So this one is armed
  // on the first visit to Explore instead of piggy-backing on the other.
  // ---------------------------------------------------------------------
  const { user } = useAuth();
  const [showTour, setShowTour] = useState(false);
  // Explore is a tab screen — it stays mounted after you tap a card through to
  // a provider profile, and CoachMarkTour is a full-screen Modal. Without this
  // gate, an armed tour (700ms timer, or one that was mid-show) pops the
  // spotlight over whatever screen is now on top. Only present it while Explore
  // is actually the focused screen; a still-pending tour just waits for you to
  // come back.
  const isFocused = useIsFocused();
  const tourCheckedRef = useRef(false);
  const tourHeartRef = useRef<View>(null);
  const tourPriceRef = useRef<View>(null);
  const tourFavouritesRef = useRef<View>(null);
  const tourSavedRef = useRef<View>(null);

  // Favourites — anything the user hearted, resolved from useBookmarkStore's
  // saved ids (a mix of portfolio/provider/service ids from the mixed feed)
  const [favouriteItems, setFavouriteItems] = useState<PortfolioItem[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(false);

  // Portfolio items from Supabase
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioRefreshing, setPortfolioRefreshing] = useState(false);

  // The discover feed is shuffled client-side (see interleaveDiscoverFeed)
  // since every source query is deterministically ordered. Without caching
  // that shuffle per filter, switching filter chips back and forth (or any
  // re-render that re-triggers the fetch effect) would reshuffle the same
  // content every time, which reads as the grid never settling rather than
  // as intentional randomness. Keyed by filter so each category gets its
  // own remembered order for the rest of the session; a ref (not state)
  // since writing it must never itself trigger a render. Pull-to-refresh is
  // the only thing allowed to discard an entry and force a fresh shuffle.
  const discoverFeedCache = useRef<Map<string, PortfolioItem[]>>(new Map());

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
    // Cover photo ONLY — never the logo. A logo is a brand mark sized for a
    // 40px avatar; stretched into a feed tile it reads as a mistake, and it
    // also duplicates the avatar already drawn on the same card. Rows with no
    // cover are dropped from the feed by hasFeedImage below rather than
    // falling back to one.
    image: { uri: p.background_image_url ?? '' },
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
    // Same rule as claimed providers: no logo-as-feed-image. A scraped row
    // has no cover photo column at all, so these always fall out of the
    // discovery feed via hasFeedImage — the claim directory is where they're
    // meant to be browsed, not as logo tiles between real work photos.
    image: { uri: '' },
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
      // Real stored ratio where the upload measured one (see
      // service_images.aspect_ratio). Older rows predate that column and
      // come back null — those fall back to 0.8 for the first paint only,
      // then get corrected by useMeasuredAspectRatios measuring the file.
      aspectRatio: img.aspect_ratio ?? 0.8,
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

  // Builds one filter's shuffled feed and stores it in discoverFeedCache —
  // shared by the normal fetch effect below and by pull-to-refresh, which is
  // the only caller that passes forceRefresh (bypassing/overwriting whatever
  // was cached for the current filter).
  const loadDiscoverFeed = useCallback(async (filter: string): Promise<PortfolioItem[]> => {
    const category = filter !== 'All' ? filterMap[filter] : undefined;
    const [portfolioData, providerData, serviceData, unclaimedData] = await Promise.all([
      getPortfolioItems(category),
      getDiscoverProviders(category),
      getDiscoverServices(category),
      getDiscoverUnclaimedProviders(category),
    ]);

    // Every getDiscover*/getPortfolioItems query is deterministically
    // ordered (created_at, rating, scraped_at — see databaseService.ts) so
    // the DB always returns rows in the same order. Shuffling each source's
    // own rows here, before interleaveDiscoverFeed mixes the three types
    // together, is what actually randomizes the feed — without it the same
    // provider's photos (or the same top-rated providers) reliably cluster/
    // repeat in the same run every load. Shuffled at the row level (before
    // serviceData's flatMap), not after, so a single service's own carousel
    // photos stay adjacent to each other instead of scattering across the
    // feed.
    // Deduped across all four sources before interleaving — the same photo
    // file can arrive from more than one source (see dedupeByImageUri).
    // Order matters: portfolio cards are passed first so they win over a
    // provider cover or service photo pointing at the same upload.
    const portfolioCards = shuffle(portfolioData).map(mapDbPortfolioItem);
    const serviceCards = shuffle(serviceData).flatMap(mapDbServiceToCards);
    const providerCards = shuffle([
      ...providerData.map(mapDbProviderToCard),
      ...unclaimedData.map(mapDbUnclaimedProviderToCard),
    ]).filter(hasFeedImage);
    const deduped = dedupeByImageUri([
      ...portfolioCards,
      ...serviceCards,
      ...providerCards,
    ]);
    const keep = new Set(deduped.map(c => c.id));
    const feed = interleaveDiscoverFeed(
      portfolioCards.filter(c => keep.has(c.id)),
      serviceCards.filter(c => keep.has(c.id)),
      providerCards.filter(c => keep.has(c.id))
    );
    discoverFeedCache.current.set(filter, feed);
    return feed;
  }, [filterMap, mapDbPortfolioItem, mapDbProviderToCard, mapDbUnclaimedProviderToCard, mapDbServiceToCards]);

  // Fetch the mixed discovery feed whenever the category filter changes —
  // but only if this filter hasn't been shuffled yet this session. Revisiting
  // a filter you've already seen (switching chips back and forth, or leaving
  // and returning to the tab) shows the same cached order instead of
  // reshuffling; only an explicit pull-to-refresh (handleRefreshDiscover
  // below) discards a filter's cache entry. Explore's search bar isn't a
  // live filter — tapping it opens SearchScreen instead — so there's no
  // text-query branch here.
  useEffect(() => {
    const cached = discoverFeedCache.current.get(selectedFilter);
    if (cached) {
      setPortfolioItems(cached);
      return;
    }

    let cancelled = false;
    setPortfolioLoading(true);

    loadDiscoverFeed(selectedFilter)
      .then(feed => {
        if (!cancelled) setPortfolioItems(feed);
      })
      .catch(() => {
        if (!cancelled) setPortfolioItems([]);
      })
      .finally(() => {
        if (!cancelled) setPortfolioLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedFilter, loadDiscoverFeed]);

  // Other filters load on demand and remain cached for this screen session.
  // Eagerly prefetching every alternative cost 24 speculative database
  // requests and competed with images in the feed being viewed.

  // Pull-to-refresh is the only user action allowed to force a new shuffle
  // for the currently-selected filter — discards that filter's cache entry
  // and re-fetches, leaving every other filter's cached order untouched.
  const handleRefreshDiscover = useCallback(() => {
    discoverFeedCache.current.delete(selectedFilter);
    setPortfolioRefreshing(true);
    loadDiscoverFeed(selectedFilter)
      .then(feed => setPortfolioItems(feed))
      .catch(() => setPortfolioItems([]))
      .finally(() => setPortfolioRefreshing(false));
  }, [selectedFilter, loadDiscoverFeed]);

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

  // Measure the true dimensions of every photo in both feeds. Only portfolio
  // cards carry a real aspect_ratio from the DB; service/provider/unclaimed
  // cards are mapped with a hardcoded 0.8 above because nothing stores their
  // dimensions, so without this a landscape service photo would be packed
  // and rendered as a portrait card and cropped to fit.
  const measuredUris = useMemo(
    () =>
      [...portfolioItems, ...favouriteItems].map(
        i => (i.image as { uri?: string } | undefined)?.uri,
      ),
    [portfolioItems, favouriteItems],
  );
  const { resolveRatio } = useMeasuredAspectRatios(measuredUris);

  // Masonry item height calculator. Goes through getMasonryItemHeight (not a
  // plain colWidth / aspectRatio) so the reserved slot the packer computes is
  // identical to what PortfolioCard actually renders at — see that helper's
  // comment for why they must never diverge. Both sides resolve the ratio the
  // same way: measured-if-known, declared otherwise.
  const getItemHeight = useCallback(
    (item: PortfolioItem, colWidth: number) => {
      const ratio = resolveRatio(
        (item.image as { uri?: string } | undefined)?.uri,
        item.aspectRatio,
      );
      return getMasonryItemHeight(item.id, ratio, colWidth);
    },
    [resolveRatio]
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
    // Deliberately does NOT clear selectedImage. ImageDetailModal returns
    // null without an item, so nulling it here tore the <Modal> out of the
    // tree the instant close was tapped — the dismissal animation never
    // completed and its onDismiss never fired, which is what silently ate
    // the "view profile" / "book now" navigation queued behind it. Hiding it
    // via `visible` lets the dismissal finish properly; the stale item is
    // never seen, and the next open overwrites it.
    setIsDetailVisible(false);
  }, []);

  const handleViewProfile = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      prefetchProviderBySlug(providerId);
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
      prefetchProviderBySlug(providerId);
      navigation.navigate('ProviderProfile', {
        providerId,
        source: 'explore',
        // Flags the intent, not just the target: a provider who taps Book Now
        // on their own card needs the can't-book-yourself toast on arrival
        // even when there's no serviceId to auto-open (or it fails to match),
        // otherwise they land on a silent profile and the tap looks broken.
        bookIntent: true,
        ...(serviceId ? { openServiceId: serviceId } : {}),
      });
    },
    [navigation]
  );

  // The one card the tour spotlights — see pickTourCardId for the rule.
  const tourCardId = useMemo(() => pickTourCardId(portfolioItems), [portfolioItems]);

  const finishTour = useCallback(() => {
    setShowTour(false);
  }, []);

  const tourSteps = useMemo<CoachMarkStep[]>(() => [
    {
      key: 'heart',
      title: 'Save it with a tap',
      body: 'Heart any look, provider or service to keep it — no need to remember who posted it.',
      target: { ref: tourHeartRef },
      radius: 15,
      icon: 'heart',
    },
    {
      key: 'price',
      title: 'A price means you can book it',
      body: 'Cards showing a price are a real service. Tap one and you book that exact service — not just the provider.',
      target: { ref: tourPriceRef },
      radius: 10,
      icon: 'pricetag',
    },
    {
      key: 'favourites',
      title: 'Everything you saved',
      body: 'Your hearted looks, providers and services all collect under Favourites.',
      target: { ref: tourFavouritesRef },
      radius: 10,
      icon: 'sparkles',
    },
    {
      key: 'saved',
      title: 'Your providers',
      body: 'Bookmarked providers live here, ready to rebook without searching again.',
      target: { ref: tourSavedRef },
      radius: 18,
      icon: 'bookmark',
    },
  ], []);

  // Which step keys this account still has coming; null until resolved.
  const [tourStepKeys, setTourStepKeys] = useState<string[] | null>(null);

  useEffect(() => {
    // Wait for a real feed: the grid's affordances are the whole point of
    // this tour, so there's nothing to spotlight until cards exist.
    if (tourCheckedRef.current || !user?.id || portfolioLoading || !tourCardId) return;
    tourCheckedRef.current = true;
    const userId = user.id;
    void (async () => {
      const decision = await resolveTourForUser(TOUR_KEYS.CLIENT_EXPLORE, tourSteps, userId);
      if (!decision.show) return;
      setTourStepKeys(decision.steps.map(step => step.key));
      // Recorded on SHOW, not on finish — see tourService.
      void recordTourSeen(TOUR_KEYS.CLIENT_EXPLORE, userId, decision.stampVersion);
      // Let the cards finish their staggered entrance (PortfolioCard fades
      // in with an index-based delay) before measuring where they landed.
      setTimeout(() => setShowTour(true), 700);
    })();
  }, [user?.id, portfolioLoading, tourCardId, tourSteps]);

  // Only the steps this account is actually owed; filtered from tourSteps so
  // the live element refs inside each step stay the ones this render measures.
  const visibleTourSteps = useMemo(
    () => (tourStepKeys ? tourSteps.filter(step => tourStepKeys.includes(step.key)) : []),
    [tourSteps, tourStepKeys],
  );

  // imageHeight is passed in rather than recomputed inside the card: the
  // packer's reserved slot and the card's rendered box must be the exact
  // same number (see masonryHeight.ts), and only this screen holds the
  // measured-ratio cache both sides need to agree on.
  const renderPortfolioCard = useCallback(
    (item: PortfolioItem, index: number) => (
      <PortfolioCard
        item={item}
        columnWidth={columnWidth}
        imageHeight={getItemHeight(item, columnWidth)}
        onPress={handleImagePress}
        index={index}
        {...(item.id === tourCardId ? { heartRef: tourHeartRef, priceRef: tourPriceRef } : {})}
      />
    ),
    [columnWidth, handleImagePress, getItemHeight, tourCardId]
  );


  return (
    <ThemedBackground style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        {/* Sub-tab bar */}
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} favouritesRef={tourFavouritesRef} />

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
                ref={tourSavedRef}
                style={styles.savedButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  navigation.navigate('BookmarkedProviders');
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
                ref={discoverGridRef}
                data={portfolioItems}
                renderItem={renderPortfolioCard}
                getItemHeight={getItemHeight}
                keyExtractor={item => item.id}
                onScroll={exploreScrollHandler}
                onScrollEndDrag={settleExplorePillTracking}
                onMomentumScrollEnd={settleExplorePillTracking}
                refreshing={portfolioRefreshing}
                onRefresh={handleRefreshDiscover}
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

      {/* First-visit walkthrough of the grid's own affordances. Rendered
          outside SafeAreaView so its scrim covers the full window. */}
      <CoachMarkTour visible={showTour && isFocused} steps={visibleTourSteps} onFinish={finishTour} />
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
