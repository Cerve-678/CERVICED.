import { Image } from 'react-native';

interface ImageCache {
  [uri: string]: boolean;
}

class ImageService {
  private cache: ImageCache = {};

  async preloadImages(uris: string[]): Promise<void> {
    const preloadPromises = uris.map(uri => this.preloadImage(uri));
    await Promise.all(preloadPromises);
  }

  async preloadImage(uri: string): Promise<void> {
    if (this.cache[uri]) {
      return;
    }

    try {
      await Image.prefetch(uri);
      this.cache[uri] = true;
    } catch (error) {
      console.error(`Failed to preload image: ${uri}`, error);
    }
  }

  getOptimizedImageUri(originalUri: string, width?: number, height?: number): string {
    // For services like Cloudinary, you would modify the URL here
    // Example: https://res.cloudinary.com/demo/image/fetch/w_300,h_200,c_fill/sample.jpg
    
    if (!width && !height) {
      return originalUri;
    }

    // This is a placeholder - replace with your image service logic
    const params = new URLSearchParams();
    if (width) params.append('w', width.toString());
    if (height) params.append('h', height.toString());
    
    const separator = originalUri.includes('?') ? '&' : '?';
    return `${originalUri}${separator}${params.toString()}`;
  }

  isImageCached(uri: string): boolean {
    return !!this.cache[uri];
  }

  clearCache(): void {
    this.cache = {};
  }
}

export const imageService = new ImageService();

// Common image sizes for optimization
export const IMAGE_SIZES = {
  THUMBNAIL: { width: 100, height: 100 },
  SMALL: { width: 200, height: 200 },
  MEDIUM: { width: 400, height: 400 },
  LARGE: { width: 800, height: 800 },
} as const;