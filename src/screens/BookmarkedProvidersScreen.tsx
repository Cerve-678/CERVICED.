import React, { useState, useCallback, useLayoutEffect, useRef, useEffect } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { HomeStackParamList } from '../navigation/types';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { getBookmarkedProviders, removeBookmark as dbRemoveBookmark, getActivePromotions } from '../services/databaseService';
import type { DbProvider } from '../types/database';
import Icon from '../components/IconLibrary';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { logger } from '../utils/logger';

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

// ── Skeleton ─────────────────────────────────────────────────────────────────
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
    <View style={[skeletonStyles.card, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Animated.View style={[skeletonStyles.avatar, { backgroundColor: base, opacity }]} />
      <View style={skeletonStyles.info}>
        <Animated.View style={[skeletonStyles.line, { width: '55%', backgroundColor: base, opacity }]} />
        <Animated.View style={[skeletonStyles.line, { width: '35%', backgroundColor: base, opacity }]} />
        <Animated.View style={[skeletonStyles.line, { width: '45%', backgroundColor: base, opacity }]} />
      </View>
      <Animated.View style={[skeletonStyles.badge, { backgroundColor: base, opacity }]} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  info: { flex: 1, marginLeft: 14, gap: 8 },
  line: { height: 11, borderRadius: 6 },
  badge: { width: 44, height: 22, borderRadius: 6, marginLeft: 8 },
});

// ── Main ─────────────────────────────────────────────────────────────────────
export default function BookmarkedProvidersScreen({ navigation }: Props) {
  const { isDarkMode, theme } = useTheme();
  const P = isDarkMode ? D : L;

  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const { removeBookmark, loadBookmarks } = useBookmarkStore();
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceType>('ALL');
  const [liveProviders, setLiveProviders] = useState<Provider[]>([]);
  const [providerIdsWithOffers, setProviderIdsWithOffers] = useState<Set<string>>(new Set());

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
        Animated.timing(sliderLeft,  { toValue: layout.x,     duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(sliderWidth, { toValue: layout.width, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
  }, [sliderLeft, sliderWidth]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: '',
      headerLeft: () => (
        <TouchableOpacity
          style={[styles.navBackButton, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.navBackText, { color: P.text }]}>←</Text>
        </TouchableOpacity>
      ),
      headerStyle: { backgroundColor: 'transparent' },
      headerBackground: () => null,
    });
  }, [navigation, P]);

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
          logger.error('Failed to load bookmarks:', error);
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
      logger.error('Failed to remove bookmark:', error);
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
          <View style={{ paddingTop: 72 }}>
            {[1, 2, 3, 4, 5].map(k => (
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

        {/* ── Header ── */}
        <View style={[styles.screenHeader, { borderBottomColor: P.sep, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.screenTitleRow}>
            <Text style={[styles.screenTitle, { color: P.text }]}>YOUR PROVIDERS</Text>
            {liveProviders.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.countBadgeText, { color: P.sub }]}>{liveProviders.length}</Text>
              </View>
            )}
          </View>

          {liveProviders.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsContent}
            >
              <View style={styles.tabBarInner}>
                <Animated.View
                  style={[styles.tabSlider, { backgroundColor: P.accent, left: sliderLeft, width: sliderWidth }]}
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
                      <View style={[
                        styles.servicePill,
                        {
                          borderColor: P.border,
                          borderWidth: StyleSheet.hairlineWidth,
                        },
                      ]}>
                        <Text style={[styles.serviceText, { color: active ? '#fff' : P.text }]}>
                          {service}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── List ── */}
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          removeClippedSubviews={Platform.OS === 'android'}
        >
          {filteredProviders.length > 0 ? (
            <View style={styles.providersContainer}>
              {filteredProviders.map(provider => (
                <TouchableOpacity
                  key={provider.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleViewProfile(provider.slug);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.providerCard, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                    {provider.logo ? (
                      <Image source={provider.logo} style={styles.providerLogo} resizeMode="cover" />
                    ) : (
                      <View style={[styles.providerLogoPlaceholder, { backgroundColor: P.surface }]}>
                        <Text style={[styles.providerLogoInitial, { color: P.sub }]}>
                          {provider.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.providerInfo}>
                      <Text style={[styles.providerName, { color: P.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                      <View style={styles.metaRow}>
                        <View style={[styles.serviceTag, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                          <Text style={[styles.serviceTagText, { color: P.sub }]}>{provider.service}</Text>
                        </View>
                        {providerIdsWithOffers.has(provider.id) && (
                          <View style={[styles.offerBadge, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                            <Text style={[styles.offerBadgeText, { color: P.accent }]}>OFFER</Text>
                          </View>
                        )}
                      </View>
                      {provider.location ? (
                        <Text style={[styles.locationText, { color: P.sub }]} numberOfLines={1}>
                          {provider.location}
                        </Text>
                      ) : null}
                      <View style={styles.ratingRow}>
                        <Icon name="star" size={11} color={P.accent} />
                        <Text style={[styles.ratingText, { color: P.sub }]}>{provider.rating}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.bookmarkButton, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        handleRemoveBookmark(provider.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Icon name="bookmark" size={15} color={P.accent} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

          ) : liveProviders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyCard, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  navBackButton: {
    marginLeft: 16,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBackText: {
    fontSize: 18,
    fontWeight: '600',
  },

  screenHeader: {
    paddingTop: 72,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  screenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  screenTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    fontWeight: '700',
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

  tabsContent: {
    paddingRight: 16,
    flexDirection: 'row',
  },
  tabBarInner: {
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
  serviceButton: { marginRight: 0 },
  servicePill: {
    borderRadius: 100,
    paddingHorizontal: Platform.OS === 'android' ? 14 : 18,
    height: Platform.OS === 'android' ? 30 : 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },

  scrollContainer: { flex: 1 },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 120 : 140,
  },

  providersContainer: { gap: 10 },
  providerCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
  },
  providerLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerLogoInitial: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
  },
  providerInfo: { flex: 1 },
  providerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  serviceTag: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  serviceTagText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.3,
  },
  offerBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  offerBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  locationText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginBottom: 4,
    opacity: 0.7,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
  },
  bookmarkButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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
