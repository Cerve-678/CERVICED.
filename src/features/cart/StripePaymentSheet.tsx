import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Appearance,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PaymentRequestError } from '../../utils/paymentRequestError';
import { createPaymentIntent, capturePaymentIntent, cancelPaymentIntent, markDeclineSeen } from '../../services/stripeService';
import { settledFromCaptureStatus, waitForCheckoutOutcome, type CheckoutWaitResult } from './checkoutOutcome';
import {
  getCheckoutFees, acceptCheckoutFees, type CheckoutFee, listSavedCards, getCachedSavedCards, getCheckoutOutcome,
  getCheckoutHoldPlan, type CheckoutHoldPlan,
} from '../../services/databaseService';
import { holdPlanNote, payButtonLabel } from './requestHolds';
import {
  savedCardBrandName, savedCardExpiryLabel, savedCardExpiryState, type SavedCard,
} from '../payments/savedCards';
import {
  FEE_CONSENT_LINE,
  LATE_CANCEL_CONSENT_LINE,
  FEE_TERMS_BODY,
  FEE_TERMS_HEADING,
  FEE_TERMS_SHA256,
  FEE_TERMS_VERSION,
} from '../../constants/feeTerms';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { dimensions, fonts, spacing } from '../../constants/PlatformDimensions';
import { logger } from '../../utils/logger';
import { env } from '../../utils/env';
import { toArgbHex } from '../../utils/color';
import { PAYPAL_MAX_CHECKOUT_TOTAL } from './platformFee';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';

/**
 * The card payment sheet for a checkout the server has already prepared
 * (prepare_checkout): saved cards, Apple/Google Pay, PayPal, a new card, and
 * the late/no-show fee consent. The Cart opens it after Confirm & Pay, and a
 * held waitlist slot opens it on its own ticket. Both hand it the same
 * checkout batch, so the money rules are the server's in either case.
 */

/** The Cart warms the saved-card list; a list this recent isn't read again. */
export const SAVED_CARDS_FRESH_MS = 60_000;

// Expo SDK 57 ships a compatible Stripe module in Expo Go, so use the real
// module in both Expo Go and custom native builds.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeRN: typeof import('@stripe/stripe-react-native') = require('@stripe/stripe-react-native');
const { CardForm, PlatformPay, PlatformPayButton, useStripe } = StripeRN;
const GOOGLE_PAY_TEST_ENV = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']?.startsWith('pk_test_') === true;

const PAYPAL_NAVY = '#003087';

/** One line of the sheet's order summary: what the card is charged for it. */
export interface PaymentSheetLine {
  id: string;
  label: string;
  price: number;
  isDeposit: boolean;
}

export interface StripePaymentSheetProps {
  isVisible: boolean;
  onClose: () => void;
  lines: PaymentSheetLine[];
  totalAmount: number;
  /** The server-prepared checkout. Its amount and held bookings already
   *  exist before the sheet opens. */
  checkoutBatchId?: string | null;
  onPaymentSuccess: (paymentMethod: string, paymentIntentId?: string) => Promise<void>;
  onPaymentComplete: () => void;
  /** The card was approved but the checkout didn't simply book: refunded or
   *  not charged (the time had gone), or still unsettled after waiting. */
  onPaymentPending?: (outcome: Exclude<CheckoutWaitResult, 'succeeded'>) => void;
  /** The checkout went through: which one, and how much of it is only held
   *  on the card for requests (null if that couldn't be read). */
  onCheckoutPaid?: (checkoutBatchId: string, plan: CheckoutHoldPlan | null) => void;
  /** True from the moment the payment is handed to Stripe until it's settled
   *  or has failed. While it is, leaving must not cancel the checkout: the
   *  card may already be approved. */
  onPaymentInFlight?: (inFlight: boolean) => void;
  /** Which opening of this sheet is current. The caller moves it on when the
   *  client leaves (which closes the sheet) and each time it opens the sheet,
   *  so a payment still going through can tell it has been left behind. */
  getSheetOpenId?: () => number;
  /** A payment the client had left failed, and its checkout is cancelled.
   *  message is what went wrong, or null when there's nothing to tell them
   *  (it never reached Stripe, or they cancelled it themselves). */
  onPaymentFailedAway?: (checkoutBatchId: string, message: string | null) => void;
  /** Shown by the caller's own dialog host, not this sheet's: an alert
   *  nested inside this Modal would close with it. */
  onBookingFailed: (message: string) => void;
}


