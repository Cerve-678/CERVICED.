/**
 * The website's checkout after sign-in, in place of the app's Cart review and
 * payment sheet:
 *
 *   1. Review: the policies tick (and a mobile provider's address).
 *   2. Pay: the time is held for 5 minutes (prepare_checkout), any late /
 *      no-show / late cancellation fees get their own ticks, and Stripe's own
 *      form takes the card or Apple Pay / Google Pay.
 *   3. Booked, with a pointer to the app for managing it.
 *
 * Same server path as the app: prepare_checkout → accept_checkout_fees →
 * create-payment-intent → finalize-payment-intent. Every amount is the
 * server's. While the card is being confirmed the sheet can't be closed or
 * changed, and once it's approved the checkout is never cancelled from here:
 * the server settles it (reconcile-checkouts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';

import { WaitlistHoldCountdown } from '../components/WaitlistHoldCountdown';
import type { ProviderThemeTokens } from '../constants/providerThemes';
import { isDarkColor } from '../constants/providerThemes';
import {
  FEE_CONSENT_LINE,
  FEE_TERMS_BODY,
  FEE_TERMS_HEADING,
  FEE_TERMS_SHA256,
  FEE_TERMS_VERSION,
  LATE_CANCEL_CONSENT_LINE,
} from '../constants/feeTerms';
import { settledFromCaptureStatus, waitForCheckoutOutcome } from '../features/cart/checkoutOutcome';
import type { CheckoutWaitResult } from '../features/cart/checkoutOutcome';
import { describeReserveFailure } from '../features/cart/presentation';
import { holdPlanNote, payButtonLabel } from '../features/cart/requestHolds';
import {
  acceptCheckoutFees,
  cancelCheckout,
  getCheckoutFees,
  getCheckoutHoldPlan,
  getCheckoutOutcome,
  getMyLastClientAddress,
  prepareCheckout,
} from '../services/databaseService';
import type { CheckoutFee, CheckoutHoldPlan, PreparedCheckout } from '../services/databaseService';
import { cancelPaymentIntent, capturePaymentIntent, createPaymentIntent } from '../services/stripeService';
import { legalPageUrl } from '../utils/legalPage';
import { logger } from '../utils/logger';
import { PaymentRequestError } from '../utils/paymentRequestError';
import type { WebBookingAccount } from './WebAccountStep';
import type { WebBookingChoice } from './webBooking';
import {
  bookedMoneyLine,
  depositIsNonRefundable,
  feeGroups,
  serviceNeedsSafetyAck,
  sheetAmountPence,
  unsettledMessage,
  webCheckoutItem,
} from './webCheckout';
import { getWebStripe } from './webStripe';

type Phase =
  | { kind: 'review' }
  | { kind: 'pay'; checkout: PreparedCheckout }
  | { kind: 'booked'; plan: CheckoutHoldPlan | null; amountDue: number }
  | { kind: 'unsettled'; outcome: Exclude<CheckoutWaitResult, 'succeeded'> };

interface WebPaymentStepProps {
  tokens: ProviderThemeTokens;
  accentColor: string;
  providerId: string;
  providerName: string;
  /** A mobile provider comes to the client, so the booking needs their address. */
  isMobileProvider: boolean;
  choice: WebBookingChoice;
  account: WebBookingAccount;
  /** True while the sheet mustn't be closed or changed (the card is being confirmed). */
  onLockChange: (locked: boolean) => void;
  /** True once it's booked, so the booking above can't be changed any more. */
  onBookedChange: (booked: boolean) => void;
  /** Back to the booking sheet, to pick another time. */
  onPickAgain: () => void;
}

