import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

// NAVIGATION IMPORTS - CORRECTED PATH
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/types';

// Import your icons from IconLibrary
import Icon, { BellIcon, SearchIcon } from '../components/IconLibrary';
import { NotificationService } from '../services/notificationService';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking } from '../contexts/BookingContext';
import userLearningService from '../services/userLearningService';
import { HairTypeSelector } from '../components/HairTypeSelector';
import { useBookmarkStore } from '../stores/useBookmarkStore';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// NAVIGATION TYPES
type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

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
  id: string;
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

// UBER-STYLE SLUGIFIED IDs: business names converted to URL-safe slugs
const sampleProviders: Provider[] = [
  {
    id: 'diva-nails',
    name: 'Diva Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/divanails.png'),
  },
  {
    id: 'jana-aesthetics',
    name: 'Jana Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/janaaesthetics.png'),
  },
  {
    id: 'her-brows',
    name: 'Her Brows',
    service: 'BROWS',
    logo: require('../../assets/logos/herbrows.png'),
  },
  {
    id: 'kiki-nails',
    name: 'Kiki Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/kikisnails.png'),
  },
  {
    id: 'makeup-by-mya',
    name: 'Makeup by Mya',
    service: 'MUA',
    logo: require('../../assets/logos/makeupbymya.png'),
  },
  {
    id: 'styled-by-kathrine',
    name: 'Styled by Kathrine',
    service: 'HAIR',
    logo: require('../../assets/logos/styledbykathrine.png'),
  },
  {
    id: 'vikki-laid',
    name: 'Vikki Laid',
    service: 'HAIR',
    logo: require('../../assets/logos/vikkilaid.png'),
  },
  {
    id: 'hair-by-jennifer',
    name: 'Hair by Jennifer',
    service: 'HAIR',
    logo: require('../../assets/logos/hairbyjennifer.png'),
  },
  {
    id: 'your-lashed',
    name: 'Your Lashed',
    service: 'LASHES',
    logo: require('../../assets/logos/yourlashed.png'),
  },
  {
    id: 'rosemay-aesthetics',
    name: 'RoseMay Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/RoseMayAesthetics.png'),
  },
  {
    id: 'fillerbyjess',
    name: 'Filler by Jess',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/fillerbyjess.png'),
  },
  {
    id: 'eyebrowdeluxe',
    name: 'Eyebrow Deluxe',
    service: 'BROWS',
    logo: require('../../assets/logos/eyebrowdeluxe.png'),
  },
  {
    id: 'lashesgalore',
    name: 'Lashes Galore',
    service: 'LASHES',
    logo: require('../../assets/logos/lashesgalore.png'),
  },
  {
    id: 'zeenail-artist',
    name: 'Zee Nail Artist',
    service: 'NAILS',
    logo: require('../../assets/logos/ZeeNail Artist.png'),
  },
  {
    id: 'painted-by-zoe',
    name: 'Painted by Zoe',
    service: 'MUA',
    logo: require('../../assets/logos/paintedbyZoe.png'),
  },
  {
    id: 'braided-slick',
    name: 'Braided Slick',
    service: 'HAIR',
    logo: require('../../assets/logos/braided slick.png'),
  },
  {
    id: 'lash-bae',
    name: 'Lash Bae',
    service: 'LASHES',
    logo: require('../../assets/logos/LashBae.png'),
  },
  {
    id: 'gents-grooming',
    name: 'Gents Grooming',
    service: 'MALE',
    logo: require('../../assets/logos/hairbyjennifer.png'),
  },
  {
    id: 'little-stars-salon',
    name: 'Little Stars Salon',
    service: 'KIDS',
    logo: require('../../assets/logos/styledbykathrine.png'),
  },
  {
    id: 'kids-beauty-zone',
    name: 'Kids Beauty Zone',
    service: 'KIDS',
    logo: require('../../assets/logos/yourlashed.png'),
  },
];

const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, style, blurStyle }) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.7}>
      <BlurView intensity={40} tint={theme.blurTint} style={blurStyle}>
        {provider.logo ? (
          <Image
            source={provider.logo}
            style={styles.providerImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <View style={styles.placeholderCard}>
            <Text style={[styles.placeholderText, { color: theme.text }]}>Coming Soon</Text>
          </View>
        )}
      </BlurView>
    </TouchableOpacity>
  );
});

