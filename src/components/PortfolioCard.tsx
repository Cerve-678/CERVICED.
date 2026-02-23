import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { PortfolioItem } from '../data/providerProfiles';
import { getProviderForItem } from '../data/portfolioFeed';
import TabIcon from './TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

interface PortfolioCardProps {
  item: PortfolioItem;
  columnWidth: number;
  onPress: (item: PortfolioItem) => void;
  index: number;
}

const PortfolioCardInner = ({ item, columnWidth, onPress, index }: PortfolioCardProps) => {
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const { isPortfolioSaved, savePortfolioItem, unsavePortfolioItem } = useBookmarkStore();

  const isSaved = isPortfolioSaved(item.id);
  const provider = getProviderForItem(item);
  const imageHeight = columnWidth * item.aspectRatio;

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
  }, []);

  const handleBookmark = useCallback(() => {
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
        <Image
          source={item.image}
          style={[
            styles.image,
            {
              width: '100%',
              height: imageHeight,
              borderRadius: dimensions.card.smallBorderRadius,
            },
          ]}
          resizeMode="cover"
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

        {/* Bookmark button */}
        <TouchableOpacity
          style={styles.bookmarkButton}
          onPress={handleBookmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <TabIcon
            name="bookmark"
            size={16}
            color={isSaved ? '#a342c3ff' : '#FFFFFF'}
          />
        </TouchableOpacity>

        {/* Bottom overlay info */}
        <View style={styles.overlay}>
          {/* Category chip */}
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>

          {/* Provider name */}
          {provider && (
            <Text style={styles.providerName} numberOfLines={1}>
              {provider.name}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Caption below card */}
      <Text
        style={[styles.caption, { color: theme.secondaryText }]}
        numberOfLines={2}
      >
        {item.caption}
      </Text>

      {item.price && (
        <Text style={styles.price}>{item.price}</Text>
      )}
    </Animated.View>
  );
};

export const PortfolioCard = React.memo(PortfolioCardInner, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.columnWidth === next.columnWidth &&
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
    backgroundColor: 'rgba(163, 66, 195, 0.8)',
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
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
  caption: {
    fontSize: 11,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 6,
    lineHeight: 15,
  },
  price: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 2,
  },
});
