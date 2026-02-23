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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ExploreStackParamList } from '../navigation/types';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { sampleProviders } from '../services/ProviderDataService';
import FilterModal from '../components/FilterModal';
import LocationModal from '../components/LocationModal';

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
  availability: 'Available Now' | 'Busy' | 'Offline';
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
    switch (provider.availability) {
      case 'Available Now':
        return '#4CAF50';
      case 'Busy':
        return '#FF9500';
      case 'Offline':
        return '#999999';
      default:
        return '#999999';
    }
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

            <Text style={styles.serviceType}>{provider.service}</Text>

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
        {provider.isAvailable && (
          <TouchableOpacity
            style={styles.bookNowButton}
            onPress={onBookNow}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#a342c3ff', '#8a2fb8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bookNowGradient}
            >
              <Text style={styles.bookNowText}>Book Now</Text>
              <TabIcon name="basket-shopping" size={16} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}
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
  const [selectedSort, setSelectedSort] = useState<string>('Available Now');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('London, UK');
  const [selectedRadius, setSelectedRadius] = useState<number>(5);
  const [showLocationModal, setShowLocationModal] = useState(false);

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

  // Memoize header right button to prevent re-renders
  const headerRightButton = useCallback(() => (
    <TouchableOpacity
      onPress={() => setShowFilterModal(true)}
      style={{ marginRight: 8, padding: 8 }}
    >
      <TabIcon name="sliders" size={20} color={themeColors.text} />
    </TouchableOpacity>
  ), [themeColors.text]);

  // Set up header options dynamically for dark mode and filter button - useLayoutEffect for instant updates
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
      },
      headerBlurEffect: themeColors.blurTint,
      headerRight: headerRightButton,
    });
  }, [navigation, themeColors.text, themeColors.blurTint, headerRightButton]);

  const { addToCart } = useCart();

  // Mock provider data with availability status
  const providerData = useMemo((): ProviderCardData[] => {
    return sampleProviders.map((provider, index) => ({
      id: provider.id,
      name: provider.name,
      service: provider.service,
      logo: provider.logo,
      isAvailable: index % 3 !== 2, // 2 out of 3 are available
      distance: `${(Math.random() * 5 + 0.5).toFixed(1)} mi`,
      rating: (Math.random() * 0.5 + 4.5).toFixed(1) as unknown as number,
      reviewCount: Math.floor(Math.random() * 500 + 50),
      estimatedWait: index % 3 === 0 ? '10-15 min' : index % 3 === 1 ? '20-30 min' : '45+ min',
      priceRange: '$$-$$$',
      specialties: getSpecialtiesForService(provider.service),
      availability: index % 3 === 0 ? 'Available Now' : index % 3 === 1 ? 'Busy' : 'Offline',
    }));
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

    // Apply sorting
    if (selectedSort === 'Available Now') {
      filtered.sort((a, b) => {
        if (a.availability === 'Available Now' && b.availability !== 'Available Now') return -1;
        if (a.availability !== 'Available Now' && b.availability === 'Available Now') return 1;
        return 0;
      });
    } else if (selectedSort === 'Nearest') {
      filtered.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    } else if (selectedSort === 'Highest Rated') {
      filtered.sort((a, b) => b.rating - a.rating);
    }

    return filtered;
  }, [providerData, searchQuery, selectedFilter, selectedSort]);

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
    // Add a default service to cart
    addToCart({
      providerName: provider.name,
      providerImage: provider.logo,
      providerService: provider.service,
      service: {
        id: 1,
        name: `${provider.service} Service`,
        price: 75,
        duration: '1 hour',
        description: `Professional ${provider.service.toLowerCase()} service`,
      },
      quantity: 1,
    });

    // Navigate to provider profile
    handleProviderPress(provider);
  }, [addToCart, handleProviderPress]);

  const renderProviderCard: ListRenderItem<ProviderCardData> = useCallback(({ item, index }) => (
    <ProviderCard
      provider={item}
      onPress={() => handleProviderPress(item)}
      onBookNow={() => handleBookNow(item)}
      index={index}
    />
  ), [handleProviderPress, handleBookNow]);

  const renderListHeader = useCallback(() => (
    <View style={styles.listHeader}>
      {/* Location Row */}
      <TouchableOpacity
        onPress={() => setShowLocationModal(true)}
        style={[styles.locationRow, { backgroundColor: theme.cardBackground }]}
        activeOpacity={0.7}
      >
        <Text style={[styles.locationText, { color: theme.text }]}>
          📍 {selectedLocation}
        </Text>
        <Text style={[styles.radiusText, { color: theme.secondaryText }]}>
          within {selectedRadius} miles
        </Text>
      </TouchableOpacity>

      {/* Available Providers Count */}
      <View style={styles.availableCountContainer}>
        <Text style={[styles.availableCount, { color: theme.text }]}>
          {filteredProviders.filter(p => p.isAvailable).length} providers available
        </Text>
        <Text style={[styles.availableSubtext, { color: theme.secondaryText }]}>near you right now</Text>
      </View>
    </View>
  ), [filteredProviders, theme, selectedLocation, selectedRadius]);

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
            <Text style={[styles.emptySubtext, { color: theme.secondaryText }]}>Try adjusting your filters</Text>
          </View>
        }
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        selectedFilter={selectedFilter}
        selectedSort={selectedSort}
        onFilterChange={setSelectedFilter}
        onSortChange={setSelectedSort}
      />

      {/* Location Modal */}
      <LocationModal
        visible={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        selectedLocation={selectedLocation}
        selectedRadius={selectedRadius}
        onLocationChange={setSelectedLocation}
        onRadiusChange={setSelectedRadius}
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
    fontSize: 16,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // List
  listContent: {
    paddingTop: 210, // Space for transparent header with search bar
    paddingVertical: 8,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  availableCountContainer: {
    marginBottom: 8,
  },
  availableCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'BakbakOne-Regular',
  },
  availableSubtext: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(163, 66, 195, 0.2)',
  },
  locationText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  radiusText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Provider Card
  providerCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTouchable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  providerImageContainer: {
    position: 'relative',
    marginRight: 16,
  },
  providerImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  availabilityDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
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
    marginBottom: 4,
  },
  providerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'BakbakOne-Regular',
    flex: 1,
    marginRight: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Jura-VariableFont_wght',
  },
  reviewCount: {
    fontSize: 12,
    color: '#999999',
    fontFamily: 'Jura-VariableFont_wght',
  },
  serviceType: {
    fontSize: 13,
    color: '#a342c3ff',
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#E0E0E0',
  },
  priceRange: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  availabilityBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  specialtiesContainer: {
    flexDirection: 'row',
  },
  specialtyTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F5E6FA',
    marginRight: 6,
  },
  specialtyText: {
    fontSize: 11,
    color: '#a342c3ff',
    fontWeight: '600',
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
    gap: 8,
    paddingVertical: 14,
  },
  bookNowText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
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
