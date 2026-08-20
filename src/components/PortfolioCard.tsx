import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
// expo-image instead of RN's Image — Explore's masonry grid is unvirtualized
// (every card mounts at once, see MasonryGrid.tsx), so disk/memory caching
// matters even more here than elsewhere: without it, every image on every
// visit to the same feed re-downloads from network from scratch.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { PortfolioItem } from '../types/providers';
import TabIcon from './TabIcon';
import { dimensions } from '../constants/PlatformDimensions';

interface PortfolioCardProps {
  item: PortfolioItem;
  columnWidth: number;
  // The exact pixel height MasonryGrid reserved for this card. Supplied by
  // the screen rather than recomputed here, because the reserved slot and
  // the rendered box must be identical (see masonryHeight.ts) and only the
  // screen has the measured-ratio cache that resolves a real ratio for
  // service/provider photos.
  imageHeight: number;
  onPress: (item: PortfolioItem) => void;
  index: number;
}

const PortfolioCardInner = ({ item, columnWidth, imageHeight, onPress, index }: PortfolioCardProps) => {
  const { theme, palette: P } = useTheme();
  // Blue-grey secondary — the highlight for the saved-heart and category chip
  // over photos. Hat-aware via palette; on the client hat this is the blue-grey
  // secondary, on the provider hat it falls back to that hat's own accent.
  const HIGHLIGHT_COLOR = P.secondary;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const { isPortfolioSaved, savePortfolioItem, unsavePortfolioItem } = useBookmarkStore();

  const isSaved = isPortfolioSaved(item.id);
  // aspectRatio is stored as width/height, so height = width / ratio.

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: (index % 10) * 80,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: (index % 10) * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  const handleBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isSaved) {
      unsavePortfolioItem(item.id);
    } else {
      savePortfolioItem(item.id);
    }
  }, [isSaved, item.id, savePortfolioItem, unsavePortfolioItem]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onPress(item)}
        style={[
          styles.card,
          {
            backgroundColor: theme.cardBackground,
            borderRadius: dimensions.card.smallBorderRadius,
          },
        ]}
      >
        {/* Image */}
        {/* item.image is typed as RN's ImageSourcePropType (broad union) but
            is always constructed as { uri: string } (see ExploreScreen.tsx's
            mapDb*ToCard helpers) — narrowed here since expo-image's stricter
            ImageSource type doesn't structurally match the wider RN union
            under exactOptionalPropertyTypes. */}
        <Image
          source={{ uri: (item.image as { uri: string }).uri }}
          style={[
            styles.image,
            {
              width: '100%',
              height: imageHeight,
              borderRadius: dimensions.card.smallBorderRadius,
            },
          ]}
          contentFit="cover"
          transition={0}
        />

        {/* Gradient overlay at bottom of image */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={[
            styles.gradient,
            {
              height: imageHeight * 0.5,
              borderBottomLeftRadius: dimensions.card.smallBorderRadius,
              borderBottomRightRadius: dimensions.card.smallBorderRadius,
            },
          ]}
        />

        {/* Price badge */}
        {item.price && (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>{item.price}</Text>
          </View>
        )}

        {/* Unclaimed badge — top-right so it never collides with the price
            badge (top-left). Unclaimed providers never carry a price, but
            keeping the two on opposite corners avoids coupling this to that
            fact. */}
        {item.isUnclaimed && (
          <View style={styles.unclaimedBadge}>
            <Text style={styles.unclaimedBadgeText}>UNCLAIMED</Text>
          </View>
        )}

        {/* Save button — heart, standardized to match the same save/unsave
            action's icon in ImageDetailModal (was a bookmark glyph here,
            a heart there, for the identical underlying action). */}
        <TouchableOpacity
          style={styles.bookmarkButton}
          onPress={handleBookmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <TabIcon
            name="heart"
            size={16}
            // HIGHLIGHT_COLOR (pale blue-grey, same as the category chip's fill)
            // barely reads against a photo or the unsaved white heart. Saved
            // state uses a fixed bright pink instead — the conventional
            // "favourited" colour, independent of theme/mode.
            color={isSaved ? '#FF2D78' : '#FFFFFF'}
          />
        </TouchableOpacity>

        {/* Bottom overlay info */}
        <View style={styles.overlay}>
          {/* Category chip — the blue-grey secondary fill (always pale, both
              modes) needs a fixed dark label; plum ties the two colours together */}
          <View style={[styles.categoryChip, { backgroundColor: HIGHLIGHT_COLOR }]}>
            <Text style={[styles.categoryText, { color: '#3F1E36' }]}>{item.category}</Text>
          </View>

          {/* Provider name */}
          {item.providerName && (
            <Text style={styles.providerName} numberOfLines={1}>
              {item.providerName}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const PortfolioCard = React.memo(PortfolioCardInner, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.columnWidth === next.columnWidth &&
    // Must be compared: imageHeight changes when the photo's true ratio is
    // measured (see useMeasuredAspectRatios), and without this the card
    // would keep rendering at its initial placeholder height while the
    // grid's packer had already re-laid-out around the corrected one.
    prev.imageHeight === next.imageHeight &&
    prev.index === next.index
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 2,
  },
  card: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  image: {
    backgroundColor: '#F0F0F0',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bookmarkButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  priceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
  unclaimedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  unclaimedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Jura-VariableFont_wght',
    letterSpacing: 0.5,
  },
  overlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
    letterSpacing: 0.5,
  },
  providerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
