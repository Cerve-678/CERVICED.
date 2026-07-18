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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBooking } from '../contexts/BookingContext';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme } from '../contexts/ThemeContext';

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
  const P = isDarkMode ? D : L;

  useEffect(() => {
    checkBookings();
  }, []);

  const checkBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.BOOKINGS);
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
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.BOOKINGS);
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
              await AsyncStorage.removeItem(STORAGE_KEYS.BOOKINGS);
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
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.BOOKINGS);
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

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: 'transparent' }]}>
        <View style={[styles.container, { backgroundColor: 'transparent' }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: P.sep }]}>
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

            {/* About */}
            <View style={[styles.infoSection, { backgroundColor: P.iconBg, borderColor: P.border }]}>
              <Text style={[styles.infoTitle, { color: P.text, fontFamily: 'BakbakOne-Regular' }]}>About</Text>
              <Text style={[styles.infoText, { color: P.sub }]}>
                This screen provides developer tools for testing and debugging.
                {'\n\n'}
                • View bookings data in console{'\n'}
                • Clear test data{'\n'}
                • Monitor storage usage{'\n\n'}
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
});