export const StripePaymentSheet: React.FC<StripePaymentSheetProps> = memo(
  ({
    isVisible,
    onClose,
    lines,
    totalAmount,
    checkoutBatchId,
    onPaymentSuccess,
    onPaymentComplete,
    onPaymentPending,
    onCheckoutPaid,
    onPaymentInFlight,
    getSheetOpenId,
    onPaymentFailedAway,
    onBookingFailed,
  }) => {
    const { theme, palette: P, isDarkMode } = useTheme();
    // See the mock PaymentModal above — same reason, same fix.
    const bottomInset = useSystemBottomInset();
    const { confirmPayment, confirmPlatformPayPayment, isPlatformPaySupported, retrievePaymentIntent } = useStripe();
    const [isProcessing, setIsProcessing] = useState(false);
    // The card is approved and the app is waiting for the server to settle it.
    const [confirming, setConfirming] = useState(false);
    const processingRef = useRef(false);
    const [cardComplete, setCardComplete] = useState(false);
    const [walletSupported, setWalletSupported] = useState(false);
    // A declined card or a failed bank check stays in this sheet so the
    // client can fix it and try again.
    const [payError, setPayError] = useState<string | null>(null);
    // The intent this checkout opened. A retry reuses it (the server hands
    // back the same one per checkout); closing the sheet cancels it.
    const openIntentRef = useRef<string | null>(null);
    // The "client saw this refusal" mark still on its way to the server. The
    // next attempt waits for it, because starting that attempt clears the mark
    // (create-payment-intent); a mark landing after the clear would hide the
    // new attempt's refusal if the app then closed.
    const declineSeenRef = useRef<Promise<void> | null>(null);

    useEffect(() => {
      if (!isVisible) return;
      openIntentRef.current = null;
      setPayError(null);
      setCardComplete(false);
    }, [isVisible]);

    // The client's saved cards (Payment Methods), so they can pay with one in
    // a tap. 'new' = type a card into the CardForm. Expired cards are left
    // out: Stripe would only decline them. A failed load just shows the form.
    // The Cart screen starts the read, so the list is usually already here;
    // it is shown at once and checked again in the background.
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
    const [selectedCard, setSelectedCard] = useState<string>('new');
    // Once the client taps a row, a background refresh keeps their pick.
    const pickedCardRef = useRef(false);
    useEffect(() => {
      if (!isVisible) return;
      let cancelled = false;
      pickedCardRef.current = false;
      const showCards = (cards: SavedCard[]) => {
        const usable = cards.filter(card => savedCardExpiryState(card) !== 'expired');
        setSavedCards(usable);
        setSelectedCard(current => {
          if (current !== 'new' && usable.some(card => card.id === current)) return current;
          if (current === 'new' && pickedCardRef.current) return current;
          return usable[0]?.id ?? 'new';
        });
      };
      setSelectedCard('new');
      showCards((userId && getCachedSavedCards(userId)) || []);
      listSavedCards({ maxAgeMs: SAVED_CARDS_FRESH_MS })
        .then(cards => {
          if (cancelled || processingRef.current) return;
          showCards(cards);
        })
        .catch(err => logger.error('[checkout] could not load saved cards', err));
      return () => { cancelled = true; };
    }, [isVisible, userId]);
    const payingWithSavedCard = selectedCard !== 'new';

    // Apple Pay / Google Pay need a development build (env.isExpoGo).
    useEffect(() => {
      if (!isVisible || env.isExpoGo) return;
      let cancelled = false;
      isPlatformPaySupported({ googlePay: { testEnv: GOOGLE_PAY_TEST_ENV } })
        .then(supported => { if (!cancelled) setWalletSupported(supported); })
        .catch(err => logger.error('[checkout] could not check wallet support', err));
      return () => { cancelled = true; };
    }, [isVisible, isPlatformPaySupported]);

    // On iOS, Stripe's CardForm draws its boxes and text in the phone's own
    // light/dark style and ignores the colours it's given, and app.json pins
    // the phone side to light — so in the app's dark mode the form came out
    // as a bright white block. While this sheet is open, run iOS in the
    // app's mode so the form matches it, and hand it back on close. The app's
    // theme doesn't move: 'auto' already equals this value, and a manual
    // light/dark choice never reads the phone's setting.
    useEffect(() => {
      if (!isVisible || Platform.OS !== 'ios') return;
      Appearance.setColorScheme(isDarkMode ? 'dark' : 'light');
      return () => Appearance.setColorScheme('unspecified');
    }, [isVisible, isDarkMode]);
    // Late/no-show and late cancellation fees the client must agree to before
    // their card is saved for them. null = still loading; [] = this checkout
    // has none. Each kind has its own tick box (user choice 2026-11-13).
    const [fees, setFees] = useState<CheckoutFee[] | null>(null);
    const [feesError, setFeesError] = useState(false);
    const [agreedToFees, setAgreedToFees] = useState(false);
    const [agreedToLateCancel, setAgreedToLateCancel] = useState(false);
    const [feesAttempt, setFeesAttempt] = useState(0);
    const [showFeeTerms, setShowFeeTerms] = useState(false);
    const [showLateCancelTerms, setShowLateCancelTerms] = useState(false);

    useEffect(() => {
      if (!isVisible || !checkoutBatchId) return;
      let cancelled = false;
      setFees(null); setFeesError(false); setAgreedToFees(false); setAgreedToLateCancel(false);
      getCheckoutFees(checkoutBatchId)
        .then(rows => { if (!cancelled) setFees(rows); })
        .catch(err => {
          logger.error('[checkout] could not load provider fees', err);
          if (!cancelled) setFeesError(true);
        });
      return () => { cancelled = true; };
    }, [isVisible, checkoutBatchId, feesAttempt]);

    // How much is charged now and how much only held for requests (each
    // charged only if accepted). null while loading or if it couldn't be
    // read: the sheet then shows the plain total, and the server still
    // holds the requests.
    const [holdPlan, setHoldPlan] = useState<CheckoutHoldPlan | null>(null);
    useEffect(() => {
      if (!isVisible || !checkoutBatchId) return;
      let cancelled = false;
      setHoldPlan(null);
      getCheckoutHoldPlan(checkoutBatchId)
        .then(plan => { if (!cancelled) setHoldPlan(plan); })
        .catch(err => logger.error('[checkout] could not load the request hold plan', err));
      return () => { cancelled = true; };
    }, [isVisible, checkoutBatchId]);
    const heldNote = holdPlanNote(holdPlan);

    const hasFees = (fees?.length ?? 0) > 0;
    const visitFees = useMemo(
      () => (fees ?? []).filter(fee => fee.lateFeePence != null || fee.noShowFeePence != null),
      [fees],
    );
    const lateCancelFees = useMemo(() => (fees ?? []).filter(fee => fee.lateCancelFeePence != null), [fees]);
    const canPay = fees !== null
      && (visitFees.length === 0 || agreedToFees)
      && (lateCancelFees.length === 0 || agreedToLateCancel);
    // Same rules as create-payment-intent: a late/no-show or late cancellation fee is charged later
    // to a saved card, so those checkouts are card-only, and so is a total
    // over PAYPAL_MAX_CHECKOUT_TOTAL, and so is a checkout with a request
    // (its hold is placed on a card). Hidden in Expo Go, which can't return
    // from PayPal's page.
    const paypalShown = fees !== null && !hasFees && holdPlan !== null && holdPlan.requestCount === 0
      && totalAmount <= PAYPAL_MAX_CHECKOUT_TOTAL && !env.isExpoGo;

    const handlePayment = useCallback(async (method: 'card' | 'wallet' | 'paypal') => {
      const timestamp = () => new Date().toISOString().split('T')[1];

      if (processingRef.current) {
        if (__DEV__) logger.log(`[${timestamp()}] Payment already processing - ignoring duplicate call`);
        return;
      }
      processingRef.current = true;
      setIsProcessing(true);
      setPayError(null);

      let paymentStarted = false;
      let handedToStripe = false;
      let createdIntentId: string | undefined;
      const openId = getSheetOpenId?.();
      // A failure nobody can see: the client left the Cart while the payment
      // was going through, which closed this sheet (and may have opened a new
      // one since). Nothing else would cancel the checkout until its hold ran
      // out, and the database counts the client's own hold as busy, so paying
      // again would be told the time is taken. Cancel it as × does (the server
      // cancels the checkout too) and say so. Doesn't touch the Cart's current
      // checkout, which may be a newer one. False while this attempt's sheet
      // is still up: the error is shown in it.
      const releaseIfSheetLeft = async (message: string | null): Promise<boolean> => {
        if (getSheetOpenId?.() === openId) return false;
        const intentId = createdIntentId;
        if (intentId && openIntentRef.current === intentId) openIntentRef.current = null;
        if (intentId && checkoutBatchId) {
          try { await cancelPaymentIntent(checkoutBatchId, intentId); }
          catch (err) {
            logger.error('[checkout] could not cancel a failed payment after the Cart was left', err);
            // 409: the card was approved after all, and the server finishes it.
            if ((err as { context?: { status?: number } } | null)?.context?.status === 409) {
              onPaymentPending?.('unknown');
              return true;
            }
            // Anything else: Stripe did refuse it, so nothing was charged, and
            // the hold runs out on its own.
          }
        }
        if (checkoutBatchId) onPaymentFailedAway?.(checkoutBatchId, message);
        return true;
      };
      try {
        if (!checkoutBatchId) {
          throw new Error('Checkout has expired. Please review your booking and try again.');
        }
        if (hasFees) {
          await acceptCheckoutFees(checkoutBatchId, {
            termsVersion: FEE_TERMS_VERSION,
            termsSha256: FEE_TERMS_SHA256,
            appPlatform: Platform.OS,
            appVersion: Constants.expoConfig?.version ?? null,
          });
        }
        if (__DEV__) logger.log(`[${timestamp()}] Creating PaymentIntent for £${totalAmount.toFixed(2)}...`);
        const pendingSeen = declineSeenRef.current;
        if (pendingSeen) {
          declineSeenRef.current = null;
          await pendingSeen;
        }
        const { clientSecret, paymentIntentId, paypalAvailable } = await createPaymentIntent(checkoutBatchId);
        createdIntentId = paymentIntentId;
        openIntentRef.current = paymentIntentId;
        // Left while the payment was being set up: the Cart has already
        // cancelled the checkout, so don't hand the card to Stripe for it.
        if (await releaseIfSheetLeft(null)) return;
        if (method === 'paypal' && !paypalAvailable) {
          // The server decides; nothing is authorised, so card still works.
          setPayError('PayPal isn\'t available for this booking. Please pay by card.');
          return;
        }

        let confirmError: { code: string; message: string; localizedMessage?: string; declineCode?: string; type?: string } | undefined;
        // From here the card can be approved at any moment, so leaving the
        // Cart must not cancel the checkout (cleared in finally).
        handedToStripe = true;
        onPaymentInFlight?.(true);
        if (method === 'wallet') {
          // The wallet sheet shows the amount it's given, so give it the
          // server-priced intent's amount rather than the cart's own sum.
          const { paymentIntent, error: retrieveError } = await retrievePaymentIntent(clientSecret);
          if (retrieveError || !paymentIntent) {
            // Nothing has been authorised yet — keep the checkout and let
            // them try again rather than releasing the hold over a blip.
            logger.error(`[${timestamp()}] could not read the payment amount`, retrieveError);
            if (await releaseIfSheetLeft('We couldn\'t start Apple Pay or Google Pay.')) return;
            setPayError('We couldn\'t start Apple Pay or Google Pay. Please try again.');
            return;
          }
          const amount = (paymentIntent.amount / 100).toFixed(2);
          ({ error: confirmError } = await confirmPlatformPayPayment(clientSecret, {
            // Requires a real Apple merchant ID registered in your Apple
            // Developer account and linked in the Stripe Dashboard — the
            // placeholder in app.json's plugin config ("merchant.com.cerviced")
            // unblocks the build but Apple Pay won't actually appear/function
            // until that registration is real.
            applePay: {
              merchantCountryCode: 'GB',
              currencyCode: 'GBP',
              cartItems: [{ label: 'Cerviced', amount, paymentType: PlatformPay.PaymentType.Immediate }],
            },
            // Works in Stripe test mode. app.json enables Google Pay for
            // Android; production still requires a fully configured Stripe
            // account and release signing.
            googlePay: { testEnv: GOOGLE_PAY_TEST_ENV, merchantName: 'Cerviced', merchantCountryCode: 'GB', currencyCode: 'GBP' },
          }));
        } else if (method === 'paypal') {
          // Opens PayPal's own page; the SDK brings the client back on
          // cerviced://safepay (forwarded to Stripe in App.tsx).
          ({ error: confirmError } = await confirmPayment(clientSecret, { paymentMethodType: 'PayPal' }));
        } else {
          // A saved card is confirmed by its Stripe id (it hangs off the
          // same Customer the intent was made for). A new card's details
          // live only inside Stripe's CardField — the app never sees them;
          // confirmPayment reads them from the field.
          ({ error: confirmError } = payingWithSavedCard
            ? await confirmPayment(clientSecret, { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: selectedCard } })
            : await confirmPayment(clientSecret, { paymentMethodType: 'Card' }));
        }

        if (confirmError) {
          // Nothing was authorised, so the intent can be retried as-is.
          // Leave the sheet open rather than throwing the checkout away.
          // Card errors (declines, wrong CVC, failed bank check) are written
          // by Stripe for the cardholder; anything else is ours to word.
          const isCardError = confirmError.type === 'card_error' || !!confirmError.declineCode;
          const cardMessage = isCardError ? (confirmError.localizedMessage || confirmError.message) : '';
          if (confirmError.code !== 'Canceled') {
            logger.error(`[${timestamp()}] payment confirmation failed`, confirmError);
          }
          if (await releaseIfSheetLeft(confirmError.code === 'Canceled' ? null : cardMessage)) return;
          if (confirmError.code !== 'Canceled') {
            setPayError(isCardError
              ? (confirmError.localizedMessage || confirmError.message)
              : method === 'paypal'
                ? 'That PayPal payment didn\'t go through. Please try again, or pay by card.'
                : 'That payment didn\'t go through. Please check your details and try again.');
            // They've now seen this refusal, so the 5-minute cleanup mustn't
            // notify them of it again if they leave the sheet open past the
            // hold. Only a card error: that's the bank's own refusal shown
            // word for word; a generic line may not be the refusal on record.
            // Best-effort: missing it only means a repeated notice.
            if (isCardError) {
              declineSeenRef.current = markDeclineSeen(checkoutBatchId, paymentIntentId)
                .catch(err => logger.error('[checkout] could not mark a decline as seen', err));
            }
          }
          return;
        }

        if (__DEV__) logger.log(`[${timestamp()}] Payment authorised (${paymentIntentId}). Finalising server checkout...`);
        paymentStarted = true;
        // The card is approved, so this checkout is never cancelled from here:
        // the server settles it. If its answer doesn't come back, ask again
        // for a short while instead of guessing (the database may just be
        // busy); after that the server finishes it on its own and notifies.
        let outcome: CheckoutWaitResult | null = null;
        try {
          outcome = settledFromCaptureStatus(await capturePaymentIntent(checkoutBatchId, paymentIntentId));
        } catch (captureError) {
          logger.error(`[${timestamp()}] payment confirmation didn't answer`, captureError);
        }
        if (!outcome) {
          setConfirming(true);
          const batchId = checkoutBatchId;
          outcome = await waitForCheckoutOutcome({
            capture: () => capturePaymentIntent(batchId, paymentIntentId),
            readBatch: () => getCheckoutOutcome(batchId),
            sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
            onError: err => logger.error('[checkout] still confirming the payment', err),
          });
        }
        if (outcome !== 'succeeded') {
          onPaymentPending?.(outcome);
          return;
        }
        onCheckoutPaid?.(checkoutBatchId, holdPlan);
        await onPaymentSuccess(method === 'paypal' ? 'paypal' : 'card', paymentIntentId);

        await new Promise(resolve => setTimeout(resolve, 500));
        onPaymentComplete();
      } catch (error) {
        logger.error(`❌ [${timestamp()}] PAYMENT ERROR:`, error);
        if (paymentStarted) {
          // Never cancel a checkout once the card is approved; the server
          // settles it and tells the client (reconcile-checkouts).
          onPaymentPending?.('unknown');
          return;
        }
        // onClose below would clear whatever checkout the Cart has now.
        if (await releaseIfSheetLeft(handedToStripe ? '' : null)) return;
        if (createdIntentId && checkoutBatchId) {
          try { await cancelPaymentIntent(checkoutBatchId, createdIntentId); }
          catch { onPaymentPending?.('unknown'); return; }
        }
        onClose();
        onBookingFailed(error instanceof PaymentRequestError ? error.message : 'Payment could not be completed. Please review your booking and try again.');
      } finally {
        onPaymentInFlight?.(false);
        setIsProcessing(false);
        setConfirming(false);
        processingRef.current = false;
      }
    }, [checkoutBatchId, hasFees, totalAmount, confirmPayment, confirmPlatformPayPayment, retrievePaymentIntent, onPaymentSuccess, onPaymentComplete, onPaymentPending, onCheckoutPaid, onPaymentInFlight, getSheetOpenId, onPaymentFailedAway, holdPlan, onClose, onBookingFailed, payingWithSavedCard, selectedCard]);

    // Closing after a declined attempt leaves an unconfirmed intent open —
    // cancel it so CartScreen's hold release (wired into onClose) isn't
    // racing a live intent.
    const handleClose = useCallback(async () => {
      // Shares the Pay lock so a tap on Pay can't race the cancel.
      if (processingRef.current) return;
      const intentId = openIntentRef.current;
      if (intentId && checkoutBatchId) {
        processingRef.current = true;
        setIsProcessing(true);
        openIntentRef.current = null;
        try { await cancelPaymentIntent(checkoutBatchId, intentId); }
        catch (err) {
          logger.error('[checkout] could not cancel the open payment on close', err);
          onPaymentPending?.('unknown');
          return;
        } finally {
          processingRef.current = false;
          setIsProcessing(false);
        }
      }
      onClose();
    }, [checkoutBatchId, onClose, onPaymentPending]);

    return (
      <Modal visible={isVisible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent={true}>
        <View style={styles.paymentOverlay}>
          <View style={[styles.paymentModal, { backgroundColor: P.bg }]}>
            {/* The card field brings the keyboard up; keep Pay above it. */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.paymentModalContent, { paddingBottom: bottomInset }]}
            >
              <View style={[styles.paymentHeader, { borderBottomColor: P.border }]}>
                <Text style={[styles.paymentTitle, { color: theme.text }]}>Complete Payment</Text>
                <TouchableOpacity
                  style={styles.paymentCloseButton}
                  disabled={isProcessing}
                  accessibilityLabel="Close payment"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleClose();
                  }}
                >
                  <Text style={[styles.paymentCloseText, { color: theme.text }]}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.paymentContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.orderSummaryTitle, { color: theme.text }]}>Order Summary</Text>
                  {lines.map(line => (
                    <View key={line.id} style={styles.orderItem}>
                      <Text style={[styles.orderItemName, { color: theme.text }]}>
                        {line.label}
                        {line.isDeposit && ' (Deposit)'}
                      </Text>
                      <Text style={[styles.orderItemPrice, { color: theme.text }]}>£{line.price.toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={styles.orderTotal}>
                    <Text style={[styles.orderTotalLabel, { color: theme.text }]}>
                      Total
                    </Text>
                    <Text style={[styles.orderTotalAmount, { color: theme.text }]}>£{totalAmount.toFixed(2)}</Text>
                  </View>
                </View>

                {feesError && (
                  <TouchableOpacity accessibilityRole="button" onPress={() => setFeesAttempt(n => n + 1)}
                    style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.paymentMethodName, { color: theme.text }]}>
                      We couldn't load this booking's fees. Tap to try again.
                    </Text>
                  </TouchableOpacity>
                )}
                {visitFees.length > 0 && (
                  <View style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.orderSummaryTitle, { color: theme.text }]}>Late & no-show fees</Text>
                    {visitFees.map(fee => (
                      <View key={fee.providerId} style={styles.orderItem}>
                        <Text style={[styles.orderItemName, { color: theme.text }]}>
                          {fee.providerName}
                          {fee.lateFeePence != null && `\n£${(fee.lateFeePence / 100).toFixed(2)} if you arrive more than ${fee.graceMinutes} minutes late`}
                          {fee.noShowFeePence != null && `\n£${(fee.noShowFeePence / 100).toFixed(2)} if you don't turn up`}
                        </Text>
                      </View>
                    ))}
                    <TouchableOpacity accessibilityRole="button" onPress={() => setShowFeeTerms(v => !v)} activeOpacity={0.7}>
                      <Text style={[styles.paymentMethodName, { color: P.accent, marginTop: 6 }]}>
                        {showFeeTerms ? 'Hide the terms' : `Read the ${FEE_TERMS_HEADING} terms`}
                      </Text>
                    </TouchableOpacity>
                    {showFeeTerms && (
                      <Text style={[styles.paymentMethodName, { color: P.sub, marginTop: 6 }]}>{FEE_TERMS_BODY}</Text>
                    )}
                    <TouchableOpacity
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: agreedToFees }}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setAgreedToFees(v => !v);
                      }}
                      activeOpacity={0.7}
                      style={[styles.orderItem, { alignItems: 'flex-start', marginTop: 8 }]}
                    >
                      <Ionicons name={agreedToFees ? 'checkbox' : 'square-outline'} size={20} color={P.accent} />
                      <Text style={[styles.paymentMethodName, { color: theme.text, marginLeft: 8 }]}>
                        {FEE_CONSENT_LINE}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {lateCancelFees.length > 0 && (
                  <View style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.orderSummaryTitle, { color: theme.text }]}>Late cancellation</Text>
                    {lateCancelFees.map(fee => (
                      <View key={fee.providerId} style={styles.orderItem}>
                        <Text style={[styles.orderItemName, { color: theme.text }]}>
                          {fee.providerName}
                          {`\nCancelling within ${fee.cancelNoticeHours} hours means you lose your £${((fee.lateCancelDepositPence ?? 0) / 100).toFixed(2)} deposit and may be charged up to £${((fee.lateCancelFeePence ?? 0) / 100).toFixed(2)} more.`}
                        </Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: agreedToLateCancel }}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setAgreedToLateCancel(v => !v);
                      }}
                      activeOpacity={0.7}
                      style={[styles.orderItem, { alignItems: 'flex-start', marginTop: 8 }]}
                    >
                      <Ionicons name={agreedToLateCancel ? 'checkbox' : 'square-outline'} size={20} color={P.accent} />
                      <Text style={[styles.paymentMethodName, { color: theme.text, marginLeft: 8 }]}>
                        {LATE_CANCEL_CONSENT_LINE}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setShowLateCancelTerms(v => !v)} activeOpacity={0.7}>
                      <Text style={[styles.paymentMethodName, { color: P.accent, marginTop: 6 }]}>
                        {showLateCancelTerms ? 'Hide the terms' : 'Read the terms'}
                      </Text>
                    </TouchableOpacity>
                    {showLateCancelTerms && (
                      <Text style={[styles.paymentMethodName, { color: P.sub, marginTop: 6 }]}>{FEE_TERMS_BODY}</Text>
                    )}
                  </View>
                )}

                {/* Card details are typed into Stripe's own CardForm,
                    wallets open Apple/Google's own sheet and PayPal its own
                    page — none of them pass through this component's state. */}
                <View style={styles.paymentMethods}>
                  {(walletSupported || paypalShown) && (
                    <>
                      {walletSupported && (
                        <PlatformPayButton
                          type={PlatformPay.ButtonType.Default}
                          appearance={isDarkMode ? PlatformPay.ButtonStyle.White : PlatformPay.ButtonStyle.Black}
                          borderRadius={dimensions.button.large.borderRadius}
                          disabled={isProcessing || !canPay}
                          onPress={() => { handlePayment('wallet'); }}
                          style={styles.walletButton}
                        />
                      )}
                      {paypalShown && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Pay with PayPal"
                          disabled={isProcessing || !canPay}
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            handlePayment('paypal');
                          }}
                          style={[styles.walletButton, styles.paypalButton, walletSupported && styles.paypalButtonBelowWallet,
                            (isProcessing || !canPay) && styles.paypalButtonDisabled]}
                        >
                          <Ionicons name="logo-paypal" size={18} color={PAYPAL_NAVY} />
                          <Text style={styles.paypalButtonText}>Pay with PayPal</Text>
                        </TouchableOpacity>
                      )}
                      <View style={styles.payDivider}>
                        <View style={[styles.payDividerLine, { backgroundColor: P.border }]} />
                        <Text style={[styles.payDividerText, { color: P.sub }]}>or pay by card</Text>
                        <View style={[styles.payDividerLine, { backgroundColor: P.border }]} />
                      </View>
                    </>
                  )}
                  {savedCards.length > 0 && (
                    <View accessibilityRole="radiogroup" style={styles.savedCardList}>
                      <Text style={[styles.paymentMethodsTitle, { color: theme.text }]}>Saved cards</Text>
                      {[...savedCards.map(card => ({
                        id: card.id,
                        title: `${savedCardBrandName(card.brand)} •••• ${card.last4}`,
                        sub: savedCardExpiryLabel(card),
                      })), { id: 'new', title: 'Use a new card', sub: null as string | null }].map(option => {
                        const selected = selectedCard === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled: isProcessing }}
                            disabled={isProcessing}
                            activeOpacity={0.7}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              pickedCardRef.current = true;
                              setSelectedCard(option.id);
                              setPayError(null);
                            }}
                            style={[styles.savedCardRow, {
                              borderColor: selected ? P.accent : P.border,
                              backgroundColor: selected ? P.accentDim : P.surface,
                            }]}
                          >
                            <Ionicons name={option.id === 'new' ? 'add-circle-outline' : 'card-outline'} size={20} color={P.accent} />
                            <View style={styles.savedCardText}>
                              <Text style={[styles.savedCardTitle, { color: theme.text }]}>{option.title}</Text>
                              {option.sub && <Text style={[styles.paySecureText, { color: P.sub }]}>{option.sub}</Text>}
                            </View>
                            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? P.accent : P.sub} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {!payingWithSavedCard && (
                  <>
                  <Text style={[styles.paymentMethodsTitle, { color: theme.text }]}>Card details</Text>
                  {/* Separate number / expiry / CVC / postcode boxes. On iOS,
                      backgroundColor paints the whole form behind Stripe's own
                      boxes, so it takes the sheet's colour and the boxes sit
                      straight on the sheet; their text follows the light/dark
                      mode set in the effect above. On Android it fills the
                      boxes themselves and the text colours below apply. */}
                  <CardForm
                    disabled={isProcessing}
                    cardStyle={{
                      backgroundColor: toArgbHex(Platform.OS === 'ios' ? P.bg : P.card),
                      borderColor: toArgbHex(P.border),
                      borderWidth: 1,
                      borderRadius: 14,
                      textColor: toArgbHex(theme.text),
                      placeholderColor: toArgbHex(P.sub),
                      cursorColor: toArgbHex(P.accent),
                      textErrorColor: '#FFFF3B30',
                    }}
                    onFormComplete={details => {
                      setCardComplete(details.complete);
                      setPayError(null);
                    }}
                    style={styles.cardForm}
                  />
                  </>
                  )}
                  {payError && (
                    <Text accessibilityRole="alert" style={[styles.paymentMethodName, styles.payErrorText]}>{payError}</Text>
                  )}
                  {heldNote && (
                    <Text style={[styles.paySecureText, { color: P.sub, marginTop: 10 }]}>{heldNote}</Text>
                  )}
                  <View style={styles.paySecureRow}>
                    <Ionicons name="lock-closed" size={12} color={P.sub} />
                    <Text style={[styles.paySecureText, { color: P.sub }]}>Card details go straight to Stripe</Text>
                  </View>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.payButton, { backgroundColor: isProcessing || !canPay || !(payingWithSavedCard || cardComplete) ? P.accentDim : P.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  handlePayment('card');
                }}
                disabled={isProcessing || !canPay || !(payingWithSavedCard || cardComplete)}
              >
                {confirming ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={P.onAccent} size="small" />
                    <Text style={[styles.payButtonText, { color: P.onAccent }]}>Confirming your payment…</Text>
                  </View>
                ) : isProcessing ? (
                  <ActivityIndicator color={P.onAccent} size="small" />
                ) : (
                  <Text style={[styles.payButtonText, { color: P.onAccent }]}>{payButtonLabel(holdPlan, totalAmount)}</Text>
                )}
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    );
  }
);

