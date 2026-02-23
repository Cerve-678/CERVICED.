import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { HomeStackParamList } from '../navigation/types';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import Icon from '../components/IconLibrary';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

const { width } = Dimensions.get('window');

type ServiceType = 'ALL' | 'HAIR' | 'NAILS' | 'MUA' | 'LASHES' | 'AESTHETICS' | 'BROWS';

type BookmarkedProvidersScreenNavigationProp = StackNavigationProp<HomeStackParamList, 'BookmarkedProviders'>;

interface Props {
  navigation: BookmarkedProvidersScreenNavigationProp;
}

interface Provider {
  id: string;
  name: string;
  service: string;
  logo: any;
  location: string;
  rating: number;
}

const allProviders: Provider[] = [
  {
    id: 'styled-by-kathrine',
    name: 'Styled by Kathrine',
    service: 'HAIR',
    logo: require('../../assets/logos/styledbykathrine.png'),
    location: 'North West London',
    rating: 5.0,
  },
  {
    id: 'hair-by-jennifer',
    name: 'Hair by Jennifer',
    service: 'HAIR',
    logo: require('../../assets/logos/hairbyjennifer.png'),
    location: 'Central London',
    rating: 4.9,
  },
  {
    id: 'diva-nails',
    name: 'Diva Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/divanails.png'),
    location: 'South London',
    rating: 5.0,
  },
  {
    id: 'makeup-by-mya',
    name: 'Makeup by Mya',
    service: 'MUA',
    logo: require('../../assets/logos/makeupbymya.png'),
    location: 'East London',
    rating: 4.8,
  },
  {
    id: 'your-lashed',
    name: 'Your Lashed',
    service: 'LASHES',
    logo: require('../../assets/logos/yourlashed.png'),
    location: 'West London',
    rating: 4.9,
  },
  {
    id: 'vikki-laid',
    name: 'Vikki Laid',
    service: 'HAIR',
    logo: require('../../assets/logos/vikkilaid.png'),
    location: 'North London',
    rating: 4.7,
  },
  {
    id: 'kiki-nails',
    name: 'Kiki Nails',
    service: 'NAILS',
    logo: require('../../assets/logos/kikisnails.png'),
    location: 'Central London',
    rating: 4.8,
  },
  {
    id: 'jana-aesthetics',
    name: 'Jana Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/janaaesthetics.png'),
    location: 'West London',
    rating: 4.9,
  },
  {
    id: 'her-brows',
    name: 'Her Brows',
    service: 'BROWS',
    logo: require('../../assets/logos/herbrows.png'),
    location: 'South East London',
    rating: 4.8,
  },
  {
    id: 'rosemay-aesthetics',
    name: 'RoseMay Aesthetics',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/RoseMayAesthetics.png'),
    location: 'North London',
    rating: 4.9,
  },
  {
    id: 'fillerbyjess',
    name: 'Filler by Jess',
    service: 'AESTHETICS',
    logo: require('../../assets/logos/fillerbyjess.png'),
    location: 'Central London',
    rating: 4.7,
  },
  {
    id: 'eyebrowdeluxe',
    name: 'Eyebrow Deluxe',
    service: 'BROWS',
    logo: require('../../assets/logos/eyebrowdeluxe.png'),
    location: 'East London',
    rating: 4.8,
  },
  {
    id: 'lashesgalore',
    name: 'Lashes Galore',
    service: 'LASHES',
    logo: require('../../assets/logos/lashesgalore.png'),
    location: 'South London',
    rating: 4.9,
  },
  {
    id: 'zeenail-artist',
    name: 'Zee Nail Artist',
    service: 'NAILS',
    logo: require('../../assets/logos/ZeeNail Artist.png'),
    location: 'East London',
    rating: 4.8,
  },
  {
    id: 'painted-by-zoe',
    name: 'Painted by Zoe',
    service: 'MUA',
    logo: require('../../assets/logos/paintedbyZoe.png'),
    location: 'West London',
    rating: 4.9,
  },
  {
    id: 'braided-slick',
    name: 'Braided Slick',
    service: 'HAIR',
    logo: require('../../assets/logos/braided slick.png'),
    location: 'North West London',
    rating: 5.0,
  },
];

// Service Tab Button Component with Haptic Feedback and Subtle Animation
interface ServiceTabProps {
  service: ServiceType;
  isSelected: boolean;
  onPress: () => void;
  onBack?: () => void;
  theme: any;
  isDarkMode: boolean;
  showBackArrow?: boolean;
}

