import React, { useState, useCallback, useLayoutEffect, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { HomeStackParamList } from '../navigation/types';
import { useBooking, BookingStatus } from '../contexts/BookingContext';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { getBookmarkedProviders, removeBookmark as dbRemoveBookmark, getActivePromotions } from '../services/databaseService';
import type { DbProvider } from '../types/database';
import Icon from '../components/IconLibrary';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';

// ── Design tokens ─────────────────────────────────────────────────────────────
const L = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', text: '#000000', sub: '#7E6667',
  border: 'rgba(126,102,103,0.14)', sep: 'rgba(126,102,103,0.08)',
};
const D = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667',
  border: 'rgba(126,102,103,0.18)', sep: 'rgba(126,102,103,0.10)',
};

type ServiceType = 'ALL' | 'HAIR' | 'NAILS' | 'MUA' | 'LASHES' | 'AESTHETICS' | 'BROWS';
type BookmarkedProvidersScreenNavigationProp = StackNavigationProp<HomeStackParamList, 'BookmarkedProviders'>;

interface Props {
  navigation: BookmarkedProvidersScreenNavigationProp;
}

interface Provider {
  id: string;   // UUID — for bookmark remove operations
  slug: string; // slug — for navigation to ProviderProfile
  name: string;
  service: string;
  logo: any;
  location: string;
  rating: number;
}

function mapDbProvider(p: DbProvider): Provider {
  return {
    id: p.id,
    slug: p.slug,
    name: p.display_name,
    service: p.service_category,
    logo: p.logo_url ? { uri: p.logo_url } : null,
    location: p.location_text ?? '',
    rating: p.rating,
  };
}

// ── Skeleton (mirrors the 2-col gallery grid) ─────────────────────────────────
function SkeletonProviderCard({ isDarkMode }: { isDarkMode: boolean }) {
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
  const P = isDarkMode ? D : L;
  const base = isDarkMode ? '#3A3A3C' : '#E5E5EA';
  return (
    <View style={skeletonStyles.card}>
      <Animated.View style={[skeletonStyles.image, { backgroundColor: base, opacity }]} />
      <Animated.View style={[skeletonStyles.line, { width: '70%', backgroundColor: base, opacity }]} />
      <Animated.View style={[skeletonStyles.line, { width: '45%', backgroundColor: base, opacity, marginTop: 6 }]} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: { width: '48%', marginBottom: 20 },
  image: { width: '100%', aspectRatio: 0.8, borderRadius: 18, marginBottom: 10 },
  line: { height: 10, borderRadius: 5 },
});

