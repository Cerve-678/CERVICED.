// src/services/ImageLoader.ts
import { ImageSourcePropType } from 'react-native';
import { logger } from '../utils/logger';

/**
 * Dynamic Image Loading Service
 * Solves memory issues by loading images on-demand
 */

export interface ImageAsset {
  id: string;
  source: ImageSourcePropType;
  category: string;
  preloaded?: boolean;
}

class ImageLoaderService {
  private imageCache: Map<string, ImageSourcePropType> = new Map();
  private preloadedImages: Set<string> = new Set();

  // Define your image mappings
  private readonly imageMap: Record<string, () => ImageSourcePropType> = {
    'background_default': () => require('../assets/images/backgrounds/background.png'),
    'placeholder_service': () => require('../assets/images/placeholders/service_placeholder.png'),
    'placeholder_provider': () => require('../assets/images/placeholders/provider_placeholder.png'),
  };

  /**
   * Load image by ID - returns cached version if available
   */
  getImage(imageId: string): ImageSourcePropType | null {
    try {
      // Return from cache if available
      if (this.imageCache.has(imageId)) {
        return this.imageCache.get(imageId)!;
      }

      // Load image if mapping exists
      const imageLoader = this.imageMap[imageId];
      if (imageLoader) {
        const image = imageLoader();
        this.imageCache.set(imageId, image);
        return image;
      }

      logger.warn(`Image not found: ${imageId}`);
      return this.getPlaceholderImage();
    } catch (error) {
      logger.error(`Failed to load image ${imageId}:`, error);
      return this.getPlaceholderImage();
    }
  }

  /**
   * Preload critical images for better performance
   */
  async preloadImages(imageIds: string[]): Promise<void> {
    try {
      const preloadPromises = imageIds.map(imageId => {
        return new Promise<void>((resolve) => {
          try {
            const image = this.getImage(imageId);
            if (image) {
              this.preloadedImages.add(imageId);
            }
            resolve();
          } catch (error) {
            logger.warn(`Failed to preload image: ${imageId}`, error);
            resolve();
          }
        });
      });

      await Promise.all(preloadPromises);
      logger.log(`Preloaded ${this.preloadedImages.size} images`);
    } catch (error) {
      logger.error('Preload images failed:', error);
    }
  }

  /**
   * Get placeholder image
   */
  private getPlaceholderImage(): ImageSourcePropType {
    return this.imageMap['placeholder_service']?.() || { uri: 'https://via.placeholder.com/150' };
  }

  /**
   * Clear image cache to free memory
   */
  clearCache(): void {
    this.imageCache.clear();
    this.preloadedImages.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cached: number; preloaded: number } {
    return {
      cached: this.imageCache.size,
      preloaded: this.preloadedImages.size,
    };
  }

  /**
   * Get provider logo
   */
  getProviderLogo(providerName: string): ImageSourcePropType | null {
    const providerKey = `provider_${providerName.toLowerCase().replace(/\s+/g, '_')}`;
    return this.getImage(providerKey);
  }

  /**
   * Get service image
   */
  getServiceImage(imageName: string): ImageSourcePropType | null {
    // Extract service name from file path
    const serviceKey = this.extractServiceKey(imageName);
    return this.getImage(serviceKey);
  }

  /**
   * Get background image
   */
  getBackgroundImage(): ImageSourcePropType | null {
    return this.getImage('background_default');
  }

  /**
   * Extract service key from image path/name
   */
  private extractServiceKey(_imageName: string): string {
    return 'placeholder_service';
  }
}

// Create singleton instance
export const imageLoader = new ImageLoaderService();

// Convenience hooks for React components
export const useImageLoader = () => {
  return {
    getImage: (imageId: string) => imageLoader.getImage(imageId),
    getProviderLogo: (providerName: string) => imageLoader.getProviderLogo(providerName),
    getServiceImage: (imageName: string) => imageLoader.getServiceImage(imageName),
    getBackgroundImage: () => imageLoader.getBackgroundImage(),
    preloadImages: (imageIds: string[]) => imageLoader.preloadImages(imageIds),
    clearCache: () => imageLoader.clearCache(),
    getCacheStats: () => imageLoader.getCacheStats(),
  };
};