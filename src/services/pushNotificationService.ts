/**
 * Push Notification Service
 * Handles Expo push token registration and foreground notification display.
 * Call registerForPushNotifications() once after user logs in.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase, ensureFreshSession } from '../lib/supabase';

// Show banner + play sound even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission, get the Expo push token, and save it to users.push_token.
 * Safe to call multiple times — bails silently on simulators or permission denial.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push tokens only work on real devices
  if (!Device.isDevice) {
    if (__DEV__) console.log('[Push] Skipping — not a real device');
    return null;
  }

  // Ask permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('[Push] Permission denied');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'CERVICED',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF9500',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '624d44eb-1d17-4c9a-b782-3675ee5e7863',
    });
    const token = tokenData.data;
    if (__DEV__) console.log('[Push] Token obtained:', token);

    // Save token to the current user's row in Supabase
    await ensureFreshSession().catch(() => {});
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('users')
        .update({ push_token: token })
        .eq('id', user.id);
      if (error) {
        console.warn('[Push] Failed to save token to DB:', error.message);
      } else {
        if (__DEV__) console.log('[Push] Token saved to Supabase');
      }
    }

    return token;
  } catch (err) {
    console.warn('[Push] Failed to get token:', err);
    return null;
  }
}

/**
 * Clear the push token from Supabase when a user logs out,
 * so they don't receive notifications for another account on the same device.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({ push_token: null })
        .eq('id', user.id);
    }
  } catch {
    // Ignore — logging out should never fail because of this
  }
}
