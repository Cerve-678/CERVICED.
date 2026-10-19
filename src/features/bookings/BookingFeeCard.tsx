import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  cancelBookingFeeRequest, chargeBookingFee, confirmBookingFeePayment, disputeBookingFee, getBookingFeeCharges,
  getBookingFeeTerms, keepDisputedBookingFee, refundBookingFee, startBookingFeePayment,
  type BookingFeeCharge, type BookingFeeKind, type BookingFeeTerms,
} from '../../services/databaseService';
import { buildPaymentSheetAppearance } from '../payments/paymentSheetAppearance';
import { formatShortDayDate } from '../../utils/dateUtils';
import { PaymentRequestError } from '../../utils/paymentRequestError';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { feeChargeWindow, feeDisputeOpen, liveFee } from './bookingFeeRules';

// Late-arrival and no-show fees on one booking (auto-memory
// late-and-no-show-fees-decision). The provider charges within 24 hours and
// answers disputes; the client sees the charge and can dispute it within 7
// days. CERVICED never decides — the server enforces every rule shown here.
//
// If the saved card can't pay (declined, or the bank wants the client to
// approve it), the client is asked to pay instead for 7 days: they pay here
// with the payment sheet, or from the emailed link; the provider sees it
// waiting and can cancel the request (user decisions 2026-10-19).

// StripeProvider is mounted app-wide in App.tsx. Required (not imported) the
// same way CartScreen does it.
const useStripe: typeof import('@stripe/stripe-react-native').useStripe =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@stripe/stripe-react-native').useStripe;

export interface BookingFeeColors {
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  onAccent: string;
}

interface Props {
  bookingId: string;
  role: 'provider' | 'client';
  colors: BookingFeeColors;
  /** The other party's name, for copy ("Ask Sam to…"). */
  otherName?: string;
  /** Changes when the booking's status changes, so the card re-reads (e.g. just marked no-show). */
  refreshKey?: string;
  showConfirm: (title: string, message: string | undefined, buttons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[]) => void;
  showAlert: (title: string, message?: string) => void;
}

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const kindLabel = (kind: BookingFeeKind) => (kind === 'late' ? 'late arrival fee' : 'no-show fee');

function errorMessage(err: unknown, fallback: string, context: string): string {
  if (err instanceof PaymentRequestError) return err.message;
  return toUserMessageAllowingDbGuard(err, fallback, context);
}

