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
import { tr, useTranslation } from '../../i18n';

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
// Fee rules and dispute wording are held in English (clientBookingHeld), so
// sentences explaining them use the held fee names; status lines and buttons
// use the translated ones.
const kindLabel = (kind: BookingFeeKind) =>
  (kind === 'late' ? tr('clientBooking.fee.kind.late') : tr('clientBooking.fee.kind.noShow'));
const kindLabelHeld = (kind: BookingFeeKind) =>
  (kind === 'late' ? tr('clientBooking.fee.kindHeld.late') : tr('clientBooking.fee.kindHeld.noShow'));

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
  const { t } = useTranslation();

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
      showAlert(tr('common.somethingWentWrong'), errorMessage(err, fallback, context));
    } finally {
      setBusy(false);
      await load();
    }
  }, [load, showAlert]);

  const confirmCharge = (kind: BookingFeeKind, amountPence: number) => {
    showConfirm(t('clientBooking.fee.chargeConfirmTitle', { amount: pounds(amountPence) }), t('clientBooking.fee.chargeConfirmMessage', { client: otherName || 'the client', fee: kindLabelHeld(kind) }), [
      { text: t('common.notNow'), style: 'cancel' },
      { text: t('clientBooking.fee.chargeButton', { amount: pounds(amountPence) }), onPress: () => void run(async () => {
        const result = await chargeBookingFee(bookingId, kind);
        return result.status === 'awaiting_client'
          ? tr('clientBooking.fee.chargeAwaitingClient', { client: otherName || 'the client', date: formatShortDayDate(new Date(result.payBy)) })
          : tr('clientBooking.fee.charged');
      }, t('clientBooking.fee.error.charge'), 'BookingFeeCard.charge') },
    ]);
  };

  const confirmRefund = (charge: BookingFeeCharge) => {
    showConfirm(t('clientBooking.fee.refundConfirmTitle', { amount: pounds(charge.amountPence) }), t('clientBooking.fee.refundConfirmMessage', { client: otherName || 'The client' }), [
      { text: t('common.notNow'), style: 'cancel' },
      { text: t('clientBooking.fee.refundFee'), style: 'destructive', onPress: () => void run(() => refundBookingFee(charge.id), t('clientBooking.fee.error.refund'), 'BookingFeeCard.refund', t('clientBooking.fee.refunded')) },
    ]);
  };

  const confirmCancelRequest = (charge: BookingFeeCharge) => {
    showConfirm(t('clientBooking.fee.cancelRequestTitle'), t('clientBooking.fee.cancelRequestMessage', { client: otherName || 'The client', fee: kindLabelHeld(charge.kind) }), [
      { text: t('clientBooking.fee.keepItOpen'), style: 'cancel' },
      { text: t('clientBooking.fee.cancelRequest'), style: 'destructive', onPress: () => void run(() => cancelBookingFeeRequest(charge.id), t('clientBooking.fee.error.cancelRequest'), 'BookingFeeCard.cancelRequest', t('clientBooking.fee.requestCancelled')) },
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
    if (initError) throw new Error(initError.message || tr('clientBooking.fee.error.openPayment'));
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === 'Canceled') return;
      throw new Error(presentError.message || tr('clientBooking.fee.error.paymentFailed'));
    }
    await confirmBookingFeePayment(charge.id);
    return tr('clientBooking.fee.paid');
  }, t('clientBooking.fee.error.pay'), 'BookingFeeCard.pay');

  if (!charges) return null;

  const body: React.ReactNode[] = [];

  if (role === 'provider' && !fee && window?.open) {
    if (terms?.lateFeePence && window.canCharge.late) {
      body.push(<Action key="late" C={C} busy={busy} label={t('clientBooking.fee.chargeLate', { amount: pounds(terms.lateFeePence) })} onPress={() => confirmCharge('late', terms.lateFeePence!)} />);
    }
    if (terms?.noShowFeePence && window.canCharge.no_show) {
      body.push(<Action key="no_show" C={C} busy={busy} label={t('clientBooking.fee.chargeNoShow', { amount: pounds(terms.noShowFeePence) })} onPress={() => confirmCharge('no_show', terms.noShowFeePence!)} />);
    }
    if (body.length > 0) {
      body.unshift(<Text key="until" style={[st.sub, { color: C.sub }]}>{t('clientBooking.fee.chargeUntil', { time: window.closesAtLabel })}</Text>);
      if (lastFailed) body.unshift(<Text key="failed" style={[st.sub, { color: C.sub }]}>{t('clientBooking.fee.lastAttemptFailed')}</Text>);
    }
  }

  if (fee) {
    const label = t('clientBooking.fee.amountKind', { amount: pounds(fee.amountPence), fee: kindLabel(fee.kind) });
    if (fee.status === 'processing') body.push(<Text key="s" style={[st.title, { color: C.text }]}>{t('clientBooking.fee.statusCharging', { label })}</Text>);
    if (fee.status === 'awaiting_client') {
      const by = fee.payBy ? formatShortDayDate(new Date(fee.payBy)) : null;
      if (role === 'provider') {
        body.push(<Text key="s" style={[st.title, { color: C.text }]}>{t('clientBooking.fee.statusWaitingForClient', { label, client: otherName || t('clientBooking.fee.theClient') })}</Text>);
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>{[
          by ? t('clientBooking.fee.providerAwaitingBy', { date: by }) : t('clientBooking.fee.providerAwaiting'),
          fee.nextRetryAt ? t('clientBooking.fee.providerRetry') : null,
          t('clientBooking.fee.nothingTaken'),
        ].filter(Boolean).join(' ')}</Text>);
        body.push(<Action key="cancel" C={C} busy={busy} label={t('clientBooking.fee.cancelRequest')} ghost onPress={() => confirmCancelRequest(fee)} />);
      } else {
        body.push(<Text key="s" style={[st.title, { color: C.text }]}>{t('clientBooking.fee.statusToPay', { label })}</Text>);
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>{[
          by
            ? t('clientBooking.fee.clientAwaitingBy', { provider: otherName || 'Your provider', date: by })
            : t('clientBooking.fee.clientAwaiting', { provider: otherName || 'Your provider' }),
          fee.nextRetryAt ? t('clientBooking.fee.clientRetry') : null,
        ].filter(Boolean).join(' ')}</Text>);
        body.push(<Action key="pay" C={C} busy={busy} label={t('clientBooking.fee.payButton', { amount: pounds(fee.amountPence) })} onPress={() => payFee(fee)} />);
      }
    }
    if (fee.status === 'refunded') body.push(<Text key="s" style={[st.title, { color: C.text }]}>{t('clientBooking.fee.statusRefunded', { label })}</Text>);
    if (fee.status === 'succeeded') {
      body.push(<Text key="s" style={[st.title, { color: C.text }]}>{t('clientBooking.fee.statusCharged', { label })}</Text>);
      const open = !!fee.disputedAt && !fee.disputeResolvedAt;
      if (fee.disputedAt) {
        body.push(<Text key="d" style={[st.sub, { color: C.sub }]}>
          {role === 'provider'
            ? t('clientBooking.fee.clientDisputed', { client: otherName || 'Your client', reason: fee.disputeReason ?? '' })
            : t('clientBooking.fee.youDisputed', { reason: fee.disputeReason ?? '' })}
        </Text>);
      }
      if (fee.disputeOutcome === 'kept') {
        body.push(<Text key="o" style={[st.sub, { color: C.sub }]}>
          {role === 'provider'
            ? t('clientBooking.fee.youKept', { response: fee.disputeResponse ?? '' })
            : t('clientBooking.fee.providerKept', { provider: otherName || 'Your provider', response: fee.disputeResponse ?? '' })}
        </Text>);
      }
      if (role === 'provider') {
        if (open && draft !== 'keep') {
          body.push(<Action key="keep" C={C} busy={busy} label={t('clientBooking.fee.keepFee')} ghost onPress={() => setDraft('keep')} />);
        }
        if (draft !== 'keep') body.push(<Action key="refund" C={C} busy={busy} label={t('clientBooking.fee.refundFee')} ghost onPress={() => confirmRefund(fee)} />);
      } else if (!fee.disputedAt && feeDisputeOpen(fee, Date.now()) && draft !== 'dispute') {
        body.push(<Action key="dispute" C={C} busy={busy} label={t('clientBooking.fee.disputeButton')} ghost onPress={() => setDraft('dispute')} />);
      } else if (open) {
        body.push(<Text key="w" style={[st.sub, { color: C.sub }]}>{t('clientBooking.fee.waitingForReply', { provider: otherName || t('clientBooking.fee.yourProvider') })}</Text>);
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
          placeholder={isDispute ? t('clientBooking.fee.disputePlaceholder') : t('clientBooking.fee.keepPlaceholder')}
          placeholderTextColor={C.sub}
          multiline
          maxLength={1000}
          style={[st.input, { color: C.text, borderColor: C.border }]}
        />
        <Action C={C} busy={busy} label={isDispute ? t('clientBooking.fee.sendTo', { provider: otherName || t('clientBooking.fee.yourProvider') }) : t('clientBooking.fee.keepAndTell')}
          onPress={() => void run(
            () => (isDispute ? disputeBookingFee(fee!.id, text) : keepDisputedBookingFee(fee!.id, text)),
            isDispute ? t('clientBooking.fee.error.dispute') : t('clientBooking.fee.error.keep'),
            isDispute ? 'BookingFeeCard.dispute' : 'BookingFeeCard.keep',
            isDispute ? t('clientBooking.fee.disputeSent') : undefined,
          )} />
        <Action C={C} busy={busy} label={t('common.cancel')} ghost onPress={() => { setDraft(null); setText(''); }} />
      </View>,
    );
  }

  if (body.length === 0) return null;
  return (
    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[st.heading, { color: C.sub }]}>{t('clientBooking.fee.heading').toUpperCase()}</Text>
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
