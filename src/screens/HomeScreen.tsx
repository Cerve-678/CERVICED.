import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

// NAVIGATION IMPORTS - CORRECTED PATH
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/types';

// Import your icons from IconLibrary
import Icon, { BellIcon, SearchIcon } from '../components/IconLibrary';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import userLearningService from '../services/userLearningService';
import { HairTypeSelector } from '../components/HairTypeSelector';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { getProviders, getActivePromotions, getUnreadNotificationCount, getNewProviders, getTopRatedProviders } from '../services/databaseService';
import type { DbProvider, DbPromotionWithProvider } from '../types/database';
import { HOME_SECTIONS } from '../config/homeSections';
import { logger } from '../utils/logger';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// NAVIGATION TYPES
type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

// ── Skeleton Loader ─────────────────────────────────────────────────────────
function SkeletonSection({ isDarkMode, cardWidth, cardHeight, borderRadius = 16, count = 4 }: {
  isDarkMode: boolean; cardWidth: number; cardHeight: number; borderRadius?: number; count?: number;
}) {
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
  const base = isDarkMode ? '#3A3A3C' : '#E5E5EA';
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            width: cardWidth,
            height: cardHeight,
            borderRadius,
            backgroundColor: base,
            opacity,
            marginRight: 16,
          }}
        />
      ))}
    </View>
  );
}

// FILTER TYPES
interface FilterOptions {
  sortBy: 'recommended' | 'nearest' | 'highest-rated' | 'available-now';
  availability: 'any' | 'today' | 'tomorrow' | 'this-week';
  priceRange?: { min: number; max: number };
  rating?: number;
  distance?: number;
  serviceType?: 'all' | 'home-service' | 'store' | 'mobile';
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
}

// Component prop types
interface ProviderCardProps {
  provider: Provider;
  onPress: () => void;
  style: any;
  blurStyle: any;
}

interface ServiceButtonProps {
  service: string;
  isSelected: boolean;
  onPress: () => void;
  onBack?: () => void;
  showBackArrow?: boolean;
}