// ── Main ─────────────────────────────────────────────────────────────────────
export default function BookmarkedProvidersScreen({ navigation }: Props) {
  const { isDarkMode, theme } = useTheme();
  const P = isDarkMode ? D : L;
  const insets = useSafeAreaInsets();


  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const { removeBookmark, loadBookmarks } = useBookmarkStore();
  const { bookings } = useBooking();
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceType>('ALL');
  const [liveProviders, setLiveProviders] = useState<Provider[]>([]);
  const [providerIdsWithOffers, setProviderIdsWithOffers] = useState<Set<string>>(new Set());

  // How many completed appointments the client has had with each provider —
  // powers the "X appointments" badge on the card.
  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      if (b.status !== BookingStatus.COMPLETED || !b.providerId) continue;
      counts[b.providerId] = (counts[b.providerId] ?? 0) + 1;
    }
    return counts;
  }, [bookings]);

  const filteredProviders = selectedService === 'ALL'
    ? liveProviders
    : liveProviders.filter(p => p.service === selectedService);

  const serviceCategories: ServiceType[] = ['ALL', 'HAIR', 'NAILS', 'MUA', 'LASHES', 'AESTHETICS', 'BROWS'];

  const sliderLeft   = useRef(new Animated.Value(0)).current;
  const sliderWidth   = useRef(new Animated.Value(0)).current;
  const tabLayouts    = useRef<Record<string, { x: number; width: number }>>({});
  const sliderReady   = useRef(false);

  const handleTabLayout = useCallback((key: string, x: number, width: number) => {
    tabLayouts.current[key] = { x, width };
    if (!sliderReady.current && key === 'ALL') {
      sliderLeft.setValue(x);
      sliderWidth.setValue(width);
      sliderReady.current = true;
    }
  }, [sliderLeft, sliderWidth]);

  const handleServicePress = useCallback((service: ServiceType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(service);
    const layout = tabLayouts.current[service];
    if (layout) {
      Animated.parallel([
        Animated.timing(sliderLeft,  { toValue: layout.x,     duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(sliderWidth, { toValue: layout.width, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [sliderLeft, sliderWidth]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitleAlign: 'center',
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          <Text style={[styles.screenTitle, { color: P.text }]}>YOUR PROVIDERS</Text>
          {liveProviders.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.countBadgeText, { color: P.sub }]}>{liveProviders.length}</Text>
            </View>
          )}
        </View>
      ),
      headerLeft: () => (
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.navBackText}>←</Text>
        </TouchableOpacity>
      ),
      headerStyle: { backgroundColor: 'transparent' },
      headerBackground: () => null,
    });
  }, [navigation, P, liveProviders.length]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          await loadBookmarks();
          const supabaseData = await getBookmarkedProviders();
          setLiveProviders(supabaseData.map(mapDbProvider));
          try {
            const promos = await getActivePromotions();
            setProviderIdsWithOffers(new Set(promos.map(p => p.provider_id)));
          } catch { /* silent */ }
        } catch (error) {
          console.error('Failed to load bookmarks:', error);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [loadBookmarks])
  );

  const handleRemoveBookmark = async (providerId: string) => {
    try {
      await dbRemoveBookmark(providerId).catch(() => {});
      setLiveProviders(prev => prev.filter(p => p.id !== providerId));
      await removeBookmark(providerId);
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  const handleViewProfile = (providerId: string) => {
    navigation.navigate('ProviderProfile', { providerId });
  };

  if (loading || !fontsLoaded) {
    return (
      <ThemedBackground>
        <StatusBar barStyle={theme.statusBar} />
        <SafeAreaView style={styles.container}>
          <View style={[styles.gridRow, { paddingTop: insets.top + 48, paddingHorizontal: 16 }]}>
            {[1, 2, 3, 4, 5, 6].map(k => (
              <SkeletonProviderCard key={k} isDarkMode={isDarkMode} />
            ))}
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <StatusBar barStyle={theme.statusBar} />
      <SafeAreaView style={styles.container} edges={['bottom']}>

        {/* ── Header (tabs only — title now lives in the nav bar) ── */}
        <View style={[styles.screenHeader, { paddingTop: insets.top + 64, borderBottomColor: P.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          {liveProviders.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsContent}
            >
              <Animated.View
                style={[styles.tabSlider, { backgroundColor: '#000000', left: sliderLeft, width: sliderWidth }]}
              />
              {serviceCategories.map(service => {
                const active = selectedService === service;
                return (
                  <TouchableOpacity
                    key={service}
                    style={styles.serviceButton}
                    onLayout={e => handleTabLayout(service, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
                    onPress={() => handleServicePress(service)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.servicePill, { borderColor: P.border, backgroundColor: active ? 'transparent' : P.surface }]}>
                      <Text style={[styles.serviceText, { color: active ? '#fff' : P.text }]}>
                        {service}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Gallery grid ── */}
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          removeClippedSubviews={Platform.OS === 'android'}
        >
          {filteredProviders.length > 0 ? (
            <View style={styles.gridRow}>
              {filteredProviders.map((provider, index) => (
                <BookmarkGridCard
                  key={provider.id}
                  provider={provider}
                  index={index}
                  hasOffer={providerIdsWithOffers.has(provider.id)}
                  appointmentCount={appointmentCounts[provider.id] ?? 0}
                  P={P}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleViewProfile(provider.slug);
                  }}
                  onRemove={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleRemoveBookmark(provider.id);
                  }}
                />
              ))}
            </View>

          ) : liveProviders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyCard, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: P.surface }]}>
                  <Icon name="bookmark" size={26} color={P.accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: P.text }]}>No Saved Providers</Text>
                <Text style={[styles.emptySubtitle, { color: P.sub }]}>
                  Save providers you love to find them quickly here
                </Text>
                <TouchableOpacity
                  style={[styles.exploreButton, { backgroundColor: P.accent }]}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exploreButtonText}>Explore Providers</Text>
                </TouchableOpacity>
              </View>
            </View>

          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyCard, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: P.surface }]}>
                  <Icon name="bookmark" size={26} color={P.accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: P.text }]}>No {selectedService} providers saved</Text>
                <Text style={[styles.emptySubtitle, { color: P.sub }]}>
                  You haven't bookmarked any {selectedService.toLowerCase()} providers yet
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Gallery card — photo-forward, matches the app's portfolio-card language ──
interface BookmarkGridCardProps {
  provider: Provider;
  index: number;
  hasOffer: boolean;
  appointmentCount: number;
  P: typeof L;
  onPress: () => void;
  onRemove: () => void;
}

