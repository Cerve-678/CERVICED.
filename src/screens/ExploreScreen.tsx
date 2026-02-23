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
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useNavigation, NavigationProp } from '@react-navigation/native';
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

// Data
import { PortfolioItem, ServiceCategory } from '../data/providerProfiles';
import {
  getAllPortfolioItems,
  getPortfolioByCategory,
  searchPortfolio,
} from '../data/portfolioFeed';

// Stores
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { usePlannerStore } from '../stores/usePlannerStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Navigation Types
type ExploreNavParamList = {
  ExploreMain: undefined;
  ProviderProfile: {
    providerLogo: any;
    providerName: string;
    providerService: string;
  };
  EventDetail: { eventId: string };
  BookmarkedProviders: undefined;
};

// ============================================================================
// SUB-TAB SELECTOR
// ============================================================================
interface SubTabProps {
  activeTab: 'discover' | 'plans';
  onTabChange: (tab: 'discover' | 'plans') => void;
}

const SubTabBar = memo<SubTabProps>(({ activeTab, onTabChange }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.subTabBar, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        style={[
          styles.subTab,
          activeTab === 'discover' && styles.subTabActive,
        ]}
        onPress={() => onTabChange('discover')}
      >
        <Text
          style={[
            styles.subTabText,
            { color: activeTab === 'discover' ? '#a342c3ff' : theme.secondaryText },
            activeTab === 'discover' && styles.subTabTextActive,
          ]}
        >
          Discover
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.subTab,
          activeTab === 'plans' && styles.subTabActive,
        ]}
        onPress={() => onTabChange('plans')}
      >
        <Text
          style={[
            styles.subTabText,
            { color: activeTab === 'plans' ? '#a342c3ff' : theme.secondaryText },
            activeTab === 'plans' && styles.subTabTextActive,
          ]}
        >
          My Plans
        </Text>
      </TouchableOpacity>
    </View>
  );
});
SubTabBar.displayName = 'SubTabBar';

