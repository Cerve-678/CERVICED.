import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

export type AddressSelection = {
  address: string;
  coordinates: { latitude: number; longitude: number };
};

type AddressPickerProps = {
  value: string;
  onChange: (selection: AddressSelection) => void;
  accentColor?: string;
  disabled?: boolean;
};

type AddressResult = AddressSelection & { key: string };

function formatAddress(result: Location.LocationGeocodedAddress): string {
  const street = [result.name, result.streetNumber, result.street]
    .filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
    .join(' ');
  return [street, result.district, result.city, result.region, result.postalCode, result.country]
    .filter(Boolean)
    .join(', ');
}

/**
 * Native address search backed by Expo's geocoder. It deliberately saves the
 * selected, formatted street address rather than the provider's public area.
 */
export default function AddressPicker({ value, onChange, accentColor = '#C2185B', disabled }: AddressPickerProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (visible) setQuery(value);
  }, [value, visible]);

  const search = useCallback(async (address = query) => {
    const trimmed = address.trim();
    if (trimmed.length < 4) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const matches = await Location.geocodeAsync(trimmed);
      // geocodeAsync gives coordinates only. Reverse-geocode each match so the
      // provider selects a complete formatted address, not their search text.
      const reverseMatches = await Promise.all(
        matches.slice(0, 5).map(match => Location.reverseGeocodeAsync({
          latitude: match.latitude,
          longitude: match.longitude,
        }))
      );
      const formatted = reverseMatches
        .map(([address], index) => {
          const label = address ? formatAddress(address) : '';
          const match = matches[index];
          return label && match
            ? { address: label, coordinates: { latitude: match.latitude, longitude: match.longitude }, key: label }
            : null;
        })
        .filter((result): result is AddressResult => result !== null)
        .filter((result, index, all) => all.findIndex(item => item.key === result.key) === index);
      setResults(formatted);
    } catch {
      setResults([]);
      Alert.alert('Address search unavailable', 'Check your connection and try again, or enter your full address.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleUseCurrentLocation = useCallback(async () => {
    setSearching(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access to use your current address.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      const formatted = address ? formatAddress(address) : '';
      if (!formatted) {
        Alert.alert('Address not found', "We couldn't identify an address for your current location.");
        return;
      }
      setQuery(formatted);
      setResults([{
        address: formatted,
        coordinates: { latitude: position.coords.latitude, longitude: position.coords.longitude },
        key: formatted,
      }]);
    } catch {
      Alert.alert('Location unavailable', "We couldn't retrieve your current address. Try searching instead.");
    } finally {
      setSearching(false);
    }
  }, []);

  const selectAddress = (selection: AddressSelection) => {
    onChange(selection);
    setVisible(false);
    setResults([]);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.field, disabled && styles.disabled]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setVisible(true); }}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Choose full business address"
      >
        <Ionicons name="location-outline" size={20} color={accentColor} />
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={2}>
          {value || 'Search and select your full address'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#8B8B95" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setVisible(false); }} />
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
          <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Choose your full address</Text>
              <Text style={styles.subtitle}>Search by street and postcode, then select the matching address.</Text>
            </View>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setVisible(false); }} hitSlop={12} accessibilityLabel="Close address picker">
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={20} color="#6B6B73" />
            <TextInput
              value={query}
              onChangeText={text => { setQuery(text); setResults([]); }}
              placeholder="42 Oak Street, London, N1 2AB"
              placeholderTextColor="#8B8B95"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => search()}
            />
            {searching ? <ActivityIndicator size="small" color={accentColor} /> : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionButton, { borderColor: accentColor }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); search(); }} disabled={searching}>
              <Text style={[styles.actionText, { color: accentColor }]}>Search address</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.currentButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); handleUseCurrentLocation(); }} disabled={searching}>
              <Ionicons name="navigate-outline" size={17} color="#1C1C1E" />
              <Text style={styles.currentText}>Use current location</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
            {results.map(result => (
              <TouchableOpacity key={result.key} style={styles.result} onPress={() => { Haptics.selectionAsync().catch(() => {}); selectAddress(result); }}>
                <Ionicons name="location" size={20} color={accentColor} />
                <Text style={styles.resultText}>{result.address}</Text>
              </TouchableOpacity>
            ))}
            {results.length === 0 && !searching && (
              <Text style={styles.empty}>Enter a street and postcode, then tap “Search address”.</Text>
            )}
          </ScrollView>
          {Platform.OS === 'ios' ? <View style={styles.safeBottom} /> : null}
        </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 54, borderWidth: 1, borderColor: 'rgba(60,60,67,0.18)', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.62)', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  disabled: { opacity: 0.5 }, fieldText: { flex: 1, color: '#1C1C1E', fontSize: 15, lineHeight: 20 }, placeholder: { color: '#8B8B95' },
  modalRoot: { flex: 1 }, backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' }, keyboardAvoiding: { flex: 1, justifyContent: 'flex-end' }, sheet: { maxHeight: '82%', minHeight: 430, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20 }, handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: '#D1D1D6', marginTop: 10, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 }, title: { color: '#1C1C1E', fontSize: 20, fontWeight: '700' }, subtitle: { marginTop: 4, maxWidth: 300, color: '#6B6B73', fontSize: 13, lineHeight: 18 },
  searchRow: { marginTop: 20, minHeight: 52, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F2F2F7' }, input: { flex: 1, color: '#1C1C1E', fontSize: 15, paddingVertical: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 }, actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 10, borderWidth: 1 }, actionText: { fontWeight: '700', fontSize: 14 }, currentButton: { flex: 1.35, minHeight: 42, borderRadius: 10, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, currentText: { color: '#1C1C1E', fontWeight: '600', fontSize: 13 },
  results: { paddingTop: 14, paddingBottom: 16 }, result: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6' }, resultText: { flex: 1, color: '#1C1C1E', fontSize: 15, lineHeight: 21 }, empty: { color: '#6B6B73', textAlign: 'center', marginTop: 30, fontSize: 14, lineHeight: 20 }, safeBottom: { height: 12 },
});