StripePaymentSheet.displayName = 'StripePaymentSheet';

const styles = StyleSheet.create({
  paymentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    // No paddingBottom here on purpose. Unlike the small pickers (which float
    // clear of the edge, per 0ad7b1c), this sheet is near-fullscreen and has
    // top-only corner radii, so a gap underneath just reads as a flat cut-off
    // edge with backdrop showing beneath it. It seats on the bottom edge and
    // carries the home-indicator inset inside instead, below the Pay button.
  },
  paymentModal: {
    flex: 1,
    marginTop: 100,
    borderTopLeftRadius: dimensions.button.large.borderRadius,
    borderTopRightRadius: dimensions.button.large.borderRadius,
    overflow: 'hidden',
  },
  paymentModalContent: {
    flex: 1,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  paymentTitle: {
    fontSize: fonts.title.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  paymentCloseButton: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCloseText: {
    fontSize: fonts.title.small,
    color: '#000',
    fontWeight: 'bold',
  },
  paymentContent: {
    flex: 1,
    padding: spacing.xl,
  },
  orderSummary: {
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },
  orderSummaryTitle: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.md,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  orderItemName: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    color: '#000', // CLEAR BLACK
    flex: 1,
  },
  orderItemPrice: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
  },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.2)',
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  orderTotalLabel: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
  },
  orderTotalAmount: {
    fontSize: fonts.title.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    fontWeight: 'bold',
  },
  paymentMethods: {
    marginBottom: spacing.xxl,
  },
  walletButton: {
    height: 48,
    width: '100%',
  },
  paypalButton: {
    backgroundColor: '#FFC439',
    borderRadius: dimensions.button.large.borderRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  paypalButtonBelowWallet: {
    marginTop: spacing.md,
  },
  paypalButtonDisabled: {
    opacity: 0.5,
  },
  paypalButtonText: {
    color: PAYPAL_NAVY,
    fontSize: 16,
    fontWeight: '700',
  },
  payDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  payDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  payDividerText: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardForm: {
    width: '100%',
    height: Platform.OS === 'ios' ? 210 : 290,
  },
  savedCardList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  savedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 14,
  },
  savedCardText: {
    flex: 1,
  },
  savedCardTitle: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
  },
  payErrorText: {
    color: '#E06070',
    marginTop: spacing.sm,
  },
  paySecureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.md,
  },
  paySecureText: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  paymentMethodsTitle: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    marginBottom: spacing.lg,
  },
  paymentMethodName: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    flex: 1,
  },
  payButton: {
    borderRadius: dimensions.button.large.borderRadius,
    padding: spacing.lg,
    alignItems: 'center',
    margin: spacing.xl,
    marginTop: 0,
  },
  payButtonText: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
    fontWeight: 'bold',
  },
});

/** The sheet's order summary and header styles, shared with the Cart's older card-entry modal. */
export { styles as paymentSheetStyles };