function BookmarkGridCard({ provider, index, hasOffer, appointmentCount, P, onPress, onRemove }: BookmarkGridCardProps) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const delay = (index % 10) * 90;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 560, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 560, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.gridCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
        <View style={styles.imageWrap}>
          {provider.logo ? (
            <Image source={provider.logo} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: P.surface }]}>
              <Text style={[styles.imagePlaceholderInitial, { color: P.sub }]}>
                {provider.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.75)']}
            style={styles.imageGradient}
            pointerEvents="none"
          />

          {/* Floating top row */}
          <View style={styles.topRow}>
            <View style={styles.topLeftChips}>
              <View style={styles.ratingChip}>
                <Icon name="star" size={9} color="#FFC94D" />
                <Text style={styles.ratingChipText}>{provider.rating}</Text>
              </View>
              {hasOffer && (
                <View style={[styles.offerChip, { backgroundColor: P.accent }]}>
                  <Text style={styles.offerChipText}>OFFER</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.bookmarkFloating}
              onPress={(e) => { e.stopPropagation(); onRemove(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Icon name="bookmark" size={14} color={P.accent} />
            </TouchableOpacity>
          </View>

          {/* Name + service overlay on the gradient */}
          <View style={styles.imageOverlayInfo}>
            <Text style={styles.overlayName} numberOfLines={1}>{provider.name}</Text>
            <View style={styles.overlayServiceChip}>
              <Text style={styles.overlayServiceText}>{provider.service}</Text>
            </View>
          </View>
        </View>

        {(provider.location || appointmentCount > 0) && (
          <View style={styles.metaCaptionRow}>
            {provider.location ? (
              <Text style={[styles.locationCaption, { color: P.text }]} numberOfLines={1}>
                {provider.location}
              </Text>
            ) : null}

            {appointmentCount > 0 && (
              <View style={[styles.visitsChip, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.visitsChipText, { color: P.text }]}>
                  {appointmentCount} {appointmentCount === 1 ? 'appointment' : 'appointments'}
                </Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Matches ProviderProfileScreen's nav back button exactly — circular glass
  // button, fixed dark arrow, so it reads as one nav-bar language app-wide.
  navBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    marginLeft: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  navBackText: {
    fontSize: 24,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },

  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: '700',
  },

  screenHeader: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  tabsContent: {
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabSlider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 100,
  },
  serviceButton: {
    marginRight: 0,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  // Each tab is its own frosted-glass chip now, rather than one shared bar.
  servicePill: {
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Platform.OS === 'android' ? 18 : 22,
    height: Platform.OS === 'android' ? 38 : 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },

  scrollContainer: { flex: 1 },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 120 : 140,
  },

  // ── Gallery grid ──
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    marginBottom: 20,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderInitial: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 30,
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },

  topRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  topLeftChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  ratingChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  offerChip: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  offerChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 8,
    letterSpacing: 0.4,
    color: '#FFFFFF',
  },
  bookmarkFloating: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  imageOverlayInfo: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  overlayName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlayServiceChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  overlayServiceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 8.5,
    letterSpacing: 0.3,
    color: '#FFFFFF',
  },

  metaCaptionRow: {
    marginTop: 8,
    gap: 6,
  },
  locationCaption: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
  },
  visitsChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  visitsChipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10.5,
    fontWeight: '700',
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyCard: {
    width: '100%',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 19,
    opacity: 0.7,
  },
  exploreButton: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  exploreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
});