export function WebPaymentStep({
  tokens, accentColor, providerId, providerName, isMobileProvider, choice, account,
  onLockChange, onBookedChange, onPickAgain,
}: WebPaymentStepProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [agreed, setAgreed] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const onAccent = isDarkColor(accentColor) ? '#fff' : '#1B2740';
  const needsSafetyAck = serviceNeedsSafetyAck(choice.service);
  const nonRefundable = depositIsNonRefundable(choice);

  // What is held on the server right now, for letting it go when the client
  // leaves. inFlight: the card may be approved at any moment, so never cancel.
  const heldRef = useRef<{ batchId: string; intentId: string | null } | null>(null);
  const inFlightRef = useRef(false);

  const release = useCallback(() => {
    const held = heldRef.current;
    heldRef.current = null;
    if (!held || inFlightRef.current) return;
    // Best effort: expire_cart_holds frees it after 5 minutes regardless.
    const cancelIntent = held.intentId
      ? cancelPaymentIntent(held.batchId, held.intentId).catch((err: unknown) => logger.error('[WebPaymentStep] cancelling the open payment failed:', err))
      : Promise.resolve();
    void cancelIntent.then(() => cancelCheckout(held.batchId))
      .catch((err: unknown) => logger.error('[WebPaymentStep] releasing the held time failed:', err));
  }, []);

  // Leaving (close, Change, Not you?) or closing the tab lets the time go.
  useEffect(() => {
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [release]);

  useEffect(() => {
    if (!isMobileProvider) return;
    let cancelled = false;
    getMyLastClientAddress()
      .then(last => { if (!cancelled && last) setAddress(current => current || last); })
      .catch((err: unknown) => logger.error('[WebPaymentStep] reading the last address failed:', err));
    return () => { cancelled = true; };
  }, [isMobileProvider]);

  const setInFlight = useCallback((inFlight: boolean) => {
    inFlightRef.current = inFlight;
    onLockChange(inFlight);
  }, [onLockChange]);

  const holdTime = async () => {
    if (!agreed) { setNotice('Tick the box to agree before you continue.'); return; }
    if (isMobileProvider && !address.trim()) { setNotice(`Add the address ${providerName} should come to.`); return; }
    setBusy(true);
    setNotice(null);
    try {
      const checkout = await prepareCheckout([webCheckoutItem({
        providerId,
        choice,
        agreed,
        mobileAddress: isMobileProvider ? address : null,
      })]);
      heldRef.current = { batchId: checkout.checkoutBatchId, intentId: null };
      setPhase({ kind: 'pay', checkout });
    } catch (err) {
      logger.error('[WebPaymentStep] holding the time failed:', err);
      setNotice(describeReserveFailure(err).message);
    } finally {
      setBusy(false);
    }
  };

  /** Back to the review with a reason, letting go of whatever is held. */
  const backToReview = useCallback((reason: string) => {
    release();
    setNotice(reason);
    setPhase({ kind: 'review' });
  }, [release]);

  const settle = useCallback((outcome: CheckoutWaitResult, plan: CheckoutHoldPlan | null, amountDue: number) => {
    // The server owns it now, whatever the answer.
    heldRef.current = null;
    if (outcome === 'succeeded') {
      setPhase({ kind: 'booked', plan, amountDue });
      onBookedChange(true);
    } else {
      setPhase({ kind: 'unsettled', outcome });
    }
  }, [onBookedChange]);

  const button = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy || disabled}
      style={[styles.button, { backgroundColor: accentColor }, (busy || disabled) && styles.buttonDim]}
      accessibilityRole="button"
      activeOpacity={0.8}
    >
      {busy ? <ActivityIndicator color={onAccent} /> : <Text style={[styles.buttonText, { color: onAccent }]}>{label}</Text>}
    </TouchableOpacity>
  );

  if (phase.kind === 'booked') {
    return (
      <View style={[styles.card, styles.section, { backgroundColor: tokens.surface }]}>
        <Text style={[styles.bigTitle, { color: tokens.text }]}>Booked</Text>
        <Text style={[styles.body, { color: tokens.text }]}>{bookedMoneyLine(phase.plan, phase.amountDue)}</Text>
        <Text style={[styles.body, { color: tokens.sub }]}>
          {providerName} will confirm your booking. We’ve emailed the details to {account.email}.
        </Text>
        <View style={[styles.appBox, { borderColor: tokens.border }]}>
          <Text style={[styles.strong, { color: tokens.text }]}>Manage it in the CERVICED app</Text>
          <Text style={[styles.body, { color: tokens.sub }]}>
            Sign in with {account.email} to see this booking, change or cancel it, and message {providerName}. The app is coming soon to the App Store and Google Play.
          </Text>
        </View>
      </View>
    );
  }

  if (phase.kind === 'unsettled') {
    const message = unsettledMessage(phase.outcome);
    return (
      <View style={[styles.card, styles.section, { backgroundColor: tokens.surface }]}>
        <Text style={[styles.title, { color: tokens.text }]}>{message.title}</Text>
        <Text style={[styles.body, { color: tokens.sub }]}>{message.body}</Text>
        {message.canPickAgain ? button('Pick another time', onPickAgain) : null}
      </View>
    );
  }

  if (phase.kind === 'pay') {
    return (
      <PayPhase
        tokens={tokens}
        accentColor={accentColor}
        onAccent={onAccent}
        checkout={phase.checkout}
        isDeposit={choice.result.isDepositOnly}
        onIntent={intentId => {
          if (heldRef.current) heldRef.current.intentId = intentId;
        }}
        onInFlight={setInFlight}
        onExpired={() => backToReview('Your 5 minutes ran out, so the time was let go. Continue again to hold it.')}
        onFailed={backToReview}
        onSettled={settle}
      />
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: tokens.text }]}>Before you pay</Text>
      {nonRefundable ? (
        <View style={[styles.notice, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <Text style={[styles.body, { color: tokens.sub }]}>
            {`The deposit for ${providerName} is non-refundable. If you cancel, even in good time, the provider keeps it and the rest of what you paid comes back. All of it comes back if the provider cancels, declines or doesn't respond.`}
          </Text>
        </View>
      ) : null}
      {needsSafetyAck ? (
        <View style={[styles.notice, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <Text style={[styles.body, { color: tokens.sub }]}>
            {`${choice.service.name}'s provider has flagged safety information for this treatment (patch test and/or pregnancy). See the service's details on this page.`}
          </Text>
        </View>
      ) : null}
      {isMobileProvider ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: tokens.sub }]}>YOUR ADDRESS</Text>
          <TextInput
            style={[styles.input, { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.bg }]}
            value={address}
            onChangeText={setAddress}
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            placeholder={`Where ${providerName} should come to`}
            placeholderTextColor={tokens.sub}
            accessibilityLabel="Your address"
            multiline
          />
          <Text style={[styles.small, { color: tokens.sub }]}>Only shared with {providerName} once they accept.</Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.tickRow}
        onPress={() => { setAgreed(value => !value); setNotice(null); }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        activeOpacity={0.7}
      >
        <View style={[styles.tickBox, { borderColor: agreed ? accentColor : tokens.border, backgroundColor: agreed ? accentColor : 'transparent' }]}>
          {agreed ? <Text style={[styles.tickMark, { color: onAccent }]}>✓</Text> : null}
        </View>
        <Text style={[styles.body, styles.flex, { color: tokens.text }]}>
          I agree to the{' '}
          <Text style={[styles.inlineLink, { color: accentColor }]} onPress={() => void Linking.openURL(legalPageUrl('terms'))} accessibilityRole="link">Terms & Conditions</Text>
          {` and ${providerName}'s cancellation policy`}
          {needsSafetyAck ? ', and confirm I have seen the safety information above' : ''}
        </Text>
      </TouchableOpacity>
      {notice ? <Text style={styles.error} accessibilityLiveRegion="polite">{notice}</Text> : null}
      {button('Continue to payment', () => void holdTime(), !agreed)}
      <Text style={[styles.small, { color: tokens.sub }]}>We’ll hold the time for 5 minutes while you pay.</Text>
    </View>
  );
}