function ServiceTab({ service, isSelected, onPress, onBack, theme, isDarkMode, showBackArrow }: ServiceTabProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 1.08,
      useNativeDriver: true,
      speed: 80,
      bounciness: 12,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
      bounciness: 8,
    }).start();
  };

  const handlePress = async () => {
    // Trigger haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const handleBackPress = async (e: any) => {
    e.stopPropagation();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) onBack();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={styles.serviceButton}
    >
      <Animated.View
        style={[
          styles.glassCard,
          {
            transform: [{ scale: scaleAnim }],
            backgroundColor:
              isSelected
                ? isDarkMode
                  ? 'rgba(163, 66, 195, 0.4)'
                  : 'rgba(218, 112, 214, 0.3)'
                : isDarkMode
                ? 'rgba(58, 58, 60, 0.8)'
                : 'rgba(255, 255, 255, 0.15)',
            borderTopColor:
              isSelected
                ? isDarkMode
                  ? 'rgba(163, 66, 195, 0.7)'
                  : 'rgba(218, 112, 214, 0.6)'
                : isDarkMode
                ? theme.border
                : 'rgba(255, 255, 255, 0.7)',
            borderLeftColor:
              isSelected
                ? isDarkMode
                  ? 'rgba(163, 66, 195, 0.6)'
                  : 'rgba(218, 112, 214, 0.5)'
                : isDarkMode
                ? theme.border
                : 'rgba(255, 255, 255, 0.5)',
          },
        ]}
        shouldRasterizeIOS={true}
        renderToHardwareTextureAndroid={true}
      >
        <Text style={[styles.serviceText, { color: isSelected ? '#A342C3' : theme.text }]}>{service}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function BookmarkedProvidersScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { bookmarkedIds, removeBookmark, loadBookmarks } = useBookmarkStore();
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceType>('ALL');

  // Get unique bookmarked providers
  const uniqueBookmarkIds = [...new Set(bookmarkedIds)];
  const bookmarkedProviders = allProviders.filter(provider =>
    uniqueBookmarkIds.includes(provider.id)
  );

  const filteredProviders = selectedService === 'ALL'
    ? bookmarkedProviders
    : bookmarkedProviders.filter(provider => provider.service === selectedService);

  const serviceCategories: ServiceType[] = ['ALL', 'HAIR', 'NAILS', 'MUA', 'LASHES', 'AESTHETICS', 'BROWS'];

  // Configure transparent system header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle: '',
      headerLeft: () => (
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BlurView intensity={35} tint={theme.blurTint} style={styles.navBackButtonBlur}>
            <Text style={[styles.navBackText, { color: theme.text }]}>←</Text>
          </BlurView>
        </TouchableOpacity>
      ),
      headerStyle: {
        backgroundColor: 'transparent',
      },
      headerBackground: () => null,
    });
  }, [navigation, theme]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          await loadBookmarks();
          if (__DEV__) console.log('Loaded bookmark IDs:', bookmarkedIds);
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
      await removeBookmark(providerId);
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  const handleViewProfile = (providerId: string) => {
    navigation.navigate('ProviderProfile', { providerId });
  };

  if (loading) {
    return (
      <ThemedBackground>
        <StatusBar barStyle={theme.statusBar} />
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={styles.background}>
      <StatusBar barStyle={theme.statusBar} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header Section */}
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>YOUR PROVIDERS</Text>

          {/* Service Tabs */}
          {bookmarkedProviders.length > 0 && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsContent}
                decelerationRate="fast"
                scrollEventThrottle={16}
                removeClippedSubviews={true}
                nestedScrollEnabled={false}
                overScrollMode="never"
              >
                {serviceCategories.map((service) => (
                  <ServiceTab
                    key={service}
                    service={service}
                    isSelected={selectedService === service}
                    onPress={() => {
                      setSelectedService(service);
                    }}
                    onBack={() => {
                      setSelectedService('ALL');
                    }}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    showBackArrow={selectedService !== 'ALL'}
                  />
                ))}
              </ScrollView>
            </>
          )}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          removeClippedSubviews={Platform.OS === 'android'}
          scrollEventThrottle={16}
          decelerationRate="fast"
          overScrollMode="never"
          bounces={true}
        >
          {/* Provider Cards - Full Width Rows */}
          {filteredProviders.length > 0 ? (
            <View style={styles.providersContainer}>
              {filteredProviders.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={styles.providerCard}
                  onPress={() => handleViewProfile(provider.id)}
                  activeOpacity={0.9}
                >
                  <BlurView intensity={40} tint={theme.blurTint} style={styles.cardBlur}>
                    {/* Circular Logo */}
                    <Image source={provider.logo} style={styles.providerLogo} />

                    {/* Provider Info */}
                    <View style={styles.providerInfo}>
                      <Text style={[styles.providerName, { color: theme.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                      <View style={styles.serviceTag}>
                        <Text style={styles.serviceTagText}>{provider.service}</Text>
                      </View>
                      <Text style={[styles.locationText, { color: theme.secondaryText }]} numberOfLines={1}>
                        {provider.location}
                      </Text>
                      <View style={styles.ratingRow}>
                        <Icon name="star" size={14} color="#FFD700" />
                        <Text style={[styles.ratingText, { color: theme.text }]}>{provider.rating}</Text>
                      </View>
                    </View>

                    {/* Bookmark Button */}
                    <TouchableOpacity
                      style={styles.bookmarkButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleRemoveBookmark(provider.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Icon name="bookmark" size={18} color="#8A2BE2" />
                    </TouchableOpacity>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </View>
          ) : bookmarkedProviders.length === 0 ? (
            <View style={styles.emptyState}>
              <BlurView intensity={30} tint={theme.blurTint} style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Saved Providers</Text>
                <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                  Bookmark your favorite providers to find them quickly
                </Text>
                <TouchableOpacity
                  style={styles.exploreButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#DA70D6', '#B968C7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.exploreGradient}
                  >
                    <Text style={styles.exploreText}>Explore Providers</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </BlurView>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <BlurView intensity={30} tint={theme.blurTint} style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No {selectedService} Providers</Text>
                <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                  You haven't bookmarked any {selectedService.toLowerCase()} providers yet
                </Text>
              </BlurView>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBackButton: {
    marginLeft: dimensions.navBackButton.marginLeft,
    borderRadius: dimensions.navBackButton.borderRadius,
    overflow: 'hidden',
  },
  navBackButtonBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    width: dimensions.navBackButton.width,
    height: dimensions.navBackButton.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBackText: {
    fontSize: dimensions.navBackButton.fontSize,
    fontWeight: '600',
  },
  screenHeader: {
    paddingTop: dimensions.screenHeader.paddingTop,
    paddingBottom: dimensions.screenHeader.paddingBottom,
    paddingHorizontal: dimensions.screenHeader.paddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  screenTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: dimensions.screenTitle.fontSize,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  tabsScroll: {
    paddingVertical: dimensions.scroll.verticalPadding,
    marginTop: spacing.xs,
  },
  tabsContent: {
    paddingHorizontal: 0,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: dimensions.scroll.paddingTop,
    paddingHorizontal: dimensions.scroll.paddingHorizontal,
    paddingBottom: Platform.OS === 'android' ? 120 : 140, // Extra space for bottom tab bar
  },
  serviceButton: {
    marginRight: dimensions.servicePill.marginRight,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 120,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderLeftColor: 'rgba(255, 255, 255, 0.7)',
    borderRightColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: Platform.OS === 'android' ? 14 : 18,
    height: Platform.OS === 'android' ? 28 : 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  backArrowInTab: {
    marginRight: 6,
    paddingHorizontal: 2,
  },
  backArrowText: {
    fontSize: 14,
    fontWeight: '700',
  },
  serviceText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.serviceText,
  },
  providersContainer: {
    gap: dimensions.card.gap,
  },
  providerCard: {
    width: '100%',
    borderRadius: dimensions.card.borderRadius,
    overflow: 'hidden',
  },
  cardBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: dimensions.card.borderRadius,
    borderWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 1)',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomColor: 'rgba(255, 255, 255, 0.5)',
    padding: dimensions.card.padding,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 4,
      height: 8,
    },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 12,
  },
  providerLogo: {
    width: dimensions.providerLogo.size,
    height: dimensions.providerLogo.size,
    borderRadius: dimensions.providerLogo.borderRadius,
    borderWidth: dimensions.providerLogo.borderWidth,
    borderColor: 'rgba(255,255,255,0.6)',
    marginRight: dimensions.providerLogo.marginRight,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: fonts.providerName,
    fontWeight: '700',
    marginBottom: spacing.xs,
    fontFamily: 'BakbakOne-Regular',
  },
  serviceTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(138, 43, 226, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.sm,
    marginBottom: spacing.xs,
  },
  serviceTagText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#8A2BE2',
    fontFamily: 'Jura-VariableFont_wght bold ',
  },
  locationText: {
    fontSize: fonts.locationText,
    marginBottom: spacing.xs,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '300',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.xs,
  },
  ratingText: {
    fontSize: fonts.ratingText,
    fontWeight: '900',
    fontFamily: 'Jura-VariableFont_wght',
  },
  bookmarkButton: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    backgroundColor: 'rgba(138, 43, 226, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: dimensions.emptyState.paddingTop,
  },
  emptyCard: {
    width: width - dimensions.emptyState.width,
    borderRadius: dimensions.card.borderRadius,
    padding: dimensions.emptyState.cardPadding,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 1)',
    borderLeftColor: 'rgba(255, 255, 255, 0.8)',
    borderRightColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomColor: 'rgba(255, 255, 255, 0.4)',
  },
  emptyTitle: {
    fontSize: fonts.title.medium,
    fontWeight: '700',
    marginBottom: spacing.sm,
    fontFamily: 'BakbakOne-Regular',
  },
  emptyText: {
    fontSize: fonts.body.medium,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: fonts.lineHeight.normal,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '900',
  },
  exploreButton: {
    borderRadius: dimensions.button.medium.borderRadius,
    overflow: 'hidden',
  },
  exploreGradient: {
    paddingHorizontal: dimensions.button.medium.paddingHorizontal,
    paddingVertical: dimensions.button.medium.paddingVertical,
  },
  exploreText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'BakbakOne-Regular',
  },
  hairTypeFilterContainer: {
    marginTop: spacing.md,
  },
  filterLabel: {
    fontSize: fonts.body.small,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.sm,
  },
  hairTypeScroll: {
    marginBottom: spacing.xs,
  },
  hairTypeContent: {
    gap: spacing.sm,
  },
  hairTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1.5,
    borderRightColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  hairTypeText: {
    fontSize: fonts.body.small,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
}); 