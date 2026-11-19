// One booking payment, opened from Payments & payouts: what it's worth to the
// provider, any tip, and a timeline from booked to their bank.
import React, { useMemo } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusinessPalette } from '../features/business-details/BusinessDetailsKit';
import { ProcessingLabel, StatusChip } from '../features/payments/PaymentsCardKit';
import {
  bookingPaymentTimeline, payoutNeedsAttention, payoutStatusLabel, shortDay, tipPence, type TimelineStep,
} from '../features/payments/bookingPaymentTimeline';
import type { ProviderPayout, ProviderTipEarning } from '../services/providerPaymentService';

const money = (pence: number, currency = 'gbp') => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);

export default function BookingPaymentTimeline({ row, tips, scheduleSentence, onClose, onRefund }: {
  row: ProviderPayout;
  tips: readonly ProviderTipEarning[];
  scheduleSentence: string;
  onClose: () => void;
  /** Absent when this payment can't be refunded from here. */
  onRefund?: (() => void) | undefined;
}) {
  const C = useBusinessPalette();
  const insets = useSafeAreaInsets();
  const steps = useMemo(() => bookingPaymentTimeline(row, tips, { now: new Date(), scheduleSentence }), [row, tips, scheduleSentence]);
  const tipTotal = tips.reduce((sum, tip) => sum + tipPence(tip), 0);
  const day = row.booking?.booking_date ? shortDay(new Date(`${row.booking.booking_date.slice(0, 10)}T12:00:00`)) : null;
  // A page sheet on iOS sits below the status bar already; a full-screen modal
  // on Android doesn't, and SafeAreaView does nothing inside a Modal.
  const top = Platform.OS === 'ios' ? 16 : insets.top + 12;

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[st.root, { backgroundColor: C.bg }]}>
      <View style={[st.header, { paddingTop: top }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to payments" activeOpacity={0.7}
          onPress={() => { void Haptics.selectionAsync().catch(() => {}); onClose(); }}
          style={[st.back, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="chevron-back" size={20} color={C.accentText} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[st.headerTitle, { color: C.text }]}>Booking payment</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={st.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.service, { color: C.text }]}>{row.booking?.service_name_snapshot || 'Booking payment'}</Text>
              <Text style={[st.sub, { color: C.sub }]}>{[row.booking?.customer_name || 'Client', day].filter(Boolean).join(' · ')}</Text>
            </View>
            <StatusChip label={payoutStatusLabel(row)} attention={payoutNeedsAttention(row)} />
          </View>
          <View style={st.totalRow}>
            <Text style={[st.total, { color: C.text }]}>{money(row.payout_amount + tipTotal, row.currency)}</Text>
            <Text style={[st.sub, { color: C.sub }]}>{tipTotal > 0 ? 'to you, with tip' : 'to you'}</Text>
          </View>
          <Line label="Your share" value={money(row.payout_amount, row.currency)} />
          {tips.map(tip => <Line key={tip.id} label="Tip, all yours" value={money(tipPence(tip))} />)}

          <View style={[st.section, { borderTopColor: C.border }]}>
            <Text style={[st.eyebrow, { color: C.accentText }]}>WHERE IT IS</Text>
            {steps.map((step, i) => <Step key={step.key} step={step} last={i === steps.length - 1} nextDone={steps[i + 1]?.state === 'done' || steps[i + 1]?.state === 'now'} />)}
          </View>

          {onRefund && <View style={[st.section, { borderTopColor: C.border, paddingBottom: 0 }]}>
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.75} onPress={onRefund} style={[st.action, { backgroundColor: C.surface }]}>
              <Text style={[st.actionText, { color: C.accentText }]}>Refund client</Text>
            </TouchableOpacity>
          </View>}
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

function Line({ label, value }: { label: string; value: string }) {
  const C = useBusinessPalette();
  return <View style={[st.line, { borderTopColor: C.border }]}>
    <Text style={[st.body, { color: C.text }]}>{label}</Text>
    <Text style={[st.lineValue, { color: C.text }]}>{value}</Text>
  </View>;
}

function Step({ step, last, nextDone }: { step: TimelineStep; last: boolean; nextDone: boolean }) {
  const C = useBusinessPalette();
  const done = step.state === 'done';
  const now = step.state === 'now';
  const titleColor = step.state === 'next' ? C.sub : C.text;
  return <View style={st.step} accessible accessibilityLabel={`${step.title}, ${step.when}${now ? ', where it is now' : done ? ', done' : ', still to come'}`}>
    <View style={st.rail}>
      <View style={[st.marker, {
        borderColor: done || now ? C.accent : C.sub,
        backgroundColor: done ? C.accent : now ? C.card : 'transparent',
      }, now && { shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }]} />
      {!last && <View style={[st.railLine, { backgroundColor: nextDone ? C.accent : C.border }]} />}
    </View>
    <View style={st.stepBody}>
      <View style={st.stepHead}>
        {step.explainsProcessing
          ? <View style={{ flex: 1 }}><ProcessingLabel color={titleColor} ringColor={C.border} labelStyle={st.stepTitle} /></View>
          : <Text style={[st.stepTitle, { color: titleColor, flex: 1 }]}>{step.title}</Text>}
        {step.amountPence != null && <Text style={[st.stepAmount, { color: C.text }]}>{money(step.amountPence)}</Text>}
      </View>
      {!!step.when && <Text style={[st.sub, { color: C.sub }]}>{step.when}</Text>}
      {!!step.note && <Text style={[st.body, { color: C.text, marginTop: 6 }]}>{step.note}</Text>}
    </View>
  </View>;
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, flex: 1 },
  card: { borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  service: { fontFamily: 'BakbakOne-Regular', fontSize: 17 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, marginTop: 2 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14, marginBottom: 10 },
  total: { fontFamily: 'BakbakOne-Regular', fontSize: 36 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  lineValue: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, paddingBottom: 4, marginTop: 8 },
  eyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.5, marginBottom: 14 },
  step: { flexDirection: 'row', gap: 14 },
  rail: { width: 14, alignItems: 'center' },
  marker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 },
  railLine: { flex: 1, width: 2, marginVertical: 4 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  stepTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  stepAmount: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  action: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
});
