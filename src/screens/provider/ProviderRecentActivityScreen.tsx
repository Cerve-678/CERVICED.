// src/screens/provider/ProviderRecentActivityScreen.tsx
//
// My Profile → Recent activity → See all: the provider's bookings by when
// they were made, newest first, up to RECENT_ACTIVITY_SEE_ALL_LIMIT. Same
// rows as the card on My Profile; a tap opens the booking.

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { getMyProviderProfile, getProviderRecentBookings } from '../../services/databaseService';
import type { BookingWithAddOns } from '../../types/database';
import type { ProviderServicesStackParamList } from '../../navigation/types';
import { mapDbBookingToConfirmed } from '../../services/bookingService';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { RecentBookingRow } from '../../features/providers/RecentBookingRow';
import { RECENT_ACTIVITY_SEE_ALL_LIMIT } from '../../features/providers/recentBookingActivity';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { logger } from '../../utils/logger';

const L = {
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
};
const D = {
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
};

type Props = NativeStackScreenProps<ProviderServicesStackParamList, 'RecentActivity'>;

export default function ProviderRecentActivityScreen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  const bottomGap = useSystemBottomInset() + 24;
  const [bookings, setBookings] = useState<BookingWithAddOns[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profile = await getMyProviderProfile();
          const rows = profile ? await getProviderRecentBookings(profile.id, RECENT_ACTIVITY_SEE_ALL_LIMIT) : [];
          if (!active) return;
          setBookings(rows);
          setFailed(false);
        } catch (err) {
          logger.error('[RecentActivity] load failed:', err);
          // Keep a list already on screen; only a first load shows the error.
          if (active) setFailed(true);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const openBooking = useCallback(
    (booking: BookingWithAddOns) => {
      navigation.navigate('BookingDetail', { bookingId: booking.id, booking: mapDbBookingToConfirmed(booking) });
    },
    [navigation],
  );

  const renderBody = () => {
    if (bookings === null && failed) {
      return (
        <View style={s.center}>
          <Text style={[s.emptyText, { color: P.sub }]}>Couldn't load your recent bookings. Please try again in a moment.</Text>
        </View>
      );
    }
    if (bookings === null) {
      return (
        <View style={s.center}>
          <ActivityIndicator color={P.accent} />
        </View>
      );
    }
    if (bookings.length === 0) {
      return (
        <View style={s.center}>
          <Text style={[s.emptyText, { color: P.sub }]}>New bookings will show here as clients make them.</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={bookings}
        keyExtractor={item => item.id}
        contentContainerStyle={[s.listContent, { paddingBottom: bottomGap }]}
        renderItem={({ item, index }) => (
          <View
            style={[
              s.rowWrap,
              { backgroundColor: P.card, borderColor: P.border },
              index === 0 && s.first,
              index === bookings.length - 1 && s.last,
            ]}
          >
            <RecentBookingRow
              booking={item}
              onPress={openBooking}
              textColor={P.text}
              subTextColor={P.sub}
              borderColor={P.border}
              isLast={index === bookings.length - 1}
            />
          </View>
        )}
      />
    );
  };

  return (
    <ThemedBackground style={s.root}>
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}>
          <View style={s.headerText}>
            <Text style={[s.headerTitle, { color: P.text }]}>Recent activity</Text>
            <Text style={[s.headerSub, { color: P.sub }]}>Your bookings, newest first</Text>
          </View>
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: P.surface }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigation.goBack();
            }}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>
        {renderBody()}
      </SafeAreaView>
    </ThemedBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerText: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  listContent: { paddingHorizontal: 16 },
  // One card down the whole list: the first and last rows round its corners.
  rowWrap: { paddingHorizontal: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 4 },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingBottom: 4 },
});