interface PayPhaseProps {
  tokens: ProviderThemeTokens;
  accentColor: string;
  onAccent: string;
  checkout: PreparedCheckout;
  isDeposit: boolean;
  onIntent: (intentId: string) => void;
  onInFlight: (inFlight: boolean) => void;
  onExpired: () => void;
  onFailed: (reason: string) => void;
  onSettled: (outcome: CheckoutWaitResult, plan: CheckoutHoldPlan | null, amountDue: number) => void;
}

/** The held time: fees to agree to, then Stripe's form. */
function PayPhase({
  tokens, accentColor, onAccent, checkout, isDeposit, onIntent, onInFlight, onExpired, onFailed, onSettled,
}: PayPhaseProps) {
  const [fees, setFees] = useState<CheckoutFee[] | null>(null);
  const [plan, setPlan] = useState<CheckoutHoldPlan | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [agreedToFees, setAgreedToFees] = useState(false);
  const [agreedToLateCancel, setAgreedToLateCancel] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const inFlightRef = useRef(false);

  // Both are needed before Stripe's form can be drawn: the fees decide
  // whether the card is saved for later, and the plan what it's asked for.
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    Promise.all([getCheckoutFees(checkout.checkoutBatchId), getCheckoutHoldPlan(checkout.checkoutBatchId)])
      .then(([rows, holdPlan]) => {
        if (cancelled) return;
        setFees(rows);
        setPlan(holdPlan);
      })
      .catch((err: unknown) => {
        logger.error('[WebPaymentStep] loading the checkout fees and plan failed:', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [checkout.checkoutBatchId, attempt]);

  const groups = useMemo(() => feeGroups(fees ?? []), [fees]);
  const hasFees = (fees?.length ?? 0) > 0;
  const feesAgreed = (groups.visit.length === 0 || agreedToFees) && (groups.lateCancel.length === 0 || agreedToLateCancel);
  const heldNote = holdPlanNote(plan);

  const stripePromise = useMemo(() => getWebStripe(), []);
  const elementsOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!plan || fees === null) return null;
    const dark = isDarkColor(tokens.bg);
    // Must match the payment create-payment-intent makes: card only (Apple
    // Pay and Google Pay ride on card; PayPal isn't offered on the web),
    // authorised now and captured by the server, and saved for later only
    // when there are fees to charge to it.
    return {
      mode: 'payment',
      currency: 'gbp',
      amount: sheetAmountPence(plan, checkout.amountDue),
      captureMethod: 'manual',
      paymentMethodTypes: ['card'],
      ...(hasFees ? { setupFutureUsage: 'off_session' as const } : {}),
      appearance: {
        theme: dark ? 'night' : 'stripe',
        variables: {
          colorPrimary: accentColor,
          colorBackground: tokens.bg,
          colorText: tokens.text,
          colorDanger: '#B3261E',
          borderRadius: '12px',
        },
      },
    };
  }, [plan, fees, hasFees, checkout.amountDue, tokens.bg, tokens.text, accentColor]);

  const markInFlight = useCallback((inFlight: boolean) => {
    inFlightRef.current = inFlight;
    onInFlight(inFlight);
  }, [onInFlight]);

  const tick = (checked: boolean, onPress: () => void, label: string) => (
    <TouchableOpacity style={styles.tickRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} activeOpacity={0.7}>
      <View style={[styles.tickBox, { borderColor: checked ? accentColor : tokens.border, backgroundColor: checked ? accentColor : 'transparent' }]}>
        {checked ? <Text style={[styles.tickMark, { color: onAccent }]}>✓</Text> : null}
      </View>
      <Text style={[styles.small, styles.flex, { color: tokens.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const termsToggle = (
    <>
      <TouchableOpacity onPress={() => setShowTerms(value => !value)} accessibilityRole="button" activeOpacity={0.6}>
        <Text style={[styles.inlineLink, { color: accentColor }]}>{showTerms ? 'Hide the terms' : `Read the ${FEE_TERMS_HEADING} terms`}</Text>
      </TouchableOpacity>
      {showTerms ? <Text style={[styles.small, { color: tokens.sub }]}>{FEE_TERMS_BODY}</Text> : null}
    </>
  );

  return (
    <View style={styles.section}>
      <View style={[styles.card, styles.holdRow, { backgroundColor: tokens.surface }]}>
        <View style={styles.flex}>
          <Text style={[styles.label, { color: tokens.sub }]}>HELD FOR YOU</Text>
          <Text style={[styles.body, { color: tokens.sub }]}>Pay before the timer ends.</Text>
        </View>
        <WaitlistHoldCountdown
          expiresAt={checkout.expiresAt}
          color={tokens.text}
          textStyle={styles.timer}
          onEnd={() => { if (!inFlightRef.current) onExpired(); }}
        />
      </View>

      <View style={[styles.card, styles.totalRow, { backgroundColor: tokens.surface }]}>
        <Text style={[styles.strong, { color: tokens.text }]}>{isDeposit ? 'Deposit due now' : 'Due now'}</Text>
        <Text style={[styles.strong, { color: tokens.text }]}>£{checkout.amountDue.toFixed(2)}</Text>
      </View>
      {heldNote ? <Text style={[styles.small, { color: tokens.sub }]}>{heldNote}</Text> : null}

      {loadFailed ? (
        <TouchableOpacity onPress={() => setAttempt(n => n + 1)} accessibilityRole="button" activeOpacity={0.7}>
          <Text style={[styles.body, { color: tokens.text }]}>We couldn’t load the payment details. <Text style={[styles.inlineLink, { color: accentColor }]}>Try again</Text></Text>
        </TouchableOpacity>
      ) : null}

      {groups.visit.length > 0 ? (
        <View style={[styles.notice, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <Text style={[styles.strong, { color: tokens.text }]}>Late & no-show fees</Text>
          {groups.visit.map(fee => (
            <Text key={fee.providerId} style={[styles.body, { color: tokens.text }]}>
              {fee.lateFeePence != null ? `£${(fee.lateFeePence / 100).toFixed(2)} if you arrive more than ${fee.graceMinutes} minutes late\n` : ''}
              {fee.noShowFeePence != null ? `£${(fee.noShowFeePence / 100).toFixed(2)} if you don't turn up` : ''}
            </Text>
          ))}
          {termsToggle}
          {tick(agreedToFees, () => setAgreedToFees(value => !value), FEE_CONSENT_LINE)}
        </View>
      ) : null}
      {groups.lateCancel.length > 0 ? (
        <View style={[styles.notice, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <Text style={[styles.strong, { color: tokens.text }]}>Late cancellation</Text>
          {groups.lateCancel.map(fee => (
            <Text key={fee.providerId} style={[styles.body, { color: tokens.text }]}>
              {`Cancelling within ${fee.cancelNoticeHours} hours means you lose your £${((fee.lateCancelDepositPence ?? 0) / 100).toFixed(2)} deposit and may be charged up to £${((fee.lateCancelFeePence ?? 0) / 100).toFixed(2)} more.`}
            </Text>
          ))}
          {tick(agreedToLateCancel, () => setAgreedToLateCancel(value => !value), LATE_CANCEL_CONSENT_LINE)}
          {groups.visit.length === 0 ? termsToggle : null}
        </View>
      ) : null}

      {elementsOptions && plan ? (
        <Elements key={checkout.checkoutBatchId} stripe={stripePromise} options={elementsOptions}>
          <PayForm
            tokens={tokens}
            accentColor={accentColor}
            onAccent={onAccent}
            checkout={checkout}
            plan={plan}
            hasFees={hasFees}
            canPay={feesAgreed}
            onIntent={onIntent}
            onInFlight={markInFlight}
            onFailed={onFailed}
            onSettled={onSettled}
          />
        </Elements>
      ) : !loadFailed ? (
        <ActivityIndicator color={accentColor} style={styles.loading} />
      ) : null}
    </View>
  );
}

interface PayFormProps {
  tokens: ProviderThemeTokens;
  accentColor: string;
  onAccent: string;
  checkout: PreparedCheckout;
  plan: CheckoutHoldPlan;
  hasFees: boolean;
  canPay: boolean;
  onIntent: (intentId: string) => void;
  onInFlight: (inFlight: boolean) => void;
  onFailed: (reason: string) => void;
  onSettled: (outcome: CheckoutWaitResult, plan: CheckoutHoldPlan | null, amountDue: number) => void;
}

const GENERIC_FAILURE = 'Payment could not be completed. Please check your booking and try again.';

function PayForm({
  tokens, accentColor, onAccent, checkout, plan, hasFees, canPay, onIntent, onInFlight, onFailed, onSettled,
}: PayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const payingRef = useRef(false);

  const pay = async () => {
    if (!stripe || !elements || payingRef.current || !canPay) return;
    payingRef.current = true;
    setPaying(true);
    setPayError(null);
    const batchId = checkout.checkoutBatchId;
    let approved = false;
    try {
      // First, before anything else waits: checks the form and opens the
      // Apple Pay / Google Pay sheet while the tap still counts as the
      // client's own.
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setPayError(submitError.message ?? 'Check your card details and try again.');
        return;
      }
      if (hasFees) {
        await acceptCheckoutFees(batchId, {
          termsVersion: FEE_TERMS_VERSION,
          termsSha256: FEE_TERMS_SHA256,
          appPlatform: 'web',
          appVersion: null,
        });
      }
      const { clientSecret, paymentIntentId } = await createPaymentIntent(batchId);
      onIntent(paymentIntentId);
      // From here the card can be approved at any moment.
      onInFlight(true);
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        // Only a payment that has to leave the page uses this; a card's
        // bank check opens over the page instead.
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (confirmError) {
        // Nothing was authorised, so the same payment can be tried again.
        onInFlight(false);
        logger.error('[WebPaymentStep] confirming the payment failed:', confirmError);
        // Stripe writes card and form errors for the cardholder; the rest are ours to word.
        setPayError(confirmError.type === 'card_error' || confirmError.type === 'validation_error'
          ? (confirmError.message ?? GENERIC_FAILURE)
          : 'That payment didn’t go through. Please check your details and try again.');
        return;
      }
      approved = true;
      let outcome: CheckoutWaitResult | null = null;
      try {
        outcome = settledFromCaptureStatus(await capturePaymentIntent(batchId, paymentIntentId));
      } catch (err) {
        logger.error('[WebPaymentStep] the payment confirmation didn’t answer:', err);
      }
      if (!outcome) {
        setConfirming(true);
        outcome = await waitForCheckoutOutcome({
          capture: () => capturePaymentIntent(batchId, paymentIntentId),
          readBatch: () => getCheckoutOutcome(batchId),
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
          onError: err => logger.error('[WebPaymentStep] still confirming the payment:', err),
        });
      }
      onSettled(outcome, plan, checkout.amountDue);
    } catch (err) {
      logger.error('[WebPaymentStep] payment failed:', err);
      if (approved) {
        // Never cancel once the card is approved; the server settles it.
        onSettled('unknown', plan, checkout.amountDue);
        return;
      }
      onFailed(err instanceof PaymentRequestError ? err.message : GENERIC_FAILURE);
    } finally {
      onInFlight(false);
      payingRef.current = false;
      setPaying(false);
      setConfirming(false);
    }
  };

  const disabled = !stripe || !ready || !canPay || paying;
  return (
    <View style={styles.section}>
      <View style={styles.stripeForm}>
        <PaymentElement
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' } }}
          onReady={() => setReady(true)}
        />
      </View>
      {payError ? <Text style={styles.error} accessibilityLiveRegion="polite">{payError}</Text> : null}
      {!canPay ? <Text style={[styles.small, { color: tokens.sub }]}>Tick the boxes above to pay.</Text> : null}
      <TouchableOpacity
        onPress={() => void pay()}
        disabled={disabled}
        style={[styles.button, { backgroundColor: accentColor }, disabled && styles.buttonDim]}
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        {paying
          ? <ActivityIndicator color={onAccent} />
          : <Text style={[styles.buttonText, { color: onAccent }]}>{payButtonLabel(plan, checkout.amountDue)}</Text>}
      </TouchableOpacity>
      {confirming ? (
        <Text style={[styles.small, { color: tokens.sub }]}>Confirming your payment. Please keep this page open.</Text>
      ) : null}
      <Text style={[styles.small, { color: tokens.sub }]}>Payments are handled securely by Stripe.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  flex: { flex: 1 },
  card: { borderRadius: 14, padding: 16 },
  holdRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timer: { fontSize: 22, fontWeight: '700' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  bigTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 22 },
  strong: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  small: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 64 },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  appBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 4 },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tickBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickMark: { fontSize: 14, fontWeight: '700' },
  inlineLink: { fontWeight: '700', textDecorationLine: 'underline' },
  stripeForm: { paddingVertical: 4 },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  buttonDim: { opacity: 0.55 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, lineHeight: 20 },
  error: { color: '#B3261E', fontSize: 13 },
  loading: { paddingVertical: 24 },
});
