import { InteractionManager } from 'react-native';
import { logger } from './logger';

export const MonitoringUtils = {
  measureScreenLoad: (screenName: string) => {
    const startTime = Date.now();
    
    return () => {
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      logger.log(`${screenName} loaded in ${loadTime}ms`);

      // Send to analytics in production
      // Analytics.track('screen_load_time', { screenName, loadTime });
    };
  },

  runAfterInteractions: (callback: () => void) => {
    InteractionManager.runAfterInteractions(callback);
  }
};