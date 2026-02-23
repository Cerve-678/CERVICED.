// ExploreScreen.tsx - Uber-style Provider Discovery Interface
import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  TextInput,
  RefreshControl,
  Animated,
  ImageSourcePropType,
  ListRenderItem
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { sampleProviders } from '../services/ProviderDataService';

// Navigation Types
type RootStackParamList = {
  MainTabs: undefined;
  ProviderProfile: {
    providerLogo: any;
    providerName: string;
    providerService: string;
  };
};

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

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

interface SortChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

interface ProviderCardProps {
  provider: ProviderCardData;
  onPress: () => void;
  onBookNow: () => void;
  index: number;
}

// Filter Chip Component
const FilterChip = memo<FilterChipProps>(({ label, isSelected, onPress }) => {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
        isSelected && styles.filterChipSelected
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.filterChipText,
        { color: isSelected ? '#FFFFFF' : theme.secondaryText },
        isSelected && styles.filterChipTextSelected
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});
FilterChip.displayName = 'FilterChip';

// Sort Chip Component
const SortChip = memo<SortChipProps>(({ label, isSelected, onPress }) => {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.sortChip,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
        isSelected && styles.sortChipSelected
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TabIcon
        name={isSelected ? "sliders" : "sliders"}
        size={14}
        color={isSelected ? "#FFFFFF" : theme.secondaryText}
      />
      <Text style={[
        styles.sortChipText,
        { color: isSelected ? '#FFFFFF' : theme.secondaryText },
        isSelected && styles.sortChipTextSelected
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});
SortChip.displayName = 'SortChip';

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

// Main ExploreScreen Component
const ExploreScreen = memo(() => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme } = useTheme();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [selectedSort, setSelectedSort] = useState<string>('Available Now');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

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

  const filters = useMemo(() =>
    ['All', 'Hair', 'Nails', 'Makeup', 'Aesthetics', 'Brows', 'Lashes'], []
  );

  const sortOptions = useMemo(() =>
    ['Available Now', 'Nearest', 'Highest Rated'], []
  );

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
  }, [providerData, selectedFilter, selectedSort, searchQuery]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const handleProviderPress = useCallback((provider: ProviderCardData) => {
    navigation.navigate('ProviderProfile', {
      providerLogo: provider.logo,
      providerName: provider.name,
      providerService: provider.service,
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
      {/* Available Providers Count */}
      <View style={styles.availableCountContainer}>
        <Text style={[styles.availableCount, { color: theme.text }]}>
          {filteredProviders.filter(p => p.isAvailable).length} providers available
        </Text>
        <Text style={[styles.availableSubtext, { color: theme.secondaryText }]}>near you right now</Text>
      </View>
    </View>
  ), [filteredProviders, theme]);

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Find a Provider</Text>
        <TouchableOpacity style={styles.notificationButton}>
          <TabIcon name="bell" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.cardBackground }]}>
          <TabIcon name="magnifying-glass" size={18} color={theme.secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search providers or services..."
            placeholderTextColor={theme.secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearButton, { color: theme.secondaryText }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={[styles.filterSection, { backgroundColor: theme.background }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {filters.map((filter) => (
            <FilterChip
              key={filter}
              label={filter}
              isSelected={selectedFilter === filter}
              onPress={() => setSelectedFilter(filter)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={[styles.sortSection, { backgroundColor: theme.background }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortScrollContent}
        >
          {sortOptions.map((sort) => (
            <SortChip
              key={sort}
              label={sort}
              isSelected={selectedSort === sort}
              onPress={() => setSelectedSort(sort)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Provider List */}
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
      </SafeAreaView>
    </ThemedBackground>
  );
});

ExploreScreen.displayName = 'ExploreScreen';
export default ExploreScreen;

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
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'BakbakOne-Regular',
  },
  notificationButton: {
    padding: 8,
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Jura-VariableFont_wght',
  },
  clearButton: {
    fontSize: 28,
    color: '#999999',
    fontWeight: '300',
  },

  // Filter Section
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipSelected: {
    backgroundColor: '#a342c3ff',
    borderColor: '#a342c3ff',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },

  // Sort Section
  sortSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingBottom: 16,
  },
  sortScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sortChipSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    fontFamily: 'Jura-VariableFont_wght',
  },
  sortChipTextSelected: {
    color: '#FFFFFF',
  },

  // List
  listContent: {
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
