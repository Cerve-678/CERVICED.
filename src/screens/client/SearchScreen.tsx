// SearchScreen.tsx
import React, { useState, useCallback, useMemo, memo, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  FlatList,
  Image,
  Modal,
  StatusBar,
  RefreshControl,
  Animated,
  ImageSourcePropType,
  ListRenderItem,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ReAnimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ExploreStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import TabIcon from '../../components/TabIcon';
import SlidingTabs from '../../components/SlidingTabs';
import * as Location from 'expo-location';
import { getProviders, searchProviders, logSearchEvent, getProvidersAvailability, getProviderPriceRanges } from '../../services/databaseService';
import type { ProviderAvailabilityStatus } from '../../services/databaseService';
import type { DbProvider } from '../../types/database';
import userLearningService from '../../services/userLearningService';
import { useAuth } from '../../contexts/AuthContext';
import { getDistanceKm } from '../../utils/distance';
import { UK_CITIES } from '../../constants/ukCities';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProviderCardData {
  id: string;
  // The real providers.id (uuid) — id above is the slug (used for
  // navigation/keys). Needed separately to batch-fetch this provider's
  // actual service price range via getProviderPriceRanges(), which is
  // keyed by provider id, not slug.
  providerId: string;
  name: string;
  service: string;
  logo: ImageSourcePropType;
  distanceMiles: number | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  reviewCount: number;
  estimatedWait: string;
  // Real £min–£max from this provider's active services, resolved via a
  // batched fetch (see providersWithPriceRange below) — null until resolved
  // or when the provider has no priced services yet. Never a vague
  // "Price on request" placeholder; the card simply omits the price line
  // until real data is available.
  priceRange: { min: number; max: number } | null;
  priceTier: 'budget' | 'mid' | 'premium' | 'luxury' | null;
  businessType: 'salon' | 'studio' | 'home_based' | 'mobile' | null;
  specialties: string[];
  // null = not yet resolved (or unknown) — see providersWithAvailability.
  // Never treat null as "no slots"; the badge simply doesn't render yet.
  availability: ProviderAvailabilityStatus | null;
  // General location text (e.g. "London") — shown on the card instead of
  // computed distance, which stays available for the Distance filter/sort
  // via latitude/longitude above but is no longer displayed per-card.
  location: string;
  // Service-coverage cities (providers.service_locations) — what the City
  // filter matches against. Distinct from `location` above, which is a
  // single display string, not a list of covered cities.
  serviceLocations: string[];
}

// Mirrors HomeScreen's FilterOptions (src/screens/client/HomeScreen.tsx) so
// the dropdown here offers the same set of filters. serviceType values are
// the real business_type column values (see DbProvider) — this used to
// collapse 'salon' and 'studio' into a single vague "Store" option that
// didn't match what a provider actually picked at registration
// (InfoRegScreen's own picker: Salon / Studio / Home Studio / Mobile).
interface FilterOptions {
  sortBy: 'recommended' | 'rating' | 'price-low' | 'price-high' | 'distance';
  priceRange?: { min: number; max: number };
  rating?: number;
  distance?: number;
  serviceType?: 'all' | 'salon' | 'studio' | 'home_based' | 'mobile';
  // 'available' means "available or limited" (has near-term headroom at
  // all) — providers whose availability hasn't resolved yet are never
  // filtered out, same not-excluded-when-unknown rule Distance follows.
  availableOnly?: boolean;
  // Matches against a provider's service_locations array (see
  // src/constants/ukCities.ts) — a provider covering this city at all is a
  // match, independent of the GPS-based Distance filter above.
  city?: string;
}

const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  sortBy: 'recommended',
  serviceType: 'all',
};

interface ProviderCardProps {
  provider: ProviderCardData;
  onPress: () => void;
  index: number;
  P: AppTheme;
}

function specialtiesFor(service: string): string[] {
  const map: Record<string, string[]> = {
    HAIR: ['Braids', 'Weaves', 'Wigs'],
    NAILS: ['Acrylics', 'Gel', 'Nail Art'],
    MUA: ['Bridal', 'Editorial', 'Glam'],
    LASHES: ['Classic', 'Volume', 'Hybrid'],
    BROWS: ['Microblading', 'Lamination', 'Tinting'],
    AESTHETICS: ['Facials', 'Peels', 'Injectables'],
  };
  return map[service] ?? ['Beauty', 'Style'];
}

// Formats a real £min–£max service-price range for the card — "£25" when
// every service is the same price, "£25–£60" otherwise. Whole pounds only
// (services are priced in whole £ in this app), no decimals.
function formatPriceRange(range: { min: number; max: number }): string {
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  return min === max ? `£${min}` : `£${min}–£${max}`;
}

// Maps the display label shown on a category pill to the raw DB service
// code, in both directions — Home's category pills navigate here with the
// raw code (e.g. 'HAIR'), this screen's own pills use the display label.
const CATEGORY_CODE_MAP: Record<string, string> = {
  Hair: 'HAIR', Nails: 'NAILS', Makeup: 'MUA',
  Aesthetics: 'AESTHETICS', Brows: 'BROWS', Lashes: 'LASHES',
  Other: 'OTHER',
};

const SEARCH_CATEGORY_TABS = ['All', 'Hair', 'Nails', 'Makeup', 'Lashes', 'Brows', 'Aesthetics', 'Other']
  .map(c => ({ key: c, label: c }));

