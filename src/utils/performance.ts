`import { Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

export const PerformanceUtils = {
  // Optimize image sizes based on screen
  getOptimalImageSize: (originalWidth: number, originalHeight: number) => {
    const maxWidth = screenWidth * 0.8;
    const ratio = originalHeight / originalWidth;
    
    if (originalWidth > maxWidth) {
      return {
        width: maxWidth,
        height: maxWidth * ratio
      };
    }
    
    return { width: originalWidth, height: originalHeight };
  },

  // Debounce function for search inputs
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void => {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  // Throttle function for scroll events
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void => {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
};`