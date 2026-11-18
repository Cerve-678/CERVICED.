// One booking's late, no-show or late-cancel fee, opened from Payments &
// payouts: charge it, refund it, or answer a dispute. The actions are
// BookingFeeCard's; this is only the sheet around it, styled like
// BookingPaymentTimeline beside it.
import React from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusinessPalette } from '../features/business-details/BusinessDetailsKit';
import BookingFeeCard from '../features/bookings/BookingFeeCard';
import { useAppDialog } from './AppDialog';
import { formatShortDayDate } from '../utils/dateUtils';

export interface BookingFeeSheetTarget {
  bookingId: string;
  customerName: string | null;
  serviceName: string | null;
  bookingDate?: string | null;
}

export default function BookingFeeSheet({ target, onClose }: { target: BookingFeeSheetTarget; onClose: () => void }) {
  const C = useBusinessPalette();
  const insets = useSafeAreaInsets();
  // Its own dialogs: one opened from the screen behind can't show above a Modal.
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const top = Platform.OS === 'ios' ? 16 : insets.top + 12;
  const day = target.bookingDate ? formatShortDayDate(target.bookingDate.slice(0, 10)) : null;

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[st.root, { backgroundColor: C.bg }]}>
      <View style={[st.header, { paddingTop: top }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to payments" activeOpacity={0.7}
          onPress={() => { void Haptics.selectionAsync().catch(() => {}); onClose(); }}
          style={[st.back, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[st.backText, { color: C.accentText }]}>Back</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[st.headerTitle, { color: C.text }]}>Late & no-show fee</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={st.intro}>
          <Text style={[st.service, { color: C.text }]}>{target.serviceName || 'Booking'}</Text>
          <Text style={[st.sub, { color: C.sub }]}>{[target.customerName || 'Client', day].filter(Boolean).join(' · ')}</Text>
        </View>
        <BookingFeeCard
          bookingId={target.bookingId}
          role="provider"
          otherName={target.customerName?.split(' ')[0]}
          colors={{ card: C.card, text: C.text, sub: C.sub, border: C.border, accent: C.accent, onAccent: C.bg }}
          showConfirm={showConfirm}
          showAlert={showAlert}
        />
        <Text style={[st.note, { color: C.sub }]}>
          Fees can be charged until 24 hours after the appointment ends. Your client is told, and can dispute it with you.
        </Text>
      </ScrollView>
      <DialogHost />
    </View>
  </Modal>;
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  back: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17 },
  intro: { paddingHorizontal: 20, paddingTop: 8, gap: 2 },
  service: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13 },
  note: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, paddingHorizontal: 20, marginTop: 14 },
});