const ServiceButton = memo<ServiceButtonProps>(({ service, isSelected, onPress, onBack, showBackArrow }) => {
  const { theme, isDarkMode } = useTheme();

  return (
    <TouchableOpacity style={styles.serviceButton} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.glassCard,
        {
          backgroundColor: isSelected
            ? (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.35)')
            : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.15)'),
          borderTopColor: isSelected
            ? (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.9)')
            : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
          borderLeftColor: isSelected
            ? (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)')
            : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.5)')
        }
      ]}>
        <Text style={[styles.serviceText, { color: theme.text }]}>{service}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme, isDarkMode } = useTheme();
  const { bookings } = useBooking();
  const { bookmarkedIds, loadBookmarks } = useBookmarkStore();
  const insets = useSafeAreaInsets();

  // Ref for main ScrollView to control scrolling
  const scrollViewRef = useRef<ScrollView>(null);

  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showHairTypeSelector, setShowHairTypeSelector] = useState(false);
  const [selectedHairType, setSelectedHairType] = useState<any>(null);
  const [viewAllRecommended, setViewAllRecommended] = useState(false);
  const [viewAllProviders, setViewAllProviders] = useState(false);
  const [viewAllServices, setViewAllServices] = useState(false);
  const [viewAllMaleServices, setViewAllMaleServices] = useState(false);
  const [viewAllKidsServices, setViewAllKidsServices] = useState(false);
  const [selectedOfferTab, setSelectedOfferTab] = useState<string>('ALL');
  const [unreadCount, setUnreadCount] = useState(0);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    sortBy: 'recommended',
    availability: 'any',
    serviceType: 'all',
  });

  // Sample offers data with service categories
  const allOffers: Offer[] = useMemo(() => [
    {
      id: 'offer-1',
      title: '20% OFF First Visit',
      description: 'New clients only - All services',
      discount: '20%',
      validUntil: '2026-02-28',
      providerName: 'Diva Nails',
      logo: require('../../assets/logos/divanails.png'),
      service: 'NAILS',
    },
    {
      id: 'offer-2',
      title: 'Free Brow Shaping',
      description: 'With any facial treatment',
      discount: 'FREE',
      validUntil: '2026-02-15',
      providerName: 'Her Brows',
      logo: require('../../assets/logos/herbrows.png'),
      service: 'BROWS',
    },
    {
      id: 'offer-3',
      title: 'Valentine\'s Special',
      description: 'Couples package discount',
      discount: '30%',
      validUntil: '2026-02-14',
      providerName: 'Jana Aesthetics',
      logo: require('../../assets/logos/janaaesthetics.png'),
      service: 'AESTHETICS',
    },
    {
      id: 'offer-4',
      title: 'Blowout Bundle',
      description: 'Book 3 blowouts, get 1 free',
      discount: 'BUY 3 GET 1',
      validUntil: '2026-03-15',
      providerName: 'Hair by Jennifer',
      logo: require('../../assets/logos/hairbyjennifer.png'),
      service: 'HAIR',
    },
    {
      id: 'offer-5',
      title: 'Lash Extension Special',
      description: 'Full set with free fill',
      discount: '25%',
      validUntil: '2026-02-20',
      providerName: 'Your Lashed',
      logo: require('../../assets/logos/yourlashed.png'),
      service: 'LASHES',
    },
    {
      id: 'offer-6',
      title: 'Gel Manicure Deal',
      description: 'Includes nail art & design',
      discount: '15%',
      validUntil: '2026-03-01',
      providerName: 'Kiki Nails',
      logo: require('../../assets/logos/kikisnails.png'),
      service: 'NAILS',
    },
    {
      id: 'offer-7',
      title: 'Bridal Makeup Package',
      description: 'Trial + wedding day',
      discount: '20%',
      validUntil: '2026-04-30',
      providerName: 'Makeup by Mya',
      logo: require('../../assets/logos/makeupbymya.png'),
      service: 'MUA',
    },
    {
      id: 'offer-8',
      title: 'Men\'s Grooming Package',
      description: 'Haircut + Beard Trim',
      discount: '25%',
      validUntil: '2026-03-31',
      providerName: 'Gents Grooming',
      logo: require('../../assets/logos/hairbyjennifer.png'),
      service: 'MALE',
    },
    {
      id: 'offer-10',
      title: 'Kids First Haircut',
      description: 'Certificate & photo included',
      discount: '20%',
      validUntil: '2026-04-15',
      providerName: 'Little Stars Salon',
      logo: require('../../assets/logos/styledbykathrine.png'),
      service: 'KIDS',
    },
    {
      id: 'offer-11',
      title: 'Kids Party Package',
      description: 'Makeup & nails for 5 kids',
      discount: '30%',
      validUntil: '2026-05-01',
      providerName: 'Kids Beauty Zone',
      logo: require('../../assets/logos/yourlashed.png'),
      service: 'KIDS',
    },
  ], []);

  // Filter offers by selected tab
  const filteredOffers = useMemo(() => {
    if (selectedOfferTab === 'ALL') return allOffers;
    return allOffers.filter(offer => offer.service === selectedOfferTab);
  }, [allOffers, selectedOfferTab]);

  const currentOffers = useMemo(() => allOffers.slice(0, 3), [allOffers]);

  // Get previously booked providers from bookings
  const previouslyBookedProviders = useMemo(() => {
    const uniqueProviders = new Map<string, Provider>();

    bookings.forEach(booking => {
      const provider = sampleProviders.find(p => p.name === booking.providerName);
      if (provider && !uniqueProviders.has(provider.id)) {
        uniqueProviders.set(provider.id, provider);
      }
    });

    return Array.from(uniqueProviders.values());
  }, [bookings]);

  // Load unread notification count
  const loadUnreadCount = useCallback(async () => {
    try {
      const notifications = await NotificationService.getAllNotifications();
      const unread = notifications.filter(n => !n.read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }, []);

  // Refresh count when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadUnreadCount();
    }, [loadUnreadCount])
  );

  const services = useMemo(() => ['HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS'], []);

  // Personalized providers data using user learning - each section gets different providers
  const [providersData, setProvidersData] = useState({
    yourProviders: sampleProviders.slice(0, 4), // Diva Nails, Jana Aesthetics, Her Brows, Kiki Nails
    recommended: [
      // Varied recommendations across different services
      sampleProviders.find(p => p.id === 'makeup-by-mya')!, // MUA
      sampleProviders.find(p => p.id === 'diva-nails')!, // NAILS
      sampleProviders.find(p => p.id === 'your-lashed')!, // LASHES
      sampleProviders.find(p => p.id === 'hair-by-jennifer')!, // HAIR
      sampleProviders.find(p => p.id === 'jana-aesthetics')!, // AESTHETICS
      sampleProviders.find(p => p.id === 'lash-bae')!, // LASHES
    ].filter(Boolean), // Filter out any undefined
    hairProviders: sampleProviders.filter(p => p.service === 'HAIR'),
    nailProviders: sampleProviders.filter(p => p.service === 'NAILS'),
    lashProviders: sampleProviders.filter(p => p.service === 'LASHES'),
    muaProviders: sampleProviders.filter(p => p.service === 'MUA'),
    browProviders: sampleProviders.filter(p => p.service === 'BROWS'),
    aestheticsProviders: sampleProviders.filter(p => p.service === 'AESTHETICS'),
    // Male providers: Zee Nails has a male services tab
    maleProviders: [
      ...sampleProviders.filter(p => p.service === 'MALE'),
      sampleProviders.find(p => p.id === 'zeenail-artist')!,
    ].filter(Boolean),
    // Kids providers: Braided Slick has a kids services tab
    kidsProviders: [
      ...sampleProviders.filter(p => p.service === 'KIDS'),
      sampleProviders.find(p => p.id === 'braided-slick')!,
    ].filter(Boolean),
  });

  // Load bookmarks from storage on mount only
  useEffect(() => {
    loadBookmarks();
    userLearningService.initialize().catch(error => {
      console.error('Failed to initialize learning service:', error);
      // Silent failure — degrades gracefully to default recommendations
    });
  }, []); // Only run once on mount

  // Update provider data whenever bookmarkedIds changes (reactive to bookmark changes)
  useEffect(() => {
    const updateProviderData = async () => {
      try {
        // Get bookmarked providers from store
        const bookmarkedProviders = sampleProviders.filter(p => bookmarkedIds.includes(p.id));

        // Get personalized recommendations
        const personalizedRecommended = await userLearningService.getPersonalizedProviders(
          sampleProviders,
          3
        );

        // Ensure each section has different providers
        const yourProviderIds = new Set(bookmarkedProviders.map(p => p.id));
        const recommendedFiltered = personalizedRecommended.filter(p => !yourProviderIds.has(p.id));

        // Default recommended providers: Varied across different services
        const defaultRecommended = [
          sampleProviders.find(p => p.id === 'makeup-by-mya')!, // MUA
          sampleProviders.find(p => p.id === 'diva-nails')!, // NAILS
          sampleProviders.find(p => p.id === 'your-lashed')!, // LASHES
          sampleProviders.find(p => p.id === 'hair-by-jennifer')!, // HAIR
          sampleProviders.find(p => p.id === 'jana-aesthetics')!, // AESTHETICS
          sampleProviders.find(p => p.id === 'lash-bae')!, // LASHES
        ].filter(p => p && !yourProviderIds.has(p.id));

        setProvidersData({
          yourProviders: bookmarkedProviders.length > 0 ? bookmarkedProviders : [],
          recommended: recommendedFiltered.length > 0 ? recommendedFiltered : defaultRecommended,
          hairProviders: sampleProviders.filter(p => p.service === 'HAIR'),
          nailProviders: sampleProviders.filter(p => p.service === 'NAILS'),
          lashProviders: sampleProviders.filter(p => p.service === 'LASHES'),
          muaProviders: sampleProviders.filter(p => p.service === 'MUA'),
          browProviders: sampleProviders.filter(p => p.service === 'BROWS'),
          aestheticsProviders: sampleProviders.filter(p => p.service === 'AESTHETICS'),
          // Male providers: Zee Nails has a male services tab
          maleProviders: [
            ...sampleProviders.filter(p => p.service === 'MALE'),
            sampleProviders.find(p => p.id === 'zeenail-artist')!,
          ].filter(Boolean),
          // Kids providers: Braided Slick has a kids services tab
          kidsProviders: [
            ...sampleProviders.filter(p => p.service === 'KIDS'),
            sampleProviders.find(p => p.id === 'braided-slick')!,
          ].filter(Boolean),
        });
      } catch (error) {
        console.error('Failed to update provider data:', error);
        // Silent failure — providers fall back to defaults already set
      }
    };

    updateProviderData();
  }, [bookmarkedIds]); // React to bookmark changes - but loadBookmarks() is NOT called here

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
      // When expanded, show 10 providers from all categories
      return providersData.recommended
        .concat(providersData.hairProviders)
        .concat(providersData.nailProviders)
        .concat(providersData.lashProviders)
        .concat(providersData.muaProviders)
        .concat(providersData.browProviders)
        .concat(providersData.aestheticsProviders)
        .slice(0, 10);
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
        providers = sampleProviders;
    }

    while (providers.length < 12) {
      providers.push({
        id: `placeholder-${providers.length}`,
        logo: null,
        name: 'COMING SOON',
        service: selectedService,
      });
    }

    return {
      left: providers.slice(0, 6),
      right: providers.slice(6, 12),
    };
  }, [selectedService, providersData]);

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
      if (!provider.logo) return;

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

      if (__DEV__) console.log('=== NAVIGATION DEBUG ===');
      if (__DEV__) console.log('Provider name:', provider.name);
      if (__DEV__) console.log('Provider ID (Uber-style):', provider.id);
      if (__DEV__) console.log('Navigation target: ProviderProfile');
      if (__DEV__) console.log('========================');

      navigation.navigate('ProviderProfile', {
        providerId: provider.id,
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

  const [offersModalVisible, setOffersModalVisible] = useState(false);

  const toggleViewAllOffers = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOffersModalVisible(prev => !prev);
    if (!offersModalVisible) {
      setSelectedOfferTab('ALL');
    }
  }, [offersModalVisible]);

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

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemedBackground style={styles.background}>
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
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.welcomeSection}>
              <Text style={[styles.welcomeText, { color: theme.accent }]}>WELCOME TO</Text>
              <Text style={[styles.brandText, { color: theme.text }]}>CERVICED</Text>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={navigateToSearch}
                activeOpacity={0.7}
              >
                <SearchIcon size={22} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={navigateToNotifications}
                activeOpacity={0.7}
              >
                <BellIcon size={22} color={theme.text} />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bookingsButton}
                onPress={navigateToBookings}
                activeOpacity={0.7}
              >
                <Text style={styles.bookingsButtonText}>Bookings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Your Providers Section - Only show if there are bookmarked providers */}
        {!selectedService && providersData.yourProviders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>YOUR PROVIDERS</Text>
              <TouchableOpacity onPress={navigateToBookmarks}>
                <Text style={[styles.viewAll, { color: theme.text }]}>VIEW ALL {'>'}</Text>
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
                  <BlurView intensity={35} tint={theme.blurTint} style={styles.backButtonSmallBlur}>
                    <Text style={[styles.backButtonSmallText, { color: theme.text }]}>←</Text>
                  </BlurView>
                </TouchableOpacity>
              ) : null}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                CHOOSE YOUR SERVICE
              </Text>
            </View>
            {!selectedService && (
              <TouchableOpacity onPress={toggleViewAllServices}>
                <Text style={[styles.viewAll, { color: theme.text }]}>
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
                    <View style={styles.hairTypeBadge}>
                      <Text style={[styles.hairTypeBadgeText, { color: theme.text }]}>
                        {selectedHairType.name}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.filterButtonActive}
                    onPress={toggleFilters}
                    activeOpacity={0.7}
                  >
                    <View style={styles.filterButtonBlur}>
                      <Text style={[styles.filterButtonText, { color: theme.text }]}>
                        FILTERS {filtersExpanded ? '▲' : '▼'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Collapsible Filter Section */}
                {filtersExpanded && (
                  <View style={styles.filterDropdown}>
                    <BlurView intensity={40} tint={theme.blurTint} style={[styles.filterDropdownBlur, { backgroundColor: theme.cardBackground }]}>
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {/* Header with Reset */}
                        <View style={styles.filterDropdownHeader}>
                          <Text style={[styles.filterDropdownTitle, { color: theme.text }]}>FILTER OPTIONS</Text>
                          <TouchableOpacity onPress={resetFilters}>
                            <Text style={styles.resetText}>RESET</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Hair Type Selector for HAIR service */}
                        {selectedService === 'HAIR' && (
                          <View style={styles.filterSection}>
                            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>HAIR TYPE</Text>
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>SORT BY</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('sortBy', sort)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>PRICE RANGE</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('priceRange', range.value)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>MINIMUM RATING</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('rating', rating.value)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>DISTANCE</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('distance', distance.value)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>AVAILABILITY</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('availability', avail.value)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>SERVICE TYPE</Text>
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
                                      backgroundColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                                        : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                                      borderTopColor: isActive
                                        ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                                        : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
                                    }
                                  ]}
                                  onPress={() => updateFilter('serviceType', type.value)}
                                >
                                  <Text
                                    style={[
                                      styles.filterChipText,
                                      {
                                        color: isActive ? theme.accent : theme.text,
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
                    </BlurView>
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
                    <BlurView intensity={40} tint={theme.blurTint} style={styles.quadrantCardBlur}>
                      <Text style={[styles.quadrantServiceName, { color: theme.text }]}>
                        {service}
                      </Text>
                    </BlurView>
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
            {/* Book Again Section - Only show if user has previous bookings */}
            {previouslyBookedProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>BOOK AGAIN</Text>
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
                      <BlurView intensity={40} tint={theme.blurTint} style={styles.roundCardBlur}>
                        {provider.logo && (
                          <Image
                            source={provider.logo}
                            style={styles.roundCardImage}
                            resizeMode="cover"
                          />
                        )}
                      </BlurView>
                      <Text style={[styles.roundCardName, { color: theme.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Recommended Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>RECOMMENDED FOR YOU</Text>
                <TouchableOpacity
                  onPress={toggleViewAllRecommended}
                  style={styles.viewAllButton}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAll, { color: theme.text }]}>
                    {viewAllRecommended ? 'VIEW LESS <' : 'VIEW ALL >'}
                  </Text>
                </TouchableOpacity>
              </View>

              {viewAllRecommended ? (
                <View style={styles.expandedGrid}>
                  {recommendedProvidersList.map((provider, index) => (
                    <View key={`recommended-expanded-${index}-${provider.id}`} style={styles.gridItem}>
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
                  {recommendedProvidersList.map((provider, index) => (
                    <ProviderCard
                      key={`recommended-${index}-${provider.id}`}
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
                <Text style={[styles.sectionTitle, { color: theme.text }]}>PROVIDER OF THE WEEK</Text>
                <TouchableOpacity
                  onPress={toggleViewAllProviders}
                  style={styles.viewAllButton}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAll, { color: theme.text }]}>
                    {viewAllProviders ? 'VIEW LESS <' : 'VIEW ALL >'}
                  </Text>
                </TouchableOpacity>
              </View>

              {viewAllProviders ? (
                <View>
                  {Object.entries(allCategorizedProviders).map(([category, providers]) => {
                    if (!providers || providers.length === 0) return null;

                    return (
                      <View key={category} style={styles.categorySection}>
                        <Text style={[styles.categoryLabel, { color: theme.text }]}>{category}</Text>
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
                      <Text style={[styles.categoryLabel, { color: theme.text }]}>HAIR</Text>
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
                      <Text style={[styles.categoryLabel, { color: theme.text }]}>NAILS</Text>
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

            {/* Male Services Section */}
            {providersData.maleProviders && providersData.maleProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>MALE SERVICES</Text>
                  <TouchableOpacity
                    onPress={toggleViewAllMaleServices}
                    style={styles.viewAllButton}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.viewAll, { color: theme.text }]}>
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
                <Text style={[styles.sectionTitle, { color: theme.text }]}>NEAR ME</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                nestedScrollEnabled={true}
              >
                {sampleProviders.slice(0, 10).map(provider => (
                  <TouchableOpacity
                    key={`near-${provider.id}`}
                    style={styles.roundCard}
                    onPress={() => navigateToProvider(provider)}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={40} tint={theme.blurTint} style={styles.roundCardBlur}>
                      {provider.logo && (
                        <Image
                          source={provider.logo}
                          style={styles.roundCardImage}
                          resizeMode="cover"
                        />
                      )}
                    </BlurView>
                    <Text style={[styles.roundCardName, { color: theme.text }]} numberOfLines={1}>
                      {provider.name}
                    </Text>
                    <Text style={[styles.distanceBadge, { color: theme.text }]}>
                      {(Math.random() * 5 + 0.5).toFixed(1)} mi
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Kids Services Section */}
            {providersData.kidsProviders && providersData.kidsProviders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>KIDS SERVICES</Text>
                  <TouchableOpacity
                    onPress={toggleViewAllKidsServices}
                    style={styles.viewAllButton}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.viewAll, { color: theme.text }]}>
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

            {/* Current Offers Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>CURRENT OFFERS</Text>
                <TouchableOpacity onPress={toggleViewAllOffers}>
                  <Text style={[styles.viewAll, { color: theme.text }]}>VIEW ALL {'>'}</Text>
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
                  >
                    <BlurView intensity={40} tint={theme.blurTint} style={styles.offerCardBlur}>
                      <View style={styles.offerDiscountBadge}>
                        <Text style={styles.offerDiscountText}>{offer.discount}</Text>
                      </View>
                      <Image source={offer.logo} style={styles.offerLogo} resizeMode="cover" />
                      <View style={styles.offerContent}>
                        <Text style={[styles.offerTitle, { color: theme.text }]} numberOfLines={2}>
                          {offer.title}
                        </Text>
                        <Text style={[styles.offerDescription, { color: theme.text }]} numberOfLines={2}>
                          {offer.description}
                        </Text>
                        <Text style={[styles.offerValidText, { color: theme.text }]} numberOfLines={1}>
                          Exp {new Date(offer.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Offers Modal Popup */}
      <Modal
        visible={offersModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={toggleViewAllOffers}
      >
        <ThemedBackground style={styles.modalBackground}>
          <StatusBar barStyle={theme.statusBar} />
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>ALL OFFERS</Text>
              <TouchableOpacity onPress={toggleViewAllOffers} style={styles.modalCloseButton}>
                <Text style={[styles.modalCloseText, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Service Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.modalTabsScroll}
              contentContainerStyle={styles.modalTabsContent}
            >
              {['ALL', 'HAIR', 'NAILS', 'LASHES', 'MUA', 'BROWS', 'AESTHETICS', 'MALE', 'KIDS'].map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.modalTab,
                    selectedOfferTab === tab && styles.modalTabActive
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedOfferTab(tab);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.modalTabText,
                    { color: selectedOfferTab === tab ? theme.accent : theme.text }
                  ]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Offers Grid */}
            <ScrollView
              style={styles.modalOffersScroll}
              contentContainerStyle={styles.modalOffersContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalOffersGrid}>
                {filteredOffers.map(offer => (
                  <TouchableOpacity
                    key={offer.id}
                    style={styles.modalOfferCard}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={40} tint={theme.blurTint} style={styles.modalOfferCardBlur}>
                      <View style={styles.modalOfferDiscountBadge}>
                        <Text style={styles.offerDiscountText}>{offer.discount}</Text>
                      </View>
                      <Image source={offer.logo} style={styles.modalOfferLogo} resizeMode="cover" />
                      <View style={styles.modalOfferContent}>
                        <Text style={[styles.modalOfferTitle, { color: theme.text }]} numberOfLines={2}>
                          {offer.title}
                        </Text>
                        <Text style={[styles.modalOfferDescription, { color: theme.text }]} numberOfLines={2}>
                          {offer.description}
                        </Text>
                        <Text style={[styles.modalOfferValidText, { color: theme.text }]} numberOfLines={1}>
                          Exp {new Date(offer.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </ThemedBackground>
      </Modal>
    </ThemedBackground>
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
    paddingTop: 80, // 8px × 10
    paddingBottom: 32, // 8px × 4
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16, // 8px × 2
  },
  welcomeSection: {
    flex: 1,
  },
  welcomeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: '#DA70D6',
    letterSpacing: 1.5,
  },
  brandText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 30,
    letterSpacing: 2,
    marginTop: -2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF1744',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bookingsButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(218,112,214,0.2)',
    borderRadius: 25,
  },
  bookingsButtonText: {
    fontSize: 12,
    fontFamily: 'BakbakOne-Regular',
    color: '#DA70D6',
  },
  section: {
    marginBottom: 16, // 8px × 2 (reduced from 24)
    paddingBottom: 16, // 8px × 2 (reduced from 24)
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
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
    backgroundColor: 'rgba(218, 112, 214, 0.2)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    height: 120,
    overflow: 'hidden',
  },
  serviceButton: {
    marginRight: 10,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Platform.OS === 'android' ? 20 : 24,
    height: Platform.OS === 'android' ? 28 : 32,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  filterButtonText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  filteredProvidersSection: {
    flex: 1,
    marginTop: 10,
    minHeight: 500,
  },
  brandCard: {
    marginRight: 16, // 8px × 2
    width: 176, // 8px × 22
  },
  brandCardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    width: 176, // 8px × 22
    height: 64, // 8px × 8
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    opacity: 0.5,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    width: 282,
    height: 147,
    position: 'relative',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
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
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: '#DA70D6',
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
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 100,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(218, 112, 214, 0.3)',
    borderTopColor: 'rgba(163, 66, 195, 0.7)',
    borderLeftColor: 'rgba(163, 66, 195, 0.6)',
    borderRightColor: 'rgba(163, 66, 195, 0.3)',
    borderBottomColor: 'rgba(163, 66, 195, 0.3)',
  },
  filterChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#a342c3',
    fontWeight: '700',
  },
  ViewAllButton: {
    backgroundColor: '#DA70D6',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllButtonText: {
    color: '#fff',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: '900',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  roundCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  roundCardName: {
    fontFamily: 'Jura-VariableFont_wght',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 16,
  },
  offerDiscountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#000',
  },
  offerDiscountText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#000',
    fontWeight: 'bold',
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
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 20,
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
    color: '#DA70D6',
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
    color: '#DA70D6',
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
  // Modal styles
  modalSafeArea: {
    flex: 1,
  },
  modalBackground: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 24,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalCloseText: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalTabsScroll: {
    maxHeight: 59,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTabsContent: {
    paddingHorizontal: 16,
  },
  modalTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalTabActive: {
    backgroundColor: 'rgba(218, 112, 214, 0.25)',
    borderTopColor: 'rgba(229, 128, 232, 0.8)',
    borderLeftColor: 'rgba(229, 128, 232, 0.7)',
    borderRightColor: 'rgba(163, 66, 195, 0.3)',
    borderBottomColor: 'rgba(163, 66, 195, 0.3)',
    shadowColor: '#DA70D6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  modalTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: '500',
  },
  modalOffersScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  modalOffersContent: {
    paddingVertical: 16,
  },
  modalOffersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  modalOfferCard: {
    width: '48%',
    marginBottom: 16,
  },
  modalOfferCardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    borderWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  modalOfferLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 10,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  modalOfferContent: {
    flex: 1,
  },
  modalOfferTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalOfferDescription: {
    fontFamily: 'Jura-Regular',
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
    marginBottom: 6,
  },
  modalOfferValidText: {
    fontFamily: 'Jura-Regular',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.6,
  },
  modalOfferDiscountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 2.5,
    borderTopColor: '#000',
    borderLeftColor: '#000',
    borderRightColor: '#333',
    borderBottomColor: '#333',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
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
