import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';
class StorageService {
async setItem<T>(key: string, value: T): Promise<void> {
try {
const jsonValue = JSON.stringify(value);
await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
logger.error(`Error storing item with key ${key}:`, error);
throw error;
    }
  }
async getItem<T>(key: string): Promise<T | null> {
try {
const jsonValue = await AsyncStorage.getItem(key);
return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
logger.error(`Error retrieving item with key ${key}:`, error);
return null;
    }
  }
async removeItem(key: string): Promise<void> {
try {
await AsyncStorage.removeItem(key);
    } catch (error) {
logger.error(`Error removing item with key ${key}:`, error);
throw error;
    }
  }
async clear(): Promise<void> {
try {
await AsyncStorage.clear();
    } catch (error) {
logger.error('Error clearing storage:', error);
throw error;
    }
  }
async getAllKeys(): Promise<readonly string[]> {
try {
return await AsyncStorage.getAllKeys();
    } catch (error) {
logger.error('Error getting all keys:', error);
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