// Single source of truth for price_tier → both the price range shown on a
// card AND the £ min/max the Price filter compares against. These used to
// be two independent, disconnected values (the displayed range was picked
// by the provider's position in the result list, not its actual tier), so
// filtering by "£100+" could return a card visibly labelled "£25–£50" —
// this keeps them in sync.
//
// The Price filter compares this min/max RANGE against the chosen bucket's
// range (do the two overlap at all), not a single approx point against the
// bucket — a point comparison silently drops a tier whose own range spans
// the bucket boundary (e.g. "mid" covers £35–£65, but its old approx of £50
// alone would never match someone filtering for "£60–£100" even though mid
// legitimately reaches into it).
const PRICE_TIER_INFO: Record<'budget' | 'mid' | 'premium' | 'luxury', { label: string; min: number; max: number }> = {
  budget:  { label: '£15–£35',  min: 15,  max: 35 },
  mid:     { label: '£35–£65',  min: 35,  max: 65 },
  premium: { label: '£65–£100', min: 65,  max: 100 },
  luxury:  { label: '£100+',    min: 100, max: 9999 },
};
const KM_TO_MILES = 0.621371;

// ── Quick-filter pill bar — each filter is its own small dropdown pill;
// tapping one opens just that filter's popover (Airbnb/Skyscanner style)
// instead of one big panel covering every filter at once. ──────────────────
type FilterKey = 'sort' | 'price' | 'rating' | 'distance' | 'type' | 'availability' | 'city';

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'distance', label: 'Nearest' },
] as const;

const PRICE_OPTIONS = [
  { label: '<£30', value: { min: 0, max: 30 } },
  { label: '£30–£60', value: { min: 30, max: 60 } },
  { label: '£60–£100', value: { min: 60, max: 100 } },
  { label: '£100+', value: { min: 100, max: 9999 } },
];

const RATING_OPTIONS = [
  { label: '4.5+ ★', value: 4.5 },
  { label: '4.0+ ★', value: 4.0 },
  { label: '3.5+ ★', value: 3.5 },
  { label: 'Any rating', value: 0 },
];

const DISTANCE_OPTIONS = [
  { label: 'Under 1 mile', value: 1 },
  { label: 'Under 3 miles', value: 3 },
  { label: 'Under 5 miles', value: 5 },
  { label: 'Any distance', value: 999 },
];

const SERVICE_TYPE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Salon', value: 'salon' },
  { label: 'Studio', value: 'studio' },
  { label: 'Home Studio', value: 'home_based' },
  { label: 'Mobile', value: 'mobile' },
] as const;

// Same list providers pick from at signup (Step 4) and in InfoRegScreen —
// see src/constants/ukCities.ts. Matches against a provider's
// service_locations array, independent of GPS-based Distance filtering.
const CITY_OPTIONS = UK_CITIES;

const FILTER_PILL_LABEL: Record<FilterKey, string> = {
  sort: 'Sort',
  price: 'Price',
  rating: 'Rating',
  distance: 'Distance',
  type: 'Type',
  availability: 'Availability',
  city: 'City',
};

type Props = NativeStackScreenProps<ExploreStackParamList, 'Search'>;

// ── Availability colour/label — real status from get_providers_availability,
// resolved asynchronously per-card (see providersWithAvailability). null
// (not yet resolved, or no data) renders no badge at all rather than
// guessing — this used to be hardcoded to 'Slots Available' on every card.
// 'none' is deliberately absent from this map (not just an unused key): the
// RPC collapses two different causes into it — a provider who's genuinely
// fully booked this week, AND a provider who has never published a schedule
// at all (has_any_open_day is false either way, see get_providers_availability).
// A "Fully Booked" badge is a false claim for the second case, so neither
// case gets a badge — the card falls through to availInfo === null below,
// same as an unresolved/no-data card. Filtering (availability === 'available'
// || 'limited') already excludes both correctly; this only affects the badge. ──
const AVAILABILITY_INFO: Partial<Record<ProviderAvailabilityStatus, { label: string; color: string }>> = {
  available: { label: 'Slots Available', color: '#4CAF50' },
  limited:   { label: 'Slots Limited',   color: '#FF9500' },
};

// Short label for the price/location meta line's third segment — the card
// is already tight (name, category pill, rating, price/location,
// availability badge), so this rides the existing text row rather than
// adding a new pill/row. Mirrors BUSINESS_TYPE_LABEL in
// ProviderProfileScreen.tsx for the same info shown consistently there.
const BUSINESS_TYPE_LABEL: Record<'salon' | 'studio' | 'home_based' | 'mobile', string> = {
  salon: 'Salon',
  studio: 'Studio',
  home_based: 'Home Studio',
  mobile: 'Mobile',
};

