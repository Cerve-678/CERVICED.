import { InteractionManager } from 'react-native';

export const MonitoringUtils = {
  measureScreenLoad: (screenName: string) => {
    const startTime = Date.now();
    
    return () => {
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      if (__DEV__) console.log(`${screenName} loaded in ${loadTime}ms`);

      // Send to analytics in production
      // Analytics.track('screen_load_time', { screenName, loadTime });
    };
  },

  runAfterInteractions: (callback: () => void) => {
    InteractionManager.runAfterInteractions(callback);
  }
};