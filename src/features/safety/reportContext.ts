import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** The device details every report carries, the same as Report a Problem. */
export function reportDeviceContext(): { platform: string; appVersion: string } {
  return {
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  };
}
