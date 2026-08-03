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
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ReAnimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ExploreStackParamList } from '../../navigation/types';
import { useCart } from '../../contexts/CartContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import { ThemedBackground } from '../../components/ThemedBackground';
import TabIcon from '../../components/TabIcon';
import SlidingTabs from '../../components/SlidingTabs';
import * as Location from 'expo-location';
import { getProviders, searchProviders, logSearchEvent } from '../../services/databaseService';
import type { DbProvider } from '../../types/database';
import userLearningService from '../../services/userLearningService';
import { useAuth } from '../../contexts/AuthContext';
import { getDistanceKm } from '../../utils/distance';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProviderCardData {
  id: string;
  name: string;
  service: string;
  logo: ImageSourcePropType;
  isAvailable: boolean;
  distance: string;
  distanceMiles: number | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  reviewCount: number;
  estimatedWait: string;
  priceRange: string;
  priceTier: 'budget' | 'mid' | 'premium' | 'luxury' | null;
  businessType: 'salon' | 'studio' | 'home_based' | 'mobile' | null;
  specialties: string[];
  availability: 'Slots Available' | 'Slots Limited' | 'No Slots';
  location: string;
  totalSlots: number;
  bookedSlots: number;
}

// Mirrors HomeScreen's FilterOptions (src/screens/HomeScreen.tsx) so the
// dropdown here offers the same set of filters.
interface FilterOptions {
  sortBy: 'recommended' | 'rating' | 'price-low' | 'price-high' | 'distance';
  priceRange?: { min: number; max: number };
  rating?: number;
  distance?: number;
  serviceType?: 'all' | 'home-service' | 'store' | 'mobile';
}

interface ProviderCardProps {
  provider: ProviderCardData;
  onPress: () => void;
  index: number;
  P: AppTheme;
}

// Maps the display label shown on a category pill to the raw DB service
// code, in both directions — Home's category pills navigate here with the
// raw code (e.g. 'HAIR'), this screen's own pills use the display label.
const CATEGORY_CODE_MAP: Record<string, string> = {
  Hair: 'HAIR', Nails: 'NAILS', Makeup: 'MUA',
  Aesthetics: 'AESTHETICS', Brows: 'BROWS', Lashes: 'LASHES',
};

const SEARCH_CATEGORY_TABS = ['All', 'Hair', 'Nails', 'Makeup', 'Lashes', 'Brows', 'Aesthetics']
  .map(c => ({ key: c, label: c }));

// Single source of truth for price_tier → both the price range shown on a
// card AND the approximate £ value the Price filter compares against.
// These used to be two independent, disconnected values (the displayed
// range was picked by the provider's position in the result list, not its
// actual tier), so filtering by "£100+" could return a card visibly
// labelled "£25–£50" — this keeps the two in sync.
const PRICE_TIER_INFO: Record<'budget' | 'mid' | 'premium' | 'luxury', { label: string; approx: number }> = {
  budget:  { label: '£15–£35',  approx: 20 },
  mid:     { label: '£35–£65',  approx: 50 },
  premium: { label: '£65–£100', approx: 85 },
  luxury:  { label: '£100+',    approx: 140 },
};
const KM_TO_MILES = 0.621371;

// ── Quick-filter pill bar — each filter is its own small dropdown pill;
// tapping one opens just that filter's popover (Airbnb/Skyscanner style)
// instead of one big panel covering every filter at once. ──────────────────
type FilterKey = 'sort' | 'price' | 'rating' | 'distance' | 'type';

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
  { label: 'Home Service', value: 'home-service' },
  { label: 'Store', value: 'store' },
  { label: 'Mobile', value: 'mobile' },
] as const;

const FILTER_PILL_LABEL: Record<FilterKey, string> = {
  sort: 'Sort',
  price: 'Price',
  rating: 'Rating',
  distance: 'Distance',
  type: 'Type',
};

type Props = NativeStackScreenProps<ExploreStackParamList, 'Search'>;

// ── Availability colour ───────────────────────────────────────────────────────
function availColor(a: string) {
  if (a === 'Slots Available') return '#4CAF50';
  if (a === 'Slots Limited') return '#FF9500';
  return '#FF3B30';
}

