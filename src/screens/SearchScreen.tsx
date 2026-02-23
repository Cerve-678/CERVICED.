// SearchScreen.tsx - Uber-style Provider Discovery Interface with Search Header
import React, { useState, useCallback, useMemo, memo, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  RefreshControl,
  Animated,
  ImageSourcePropType,
  ListRenderItem,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { useFonts } from 'expo-font';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ExploreStackParamList } from '../navigation/types';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { sampleProviders } from '../services/ProviderDataService';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

// Types
interface ProviderCardData {
  id: string;
  name: string;
  service: string;
  logo: ImageSourcePropType;
  isAvailable: boolean;
  distance: string;
  rating: number;
  reviewCount: number;
  estimatedWait: string;
  priceRange: string;
  specialties: string[];
  availability: 'Slots Available' | 'Slots Limited' | 'No Slots';
  location: string;
  totalSlots: number;
  bookedSlots: number;
}

interface ProviderCardProps {
  provider: ProviderCardData;
  onPress: () => void;
  onBookNow: () => void;
  index: number;
}

type Props = NativeStackScreenProps<ExploreStackParamList, 'Search'>;

// Provider Card Component
const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, onBookNow, index }) => {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getAvailabilityColor = () => {
    if (provider.availability === 'Slots Available') {
      return '#4CAF50';
    } else if (provider.availability === 'Slots Limited') {
      return '#FF9500';
    } else if (provider.availability === 'No Slots') {
      return '#FF3B30';
    }
    return '#999999';
  };

  return (
    <Animated.View
      style={[
        styles.providerCard,
        { backgroundColor: theme.cardBackground },
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <TouchableOpacity
        style={styles.cardTouchable}
        onPress={onPress}
        activeOpacity={0.95}
      >
        <View style={styles.cardContent}>
          {/* Provider Image */}
          <View style={styles.providerImageContainer}>
            <Image
              source={provider.logo}
              style={styles.providerImage}
              resizeMode="cover"
            />
            {/* Availability Indicator */}
            <View style={[styles.availabilityDot, { backgroundColor: getAvailabilityColor() }]} />
          </View>

          {/* Provider Info */}
          <View style={styles.providerInfo}>
            <View style={styles.providerHeader}>
              <Text style={[styles.providerName, { color: theme.text }]} numberOfLines={1}>
                {provider.name}
              </Text>
              <View style={styles.ratingContainer}>
                <TabIcon name="star" size={14} color="#FFD700" />
                <Text style={[styles.ratingText, { color: theme.text }]}>{provider.rating}</Text>
                <Text style={[styles.reviewCount, { color: theme.secondaryText }]}>({provider.reviewCount})</Text>
              </View>
            </View>

            {/* Service Category Pill */}
            <View style={styles.servicePillContainer}>
              <View style={styles.servicePill}>
                <Text style={styles.servicePillText}>{provider.service}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <TabIcon name="earth" size={12} color={theme.secondaryText} />
                <Text style={[styles.metaText, { color: theme.secondaryText }]}>{provider.distance}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaItem}>
                <TabIcon name="bell" size={12} color={theme.secondaryText} />
                <Text style={[styles.metaText, { color: theme.secondaryText }]}>{provider.estimatedWait}</Text>
              </View>
              <View style={styles.metaDivider} />
              <Text style={[styles.priceRange, { color: theme.secondaryText }]}>{provider.priceRange}</Text>
            </View>

            {/* Availability Status */}
            <View style={[styles.availabilityBadge, { backgroundColor: `${getAvailabilityColor()}15` }]}>
              <View style={[styles.availabilityBadgeDot, { backgroundColor: getAvailabilityColor() }]} />
              <Text style={[styles.availabilityText, { color: getAvailabilityColor() }]}>
                {provider.availability}
              </Text>
            </View>

            {/* Specialties */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.specialtiesContainer}
            >
              {provider.specialties.map((specialty, idx) => (
                <View key={idx} style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>{specialty}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Book Now Button */}
        <TouchableOpacity
          style={styles.bookNowButton}
          onPress={onBookNow}
          activeOpacity={0.8}
        >
          <View style={styles.bookNowGradient}>
            <Text style={styles.bookNowText}>Book Now</Text>
            <TabIcon name="basket-shopping" size={14} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});
ProviderCard.displayName = 'ProviderCard';

// Main SearchScreen Component
export default function SearchScreen({ navigation, route }: Props) {
  const { theme, isDarkMode } = useTheme();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [selectedSort, setSelectedSort] = useState<string>('Available Slots');
  const [selectedLocation, setSelectedLocation] = useState<string>('All Locations');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Memoize theme values to prevent re-renders
  const themeColors = useMemo(() => ({
    text: theme.text,
    secondaryText: theme.secondaryText,
    background: theme.background,
    cardBackground: theme.cardBackground,
    statusBar: theme.statusBar,
    blurTint: theme.blurTint,
  }), [theme.text, theme.secondaryText, theme.background, theme.cardBackground, theme.statusBar, theme.blurTint]);

  // Listen for search query from route params
  React.useEffect(() => {
    if (route?.params?.initialQuery) {
      setSearchQuery(route.params.initialQuery);
    }
  }, [route?.params?.initialQuery]);

  // Set up header options dynamically for dark mode - useLayoutEffect for instant updates
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTintColor: themeColors.text,
      headerStyle: {
        backgroundColor: 'transparent',
      },
      headerTitleStyle: {
        color: themeColors.text,
        fontSize: 17,
        fontWeight: '600',
        fontFamily: 'BakbakOne-Regular',
      },
      headerBlurEffect: themeColors.blurTint,
      headerLeft: () => null,
    });
  }, [navigation, themeColors.text, themeColors.blurTint]);

  const { addToCart } = useCart();

  // Calculate availability based on slots
  const calculateAvailability = (totalSlots: number, bookedSlots: number): 'Slots Available' | 'Slots Limited' | 'No Slots' => {
    const availableSlots = totalSlots - bookedSlots;
    const percentageAvailable = (availableSlots / totalSlots) * 100;

    if (percentageAvailable >= 50) {
      return 'Slots Available';
    } else if (percentageAvailable > 0) {
      return 'Slots Limited';
    } else {
      return 'No Slots';
    }
  };

  // Mock provider data with availability status
  const providerData = useMemo((): ProviderCardData[] => {
    const priceRanges = ['£25-£50', '£40-£75', '£50-£100', '£60-£120', '£75-£150'];
    return sampleProviders.map((provider, index) => {
      const totalSlots = provider.totalSlots || 20;
      const bookedSlots = provider.bookedSlots || 0;
      const availability = calculateAvailability(totalSlots, bookedSlots);

      return {
        id: provider.id,
        name: provider.name,
        service: provider.service,
        logo: provider.logo,
        location: provider.location || 'Central London',
        totalSlots,
        bookedSlots,
        isAvailable: availability !== 'No Slots',
        distance: `${(Math.random() * 5 + 0.5).toFixed(1)} mi`,
        rating: (Math.random() * 0.5 + 4.5).toFixed(1) as unknown as number,
        reviewCount: Math.floor(Math.random() * 500 + 50),
        estimatedWait: availability === 'Slots Available' ? '10-15 min' : availability === 'Slots Limited' ? '20-30 min' : '45+ min',
        priceRange: priceRanges[index % priceRanges.length] || '£50-£100',
        specialties: getSpecialtiesForService(provider.service),
        availability,
      } as ProviderCardData;
    });
  }, []);

  function getSpecialtiesForService(service: string): string[] {
    const specialtyMap: Record<string, string[]> = {
      'HAIR': ['Braids', 'Weaves', 'Wigs'],
      'NAILS': ['Acrylics', 'Gel', 'Nail Art'],
      'MUA': ['Bridal', 'Editorial', 'Glam'],
      'LASHES': ['Classic', 'Volume', 'Hybrid'],
      'BROWS': ['Microblading', 'Lamination', 'Tinting'],
      'AESTHETICS': ['Facials', 'Peels', 'Injectables'],
    };
    return specialtyMap[service] || ['Beauty', 'Style'];
  }

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = new Set(providerData.map(p => p.location));
    return ['All Locations', ...Array.from(locations).sort()];
  }, [providerData]);

  // Filter and sort logic
  const filteredProviders = useMemo(() => {
    let filtered = [...providerData];

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.service.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (selectedFilter !== 'All') {
      const filterMap: Record<string, string> = {
        'Hair': 'HAIR',
        'Nails': 'NAILS',
        'Makeup': 'MUA',
        'Aesthetics': 'AESTHETICS',
        'Brows': 'BROWS',
        'Lashes': 'LASHES',
      };
      const serviceFilter = filterMap[selectedFilter];
      filtered = filtered.filter(p => p.service === serviceFilter);
    }

    // Apply location filter
    if (selectedLocation !== 'All Locations') {
      filtered = filtered.filter(p => p.location === selectedLocation);
    }

    // Apply sorting
    if (selectedSort === 'Available Slots') {
      filtered.sort((a, b) => {
        const priorityOrder: Record<string, number> = { 'Slots Available': 0, 'Slots Limited': 1, 'No Slots': 2 };
        return (priorityOrder[a.availability] ?? 2) - (priorityOrder[b.availability] ?? 2);
      });
    } else if (selectedSort === 'Nearest') {
      filtered.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    } else if (selectedSort === 'Highest Rated') {
      filtered.sort((a, b) => b.rating - a.rating);
    }

    return filtered;
  }, [providerData, searchQuery, selectedFilter, selectedSort, selectedLocation]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const handleProviderPress = useCallback((provider: ProviderCardData) => {
    navigation.navigate('ProviderProfile', {
      providerId: provider.id,
      source: 'search',
    });
  }, [navigation]);

  const handleBookNow = useCallback((provider: ProviderCardData) => {
    // Navigate directly to provider profile for full booking experience
    navigation.navigate('ProviderProfile', {
      providerId: provider.id,
      source: 'search',
    });
  }, [navigation]);

  const renderProviderCard: ListRenderItem<ProviderCardData> = useCallback(({ item, index }) => (
    <ProviderCard
      provider={item}
      onPress={() => handleProviderPress(item)}
      onBookNow={() => handleBookNow(item)}
      index={index}
    />
  ), [handleProviderPress, handleBookNow]);

  const toggleFilters = useCallback(() => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersExpanded(prev => !prev);
  }, []);

  const filters = useMemo(() =>
    ['All', 'Hair', 'Nails', 'Makeup', 'Aesthetics', 'Brows', 'Lashes'], []
  );

  const sortOptions = useMemo(() =>
    ['Available Slots', 'Nearest', 'Highest Rated'], []
  );

  const renderListHeader = useCallback(() => (
    <View>
      {/* Available Providers Count */}
      <View style={styles.availableCountSection}>
        <Text style={[styles.availableCountText, { color: theme.text }]}>
          {filteredProviders.filter(p => p.isAvailable).length} providers available
        </Text>
        <Text style={[styles.availableSubtextText, { color: theme.secondaryText }]}>near you right now</Text>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterChipsSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsScrollContent}
        >
          {filters.map((filter) => {
            const isActive = selectedFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.horizontalFilterChip,
                  { backgroundColor: theme.cardBackground, borderColor: theme.border },
                  isActive && styles.horizontalFilterChipSelected
                ]}
                onPress={() => {
                  if (Platform.OS === 'ios') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSelectedFilter(isActive && filter !== 'All' ? 'All' : filter);
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.horizontalFilterChipText,
                  { color: isActive ? '#FFFFFF' : theme.secondaryText },
                  isActive && styles.horizontalFilterChipTextSelected
                ]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={styles.sortChipsSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortChipsScrollContent}
        >
          {sortOptions.map((sort) => {
            const isActive = selectedSort === sort;
            return (
              <TouchableOpacity
                key={sort}
                style={[
                  styles.sortChipItem,
                  { backgroundColor: theme.cardBackground, borderColor: theme.border },
                  isActive && styles.sortChipItemSelected
                ]}
                onPress={() => {
                  if (Platform.OS === 'ios') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSelectedSort(isActive ? 'Available Slots' : sort);
                }}
                activeOpacity={0.7}
              >
                <TabIcon
                  name="sliders"
                  size={14}
                  color={isActive ? '#FFFFFF' : theme.secondaryText}
                />
                <Text style={[
                  styles.sortChipItemText,
                  { color: isActive ? '#FFFFFF' : theme.secondaryText },
                  isActive && styles.sortChipItemTextSelected
                ]}>
                  {sort}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter Dropdown Button */}
      <View style={styles.filterButtonContainer}>
        <TouchableOpacity
          style={styles.filterButtonActive}
          onPress={toggleFilters}
          activeOpacity={0.7}
        >
          <BlurView intensity={40} tint={theme.blurTint} style={styles.filterButtonBlur}>
            <Text style={[styles.filterButtonText, { color: theme.text }]}>
              FILTERS {filtersExpanded ? '▲' : '▼'}
            </Text>
          </BlurView>
        </TouchableOpacity>
      </View>

      {/* Collapsible Filter Dropdown */}
      {filtersExpanded && (
        <View style={styles.filterDropdown}>
          <BlurView intensity={40} tint={theme.blurTint} style={[styles.filterDropdownBlur, { backgroundColor: theme.cardBackground }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
            >
              {/* Category Section */}
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>CATEGORY</Text>
              <View style={styles.filterChipContainer}>
                {['All', 'Hair', 'Nails', 'Makeup', 'Lashes', 'Brows', 'Aesthetics'].map((filter) => {
                  const isActive = selectedFilter === filter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: theme.cardBackground,
                          borderColor: isActive ? '#000000' : theme.border,
                          borderWidth: isActive ? 2 : 1.5,
                        }
                      ]}
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        // Toggle selection - if already selected, deselect to 'All'
                        setSelectedFilter(isActive && filter !== 'All' ? 'All' : filter);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: isActive ? '#000000' : theme.text,
                            fontWeight: isActive ? '800' : '600',
                          }
                        ]}
                      >
                        {filter}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Location Section */}
              <Text style={[styles.filterSectionTitle, { color: theme.text, marginTop: 20 }]}>LOCATION</Text>
              <View style={styles.filterChipContainer}>
                {uniqueLocations.map((location) => {
                  const isActive = selectedLocation === location;
                  return (
                    <TouchableOpacity
                      key={location}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: theme.cardBackground,
                          borderColor: isActive ? '#000000' : theme.border,
                          borderWidth: isActive ? 2 : 1.5,
                        }
                      ]}
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        // Toggle selection
                        setSelectedLocation(isActive && location !== 'All Locations' ? 'All Locations' : location);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: isActive ? '#000000' : theme.text,
                            fontWeight: isActive ? '800' : '600',
                          }
                        ]}
                      >
                        {location}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Sort Section */}
              <Text style={[styles.filterSectionTitle, { color: theme.text, marginTop: 20 }]}>SORT BY</Text>
              <View style={styles.filterChipContainer}>
                {['Available Slots', 'Nearest', 'Highest Rated'].map((sort) => {
                  const isActive = selectedSort === sort;
                  return (
                    <TouchableOpacity
                      key={sort}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: theme.cardBackground,
                          borderColor: isActive ? '#000000' : theme.border,
                          borderWidth: isActive ? 2 : 1.5,
                        }
                      ]}
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        // Toggle selection
                        setSelectedSort(isActive ? 'Available Slots' : sort);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: isActive ? '#000000' : theme.text,
                            fontWeight: isActive ? '800' : '600',
                          }
                        ]}
                      >
                        {sort}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </BlurView>
        </View>
      )}
    </View>
  ), [filtersExpanded, theme, selectedFilter, selectedSort, selectedLocation, uniqueLocations, toggleFilters, filteredProviders, filters, sortOptions]);

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <StatusBar barStyle={theme.statusBar} />

      {/* Provider List with proper spacing under transparent header */}
      <FlatList
        data={filteredProviders}
        renderItem={renderProviderCard}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#a342c3ff"
            colors={['#a342c3ff']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <TabIcon name="magnifying-glass" size={48} color={theme.secondaryText} />
            <Text style={[styles.emptyText, { color: theme.text }]}>No providers found</Text>
            <Text style={[styles.emptySubtext, { color: theme.secondaryText}]}>Try adjusting your filters</Text>
          </View>
        }
      />

    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: fonts.body.medium,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // List
  listContent: {
    paddingTop: 190,
    paddingBottom: 100,
  },
  listHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  filterButtonActive: {
    marginLeft: 10,
  },
  filterButtonBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  filterButtonText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  filterDropdown: {
    marginTop: 15,
    marginHorizontal: spacing.lg,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: 400,
  },
  filterDropdownBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  filterSectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 12,
  },
  filterChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  filterChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  availableCountContainer: {
    marginBottom: spacing.sm,
  },
  availableCount: {
    fontSize: fonts.title.large,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'BakbakOne-Regular',
  },
  availableSubtext: {
    fontSize: fonts.body.medium,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(163, 66, 195, 0.2)',
  },
  locationText: {
    fontSize: fonts.locationText,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  radiusText: {
    fontSize: fonts.body.medium,
    fontWeight: '500',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Provider Card
  providerCard: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: dimensions.card.smallBorderRadius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTouchable: {
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    padding: spacing.lg,
  },
  providerImageContainer: {
    position: 'relative',
    marginRight: spacing.lg,
  },
  providerImage: {
    width: dimensions.providerLogo.size,
    height: dimensions.providerLogo.size,
    borderRadius: dimensions.providerLogo.borderRadius,
    backgroundColor: '#F0F0F0',
  },
  availabilityDot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: dimensions.providerLogo.borderWidth,
    borderColor: '#FFFFFF',
  },
  providerInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  providerName: {
    fontSize: fonts.title.small,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'BakbakOne-Regular',
    flex: 1,
    marginRight: spacing.sm,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.xs,
  },
  ratingText: {
    fontSize: fonts.ratingText,
    fontWeight: '800',
    color: '#000000',
    fontFamily: 'Jura-VariableFont_wght',
  },
  reviewCount: {
    fontSize: fonts.body.xsmall,
    color: '#999999',
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  serviceType: {
    fontSize: fonts.serviceText,
    color: '#a342c3ff',
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  servicePillContainer: {
    marginBottom: spacing.sm,
  },
  servicePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F5E6FA',
    borderWidth: 1,
    borderColor: 'rgba(163, 66, 195, 0.3)',
  },
  servicePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.gap.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.xs,
  },
  metaText: {
    fontSize: fonts.body.xsmall,
    color: '#666666',
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#E0E0E0',
  },
  priceRange: {
    fontSize: fonts.body.xsmall,
    color: '#666666',
    fontWeight: '800',
    fontFamily: 'Jura-VariableFont_wght',
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  availabilityBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.3,
  },
  specialtiesContainer: {
    flexDirection: 'row',
  },
  specialtyTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F5E6FA',
    marginRight: spacing.gap.sm,
  },
  specialtyText: {
    fontSize: fonts.serviceTag,
    color: '#a342c3ff',
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Book Now Button
  bookNowButton: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  bookNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#000000',
  },
  bookNowText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Available Count Section
  availableCountSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  availableCountText: {
    fontSize: fonts.title.large,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  availableSubtextText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: spacing.xs,
  },

  // Horizontal Filter Chips
  filterChipsSection: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240, 240, 240, 0.3)',
  },
  filterChipsScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.gap.sm,
  },
  horizontalFilterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
  },
  horizontalFilterChipSelected: {
    backgroundColor: '#a342c3ff',
    borderColor: '#a342c3ff',
  },
  horizontalFilterChipText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  horizontalFilterChipTextSelected: {
    color: '#FFFFFF',
  },

  // Sort Chips
  sortChipsSection: {
    paddingVertical: spacing.md,
    paddingBottom: spacing.sm,
  },
  sortChipsScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.gap.sm,
  },
  sortChipItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.gap.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
  },
  sortChipItemSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  sortChipItemText: {
    fontSize: fonts.body.small,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  sortChipItemTextSelected: {
    color: '#FFFFFF',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
    marginTop: 16,
    fontFamily: 'BakbakOne-Regular',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    marginTop: 4,
    fontFamily: 'Jura-VariableFont_wght',
  },
});
