// SearchScreen.tsx
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
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { ExploreStackParamList } from '../navigation/types';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { getProviders, searchProviders, logSearchEvent } from '../services/databaseService';
import type { DbProvider } from '../types/database';
import userLearningService from '../services/userLearningService';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────
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
  index: number;
  P: AppTheme;
}

type Props = NativeStackScreenProps<ExploreStackParamList, 'Search'>;

// ── Availability colour ───────────────────────────────────────────────────────
function availColor(a: string) {
  if (a === 'Slots Available') return '#4CAF50';
  if (a === 'Slots Limited') return '#FF9500';
  return '#FF3B30';
}

// ── Provider Card ─────────────────────────────────────────────────────────────
const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, index, P }) => {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const color = availColor(provider.availability);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 340, delay: index * 55, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { backgroundColor: P.card, borderColor: P.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.88}>

        {/* Provider image with availability dot */}
        <View style={styles.imageWrap}>
          <Image source={provider.logo} style={styles.cardImage} resizeMode="cover" />
          <View style={[styles.availDot, { backgroundColor: color, borderColor: P.card }]} />
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
            <Text style={[styles.priceText, { color: P.sub }]}>  {provider.priceRange}</Text>
          </View>

          <View style={[styles.availBadge, { backgroundColor: `${color}22` }]}>
            <View style={[styles.availBadgeDot, { backgroundColor: color }]} />
            <Text style={[styles.availBadgeText, { color }]}>{provider.availability}</Text>
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
  const insets = useSafeAreaInsets();
  const { user } = useAuth();


  const [searchQuery, setSearchQuery]     = useState('');
  const [refreshing, setRefreshing]       = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedSort, setSelectedSort]   = useState('Available Slots');
  const [providerData, setProviderData]   = useState<ProviderCardData[]>([]);
  const [filtersOpen, setFiltersOpen]     = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Map DB provider to card data ────────────────────────────────────────────
  function mapDbToCardData(p: DbProvider, i: number): ProviderCardData {
    const ranges = ['£25–£50', '£40–£75', '£50–£100', '£60–£120', '£75–£150'];
    return {
      id: p.slug,
      name: p.display_name,
      service: p.service_category,
      logo: p.logo_url ? { uri: p.logo_url } : require('../../assets/icon.png'),
      location: p.location_text ?? 'London',
      totalSlots: 0, bookedSlots: 0,
      isAvailable: true, distance: '',
      rating: p.rating, reviewCount: p.review_count,
      estimatedWait: '10–15 min',
      priceRange: ranges[i % ranges.length] ?? '£50–£100',
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

  // Hide the default navigation header — we use our own
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const categoryCodeMap: Record<string, string> = {
    Hair: 'HAIR', Nails: 'NAILS', Makeup: 'MUA',
    Aesthetics: 'AESTHETICS', Brows: 'BROWS', Lashes: 'LASHES',
  };

  // Load all providers on mount (no query)
  React.useEffect(() => {
    getProviders()
      .then(data => setProviderData(data.map((p, i) => mapDbToCardData(p as DbProvider, i))))
      .catch(() => setProviderData([]));
  }, []);

  // Debounced server search — fires when query or category changes
  React.useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const catCode = selectedFilter !== 'All' ? categoryCodeMap[selectedFilter] : undefined;

    if (!searchQuery.trim()) {
      // No query — reload all providers for the selected category
      getProviders(catCode)
        .then(data => setProviderData(data.map((p, i) => mapDbToCardData(p as DbProvider, i))))
        .catch(() => {});
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      const q = searchQuery.trim();
      searchProviders(q, catCode)
        .then(data => {
          setProviderData(data.map((p, i) => mapDbToCardData(p as DbProvider, i)));
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

  // ── Sort only — filtering is now done server-side ───────────────────────────
  const filteredProviders = useMemo(() => {
    const list = [...providerData];
    if (selectedSort === 'Highest Rated') {
      list.sort((a, b) => b.rating - a.rating);
    }
    return list;
  }, [providerData, selectedSort]);

  // ── Search input handler ─────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    // Track for user learning once query is meaningful
    if (text.trim().length >= 3) {
      const catCode = selectedFilter !== 'All' ? categoryCodeMap[selectedFilter] : undefined;
      userLearningService.trackSearch(text, catCode).catch(() => {});
    }
  }, [selectedFilter]);

  // ── Tracked filter chip selection ───────────────────────────────────────────
  const handleFilterPress = useCallback((f: string) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = selectedFilter === f && f !== 'All' ? 'All' : f;
    setSelectedFilter(next);
    if (next !== 'All') {
      const categoryMap: Record<string, string> = {
        Hair: 'HAIR', Nails: 'NAILS', Makeup: 'MUA',
        Lashes: 'LASHES', Brows: 'BROWS', Aesthetics: 'AESTHETICS',
      };
      const cat = categoryMap[next];
      if (cat) userLearningService.trackFilter(cat).catch(() => {});
    }
  }, [selectedFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const catCode = selectedFilter !== 'All' ? categoryCodeMap[selectedFilter] : undefined;
    const fn = searchQuery.trim()
      ? searchProviders(searchQuery.trim(), catCode)
      : getProviders(catCode);
    fn
      .then(data => setProviderData(data.map((p, i) => mapDbToCardData(p as DbProvider, i))))
      .catch(() => setProviderData([]))
      .finally(() => setRefreshing(false));
  }, [searchQuery, selectedFilter]);

  const handleProviderPress = useCallback((provider: ProviderCardData) => {
    userLearningService.trackInteraction({
      type: 'view',
      providerId: provider.id,
      providerName: provider.name,
      serviceCategory: provider.service,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
    navigation.navigate('ProviderProfile', { providerId: provider.id, source: 'search' });
  }, [navigation]);

  const renderCard: ListRenderItem<ProviderCardData> = useCallback(({ item, index }) => (
    <ProviderCard provider={item} onPress={() => handleProviderPress(item)} index={index} P={P} />
  ), [handleProviderPress, P]);

  const activeFilterCount = (selectedFilter !== 'All' ? 1 : 0) + (selectedSort !== 'Available Slots' ? 1 : 0);

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

      {/* ── Custom header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: P.sep }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: P.surface, borderColor: P.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>←</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: P.text }]}>FIND PROVIDERS</Text>

        <TouchableOpacity
          style={[styles.filterBtn, {
            backgroundColor: filtersOpen ? P.accent : P.surface,
            borderColor: filtersOpen ? P.accent : P.border,
          }]}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFiltersOpen(prev => !prev);
          }}
          activeOpacity={0.75}
        >
          <TabIcon name="sliders" size={14} color={filtersOpen ? P.ice : P.sub} />
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: filtersOpen ? P.ice : P.accent }]}>
              <Text style={[styles.filterBadgeText, { color: filtersOpen ? P.accent : P.ice }]}>
                {activeFilterCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Search bar ── */}
      <View style={[styles.searchWrap, { backgroundColor: P.bg }]}>
        <View style={[styles.searchBar, { backgroundColor: P.surface, borderColor: P.border }]}>
          <TabIcon name="magnifying-glass" size={16} color={P.sub} />
          <TextInput
            style={[styles.searchInput, { color: P.text, fontFamily: 'Jura-VariableFont_wght' }]}
            placeholder="Search providers, services..."
            placeholderTextColor={P.sub}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearBtn, { color: P.sub }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Collapsible filter panel ── */}
      {filtersOpen && (
        <View style={[styles.filterPanel, { backgroundColor: P.surface, borderBottomColor: P.sep }]}>
          <Text style={[styles.filterPanelLabel, { color: P.sub }]}>CATEGORY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            style={styles.chipsScroll}
          >
            {['All', 'Hair', 'Nails', 'Makeup', 'Lashes', 'Brows', 'Aesthetics'].map(f => {
              const active = selectedFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => handleFilterPress(f)}
                  style={[styles.chip, { backgroundColor: active ? P.accent : P.bg, borderColor: active ? P.accent : P.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, { color: active ? P.ice : P.sub, fontWeight: active ? '700' : '500' }]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.filterPanelSep, { backgroundColor: P.sep }]} />

          <Text style={[styles.filterPanelLabel, { color: P.sub }]}>SORT BY</Text>
          <View style={styles.sortChips}>
            {['Available Slots', 'Highest Rated'].map(s => {
              const active = selectedSort === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => {
                    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedSort(active ? 'Available Slots' : s);
                  }}
                  style={[styles.sortChip, { backgroundColor: active ? P.accent : P.bg, borderColor: active ? P.accent : P.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.sortChipText, { color: active ? P.ice : P.sub }]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Provider list ── */}
      <FlatList
        data={filteredProviders}
        renderItem={renderCard}
        keyExtractor={item => item.id}
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
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, fontFamily: 'Jura-VariableFont_wght' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 18, fontWeight: '500', marginTop: -1 },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Filter panel
  filterPanel: {
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterPanelLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterPanelSep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 12,
  },

  // List header
  listHeaderBar: {
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
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  clearBtn: {
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Filter chips row
  chipsScroll: { paddingBottom: 2 },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    letterSpacing: 0.2,
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
  sortChips: { flexDirection: 'row', gap: 6 },
  sortChip: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingBottom: 110,
    paddingTop: 4,
  },

  // Provider card
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardBody: {
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },
  imageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#E0D8D4',
  },
  availDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  cardInfo: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  cardName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  servicePill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  servicePillText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    fontSize: 12,
    color: '#F5A623',
  },
  ratingNum: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 3,
  },
  reviewCount: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '500',
  },
  priceText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
  },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  availBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Book Now button
  bookBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  bookBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
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
  },
});
