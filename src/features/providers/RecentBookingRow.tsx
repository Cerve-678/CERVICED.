// src/features/providers/RecentBookingRow.tsx
//
// One booking in a provider's Recent activity: on My Profile's card (the
// latest three) and on the See all list. The caller draws the card or list
// around it; this is the row and the hairline under it.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BookingWithAddOns } from '../../types/database';
import { describeRecentBooking } from './recentBookingActivity';

interface Props {
  booking: BookingWithAddOns;
  onPress: (booking: BookingWithAddOns) => void;
  textColor: string;
  subTextColor: string;
  borderColor: string;
  /** No hairline under the last row of a card. */
  isLast: boolean;
}

export function RecentBookingRow({ booking, onPress, textColor, subTextColor, borderColor, isLast }: Props) {
  const row = describeRecentBooking(booking);
  return (
    <TouchableOpacity
      style={[st.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor }]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress(booking);
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${row.service}. ${row.detail}. ${row.booked}. ${row.price}. ${row.status}. Opens the booking.`}
    >
      <View style={[st.dot, { backgroundColor: row.statusColor }]} />
      <View style={st.body}>
        <View style={st.topLine}>
          <Text style={[st.service, { color: textColor }]} numberOfLines={1}>{row.service}</Text>
          <Text style={[st.price, { color: textColor }]}>{row.price}</Text>
        </View>
        <Text style={[st.detail, { color: subTextColor }]} numberOfLines={1}>{row.detail}</Text>
        <Text style={[st.meta, { color: subTextColor }]} numberOfLines={1}>
          {row.booked} · <Text style={{ color: row.statusColor }}>{row.status}</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  body: { flex: 1, gap: 3 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  service: { flex: 1, fontSize: 14, fontWeight: '600' },
  price: { fontSize: 14, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 17 },
  meta: { fontSize: 11, lineHeight: 15 },
});
