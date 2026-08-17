import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Image, Text, TouchableOpacity, View } from 'react-native';

interface ServiceImageCarouselProps {
  images: string[];
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  size?: number;
  styles: any;
}

/** Manages a service's ordered image previews plus the add-image action. */
export function ServiceImageCarousel({ images, onAddImage, onRemoveImage, size = 80, styles }: ServiceImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const handleScroll = useCallback((event: any) => {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / size));
  }, [size]);

  return (
    <View style={styles.carouselContainer}>
      <FlatList
        ref={flatListRef}
        data={[...images, 'add']}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item}-${index}`}
        getItemLayout={(_data, index) => ({ length: size, offset: size * index, index })}
        renderItem={({ item, index }) => item === 'add' ? (
          <TouchableOpacity style={[styles.addImageButton, { width: size, height: size }]} onPress={onAddImage} activeOpacity={0.7}>
            <Text style={styles.addImageIcon}>+</Text>
            <Text style={styles.addImageText}>Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.carouselImageContainer, { width: size, height: size }]}>
            <Image source={{ uri: item }} style={[styles.carouselImage, { width: size, height: size }]} resizeMode="cover" />
            <TouchableOpacity style={styles.removeImageButton} onPress={() => onRemoveImage(index)}>
              <Text style={styles.removeImageIcon}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.carouselContent}
      />
      {images.length > 0 && (
        <View style={styles.carouselDots}>
          {images.map((_, index) => <View key={index} style={[styles.carouselDot, activeIndex === index && styles.carouselDotActive]} />)}
        </View>
      )}
    </View>
  );
}
