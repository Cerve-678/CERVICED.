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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import AppBackground from '../components/AppBackground';

const { width: screenWidth } = Dimensions.get('window');

// Matches InfoRegScreen's data shape
interface AddOnData {
  id: number;
  name: string;
  price: number;
}

interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  description: string;
  images: string[];
  addOns: AddOnData[];
}

interface ProviderRegistrationData {
  providerName: string;
  providerService: string;
  customServiceType: string;
  location: string;
  aboutText: string;
  slotsText: string;
  gradient: [string, string, ...string[]];
  accentColor: string;
  logo: string | null;
  categories: Record<string, ServiceData[]>;
}

interface Props {
  navigation: any;
}

export default function ProviderMyProfileScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const [providerData, setProviderData] = useState<ProviderRegistrationData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showFullAbout, setShowFullAbout] = useState(false);

  // Reload data every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          const stored = await AsyncStorage.getItem('@provider_reg_data');
          if (stored) {
            const parsed: ProviderRegistrationData = JSON.parse(stored);
            setProviderData(parsed);
            const cats = Object.keys(parsed.categories);
            if (cats.length > 0 && !cats.includes(selectedCategory)) {
              setSelectedCategory(cats[0]);
            }
          } else {
            setProviderData(null);
          }
        } catch (e) {
          console.error('Error loading provider data:', e);
        }
      };
      load();
    }, [])
  );

  const categoryNames = useMemo(() => {
    if (!providerData) return [];
    return Object.keys(providerData.categories);
  }, [providerData]);

  const currentServices = useMemo(() => {
    if (!providerData || !selectedCategory) return [];
    return providerData.categories[selectedCategory] || [];
  }, [providerData, selectedCategory]);

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

  // Empty state — no profile submitted yet
  if (!providerData) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon, { color: theme.text + '30' }]}>{'🏪'}</Text>
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

  const accentColor = providerData.accentColor || '#007AFF';

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={providerData.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Edit Button (top right) */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <BlurView intensity={20} tint="light" style={styles.editButtonBlur}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </BlurView>
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
            <Text style={styles.providerNameLarge}>
              @{providerData.providerName.toUpperCase()}
            </Text>

            <View style={styles.serviceTag}>
              <BlurView intensity={15} tint="light" style={styles.serviceTagBlur}>
                <Text style={styles.serviceText}>{serviceType}</Text>
              </BlurView>
            </View>

            <Text style={styles.locationText}>
              {'📍'} {providerData.location}
            </Text>

            {providerData.slotsText ? (
              <View style={styles.serviceTag}>
                <BlurView intensity={15} tint="light" style={styles.serviceTagBlur}>
                  <Text style={styles.slotsText}>{providerData.slotsText}</Text>
                </BlurView>
              </View>
            ) : null}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{totalServices}</Text>
                <Text style={styles.statLabel}>Services</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{categoryNames.length}</Text>
                <Text style={styles.statLabel}>Categories</Text>
              </View>
            </View>
          </View>

          {/* About Section */}
          {providerData.aboutText ? (
            <BlurView intensity={50} tint="light" style={styles.aboutCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cardHighlight}
              />
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.aboutText}>
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
                  <Text style={[styles.moreButtonText, { color: accentColor }]}>
                    {showFullAbout ? 'Show Less' : 'More'}
                  </Text>
                </TouchableOpacity>
              )}
            </BlurView>
          ) : null}

          {/* Services Section */}
          {categoryNames.length > 0 && (
            <View style={styles.servicesSection}>
              <Text style={styles.sectionTitleWhite}>Services</Text>

              {/* Category Tabs */}
              <FlatList
                data={categoryNames}
                renderItem={({ item: category }) => (
                  <TouchableOpacity
                    style={[
                      styles.categoryTab,
                      selectedCategory === category && [
                        styles.categoryTabActive,
                        { borderColor: accentColor },
                      ],
                    ]}
                    onPress={() => setSelectedCategory(category)}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={12} tint="light" style={styles.categoryTabBlur}>
                      <Text
                        style={[
                          styles.categoryTabText,
                          selectedCategory === category && { color: '#fff', fontWeight: '700' },
                        ]}
                      >
                        {category}
                      </Text>
                    </BlurView>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryTabsContent}
              />

              {/* Service Cards */}
              {currentServices.map((service) => (
                <View key={service.id} style={styles.serviceItemCard}>
                  <BlurView intensity={50} tint="light" style={styles.serviceCardBlur}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.cardHighlight}
                    />
                    <View style={styles.serviceItem}>
                      {/* Service Image */}
                      <View style={styles.serviceImageContainer}>
                        {service.images && service.images.length > 0 ? (
                          <Image
                            source={{ uri: service.images[0] }}
                            style={styles.serviceImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.serviceImage, styles.serviceImagePlaceholder]}>
                            <Text style={styles.serviceImagePlaceholderText}>
                              {service.name.charAt(0)}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Service Info */}
                      <View style={styles.serviceInfo}>
                        <Text style={styles.serviceName}>{service.name}</Text>
                        {service.description ? (
                          <Text style={styles.serviceDescription} numberOfLines={2}>
                            {service.description}
                          </Text>
                        ) : null}
                        <View style={styles.serviceDetails}>
                          <Text style={styles.serviceDuration}>{service.duration}</Text>
                          <Text style={[styles.servicePrice, { color: accentColor }]}>
                            {'\u00A3'}{service.price}
                          </Text>
                        </View>
                        {service.addOns && service.addOns.length > 0 && (
                          <View style={styles.addOnsRow}>
                            <Text style={styles.addOnsLabel}>
                              +{service.addOns.length} add-on{service.addOns.length !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </BlurView>
                </View>
              ))}
            </View>
          )}

          {/* Contact Info */}
          <BlurView intensity={50} tint="light" style={styles.contactCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.3)', 'transparent'] as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardHighlight}
            />
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <Text style={styles.contactText}>Location: {providerData.location}</Text>
            <Text style={styles.contactText}>Service: {serviceType}</Text>
          </BlurView>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  editButtonBlur: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
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
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },

  // Provider info
  providerInfoCenter: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  providerNameLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  serviceTag: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
  },
  serviceTagBlur: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  serviceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
  locationText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  slotsText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 16,
  },

  // About card
  aboutCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.7)',
    marginBottom: 10,
  },
  aboutText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    lineHeight: 20,
  },
  moreButton: {
    marginTop: 8,
  },
  moreButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Services section
  servicesSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitleWhite: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Category tabs
  categoryTabsContent: {
    paddingBottom: 12,
    gap: 8,
  },
  categoryTab: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  categoryTabActive: {
    borderWidth: 1.5,
  },
  categoryTabBlur: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },

  // Service cards
  serviceItemCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  serviceCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  serviceImagePlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceImagePlaceholderText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.8)',
    marginBottom: 2,
  },
  serviceDescription: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
    marginBottom: 4,
  },
  serviceDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceDuration: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '700',
  },
  addOnsRow: {
    marginTop: 4,
  },
  addOnsLabel: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.4)',
    fontWeight: '500',
  },

  // Contact card
  contactCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  contactText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 4,
  },
});
