import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  StatusBar
} from 'react-native';
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

const { width } = Dimensions.get('window');

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
];

export default function BookmarkedProvidersScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { bookmarkedIds, removeBookmark, loadBookmarks } = useBookmarkStore();
  const [loading, setLoading] = useState(true);

  // Configure navigation header with solid background
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: false,
      headerTitle: 'Your Providers',
      headerTitleStyle: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.text,
      },
      headerLeft: () => (
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.navBackText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
      ),
      headerStyle: {
        backgroundColor: theme.background,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
    });
  }, [navigation, theme]);

  const bookmarkedProviders = allProviders.filter(provider => 
    bookmarkedIds.includes(provider.id)
  );

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          await loadBookmarks();
          console.log('Loaded bookmark IDs:', bookmarkedIds);
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
    <ThemedBackground>
      <StatusBar barStyle={theme.statusBar} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView 
          style={styles.scrollContainer} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {bookmarkedProviders.length > 0 ? (
            bookmarkedProviders.map((provider) => (
              <TouchableOpacity
                key={provider.id}
                style={styles.providerCard}
                onPress={() => handleViewProfile(provider.id)}
                activeOpacity={0.9}
              >
                <BlurView intensity={40} tint={theme.blurTint} style={styles.cardBlur}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  />

                  <View style={styles.cardContent}>
                    <Image source={provider.logo} style={styles.providerLogo} />

                    <View style={styles.providerDetails}>
                      <Text style={[styles.providerName, { color: theme.text }]} numberOfLines={1}>
                        {provider.name}
                      </Text>
                      <View style={styles.serviceTag}>
                        <Text style={styles.serviceTagText}>{provider.service}</Text>
                      </View>
                      <Text style={[styles.locationText, { color: theme.secondaryText }]} numberOfLines={1}>
                        {provider.location}
                      </Text>
                      <View style={styles.ratingContainer}>
                        <Icon name="star" size={14} color="#FFD700" />
                        <Text style={[styles.ratingText, { color: theme.text }]}>{provider.rating}</Text>
                      </View>
                    </View>

                    <TouchableOpacity 
                      style={styles.bookmarkButton} 
                      onPress={() => handleRemoveBookmark(provider.id)}
                      activeOpacity={0.7}
                    >
                      <Icon name="bookmark" size={20} color="#DA70D6" />
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </TouchableOpacity>
            ))
          ) : (
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
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    color: '#000',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  providerCard: {
    marginBottom: 15,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardBlur: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  providerLogo: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  providerDetails: {
    flex: 1,
    marginLeft: 15,
  },
  providerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 5,
  },
  serviceTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(218, 112, 214, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 5,
  },
  serviceTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DA70D6',
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 5,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  bookmarkButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(218, 112, 214, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyCard: {
    width: width - 40,
    borderRadius: 25,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  exploreButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  exploreGradient: {
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  exploreText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});