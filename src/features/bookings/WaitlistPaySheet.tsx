import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import {
  cancelCheckout,
  getBookingById,
  getMyLastClientAddress,
  getProviderCheckoutMetadata,
  getRebookableService,
  getServiceSafetyFlags,
  prepareCheckout,
  type CheckoutHoldPlan,
  type MyWaitlistPlace,
} from '../../services/databaseService';
import { WaitlistHoldCountdown } from '../../components/WaitlistHoldCountdown';
import { StripePaymentSheet, type PaymentSheetLine } from '../cart/StripePaymentSheet';
import type { CheckoutWaitResult } from '../cart/checkoutOutcome';
import { describeReserveFailure } from '../cart/presentation';
import { calculatePlatformFee } from '../cart/platformFee';
import { useBeforeYouBook } from './BeforeYouBookSheet';
import { useAuth } from '../../contexts/AuthContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { openLegalPage } from '../../utils/legalPage';
import { logger } from '../../utils/logger';
import { offeredSlotLabel, waitlistCheckoutCharge } from './waitlist';

const DISPLAY = 'BakbakOne-Regular';
const BODY = 'Jura-VariableFont_wght';

/** What the ticket shows once a held slot is paid for. */
export interface WaitlistPaidResult {
  paid: number;
  /** Left to pay the provider at the appointment (a deposit's balance). */
  leftToPay: number;
  /** The provider approves bookings by hand, so it's a request until they do. */
  requestSent: boolean;
}

interface WaitlistPaySheetProps {
  /** The held place being paid for. null = closed. */
  place: MyWaitlistPlace | null;
  onClose: () => void;
  onPaid: (place: MyWaitlistPlace, result: WaitlistPaidResult) => void;
  /** The card was approved but the checkout didn't simply book. */
  onPending: (outcome: Exclude<CheckoutWaitResult, 'succeeded'>) => void;
}

interface HeldCheckout {
  holdId: string;
  providerId: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  expiresAt: string;
  price: number;
  /** What the card is charged for the service: its deposit or full price. */
  charged: number;
  isDeposit: boolean;
  isMobile: boolean;
  needsSafetyAck: boolean;
}

type Step = 'review' | 'pay';

/**
 * Pays for a held waitlist slot on its ticket, without the Cart. The review
 * step asks what the Cart's Booking Summary asks (the Terms tick, the
 * provider's safety notice, a mobile provider's address), prepare_checkout
 * then holds the money terms server side with waitlist_hold_id, and the
 * shared Stripe sheet takes the payment. The hold's clock keeps running.
 */