const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, style, blurStyle }) => {
  const { isDarkMode, palette: P } = useTheme();

  return (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.75}>
      <View style={[blurStyle, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
        {provider.logo ? (
          <Image
            source={provider.logo}
            style={styles.providerImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <View style={[styles.placeholderCard, { backgroundColor: P.surface }]}>
            <Text style={[styles.placeholderText, { color: P.sub }]}>{provider.service}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.providerCardName, { color: P.text }]} numberOfLines={1}>{provider.name}</Text>
      <Text style={[styles.providerCardSub, { color: P.sub }]} numberOfLines={1}>{provider.service}</Text>
    </TouchableOpacity>
  );
});

const ServiceButton = memo<ServiceButtonProps>(({ service, isSelected, onPress }) => {
  const { isDarkMode, palette: P } = useTheme();

  return (
    <TouchableOpacity style={styles.serviceButton} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.glassCard,
        {
          backgroundColor: isSelected ? P.accent : P.surface,
          borderColor: P.border,
          borderWidth: StyleSheet.hairlineWidth,
        }
      ]}>
        <Text style={[styles.serviceText, { color: isSelected ? P.ice : P.text }]}>{service}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme, isDarkMode, palette: P } = useTheme();
  const { bookings } = useBooking();
  const { user } = useAuth();
  const { bookmarkedIds, loadBookmarks } = useBookmarkStore();
  const insets = useSafeAreaInsets();

  // Ref for main ScrollView to control scrolling
  const scrollViewRef = useRef<ScrollView>(null);


  // Live providers from Supabase; starts empty until data loads
  const [liveProviders, setLiveProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showHairTypeSelector, setShowHairTypeSelector] = useState(false);
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
  const [rawPromotions, setRawPromotions] = useState<DbPromotionWithProvider[]>([]);

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

  const currentOffers = useMemo(() => allOffers.slice(0, 3), [allOffers]);

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

    // Fetch live providers — shows empty state if DB has no data
    getProviders().then(data => {
      setLiveProviders(data.map((p: DbProvider) => ({
        id: p.id,     // UUID — matches bookmarkedIds from Supabase
        slug: p.slug, // slug — used for navigation
        name: p.display_name,
        service: p.service_category,
        logo: p.logo_url ? { uri: p.logo_url } : null,
      })));
      setProvidersLoading(false);
    }).catch(() => {
      setProvidersLoading(false);
    });

    // Fetch active promotions
    getActivePromotions().then(data => {
      setRawPromotions(data);
    }).catch(() => {
      // Silent failure — keeps empty offers list
    });

    // Phase 5.4 — new providers + top rated
    const mapDbProvider = (p: DbProvider): Provider => ({
      id: p.id,
      slug: p.slug,
      name: p.display_name,
      service: p.service_category,
      logo: p.logo_url ? { uri: p.logo_url } : null,
    });

    getNewProviders(10).then(data => setNewProviders(data.map(mapDbProvider))).catch(() => {});
    getTopRatedProviders(10).then(data => setTopRated(data.map(mapDbProvider))).catch(() => {});
  }, []); // Only run once on mount

  // Update provider data whenever bookmarkedIds or liveProviders changes
  useEffect(() => {
    const updateProviderData = async () => {
      try {
        // Get bookmarked providers from store — cross-reference against live providers
        const bookmarkedProviders = liveProviders.filter(p => bookmarkedIds.includes(p.id));

        // Get personalized recommendations
        const personalizedRecommended = await userLearningService.getPersonalizedProviders(
          liveProviders,
          3
        );

        // Ensure each section has different providers
        const yourProviderIds = new Set(bookmarkedProviders.map(p => p.id));
        const recommendedFiltered = personalizedRecommended.filter(p => !yourProviderIds.has(p.id));

        // Default recommended: first provider from each service type
        const defaultRecommended = [
          liveProviders.find(p => p.service === 'MUA'),
          liveProviders.find(p => p.service === 'NAILS'),
          liveProviders.find(p => p.service === 'LASHES'),
          liveProviders.find(p => p.service === 'HAIR'),
          liveProviders.find(p => p.service === 'AESTHETICS'),
          liveProviders.find(p => p.service === 'BROWS'),
        ].filter(p => p && !yourProviderIds.has(p!.id)) as Provider[];

        setProvidersData({
          yourProviders: bookmarkedProviders.length > 0 ? bookmarkedProviders : [],
          recommended: recommendedFiltered.length > 0 ? recommendedFiltered : defaultRecommended,
          hairProviders: liveProviders.filter(p => p.service === 'HAIR'),
          nailProviders: liveProviders.filter(p => p.service === 'NAILS'),
          lashProviders: liveProviders.filter(p => p.service === 'LASHES'),
          muaProviders: liveProviders.filter(p => p.service === 'MUA'),
          browProviders: liveProviders.filter(p => p.service === 'BROWS'),
          aestheticsProviders: liveProviders.filter(p => p.service === 'AESTHETICS'),
          // Male providers
          maleProviders: liveProviders.filter(p => p.service === 'MALE'),
          // Kids providers
          kidsProviders: liveProviders.filter(p => p.service === 'KIDS'),
        });

        // Phase 5.4 — recently viewed from userLearningService interaction log
        const recentViewInteractions = userLearningService.getRecentInteractions('view', 10);
        const recentIds = recentViewInteractions
          .map((i: any) => i.providerId ?? i.provider_id)
          .filter(Boolean);
        const recentViewedProviders = recentIds
          .map((id: string) => liveProviders.find(p => p.id === id))
          .filter((p): p is Provider => Boolean(p))
          .slice(0, 5);
        setRecentlyViewed(recentViewedProviders);
      } catch (error) {
        logger.error('Failed to update provider data:', error);
        // Silent failure — providers fall back to defaults already set
      }
    };

    updateProviderData();
  }, [bookmarkedIds, liveProviders]); // React to both bookmark changes and live data updates

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
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      return deduped.slice(0, 10);
    } else {
      // When collapsed, show 7 providers
      return providersData.recommended.slice(0, 7);
    }
  }, [viewAllRecommended, providersData]);

  // Memoize male providers display list to prevent unnecessary rerenders
  const maleProvidersDisplay = useMemo(() => {
    return viewAllMaleServices
      ? providersData.maleProviders
      : providersData.maleProviders.slice(0, 5);
  }, [viewAllMaleServices, providersData.maleProviders]);

  // Memoize kids providers display list to prevent unnecessary rerenders
  const kidsProvidersDisplay = useMemo(() => {
    return viewAllKidsServices
      ? providersData.kidsProviders
      : providersData.kidsProviders.slice(0, 5);
  }, [viewAllKidsServices, providersData.kidsProviders]);

  // Phase 5.2 — profile-aware gating for MALE and KIDS sections
  // § config-driven — see src/config/homeSections.ts (id: 'male-services')
  const showMaleSection = useMemo(() => {
    const config = HOME_SECTIONS.find(s => s.id === 'male-services');
    return config?.showWhen?.(user, providersData) ?? (providersData.maleProviders.length > 0);
  }, [user, providersData]);

  // § config-driven — see src/config/homeSections.ts (id: 'kids-services')
  const showKidsSection = useMemo(() => {
    const config = HOME_SECTIONS.find(s => s.id === 'kids-services');
    return config?.showWhen?.(user, providersData) ?? (providersData.kidsProviders.length > 0);
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
    const sortBy = activeFilters.sortBy as string;
    if (sortBy === 'highest-rated' || sortBy === 'rating') {
      providers = [...providers].sort((a, b) => ((b as any).rating ?? 0) - ((a as any).rating ?? 0));
    }
    if (activeFilters.rating && activeFilters.rating > 0) {
      providers = providers.filter(p => ((p as any).rating ?? 0) >= activeFilters.rating!);
    }

    return {
      left: providers.slice(0, 6),
      right: providers.slice(6, 12),
    };
  }, [selectedService, providersData, activeFilters]);

  const handleServicePress = useCallback(async (service: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(service);

    // Scroll to top when service is selected
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    // Track service selection
    await userLearningService.trackInteraction({
      type: 'search',
      serviceCategory: service,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const handleBackPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(null);
    setShowHairTypeSelector(false);
    setSelectedHairType(null);
  }, []);

  const navigateToProvider = useCallback(
    async (provider: Provider) => {
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Track provider view interaction
      await userLearningService.trackInteraction({
        type: 'view',
        providerId: provider.id,
        providerName: provider.name,
        serviceCategory: provider.service,
        timestamp: new Date().toISOString(),
      });

      navigation.navigate('ProviderProfile', {
        providerId: provider.slug,
        source: 'home',
      });
    },
    [navigation]
  );

  const navigateToSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // @ts-ignore - navigation options for instant transition
    navigation.navigate('Search', {}, { animation: 'none' });
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
              style={[styles.iconBtn, { backgroundColor: P.iconBg }]}
              onPress={navigateToSearch}
              activeOpacity={0.7}
              accessibilityLabel="Search providers"
              accessibilityRole="button"
            >
              <SearchIcon size={18} color={P.sub} />
            </TouchableOpacity>
            <TouchableOpacity
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
              style={[styles.bookingsChip, { backgroundColor: P.accent }]}
              onPress={navigateToBookings}
              activeOpacity={0.7}
            >
              <Text style={[styles.bookingsChipText, { color: P.ice }]}>Bookings</Text>
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              nestedScrollEnabled={true}
            >
              {providersData.yourProviders.slice(0, 10).map(provider => (
                <ProviderCard
                  key={`your-${provider.id}`}
                  provider={provider}
                  onPress={() => navigateToProvider(provider)}
                  style={styles.brandCard}
                  blurStyle={styles.brandCardBlur}
                />
              ))}
            </ScrollView>
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
                      <Text style={styles.filterButtonText}>
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
                            <Text style={styles.resetText}>RESET</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Hair Type Selector for HAIR service */}
                        {selectedService === 'HAIR' && (
                          <View style={styles.filterSection}>
                            <Text style={[styles.filterSectionTitle, { color: P.text }]}>HAIR TYPE</Text>
                            <HairTypeSelector
                              onSelect={(hairType) => {
                                setSelectedHairType(hairType);
                                setShowHairTypeSelector(true);
                              }}
                              onBack={() => {
                                setSelectedService(null);
                                setShowHairTypeSelector(false);
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
                                        color: isActive ? P.accent : P.text,
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
                                        color: isActive ? P.accent : P.text,
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
                                        color: isActive ? P.accent : P.text,
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
                                        color: isActive ? P.accent : P.text,
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
                                        color: isActive ? P.accent : P.text,
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
                            {[
                              { label: 'All', value: 'all' as const },
                              { label: 'Home Service', value: 'home-service' as const },
                              { label: 'Store', value: 'store' as const },
                              { label: 'Mobile', value: 'mobile' as const },
                            ].map((type) => {
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
                                        color: isActive ? P.accent : P.text,
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
                {serviceProviders.left.map((provider, index) => (
                  <ProviderCard
                    key={`left-${provider.id}-${index}`}
                    provider={provider}
                    onPress={() => provider.logo && navigateToProvider(provider)}
                    style={styles.columnProviderCard}
                    blurStyle={styles.columnProviderBlur}
                  />
                ))}
              </View>
              <View style={styles.rightColumn}>
                {serviceProviders.right.map((provider, index) => (
                  <ProviderCard
                    key={`right-${provider.id}-${index}`}
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
            {/* Recommended Section */}
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
                <SkeletonSection isDarkMode={isDarkMode} cardWidth={176} cardHeight={64} borderRadius={16} />
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {recommendedProvidersList.map((provider) => (
                    <ProviderCard
                      key={`recommended-${provider.id}`}
                      provider={provider}
                      onPress={() => navigateToProvider(provider)}
                      style={styles.brandCard}
                      blurStyle={styles.brandCardBlur}
                    />
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Provider of the Week */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: P.text }]}>BROWSE BY CATEGORY</Text>
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
                <SkeletonSection isDarkMode={isDarkMode} cardWidth={282} cardHeight={147} borderRadius={20} count={3} />
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
                          {providers.map((provider: Provider) => (
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
                        {providersData.hairProviders.slice(0, 10).map(provider => (
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
                        {providersData.nailProviders.slice(0, 10).map(provider => (
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

            {/* § config-driven — see src/config/homeSections.ts (id: 'new-providers') */}
            {/* NEW ON CERVICED */}
            {newProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>NEW ON CERVICED</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {newProviders.map(provider => (
                    <ProviderCard
                      key={`new-${provider.id}`}
                      provider={provider}
                      onPress={() => navigateToProvider(provider)}
                      style={styles.brandCard}
                      blurStyle={styles.brandCardBlur}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'top-rated') */}
            {/* TOP RATED */}
            {topRated.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>TOP RATED</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {topRated.map(provider => (
                    <ProviderCard
                      key={`toprated-${provider.id}`}
                      provider={provider}
                      onPress={() => navigateToProvider(provider)}
                      style={styles.providerCard}
                      blurStyle={styles.providerBlur}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'recently-viewed') */}
            {/* RECENTLY VIEWED */}
            {recentlyViewed.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>RECENTLY VIEWED</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {recentlyViewed.map(provider => (
                    <TouchableOpacity
                      key={`recent-${provider.id}`}
                      style={styles.roundCard}
                      onPress={() => navigateToProvider(provider)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roundCardBlur, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                        {provider.logo && (
                          <Image
                            source={provider.logo}
                            style={styles.roundCardImage}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <Text style={[styles.roundCardName, { color: P.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* § config-driven — see src/config/homeSections.ts (id: 'male-services') */}
            {/* Male Services Section */}
            {showMaleSection && (
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
                    {maleProvidersDisplay.map((provider, index) => (
                      <View key={`male-expanded-${index}-${provider.id}`} style={styles.gridItem}>
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
              </View>
            )}

            {/* Near Me Section - Location-based providers */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: P.text }]}>ALL PROVIDERS</Text>
              </View>

              {providersLoading ? (
                <SkeletonSection isDarkMode={isDarkMode} cardWidth={100} cardHeight={100} borderRadius={50} count={5} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {liveProviders.slice(0, 10).map(provider => (
                    <TouchableOpacity
                      key={`near-${provider.id}`}
                      style={styles.roundCard}
                      onPress={() => navigateToProvider(provider)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roundCardBlur, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                        {provider.logo && (
                          <Image
                            source={provider.logo}
                            style={styles.roundCardImage}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <Text style={[styles.roundCardName, { color: P.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* § config-driven — see src/config/homeSections.ts (id: 'kids-services') */}
            {/* Kids Services Section */}
            {showKidsSection && (
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
                    {kidsProvidersDisplay.map((provider, index) => (
                      <View key={`kids-expanded-${index}-${provider.id}`} style={styles.gridItem}>
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
                    {kidsProvidersDisplay.map(provider => (
                      <ProviderCard
                        key={`kids-${provider.id}`}
                        provider={provider}
                        onPress={() => navigateToProvider(provider)}
                        style={styles.brandCard}
                        blurStyle={styles.brandCardBlur}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Current Offers Section — only rendered when there are live promotions */}
            {currentOffers.length > 0 && <View style={styles.section}>
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
                      <View style={[styles.offerDiscountBadge, { backgroundColor: P.accent, borderColor: P.accent }]}>
                        <Text style={[styles.offerDiscountText, { color: P.ice }]}>{offer.discount}</Text>
                      </View>
                      {offer.logo ? <Image source={offer.logo} style={styles.offerLogo} resizeMode="cover" /> : <View style={styles.offerLogo} />}
                      <View style={styles.offerContent}>
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

            {/* Book Again Section - Only show if user has previous bookings */}
            {previouslyBookedProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: P.text }]}>BOOK AGAIN</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  nestedScrollEnabled={true}
                >
                  {previouslyBookedProviders.slice(0, 10).map(provider => (
                    <TouchableOpacity
                      key={`booked-${provider.id}`}
                      style={styles.roundCard}
                      onPress={() => navigateToProvider(provider)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roundCardBlur, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                        {provider.logo && (
                          <Image
                            source={provider.logo}
                            style={styles.roundCardImage}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                      <Text style={[styles.roundCardName, { color: P.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

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
  serviceButton: {
    marginRight: 10,
  },
  glassCard: {
    borderRadius: 14,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 22,
    height: Platform.OS === 'android' ? 30 : 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  serviceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
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
    color: '#7E6667',
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
  providerImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  placeholderCard: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  providerCardName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.1,
  },
  providerCardSub: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
    opacity: 0.8,
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
    color: '#AF9197',
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
  filterChipTextActive: {
    color: '#AF9197',
    fontWeight: '700',
  },
  ViewAllButton: {
    backgroundColor: '#AF9197',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  distanceBadge: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
    opacity: 0.7,
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
  offerDiscountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
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
    fontWeight: '600',
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
  serviceTypeChipTextActive: {
    fontWeight: '700',
    color: '#AF9197',
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
  offerTabTextActive: {
    fontWeight: '700',
    color: '#AF9197',
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
