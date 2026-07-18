/**
 * Push Notification Service
 * Handles Expo push token registration and foreground notification display.
 * Call registerForPushNotifications() once after user logs in.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Expo Go dropped remote push support in SDK 53 — getExpoPushTokenAsync() fails
// there and no APNs/FCM delivery is possible, by design, no matter how the
// backend is configured. startExpoGoNotificationBridge() below is the only way
// to see notification content while testing in Expo Go.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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

  const projectId = Constants.expoConfig?.extra?.['eas']?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[Push] No EAS projectId found in app config — cannot get push token');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (__DEV__) console.log('[Push] Token obtained:', token);

    // Save token to the current user's row in Supabase
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
 * Expo Go can't receive remote push, so this mirrors each new row inserted into
 * `notifications` for the given user as a local notification instead — same
 * title/body/sound, fired immediately. Real builds get the actual push and
 * don't need this; call only while running in Expo Go.
 * Returns an unsubscribe function.
 */
export function startExpoGoNotificationBridge(userId: string): () => void {
  if (!isExpoGo) return () => {};

  // Look up this user's business name once so provider-role notifications can be
  // labelled with it (mirrors the production push edge function). Falls back to
  // "Provider" until it resolves / if the user has no provider profile.
  let businessName = 'Provider';
  supabase
    .from('providers')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
    .then(({ data }) => { if (data?.display_name) businessName = data.display_name; });

  const channel = supabase
    .channel(`expo-go-notification-bridge-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as {
          id: string;
          title: string;
          message: string;
          type: string;
          booking_id: string | null;
          recipient_role: 'provider' | 'client';
        };
        // Match the production push label: provider-role notifications are
        // prefixed with the business name so a dual-role user knows which hat
        // they're for.
        const displayTitle = row.recipient_role === 'provider' ? `${businessName} · ${row.title}` : row.title;
        Notifications.scheduleNotificationAsync({
          content: {
            title: displayTitle,
            body: row.message,
            sound: 'default',
            data: { booking_id: row.booking_id, notification_id: row.id, type: row.type, recipient_role: row.recipient_role },
          },
          trigger: null,
        }).catch(() => {});
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
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
