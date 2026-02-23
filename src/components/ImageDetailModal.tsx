import React, { useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { usePlannerStore } from '../stores/usePlannerStore';
import { PortfolioItem } from '../data/providerProfiles';
import { getProviderForItem } from '../data/portfolioFeed';
import TabIcon from './TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageDetailModalProps {
  visible: boolean;
  item: PortfolioItem | null;
  onClose: () => void;
  onViewProfile: (providerId: string, providerName: string, providerService: string, providerLogo: any) => void;
  onBookNow: (providerId: string, providerName: string, providerService: string, providerLogo: any) => void;
  onPlanThis: (item: PortfolioItem) => void;
}

export const ImageDetailModal = ({
  visible,
  item,
  onClose,
  onViewProfile,
  onBookNow,
  onPlanThis,
}: ImageDetailModalProps) => {
  const { theme, isDarkMode } = useTheme();
  const { isPortfolioSaved, savePortfolioItem, unsavePortfolioItem } = useBookmarkStore();
  const { activeEventId, getActiveEvent } = usePlannerStore();

  if (!item) return null;

  const provider = getProviderForItem(item);
  const isSaved = isPortfolioSaved(item.id);
  const activeEvent = getActiveEvent();
  const imageHeight = Math.min(SCREEN_HEIGHT * 0.45, SCREEN_WIDTH * item.aspectRatio);

  const handleBookmark = () => {
    if (isSaved) {
      unsavePortfolioItem(item.id);
    } else {
      savePortfolioItem(item.id);
    }
  };

  const handleViewProfile = () => {
    if (provider) {
      onClose();
      onViewProfile(provider.id, provider.name, provider.service, provider.logo);
    }
  };

  const handleBookNow = () => {
    if (provider) {
      onClose();
      onBookNow(provider.id, provider.name, provider.service, provider.logo);
    }
  };

  const handlePlanThis = () => {
    onPlanThis(item);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} activeOpacity={1} />

        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={styles.closeBlur}>
              <Text style={[styles.closeText, { color: theme.text }]}>✕</Text>
            </BlurView>
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Image */}
            <Image
              source={item.image}
              style={[styles.image, { height: imageHeight }]}
              resizeMode="cover"
            />

            {/* Info card */}
            <View style={[styles.infoCard, { backgroundColor: theme.cardBackground }]}>
              {/* Provider row */}
              {provider && (
                <View style={styles.providerRow}>
                  <Image
                    source={provider.logo}
                    style={styles.providerLogo}
                    resizeMode="cover"
                  />
                  <View style={styles.providerInfo}>
                    <Text style={[styles.providerName, { color: theme.text }]}>
                      {provider.name}
                    </Text>
                    <View style={styles.ratingRow}>
                      <TabIcon name="star" size={12} color="#FFD700" />
                      <Text style={[styles.ratingText, { color: theme.text }]}>
                        {provider.rating}
                      </Text>
                      <Text style={[styles.reviewCount, { color: theme.secondaryText }]}>
                        ({provider.reviewCount})
                      </Text>
                    </View>
                  </View>
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                </View>
              )}

              {/* Caption */}
              <Text style={[styles.caption, { color: theme.text }]}>
                {item.caption}
              </Text>

              {/* Price */}
              {item.price && (
                <Text style={styles.price}>{item.price}</Text>
              )}

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <View style={styles.tagsRow}>
                  {item.tags.slice(0, 5).map(tag => (
                    <View key={tag} style={[styles.tag, { backgroundColor: isDarkMode ? 'rgba(163,66,195,0.15)' : '#F5E6FA' }]}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Plan This button */}
              <TouchableOpacity
                style={styles.planThisButton}
                onPress={handlePlanThis}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#e8a0f0', '#c76be0']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.planThisGradient}
                >
                  <TabIcon name="bookmark" size={16} color="#FFFFFF" />
                  <Text style={styles.planThisText}>
                    {activeEvent ? `Plan This → ${activeEvent.name}` : 'Plan This'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Action buttons row */}
              <View style={styles.actionsRow}>
                {/* View Profile */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.outlineButton, { borderColor: '#a342c3ff' }]}
                  onPress={handleViewProfile}
                  activeOpacity={0.8}
                >
                  <TabIcon name="user" size={14} color="#a342c3ff" />
                  <Text style={styles.outlineButtonText}>View Profile</Text>
                </TouchableOpacity>

                {/* Book Now */}
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleBookNow}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#a342c3ff', '#8a2fb8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.bookNowGradient}
                  >
                    <TabIcon name="basket-shopping" size={14} color="#FFFFFF" />
                    <Text style={styles.bookNowText}>Book Now</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveButton, { borderColor: theme.border }]}
                onPress={handleBookmark}
                activeOpacity={0.7}
              >
                <TabIcon
                  name="heart"
                  size={16}
                  color={isSaved ? '#a342c3ff' : theme.secondaryText}
                />
                <Text
                  style={[
                    styles.saveText,
                    { color: isSaved ? '#a342c3ff' : theme.secondaryText },
                  ]}
                >
                  {isSaved ? 'Saved' : 'Save to Collection'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  container: {
    maxHeight: SCREEN_HEIGHT * 0.92,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  closeBlur: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  image: {
    width: '100%',
    backgroundColor: '#F0F0F0',
  },
  infoCard: {
    padding: spacing.lg,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  providerLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
  },
  providerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  providerName: {
    fontSize: fonts.providerName,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  reviewCount: {
    fontSize: 11,
    fontFamily: 'Jura-VariableFont_wght',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(163, 66, 195, 0.15)',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
    letterSpacing: 0.5,
  },
  caption: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  price: {
    fontSize: fonts.title.small,
    fontWeight: '700',
    color: '#a342c3ff',
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 10,
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  planThisButton: {
    marginBottom: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
  },
  planThisGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  planThisText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
  },
  outlineButton: {
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  outlineButtonText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#a342c3ff',
    fontFamily: 'BakbakOne-Regular',
  },
  bookNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  bookNowText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  saveText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
});