export default function BookingFeeCard({ bookingId, role, colors: C, otherName, refreshKey, showConfirm, showAlert }: Props) {
  const [charges, setCharges] = useState<BookingFeeCharge[] | null>(null);
  const [terms, setTerms] = useState<BookingFeeTerms | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<'dispute' | 'keep' | null>(null);
  const [text, setText] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const load = useCallback(async () => {
    try {
      const [rows, bookingTerms] = await Promise.all([
        getBookingFeeCharges(bookingId),
        role === 'provider' ? getBookingFeeTerms(bookingId) : Promise.resolve(null),
      ]);
      setCharges(rows);
      setTerms(bookingTerms);
    } catch {
      // Fees are secondary to the booking itself: a failed read hides the card
      // rather than blocking the screen. Every action re-checks on the server.
      setCharges([]);
    }
  }, [bookingId, role]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const fee = useMemo(() => (charges ? liveFee(charges) : null), [charges]);
  const lastFailed = charges?.[0]?.status === 'failed' ? charges[0] : null;
  const window = terms && !fee ? feeChargeWindow(terms, Date.now()) : null;

  const run = useCallback(async (action: () => Promise<string | void>, fallback: string, context: string, done?: string) => {
    setBusy(true);
    try {
      const outcome = await action();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft(null); setText('');
      if (outcome || done) showAlert(outcome || done!);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert('Something went wrong', errorMessage(err, fallback, context));
    } finally {
      setBusy(false);
      await load();
    }
  }, [load, showAlert]);

  const confirmCharge = (kind: BookingFeeKind, amountPence: number) => {
    showConfirm(`Charge ${pounds(amountPence)}?`, `This charges ${otherName || 'the client'}'s saved card the ${kindLabel(kind)} they agreed to when booking. They'll be told and can dispute it with you.`, [
      { text: 'Not now', style: 'cancel' },
      { text: `Charge ${pounds(amountPence)}`, onPress: () => void run(async () => {
        const result = await chargeBookingFee(bookingId, kind);
        return result.status === 'awaiting_client'
          ? `The card couldn't be charged, so ${otherName || 'the client'} has been asked to pay by ${formatShortDayDate(new Date(result.payBy))}. You'll be told when they do.`
          : 'Fee charged';
      }, 'Could not charge this fee.', 'BookingFeeCard.charge') },
    ]);
  };

  const confirmRefund = (charge: BookingFeeCharge) => {
    showConfirm(`Refund ${pounds(charge.amountPence)}?`, `${otherName || 'The client'} gets the whole fee back, and it comes off what you're paid.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Refund fee', style: 'destructive', onPress: () => void run(() => refundBookingFee(charge.id), 'Could not refund this fee.', 'BookingFeeCard.refund', 'Fee refunded') },
    ]);
  };

  const confirmCancelRequest = (charge: BookingFeeCharge) => {
    showConfirm('Cancel this request?', `${otherName || 'The client'} won't be able to pay the ${kindLabel(charge.kind)} any more.`, [
      { text: 'Keep it open', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => void run(() => cancelBookingFeeRequest(charge.id), 'Could not cancel this request.', 'BookingFeeCard.cancelRequest', 'Request cancelled') },
    ]);
  };

  const payFee = (charge: BookingFeeCharge) => void run(async () => {
    const sheet = await startBookingFeePayment(charge.id);
    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: 'Cerviced',
      returnURL: 'cerviced://stripe-redirect',
      customerId: sheet.customerId,
      customerEphemeralKeySecret: sheet.ephemeralKeySecret,
      paymentIntentClientSecret: sheet.clientSecret,
      appearance: buildPaymentSheetAppearance(
        { accent: C.accent, onAccent: C.onAccent, bg: C.card, surface: C.card, border: C.border, sub: C.sub }, C.text,
      ),
    });
    if (initError) throw new Error(initError.message || 'Could not open payment.');
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === 'Canceled') return;
      throw new Error(presentError.message || 'Your payment did not go through.');
    }
    await confirmBookingFeePayment(charge.id);
    return 'Fee paid';
  }, 'Could not take this payment.', 'BookingFeeCard.pay');

  if (!charges) return null;

  const body: React.ReactNode[] = [];

  if (role === 'provider' && !fee && window?.open) {
    if (terms?.lateFeePence && window.canCharge.late) {
      body.push(<Action key="late" C={C} busy={busy} label={`Charge late fee · ${pounds(terms.lateFeePence)}`} onPress={() => confirmCharge('late', terms.lateFeePence!)} />);
    }
    if (terms?.noShowFeePence && window.canCharge.no_show) {
      body.push(<Action key="no_show" C={C} busy={busy} label={`Charge no-show fee · ${pounds(terms.noShowFeePence)}`} onPress={() => confirmCharge('no_show', terms.noShowFeePence!)} />);
    }
    if (body.length > 0) {
      body.unshift(<Text key="until" style={[st.sub, { color: C.sub }]}>You can charge until {window.closesAtLabel}.</Text>);
      if (lastFailed) body.unshift(<Text key="failed" style={[st.sub, { color: C.sub }]}>Your last attempt couldn't be collected — the client's bank declined it.</Text>);
    }
  }

  if (fee) {
    const label = `${pounds(fee.amountPence)} ${kindLabel(fee.kind)}`;
    if (fee.status === 'processing') body.push(<Text key="s" style={[st.title, { color: C.text }]}>{label} · charging…</Text>);
    if (fee.status === 'awaiting_client') {
      const by = fee.payBy ? formatShortDayDate(new Date(fee.payBy)) : null;
      if (role === 'provider') {
        body.push(<Text key="s" style={[st.title, { color: C.text }]}>{label} · waiting for {otherName || 'the client'} to pay</Text>);
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>The saved card couldn't be charged, so they've been asked to pay{by ? ` by ${by}` : ''}. Nothing has been taken yet.</Text>);
        body.push(<Action key="cancel" C={C} busy={busy} label="Cancel request" ghost onPress={() => confirmCancelRequest(fee)} />);
      } else {
        body.push(<Text key="s" style={[st.title, { color: C.text }]}>{label} to pay</Text>);
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>{otherName || 'Your provider'} couldn't take the fee you agreed to from your saved card. Please pay it{by ? ` by ${by}` : ''}.</Text>);
        body.push(<Action key="pay" C={C} busy={busy} label={`Pay ${pounds(fee.amountPence)}`} onPress={() => payFee(fee)} />);
      }
    }
    if (fee.status === 'refunded') body.push(<Text key="s" style={[st.title, { color: C.text }]}>{label} · refunded</Text>);
    if (fee.status === 'succeeded') {
      body.push(<Text key="s" style={[st.title, { color: C.text }]}>{label} · charged</Text>);
      const open = !!fee.disputedAt && !fee.disputeResolvedAt;
      if (fee.disputedAt) {
        body.push(<Text key="d" style={[st.sub, { color: C.sub }]}>
          {role === 'provider' ? `${otherName || 'Your client'} disputed it` : 'You disputed it'}: "{fee.disputeReason}"
        </Text>);
      }
      if (fee.disputeOutcome === 'kept') {
        body.push(<Text key="o" style={[st.sub, { color: C.sub }]}>
          {role === 'provider' ? 'You kept the fee' : `${otherName || 'Your provider'} kept the fee`}: "{fee.disputeResponse}"
        </Text>);
      }
      if (role === 'provider') {
        if (open && draft !== 'keep') {
          body.push(<Action key="keep" C={C} busy={busy} label="Keep fee" ghost onPress={() => setDraft('keep')} />);
        }
        if (draft !== 'keep') body.push(<Action key="refund" C={C} busy={busy} label="Refund fee" ghost onPress={() => confirmRefund(fee)} />);
      } else if (!fee.disputedAt && feeDisputeOpen(fee, Date.now()) && draft !== 'dispute') {
        body.push(<Action key="dispute" C={C} busy={busy} label="This isn't right — dispute it" ghost onPress={() => setDraft('dispute')} />);
      } else if (open) {
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>Waiting for {otherName || 'your provider'} to reply.</Text>);
      }
    }
  }

  if (draft) {
    const isDispute = draft === 'dispute';
    body.push(
      <View key="draft">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isDispute ? 'What happened?' : 'Why does the fee stand?'}
          placeholderTextColor={C.sub}
          multiline
          maxLength={1000}
          style={[st.input, { color: C.text, borderColor: C.border }]}
        />
        <Action C={C} busy={busy} label={isDispute ? `Send to ${otherName || 'your provider'}` : 'Keep fee and tell the client'}
          onPress={() => void run(
            () => (isDispute ? disputeBookingFee(fee!.id, text) : keepDisputedBookingFee(fee!.id, text)),
            isDispute ? 'Could not send your dispute.' : 'Could not save your answer.',
            isDispute ? 'BookingFeeCard.dispute' : 'BookingFeeCard.keep',
            isDispute ? 'Sent — they can refund it or explain why it stands.' : undefined,
          )} />
        <Action C={C} busy={busy} label="Cancel" ghost onPress={() => { setDraft(null); setText(''); }} />
      </View>,
    );
  }

  if (body.length === 0) return null;
  return (
    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[st.heading, { color: C.sub }]}>LATE & NO-SHOW FEES</Text>
      {body}
    </View>
  );
}

function Action({ C, label, onPress, busy, ghost }: { C: BookingFeeColors; label: string; onPress: () => void; busy: boolean; ghost?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} activeOpacity={0.75}
      style={[st.button, ghost ? { borderColor: C.border, borderWidth: StyleSheet.hairlineWidth } : { backgroundColor: C.accent }]}>
      {busy && !ghost ? <ActivityIndicator color={C.onAccent} size="small" />
        : <Text style={[st.buttonText, { color: ghost ? C.text : C.onAccent }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  heading: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 0.6 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  input: { minHeight: 72, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, fontSize: 14, textAlignVertical: 'top', marginBottom: 8 },
  button: { borderRadius: 20, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
});
