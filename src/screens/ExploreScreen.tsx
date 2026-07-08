// ExploreScreen.tsx - Pinterest Discovery + Event Planner
import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  TextInput,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { ExploreStackParamList } from '../navigation/types';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

// Discover components
import { MasonryGrid } from '../components/MasonryGrid';
import { PortfolioCard } from '../components/PortfolioCard';
import { ImageDetailModal } from '../components/ImageDetailModal';
import { CreateEventModal } from '../components/CreateEventModal';

// Data types
import { PortfolioItem, ServiceCategory } from '../data/providerProfiles';
import { getPortfolioItems, searchPortfolio as dbSearchPortfolio } from '../services/databaseService';
import type { PortfolioItemWithProvider } from '../types/database';

// Stores
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { usePlannerStore } from '../stores/usePlannerStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const L = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', ice: '#FFFFFF', text: '#000000',
  sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(175,145,151,0.12)',
};
const D = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', ice: '#FFFFFF', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)',
};

// ============================================================================
// SUB-TAB SELECTOR
// ============================================================================
interface SubTabProps {
  activeTab: 'discover' | 'plans';
  onTabChange: (tab: 'discover' | 'plans') => void;
}

const SubTabBar = memo<SubTabProps>(({ activeTab, onTabChange }) => {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  return (
    <View style={[styles.subTabBar, { backgroundColor: P.bg }]}>
      <TouchableOpacity
        style={[
          styles.subTab,
          activeTab === 'discover' && { borderBottomColor: P.accent },
        ]}
        onPress={() => onTabChange('discover')}
      >
        <Text
          style={[
            styles.subTabText,
            { color: activeTab === 'discover' ? P.accent : P.sub },
          ]}
        >
          Discover
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.subTab,
          activeTab === 'plans' && { borderBottomColor: P.accent },
        ]}
        onPress={() => onTabChange('plans')}
      >
        <Text
          style={[
            styles.subTabText,
            { color: activeTab === 'plans' ? P.accent : P.sub },
          ]}
        >
          My Plans
        </Text>
      </TouchableOpacity>
    </View>
  );
});
SubTabBar.displayName = 'SubTabBar';

