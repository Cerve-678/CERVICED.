import AsyncStorage from '@react-native-async-storage/async-storage';
class StorageService {
async setItem<T>(key: string, value: T): Promise<void> {
try {
const jsonValue = JSON.stringify(value);
await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
console.error(`Error storing item with key ${key}:`, error);
throw error;
    }
  }
async getItem<T>(key: string): Promise<T | null> {
try {
const jsonValue = await AsyncStorage.getItem(key);
return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
console.error(`Error retrieving item with key ${key}:`, error);
return null;
    }
  }
async removeItem(key: string): Promise<void> {
try {
await AsyncStorage.removeItem(key);
    } catch (error) {
console.error(`Error removing item with key ${key}:`, error);
throw error;
    }
  }
async clear(): Promise<void> {
try {
await AsyncStorage.clear();
    } catch (error) {
console.error('Error clearing storage:', error);
throw error;
    }
  }
async getAllKeys(): Promise<readonly string[]> {
try {
return await AsyncStorage.getAllKeys();
    } catch (error) {
console.error('Error getting all keys:', error);
return [];
    }
  }
}
export const storage = new StorageService();
export const STORAGE_KEYS = {
USER_DATA: '@user_data',
SETTINGS: '@app_settings',
AUTH_TOKEN: '@auth_token',
ONBOARDING_COMPLETED: '@onboarding_completed',
LIKED_VIDEOS: 'liked_videos',
BOOKMARKED_VIDEOS: 'bookmarked_videos',
SAVED_PORTFOLIO: 'saved_portfolio_items',
PLANNER_EVENTS: 'planner_events',
} as const;