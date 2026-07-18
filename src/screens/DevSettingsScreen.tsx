// src/screens/DevSettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useBooking } from '../contexts/BookingContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  registerForPushNotifications,
  unregisterPushToken,
} from '../services/pushNotificationService';

const L = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', text: '#000000',
  sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(175,145,151,0.12)',
  danger: '#C0392B', info: '#2E7D9E',
};
const D = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)',
  danger: '#E05050', info: '#5BA3C9',
};

export default function DevSettingsScreen({ navigation }: any) {
  const [bookingCount, setBookingCount] = useState<number>(0);
  const [storageSize, setStorageSize] = useState<string>('0 KB');
  const { reloadBookings } = useBooking();
  const { isDarkMode, themePreference, setDarkMode, setThemePreference } = useTheme();
  const { user, activeMode } = useAuth();
  const insets = useSafeAreaInsets();
  const P = isDarkMode ? D : L;

  // fullScreenModal presentation makes SafeAreaView under-report the top inset,
  // so the header rides up under the status bar. Pad manually with a fallback.
  const topInset =
    insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 44;

  // --- Push diagnostics state ---
  const [pushPerm, setPushPerm] = useState<string>('unknown');
  const [projectId, setProjectId] = useState<string>('—');
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [dbToken, setDbToken] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const tokenMismatch = !!deviceToken && !!dbToken && deviceToken !== dbToken;
  const appVersion = Constants.expoConfig?.version ?? '—';

  useEffect(() => {
    checkBookings();
    loadPushInfo();
  }, []);

  const checkBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@bookings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setBookingCount(parsed.length);
        const sizeInBytes = new TextEncoder().encode(stored).length;
        const sizeInKB = (sizeInBytes / 1024).toFixed(2);
        setStorageSize(`${sizeInKB} KB`);
      } else {
        setBookingCount(0);
        setStorageSize('0 KB');
      }
    } catch (error) {
      console.error('Error checking bookings:', error);
    }
  };

  const viewBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@bookings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (__DEV__) console.log('Current Bookings:', parsed);
        Alert.alert('Bookings Data', `Found ${parsed.length} bookings. Check console for details.`);
      } else {
        Alert.alert('No Bookings', 'No booking data found in storage');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to read bookings');
    }
  };

  const clearBookings = async () => {
    Alert.alert(
      'Clear Bookings',
      `Delete all ${bookingCount} bookings?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('@bookings');
              await reloadBookings();
              setBookingCount(0);
              setStorageSize('0 KB');
              Alert.alert('Success', 'All bookings cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear bookings');
            }
          },
        },
      ]
    );
  };

  const clearAllAppData = async () => {
    Alert.alert(
      'Clear All Data',
      'This will reset the ENTIRE app. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              setBookingCount(0);
              setStorageSize('0 KB');
              Alert.alert('Success', 'All app data cleared. Restart app.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const viewAllStorageKeys = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      if (__DEV__) console.log('Storage Keys:', keys);
      Alert.alert('Storage Keys', `Found ${keys.length} keys:\n${keys.join('\n')}\n\nCheck console for details.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to read storage keys');
    }
  };

  const exportBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@bookings');
      if (stored) {
        if (__DEV__) console.log('EXPORT BOOKINGS:', stored);
        Alert.alert('Export Complete', 'Booking data logged to console. Copy from there.');
      } else {
        Alert.alert('No Data', 'No bookings to export');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export bookings');
    }
  };

  // ------------------------------------------------------------------
  // Push diagnostics
  // ------------------------------------------------------------------

  const loadPushInfo = async () => {
    try {
      const pid =
        Constants.expoConfig?.extra?.['eas']?.projectId ??
        (Constants as any).easConfig?.projectId ??
        '—';
      setProjectId(pid);

      const perm = await Notifications.getPermissionsAsync();
      setPushPerm(perm.status);

      // Live token straight from the device — what the OS would register right now.
      if (Device.isDevice && perm.status === 'granted' && pid !== '—') {
        try {
          const t = await Notifications.getExpoPushTokenAsync({ projectId: pid });
          setDeviceToken(t.data);
        } catch {
          setDeviceToken(null);
        }
      }

      // Token stored in the DB — what the Edge Function actually sends to.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data } = await supabase
          .from('users')
          .select('push_token')
          .eq('id', authUser.id)
          .single();
        setDbToken(data?.push_token ?? null);
      }
    } catch (err) {
      if (__DEV__) console.warn('[Dev] loadPushInfo failed:', err);
    }
  };

  const reRegister = async () => {
    setPushBusy(true);
    try {
      const t = await registerForPushNotifications();
      await loadPushInfo();
      Alert.alert(
        'Re-register',
        t
          ? `Fresh token saved to DB:\n${t.slice(0, 42)}…`
          : 'No token — permission denied or running on a simulator.'
      );
    } finally {
      setPushBusy(false);
    }
  };

  // Sends a push straight to Expo (bypasses the Edge Function) and then polls the
  // RECEIPT — the step the Edge Function skips, and the one that reveals the real
  // APNs error (DeviceNotRegistered / MismatchSenderId / BadDeviceToken / etc).
  const sendTestPush = async () => {
    const token = deviceToken ?? dbToken;
    if (!token) {
      Alert.alert('No token', 'No push token available. Tap “Re-register Token” first.');
      return;
    }
    setPushBusy(true);
    try {
      const sendRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          title: 'CERVICED dev test',
          body: 'If you can read this banner, push delivery works ✅',
          sound: 'default',
        }),
      });
      const sendJson = await sendRes.json();
      const ticket = sendJson?.data;
      if (!ticket || ticket.status === 'error') {
        Alert.alert('Send rejected', JSON.stringify(ticket ?? sendJson, null, 2));
        return;
      }

      // Give Expo/APNs a moment, then read the receipt.
      await new Promise((r) => setTimeout(r, 3000));
      const recRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [ticket.id] }),
      });
      const recJson = await recRes.json();
      const receipt = recJson?.data?.[ticket.id];

      if (!receipt) {
        Alert.alert(
          'Sent — receipt pending',
          `Ticket ${ticket.id} accepted. Receipt not ready yet; watch for the banner.`
        );
      } else if (receipt.status === 'ok') {
        Alert.alert(
          '✅ Delivered',
          'Expo + APNs accepted it. If no banner appeared, it is a foreground-handler issue, not delivery.'
        );
      } else {
        Alert.alert(
          `❌ ${receipt.status}`,
          `${receipt.message ?? ''}\n\n${JSON.stringify(receipt.details ?? {}, null, 2)}`
        );
      }
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setPushBusy(false);
    }
  };

  const logTokens = () => {
    if (__DEV__) {
      console.log('[Dev] projectId:', projectId);
      console.log('[Dev] device token:', deviceToken);
      console.log('[Dev] DB token:', dbToken);
    }
    Alert.alert('Logged', 'Project ID and both tokens logged to console.');
  };

  const clearDbToken = async () => {
    await unregisterPushToken();
    await loadPushInfo();
    Alert.alert('Cleared', 'push_token cleared in the DB for this user.');
  };

  // Clears provider-side data that lives on THIS device (extras cache + registration
  // drafts). Does not touch the database — that's a separate, guarded action.
  const clearProviderData = async () => {
    Alert.alert(
      'Clear Provider Data',
      'Remove local provider-side data on this device (provider extras + registration drafts)? This does NOT touch the database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              const providerKeys = keys.filter(
                (k) => k === '@provider_extras' || k.startsWith('@provider_reg_data_')
              );
              if (providerKeys.length > 0) {
                await AsyncStorage.multiRemove(providerKeys);
              }
              Alert.alert('Cleared', `Removed ${providerKeys.length} provider key(s) from local storage.`);
            } catch (error) {
              Alert.alert('Error', 'Failed to clear provider data');
            }
          },
        },
      ]
    );
  };

  // Full server-side reset for the logged-in provider. RLS forbids client deletes,
  // so this calls a self-scoped SECURITY DEFINER RPC (supabase/dev_reset_provider.sql).
  const fullProviderReset = async () => {
    Alert.alert(
      'Full Provider Reset',
      "DELETE all of this provider's bookings (and the clients' linked copies), reviews, transactions, and your notifications, then reset has_gone_live. This cannot be undone. Continue?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset everything',
          style: 'destructive',
          onPress: async () => {
            setPushBusy(true);
            try {
              const { data, error } = await supabase.rpc('dev_reset_provider');
              if (error) {
                Alert.alert(
                  'Reset failed',
                  /dev_reset_provider|function|does not exist|schema cache/i.test(error.message)
                    ? 'RPC not found. Run supabase/dev_reset_provider.sql in the Supabase SQL editor first.'
                    : error.message
                );
                return;
              }
              const res = data as any;
              if (res?.ok === false) {
                Alert.alert('Nothing reset', res?.error ?? 'Unknown reason.');
                return;
              }
              const d = res?.deleted ?? {};
              await loadPushInfo();
              Alert.alert(
                'Provider reset ✓',
                `Bookings: ${d.bookings ?? 0}\nReviews: ${d.reviews ?? 0}\nTransactions: ${d.transactions ?? 0}\nNotifications: ${d.notifications ?? 0}\nhas_gone_live → false`
              );
            } catch (err) {
              Alert.alert('Error', String(err));
            } finally {
              setPushBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: 'transparent' }]}>
        <View style={[styles.container, { backgroundColor: 'transparent' }]}>
          {/* Header — pad past the status bar manually (SafeAreaView top inset is unreliable in a modal) */}
          <View style={[styles.header, { borderBottomColor: P.sep, paddingTop: topInset + 12 }]}>
            <Text style={[styles.title, { color: P.text, fontFamily: 'BakbakOne-Regular' }]}>
              Developer Settings
            </Text>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: P.surface, borderColor: P.border }]}
              onPress={() => navigation.goBack()}
            >
              <Text style={[styles.closeButtonText, { color: P.text }]}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Appearance */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>APPEARANCE</Text>
              <View style={[styles.statCard, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Dark Mode</Text>
                  <Switch
                    value={isDarkMode}
                    onValueChange={(value) => setDarkMode(value)}
                    trackColor={{ false: P.border, true: P.accent }}
                    thumbColor={isDarkMode ? '#fff' : '#f4f3f4'}
                  />
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.sub }]}>Current Mode</Text>
                  <Text style={[styles.statValue, { color: P.accent }]}>{isDarkMode ? 'Dark' : 'Light'}</Text>
                </View>
              </View>

              <View style={styles.themeButtonRow}>
                {(['light', 'dark', 'auto'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.themeButton,
                      { backgroundColor: P.surface, borderColor: P.border },
                      themePreference === mode && { backgroundColor: P.iconBg, borderColor: P.accent },
                    ]}
                    onPress={() => setThemePreference(mode)}
                  >
                    <Text style={[
                      styles.themeButtonText,
                      { color: P.sub },
                      themePreference === mode && { color: P.accent },
                    ]}>
                      {mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Push Notifications */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>PUSH NOTIFICATIONS</Text>
              <View style={[styles.statCard, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Permission</Text>
                  <Text style={[styles.statValue, { color: pushPerm === 'granted' ? P.accent : P.danger }]}>
                    {pushPerm}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Project ID</Text>
                  <Text
                    style={[styles.statValue, { color: P.sub, maxWidth: '55%' }]}
                    numberOfLines={1}
                    selectable
                  >
                    {projectId}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Device token</Text>
                  <Text style={[styles.statValue, { color: deviceToken ? P.accent : P.danger }]}>
                    {deviceToken ? 'present' : 'none'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>DB token</Text>
                  <Text style={[styles.statValue, { color: dbToken ? P.accent : P.danger }]}>
                    {dbToken ? 'present' : 'none'}
                  </Text>
                </View>
                {tokenMismatch && (
                  <>
                    <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                    <View style={styles.statRow}>
                      <Text style={[styles.statLabel, { color: P.danger }]}>⚠︎ Stale</Text>
                      <Text style={[styles.statValue, { color: P.danger }]}>DB ≠ device</Text>
                    </View>
                  </>
                )}
              </View>

              {(deviceToken || dbToken) ? (
                <View style={[styles.tokenBox, { backgroundColor: P.surface, borderColor: P.border }]}>
                  <Text selectable style={[styles.tokenText, { color: P.sub }]}>
                    {deviceToken ?? dbToken}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: P.iconBg, borderColor: P.border, opacity: pushBusy ? 0.5 : 1 }]}
                disabled={pushBusy}
                onPress={sendTestPush}
              >
                <Text style={[styles.primaryButtonText, { color: P.text }]}>
                  {pushBusy ? 'Working…' : 'Send Test Push (+ receipt)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: P.iconBg, borderColor: P.border, opacity: pushBusy ? 0.5 : 1 }]}
                disabled={pushBusy}
                onPress={reRegister}
              >
                <Text style={[styles.primaryButtonText, { color: P.text }]}>Re-register Token</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: P.surface, borderColor: P.border }]}
                onPress={logTokens}
              >
                <Text style={[styles.secondaryButtonText, { color: P.text }]}>Log Tokens to Console</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: `${P.danger}18`, borderColor: `${P.danger}40`, marginTop: 10 }]}
                onPress={clearDbToken}
              >
                <Text style={[styles.dangerButtonText, { color: P.danger }]}>Clear DB Token</Text>
              </TouchableOpacity>
            </View>

            {/* Session & Build */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>SESSION & BUILD</Text>
              <View style={[styles.statCard, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>User ID</Text>
                  <Text
                    style={[styles.statValue, { color: P.sub, maxWidth: '55%' }]}
                    numberOfLines={1}
                    selectable
                  >
                    {user?.id ?? '—'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Email</Text>
                  <Text style={[styles.statValue, { color: P.sub, maxWidth: '55%' }]} numberOfLines={1}>
                    {user?.email ?? '—'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Account / Mode</Text>
                  <Text style={[styles.statValue, { color: P.accent }]}>
                    {(user?.accountType ?? '—')} / {activeMode}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>App version</Text>
                  <Text style={[styles.statValue, { color: P.sub }]}>{appVersion}</Text>
                </View>
              </View>
            </View>

            {/* Storage Stats */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>STORAGE STATS</Text>
              <View style={[styles.statCard, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Total Bookings</Text>
                  <Text style={[styles.statValue, { color: P.accent }]}>{bookingCount}</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: P.sep }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statLabel, { color: P.text }]}>Storage Used</Text>
                  <Text style={[styles.statValue, { color: P.accent }]}>{storageSize}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: P.surface, borderColor: P.border }]}
                onPress={checkBookings}
              >
                <Text style={[styles.secondaryButtonText, { color: P.text }]}>Refresh Stats</Text>
              </TouchableOpacity>
            </View>

            {/* Booking Actions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>BOOKING ACTIONS</Text>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: P.iconBg, borderColor: P.border }]}
                onPress={viewBookings}
              >
                <Text style={[styles.primaryButtonText, { color: P.text }]}>View Bookings Data</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: P.iconBg, borderColor: P.border }]}
                onPress={exportBookings}
              >
                <Text style={[styles.primaryButtonText, { color: P.text }]}>Export to Console</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: `${P.danger}18`, borderColor: `${P.danger}40` }]}
                onPress={clearBookings}
                disabled={bookingCount === 0}
              >
                <Text style={[styles.dangerButtonText, { color: P.danger }]}>
                  Clear Bookings ({bookingCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Storage Actions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>STORAGE ACTIONS</Text>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: P.iconBg, borderColor: P.border }]}
                onPress={viewAllStorageKeys}
              >
                <Text style={[styles.primaryButtonText, { color: P.text }]}>View All Keys</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: `${P.danger}18`, borderColor: `${P.danger}40` }]}
                onPress={clearAllAppData}
              >
                <Text style={[styles.dangerButtonText, { color: P.danger }]}>Clear All App Data</Text>
              </TouchableOpacity>
            </View>

            {/* Provider (dev) */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>PROVIDER</Text>
              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: `${P.danger}18`, borderColor: `${P.danger}40` }]}
                onPress={clearProviderData}
              >
                <Text style={[styles.dangerButtonText, { color: P.danger }]}>Clear Provider Data (local)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: `${P.danger}18`, borderColor: `${P.danger}40`, opacity: pushBusy ? 0.5 : 1 }]}
                disabled={pushBusy}
                onPress={fullProviderReset}
              >
                <Text style={[styles.dangerButtonText, { color: P.danger }]}>
                  {pushBusy ? 'Working…' : 'Full Provider Reset (DB)'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.infoText, { color: P.sub, marginTop: 8 }]}>
                DB reset wipes this provider's bookings, reviews, transactions + your
                notifications and resets go-live. Requires supabase/dev_reset_provider.sql.
              </Text>
            </View>

            {/* About */}
            <View style={[styles.infoSection, { backgroundColor: P.iconBg, borderColor: P.border }]}>
              <Text style={[styles.infoTitle, { color: P.text, fontFamily: 'BakbakOne-Regular' }]}>About</Text>
              <Text style={[styles.infoText, { color: P.sub }]}>
                This screen provides developer tools for testing and debugging.
                {'\n\n'}
                • Push: send a test push + read the APNs receipt on-device{'\n'}
                • Push: compare the live device token vs the token in the DB{'\n'}
                • Inspect session, build + storage{'\n'}
                • Clear test data{'\n\n'}
                Access: Tap top-right corner 5 times rapidly
              </Text>
            </View>
          </ScrollView>

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: P.surface, borderColor: P.border }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: P.text }]}>← Back to Bookings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    letterSpacing: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 28,
    marginTop: -4,
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 8 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 12,
    fontFamily: 'BakbakOne-Regular',
  },
  statCard: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statDivider: {
    height: StyleSheet.hairlineWidth,
  },
  statLabel: { fontSize: 14 },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  primaryButton: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryButtonText: { fontSize: 14, fontWeight: '600' },
  secondaryButton: {
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '500' },
  dangerButton: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dangerButtonText: { fontSize: 14, fontWeight: '600' },
  infoSection: {
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoTitle: { fontSize: 14, marginBottom: 8 },
  infoText: { fontSize: 13, lineHeight: 20 },
  backButton: {
    padding: 14,
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  backButtonText: { fontSize: 14, fontWeight: '600' },
  themeButtonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  themeButton: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  themeButtonText: { fontSize: 12, fontWeight: '600', fontFamily: 'BakbakOne-Regular' },
  tokenBox: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tokenText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
