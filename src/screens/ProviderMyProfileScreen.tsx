import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { loadProviderFromSupabase } from '../services/providerRegistrationService';
import type { ProviderRegistrationData } from '../services/providerRegistrationService';
import { getProviderPortfolio, getMyProviderReviews } from '../services/databaseService';
import type { DbPortfolioItem } from '../types/database';
import { supabase } from '../lib/supabase';
import { resolveProviderTheme, withAlpha, isDarkColor } from '../constants/providerThemes';
import AppBackground from '../components/AppBackground';

const { width: screenWidth } = Dimensions.get('window');

interface Props {
  navigation: any;
}

// Mirrors ProviderProfileScreen's live design (theme, typography, section set,
// Portfolio) so a provider's own view of their profile is what a client sees.
// Rebuild this whenever that screen changes.
export default function ProviderMyProfileScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
    'Prata-Regular': require('../../assets/fonts/Prata-Regular.ttf'),
  });
  const [providerData, setProviderData] = useState<ProviderRegistrationData | null>(null);
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<DbPortfolioItem[]>([]);
  const [reviews, setReviews] = useState<{ id: string; name: string; rating: number; comment: string; date: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showFullAbout, setShowFullAbout] = useState(false);

  // Reload data every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setIsLoading(true);
        try {
          let parsed: ProviderRegistrationData | null = null;

          if (user?.id) {
            parsed = await loadProviderFromSupabase(user.id);
            const { data } = await supabase
              .from('providers')
              .select('id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (data?.id) {
              setProviderDbId(data.id);
              getProviderPortfolio(data.id).then(setPortfolio).catch(() => {});
              getMyProviderReviews()
                .then(dbReviews => setReviews(dbReviews.map(r => ({
                  id: r.id,
                  name: r.user?.name ?? 'Anonymous',
                  rating: r.rating,
                  comment: r.comment ?? '',
                  date: new Date(r.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  }),
                }))))
                .catch(() => {});
            }
          }

          setProviderData(parsed);
          if (parsed) {
            const cats = Object.keys(parsed.categories);
            if (cats.length > 0 && !cats.includes(selectedCategory)) {
              setSelectedCategory(cats[0] ?? '');
            }
          }
        } catch (e) {
          console.error('Error loading provider data:', e);
        } finally {
          setIsLoading(false);
        }
      };
      load();
    }, [user?.id])
  );

  const categoryNames = useMemo(() => {
    if (!providerData) return [];
    return Object.keys(providerData.categories);
  }, [providerData]);

  const currentServices = useMemo(() => {
    if (!providerData || !selectedCategory) return [];
    return providerData.categories[selectedCategory] || [];
  }, [providerData, selectedCategory]);

  // Provider-only stat — not shown to clients, but useful context on their own profile
  const totalServices = useMemo(() => {
    if (!providerData) return 0;
    return Object.values(providerData.categories).reduce((sum, arr) => sum + arr.length, 0);
  }, [providerData]);

  const serviceType = useMemo(() => {
    if (!providerData) return '';
    return providerData.providerService === 'OTHER'
      ? providerData.customServiceType
      : providerData.providerService;
  }, [providerData]);

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile');
  }, [navigation]);

  const PP = useMemo(
    () => resolveProviderTheme(providerData?.profileTheme),
    [providerData?.profileTheme]
  );
  const cardBg = withAlpha(PP.card, PP.isDark ? 0.5 : 0.9);
  const accentColor = providerData?.accentColor || PP.accent;
  // Some backdrops (Cream, Sky, Blush…) are pale — white hero text needs to
  // flip to dark there, matching ProviderProfileScreen's contrast logic.
  const heroIsDark = isDarkColor(providerData?.gradient[0] ?? PP.hero);
  const heroText = heroIsDark ? '#fff' : '#26201E';
  const heroSub = heroIsDark ? 'rgba(255,255,255,0.96)' : 'rgba(38,32,30,0.78)';
  const heroShadow = heroIsDark
    ? { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }
    : undefined;

  // Loading state — waiting for Supabase / fonts
  if (isLoading || !fontsLoaded) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#a342c3" />
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  // Empty state — no profile submitted yet
  if (!providerData) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <Ionicons name="storefront-outline" size={72} color={theme.text + '30'} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Set Up Your Profile
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.text + '66' }]}>
              Create your provider profile so clients can discover and book your services.
            </Text>
            <TouchableOpacity
              style={[styles.setupButton, { backgroundColor: '#007AFF' }]}
              onPress={handleEditProfile}
            >
              <Text style={styles.setupButtonText}>Create Profile</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: PP.bg }]}>
      {/* Hero backdrop — matches ProviderProfileScreen's hero-then-sheet split */}
      <LinearGradient
        colors={[providerData.gradient[0] ?? PP.hero, PP.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.heroImage}
      />

      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Edit Button (top right) */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              {providerData.logo ? (
                <Image
                  source={{ uri: providerData.logo }}
                  style={styles.providerLogo}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.providerLogo, styles.logoPlaceholder]}>
                  <Text style={styles.logoPlaceholderText}>
                    {providerData.providerName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                style={styles.logoGloss}
              />
            </View>
          </View>

          {/* Provider Info */}
          <View style={styles.providerInfoCenter}>
            <Text style={[styles.providerNameLarge, { color: heroText }, heroShadow]}>
              {providerData.providerName || 'Your Business Name'}
            </Text>

            <Text style={[styles.metaText, { color: heroSub }, heroShadow]}>
              {(serviceType || 'SERVICE').toUpperCase()}
              {providerData.location ? ` · ${providerData.location.toUpperCase()}` : ''}
            </Text>

            {providerData.yearsExperience ? (
              <Text style={[styles.yearsText, { color: heroSub }, heroShadow]}>{providerData.yearsExperience} years experience</Text>
            ) : null}

            {providerData.slotsText ? (
              <View style={[styles.slotsPill, { backgroundColor: cardBg, borderColor: PP.border }]}>
                <Text style={[styles.slotsText, { color: PP.sub }]}>{providerData.slotsText}</Text>
              </View>
            ) : null}

            {/* Stats — provider-only context, not shown to clients */}
            <View style={[styles.statsRow, { backgroundColor: cardBg, borderColor: PP.border }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: PP.text }]}>{totalServices}</Text>
                <Text style={[styles.statLabel, { color: PP.sub }]}>Services</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: PP.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: PP.text }]}>{categoryNames.length}</Text>
                <Text style={[styles.statLabel, { color: PP.sub }]}>Categories</Text>
              </View>
            </View>
          </View>

          {/* About Section */}
          {providerData.aboutText ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: PP.border }]}>
              <Text style={[styles.sectionTitle, { color: PP.text }]}>About</Text>
              <Text style={[styles.aboutText, { color: PP.sub }]}>
                {showFullAbout
                  ? providerData.aboutText
                  : providerData.aboutText.length > 150
                  ? `${providerData.aboutText.substring(0, 150)}...`
                  : providerData.aboutText}
              </Text>
              {providerData.aboutText.length > 150 && (
                <TouchableOpacity
                  onPress={() => setShowFullAbout(!showFullAbout)}
                  style={styles.moreButton}
                >
                  <Text style={[styles.moreButtonText, { color: PP.text }]}>
                    {showFullAbout ? 'Show Less' : 'More'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Services Section */}
          {categoryNames.length > 0 && (
            <View style={styles.servicesSection}>
              <Text style={[styles.sectionTitleNoCard, { color: PP.text }]}>Services</Text>

              {/* Category Tabs */}
              <FlatList
                data={categoryNames}
                renderItem={({ item: category }) => {
                  const selected = selectedCategory === category;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.categoryTab,
                        { borderColor: selected ? 'transparent' : PP.border, backgroundColor: selected ? accentColor : cardBg },
                      ]}
                      onPress={() => setSelectedCategory(category)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.categoryTabText, { color: selected ? '#fff' : PP.text }]}>
                        {category}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                keyExtractor={(item) => item}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryTabsContent}
              />

              {/* Service Cards */}
              {currentServices.map((service) => (
                <View key={service.id} style={[styles.serviceItemCard, { backgroundColor: cardBg, borderColor: PP.border }]}>
                  <View style={styles.serviceItem}>
                    {/* Service Image — accent-tinted initial when no photo, so
                        description text starts at the same x on every card */}
                    {service.images && service.images.length > 0 ? (
                      <Image
                        source={{ uri: service.images[0] }}
                        style={styles.serviceImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.serviceImage, styles.serviceImagePlaceholder, { backgroundColor: accentColor + '1C' }]}>
                        <Text style={[styles.serviceImagePlaceholderText, { color: accentColor }]}>
                          {service.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    {/* Service Info */}
                    <View style={styles.serviceInfo}>
                      <Text style={[styles.serviceName, { color: PP.text }]}>{service.name}</Text>
                      {service.description ? (
                        <Text style={[styles.serviceDescription, { color: PP.sub }]} numberOfLines={2}>
                          {service.description}
                        </Text>
                      ) : null}
                      <View style={styles.serviceDetails}>
                        <Text style={[styles.serviceDuration, { color: PP.sub }]}>{service.duration}</Text>
                        <Text style={[styles.servicePrice, { color: PP.text }]}>
                          {'£'}{service.price}
                        </Text>
                      </View>
                      {service.addOns && service.addOns.length > 0 && (
                        <View style={styles.addOnsRow}>
                          <Text style={[styles.addOnsLabel, { color: PP.sub }]}>
                            +{service.addOns.length} add-on{service.addOns.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: PP.border }]}>
              <Text style={[styles.sectionTitle, { color: PP.text }]}>Reviews</Text>
              {reviews.slice(0, 5).map(review => (
                <View key={review.id} style={[styles.reviewItem, { borderBottomColor: PP.border }]}>
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewerName, { color: PP.text }]}>{review.name}</Text>
                    <View style={styles.reviewRating}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Ionicons
                          key={star}
                          name="star"
                          size={12}
                          color={star <= review.rating ? '#FFD700' : PP.border}
                        />
                      ))}
                    </View>
                    <Text style={[styles.reviewDate, { color: PP.sub }]}>{review.date}</Text>
                  </View>
                  {review.comment ? (
                    <Text style={[styles.reviewComment, { color: PP.sub }]}>{review.comment}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Contact Info */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: PP.border }]}>
            <Text style={[styles.sectionTitle, { color: PP.text }]}>Contact</Text>
            {providerData.location ? (
              <View style={[styles.contactRow, { borderBottomColor: PP.border }]}>
                <Text style={[styles.contactLabel, { color: PP.sub }]}>Location</Text>
                <Text style={[styles.contactValue, { color: PP.text }]} numberOfLines={1}>{providerData.location}</Text>
              </View>
            ) : null}
            {providerData.phone ? (
              <View style={[styles.contactRow, { borderBottomColor: PP.border }]}>
                <Text style={[styles.contactLabel, { color: PP.sub }]}>Phone</Text>
                <Text style={[styles.contactValue, { color: PP.text }]}>{providerData.phone}</Text>
              </View>
            ) : null}
            {providerData.email ? (
              <View style={[styles.contactRow, { borderBottomColor: PP.border }]}>
                <Text style={[styles.contactLabel, { color: PP.sub }]}>Email</Text>
                <Text style={[styles.contactValue, { color: PP.text }]} numberOfLines={1}>{providerData.email}</Text>
              </View>
            ) : null}
            {providerData.instagram ? (
              <View style={[styles.contactRow, { borderBottomColor: PP.border }]}>
                <Text style={[styles.contactLabel, { color: PP.sub }]}>Instagram</Text>
                <Text style={[styles.contactValue, { color: PP.text }]} numberOfLines={1}>@{providerData.instagram}</Text>
              </View>
            ) : null}
            {providerData.website ? (
              <View style={styles.contactRow}>
                <Text style={[styles.contactLabel, { color: PP.sub }]}>Website</Text>
                <Text style={[styles.contactValue, { color: PP.text }]} numberOfLines={1}>{providerData.website}</Text>
              </View>
            ) : null}
          </View>

          {/* Portfolio — bottom, matching ProviderProfileScreen */}
          {portfolio.length > 0 && (
            <View style={styles.portfolioSection}>
              <Text style={[styles.sectionTitleNoCard, { color: PP.text }]}>Portfolio</Text>
              <View style={styles.portfolioGrid}>
                {portfolio.map(item => (
                  <Image key={item.id} source={{ uri: item.image_url }} style={styles.portfolioTile} />
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  setupButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  editButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
    fontSize: 13,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  logoWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  providerLogo: {
    width: '100%',
    height: '100%',
  },
  logoGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  logoPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 40,
    color: '#fff',
  },

  // Provider info — hero text, matches ProviderProfileScreen typography
  providerInfoCenter: {
    alignItems: 'center',
    marginBottom: 30,
  },
  providerNameLarge: {
    fontFamily: 'Prata-Regular',
    fontSize: 26,
    marginBottom: 4,
    textAlign: 'center',
  },
  metaText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  yearsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  slotsPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  slotsText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  // Stats row — provider-only, not shown to clients
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
  },
  statLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    marginHorizontal: 16,
  },

  // Generic frosted card
  card: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },
  aboutText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  moreButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  moreButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Reviews
  reviewItem: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 10,
    marginLeft: 'auto',
  },
  reviewComment: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  // Services section
  servicesSection: {
    marginBottom: 20,
  },
  sectionTitleNoCard: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    marginBottom: 15,
  },

  // Category tabs
  categoryTabsContent: {
    paddingBottom: 4,
    gap: 10,
  },
  categoryTab: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  categoryTabText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    fontWeight: '600',
  },

  // Service cards
  serviceItemCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
    marginBottom: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  serviceImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceImagePlaceholderText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 5,
  },
  serviceDescription: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 4,
  },
  serviceDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
  },
  servicePrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addOnsRow: {
    marginTop: 4,
  },
  addOnsLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
  },

  // Contact rows — matches ProviderProfileScreen's contactRow layout
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '800',
  },
  contactValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    paddingLeft: 16,
  },

  // Portfolio — two-column grid
  portfolioSection: {
    marginBottom: 20,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  portfolioTile: {
    width: (screenWidth - 40 - 12) / 2,
    height: (screenWidth - 40 - 12) / 2,
    borderRadius: 18,
  },
});
