import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BUSINESS_TYPE_OPTS } from '../../features/business-details/options';
import type { BusinessType } from '../../types/database';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';

// NAVIGATION IMPORTS - CORRECTED PATH
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/types';

// Import your icons from IconLibrary
import { BellIcon, SearchIcon } from '../../components/IconLibrary';
import { useTheme } from '../../contexts/ThemeContext';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import userLearningService from '../../services/userLearningService';
import { HairTypeSelector } from '../../components/HairTypeSelector';
import { ProviderCard } from '../../features/home/ProviderCard';
import { ServiceButton } from '../../features/home/ServiceButton';
import { SkeletonSection } from '../../features/home/SkeletonSection';
import LocationModal from '../../components/LocationModal';
import { useBookmarkStore } from '../../stores/useBookmarkStore';
import { storage, STORAGE_KEYS } from '../../utils/storage';
import { resolveClientLocation } from '../../services/clientLocationService';
import { TOUR_SEEN_PREFIXES, tourSeenKey } from '../../utils/storageKeys';
import { getProviders, getActivePromotions, getUnreadNotificationCount, getNewProviders, getTopRatedProviders, getTrendingProviders, getDiscoverServices, getProviderIdsByServiceAudience, prefetchProviderBySlug } from '../../services/databaseService';
import type { PublicProviderSummary, PublicPromotionWithProvider, DiscoverServiceWithProvider } from '../../types/database';
import { HOME_SECTIONS } from '../../config/homeSections';
import { logger } from '../../utils/logger';
import { getDistanceKm } from '../../utils/distance';
import { CoachMarkTour, CoachMarkStep } from '../../components/CoachMarkTour';
import { tabBarSpotlightRect } from '../../components/IslandPillTabBar';
import { OFFERS_ENABLED, AUDIENCE_SERVICE_PHOTOS_ENABLED } from '../../constants/featureFlags';
import { PortfolioCard } from '../../components/PortfolioCard';
import type { PortfolioItem, ServiceCategory } from '../../types/providers';

// NAVIGATION TYPES
type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

// FILTER TYPES
// serviceType values are the real business_type column values (see
// DbProvider) — this used to collapse 'salon' and 'studio' into a single
// vague "Store" option that didn't match what a provider actually picked at
// registration (InfoRegScreen's own picker: Salon / Studio / Home Studio /
// Mobile). Mirrors SearchScreen.tsx's FilterOptions.
// Filter chips for business type: 'all' plus every real business_type value,
// labelled exactly as the provider's own picker labels them.
const SERVICE_TYPE_FILTERS: { label: string; value: 'all' | BusinessType }[] = [
  { label: 'All', value: 'all' },
  ...BUSINESS_TYPE_OPTS.map(o => ({ label: o.label, value: o.value })),
];

interface FilterOptions {
  sortBy: 'recommended' | 'nearest' | 'highest-rated' | 'available-now';
  availability: 'any' | 'today' | 'tomorrow' | 'this-week';
  priceRange?: { min: number; max: number };
  rating?: number;
  distance?: number;
  serviceType?: 'all' | BusinessType;
}

// Offer type definition
interface Offer {
  id: string;
  title: string;
  description: string;
  discount: string;
  validUntil: string;
  providerName: string;
  logo: any;
  service?: string;
}

// Provider type definition
interface Provider {
  id: string;   // UUID — used for bookmark matching
  slug: string; // slug — used for navigation to ProviderProfile
  name: string;
  service: string;
  logo: any;
  rating: number;
  priceTier: 'budget' | 'mid' | 'premium' | 'luxury' | null;
  businessType: BusinessType | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number; // populated by nearbyProviders when the user's location is known
}