export function WaitlistPaySheet({ place, onClose, onPaid, onPending }: WaitlistPaySheetProps) {
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const bottomInset = useSystemBottomInset();
  const { user } = useAuth();
  const { holdForDetails, beforeYouBookSheet } = useBeforeYouBook();

  const [held, setHeld] = useState<HeldCheckout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('review');
  const [checkout, setCheckout] = useState<{ batchId: string; amountDue: number } | null>(null);
  const planRef = useRef<CheckoutHoldPlan | null>(null);
  const inFlightRef = useRef(false);

  // Read the held row and what checkout needs each time a place opens.
  useEffect(() => {
    if (!place?.holdBookingId) return;
    let active = true;
    setHeld(null);
    setLoadError(null);
    setError(null);
    setAgreed(false);
    setStep('review');
    setCheckout(null);
    planRef.current = null;
    const holdId = place.holdBookingId;
    (async () => {
      const hold = await getBookingById(holdId);
      if (!hold || hold.status !== 'on_hold' || !hold.hold_expires_at || !hold.service_id) {
        if (active) setLoadError("This slot's time ran out before you could pay, so you've come off this waitlist. You can rejoin.");
        return;
      }
      const [live, metadata, safety] = await Promise.all([
        getRebookableService(hold.provider_id, hold.service_name_snapshot),
        getProviderCheckoutMetadata([{ key: place.providerName, providerId: hold.provider_id }]),
        getServiceSafetyFlags([hold.service_id]),
      ]);
      if (!live || live.id !== hold.service_id) {
        if (active) setLoadError(`${place.providerName} isn't taking bookings for ${place.serviceName} at the moment.`);
        return;
      }
      const { charged, isDeposit } = waitlistCheckoutCharge(live.price, metadata.depositPolicies[place.providerName]);
      const isMobile = metadata.mobileProviderNames.has(place.providerName);
      const flags = safety.get(hold.service_id);
      const lastAddress = isMobile ? await getMyLastClientAddress().catch(() => null) : null;
      if (!active) return;
      setAddress(lastAddress ?? '');
      setHeld({
        holdId,
        providerId: hold.provider_id,
        serviceId: hold.service_id,
        serviceName: live.name,
        date: hold.booking_date,
        time: hold.booking_time.slice(0, 5),
        expiresAt: hold.hold_expires_at,
        price: live.price,
        charged,
        isDeposit,
        isMobile,
        needsSafetyAck: !!flags && (flags.patchTestRequired || !flags.isPregnancySafe),
      });
    })().catch((err: unknown) => {
      logger.error('[WaitlistPaySheet] could not load the held slot', err);
      if (active) setLoadError("Couldn't open checkout. Check your connection and try again.");
    });
    return () => { active = false; };
  }, [place?.holdBookingId, place?.providerName, place?.serviceName]);

  const fee = held ? calculatePlatformFee(held.charged) : 0;
  const total = held ? held.charged + fee : 0;
  const leftToPay = held && held.isDeposit ? Math.max(0, held.price - held.charged) : 0;
  const addressMissing = !!held?.isMobile && address.trim().length === 0;
  const canContinue = !!held && agreed && !addressMissing && !preparing;

  const release = useCallback((batchId: string | null | undefined) => {
    if (!batchId) return;
    cancelCheckout(batchId).catch(err => logger.error('[WaitlistPaySheet] could not release the checkout', err));
  }, []);

  const closeAll = useCallback(() => {
    if (checkout && !inFlightRef.current) release(checkout.batchId);
    setCheckout(null);
    setStep('review');
    onClose();
  }, [checkout, onClose, release]);

  const prepare = useCallback(async () => {
    if (!held || !place) return;
    setPreparing(true);
    setError(null);
    try {
      const prepared = await prepareCheckout([{
        provider_id: held.providerId,
        service_id: held.serviceId,
        booking_date: held.date,
        booking_time: held.time,
        add_on_ids: [],
        use_deposit: held.isDeposit,
        ...(held.isMobile ? { client_address: address.trim(), client_area: user?.clientArea ?? null } : {}),
        // The one tick below: the Terms, the provider's cancellation policy,
        // and (when the service has one) its safety notice. prepare_checkout
        // re-derives whether the service needs the safety ack.
        safety_ack: agreed,
        policy_accepted: agreed,
        // The waitlist never showed a copy of the policy, so the server
        // freezes the provider's live one, as it does for a Cart hold.
        policy_snapshot: null,
        waitlist_hold_id: held.holdId,
      }]);
      setCheckout({ batchId: prepared.checkoutBatchId, amountDue: prepared.amountDue });
      setStep('pay');
    } catch (err) {
      logger.error('[WaitlistPaySheet] prepare_checkout failed', err);
      setError(describeReserveFailure(err).message);
    } finally {
      setPreparing(false);
    }
  }, [address, agreed, held, place, user?.clientArea]);

  const onContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Name, phone and date of birth first, the same as the Cart.
    if (holdForDetails(() => { void prepare(); })) return;
    void prepare();
  }, [holdForDetails, prepare]);

  const lines = useMemo((): PaymentSheetLine[] => (held
    ? [{ id: held.holdId, label: held.serviceName, price: held.charged, isDeposit: held.isDeposit }]
    : []), [held]);

  const slot = held ? offeredSlotLabel(held.date, held.time) : null;

  return (
    <>
      <Modal
        visible={!!place && step === 'review'}
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeAll}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAll} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.grab} />
            {!held && !loadError && <ActivityIndicator color={P.accent} style={styles.loading} />}
            {loadError && (
              <>
                <Text style={styles.title}>This slot has gone</Text>
                <Text style={styles.body}>{loadError}</Text>
                <TouchableOpacity style={[styles.button, styles.lineButton]} onPress={closeAll} activeOpacity={0.7}>
                  <Text style={[styles.buttonText, { color: P.sub }]}>Close</Text>
                </TouchableOpacity>
              </>
            )}
            {held && (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.timer}>
                  <View style={styles.timerRow}>
                    <Text style={styles.timerLabel}>Still held for you</Text>
                    <WaitlistHoldCountdown
                      expiresAt={held.expiresAt}
                      color={P.text}
                      textStyle={styles.timerTime}
                      onEnd={() => setLoadError("This slot's time ran out before you could pay, so you've come off this waitlist. You can rejoin.")}
                    />
                  </View>
                  <WaitlistHoldCountdown expiresAt={held.expiresAt} color={P.accent} trackColor={P.accentDim} showBar showTime={false} />
                </View>

                <View>
                  <Text style={styles.title}>{slot ?? 'Your slot'}</Text>
                  <Text style={styles.body}>{held.serviceName} · {place?.providerName}</Text>
                </View>

                <View style={styles.summary}>
                  <View style={styles.line}>
                    <Text style={styles.lineLabel}>{held.serviceName}{held.isDeposit ? ' (Deposit)' : ''}</Text>
                    <Text style={styles.lineValue}>£{held.charged.toFixed(2)}</Text>
                  </View>
                  <View style={styles.line}>
                    <Text style={styles.lineLabel}>Platform Fee</Text>
                    <Text style={styles.lineValue}>£{fee.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.line, styles.totalLine]}>
                    <Text style={[styles.lineLabel, { color: P.text }]}>Total</Text>
                    <Text style={[styles.lineValue, styles.totalValue]}>£{total.toFixed(2)}</Text>
                  </View>
                  {leftToPay > 0 && (
                    <View style={styles.line}>
                      <Text style={styles.lineLabel}>Left to pay at the appointment</Text>
                      <Text style={styles.lineValue}>£{leftToPay.toFixed(2)}</Text>
                    </View>
                  )}
                </View>

                {held.needsSafetyAck && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      {`${held.serviceName}'s provider has flagged safety information for this treatment (patch test and/or pregnancy) — see the service page for details.`}
                    </Text>
                  </View>
                )}

                {held.isMobile && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Your address</Text>
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Where should they come to?"
                      placeholderTextColor={P.sub}
                      style={styles.input}
                      autoComplete="street-address"
                      textContentType="fullStreetAddress"
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={styles.tickRow}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setAgreed(a => !a); }}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                >
                  <View style={[styles.tick, { backgroundColor: agreed ? P.accent : 'transparent' }]}>
                    {agreed && <Text style={[styles.tickMark, { color: P.onAccent }]}>✓</Text>}
                  </View>
                  {/* Same agreement, word for word, as the Cart's Booking Summary. */}
                  <Text style={styles.tickLabel}>
                    I agree to the{' '}
                    <Text style={{ color: P.accent, textDecorationLine: 'underline' }} onPress={() => openLegalPage('terms')}>Terms & Conditions</Text>
                    <Text style={{ color: '#FF3B30' }}> *</Text> and each provider's cancellation policy
                    {held.needsSafetyAck ? ', and confirm I have seen the safety information above' : ''}
                  </Text>
                </TouchableOpacity>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: canContinue ? P.accent : P.accentDim }]}
                  onPress={onContinue}
                  disabled={!canContinue}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  {preparing
                    ? <ActivityIndicator color={P.onAccent} size="small" />
                    : <Text style={[styles.buttonText, { color: canContinue ? P.onAccent : P.sub }]}>Continue to pay £{total.toFixed(2)}</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
        {beforeYouBookSheet}
      </Modal>

      <StripePaymentSheet
        isVisible={!!place && step === 'pay' && !!checkout}
        lines={lines}
        totalAmount={checkout?.amountDue ?? total}
        checkoutBatchId={checkout?.batchId ?? null}
        onClose={() => {
          // Backed out without paying: free the checkout now. The hold itself
          // keeps its own clock, so they can try again from the ticket.
          if (checkout) release(checkout.batchId);
          setCheckout(null);
          setStep('review');
        }}
        onPaymentInFlight={inFlight => { inFlightRef.current = inFlight; }}
        onCheckoutPaid={(_batchId, plan) => { planRef.current = plan; }}
        // The server books a prepared checkout itself; nothing to do here.
        onPaymentSuccess={async () => {}}
        onPaymentComplete={() => {
          const paid = checkout?.amountDue ?? total;
          setCheckout(null);
          setStep('review');
          if (place) onPaid(place, { paid, leftToPay, requestSent: (planRef.current?.requestCount ?? 0) > 0 });
        }}
        onPaymentPending={outcome => {
          setCheckout(null);
          setStep('review');
          onPending(outcome);
        }}
        onBookingFailed={message => {
          if (checkout) release(checkout.batchId);
          setCheckout(null);
          setError(message);
          setStep('review');
        }}
      />
    </>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
    sheet: { maxHeight: '92%', backgroundColor: P.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20 },
    grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: P.border, marginBottom: 12 },
    loading: { marginVertical: 40 },
    content: { gap: 14, paddingBottom: 4 },
    timer: { gap: 6, backgroundColor: P.accentDim, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
    timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timerLabel: { fontFamily: DISPLAY, fontSize: 14, color: P.text },
    timerTime: { fontSize: 16 },
    title: { fontFamily: DISPLAY, fontSize: 19, color: P.text },
    body: { fontFamily: BODY, fontSize: 14, fontWeight: '600', color: P.sub, marginTop: 2, lineHeight: 19 },
    summary: { backgroundColor: P.surface, borderRadius: 16, borderWidth: 1, borderColor: P.border, padding: 14, gap: 10 },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
    lineLabel: { flexShrink: 1, fontFamily: BODY, fontSize: 14, fontWeight: '600', color: P.sub },
    lineValue: { fontFamily: DISPLAY, fontSize: 14, color: P.text, fontVariant: ['tabular-nums'] },
    totalLine: { borderTopWidth: 1, borderTopColor: P.sep, paddingTop: 10 },
    totalValue: { fontSize: 17 },
    notice: { backgroundColor: P.surface, borderRadius: 12, borderWidth: 1, borderColor: P.border, padding: 12 },
    noticeText: { fontFamily: BODY, fontSize: 13, fontWeight: '600', color: P.sub, lineHeight: 18 },
    field: { gap: 6 },
    fieldLabel: { fontFamily: DISPLAY, fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase', color: P.sub },
    input: { fontFamily: BODY, fontSize: 15, fontWeight: '600', color: P.text, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
    tickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: P.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    tickMark: { fontSize: 14, fontWeight: '800' },
    tickLabel: { flex: 1, fontFamily: BODY, fontSize: 13.5, fontWeight: '600', color: P.text, lineHeight: 19 },
    error: { fontFamily: BODY, fontSize: 13.5, fontWeight: '700', color: '#D9534F', lineHeight: 19 },
    button: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    lineButton: { borderWidth: 1, borderColor: P.border, marginTop: 14 },
    buttonText: { fontFamily: DISPLAY, fontSize: 14, letterSpacing: 0.6 },
  });