// ── Provider Card — vertical, sits two-up in the results grid ──────────────────
const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, index, P }) => {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const availInfo = provider.availability ? AVAILABILITY_INFO[provider.availability] : null;

  React.useEffect(() => {
    // Delay cycles every 2 cards (one grid row) rather than every card, so a
    // full row still animates in together instead of the right column always
    // lagging half a stagger-step behind the left one.
    const delay = (index % 10) * 55;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 340, delay, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, delay, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  return (
    <Animated.View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.88}>

        {/* Provider image */}
        <View style={styles.imageWrap}>
          <Image source={provider.logo} style={styles.cardImage} resizeMode="cover" fadeDuration={0} />
        </View>

        {/* Info column */}
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: P.text }]} numberOfLines={1}>
            {provider.name}
          </Text>

          <View style={[styles.servicePill, { backgroundColor: `${P.accent}18`, borderColor: `${P.accent}50` }]}>
            <Text style={[styles.servicePillText, { color: P.accentText }]}>
              {provider.service}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.star}>★</Text>
            <Text style={[styles.ratingNum, { color: P.text }]}>{provider.rating.toFixed(1)}</Text>
            <Text style={[styles.reviewCount, { color: P.sub }]}> ({provider.reviewCount})</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.priceText, { color: P.sub }]} numberOfLines={1} ellipsizeMode="tail">
              {[
                provider.priceRange ? formatPriceRange(provider.priceRange) : null,
                provider.location || null,
                provider.businessType ? BUSINESS_TYPE_LABEL[provider.businessType] : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>

          {availInfo && (
            <View style={[styles.availBadge, { backgroundColor: `${availInfo.color}22` }]}>
              <Text style={[styles.availBadgeText, { color: availInfo.color }]} numberOfLines={1}>{availInfo.label}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Book Now */}
      <TouchableOpacity style={[styles.bookBtn, { backgroundColor: P.accent }]} onPress={onPress} activeOpacity={0.8}>
        <Text style={[styles.bookBtnText, { color: P.onAccent }]}>Book Now</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});
ProviderCard.displayName = 'ProviderCard';

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SearchScreen({ navigation, route }: Props) {
  const { isDarkMode, palette: P } = useTheme();
  const { user } = useAuth();


  const [searchQuery, setSearchQuery]     = useState('');
  const [refreshing, setRefreshing]       = useState(false);
  // Device location, for the Distance filter + "Nearest" sort — mirrors
  // HomeScreen's Near You section. Stays null (and those two controls just
  // become no-ops rather than hiding anything) if permission is denied or
  // unavailable, the same silent-fallback behaviour Home uses.
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationState, setLocationState] = useState<'loading' | 'available' | 'unavailable'>('loading');
  // Resolved synchronously from the route param at mount — not in an effect —
  // so the very first fetch below is already scoped to the right category.
  // It used to be set later via a separate effect, which meant the initial
  // fetch always ran once as "every provider" before a second, correctly
  // filtered fetch landed; whichever of the two network responses happened
  // to resolve last silently won, so a slow "all providers" request could
  // overwrite the correct filtered result and leave the category tab
  // showing everything.
  const [selectedFilter, setSelectedFilter] = useState<string>(() => {
    const code = route?.params?.category;
    if (!code) return 'All';
    return Object.keys(CATEGORY_CODE_MAP).find(k => CATEGORY_CODE_MAP[k] === code) ?? 'All';
  });
  const [providerData, setProviderData]   = useState<ProviderCardData[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  // The header filters button opens this single sheet — no more per-pill
  // popovers anchored under an always-visible row.
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    sortBy: 'recommended',
    serviceType: 'all',
  });

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every request carries a monotonically increasing id. This prevents a slow
  // response for an old category/query from replacing the newer results.
  const providerRequestIdRef = useRef(0);

  // ── "Float up and merge" entrance — plays when arriving from an element
  // that visually looks like this screen's search bar/pills: a Home screen
  // service pill tap (route carries a `category`) or Explore's search-bar
  // mockup (route carries `morph`). HomeScreen's header search icon has no
  // origin element to morph from, so that path renders at rest immediately.
  // The screen content below the (native) header rises into place as a
  // cascade — search bar first, then the category row, then the results
  // grid — rather than just popping in all at once. ─────────────────────────
  // Explore's search bar and category chips are visually near-identical to
  // this screen's own bar/chips (same look, different screen) — so this
  // entrance is meant to read as that one element merging into place, not as
  // a panel sliding up from below. Small travel distances + short, barely
  // staggered timing keep it feeling like an instant merge rather than a rise.
  const isMorphEntry = useRef(!!route?.params?.category || !!route?.params?.morph).current;
  const barOpacity = useSharedValue(isMorphEntry ? 0 : 1);
  const barTranslateY = useSharedValue(isMorphEntry ? 10 : 0);
  const barScale = useSharedValue(isMorphEntry ? 0.97 : 1);
  const chipsOpacity = useSharedValue(isMorphEntry ? 0 : 1);
  const chipsTranslateY = useSharedValue(isMorphEntry ? 8 : 0);
  const resultsOpacity = useSharedValue(isMorphEntry ? 0 : 1);
  const resultsTranslateY = useSharedValue(isMorphEntry ? 8 : 0);

  // A decelerate curve (fast start, gentle settle) reads as a smooth merge
  // rather than either a slow rise (the original 340ms+26px version) or an
  // abrupt snap (a too-aggressive first pass at shortening it).
  const mergeEasing = Easing.out(Easing.cubic);

  React.useEffect(() => {
    if (!isMorphEntry) return;
    barOpacity.value = withTiming(1, { duration: 200, easing: mergeEasing });
    barTranslateY.value = withTiming(0, { duration: 220, easing: mergeEasing });
    barScale.value = withTiming(1, { duration: 220, easing: mergeEasing });
    chipsOpacity.value = withDelay(40, withTiming(1, { duration: 190, easing: mergeEasing }));
    chipsTranslateY.value = withDelay(40, withTiming(0, { duration: 210, easing: mergeEasing }));
    resultsOpacity.value = withDelay(80, withTiming(1, { duration: 190, easing: mergeEasing }));
    resultsTranslateY.value = withDelay(80, withTiming(0, { duration: 210, easing: mergeEasing }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barAnimatedStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.value,
    transform: [{ translateY: barTranslateY.value }, { scale: barScale.value }],
  }));

  const chipsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: chipsOpacity.value,
    transform: [{ translateY: chipsTranslateY.value }],
  }));

  const resultsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resultsOpacity.value,
    transform: [{ translateY: resultsTranslateY.value }],
  }));

  // ── Map DB provider to card data ────────────────────────────────────────────
  // distance/distanceMiles are left unset here — they depend on the user's
  // location, which resolves independently (and possibly later) than this
  // fetch; see providersWithDistance below, which derives them from
  // latitude/longitude once userCoords is known.
  const mapDbToCardData = useCallback((p: DbProvider): ProviderCardData => {
    return {
      id: p.slug,
      providerId: p.id,
      name: p.display_name,
      service: p.service_category,
      logo: p.logo_url ? { uri: p.logo_url } : require('../../../assets/icon.png'),
      location: p.location_text ?? 'London',
      serviceLocations: p.service_locations ?? [],
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      distanceMiles: null,
      rating: p.rating, reviewCount: p.review_count,
      estimatedWait: '10–15 min',
      // Resolved separately once the batched price-range fetch returns —
      // see providersWithPriceRange below. price_tier is kept purely for
      // the Price filter's tier-bucket sort/comparison, not for display.
      priceRange: null,
      priceTier: p.price_tier,
      businessType: p.business_type,
      specialties: specialtiesFor(p.service_category),
      // Resolved separately once the batched RPC returns — see
      // providersWithAvailability below.
      availability: null,
    };
  }, []);

  // Route param search query
  React.useEffect(() => {
    if (route?.params?.initialQuery) setSearchQuery(route.params.initialQuery);
  }, [route?.params?.initialQuery]);

  // A mounted Search route can receive new params (for example, tapping a
  // different Home category while returning to this stack). Keep the visible
  // tab and the server query in sync with those params, not just initial mount.
  React.useEffect(() => {
    const code = route?.params?.category;
    if (!code) return;
    const tab = Object.keys(CATEGORY_CODE_MAP).find(key => CATEGORY_CODE_MAP[key] === code);
    if (tab) setSelectedFilter(tab);
  }, [route?.params?.category]);

  // Ask for location once on mount, same permission string HomeScreen
  // already requests — denied/unavailable is a normal, silent outcome.
  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationState('unavailable');
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        setUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationState('available');
      } catch {
        // Distance controls are disabled with an explanation rather than
        // pretending to apply a filter that cannot be calculated.
        setLocationState('unavailable');
      }
    })();
  }, []);

  // Debounced server search — fires when query or category changes. Also
  // covers the initial mount fetch (no query yet) — selectedFilter is
  // already resolved from the route param above, so this single effect is
  // the only fetch that runs on arrival, scoped to the right category from
  // the start.
  React.useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const catCode = selectedFilter !== 'All' ? CATEGORY_CODE_MAP[selectedFilter] : undefined;

    const requestId = ++providerRequestIdRef.current;
    const run = async () => {
      setProvidersLoading(true);
      setProvidersError(null);
      try {
        const q = searchQuery.trim();
        const data = q ? await searchProviders(q, catCode) : await getProviders(catCode);
        if (requestId !== providerRequestIdRef.current) return;
        setProviderData(data.map((p) => mapDbToCardData(p as DbProvider)));
        if (q) {
          // Zero-result searches are valuable learning signals too.
          logSearchEvent({
            query: q,
            resultsCount: data.length,
            ...(catCode && { categoryFilter: catCode }),
            ...(user?.id && { userId: user.id }),
          });
        }
      } catch {
        if (requestId !== providerRequestIdRef.current) return;
        setProviderData([]);
        setProvidersError('Could not refresh providers. Pull down to try again.');
      } finally {
        if (requestId === providerRequestIdRef.current) setProvidersLoading(false);
      }
    };

    if (searchQuery.trim()) {
      searchDebounceRef.current = setTimeout(() => { run().catch(() => {}); }, 400);
    } else {
      run().catch(() => {});
    }

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, selectedFilter, mapDbToCardData, user?.id]);

  // Distance is derived separately from the raw fetch, since it depends on
  // userCoords resolving (async, and possibly after providerData already
  // loaded) rather than on the DB response itself.
  const providersWithDistance = useMemo(() => {
    if (!userCoords) return providerData;
    return providerData.map(p => {
      if (p.latitude == null || p.longitude == null) return p;
      const miles = getDistanceKm(userCoords.latitude, userCoords.longitude, p.latitude, p.longitude) * KM_TO_MILES;
      return {
        ...p,
        distanceMiles: miles,
        distance: miles < 0.1 ? '<0.1mi' : `${miles.toFixed(1)}mi`,
      };
    });
  }, [providerData, userCoords]);

  // Real availability status per provider slug, resolved via ONE batched RPC
  // call for the whole current result set rather than per-card — see
  // getProvidersAvailability's doc comment. Keyed separately from
  // providerData (not folded into mapDbToCardData) because it resolves
  // asynchronously, after the list itself has already rendered.
  const [availabilityBySlug, setAvailabilityBySlug] = useState<Map<string, ProviderAvailabilityStatus>>(new Map());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  React.useEffect(() => {
    const slugs = providerData.map(p => p.id);
    if (slugs.length === 0) {
      setAvailabilityBySlug(new Map());
      setAvailabilityLoading(false);
      return;
    }
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityBySlug(new Map());
    getProvidersAvailability(slugs)
      .then(map => { if (!cancelled) setAvailabilityBySlug(map); })
      .catch(() => { if (!cancelled) setAvailabilityBySlug(new Map()); })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [providerData]);

  const providersWithAvailability = useMemo(() => {
    if (availabilityBySlug.size === 0) return providersWithDistance;
    return providersWithDistance.map(p => ({
      ...p,
      availability: availabilityBySlug.get(p.id) ?? null,
    }));
  }, [providersWithDistance, availabilityBySlug]);

  // Real £min–£max per provider (from their active services), resolved via
  // ONE batched query for the whole current result set — see
  // getProviderPriceRanges' doc comment. Keyed by providerId (the real
  // providers.id, not slug) since that's what the underlying services table
  // is queried by. Replaces the old hardcoded "Price on request" fallback
  // with real data (or nothing, while unresolved/absent) on the card.
  const [priceRangeByProviderId, setPriceRangeByProviderId] = useState<Map<string, { min: number; max: number }>>(new Map());

  React.useEffect(() => {
    const ids = providerData.map(p => p.providerId);
    if (ids.length === 0) {
      setPriceRangeByProviderId(new Map());
      return;
    }
    let cancelled = false;
    getProviderPriceRanges(ids)
      .then(map => { if (!cancelled) setPriceRangeByProviderId(map); })
      .catch(() => { if (!cancelled) setPriceRangeByProviderId(new Map()); });
    return () => { cancelled = true; };
  }, [providerData]);

  const providersWithPriceRange = useMemo(() => {
    if (priceRangeByProviderId.size === 0) return providersWithAvailability;
    return providersWithAvailability.map(p => ({
      ...p,
      priceRange: priceRangeByProviderId.get(p.providerId) ?? null,
    }));
  }, [providersWithAvailability, priceRangeByProviderId]);

  // ── Client-side filter/sort on top of the server-searched set — category
  // and text query are already applied server-side (see the debounced effect
  // above); rating/price/distance/service-type/availability/sort narrow that
  // result set further, the same way HomeScreen's filter dropdown does. ─────
  const filteredProviders = useMemo(() => {
    let list = [...providersWithPriceRange];

    if (activeFilters.rating && activeFilters.rating > 0) {
      list = list.filter(p => p.rating >= activeFilters.rating!);
    }
    if (activeFilters.priceRange) {
      const { min, max } = activeFilters.priceRange;
      list = list.filter(p => {
        if (!p.priceTier) return false;
        const tier = PRICE_TIER_INFO[p.priceTier];
        // Range overlap, not a single approx point — see PRICE_TIER_INFO's
        // comment for why a point comparison silently dropped valid matches.
        return tier.min <= max && tier.max >= min;
      });
    }
    if (activeFilters.availableOnly) {
      // Don't claim a provider is bookable until the batched availability
      // lookup has answered. This makes "Available now" precise rather than
      // quietly including unknown or fully booked providers.
      if (availabilityLoading) return [];
      list = list.filter(p => p.availability === 'available' || p.availability === 'limited');
    }
    // serviceType values are business_type's own values now — direct
    // comparison, no collapsing map needed (see FilterOptions' comment).
    if (activeFilters.serviceType && activeFilters.serviceType !== 'all') {
      list = list.filter(p => p.businessType === activeFilters.serviceType);
    }
    if (activeFilters.distance && activeFilters.distance < 999) {
      list = list.filter(p => p.distanceMiles != null && p.distanceMiles <= activeFilters.distance!);
    }
    if (activeFilters.city) {
      list = list.filter(p => p.serviceLocations.includes(activeFilters.city!));
    }

    if (activeFilters.sortBy === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    } else if (activeFilters.sortBy === 'price-low' || activeFilters.sortBy === 'price-high') {
      const tierRank: Record<string, number> = { budget: 0, mid: 1, premium: 2, luxury: 3 };
      const dir = activeFilters.sortBy === 'price-low' ? 1 : -1;
      list.sort((a, b) => dir * ((tierRank[a.priceTier ?? ''] ?? 1) - (tierRank[b.priceTier ?? ''] ?? 1)));
    } else if (activeFilters.sortBy === 'distance') {
      list.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
    }

    return list;
  }, [providersWithPriceRange, activeFilters, availabilityLoading]);

  // DEFAULT_FILTER_OPTIONS holds what each key resets to when the user taps an
  // already-active option — sortBy/serviceType always have a concrete
  // "cleared" state to fall back to (they're never left undefined), the rest
  // clear back to undefined (no filter applied).
  const updateFilter = useCallback(<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilters(prev => {
      // Tapping the already-active option deselects it (back to the
      // no-filter default) instead of being a no-op — price/rating/distance/
      // type previously couldn't be individually cleared except via Reset.
      const isReselect = JSON.stringify(prev[key]) === JSON.stringify(value);
      return { ...prev, [key]: isReselect ? DEFAULT_FILTER_OPTIONS[key] : value };
    });
  }, []);

  const resetFilters = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFilters(DEFAULT_FILTER_OPTIONS);
  }, []);

  // Clears a single filter back to its default — powers the active-filter
  // chips row, so each chip can be dismissed independently of Reset.
  const clearFilter = useCallback((key: keyof FilterOptions) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilters(prev => ({ ...prev, [key]: DEFAULT_FILTER_OPTIONS[key] }));
  }, []);

  // ── Search input handler ─────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    // Track for user learning once query is meaningful
    if (text.trim().length >= 3) {
      const catCode = selectedFilter !== 'All' ? CATEGORY_CODE_MAP[selectedFilter] : undefined;
      userLearningService.trackSearch(text, catCode).catch(() => {});
    }
  }, [selectedFilter]);

  // ── Tracked filter chip selection ───────────────────────────────────────────
  const handleFilterPress = useCallback((f: string) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = selectedFilter === f && f !== 'All' ? 'All' : f;
    setSelectedFilter(next);
    if (next !== 'All') {
      const cat = CATEGORY_CODE_MAP[next];
      if (cat) userLearningService.trackFilter(cat).catch(() => {});
    }
  }, [selectedFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const requestId = ++providerRequestIdRef.current;
    const catCode = selectedFilter !== 'All' ? CATEGORY_CODE_MAP[selectedFilter] : undefined;
    const fn = searchQuery.trim()
      ? searchProviders(searchQuery.trim(), catCode)
      : getProviders(catCode);
    fn
      .then(data => {
        if (requestId !== providerRequestIdRef.current) return;
        setProviderData(data.map((p) => mapDbToCardData(p as DbProvider)));
        setProvidersError(null);
      })
      .catch(() => {
        if (requestId !== providerRequestIdRef.current) return;
        setProviderData([]);
        setProvidersError('Could not refresh providers. Pull down to try again.');
      })
      .finally(() => { if (requestId === providerRequestIdRef.current) setRefreshing(false); });
  }, [searchQuery, selectedFilter, mapDbToCardData]);

  const handleProviderPress = useCallback((provider: ProviderCardData) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // The 'view' interaction is tracked once, by ProviderProfileScreen itself
    // on load — tracking it again here double-counted every visit.
    navigation.navigate('ProviderProfile', { providerId: provider.id, source: 'search' });
  }, [navigation]);

  const renderCard: ListRenderItem<ProviderCardData> = useCallback(({ item, index }) => (
    <ProviderCard provider={item} onPress={() => handleProviderPress(item)} index={index} P={P} />
  ), [handleProviderPress, P]);

  // Each active (non-default) filter as a dismissible chip — key, label, and
  // the callback to clear just that one. distance's "Any" value is 999, not
  // undefined — a truthy value that isn't actually a filter, hence the < 999
  // guard (matches the filtering logic in filteredProviders above).
  const activeFilterChips = useMemo(() => {
    const chips: { key: keyof FilterOptions; label: string }[] = [];
    if (activeFilters.sortBy !== 'recommended') {
      chips.push({ key: 'sortBy', label: SORT_OPTIONS.find(o => o.value === activeFilters.sortBy)?.label ?? 'Sort' });
    }
    if (activeFilters.priceRange) {
      const opt = PRICE_OPTIONS.find(o => o.value.min === activeFilters.priceRange!.min && o.value.max === activeFilters.priceRange!.max);
      chips.push({ key: 'priceRange', label: opt?.label ?? 'Price' });
    }
    if (activeFilters.rating) {
      const opt = RATING_OPTIONS.find(o => o.value === activeFilters.rating);
      chips.push({ key: 'rating', label: opt?.label ?? 'Rating' });
    }
    if (activeFilters.distance && activeFilters.distance < 999) {
      const opt = DISTANCE_OPTIONS.find(o => o.value === activeFilters.distance);
      chips.push({ key: 'distance', label: opt?.label ?? 'Distance' });
    }
    if (activeFilters.serviceType && activeFilters.serviceType !== 'all') {
      const opt = SERVICE_TYPE_OPTIONS.find(o => o.value === activeFilters.serviceType);
      chips.push({ key: 'serviceType', label: opt?.label ?? 'Type' });
    }
    if (activeFilters.availableOnly) {
      chips.push({ key: 'availableOnly', label: 'Available now' });
    }
    if (activeFilters.city) {
      chips.push({ key: 'city', label: activeFilters.city });
    }
    return chips;
  }, [activeFilters]);

  const hasActiveFilters = activeFilterChips.length > 0;

  // ── Real native header — the actual React Navigation header, not a custom
  // View standing in for one, so the back button is the system-provided
  // control (correct swipe-back gesture affordance, platform-correct
  // chevron) rather than an imitation. headerBackButtonDisplayMode:
  // 'minimal' drops the adjacent back title text, leaving just the arrow.
  // headerRight is a single filters icon (matches OffersScreen) that opens
  // the filter sheet below, rather than an always-visible pill row.
  // Search is registered in two different navigator stacks (HomeNavigator
  // and ExploreNavigator) with divergent static header config — Home's
  // entry sets headerTransparent + a native headerSearchBarOptions field,
  // Explore's is a fullScreenModal with a "Close" back title. Every option
  // below is set explicitly (not left to inherit) so this screen looks and
  // behaves the same regardless of which stack it was opened from.
  // ExploreNavigator opens this screen as a fullScreenModal (a modal
  // presentation doesn't automatically get the native back chevron a pushed
  // screen does), so it needs the explicit headerLeft below. HomeNavigator
  // pushes it as a normal screen, which already gets a working native back
  // button on its own — adding the same custom one there doubled it up.
  // routeNames belongs to whichever stack actually owns this screen
  // instance, so this reliably tells the two entry paths apart without a
  // route param.
  const isExploreEntry = navigation.getState()?.routeNames?.includes('ExploreMain') ?? false;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: false,
      // Cancels HomeNavigator's static headerSearchBarOptions (a native
      // iOS search field baked into the header) — this screen has its own
      // custom search bar below the header, so a second one must not show.
      // exactOptionalPropertyTypes rejects `undefined` on a prop typed
      // without `| undefined`, hence the cast — the runtime effect (clearing
      // the field via setOptions' merge) is what's needed here.
      headerSearchBarOptions: undefined as any,
      headerBackVisible: true,
      headerTitle: 'SEARCH',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.text },
      headerStyle: { backgroundColor: P.bg },
      headerShadowVisible: false,
      headerTintColor: P.accentText,
      headerBackButtonDisplayMode: 'minimal',
      ...(isExploreEntry ? {
        headerLeft: () => (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backBtnText, { color: P.accentText }]}>‹</Text>
          </TouchableOpacity>
        ),
      } : {}),
      headerRight: () => (
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFilterModalVisible(true);
          }}
          activeOpacity={0.6}
        >
          <TabIcon name="sliders" size={17} color={hasActiveFilters ? P.accentText : P.sub} />
          {activeFilterChips.length > 0 && (
            <View style={[styles.filterCountBadge, { backgroundColor: P.accent, borderColor: P.bg }]}>
              <Text style={[styles.filterCountBadgeText, { color: P.onAccent }]}>{activeFilterChips.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, P, hasActiveFilters, activeFilterChips.length, isExploreEntry]);

  // ── List header: just result count ─────────────────────────────────────────
  const renderHeader = useCallback(() => (
    <View style={[styles.listHeaderBar, { borderBottomColor: P.sep }]}>
      <Text style={[styles.countText, { color: P.sub }]}>
        {filteredProviders.length} {filteredProviders.length === 1 ? 'provider' : 'providers'}
      </Text>
    </View>
  ), [filteredProviders.length, P]);

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* ── Search bar — filled card style, matching ExploreScreen's search bar. ── */}
      <View style={[styles.searchWrap, { backgroundColor: P.bg }]}>
        <ReAnimated.View style={[styles.searchBar, { backgroundColor: P.card, transformOrigin: 'center' }, barAnimatedStyle]}>
          <TabIcon name="magnifying-glass" size={16} color={P.sub} />
          <TextInput
            style={[styles.searchInput, { color: P.text, fontFamily: 'Jura-VariableFont_wght' }]}
            placeholder="Try 'nail art in east manchester'"
            placeholderTextColor={P.sub}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchQuery('');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.clearBtnWrap, { backgroundColor: P.surface }]}
            >
              <Text style={[styles.clearBtn, { color: P.sub }]}>×</Text>
            </TouchableOpacity>
          )}
        </ReAnimated.View>
      </View>

      {/* ── Category pills — always visible below the search bar, never
          collapse away, so picking one never disturbs the row itself. Same
          sliding-capsule tab bar as booking history, coloured with the app
          accent (brown in light mode, unchanged in dark). ── */}
      <ReAnimated.View style={[styles.categoryPillsSection, { backgroundColor: P.bg, borderBottomColor: P.sep }, chipsAnimatedStyle]}>
        <SlidingTabs
          tabs={SEARCH_CATEGORY_TABS}
          activeKey={selectedFilter}
          onPress={handleFilterPress}
          accentColor={P.accent}
          activeTextColor={P.onAccent}
          inactiveTextColor={P.sub}
          containerStyle={styles.chipsContent}
        />
      </ReAnimated.View>

      {/* ── Active-filter chips — one dismissible chip per non-default
          filter, only rendered when at least one is set. Lets a filter be
          cleared individually without reopening the sheet just for Reset. ── */}
      {activeFilterChips.length > 0 && (
        <View style={[styles.activeChipsWrap, { borderBottomColor: P.sep }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChipsContent}>
            {activeFilterChips.map(chip => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.activeChip, { backgroundColor: `${P.accent}18`, borderColor: `${P.accent}50` }]}
                onPress={() => clearFilter(chip.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.activeChipText, { color: P.accentText }]}>{chip.label}</Text>
                <Text style={[styles.activeChipClose, { color: P.accentText }]}>×</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.activeChipClearAll} onPress={resetFilters} activeOpacity={0.7}>
              <Text style={[styles.activeChipClearAllText, { color: P.sub }]}>Clear all</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── Filter sheet — opened from the header filters icon. All six
          groups in one scrollable sheet rather than a panel per pill. ── */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.filterModalBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={[styles.filterModalSheet, { backgroundColor: P.card, borderColor: P.border }]} onPress={() => {}}>
            <View style={styles.filterModalHeader}>
              <Text style={[styles.filterModalTitle, { color: P.text }]}>FILTERS</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={resetFilters}>
                  <Text style={[styles.filterModalReset, { color: P.accentText }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Availability — surfaced first, above Sort: it's the
                  single most decision-relevant signal in this marketplace
                  (can I actually book this provider soon), and a lone
                  toggle pill reads better leading than buried mid-list. */}
              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.availability}</Text>
              </View>
              <View style={styles.pillGrid}>
                <TouchableOpacity
                  style={[
                    styles.filterPill,
                    { borderColor: P.border, backgroundColor: P.surface },
                    activeFilters.availableOnly && { backgroundColor: P.accent, borderColor: P.accent },
                  ]}
                  onPress={() => updateFilter('availableOnly', !activeFilters.availableOnly)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterPillText, { color: activeFilters.availableOnly ? P.onAccent : P.text }]}>
                    Available now
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.sort}</Text>
              </View>
              <View style={styles.pillGrid}>
                {SORT_OPTIONS.map(opt => {
                  const isActive = activeFilters.sortBy === opt.value;
                  const isDisabled = opt.value === 'distance' && locationState !== 'available';
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }, isDisabled && styles.filterPillDisabled]}
                      onPress={() => updateFilter('sortBy', opt.value)}
                      disabled={isDisabled}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.price}</Text>
              </View>
              <View style={styles.pillGrid}>
                {PRICE_OPTIONS.map(opt => {
                  const isActive = activeFilters.priceRange?.min === opt.value.min && activeFilters.priceRange?.max === opt.value.max;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }]}
                      onPress={() => updateFilter('priceRange', opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.rating}</Text>
              </View>
              <View style={styles.pillGrid}>
                {RATING_OPTIONS.map(opt => {
                  const isActive = (activeFilters.rating ?? 0) === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }]}
                      onPress={() => updateFilter('rating', opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.distance}</Text>
              </View>
              <View style={styles.pillGrid}>
                {DISTANCE_OPTIONS.map(opt => {
                  const isActive = (activeFilters.distance ?? 999) === opt.value;
                  const isDisabled = locationState !== 'available';
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }, isDisabled && styles.filterPillDisabled]}
                      onPress={() => updateFilter('distance', opt.value)}
                      disabled={isDisabled}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {locationState !== 'available' && (
                <Text style={[styles.filterAvailabilityHint, { color: P.sub }]}>
                  {locationState === 'loading'
                    ? 'Finding your location…'
                    : 'Enable location permission to sort or filter by distance.'}
                </Text>
              )}

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.type}</Text>
              </View>
              <View style={styles.pillGrid}>
                {SERVICE_TYPE_OPTIONS.map(opt => {
                  const isActive = activeFilters.serviceType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }]}
                      onPress={() => updateFilter('serviceType', opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.filterSectionHead}>
                <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.city}</Text>
              </View>
              <View style={[styles.pillGrid, styles.pillGridLast]}>
                {CITY_OPTIONS.map(city => {
                  const isActive = activeFilters.city === city;
                  return (
                    <TouchableOpacity
                      key={city}
                      style={[styles.filterPill, { borderColor: P.border, backgroundColor: P.surface }, isActive && { backgroundColor: P.accent, borderColor: P.accent }]}
                      onPress={() => updateFilter('city', city)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? P.onAccent : P.text }]}>{city}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[styles.filterModalDone, { backgroundColor: P.accent }]}
              onPress={() => setFilterModalVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterModalDoneText, { color: P.onAccent }]}>
                Show {filteredProviders.length} {filteredProviders.length === 1 ? 'result' : 'results'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Results area — wraps the FlatList. ── */}
      <ReAnimated.View style={[{ flex: 1 }, resultsAnimatedStyle]}>

      {/* ── Provider grid — two columns, matches the provider-grid layout used
          on the bookmarked-providers screen ── */}
      <FlatList
        data={filteredProviders}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={P.accent} colors={[P.accent]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {providersLoading || (activeFilters.availableOnly && availabilityLoading) ? (
              <>
                <ActivityIndicator size="large" color={P.accent} />
                <Text style={[styles.emptyTitle, { color: P.text }]}>Checking providers…</Text>
              </>
            ) : (
              <>
                <TabIcon name="magnifying-glass" size={44} color={P.border} />
                <Text style={[styles.emptyTitle, { color: P.text }]}>{providersError ? 'Couldn’t load providers' : 'No providers found'}</Text>
                <Text style={[styles.emptySub, { color: P.sub }]}>{providersError ?? 'Try adjusting your filters or search'}</Text>
              </>
            )}
          </View>
        }
      />
      </ReAnimated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, fontFamily: 'Jura-VariableFont_wght' },

  // Header is the real native header now (see the useLayoutEffect that
  // Category pills — always visible below the search bar
  categoryPillsSection: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Active-filter chips row — one dismissible chip per active filter, plus
  // a trailing "Clear all". Only mounted when at least one filter is set.
  activeChipsWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  activeChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
    gap: 5,
  },
  activeChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '700',
  },
  activeChipClose: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 16,
  },
  activeChipClearAll: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  activeChipClearAllText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Header filters button — bare icon, matches OffersScreen's headerRight.
  filterBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  // Small count badge pinned to the filter icon's corner — only rendered
  // when at least one filter is active (see headerRight above).
  filterCountBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountBadgeText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    fontWeight: '800',
  },
  // Header back button — explicit rather than relying on the native default,
  // see the headerLeft comment above.
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  backBtnText: {
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 32,
  },

  // Filter sheet — a single bottom sheet holding every filter group,
  // opened from the header icon.
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterModalSheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  filterModalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  filterModalReset: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
  },
  filterSectionHead: {
    marginTop: 18,
    marginBottom: 8,
  },
  filterSectionTitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // Wrapping pill grid — each section's options flow left-to-right and wrap
  // to a new line, replacing the old tall stack of full-width checkmark
  // rows (Sort alone was 5 rows, Type 4 more — ~22 rows total to scroll
  // through). Short labels ("4.5+ ★", "Nearest") waste most of a full-width
  // row's horizontal space; a grid fits several per line and reads as one
  // scannable cluster per section instead of a long list.
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillGridLast: {
    marginBottom: 4,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterPillDisabled: {
    opacity: 0.42,
  },
  filterAvailabilityHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  filterPillText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  filterModalDone: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalDoneText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },

  // List header
  listHeaderBar: {
    // listContent now carries its own paddingHorizontal for the 2-col grid —
    // cancel it out here so this bar still spans full-bleed edge-to-edge.
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  clearBtnWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  clearBtn: {
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Filter chips row
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },

  // Sort row
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
  },
  // List — two columns, matches BookmarkedProvidersScreen's provider grid
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    paddingTop: 4,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },

  // Provider card — vertical: image on top, info stacked below
  card: {
    width: '48%',
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardBody: {
    flexDirection: 'column',
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.25,

  },
  cardInfo: {
    gap: 4,
    padding: 8,
  },
  cardName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.1,
  },
  servicePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  servicePillText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    fontSize: 10,
    color: '#F5A623',
  },
  ratingNum: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 3,
  },
  reviewCount: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    fontWeight: '600',
  },
  priceText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    fontWeight: '600',
  },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  availBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 8,
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  // Book Now button
  bookBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  bookBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 64,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
    marginTop: 8,
  },
  emptySub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
});