// ── Skeleton Masonry Grid ────────────────────────────────────────────────
function SkeletonMasonryGrid({ isDarkMode }: { isDarkMode: boolean }) {
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
  const base = isDarkMode ? '#2A2724' : '#EDE8E2';
  const colWidth = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;
  const leftHeights = [200, 140, 180, 120, 160];
  const rightHeights = [160, 210, 130, 175, 150];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: 12 }}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        {leftHeights.map((h, i) => (
          <Animated.View key={i} style={{ width: colWidth, height: h, borderRadius: 12, backgroundColor: base, opacity }} />
        ))}
      </View>
      <View style={{ flex: 1, gap: spacing.sm }}>
        {rightHeights.map((h, i) => (
          <Animated.View key={i} style={{ width: colWidth, height: h, borderRadius: 12, backgroundColor: base, opacity }} />
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// FILTER CHIP
// ============================================================================
interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip = memo<FilterChipProps>(({ label, isSelected, onPress }) => {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        { backgroundColor: P.card, borderColor: P.border },
        isSelected && { backgroundColor: P.accent, borderColor: P.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isSelected ? '#FFFFFF' : P.sub },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});
FilterChip.displayName = 'FilterChip';

// ============================================================================
// EVENT CARD (for My Plans list)
// ============================================================================
interface EventCardProps {
  event: {
    id: string;
    name: string;
    date: string;
    goalImageId?: string;
    tasks: any[];
    checklist: any[];
  };
  onPress: () => void;
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const EventCard = memo<EventCardProps>(({ event, onPress }) => {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const daysUntil = getDaysUntil(event.date);
  const completedTasks = event.tasks.filter((t: any) => t.status === 'completed').length;
  const totalTasks = event.tasks.length;
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: P.card, borderColor: P.border }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.eventCardRow}>
          <View style={[styles.eventThumbnailPlaceholder, { backgroundColor: P.iconBg }]}>
            <TabIcon name="star" size={20} color={P.accent} />
          </View>

          <View style={styles.eventCardInfo}>
            <Text style={[styles.eventCardName, { color: P.text }]} numberOfLines={1}>
              {event.name}
            </Text>

            <Text style={[styles.eventCountdown, { color: daysUntil <= 7 ? '#FF6B6B' : P.accent }]}>
              {daysUntil > 0
                ? `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`
                : daysUntil === 0
                  ? "Today!"
                  : 'Past event'}
            </Text>

            {totalTasks > 0 && (
              <View style={styles.eventProgressRow}>
                <View style={[styles.eventProgressBar, { backgroundColor: P.surface }]}>
                  <View style={[styles.eventProgressFill, { width: `${progress * 100}%`, backgroundColor: P.accent }]} />
                </View>
                <Text style={[styles.eventProgressText, { color: P.sub }]}>
                  {completedTasks}/{totalTasks}
                </Text>
              </View>
            )}
          </View>

          <TabIcon name="magnifying-glass" size={16} color={P.sub} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});
EventCard.displayName = 'EventCard';

// ============================================================================
// MAIN EXPLORE SCREEN
// ============================================================================
const ExploreScreen = memo(() => {
  const navigation = useNavigation<NavigationProp<ExploreStackParamList>>();
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  // State
  const [activeTab, setActiveTab] = useState<'discover' | 'plans'>('discover');
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<PortfolioItem | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isCreateEventVisible, setIsCreateEventVisible] = useState(false);
  const [pendingPlanItem, setPendingPlanItem] = useState<PortfolioItem | null>(null);

  // Stores
  const { addToCart } = useCart();
  const { events, activeEventId, addTask, setActiveEvent, loadEvents } = usePlannerStore();
  const { loadSavedPortfolio } = useBookmarkStore();

  // Portfolio items from Supabase
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Map a Supabase portfolio row to the local PortfolioItem shape
  const mapDbPortfolioItem = useCallback((item: PortfolioItemWithProvider): PortfolioItem => {
    const p = item.provider as any;
    return {
      id: item.id,
      image: { uri: item.image_url },
      caption: item.caption ?? '',
      category: (item.category?.toUpperCase() as ServiceCategory) ?? 'NAILS',
      aspectRatio: item.aspect_ratio,
      providerId: p?.slug ?? item.provider_id,
      tags: item.tags ?? [],
      price: item.price != null ? `£${item.price}` : undefined,
      imageUri: item.image_url ?? undefined,
      providerName: p?.display_name ?? undefined,
      providerLogoUri: p?.logo_url ?? undefined,
      providerSlug: p?.slug ?? undefined,
      providerRating: p?.rating ?? undefined,
      providerReviewCount: p?.review_count ?? undefined,
    };
  }, []);

  // Load stores on mount
  useEffect(() => {
    loadEvents();
    loadSavedPortfolio();
  }, []);

  // Filters
  const filters = useMemo(() => ['All', 'Hair', 'Nails', 'Makeup', 'Aesthetics', 'Brows', 'Lashes'], []);

  const filterMap: Record<string, ServiceCategory> = useMemo(() => ({
    Hair: 'HAIR',
    Nails: 'NAILS',
    Makeup: 'MUA',
    Aesthetics: 'AESTHETICS',
    Brows: 'BROWS',
    Lashes: 'LASHES',
  }), []);

  // Fetch portfolio from Supabase whenever filter or search changes
  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    const load = async () => {
      try {
        let data: PortfolioItemWithProvider[];
        if (searchQuery.trim()) {
          data = await dbSearchPortfolio(searchQuery);
        } else if (selectedFilter !== 'All' && filterMap[selectedFilter]) {
          data = await getPortfolioItems(filterMap[selectedFilter]);
        } else {
          data = await getPortfolioItems();
        }
        if (!cancelled) {
          setPortfolioItems(data.map(mapDbPortfolioItem));
          setPortfolioLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPortfolioItems([]);
          setPortfolioLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedFilter, searchQuery, filterMap, mapDbPortfolioItem]);

  // Column width for masonry
  const columnWidth = useMemo(() => {
    return (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;
  }, []);

  // Masonry item height calculator
  const getItemHeight = useCallback(
    (item: PortfolioItem, colWidth: number) => {
      return colWidth * item.aspectRatio + 40;
    },
    []
  );

  // Handlers
  const handleImagePress = useCallback((item: PortfolioItem) => {
    setSelectedImage(item);
    setIsDetailVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
    setSelectedImage(null);
  }, []);

  const handleViewProfile = useCallback(
    (providerId: string, _providerName: string, _providerService: string, _providerLogo: any) => {
      navigation.navigate('ProviderProfile', {
        providerId,
        source: 'explore',
      });
    },
    [navigation]
  );

  const handleBookNow = useCallback(
    (providerId: string, providerName: string, providerService: string, providerLogo: any) => {
      addToCart({
        providerName,
        providerImage: providerLogo,
        providerService,
        service: {
          id: 1,
          name: `${providerService} Service`,
          price: 75,
          duration: '1 hour',
          description: `Professional ${providerService.toLowerCase()} service`,
        },
        quantity: 1,
      });
      navigation.navigate('ProviderProfile', {
        providerId,
        source: 'explore',
      });
    },
    [addToCart, navigation]
  );

  const handlePlanThis = useCallback(
    (item: PortfolioItem) => {
      if (activeEventId) {
        addTask(activeEventId, item);
        setIsDetailVisible(false);
        setSelectedImage(null);
        Alert.alert('Added!', 'Added to your plan', [
          {
            text: 'View Plan',
            onPress: () => {
              setActiveTab('plans');
              navigation.navigate('EventDetail' as any, { eventId: activeEventId });
            },
          },
          { text: 'Keep Browsing', style: 'cancel' },
        ]);
      } else {
        setPendingPlanItem(item);
        setIsDetailVisible(false);
        setIsCreateEventVisible(true);
      }
    },
    [activeEventId, addTask, navigation]
  );

  const handleEventCreated = useCallback(
    (eventId: string) => {
      setIsCreateEventVisible(false);
      if (pendingPlanItem) {
        addTask(eventId, pendingPlanItem);
        setPendingPlanItem(null);
      }
      setActiveEvent(eventId);
      navigation.navigate('EventDetail' as any, { eventId });
    },
    [pendingPlanItem, addTask, setActiveEvent, navigation]
  );

  const handleEventPress = useCallback(
    (eventId: string) => {
      setActiveEvent(eventId);
      navigation.navigate('EventDetail' as any, { eventId });
    },
    [setActiveEvent, navigation]
  );

  const renderPortfolioCard = useCallback(
    (item: PortfolioItem, index: number) => (
      <PortfolioCard
        item={item}
        columnWidth={columnWidth}
        onPress={handleImagePress}
        index={index}
      />
    ),
    [columnWidth, handleImagePress]
  );

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: P.bg }]}>
        <Text style={[styles.loadingText, { color: P.sub }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: P.bg }]}>
          <Text style={[styles.headerTitle, { color: P.text }]}>Explore</Text>
          <TouchableOpacity
            style={styles.savedButton}
            onPress={() => navigation.navigate('BookmarkedProviders' as any)}
          >
            <TabIcon name="bookmark" size={22} color={P.text} />
          </TouchableOpacity>
        </View>

        {/* Sub-tab bar */}
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ============ DISCOVER TAB ============ */}
        {activeTab === 'discover' && (
          <>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: P.bg }]}>
              <View style={[styles.searchBar, { backgroundColor: P.card }]}>
                <TabIcon name="magnifying-glass" size={18} color={P.sub} />
                <TextInput
                  style={[styles.searchInput, { color: P.text }]}
                  placeholder="Search looks, styles, providers..."
                  placeholderTextColor={P.sub}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Text style={[styles.clearButton, { color: P.sub }]}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filter Chips */}
            <View style={[styles.filterSection, { backgroundColor: P.bg, borderBottomColor: P.sep }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
              >
                {filters.map(filter => (
                  <FilterChip
                    key={filter}
                    label={filter}
                    isSelected={selectedFilter === filter}
                    onPress={() => setSelectedFilter(filter)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Masonry Grid */}
            {portfolioLoading ? (
              <SkeletonMasonryGrid isDarkMode={isDarkMode} />
            ) : (
            <MasonryGrid
              data={portfolioItems}
              renderItem={renderPortfolioCard}
              getItemHeight={getItemHeight}
              keyExtractor={item => item.id}
              ListHeaderComponent={
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridCount, { color: P.sub }]}>
                    {portfolioItems.length} looks
                  </Text>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <TabIcon name="magnifying-glass" size={48} color={P.sub} />
                  <Text style={[styles.emptyText, { color: P.text }]}>No looks found</Text>
                  <Text style={[styles.emptySubtext, { color: P.sub }]}>
                    Try a different search or filter
                  </Text>
                </View>
              }
            />
            )}
          </>
        )}

        {/* ============ MY PLANS TAB ============ */}
        {activeTab === 'plans' && (
          <ScrollView
            style={styles.plansContainer}
            contentContainerStyle={styles.plansContent}
            showsVerticalScrollIndicator={false}
          >
            {events.length === 0 ? (
              <View style={styles.emptyPlans}>
                <View style={[styles.emptyPlansIcon, { backgroundColor: P.iconBg }]}>
                  <TabIcon name="bookmark" size={36} color={P.accent} />
                </View>
                <Text style={[styles.emptyPlansTitle, { color: P.text }]}>
                  No plans yet
                </Text>
                <Text style={[styles.emptyPlansText, { color: P.sub }]}>
                  Browse Discover, find inspo you love, and tap{'\n'}"Plan This" to start building your look
                </Text>
                <TouchableOpacity
                  style={[styles.emptyPlansButton, { backgroundColor: P.accent }]}
                  onPress={() => setActiveTab('discover')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.emptyPlansButtonText}>Browse Discover</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.createDirectButton}
                  onPress={() => setIsCreateEventVisible(true)}
                >
                  <Text style={[styles.createDirectText, { color: P.sub }]}>or create a plan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {activeEventId && (
                  <View style={[styles.activeEventBanner, { backgroundColor: P.iconBg }]}>
                    <TabIcon name="star" size={14} color={P.accent} />
                    <Text style={[styles.activeEventText, { color: P.accent }]}>
                      Active: {events.find(e => e.id === activeEventId)?.name}
                    </Text>
                  </View>
                )}

                {events.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => handleEventPress(event.id)}
                  />
                ))}

                <TouchableOpacity
                  style={[styles.newPlanButton, { borderColor: P.border }]}
                  onPress={() => setIsCreateEventVisible(true)}
                >
                  <Text style={[styles.newPlanText, { color: P.accent }]}>+ New Plan</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Modals */}
      <ImageDetailModal
        visible={isDetailVisible}
        item={selectedImage}
        onClose={handleCloseDetail}
        onViewProfile={handleViewProfile}
        onBookNow={handleBookNow}
        onPlanThis={handlePlanThis}
      />

      <CreateEventModal
        visible={isCreateEventVisible}
        onClose={() => {
          setIsCreateEventVisible(false);
          setPendingPlanItem(null);
        }}
        onCreated={handleEventCreated}
        {...(pendingPlanItem ? { initialPortfolioItem: pendingPlanItem } : {})}
      />
    </ThemedBackground>
  );
});