const ProviderRail = React.memo(function ProviderRail({
  providers,
  keyPrefix,
  onProviderPress,
  cardStyle,
  blurStyle,
}: {
  providers: Provider[];
  keyPrefix: string;
  onProviderPress: (provider: Provider) => void;
  cardStyle: any;
  blurStyle: any;
}) {
  return (
    <FlatList
      horizontal
      data={providers}
      keyExtractor={provider => `${keyPrefix}-${provider.id}`}
      renderItem={({ item }) => (
        <ProviderCard
          provider={item}
          onPress={() => onProviderPress(item)}
          style={cardStyle}
          blurStyle={blurStyle}
        />
      )}
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
});

const RoundProviderRail = React.memo(function RoundProviderRail({
  providers,
  keyPrefix,
  onProviderPress,
  surface,
  border,
  text,
}: {
  providers: Provider[];
  keyPrefix: string;
  onProviderPress: (provider: Provider) => void;
  surface: string;
  border: string;
  text: string;
}) {
  return (
    <FlatList
      horizontal
      data={providers}
      keyExtractor={provider => `${keyPrefix}-${provider.id}`}
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={5}
      removeClippedSubviews={Platform.OS === 'android'}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.roundCard} onPress={() => onProviderPress(item)} activeOpacity={0.7}>
          <View style={[styles.roundCardBlur, { backgroundColor: surface, borderColor: border, borderWidth: StyleSheet.hairlineWidth }]}>
            {item.logo ? <Image source={item.logo} style={styles.roundCardImage} contentFit="cover" transition={0} /> : null}
          </View>
          <Text style={[styles.roundCardName, { color: text }]} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  );
});

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { palette: P } = useTheme();
  // Measured per render, not read once inside the memo: the coach-mark tour
  // spotlights the floating tab bar by absolute coordinates, so a stale screen
  // size puts the highlight in the wrong place.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { bookings } = useBooking();
  const { user } = useAuth();
  const { bookmarkedIds, loadBookmarks } = useBookmarkStore();
  const insets = useSafeAreaInsets();

  // Ref for main ScrollView to control scrolling
  const scrollViewRef = useRef<ScrollView>(null);

  // First-run coach-mark tour for brand-new clients.
  const [showTour, setShowTour] = useState(false);
  // Home stays mounted as a tab; CoachMarkTour is a full-screen Modal. Gate it
  // on focus so an armed tour never spotlights over a screen pushed on top
  // while its start timer was pending — it just waits for the return to Home.
  const isFocused = useIsFocused();
  const tourCheckedRef = useRef(false);
  const searchIconRef = useRef<View>(null);
  const bellIconRef = useRef<View>(null);
  const bookingsChipRef = useRef<View>(null);

  useEffect(() => {
    if (tourCheckedRef.current || !user?.id) return;
    tourCheckedRef.current = true;
    const seenKey = tourSeenKey(TOUR_SEEN_PREFIXES.CLIENT_HOME, user.id);
    storage.getItem<boolean>(seenKey).then(seen => {
      if (seen) return;
      // Give the header/category section time to finish their entrance
      // layout before the tour measures where they actually landed.
      setTimeout(() => setShowTour(true), 500);
    }).catch(() => {});
  }, [user?.id]);

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (user?.id) storage.setItem(tourSeenKey(TOUR_SEEN_PREFIXES.CLIENT_HOME, user.id), true).catch(() => {});
  }, [user?.id]);

  const tourSteps = useMemo<CoachMarkStep[]>(() => {
    // Asked of the tab bar itself rather than re-declared here — the bar lives
    // outside this screen's tree so there's no ref to measure, and its shape
    // differs by platform.
    const tabRect = tabBarSpotlightRect(screenW, screenH, insets.bottom);

    return [
      {
        key: 'tabs',
        title: 'Your home base',
        body: 'Swipe or tap to move between Becca, Explore, Home, Cart, and Profile.',
        target: { rect: tabRect },
        radius: Platform.OS === 'android' ? 0 : tabRect.height / 2,
        icon: 'apps',
      },
      {
        key: 'search',
        title: 'Find a provider',
        body: 'Search by name, treatment, or category to find who you want to book.',
        target: { ref: searchIconRef },
        radius: 18,
        icon: 'search',
      },
      {
        key: 'bell',
        title: "You'll be notified here",
        body: 'Booking confirmations, reminders, and messages show up in your notifications.',
        target: { ref: bellIconRef },
        radius: 18,
        icon: 'notifications',
      },
      {
        key: 'bookings',
        title: 'Your bookings',
        body: 'Everything you\'ve booked — upcoming and past — lives here.',
        target: { ref: bookingsChipRef },
        radius: 18,
        icon: 'calendar',
      },
    ];
  }, [screenW, screenH, insets.bottom]);


  // Live providers from Supabase; starts empty until data loads
  const [liveProviders, setLiveProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  // Device location, for the "Near You" section — null until permission is
  // granted and a fix is obtained, OR until the user manually picks a city
  // (see manualLocationLabel below). If GPS is denied, the fallback is a
  // region the user actually chose (e.g. "Manchester, UK"), never the
  // unsorted full provider list — that city gets geocoded once via the same
  // Location.geocodeAsync used for provider registration, and the result is
  // set here just as if it were a real GPS fix, so every downstream
  // distance/sort/elastic-radius calculation stays exactly the same either way.
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Set once the user has manually chosen a city (as opposed to GPS) — drives
  // the "· LONDON" label suffix and lets LocationModal show the current pick.
  const [manualLocationLabel, setManualLocationLabel] = useState<string | null>(null);
  // The device gave a position, but too vague a one to call it "where you are"
  // — on iOS this is Precise Location switched off, which still reports as
  // granted. Labelled rather than hidden: the distances are still the best
  // available, they just shouldn't be presented as exact.
  const [locationIsCoarse, setLocationIsCoarse] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationRadius, setLocationRadius] = useState(10);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedHairType, setSelectedHairType] = useState<any>(null);
  const [viewAllRecommended, setViewAllRecommended] = useState(false);
  const [viewAllProviders, setViewAllProviders] = useState(false);
  const [viewAllServices, setViewAllServices] = useState(false);
  const [viewAllMaleServices, setViewAllMaleServices] = useState(false);
  const [viewAllKidsServices, setViewAllKidsServices] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    sortBy: 'recommended',
    availability: 'any',
    serviceType: 'all',
  });

  // Offers from Supabase — live promotions data
  const [rawPromotions, setRawPromotions] = useState<PublicPromotionWithProvider[]>([]);

  const allOffers: Offer[] = useMemo(() =>
    rawPromotions.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description ?? '',
      discount: p.discount_text ?? (p.discount_percent ? `${p.discount_percent}% OFF` : p.discount_amount ? `£${p.discount_amount} OFF` : 'OFFER'),
      validUntil: p.valid_until,
      providerName: p.providers?.display_name ?? 'Provider',
      logo: p.providers?.logo_url ? { uri: p.providers.logo_url } : null,
      ...(p.service_category ? { service: p.service_category.toUpperCase() } : {}),
    })),
  [rawPromotions]);

  const currentOffers = useMemo(() => allOffers.slice(0, 15), [allOffers]);

  // Get previously booked providers from bookings
  const previouslyBookedProviders = useMemo(() => {
    const uniqueProviders = new Map<string, Provider>();

    bookings.forEach(booking => {
      const provider = liveProviders.find(p => p.id === (booking as any).providerId);
      if (provider && !uniqueProviders.has(provider.id)) {
        uniqueProviders.set(provider.id, provider);
      }
    });

    return Array.from(uniqueProviders.values());
  }, [bookings, liveProviders]);

  // Load unread notification count — reads the same Supabase notifications
  // table NotificationsScreen shows, so the bell badge always matches what's
  // actually in the list it opens (previously read from a local-only
  // AsyncStorage store that screen never wrote to or read from).
  const loadUnreadCount = useCallback(async () => {
    try {
      const unread = await getUnreadNotificationCount('client');
      setUnreadCount(unread);
    } catch (error) {
      logger.error('Failed to load unread count:', error);
    }
  }, []);

  // Refresh count when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadUnreadCount();
    }, [loadUnreadCount])
  );

  const [services, setServices] = useState(['HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS']);

  // Personalized providers data using user learning - each section gets different providers
  const [providersData, setProvidersData] = useState({
    yourProviders: [] as Provider[],
    recommended: [] as Provider[],
    hairProviders: [] as Provider[],
    nailProviders: [] as Provider[],
    lashProviders: [] as Provider[],
    muaProviders: [] as Provider[],
    browProviders: [] as Provider[],
    aestheticsProviders: [] as Provider[],
    maleProviders: [] as Provider[],
    kidsProviders: [] as Provider[],
  });

  // Phase 5.4 — new home sections
  const [newProviders,    setNewProviders]    = useState<Provider[]>([]);
  const [topRated,        setTopRated]        = useState<Provider[]>([]);
  const [recentlyViewed,  setRecentlyViewed]  = useState<Provider[]>([]);
  const [trending,        setTrending]        = useState<Provider[]>([]);

  // Per-service audience refinement (services.audience) for the Male/Kids
  // sections — a provider whose whole business isn't registered as MALE/KIDS
  // can still have one service tagged for that audience (e.g. a hair salon
  // with a "Men's Cut"). providerIds widens which providers qualify for the
  // section below; the card list shows the actual matching service photos,
  // not just the provider tile. Empty until a provider tags a service this
  // way — see MEMORY service-audience-field.md.
  const [maleServiceProviderIds, setMaleServiceProviderIds] = useState<Set<string>>(new Set());
  const [kidsServiceProviderIds, setKidsServiceProviderIds] = useState<Set<string>>(new Set());
  const [maleServiceCards, setMaleServiceCards] = useState<PortfolioItem[]>([]);
  const [kidsServiceCards, setKidsServiceCards] = useState<PortfolioItem[]>([]);

  // Load bookmarks from storage on mount only; also try to fetch live providers from Supabase
  useEffect(() => {
    loadBookmarks();

    // Inject beauty profile so provider scoring uses static preferences from day one
    if (user) {
      const u = user as any;
      userLearningService.setUserProfile({
        serviceInterests:    u.serviceInterests    || [],
        hairType:            u.hairType            || '',
        styleVibe:           u.styleVibe           || '',
        treatmentHistory:    u.treatmentHistory    || [],
        maintenanceFrequency: u.maintenanceFrequency || '',
      });
    }

    userLearningService.initialize()
      .then(() =>
        userLearningService.getOrderedServiceCategories(
          ['HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS']
        )
      )
      .then(ordered => setServices(ordered))
      .catch(() => {
        // Silent failure — keeps default service order
      });

    const mapDbProvider = (p: PublicProviderSummary): Provider => ({
      id: p.id,
      slug: p.slug,
      name: p.display_name,
      service: p.service_category,
      logo: p.logo_url ? { uri: p.logo_url } : null,
      rating: (p as any).rating ?? 0,
      priceTier: (p as any).price_tier ?? null,
      businessType: (p as any).business_type ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
    });

    // One card per service (cover photo only, not one per carousel photo —
    // unlike Explore's mapDbServiceToCards, this is a compact rail, not a
    // save-everything grid). Null when a matching service somehow has no
    // photo (shouldn't happen — getDiscoverServices !inner-joins service_images).
    const mapAudienceServiceToCard = (s: DiscoverServiceWithProvider): PortfolioItem | null => {
      const cover = [...s.service_images].sort((a, b) => a.sort_order - b.sort_order)[0];
      if (!cover) return null;
      const p = s.provider;
      return {
        id: `service-${s.id}`,
        image: { uri: cover.url },
        caption: s.description ?? '',
        serviceName: s.name,
        category: p.service_category as unknown as ServiceCategory,
        aspectRatio: cover.aspect_ratio ?? 0.8,
        providerId: p.slug,
        price: `£${s.price}`,
        providerName: p.display_name,
        providerSlug: p.slug,
        providerRating: p.rating,
        providerReviewCount: p.review_count,
        kind: 'service' as const,
        serviceId: s.id,
        ...(p.logo_url ? { providerLogoUri: p.logo_url } : {}),
      };
    };

    // Fetch live providers — shows empty state if DB has no data
    getProviders().then(data => {
      setLiveProviders(data.map(mapDbProvider));
      setProvidersLoading(false);
    }).catch(() => {
      setProvidersLoading(false);
    });

    // Ask for location once on mount — same permission string already
    // declared in app.json ("...show nearby beauty service providers").
    // If GPS is denied/unavailable, fall back to a previously-picked city
    // (never to the unsorted full provider list) — and if the user has never
    // picked one either, Near You prompts them to instead of guessing.
    // Guarded because this effect can run more than once: `user` is an object,
    // and any of AuthContext's setUser calls hands back a fresh identity even
    // when nothing about the person changed. Two overlapping runs each resolve
    // location independently, and whichever finishes LAST wins — so a slow GPS
    // fix from run one could land after run two's saved-city fallback and
    // replace a precise position with a city centroid, or the reverse. Either
    // way Near You visibly re-sorts under the client for no reason they can
    // see. Same sequence-guard shape as the calendar's week paging.
    let locationRunCancelled = false;
    (async () => {
      const location = await resolveClientLocation();
      if (locationRunCancelled || !location.coords) return;
      setUserCoords(location.coords);
      // Only a city centroid gets labelled — that label is the whole reason
      // the client can tell "distances from the middle of Manchester" from
      // "distances from where you are".
      setManualLocationLabel(location.source === 'saved-city' ? location.cityLabel : null);
      setLocationIsCoarse(location.isCoarse);
    })();

    // Fetch active promotions (skipped while OFFERS_ENABLED is off, see FUTURE_LOGIC.md)
    if (OFFERS_ENABLED) {
      getActivePromotions().then(data => {
        setRawPromotions(data);
      }).catch(() => {
        // Silent failure — keeps empty offers list
      });
    }

    // These provider rails are independent of each other and of the
    // location/promotions fetches above — batched into one Promise.allSettled
    // so their fire-and-forget requests are issued and (silently) degrade
    // together, instead of six separate top-level promises each carrying its
    // own individual .catch(() => {}). Behaviour is unchanged: they already
    // ran concurrently before this, this just coordinates them.
    void Promise.allSettled([
      getNewProviders(15).then(data => setNewProviders(data.map(mapDbProvider))),
      getTopRatedProviders(15).then(data => setTopRated(data.map(mapDbProvider))),
      getTrendingProviders(15).then(data => setTrending(data.map(mapDbProvider))),
      // Per-service audience refinement for the Male/Kids sections — see the
      // state declarations above. Widens qualification beyond providers whose
      // whole business is registered as service_category MALE/KIDS.
      //
      // Two separate fetches on purpose: getProviderIdsByServiceAudience
      // doesn't require a photo, so a provider whose new "Men's Cut" has no
      // photo YET still makes their provider tile qualify. getDiscoverServices
      // does require one (it's the same photo feed Explore uses) — that one
      // only decides whether an actual service CARD can render, which
      // legitimately needs a photo to show.
      getProviderIdsByServiceAudience('men').then(ids => setMaleServiceProviderIds(new Set(ids))),
      getProviderIdsByServiceAudience('kids').then(ids => setKidsServiceProviderIds(new Set(ids))),
      // Photo rail fetch skipped while AUDIENCE_SERVICE_PHOTOS_ENABLED is off,
      // see FUTURE_LOGIC.md — the provider-tile widening above is unaffected.
      ...(AUDIENCE_SERVICE_PHOTOS_ENABLED ? [
        getDiscoverServices(undefined, 15, 'men').then(data =>
          setMaleServiceCards(data.map(mapAudienceServiceToCard).filter((c): c is PortfolioItem => c !== null))
        ),
        getDiscoverServices(undefined, 15, 'kids').then(data =>
          setKidsServiceCards(data.map(mapAudienceServiceToCard).filter((c): c is PortfolioItem => c !== null))
        ),
      ] : []),
    ]);
    return () => { locationRunCancelled = true; };
    // Keyed on the id, not the object — the rest of this screen's effects
    // already do (see the `user?.id` deps above). Depending on `user` itself
    // re-ran this whole block, GPS prompt and every provider list included,
    // every time anything handed back a new user object.
  }, [loadBookmarks, user?.id]);

  // Update provider data whenever bookmarkedIds or liveProviders changes
  useEffect(() => {
    const updateProviderData = async () => {
      try {
        // Get bookmarked providers from store — cross-reference against live providers
        const bookmarkedProviders = liveProviders.filter(p => bookmarkedIds.includes(p.id));

        // Score all live providers — no limit here, slicing happens at render time
        const personalizedRecommended = await userLearningService.getPersonalizedProviders(
          liveProviders
        );

        // Exclude bookmarked providers from recommended (they already have their own section)
        const yourProviderIds = new Set(bookmarkedProviders.map(p => p.id));
        const recommendedFiltered = personalizedRecommended.filter(p => !yourProviderIds.has(p.id));

        // Fallback: all non-bookmarked providers in original DB order
        const defaultRecommended = liveProviders.filter(p => !yourProviderIds.has(p.id));

        setProvidersData({
          yourProviders: bookmarkedProviders.length > 0 ? bookmarkedProviders : [],
          recommended: recommendedFiltered.length > 0 ? recommendedFiltered : defaultRecommended,
          hairProviders: liveProviders.filter(p => p.service === 'HAIR'),
          nailProviders: liveProviders.filter(p => p.service === 'NAILS'),
          lashProviders: liveProviders.filter(p => p.service === 'LASHES'),
          muaProviders: liveProviders.filter(p => p.service === 'MUA'),
          browProviders: liveProviders.filter(p => p.service === 'BROWS'),
          aestheticsProviders: liveProviders.filter(p => p.service === 'AESTHETICS'),
          // Male providers — whole-business MALE category, widened by any
          // provider that has at least one service tagged audience='men'
          // (see maleServiceProviderIds above).
          maleProviders: liveProviders.filter(p => p.service === 'MALE' || maleServiceProviderIds.has(p.id)),
          // Kids providers — same widening via audience='kids'.
          kidsProviders: liveProviders.filter(p => p.service === 'KIDS' || kidsServiceProviderIds.has(p.id)),
        });

        // Phase 5.4 — recently viewed from userLearningService interaction log.
        // Raw window is wider than the 15 we display, since repeat views of
        // the same provider (very common) eat into it before deduping by id.
        const recentViewInteractions = userLearningService.getRecentInteractions('view', 50);
        const recentIds = [...new Set(recentViewInteractions
          .map((i: any) => i.providerId ?? i.provider_id)
          .filter(Boolean))];
        const recentViewedProviders = recentIds
          .map((id: string) => liveProviders.find(p => p.id === id))
          .filter((p): p is Provider => Boolean(p))
          .slice(0, 15);
        setRecentlyViewed(recentViewedProviders);
      } catch (error) {
        logger.error('Failed to update provider data:', error);
        // Silent failure — providers fall back to defaults already set
      }
    };

    updateProviderData();
  }, [bookmarkedIds, liveProviders, maleServiceProviderIds, kidsServiceProviderIds]); // React to bookmark changes, live data updates, and audience-tagged services resolving

  // "Near You" — nearest-first, not "every active provider" in arbitrary DB
  // order. Elastic radius (mirrors how delivery apps like Uber Eats widen a
  // too-small radius rather than showing a near-empty list): try a tight
  // 50km cut first, but if too few providers fall inside it — a sparse
  // market, or a big chunk of the DB missing lat/lng — fall back to the
  // nearest 15 regardless of the cutoff instead of an almost-empty row.
  // With no location fix at all, falls back to the plain (unsorted) list.
  const NEARBY_RADIUS_KM = 50;
  const MIN_NEARBY_RESULTS = 5;
  const nearbyProviders = useMemo(() => {
    if (!userCoords) return liveProviders;

    const withDistance = liveProviders
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({
        ...p,
        distanceKm: getDistanceKm(userCoords.latitude, userCoords.longitude, p.latitude!, p.longitude!),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const withinRadius = withDistance.filter(p => p.distanceKm <= NEARBY_RADIUS_KM);
    return withinRadius.length >= MIN_NEARBY_RESULTS ? withinRadius : withDistance;
  }, [liveProviders, userCoords]);

  // User picked a city from LocationModal (either the first-run prompt, or
  // reopening it later to change area) — geocode it once and feed it into
  // userCoords exactly like a real GPS fix, so nearbyProviders above needs no
  // separate code path for "GPS" vs "manually chosen region."
  const handleSelectRegion = useCallback(async (city: string) => {
    try {
      const [match] = await Location.geocodeAsync(city);
      if (match) {
        setUserCoords({ latitude: match.latitude, longitude: match.longitude });
        setManualLocationLabel(city);
        // A hand-picked city supersedes whatever the device said, coarse or not.
        setLocationIsCoarse(false);
        await storage.setItem(STORAGE_KEYS.MANUAL_LOCATION, city);
      }
    } catch {
      // Silent failure — keeps whatever location state existed before
    }
  }, []);

  const allCategorizedProviders = useMemo(() => {
    if (!viewAllProviders) return {};

    return {
      HAIR: providersData.hairProviders,
      NAILS: providersData.nailProviders,
      LASHES: providersData.lashProviders,
      MUA: providersData.muaProviders,
      BROWS: providersData.browProviders,
      AESTHETICS: providersData.aestheticsProviders,
    };
  }, [viewAllProviders, providersData]);

  // Memoize recommended providers list to prevent unnecessary rerenders
  const recommendedProvidersList = useMemo(() => {
    // Bookmarked providers already have their own "Your Providers" section —
    // exclude them here too, in both collapsed and expanded views. Without this,
    // View All (which draws from the raw per-category buckets) re-included
    // bookmarked providers that the collapsed row deliberately hid, which showed
    // up as a provider "duplicated" from Your Providers, and — in the extreme
    // case where every live provider is bookmarked — left the collapsed row
    // empty while View All still had (bookmarked) providers to show.
    const bookmarkedIds = new Set(providersData.yourProviders.map(p => p.id));

    if (viewAllRecommended) {
      // When expanded, show 10 providers from all categories (deduped — recommended
      // overlaps with the category buckets it was drawn from)
      const combined = providersData.recommended
        .concat(providersData.hairProviders)
        .concat(providersData.nailProviders)
        .concat(providersData.lashProviders)
        .concat(providersData.muaProviders)
        .concat(providersData.browProviders)
        .concat(providersData.aestheticsProviders);
      const seen = new Set<string>();
      const deduped = combined.filter(p => {
        if (bookmarkedIds.has(p.id)) return false;
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      return deduped.slice(0, 15);
    } else {
      // When collapsed, show up to 15 providers (providersData.recommended
      // already excludes bookmarked providers upstream)
      return providersData.recommended.slice(0, 15);
    }
  }, [viewAllRecommended, providersData]);

  // Memoize male providers display list to prevent unnecessary rerenders —
  // every row across the home screen caps at 15, so collapsed vs "View All"
  // is purely a layout difference (horizontal row vs grid) now, not a count one.
  const maleProvidersDisplay = useMemo(() => {
    return providersData.maleProviders.slice(0, 15);
  }, [providersData.maleProviders]);

  // Memoize kids providers display list to prevent unnecessary rerenders
  const kidsProvidersDisplay = useMemo(() => {
    return providersData.kidsProviders.slice(0, 15);
  }, [providersData.kidsProviders]);

  // Phase 5.2 — profile-aware POSITIONING for MALE and KIDS sections (not
  // visibility — a service tagged for an audience should stay discoverable
  // by everyone, just deprioritized for viewers it isn't aimed at). See the
  // updated comment on homeSections.ts's showWhen for the full rationale.
  const hasMaleSectionData = providersData.maleProviders.length > 0;
  // § config-driven — see src/config/homeSections.ts (id: 'male-services')
  const maleSectionRelevant = useMemo(() => {
    const config = HOME_SECTIONS.find(s => s.id === 'male-services');
    return config?.showWhen?.(user, providersData) ?? true;
  }, [user, providersData]);

  const hasKidsSectionData = providersData.kidsProviders.length > 0;
  // § config-driven — see src/config/homeSections.ts (id: 'kids-services')
  const kidsSectionRelevant = useMemo(() => {
    const config = HOME_SECTIONS.find(s => s.id === 'kids-services');
    return config?.showWhen?.(user, providersData) ?? true;
  }, [user, providersData]);

  const serviceProviders = useMemo(() => {
    if (!selectedService) return { left: [], right: [] };

    let providers: Provider[] = [];
    switch (selectedService) {
      case 'HAIR':
        providers = providersData.hairProviders;
        break;
      case 'NAILS':
        providers = providersData.nailProviders;
        break;
      case 'LASHES':
        providers = providersData.lashProviders;
        break;
      case 'MUA':
        providers = providersData.muaProviders;
        break;
      case 'BROWS':
        providers = providersData.browProviders;
        break;
      case 'AESTHETICS':
        providers = providersData.aestheticsProviders;
        break;
      case 'MALE':
        providers = providersData.maleProviders;
        break;
      case 'KIDS':
        providers = providersData.kidsProviders;
        break;
      default:
        providers = liveProviders;
    }

    // Apply active filters
    const sortBy = activeFilters.sortBy;
    if (sortBy === 'highest-rated') {
      providers = [...providers].sort((a, b) => b.rating - a.rating);
    }
    if (activeFilters.rating && activeFilters.rating > 0) {
      providers = providers.filter(p => p.rating >= activeFilters.rating!);
    }
    if (activeFilters.priceRange) {
      const { min, max } = activeFilters.priceRange;
      const tierMap: Record<string, number> = { budget: 15, mid: 45, premium: 80, luxury: 150 };
      providers = providers.filter(p => {
        if (!p.priceTier) return true;
        const approx = tierMap[p.priceTier] ?? 0;
        return approx >= min && approx <= max;
      });
    }
    // serviceType values are business_type's own values now — direct
    // comparison, no collapsing map needed (see FilterOptions' comment).
    if (activeFilters.serviceType && activeFilters.serviceType !== 'all') {
      providers = providers.filter(p => p.businessType === activeFilters.serviceType);
    }

    return {
      left: providers.slice(0, 8),
      right: providers.slice(8, 15),
    };
  }, [selectedService, providersData, activeFilters, liveProviders]);

  const handleServicePress = useCallback(async (service: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Track service selection
    await userLearningService.trackInteraction({
      type: 'search',
      serviceCategory: service,
      timestamp: new Date().toISOString(),
    });

    // Deliberately does NOT call setSelectedService here — this now navigates
    // straight to Search instead of switching Home into its in-place
    // filtered view. Setting it first used to flash that filtered view (with
    // its FILTERS row) for a frame before the nav transition took over, and —
    // since selectedService then stayed set — coming back from Search landed
    // on that filtered view too, instead of the normal Home screen.
    navigation.navigate('Search', { category: service });
  }, [navigation]);

  const handleBackPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(null);
    setSelectedHairType(null);
  }, []);

  const navigateToProvider = useCallback(
    (provider: Provider) => {
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // The 'view' interaction is tracked once, by ProviderProfileScreen itself
      // on load — tracking it again here double-counted every visit.
      prefetchProviderBySlug(provider.slug);
      navigation.navigate('ProviderProfile', {
        providerId: provider.slug,
        source: 'home',
      });
    },
    [navigation]
  );

  // Tapping an audience-tagged service card (Male/Kids sections) — jumps
  // straight to that exact service's booking modal via openServiceId, same
  // as Explore's "Book Now" on a service card, rather than a bare profile
  // visit that leaves the client to find the service themselves.
  const navigateToAudienceService = useCallback(
    (item: PortfolioItem) => {
      if (!item.providerSlug) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      prefetchProviderBySlug(item.providerSlug);
      navigation.navigate('ProviderProfile', {
        providerId: item.providerSlug,
        source: 'home',
        bookIntent: true,
        ...(item.serviceId ? { openServiceId: item.serviceId } : {}),
      });
    },
    [navigation]
  );

  const navigateToSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Instant transition comes from HomeNavigator's Search screen having
    // `animation: 'none'` set statically, not from a per-navigate override.
    navigation.navigate('Search', {});
  }, [navigation]);

  const navigateToNotifications = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Notifications');
  }, [navigation]);

  const navigateToBookings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Bookings');
  }, [navigation]);

  // In HomeScreen.tsx
  const navigateToBookmarks = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('BookmarkedProviders'); // This will work now
  }, [navigation]);

  const toggleViewAllRecommended = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewAllRecommended(prev => !prev);
  }, []);

  const toggleViewAllProviders = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewAllProviders(prev => !prev);
  }, []);

  const toggleViewAllServices = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewAllServices(prev => !prev);
  }, []);

  const toggleViewAllMaleServices = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewAllMaleServices(prev => !prev);
  }, []);

  const toggleViewAllKidsServices = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewAllKidsServices(prev => !prev);
  }, []);

  const handleViewAllOffers = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Offers');
  }, [navigation]);

  const toggleFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersExpanded(prev => !prev);
  }, []);

  const updateFilter = useCallback((key: keyof FilterOptions, value: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFilters({
      sortBy: 'recommended',
      availability: 'any',
    });
  }, []);

  // Rendered at one of two JSX positions depending on maleSectionRelevant /
  // kidsSectionRelevant (see above) — the normal early slot, or pushed down
  // to just above Book Again. Plain closures (not components) so calling
  // one twice in the same render never double-mounts it — only one of the
  // two call sites is ever reached, since the surrounding && conditions are
  // mutually exclusive.
  const renderMaleSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>MALE SERVICES</Text>
        <TouchableOpacity
          onPress={toggleViewAllMaleServices}
          style={styles.viewAllButton}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAll, { color: P.sub }]}>
            {viewAllMaleServices ? 'VIEW LESS <' : 'VIEW ALL >'}
          </Text>
        </TouchableOpacity>
      </View>

      {viewAllMaleServices ? (
        <View style={styles.expandedGrid}>
          {maleProvidersDisplay.map((provider) => (
            <View key={`male-expanded-${provider.id}`} style={styles.gridItem}>
              <ProviderCard
                provider={provider}
                onPress={() => navigateToProvider(provider)}
                style={styles.gridCard}
                blurStyle={styles.gridCardBlur}
              />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          nestedScrollEnabled={true}
        >
          {maleProvidersDisplay.map(provider => (
            <ProviderCard
              key={`male-${provider.id}`}
              provider={provider}
              onPress={() => navigateToProvider(provider)}
              style={styles.brandCard}
              blurStyle={styles.brandCardBlur}
            />
          ))}
        </ScrollView>
      )}

      {/* Actual matching service listings (services.audience =
          'men'), not just provider tiles — a HAIR provider with one
          "Men's Cut" service shows that specific service here even
          though their whole business isn't registered as MALE. Pulled
          while AUDIENCE_SERVICE_PHOTOS_ENABLED is off, see FUTURE_LOGIC.md. */}
      {AUDIENCE_SERVICE_PHOTOS_ENABLED && maleServiceCards.length > 0 && (
        <>
          <Text style={[styles.viewAll, { color: P.sub, marginTop: 12, marginBottom: 8 }]}>
            POPULAR MEN'S SERVICES
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            nestedScrollEnabled={true}
          >
            {maleServiceCards.map((item, index) => (
              <View key={item.id} style={{ width: 130, marginRight: 12 }}>
                <PortfolioCard
                  item={item}
                  columnWidth={130}
                  imageHeight={170}
                  onPress={navigateToAudienceService}
                  index={index}
                />
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );

  const renderKidsSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>KIDS SERVICES</Text>
        <TouchableOpacity
          onPress={toggleViewAllKidsServices}
          style={styles.viewAllButton}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAll, { color: P.sub }]}>
            {viewAllKidsServices ? 'VIEW LESS <' : 'VIEW ALL >'}
          </Text>
        </TouchableOpacity>
      </View>

      {viewAllKidsServices ? (
        <View style={styles.expandedGrid}>
          {kidsProvidersDisplay.map((provider) => (
            <View key={`kids-expanded-${provider.id}`} style={styles.gridItem}>
              <ProviderCard
                provider={provider}
                onPress={() => navigateToProvider(provider)}
                style={styles.gridCard}
                blurStyle={styles.gridCardBlur}
              />
            </View>
          ))}
        </View>
      ) : (
        <ProviderRail providers={kidsProvidersDisplay} keyPrefix="kids" onProviderPress={navigateToProvider} cardStyle={styles.brandCard} blurStyle={styles.brandCardBlur} />
      )}

      {/* Actual matching service listings (services.audience =
          'kids'), same reasoning as the Male section above. Pulled while
          AUDIENCE_SERVICE_PHOTOS_ENABLED is off, see FUTURE_LOGIC.md. */}
      {AUDIENCE_SERVICE_PHOTOS_ENABLED && kidsServiceCards.length > 0 && (
        <>
          <Text style={[styles.viewAll, { color: P.sub, marginTop: 12, marginBottom: 8 }]}>
            POPULAR KIDS' SERVICES
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            nestedScrollEnabled={true}
          >
            {kidsServiceCards.map((item, index) => (
              <View key={item.id} style={{ width: 130, marginRight: 12 }}>
                <PortfolioCard
                  item={item}
                  columnWidth={130}
                  imageHeight={170}
                  onPress={navigateToAudienceService}
                  index={index}
                />
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.background, { backgroundColor: P.bg }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        contentContainerStyle={[
          styles.scrollContent,
          selectedService && styles.scrollContentExpanded,
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: P.border, paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandText, { color: P.text }]}>CERVICED</Text>
            <Text style={[styles.welcomeText, { color: P.sub }]}>Find your next appointment</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              ref={searchIconRef}
              style={[styles.iconBtn, { backgroundColor: P.iconBg }]}
              onPress={navigateToSearch}
              activeOpacity={0.7}
              accessibilityLabel="Search providers"
              accessibilityRole="button"
            >
              <SearchIcon size={18} color={P.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={bellIconRef}
              style={[styles.iconBtn, { backgroundColor: P.iconBg }]}
              onPress={navigateToNotifications}
              activeOpacity={0.7}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <BellIcon size={18} color={P.sub} />
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              ref={bookingsChipRef}
              style={[styles.bookingsChip, { backgroundColor: P.accent }]}
              onPress={navigateToBookings}
              activeOpacity={0.7}
            >
              <Text style={[styles.bookingsChipText, { color: P.onAccent }]}>Bookings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* § config-driven — see src/config/homeSections.ts (id: 'your-providers') */}
        {/* Your Providers Section - Only show if there are bookmarked providers */}
        {!selectedService && providersData.yourProviders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: P.text }]}>YOUR PROVIDERS</Text>
              <TouchableOpacity onPress={navigateToBookmarks}>
                <Text style={[styles.viewAll, { color: P.sub }]}>VIEW ALL {'>'}</Text>
              </TouchableOpacity>
            </View>

            <ProviderRail providers={providersData.yourProviders.slice(0, 15)} keyPrefix="your" onProviderPress={navigateToProvider} cardStyle={styles.brandCard} blurStyle={styles.brandCardBlur} />
          </View>
        )}

        {/* Choose Service Section */}
        <View style={[styles.section, { marginBottom: 8, paddingBottom: 8 }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              {selectedService ? (
                <TouchableOpacity
                  style={styles.backButtonSmall}
                  onPress={handleBackPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.backButtonSmallBlur, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.backButtonSmallText, { color: P.text }]}>←</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <Text style={[styles.sectionTitle, { color: P.text }]}>
                CHOOSE YOUR SERVICE
              </Text>
            </View>
            {!selectedService && (
              <TouchableOpacity onPress={toggleViewAllServices}>
                <Text style={[styles.viewAll, { color: P.sub }]}>
                  {viewAllServices ? 'VIEW LESS <' : 'VIEW ALL >'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.serviceContainer}>
            {selectedService ? (
              <>
                <View style={styles.selectedServiceRow}>
                  <ServiceButton
                    service={selectedService}
                    isSelected={true}
                    onPress={() => {
                      setSelectedService(null);
                      setSelectedHairType(null);
                    }}
                  />
                  {selectedHairType && (
                    <View style={[styles.hairTypeBadge, { backgroundColor: P.iconBg }]}>
                      <Text style={[styles.hairTypeBadgeText, { color: P.text }]}>
                        {selectedHairType.name}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.filterButtonActive}
                    onPress={toggleFilters}
                    activeOpacity={0.7}
                    accessibilityLabel="Filters"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: filtersExpanded }}
                  >
                    <View style={styles.filterButtonBlur}>
                      <Text style={[styles.filterButtonText, { color: P.sub }]}>
                        FILTERS {filtersExpanded ? '▲' : '▼'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Collapsible Filter Section */}
                {filtersExpanded && (
                  <View style={styles.filterDropdown}>
                    <View style={[styles.filterDropdownBlur, { backgroundColor: P.card, borderColor: P.border }]}>
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {/* Header with Reset */}
                        <View style={styles.filterDropdownHeader}>
                          <Text style={[styles.filterDropdownTitle, { color: P.text }]}>FILTER OPTIONS</Text>
                          <TouchableOpacity onPress={resetFilters}>
                            <Text style={[styles.resetText, { color: P.accentText }]}>RESET</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Hair Type Selector for HAIR service */}
                        {selectedService === 'HAIR' && (
                          <View style={styles.filterSection}>
                            <Text style={[styles.filterSectionTitle, { color: P.text }]}>HAIR TYPE</Text>
                            <HairTypeSelector
                              onSelect={(hairType) => {
                                setSelectedHairType(hairType);
                              }}
                              onBack={() => {
                                setSelectedService(null);
                              }}
                            />
                          </View>
                        )}

                        {/* Sort By */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>SORT BY</Text>
                          <View style={styles.filterChipsRow}>
                            {['recommended', 'rating', 'price-low', 'price-high', 'distance'].map((sort) => {
                              const labels = {
                                recommended: 'Recommended',
                                rating: 'Top Rated',
                                'price-low': 'Price ↑',
                                'price-high': 'Price ↓',
                                distance: 'Nearest',
                              };
                              const isActive = activeFilters.sortBy === sort;
                              return (
                                <TouchableOpacity
                                  key={sort}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('sortBy', sort)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {labels[sort as keyof typeof labels]}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Price Range */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>PRICE RANGE</Text>
                          <View style={styles.filterChipsRow}>
                            {[
                              { label: '<£30', value: { min: 0, max: 30 } },
                              { label: '£30-60', value: { min: 30, max: 60 } },
                              { label: '£60-100', value: { min: 60, max: 100 } },
                              { label: '£100+', value: { min: 100, max: 9999 } },
                            ].map((range) => {
                              const isActive =
                                activeFilters.priceRange?.min === range.value.min &&
                                activeFilters.priceRange?.max === range.value.max;
                              return (
                                <TouchableOpacity
                                  key={range.label}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('priceRange', range.value)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {range.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Rating */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>MINIMUM RATING</Text>
                          <View style={styles.filterChipsRow}>
                            {[
                              { label: '4.5+★', value: 4.5 },
                              { label: '4.0+★', value: 4.0 },
                              { label: '3.5+★', value: 3.5 },
                              { label: 'Any', value: 0 },
                            ].map((rating) => {
                              const isActive = activeFilters.rating === rating.value;
                              return (
                                <TouchableOpacity
                                  key={rating.label}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('rating', rating.value)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {rating.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Distance */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>DISTANCE</Text>
                          <View style={styles.filterChipsRow}>
                            {[
                              { label: '<1mi', value: 1 },
                              { label: '<3mi', value: 3 },
                              { label: '<5mi', value: 5 },
                              { label: 'Any', value: 999 },
                            ].map((distance) => {
                              const isActive = activeFilters.distance === distance.value;
                              return (
                                <TouchableOpacity
                                  key={distance.label}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('distance', distance.value)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {distance.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Availability */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>AVAILABILITY</Text>
                          <View style={styles.filterChipsRow}>
                            {[
                              { label: 'Today', value: 'today' as const },
                              { label: 'This Week', value: 'this-week' as const },
                              { label: 'Any Time', value: 'any' as const },
                            ].map((avail) => {
                              const isActive = activeFilters.availability === avail.value;
                              return (
                                <TouchableOpacity
                                  key={avail.value}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('availability', avail.value)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {avail.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Service Type */}
                        <View style={styles.filterSection}>
                          <Text style={[styles.filterSectionTitle, { color: P.text }]}>SERVICE TYPE</Text>
                          <View style={styles.filterChipsRow}>
                            {/* Built from BUSINESS_TYPE_OPTS, not a hand-written
                                copy of it — the filter chips a client picks
                                from must be exactly the types a provider can
                                register as. */}
                            {SERVICE_TYPE_FILTERS.map((type) => {
                              const isActive = activeFilters.serviceType === type.value;
                              return (
                                <TouchableOpacity
                                  key={type.value}
                                  style={[
                                    styles.filterChip,
                                    {
                                      backgroundColor: isActive ? P.iconBg : P.surface,
                                      borderColor: isActive ? P.accent : P.border,
                                      borderWidth: StyleSheet.hairlineWidth,
                                    }
                                  ]}
                                  onPress={() => updateFilter('serviceType', type.value)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isActive }}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? P.accentText : P.text,
                                        fontWeight: isActive ? '700' : '500'
                                      }
                                    ]}
                                  >
                                    {type.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </ScrollView>
                    </View>
                  </View>
                )}
              </>
            ) : viewAllServices ? (
              // Quadrant grid view for all services
              <View style={styles.quadrantGrid}>
                {services.map(service => (
                  <TouchableOpacity
                    key={service}
                    style={styles.quadrantCard}
                    onPress={() => handleServicePress(service)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.quadrantCardBlur, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.quadrantServiceName, { color: P.text }]}>
                        {service}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                nestedScrollEnabled={true}
              >
                {services.map(service => (
                  <ServiceButton
                    key={service}
                    service={service}
                    isSelected={selectedService === service}
                    onPress={() => handleServicePress(service)}
                    onBack={handleBackPress}
                    showBackArrow={selectedService !== null}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        {/* Service Providers Grid */}
        {selectedService ? (
          <View style={styles.filteredProvidersSection}>
            <View style={styles.twoColumnContainer}>
              <View style={styles.leftColumn}>
                {serviceProviders.left.map((provider) => (
                  <ProviderCard
                    key={`left-${provider.id}`}
                    provider={provider}
                    onPress={() => provider.logo && navigateToProvider(provider)}
                    style={styles.columnProviderCard}
                    blurStyle={styles.columnProviderBlur}
                  />
                ))}
              </View>
              <View style={styles.rightColumn}>
                {serviceProviders.right.map((provider) => (
                  <ProviderCard
                    key={`right-${provider.id}`}
                    provider={provider}
                    onPress={() => provider.logo && navigateToProvider(provider)}
                    style={styles.columnProviderCard}
                    blurStyle={styles.columnProviderBlur}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* § config-driven — see src/config/homeSections.ts (id: 'recommended') */}
            {/* Recommended Section — hidden once loaded if there's genuinely
                nothing left to recommend (e.g. every live provider is already
                bookmarked), matching the empty-state guard every sibling
                section below already has. Without this it rendered a header
                + empty scroller that looked broken. */}
            {(providersLoading || providersData.recommended.length > 0) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: P.text }]}>RECOMMENDED FOR YOU</Text>
                <TouchableOpacity
                  onPress={toggleViewAllRecommended}
                  style={styles.viewAllButton}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAll, { color: P.sub }]}>
                    {viewAllRecommended ? 'VIEW LESS <' : 'VIEW ALL >'}
                  </Text>
                </TouchableOpacity>
              </View>

              {providersLoading ? (
                <SkeletonSection cardWidth={176} cardHeight={64} borderRadius={16} />
              ) : viewAllRecommended ? (
                <View style={styles.expandedGrid}>
                  {recommendedProvidersList.map((provider) => (
                    <View key={`recommended-expanded-${provider.id}`} style={styles.gridItem}>
                      <ProviderCard
                        provider={provider}
                        onPress={() => navigateToProvider(provider)}
                        style={styles.gridCard}
                        blurStyle={styles.gridCardBlur}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <ProviderRail providers={recommendedProvidersList} keyPrefix="recommended" onProviderPress={navigateToProvider} cardStyle={styles.brandCard} blurStyle={styles.brandCardBlur} />
              )}
            </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'trending') */}
            {/* TRENDING THIS WEEK */}
            {trending.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>TRENDING THIS WEEK</Text>
                </View>
                <ProviderRail providers={trending} keyPrefix="trending" onProviderPress={navigateToProvider} cardStyle={styles.providerCard} blurStyle={styles.providerBlur} />
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'new-providers') */}
            {/* NEW ON CERVICED */}
            {newProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>NEW ON CERVICED</Text>
                </View>
                <ProviderRail providers={newProviders} keyPrefix="new" onProviderPress={navigateToProvider} cardStyle={styles.brandCard} blurStyle={styles.brandCardBlur} />
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'top-rated') */}
            {/* TOP RATED */}
            {topRated.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>TOP RATED</Text>
                </View>
                <ProviderRail providers={topRated} keyPrefix="toprated" onProviderPress={navigateToProvider} cardStyle={styles.providerCard} blurStyle={styles.providerBlur} />
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'recently-viewed') */}
            {/* RECENTLY VIEWED */}
            {recentlyViewed.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>RECENTLY VIEWED</Text>
                </View>
                <RoundProviderRail providers={recentlyViewed} keyPrefix="recent" onProviderPress={navigateToProvider} surface={P.surface} border={P.border} text={P.text} />
              </View>
            )}

            {/* BROWSE BY PROVIDER */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: P.text }]}>BROWSE BY PROVIDER</Text>
                <TouchableOpacity
                  onPress={toggleViewAllProviders}
                  style={styles.viewAllButton}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAll, { color: P.sub }]}>
                    {viewAllProviders ? 'VIEW LESS <' : 'VIEW ALL >'}
                  </Text>
                </TouchableOpacity>
              </View>

              {providersLoading ? (
                <SkeletonSection cardWidth={282} cardHeight={147} borderRadius={20} count={3} />
              ) : viewAllProviders ? (
                <View>
                  {Object.entries(allCategorizedProviders).map(([category, providers]) => {
                    if (!providers || providers.length === 0) return null;

                    return (
                      <View key={category} style={styles.categorySection}>
                        <Text style={[styles.categoryLabel, { color: P.text }]}>{category}</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.categoryScroll}
                          nestedScrollEnabled={true}
                        >
                          {providers.slice(0, 15).map((provider: Provider) => (
                            <ProviderCard
                              key={`${category}-${provider.id}`}
                              provider={provider}
                              onPress={() => navigateToProvider(provider)}
                              style={styles.providerCard}
                              blurStyle={styles.providerBlur}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View>
                  {providersData.hairProviders.length > 0 && (
                    <View>
                      <Text style={[styles.categoryLabel, { color: P.text }]}>HAIR</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.categoryScroll}
                        nestedScrollEnabled={true}
                      >
                        {providersData.hairProviders.slice(0, 15).map(provider => (
                          <ProviderCard
                            key={`hair-${provider.id}`}
                            provider={provider}
                            onPress={() => navigateToProvider(provider)}
                            style={styles.providerCard}
                            blurStyle={styles.providerBlur}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {providersData.nailProviders.length > 0 && (
                    <View>
                      <Text style={[styles.categoryLabel, { color: P.text }]}>NAILS</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.categoryScroll}
                        nestedScrollEnabled={true}
                      >
                        {providersData.nailProviders.slice(0, 15).map(provider => (
                          <ProviderCard
                            key={`nail-${provider.id}`}
                            provider={provider}
                            onPress={() => navigateToProvider(provider)}
                            style={styles.providerCard}
                            blurStyle={styles.providerBlur}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Near You Section — sorted by real distance once we have a
                location fix, from GPS or a manually-chosen city. Never
                falls back to the plain unsorted "every provider" list —
                with no location at all yet, it prompts the user to pick a
                city (LocationModal) instead. */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowLocationModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitle, { color: P.text }]}>
                  NEAR YOU{manualLocationLabel
                    ? ` · ${manualLocationLabel.split(',')[0]!.toUpperCase()}`
                    : locationIsCoarse ? ' · APPROXIMATE' : ''}
                </Text>
                <Text style={[styles.viewAll, { color: P.sub }]}>
                  {userCoords ? 'CHANGE' : 'SET AREA'}
                </Text>
              </TouchableOpacity>

              {providersLoading ? (
                <SkeletonSection cardWidth={100} cardHeight={100} borderRadius={50} count={5} />
              ) : !userCoords ? (
                <TouchableOpacity
                  style={[styles.nearYouPrompt, { backgroundColor: P.surface, borderColor: P.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowLocationModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.nearYouPromptText, { color: P.sub }]}>
                    Enable location or choose your area to see providers near you
                  </Text>
                </TouchableOpacity>
              ) : (
                <RoundProviderRail providers={nearbyProviders.slice(0, 15)} keyPrefix="near" onProviderPress={navigateToProvider} surface={P.surface} border={P.border} text={P.text} />
              )}
            </View>

            <LocationModal
              visible={showLocationModal}
              onClose={() => setShowLocationModal(false)}
              selectedLocation={manualLocationLabel ?? ''}
              selectedRadius={locationRadius}
              onLocationChange={handleSelectRegion}
              onRadiusChange={setLocationRadius}
            />

            {/* § config-driven — see src/config/homeSections.ts (id: 'male-services').
                Normal early slot only when relevant to this viewer — when
                it isn't, the same section still renders, just pushed down
                to just above Book Again (see below), never hidden outright. */}
            {hasMaleSectionData && maleSectionRelevant && renderMaleSection()}

            {/* § config-driven — see src/config/homeSections.ts (id: 'kids-services') — same rule as above. */}
            {hasKidsSectionData && kidsSectionRelevant && renderKidsSection()}

            {/* Current Offers Section — only rendered when there are live promotions.
                Temporarily pulled entirely via OFFERS_ENABLED, see FUTURE_LOGIC.md. */}
            {OFFERS_ENABLED && currentOffers.length > 0 && <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: P.text }]}>CURRENT OFFERS</Text>
                <TouchableOpacity onPress={handleViewAllOffers}>
                  <Text style={[styles.viewAll, { color: P.sub }]}>VIEW ALL {'>'}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                nestedScrollEnabled={true}
              >
                {currentOffers.map(offer => (
                  <TouchableOpacity
                    key={offer.id}
                    style={styles.offerCard}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('Offers' as any)}
                  >
                    <View style={[styles.offerCardBlur, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                      {offer.logo ? <Image source={offer.logo} style={styles.offerLogo} contentFit="cover" transition={0} /> : <View style={styles.offerLogo} />}
                      <View style={styles.offerContent}>
                        {/* In normal flow (not floating over the title) so a
                            long custom label — a provider can type anything
                            into discount_text, not just "20% OFF" — pushes
                            the title down instead of covering it. */}
                        <View style={[styles.offerDiscountBadge, { backgroundColor: P.accent, borderColor: P.accent }]}>
                          <Text style={[styles.offerDiscountText, { color: P.onAccent }]} numberOfLines={1}>{offer.discount}</Text>
                        </View>
                        <Text style={[styles.offerTitle, { color: P.text }]} numberOfLines={2}>
                          {offer.title}
                        </Text>
                        <Text style={[styles.offerDescription, { color: P.sub }]} numberOfLines={2}>
                          {offer.description}
                        </Text>
                        <Text style={[styles.offerValidText, { color: P.sub }]} numberOfLines={1}>
                          Exp {new Date(offer.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>}

            {/* Deprioritized position for Male/Kids Services — same
                sections as above, rendered here instead when they aren't
                relevant to this viewer's gender/interests. Still visible
                (so a tagged service stays discoverable to everyone), just
                pushed to the bottom of the feed rather than sitting in the
                early slot. */}
            {hasMaleSectionData && !maleSectionRelevant && renderMaleSection()}
            {hasKidsSectionData && !kidsSectionRelevant && renderKidsSection()}

            {/* Book Again Section - Only show if user has previous bookings */}
            {previouslyBookedProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>BOOK AGAIN</Text>
                </View>

                <RoundProviderRail providers={previouslyBookedProviders.slice(0, 15)} keyPrefix="booked" onProviderPress={navigateToProvider} surface={P.surface} border={P.border} text={P.text} />
              </View>
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <CoachMarkTour visible={showTour && isFocused} steps={tourSteps} onFinish={finishTour} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16, // 8px × 2
    paddingBottom: 120, // 8px × 15
  },
  scrollContentExpanded: {
    flexGrow: 1,
    paddingBottom: 152, // 8px × 19
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  welcomeText: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingsChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  bookingsChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF1744',
    borderRadius: 10.5,
    minWidth: 21,
    height: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(126,102,103,0.10)',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16, // 8px × 2
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 12,
  },
  backButtonSmallBlur: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  backButtonSmallText: {
    fontSize: 20,
    fontWeight: '600',
  },
  hairTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  hairTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
  },
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  viewAll: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  viewAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  gridItem: {
    width: '48%',
    marginBottom: 15,
  },
  gridCard: {
    width: '100%',
  },
  gridCardBlur: {
    borderRadius: 14,
    height: 120,
    overflow: 'hidden',
  },
  serviceContainer: {
    minHeight: 50,
  },
  selectedServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterButtonActive: {
    marginLeft: 10,
  },
  filterButtonBlur: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(126,102,103,0.14)',
    backgroundColor: 'rgba(126,102,103,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  filteredProvidersSection: {
    flex: 1,
    marginTop: 10,
    minHeight: 500,
  },
  brandCard: {
    marginRight: 12,
    width: 160,
  },
  brandCardBlur: {
    borderRadius: 12,
    width: 160,
    height: 70,
    overflow: 'hidden',
  },
  categoryLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    marginBottom: 10,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  categorySection: {
    marginBottom: 15,
  },
  categoryScroll: {
    marginBottom: 10,
  },
  providerCard: {
    width: 282,
    marginRight: 15,
  },
  providerBlur: {
    borderRadius: 16,
    width: 282,
    height: 147,
    overflow: 'hidden',
  },
  bottomPadding: {
    height: 50,
  },
  twoColumnContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 5,
  },
  leftColumn: {
    flex: 1,
    paddingRight: 5,
  },
  rightColumn: {
    flex: 1,
    paddingLeft: 5,
  },
  columnProviderCard: {
    marginBottom: 15,
    width: '100%',
  },
  columnProviderBlur: {
    borderRadius: 14,
    width: '100%',
    height: 147,
    overflow: 'hidden',
  },
  filterDropdown: {
    marginTop: 15,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: 400,
  },
  filterDropdownBlur: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    overflow: 'hidden',
  },
  filterDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  filterDropdownTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 100,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  filterChipActive: {},
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  viewAllButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Round card styles for "Book Again" section
  roundCard: {
    alignItems: 'center',
    marginRight: 15,
    width: 100,
  },
  roundCardBlur: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
  },
  roundCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  roundCardName: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  nearYouPrompt: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  nearYouPromptText: {
    fontSize: 13,
    textAlign: 'center',
  },
  // Offer card styles - Horizontal layout with large logo
  offerCard: {
    marginRight: 12,
    width: 280,
  },
  offerCardBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 14,
  },
  // In normal flow, above the title — not absolutely positioned over it, so
  // there's no max length past which a long custom label starts overlapping
  // text underneath it.
  offerDiscountBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 6,
  },
  offerDiscountText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  offerContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 12,
  },
  offerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 16,
  },
  offerDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '300',
    fontSize: 10,
    opacity: 0.6,
    marginBottom: 6,
    lineHeight: 13,
  },
  offerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offerLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  offerValidText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 8,
    opacity: 0.5,
    fontWeight: '300',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Quadrant grid styles - smaller pills
  quadrantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 8,
  },
  quadrantCard: {
    width: '48%',
    marginBottom: 8,
  },
  quadrantCardBlur: {
    borderRadius: 14,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  quadrantServiceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    textAlign: 'center',
  },
  // Service type filter chips
  serviceTypeContainer: {
    marginTop: 10,
    marginBottom: 15,
  },
  serviceTypeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceTypeChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderLeftColor: 'rgba(255, 255, 255, 0.3)',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  serviceTypeChipActive: {
    backgroundColor: 'rgba(218, 112, 214, 0.15)',
    borderTopColor: 'rgba(218, 112, 214, 0.7)',
    borderLeftColor: 'rgba(218, 112, 214, 0.6)',
    borderRightColor: 'rgba(218, 112, 214, 0.2)',
    borderBottomColor: 'rgba(218, 112, 214, 0.2)',
  },
  serviceTypeChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '500',
  },
  // Offer tabs styles
  offerTabsScroll: {
    marginBottom: 15,
  },
  offerTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderLeftColor: 'rgba(255, 255, 255, 0.3)',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  offerTabActive: {
    backgroundColor: 'rgba(218, 112, 214, 0.15)',
    borderTopColor: 'rgba(218, 112, 214, 0.7)',
    borderLeftColor: 'rgba(218, 112, 214, 0.6)',
    borderRightColor: 'rgba(218, 112, 214, 0.2)',
    borderBottomColor: 'rgba(218, 112, 214, 0.2)',
  },
  offerTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: '500',
  },
  // Vertical offer grid styles - matching horizontal layout
  offerVerticalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  offerVerticalCard: {
    width: '48%',
    marginBottom: 12,
  },
  offerVerticalCardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    padding: 12,
  },
  // Provider Modal Styles
  modalProvidersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  modalProviderCard: {
    width: '48%',
    marginBottom: 16,
  },
  modalProviderCardBlur: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 14,
    alignItems: 'center',
  },
  modalProviderLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  modalProviderName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalProviderService: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.7,
    textAlign: 'center',
  },
});