// ============================================================================
// FILTER CHIP
// ============================================================================
interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip = memo<FilterChipProps>(({ label, isSelected, onPress }) => {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
        isSelected && styles.filterChipSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isSelected ? '#FFFFFF' : theme.secondaryText },
          isSelected && styles.filterChipTextSelected,
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
  const { theme, isDarkMode } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const daysUntil = getDaysUntil(event.date);
  const completedTasks = event.tasks.filter((t: any) => t.status === 'completed').length;
  const totalTasks = event.tasks.length;
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

  const goalImage = event.goalImageId
    ? getAllPortfolioItems().find(i => i.id === event.goalImageId)
    : null;

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
        style={[styles.eventCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.eventCardRow}>
          {goalImage ? (
            <Image source={goalImage.image} style={styles.eventThumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.eventThumbnailPlaceholder, { backgroundColor: isDarkMode ? 'rgba(163,66,195,0.15)' : '#F5E6FA' }]}>
              <TabIcon name="star" size={20} color="#a342c3ff" />
            </View>
          )}

          <View style={styles.eventCardInfo}>
            <Text style={[styles.eventCardName, { color: theme.text }]} numberOfLines={1}>
              {event.name}
            </Text>

            <Text style={[styles.eventCountdown, { color: daysUntil <= 7 ? '#FF6B6B' : '#a342c3ff' }]}>
              {daysUntil > 0
                ? `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`
                : daysUntil === 0
                  ? "Today!"
                  : 'Past event'}
            </Text>

            {totalTasks > 0 && (
              <View style={styles.eventProgressRow}>
                <View style={[styles.eventProgressBar, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#F0F0F0' }]}>
                  <View style={[styles.eventProgressFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={[styles.eventProgressText, { color: theme.secondaryText }]}>
                  {completedTasks}/{totalTasks}
                </Text>
              </View>
            )}
          </View>

          <TabIcon name="magnifying-glass" size={16} color={theme.secondaryText} />
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
  const navigation = useNavigation<NavigationProp<ExploreNavParamList>>();
  const { theme, isDarkMode } = useTheme();
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

  // Filtered portfolio data
  const filteredPortfolio = useMemo(() => {
    if (searchQuery.trim()) {
      return searchPortfolio(searchQuery);
    } else if (selectedFilter !== 'All' && filterMap[selectedFilter]) {
      return getPortfolioByCategory(filterMap[selectedFilter]!);
    }
    return getAllPortfolioItems();
  }, [selectedFilter, searchQuery, filterMap]);

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
    (_providerId: string, providerName: string, providerService: string, providerLogo: any) => {
      navigation.navigate('ProviderProfile', {
        providerLogo,
        providerName,
        providerService,
      });
    },
    [navigation]
  );

  const handleBookNow = useCallback(
    (_providerId: string, providerName: string, providerService: string, providerLogo: any) => {
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
        providerLogo,
        providerName,
        providerService,
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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Explore</Text>
          <TouchableOpacity
            style={styles.savedButton}
            onPress={() => navigation.navigate('BookmarkedProviders' as any)}
          >
            <TabIcon name="bookmark" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Sub-tab bar */}
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ============ DISCOVER TAB ============ */}
        {activeTab === 'discover' && (
          <>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: theme.background }]}>
              <View style={[styles.searchBar, { backgroundColor: theme.cardBackground }]}>
                <TabIcon name="magnifying-glass" size={18} color={theme.secondaryText} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search looks, styles, providers..."
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
            <MasonryGrid
              data={filteredPortfolio}
              renderItem={renderPortfolioCard}
              getItemHeight={getItemHeight}
              keyExtractor={item => item.id}
              ListHeaderComponent={
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridCount, { color: theme.secondaryText }]}>
                    {filteredPortfolio.length} looks
                  </Text>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <TabIcon name="magnifying-glass" size={48} color={theme.secondaryText} />
                  <Text style={[styles.emptyText, { color: theme.text }]}>No looks found</Text>
                  <Text style={[styles.emptySubtext, { color: theme.secondaryText }]}>
                    Try a different search or filter
                  </Text>
                </View>
              }
            />
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
                <View style={[styles.emptyPlansIcon, { backgroundColor: isDarkMode ? 'rgba(163,66,195,0.1)' : '#F5E6FA' }]}>
                  <TabIcon name="bookmark" size={36} color="#a342c3ff" />
                </View>
                <Text style={[styles.emptyPlansTitle, { color: theme.text }]}>
                  No plans yet
                </Text>
                <Text style={[styles.emptyPlansText, { color: theme.secondaryText }]}>
                  Browse Discover, find inspo you love, and tap{'\n'}"Plan This" to start building your look
                </Text>
                <TouchableOpacity
                  style={styles.emptyPlansButton}
                  onPress={() => setActiveTab('discover')}
                >
                  <LinearGradient
                    colors={['#a342c3ff', '#8a2fb8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.emptyPlansGradient}
                  >
                    <Text style={styles.emptyPlansButtonText}>Browse Discover</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.createDirectButton}
                  onPress={() => setIsCreateEventVisible(true)}
                >
                  <Text style={styles.createDirectText}>or create a plan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {activeEventId && (
                  <View style={[styles.activeEventBanner, { backgroundColor: isDarkMode ? 'rgba(163,66,195,0.1)' : '#F5E6FA' }]}>
                    <TabIcon name="star" size={14} color="#a342c3ff" />
                    <Text style={styles.activeEventText}>
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
                  style={[styles.newPlanButton, { borderColor: theme.border }]}
                  onPress={() => setIsCreateEventVisible(true)}
                >
                  <Text style={styles.newPlanText}>+ New Plan</Text>
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
  subTabActive: {
    borderBottomColor: '#a342c3ff',
  },
  subTabText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
  },
  subTabTextActive: {
    fontWeight: '700',
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
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  filterScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
  },
  filterChipSelected: {
    backgroundColor: '#a342c3ff',
    borderColor: '#a342c3ff',
  },
  filterChipText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
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
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
    width: '80%',
  },
  emptyPlansGradient: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  emptyPlansButtonText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
  createDirectButton: {
    paddingVertical: spacing.md,
  },
  createDirectText: {
    color: '#a342c3ff',
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
    color: '#a342c3ff',
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
  eventThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
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
    backgroundColor: '#a342c3ff',
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
    color: '#a342c3ff',
    fontSize: fonts.body.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
});