// ── Provider Card — vertical, sits two-up in the results grid ──────────────────
const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, index, P }) => {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const color = availColor(provider.availability);

  React.useEffect(() => {
    // Delay cycles every 2 cards (one grid row) rather than every card, so a
    // full row still animates in together instead of the right column always
    // lagging half a stagger-step behind the left one.
    const delay = (index % 10) * 55;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 340, delay, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.88}>

        {/* Provider image */}
        <View style={styles.imageWrap}>
          <Image source={provider.logo} style={styles.cardImage} resizeMode="cover" />
        </View>

        {/* Info column */}
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: P.text }]} numberOfLines={1}>
            {provider.name}
          </Text>

          <View style={[styles.servicePill, { backgroundColor: `${P.accent}18`, borderColor: `${P.accent}50` }]}>
            <Text style={[styles.servicePillText, { color: P.accent }]}>
              {provider.service}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.star}>★</Text>
            <Text style={[styles.ratingNum, { color: P.text }]}>{provider.rating.toFixed(1)}</Text>
            <Text style={[styles.reviewCount, { color: P.sub }]}> ({provider.reviewCount})</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.priceText, { color: P.sub }]}>{provider.priceRange}</Text>
            {provider.distance ? (
              <Text style={[styles.priceText, { color: P.sub }]}> · {provider.distance}</Text>
            ) : null}
          </View>

          <View style={[styles.availBadge, { backgroundColor: `${color}22` }]}>
            <Text style={[styles.availBadgeText, { color }]} numberOfLines={1}>{provider.availability}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Book Now */}
      <TouchableOpacity style={[styles.bookBtn, { backgroundColor: P.accent }]} onPress={onPress} activeOpacity={0.8}>
        <Text style={[styles.bookBtnText, { color: P.ice }]}>Book Now</Text>
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
  // The header filters button opens this single sheet — no more per-pill
  // popovers anchored under an always-visible row.
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    sortBy: 'recommended',
    serviceType: 'all',
  });

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  function mapDbToCardData(p: DbProvider): ProviderCardData {
    return {
      id: p.slug,
      name: p.display_name,
      service: p.service_category,
      logo: p.logo_url ? { uri: p.logo_url } : require('../../../assets/icon.png'),
      location: p.location_text ?? 'London',
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      totalSlots: 0, bookedSlots: 0,
      isAvailable: true, distance: '', distanceMiles: null,
      rating: p.rating, reviewCount: p.review_count,
      estimatedWait: '10–15 min',
      priceRange: p.price_tier ? PRICE_TIER_INFO[p.price_tier].label : 'Price on request',
      priceTier: p.price_tier,
      businessType: p.business_type,
      specialties: specialtiesFor(p.service_category),
      availability: 'Slots Available',
    };
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

  // Route param search query
  React.useEffect(() => {
    if (route?.params?.initialQuery) setSearchQuery(route.params.initialQuery);
  }, [route?.params?.initialQuery]);

  // Ask for location once on mount, same permission string HomeScreen
  // already requests — denied/unavailable is a normal, silent outcome.
  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({});
        setUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // Silent failure — Distance filter/sort just stay no-ops
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

    if (!searchQuery.trim()) {
      // No query — reload all providers for the selected category
      getProviders(catCode)
        .then(data => setProviderData(data.map((p) => mapDbToCardData(p as DbProvider))))
        .catch(() => {});
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      const q = searchQuery.trim();
      searchProviders(q, catCode)
        .then(data => {
          setProviderData(data.map((p) => mapDbToCardData(p as DbProvider)));
          // Log every search — zero-result searches are the most valuable signal
          logSearchEvent({
            query: q,
            resultsCount: data.length,
            ...(catCode     && { categoryFilter: catCode }),
            ...(user?.id    && { userId: user.id }),
          });
        })
        .catch(() => {});
    }, 400);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, selectedFilter]);

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

  // ── Client-side filter/sort on top of the server-searched set — category
  // and text query are already applied server-side (see the debounced effect
  // above); rating/price/distance/service-type/sort narrow that result set
  // further, the same way HomeScreen's filter dropdown does. ─────────────────
  const filteredProviders = useMemo(() => {
    let list = [...providersWithDistance];

    if (activeFilters.rating && activeFilters.rating > 0) {
      list = list.filter(p => p.rating >= activeFilters.rating!);
    }
    if (activeFilters.priceRange) {
      const { min, max } = activeFilters.priceRange;
      list = list.filter(p => {
        if (!p.priceTier) return true;
        const approx = PRICE_TIER_INFO[p.priceTier].approx;
        return approx >= min && approx <= max;
      });
    }
    if (activeFilters.serviceType && activeFilters.serviceType !== 'all') {
      const typeMap: Record<string, string[]> = {
        'home-service': ['home_based'],
        'store': ['salon', 'studio'],
        'mobile': ['mobile'],
      };
      const allowed = typeMap[activeFilters.serviceType] ?? [];
      list = list.filter(p => p.businessType && allowed.includes(p.businessType));
    }
    // Unknown distance (no location fix, or provider missing lat/lng) is
    // never excluded — we simply don't know, which shouldn't read as "too
    // far away". Mirrors HomeScreen's Near You fallback behaviour.
    if (activeFilters.distance && activeFilters.distance < 999) {
      list = list.filter(p => p.distanceMiles == null || p.distanceMiles <= activeFilters.distance!);
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
  }, [providersWithDistance, activeFilters]);

  const updateFilter = useCallback(<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFilters({ sortBy: 'recommended', serviceType: 'all' });
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
    const catCode = selectedFilter !== 'All' ? CATEGORY_CODE_MAP[selectedFilter] : undefined;
    const fn = searchQuery.trim()
      ? searchProviders(searchQuery.trim(), catCode)
      : getProviders(catCode);
    fn
      .then(data => setProviderData(data.map((p) => mapDbToCardData(p as DbProvider))))
      .catch(() => setProviderData([]))
      .finally(() => setRefreshing(false));
  }, [searchQuery, selectedFilter]);

  const handleProviderPress = useCallback((provider: ProviderCardData) => {
    // The 'view' interaction is tracked once, by ProviderProfileScreen itself
    // on load — tracking it again here double-counted every visit.
    navigation.navigate('ProviderProfile', { providerId: provider.id, source: 'search' });
  }, [navigation]);

  const renderCard: ListRenderItem<ProviderCardData> = useCallback(({ item, index }) => (
    <ProviderCard provider={item} onPress={() => handleProviderPress(item)} index={index} P={P} />
  ), [handleProviderPress, P]);

  // distance's "Any" chip is 999, not undefined — a truthy value that isn't
  // actually a filter, hence the < 999 guard (matches the filtering logic).
  const hasActiveFilters =
    activeFilters.sortBy !== 'recommended' ||
    !!activeFilters.priceRange ||
    !!activeFilters.rating ||
    (!!activeFilters.distance && activeFilters.distance < 999) ||
    (!!activeFilters.serviceType && activeFilters.serviceType !== 'all');

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
      headerTintColor: P.accent,
      headerBackButtonDisplayMode: 'minimal',
      ...(isExploreEntry ? {
        headerLeft: () => (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backBtnText, { color: P.accent }]}>‹</Text>
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
          <TabIcon name="sliders" size={17} color={hasActiveFilters ? P.accent : P.sub} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, P, hasActiveFilters, isExploreEntry]);

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
              onPress={() => setSearchQuery('')}
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
          inactiveTextColor={P.sub}
          containerStyle={styles.chipsContent}
        />
      </ReAnimated.View>

      {/* ── Filter sheet — opened from the header filters icon. All five
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
                  <Text style={[styles.filterModalReset, { color: P.accent }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.sort}</Text>
              {SORT_OPTIONS.map(opt => {
                const isActive = activeFilters.sortBy === opt.value;
                return (
                  <TouchableOpacity key={opt.value} style={styles.filterOptionRow} onPress={() => updateFilter('sortBy', opt.value)} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, { color: P.text, fontWeight: isActive ? '700' : '400' }]}>{opt.label}</Text>
                    {isActive && <Text style={[styles.filterOptionCheck, { color: P.accent }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.price}</Text>
              {PRICE_OPTIONS.map(opt => {
                const isActive = activeFilters.priceRange?.min === opt.value.min && activeFilters.priceRange?.max === opt.value.max;
                return (
                  <TouchableOpacity key={opt.label} style={styles.filterOptionRow} onPress={() => updateFilter('priceRange', opt.value)} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, { color: P.text, fontWeight: isActive ? '700' : '400' }]}>{opt.label}</Text>
                    {isActive && <Text style={[styles.filterOptionCheck, { color: P.accent }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.rating}</Text>
              {RATING_OPTIONS.map(opt => {
                const isActive = (activeFilters.rating ?? 0) === opt.value;
                return (
                  <TouchableOpacity key={opt.label} style={styles.filterOptionRow} onPress={() => updateFilter('rating', opt.value)} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, { color: P.text, fontWeight: isActive ? '700' : '400' }]}>{opt.label}</Text>
                    {isActive && <Text style={[styles.filterOptionCheck, { color: P.accent }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.distance}</Text>
              {DISTANCE_OPTIONS.map(opt => {
                const isActive = (activeFilters.distance ?? 999) === opt.value;
                return (
                  <TouchableOpacity key={opt.label} style={styles.filterOptionRow} onPress={() => updateFilter('distance', opt.value)} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, { color: P.text, fontWeight: isActive ? '700' : '400' }]}>{opt.label}</Text>
                    {isActive && <Text style={[styles.filterOptionCheck, { color: P.accent }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.filterSectionTitle, { color: P.sub }]}>{FILTER_PILL_LABEL.type}</Text>
              {SERVICE_TYPE_OPTIONS.map(opt => {
                const isActive = activeFilters.serviceType === opt.value;
                return (
                  <TouchableOpacity key={opt.value} style={styles.filterOptionRow} onPress={() => updateFilter('serviceType', opt.value)} activeOpacity={0.7}>
                    <Text style={[styles.filterOptionText, { color: P.text, fontWeight: isActive ? '700' : '400' }]}>{opt.label}</Text>
                    {isActive && <Text style={[styles.filterOptionCheck, { color: P.accent }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.filterModalDone, { backgroundColor: P.accent }]}
              onPress={() => setFilterModalVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.filterModalDoneText}>Show results</Text>
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
            <TabIcon name="magnifying-glass" size={44} color={P.border} />
            <Text style={[styles.emptyTitle, { color: P.text }]}>No providers found</Text>
            <Text style={[styles.emptySub, { color: P.sub }]}>Try adjusting your filters or search</Text>
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

  // Header filters button — bare icon, matches OffersScreen's headerRight.
  filterBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
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
  filterSectionTitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  filterOptionText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
  },
  filterOptionCheck: {
    fontSize: 14,
    fontWeight: '700',
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
    backgroundColor: '#E0D8D4',
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
