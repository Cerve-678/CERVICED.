// src/screens/DevSettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBooking } from '../contexts/BookingContext';
import { useTheme } from '../contexts/ThemeContext';

export default function DevSettingsScreen({ navigation }: any) {
  const [bookingCount, setBookingCount] = useState<number>(0);
  const [storageSize, setStorageSize] = useState<string>('0 KB');
  const { reloadBookings } = useBooking();
  const { isDarkMode, themePreference, setDarkMode, setThemePreference } = useTheme();

  useEffect(() => {
    checkBookings();
  }, []);

  const checkBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@bookings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setBookingCount(parsed.length);

        // Calculate storage size (using string length as approximation)
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
        Alert.alert(
          'Bookings Data',
          `Found ${parsed.length} bookings. Check console for details.`
        );
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
      Alert.alert(
        'Storage Keys',
        `Found ${keys.length} keys:\n${keys.join('\n')}\n\nCheck console for details.`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to read storage keys');
    }
  };

  const exportBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@bookings');
      if (stored) {
        if (__DEV__) console.log('EXPORT BOOKINGS:', stored);
        Alert.alert(
          'Export Complete',
          'Booking data logged to console. Copy from there.'
        );
      } else {
        Alert.alert('No Data', 'No bookings to export');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export bookings');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🛠️ Developer Settings</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Dark Mode Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Dark Mode</Text>
                <Switch
                  value={isDarkMode}
                  onValueChange={(value) => setDarkMode(value)}
                  trackColor={{ false: '#555', true: '#9C27B0' }}
                  thumbColor={isDarkMode ? '#C850C8' : '#ccc'}
                />
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Current Mode</Text>
                <Text style={styles.statValue}>{isDarkMode ? 'Dark' : 'Light'}</Text>
              </View>
            </View>

            <View style={styles.themeButtonRow}>
              {(['light', 'dark', 'auto'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.themeButton,
                    themePreference === mode && styles.themeButtonActive,
                  ]}
                  onPress={() => setThemePreference(mode)}
                >
                  <Text style={[
                    styles.themeButtonText,
                    themePreference === mode && styles.themeButtonTextActive,
                  ]}>
                    {mode === 'auto' ? '🔄 Auto' : mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Stats Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Storage Stats</Text>
            <View style={styles.statCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Bookings:</Text>
                <Text style={styles.statValue}>{bookingCount}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Storage Used:</Text>
                <Text style={styles.statValue}>{storageSize}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={checkBookings}
            >
              <Text style={styles.secondaryButtonText}>🔄 Refresh Stats</Text>
            </TouchableOpacity>
          </View>

          {/* Booking Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Booking Actions</Text>
            
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={viewBookings}
            >
              <Text style={styles.primaryButtonText}>👁️ View Bookings Data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={exportBookings}
            >
              <Text style={styles.primaryButtonText}>📤 Export to Console</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dangerButton}
              onPress={clearBookings}
              disabled={bookingCount === 0}
            >
              <Text style={styles.dangerButtonText}>
                🗑️ Clear Bookings ({bookingCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Storage Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Storage Actions</Text>
            
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={viewAllStorageKeys}
            >
              <Text style={styles.primaryButtonText}>🔑 View All Keys</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dangerButton}
              onPress={clearAllAppData}
            >
              <Text style={styles.dangerButtonText}>⚠️ Clear All App Data</Text>
            </TouchableOpacity>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>ℹ️ About</Text>
            <Text style={styles.infoText}>
              This screen provides developer tools for testing and debugging.
              {'\n\n'}
              • View bookings data in console
              {'\n'}
              • Clear test data
              {'\n'}
              • Monitor storage usage
              {'\n\n'}
              Access: Tap top-right corner 5 times rapidly
            </Text>
          </View>
        </ScrollView>

        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back to Bookings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 28,
    color: '#fff',
    marginTop: -4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#F44336',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  themeButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  themeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  themeButtonActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#C850C8',
  },
  themeButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  themeButtonTextActive: {
    color: '#fff',
  },
});