ExploreScreen.displayName = 'ExploreScreen';
export default ExploreScreen;

// ============================================================================
// STYLES
// ============================================================================
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
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fonts.title.large,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 1,
  },
  savedButton: {
    padding: spacing.sm,
  },

  // Sub-tabs
  subTabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  subTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },
  clearButton: {
    fontSize: fonts.title.large,
    fontWeight: '300',
  },

  // Filter Section
  filterSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  filterScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 100,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Grid
  gridHeader: {
    paddingBottom: spacing.sm,
  },
  gridCount: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: fonts.title.small,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
    marginTop: spacing.lg,
  },
  emptySubtext: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: spacing.sm,
  },

  // Plans tab
  plansContainer: {
    flex: 1,
  },
  plansContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },

  // Empty plans
  emptyPlans: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyPlansIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyPlansTitle: {
    fontSize: fonts.title.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.sm,
  },
  emptyPlansText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  emptyPlansButton: {
    borderRadius: 100,
    width: '80%',
    alignItems: 'center',
    paddingVertical: 15,
  },
  emptyPlansButtonText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 1,
  },
  createDirectButton: {
    paddingVertical: spacing.md,
  },
  createDirectText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },

  // Active event banner
  activeEventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    marginBottom: spacing.md,
  },
  activeEventText: {
    fontSize: fonts.body.small,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Event card
  eventCard: {
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  eventThumbnailPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCardInfo: {
    flex: 1,
  },
  eventCardName: {
    fontSize: fonts.providerName,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  eventCountdown: {
    fontSize: fonts.body.small,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 2,
  },
  eventProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  eventProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  eventProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  eventProgressText: {
    fontSize: 10,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },

  // New plan button
  newPlanButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: dimensions.card.smallBorderRadius,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  newPlanText: {
    fontSize: fonts.body.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
});
