import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { useFocusEffect } from '@react-navigation/native';

// NAVIGATION IMPORTS - CORRECTED PATH
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/types';

// Import your icons from IconLibrary
import Icon, { BellIcon, SearchIcon } from '../components/IconLibrary';
import { NotificationService } from '../services/notificationService';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

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
}

// UBER-STYLE SLUGIFIED IDs: business names converted to URL-safe slugs
const sampleProviders: Provider[] = [
  {
    id: 'diva-nails', // Uber-style: "Diva Nails" → "diva-nails"
    name: 'Diva Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/divanails.png'),
  },
  {
    id: 'jana-aesthetics', // "Jana Aesthetics" → "jana-aesthetics"
    name: 'Jana Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/janaaesthetics.png'),
  },
  {
    id: 'her-brows', // "Her Brows" → "her-brows"
    name: 'Her Brows',
    service: 'BROWS',
    logo: require('../../assets/logos/herbrows.png'),
  },
  {
    id: 'kiki-nails', // "Kiki Nails" → "kiki-nails"
    name: 'Kiki Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/kikisnails.png'),
  },
  {
    id: 'makeup-by-mya', // "Makeup by Mya" → "makeup-by-mya"
    name: 'Makeup by Mya',
    service: 'MUA',
    logo: require('../../assets/logos/makeupbymya.png'),
  },
  {
    id: 'hair-by-jennifer', // "Hair by Jennifer" → "hair-by-jennifer"
    name: 'Hair by Jennifer',
    service: 'HAIR',
    logo: require('../../assets/logos/hairbyjennifer.png'),
  },
  {
    id: 'styled-by-kathrine', // "Styled by Kathrine" → "styled-by-kathrine"
    name: 'Styled by Kathrine',
    service: 'HAIR',
    logo: require('../../assets/logos/styledbykathrine.png'),
  },
  {
    id: 'vikki-laid', // "Vikki Laid" → "vikki-laid"
    name: 'Vikki Laid',
    service: 'HAIR',
    logo: require('../../assets/logos/vikkilaid.png'),
  },
  {
    id: 'your-lashed', // "Your Lashed" → "your-lashed"
    name: 'Your Lashed',
    service: 'LASHES',
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

const ServiceButton = memo<ServiceButtonProps>(({ service, isSelected, onPress }) => {
  const { theme, isDarkMode } = useTheme();

  return (
    <TouchableOpacity style={styles.serviceButton} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.glassCard,
        {
          backgroundColor: isSelected
            ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(255, 255, 255, 0.35)')
            : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.15)'),
          borderTopColor: isSelected
            ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(255, 255, 255, 0.9)')
            : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
          borderLeftColor: isSelected
            ? (isDarkMode ? 'rgba(229, 128, 232, 0.5)' : 'rgba(255, 255, 255, 0.7)')
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

  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [viewAllRecommended, setViewAllRecommended] = useState(false);
  const [viewAllProviders, setViewAllProviders] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    sortBy: 'recommended',
    availability: 'any',
  });

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

  const providersData = useMemo(() => {
    const hairProviders = sampleProviders.filter(p => p.service === 'HAIR');
    const nailProviders = sampleProviders.filter(p => p.service === 'NAILS');
    const lashProviders = sampleProviders.filter(p => p.service === 'LASHES');
    const muaProviders = sampleProviders.filter(p => p.service === 'MUA');
    const browProviders = sampleProviders.filter(p => p.service === 'BROWS');
    const aestheticsProviders = sampleProviders.filter(p => p.service === 'AESTHETICS');

    return {
      yourProviders: sampleProviders.slice(0, 4),
      recommended: sampleProviders.slice(0, 3),
      hairProviders,
      nailProviders,
      lashProviders,
      muaProviders,
      browProviders,
      aestheticsProviders,
    };
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

  const handleServicePress = useCallback((service: string) => {
    setSelectedService(service);
  }, []);

  const navigateToProvider = useCallback(
    (provider: Provider) => {
      if (!provider.logo) return;
      console.log('=== NAVIGATION DEBUG ===');
      console.log('Provider name:', provider.name);
      console.log('Provider ID (Uber-style):', provider.id);
      console.log('Navigation target: ProviderProfile');
      console.log('========================');

      navigation.navigate('ProviderProfile', {
        providerId: provider.id,
        source: 'home',
      });
    },
    [navigation]
  );

  const navigateToSearch = useCallback(() => {
    // @ts-ignore - navigation options for instant transition
    navigation.navigate('Search', {}, { animation: 'none' });
  }, [navigation]);

  const navigateToNotifications = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  const navigateToBookings = useCallback(() => {
    navigation.navigate('Bookings');
  }, [navigation]);

  // In HomeScreen.tsx
  const navigateToBookmarks = useCallback(() => {
    navigation.navigate('BookmarkedProviders'); // This will work now
  }, [navigation]);

  const toggleViewAllRecommended = useCallback(() => {
    setViewAllRecommended(prev => !prev);
  }, []);

  const toggleViewAllProviders = useCallback(() => {
    setViewAllProviders(prev => !prev);
  }, []);

  const toggleFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersExpanded(prev => !prev);
  }, []);

  const updateFilter = useCallback((key: keyof FilterOptions, value: any) => {
    setActiveFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
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
                <BlurView intensity={40} tint={theme.blurTint} style={styles.bookingsButtonBlur}>
                  <Text style={styles.bookingsButtonText}>Bookings</Text>
                </BlurView>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Your Providers Section */}
        {!selectedService && (
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
              {providersData.yourProviders.map(provider => (
                <ProviderCard
                  key={provider.id}
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
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>CHOOSE YOUR SERVICE</Text>
            {!selectedService && (
              <TouchableOpacity>
                <Text style={[styles.viewAll, { color: theme.text }]}>VIEW ALL {'>'}</Text>
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
                    onPress={() => setSelectedService(null)}
                  />

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
                      </ScrollView>
                    </BlurView>
                  </View>
                )}
              </>
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
                  {providersData.recommended
                    .concat(providersData.hairProviders)
                    .slice(0, 6)
                    .map((provider, index) => (
                      <View key={provider.id} style={styles.gridItem}>
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
                  {providersData.recommended.map(provider => (
                    <ProviderCard
                      key={provider.id}
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
                              key={provider.id}
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
                        {providersData.hairProviders.slice(0, 3).map(provider => (
                          <ProviderCard
                            key={provider.id}
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
                        {providersData.nailProviders.slice(0, 3).map(provider => (
                          <ProviderCard
                            key={provider.id}
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
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  scrollContentExpanded: {
    flexGrow: 1,
    paddingBottom: 150,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 80,
    paddingBottom: 30,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
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
    borderRadius: 18,
    overflow: 'hidden',
    minWidth: 80,
    height: 36,
  },
  bookingsButtonBlur: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(218, 112, 214, 0.1)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(218, 112, 214, 0.3)',
    borderBottomColor: 'rgba(218, 112, 214, 0.3)',
  },
  bookingsButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: '#DA70D6',
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
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
    borderRadius: 20,
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
    borderRadius: 15,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    width: 110,
    height: 29,
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
    marginRight: 15,
    width: 178,
  },
  brandCardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    width: 178,
    height: 60,
    overflow: 'hidden',
  },
  providerImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 18,
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
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(218, 112, 214, 0.2)',
    borderTopColor: 'rgba(163, 66, 195, 0.6)',
    borderLeftColor: 'rgba(163, 66, 195, 0.5)',
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
});
