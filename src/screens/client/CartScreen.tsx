// src/screens/CartScreen.tsx - COMPLETELY FIXED
import React, { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCart, CartItem } from '../../contexts/CartContext';
import { useBooking, AppointmentData , BookingError } from '../../contexts/BookingContext';
import { BookingService, DepositPolicy } from '../../services/bookingService';
import { AvailabilityService, type BackToBackSlot } from '../../services/AvailabilityService';
import { createPaymentIntent, capturePaymentIntent, cancelPaymentIntent } from '../../services/stripeService';
import {
  getProviderDepositPoliciesByDisplayNames,
  ProviderDepositPolicy,
  validatePromoCode,
  getServiceSafetyFlags,
 getMobileProviderDisplayNames, prepareCheckout, cancelCheckout, getMyLastClientAddress } from '../../services/databaseService';
import type { DbPromotion } from '../../types/database';
import type { CartScreenProps } from '../../navigation/types';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { dimensions, fonts, spacing } from '../../constants/PlatformDimensions';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useAppDialog } from '../../components/AppDialog';
import { BookingSheet, type BookingSheetResult } from '../../components/BookingSheet';
import { ModernBeautyCalendar } from '../../components/ModernBeautyCalendar';

import { logger } from '../../utils/logger';
import { env } from '../../utils/env';
import { formatLongDateNoYear, formatTime12 } from '../../utils/dateUtils';
import { durationToMinutes, formatTimeSpan, to24hMinutes } from '../../features/cart/presentation';
import { getCartAddOnsSummary, getCartItemFullPrice } from '../../features/cart/pricing';
import { calculatePlatformFee } from '../../features/cart/platformFee';

// Keep real payments opt-in until Stripe is explicitly switched on for a
// release. Expo Go can never use this native module.
const USE_STRIPE_PAYMENTS = env.stripePaymentsEnabled && !env.isExpoGo;

// Real useStripe() throws at import time under Expo Go (TurboModuleRegistry.
// getEnforcing has no native module to find there). StripePaymentModal below
// is only ever rendered when USE_STRIPE_PAYMENTS is true, which is forced
// off under Expo Go, so this stub's return value never actually gets called
// — it only needs to exist so the module loads and the hook-call shape below
// stays valid.
const useStripe: () => { initPaymentSheet: (...args: any[]) => Promise<any>; presentPaymentSheet: (...args: any[]) => Promise<any> } =
  env.isExpoGo
    ? () => ({ initPaymentSheet: async () => ({}), presentPaymentSheet: async () => ({}) })
    // The native module cannot be statically imported in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    : require('@stripe/stripe-react-native').useStripe;


// (Removed duplicate CartScreen definition. The correct CartScreen is defined below.)

// Read-model shape for a cart item's booking details — derived from the
// CartItem itself (see bookingsByItemId in CartScreen), and the shape the
// payment/review internals (BookingService.createAppointmentData, the order
// review modal) already expect.
interface ServiceBooking {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean;
}

// One card in a provider's section: either a standalone service, or several
// services scheduled together (shared bookingBatchId) shown as one card.
// At or above this many appointments the checkout summary is presented as a
// full screen rather than a centred card — see the Booking Summary <Modal>.
const FULL_SCREEN_SUMMARY_THRESHOLD = 5;

/** Chrome around the checkout summary's content. Two presentations, one
 *  body: a centred card for a small cart, a full screen with a pinned
 *  action row for a large one. Kept at module scope (not inlined in
 *  CartScreen's render) so flipping between them doesn't remount the
 *  content on every parent render. */
function SummaryShell({
  fullScreen,
  P,
  onBack,
  actions,
  children,
}: {
  fullScreen: boolean;
  P: AppTheme;
  onBack: () => void;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!fullScreen) {
    return (
      <View style={styles.modalOverlayNoBlur}>
        <View style={[styles.reviewModalContainer, styles.summaryModalContainer, { backgroundColor: P.card, borderColor: P.border }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.reviewModalContent}>
              <Text style={[styles.reviewModalTitle, { color: P.text }]}>Booking Summary</Text>
              <Text style={[styles.reviewModalSubtitle, { color: P.sub }]}>Review your appointments before payment</Text>
              {children}
              <View style={styles.reviewButtonRow}>{actions}</View>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    // Own SafeAreaProvider: a fullScreen modal renders into its own native
    // surface that the app-root provider doesn't measure, so insets would
    // come back zero without it. Same pattern as ImageDetailModal and
    // ProviderProfileScreen.
    <SafeAreaProvider>
      <SafeAreaView style={[styles.summaryScreen, { backgroundColor: P.bg }]} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.summaryHeader, { borderBottomColor: P.border }]}>
          <TouchableOpacity
            style={styles.summaryBackBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onBack();
            }}
          >
            <Ionicons name="chevron-back" size={24} color={P.text} />
          </TouchableOpacity>
          <View style={styles.summaryHeaderTitles}>
            <Text style={[styles.reviewModalTitle, { color: P.text }]}>Booking Summary</Text>
            <Text style={[styles.reviewModalSubtitle, { color: P.sub, marginBottom: 0 }]}>Review your appointments before payment</Text>
          </View>
        </View>
        <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* Pinned action row — never scrolls out of reach on a long
            multi-provider cart. */}
        <View style={[styles.summaryFooter, { borderTopColor: P.border, backgroundColor: P.bg }]}>
          <View style={styles.reviewButtonRow}>{actions}</View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type CartRenderUnit =
  | { kind: 'single'; item: CartItem }
  | { kind: 'group'; batchId: string; items: CartItem[] };

// Effective Item for Payment Modal
interface EffectiveCartItem {
  item: CartItem;
  effectivePrice: number;
  isDeposit: boolean;
}

// Payment Modal Component
interface PaymentModalProps {
  isVisible: boolean;
  onClose: () => void;
  effectiveCartItems: EffectiveCartItem[];
  totalAmount: number;
  /** Present only for the real Stripe route. Its amount and held bookings are
   * already server-created before the payment sheet opens. */
  checkoutBatchId?: string | null;
  // paymentIntentId is only ever passed by StripePaymentModal — the mock
  // PaymentModal never sets it, so it stays undefined and payment_intent_id
  // on the booking stays null, same as before either modal existed.
  onPaymentSuccess: (paymentMethod: string, paymentIntentId?: string) => Promise<void>;
  onPaymentComplete: () => void;
  // Rendered via the parent CartScreen's own DialogHost, not this modal's —
  // the alert would otherwise be nested inside this component's own <Modal>,
  // so closing the payment sheet on failure would dismiss the alert with it.
  onBookingFailed: (message: string) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = memo(
  ({
    isVisible,
    onClose,
    effectiveCartItems,
    totalAmount,
    onPaymentSuccess,
    onPaymentComplete,
    onBookingFailed,
  }) => {
    const { theme, palette: P } = useTheme();
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
      'card' | 'paypal' | 'apple' | 'google'
    >('card');
    const [isProcessing, setIsProcessing] = useState(false);
    const [cardDetails, setCardDetails] = useState({
      number: '',
      expiry: '',
      cvc: '',
      name: '',
    });
    const paymentMethods = [
      { id: 'card', name: 'Credit/Debit Card', icon: '💳' },
      { id: 'paypal', name: 'PayPal', icon: '🅿️' },
      { id: 'apple', name: 'Apple Pay', icon: '🍎' },
      { id: 'google', name: 'Google Pay', icon: '🔵' },
    ];

    const processingRef = useRef(false);

const handlePayment = useCallback(async () => {
  const timestamp = () => new Date().toISOString().split('T')[1];

  // ✅ CRITICAL: Prevent multiple simultaneous payment processing
  if (processingRef.current) {
    if (__DEV__) {
      logger.log(`[${timestamp()}] Payment already processing - ignoring duplicate call`);
    }
    return;
  }

  processingRef.current = true;
  if (__DEV__) {
    logger.log(`\n${'='.repeat(60)}`);
    logger.log(`[${timestamp()}] PAY BUTTON PRESSED`);
    logger.log(`${'='.repeat(60)}\n`);
  }

  setIsProcessing(true);
  try {
    if (__DEV__) {
      logger.log(`\n[${timestamp()}] Calling onPaymentSuccess...`);
    }
    const startTime = Date.now();
    try {
      await onPaymentSuccess(selectedPaymentMethod);
      const duration = Date.now() - startTime;
      if (__DEV__) {
        logger.log(`[${timestamp()}] onPaymentSuccess completed in ${duration}ms`);
      }
    } catch (bookingError) {
      const duration = Date.now() - startTime;
      logger.error(`💰 [${timestamp()}] ❌ onPaymentSuccess FAILED after ${duration}ms:`, bookingError);
      throw bookingError;
    }

    if (__DEV__) {
      logger.log(`\n[${timestamp()}] Waiting 500ms for AsyncStorage to complete...`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    if (__DEV__) {
      logger.log(`[${timestamp()}] 500ms wait complete`);
    }

    if (__DEV__) {
      logger.log(`\n[${timestamp()}] Calling onPaymentComplete (clearing cart)...`);
    }
    onPaymentComplete();
    if (__DEV__) {
      logger.log(`[${timestamp()}] Cart cleared successfully`);
    }

    if (__DEV__) {
      logger.log(`\n${'='.repeat(60)}`);
      logger.log(`[${timestamp()}] PAYMENT FLOW COMPLETE`);
      logger.log(`${'='.repeat(60)}\n`);
    }
  } catch (error) {
    logger.error(`\n${'='.repeat(60)}`);
    logger.error(`❌ [${timestamp()}] PAYMENT ERROR`);
    logger.error(`${'='.repeat(60)}`);
    logger.error(`❌ [${timestamp()}] Error:`, error);
    logger.error(`❌ [${timestamp()}] Error message:`, (error as Error).message);
    logger.error(`❌ [${timestamp()}] Error stack:`, (error as Error).stack);
    logger.error(`${'='.repeat(60)}\n`);

    // Close the payment sheet first — its own DialogHost is nested inside
    // this component's <Modal>, so showing the alert here without closing
    // would leave the payment form visible behind/around it. The alert is
    // shown via the parent's DialogHost instead, which survives the close.
    onClose();
    onBookingFailed(
      error instanceof BookingError
        ? error.message
        : "We couldn't complete this booking. Please try again."
    );
  } finally {
    if (__DEV__) {
      logger.log(`[${timestamp()}] Setting isProcessing to false`);
    }
    setIsProcessing(false);
    processingRef.current = false; // ✅ Reset processing guard
    if (__DEV__) {
      logger.log(`[${timestamp()}] isProcessing set to false\n`);
    }
  }
}, [selectedPaymentMethod, onPaymentSuccess, onPaymentComplete, onClose, onBookingFailed]);

    const formatCardNumber = (text: string) => {
      const cleaned = text.replace(/\s/g, '');
      const formatted = cleaned.replace(/(.{4})/g, '$1 ').trim();
      return formatted.substring(0, 19);
    };

    const formatExpiry = (text: string) => {
      const cleaned = text.replace(/\D/g, '');
      if (cleaned.length >= 2) {
        return `${cleaned.substring(0, 2)}/${cleaned.substring(2, 4)}`;
      }
      return cleaned;
    };

    return (
      <Modal visible={isVisible} animationType="fade" transparent={true}>
        <View style={styles.paymentOverlay}>
          <View style={[styles.paymentModal, { backgroundColor: P.bg }]}>
            <SafeAreaView style={styles.paymentModalContent}>
              {/* Payment Header */}
              <View style={[styles.paymentHeader, { borderBottomColor: P.border }]}>
                <Text style={[styles.paymentTitle, { color: theme.text }]}>Complete Payment</Text>
                <TouchableOpacity
                  style={styles.paymentCloseButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onClose();
                  }}
                >
                  <Text style={[styles.paymentCloseText, { color: theme.text }]}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.paymentContent} showsVerticalScrollIndicator={false}>
                {/* Order Summary - UPDATED WITH BREAKDOWN */}
                <View style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.orderSummaryTitle, { color: theme.text }]}>Order Summary</Text>
                  {effectiveCartItems.map(({ item, effectivePrice, isDeposit }, index) => (
                    <View key={item.id} style={styles.orderItem}>
                      <Text style={[styles.orderItemName, { color: theme.text }]}>
                        {item.serviceName} #{item.serviceInstanceIndex || 1}
                        {isDeposit && ' (Deposit)'}
                      </Text>
                      <Text style={[styles.orderItemPrice, { color: theme.text }]}>£{effectivePrice.toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={styles.orderTotal}>
                    <Text style={[styles.orderTotalLabel, { color: theme.text }]}>
                      Total
                    </Text>
                    <Text style={[styles.orderTotalAmount, { color: theme.text }]}>£{totalAmount.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Payment Methods - CLEAR TEXT COLORS */}
                <View style={styles.paymentMethods}>
                  <Text style={[styles.paymentMethodsTitle, { color: theme.text }]}>Payment Method</Text>
                  {paymentMethods.map(method => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.paymentMethodItem,
                        { backgroundColor: P.surface, borderColor: 'transparent' },
                        selectedPaymentMethod === method.id && { borderColor: P.accent, backgroundColor: P.accentDim },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedPaymentMethod(method.id as any);
                      }}
                    >
                      <Text style={styles.paymentMethodIcon}>{method.icon}</Text>
                      <Text style={[styles.paymentMethodName, { color: theme.text }]}>{method.name}</Text>
                      <View
                        style={[
                          styles.paymentMethodRadio,
                          selectedPaymentMethod === method.id && { borderColor: P.accent },
                        ]}
                      >
                        {selectedPaymentMethod === method.id && (
                          <View style={[styles.paymentMethodRadioInner, { backgroundColor: P.accent }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Card Details (only show for card payment) */}
                {selectedPaymentMethod === 'card' && (
                  <View style={styles.cardDetails}>
                    <Text style={[styles.cardDetailsTitle, { color: theme.text }]}>Card Details</Text>

                    <TextInput
                      style={[styles.cardInput, { backgroundColor: P.surface, color: P.text, borderColor: P.border }]}
                      placeholder="Card Number"
                      placeholderTextColor={P.sub}
                      value={cardDetails.number}
                      onChangeText={text =>
                        setCardDetails(prev => ({
                          ...prev,
                          number: formatCardNumber(text),
                        }))
                      }
                      keyboardType="numeric"
                      maxLength={19}
                    />

                    <View style={styles.cardRow}>
                      <TextInput
                        style={[styles.cardInput, styles.cardInputHalf, { backgroundColor: P.surface, color: P.text, borderColor: P.border }]}
                        placeholder="MM/YY"
                        placeholderTextColor={P.sub}
                        value={cardDetails.expiry}
                        onChangeText={text =>
                          setCardDetails(prev => ({
                            ...prev,
                            expiry: formatExpiry(text),
                          }))
                        }
                        keyboardType="numeric"
                        maxLength={5}
                      />
                      <TextInput
                        style={[styles.cardInput, styles.cardInputHalf, { backgroundColor: P.surface, color: P.text, borderColor: P.border }]}
                        placeholder="CVC"
                        placeholderTextColor={P.sub}
                        value={cardDetails.cvc}
                        onChangeText={text =>
                          setCardDetails(prev => ({
                            ...prev,
                            cvc: text.replace(/\D/g, '').substring(0, 3),
                          }))
                        }
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>

                    <TextInput
                      style={[styles.cardInput, { backgroundColor: P.surface, color: P.text, borderColor: P.border }]}
                      placeholder="Cardholder Name"
                      placeholderTextColor={P.sub}
                      value={cardDetails.name}
                      onChangeText={text =>
                        setCardDetails(prev => ({
                          ...prev,
                          name: text,
                        }))
                      }
                    />
                  </View>
                )}
              </ScrollView>

              {/* Payment Button */}
              <TouchableOpacity
                style={[styles.payButton, { backgroundColor: isProcessing ? P.accentDim : P.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  handlePayment();
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={P.onAccent} size="small" />
                ) : (
                  <Text style={[styles.payButtonText, { color: P.onAccent }]}>Pay £{totalAmount.toFixed(2)}</Text>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    );
  }
);

PaymentModal.displayName = 'PaymentModal';

// Real Stripe payment flow — card, Apple Pay, and Google Pay via Stripe's
// own Payment Sheet (PayPal shows up automatically too, once PayPal is
// turned on for the Stripe account under Settings > Payment methods —
// nothing here needs to change for that, it rides on
// automatic_payment_methods). Not wired into the active checkout yet; see
// USE_STRIPE_PAYMENTS below CartScreen's imports. Swap PaymentModal for this
// at the render site when ready to go live with real payment.
//
// capture_method: 'manual' on the PaymentIntent (create-payment-intent Edge
// Function) means presentPaymentSheet() only authorises the card — the
// booking is created first, and only a successful booking triggers the
// actual capture (finalize-payment-intent). A failed booking cancels the
// authorisation instead, so a client is never left charged with nothing
// booked. See the CartScreen conversation history / commit messages for the
// full reasoning — this preserves that behaviour exactly.
const StripePaymentModal: React.FC<PaymentModalProps> = memo(
  ({
    isVisible,
    onClose,
    effectiveCartItems,
    totalAmount,
    checkoutBatchId,
    onPaymentSuccess,
    onPaymentComplete,
    onBookingFailed,
  }) => {
    const { theme, isDarkMode, palette: P } = useTheme();
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    const [isProcessing, setIsProcessing] = useState(false);
    const processingRef = useRef(false);

    const handlePayment = useCallback(async () => {
      const timestamp = () => new Date().toISOString().split('T')[1];

      if (processingRef.current) {
        if (__DEV__) logger.log(`[${timestamp()}] Payment already processing - ignoring duplicate call`);
        return;
      }
      processingRef.current = true;
      setIsProcessing(true);

      try {
        if (!checkoutBatchId) {
          throw new Error('Checkout has expired. Please review your booking and try again.');
        }
        if (__DEV__) logger.log(`[${timestamp()}] Creating PaymentIntent for £${totalAmount.toFixed(2)}...`);
        const { clientSecret, paymentIntentId } = await createPaymentIntent(checkoutBatchId);

        // Theme the sheet to match the app's own palette (bound to the
        // app's own isDarkMode, not the OS setting Stripe would otherwise
        // auto-detect) instead of Stripe's generic default.
        const stripeColors = {
          primary: P.accent,
          background: P.bg,
          componentBackground: P.surface,
          componentBorder: isDarkMode ? '#2E7E6667' : '#247E6667', // P.border, as #AARRGGBB
          componentDivider: isDarkMode ? '#2E7E6667' : '#247E6667',
          primaryText: theme.text,
          secondaryText: P.sub,
          componentText: theme.text,
          placeholderText: P.sub,
          icon: P.sub,
          error: '#FF3B30',
        };

        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Cerviced',
          paymentIntentClientSecret: clientSecret,
          appearance: {
            colors: stripeColors,
            shapes: { borderRadius: 20, borderWidth: 1 },
            primaryButton: {
              colors: { background: P.accent, text: P.onAccent, border: P.accent },
              shapes: { borderRadius: 20 },
            },
          },
          // Requires a real Apple merchant ID registered in your Apple
          // Developer account and linked in the Stripe Dashboard — the
          // placeholder in app.json's plugin config ("merchant.com.cerviced")
          // unblocks the build but Apple Pay won't actually appear/function
          // until that registration is real.
          applePay: { merchantCountryCode: 'GB' },
          // Works in Stripe test mode. app.json enables Google Pay for
          // Android; production still requires a fully configured Stripe
          // account and release signing.
          googlePay: { merchantCountryCode: 'GB', testEnv: __DEV__ },
        });
        if (initError) {
          throw new Error(initError.message || 'Could not start payment.');
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === 'Canceled') {
            if (__DEV__) logger.log(`[${timestamp()}] Payment sheet cancelled by user`);
            // Stripe's own sheet dismiss bypasses this modal's normal close
            // path entirely — call onClose explicitly so CartScreen's
            // release-the-hold-batch logic (wired into onClose) still runs
            // instead of leaving the slot reserved until the TTL sweep.
            onClose();
            return;
          }
          throw new Error(presentError.message || 'Payment failed. Please try again.');
        }

        if (__DEV__) logger.log(`[${timestamp()}] Payment authorised (${paymentIntentId}). Finalising server checkout...`);
        try {
          // This Edge call converts the database hold to bookings and captures
          // the exact server-calculated amount. It is intentionally one
          // operation: this screen never writes bookings or chooses a charge.
          await capturePaymentIntent(checkoutBatchId, paymentIntentId);
          await onPaymentSuccess('card', paymentIntentId);
        } catch (bookingError) {
          logger.error(`💰 [${timestamp()}] ❌ onPaymentSuccess FAILED:`, bookingError);
          // If finalisation failed before capture, release the Stripe hold and
          // the database reservation. A successfully captured payment is not
          // cancelled by this best-effort cleanup.
          try { await cancelPaymentIntent(checkoutBatchId, paymentIntentId); } catch (cancelError) {
            logger.error(`💰 [${timestamp()}] Failed to release payment hold:`, paymentIntentId, cancelError);
          }
          throw bookingError;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        onPaymentComplete();
      } catch (error) {
        logger.error(`❌ [${timestamp()}] PAYMENT ERROR:`, error);
        onClose();
        const partiallySucceeded = error instanceof BookingError && error.succeededAmountPaid > 0;
        onBookingFailed(
          (error instanceof BookingError
            ? error.message
            : "We couldn't complete this booking. Please try again.")
          + (partiallySucceeded
              ? " You were only charged for the services that were booked."
              : " You have not been charged.")
        );
      } finally {
        setIsProcessing(false);
        processingRef.current = false;
      }
    }, [checkoutBatchId, totalAmount, initPaymentSheet, presentPaymentSheet, onPaymentSuccess, onPaymentComplete, onClose, onBookingFailed, P, theme, isDarkMode]);

    return (
      <Modal visible={isVisible} animationType="fade" transparent={true}>
        <View style={styles.paymentOverlay}>
          <View style={[styles.paymentModal, { backgroundColor: P.bg }]}>
            <SafeAreaView style={styles.paymentModalContent}>
              <View style={[styles.paymentHeader, { borderBottomColor: P.border }]}>
                <Text style={[styles.paymentTitle, { color: theme.text }]}>Complete Payment</Text>
                <TouchableOpacity
                  style={styles.paymentCloseButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onClose();
                  }}
                >
                  <Text style={[styles.paymentCloseText, { color: theme.text }]}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.paymentContent} showsVerticalScrollIndicator={false}>
                <View style={[styles.orderSummary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.orderSummaryTitle, { color: theme.text }]}>Order Summary</Text>
                  {effectiveCartItems.map(({ item, effectivePrice, isDeposit }) => (
                    <View key={item.id} style={styles.orderItem}>
                      <Text style={[styles.orderItemName, { color: theme.text }]}>
                        {item.serviceName} #{item.serviceInstanceIndex || 1}
                        {isDeposit && ' (Deposit)'}
                      </Text>
                      <Text style={[styles.orderItemPrice, { color: theme.text }]}>£{effectivePrice.toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={styles.orderTotal}>
                    <Text style={[styles.orderTotalLabel, { color: theme.text }]}>
                      Total
                    </Text>
                    <Text style={[styles.orderTotalAmount, { color: theme.text }]}>£{totalAmount.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Card entry, Apple Pay, and Google Pay all happen inside
                    Stripe's own Payment Sheet (opened by the button below) —
                    never in this component's state. */}
                <View style={styles.paymentMethods}>
                  <Text style={[styles.paymentMethodsTitle, { color: theme.text }]}>Payment</Text>
                  <Text style={[styles.paymentMethodName, { color: P.sub }]}>
                    Card, Apple Pay, or Google Pay — you'll enter your details securely on the next screen.
                  </Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.payButton, { backgroundColor: isProcessing ? P.accentDim : P.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  handlePayment();
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={P.onAccent} size="small" />
                ) : (
                  <Text style={[styles.payButtonText, { color: P.onAccent }]}>Pay £{totalAmount.toFixed(2)}</Text>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    );
  }
);

StripePaymentModal.displayName = 'StripePaymentModal';

// Service Card Component
interface ServiceCardProps {
  item: CartItem;
  bookingInfo: ServiceBooking;
  onRemove: (itemId: string) => void;
  onEdit: (item: CartItem) => void;
  allCartItems: CartItem[];
  depositPolicy?: ProviderDepositPolicy;
  hasConflict?: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = memo(
  ({
    item,
    bookingInfo,
    onRemove,
    onEdit,
    allCartItems,
    depositPolicy,
    hasConflict,
  }) => {
    const { theme, palette: P } = useTheme();
    const { showConfirm, DialogHost } = useAppDialog();
    const [isLoading, setIsLoading] = useState(false);

    const totalPrice = useMemo(() => getCartItemFullPrice(item), [item]);

    // Add-ons are surfaced as their own labelled line (not silently merged
    // into the service name list) so the client can see what the extras are
    // and what they add before paying.
    const addOnsSummary = useMemo(() => getCartAddOnsSummary(item), [item]);

    const depositPolicyArg = useMemo((): DepositPolicy | number => {
      if (!depositPolicy) return 20;
      return { type: depositPolicy.depositType, amount: depositPolicy.depositAmount };
    }, [depositPolicy]);

    const effectivePrice = useMemo(() => {
      if (bookingInfo.isDepositOnly) {
        return BookingService.calculateDeposit(totalPrice, depositPolicyArg);
      }
      return totalPrice;
    }, [totalPrice, bookingInfo.isDepositOnly, depositPolicyArg]);

    const handleRemove = useCallback(async () => {
      try {
        setIsLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        showConfirm('Remove Service', `Remove ${item.serviceName} from cart?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onRemove(item.id);
            },
          },
        ]);
      } catch (error) {
        logger.error('Error removing item:', error);
      } finally {
        setIsLoading(false);
      }
    }, [item.id, item.serviceName, onRemove, showConfirm]);

    const isScheduled = Boolean(bookingInfo?.selectedDate && bookingInfo?.selectedTime);

    const serviceName = item?.serviceName || 'Unknown Service';
    const serviceInstanceIndex = item?.serviceInstanceIndex || 1;
    const duration = item?.duration || 'Unknown duration';
    const showInstanceNumber =
      allCartItems.filter((i: CartItem) => i.serviceName === item.serviceName).length > 1;

    return (
      <ErrorBoundary
        fallback={(error, retry) => (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>Error loading service card</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                retry();
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={[
          styles.serviceCard,
          styles.serviceCardShadow,
          { backgroundColor: P.surface, borderColor: hasConflict ? '#F44336' : P.border, borderWidth: hasConflict ? 1.5 : StyleSheet.hairlineWidth },
        ]}>
          {hasConflict && (
            <View style={styles.conflictBanner}>
              <Ionicons name="alert-circle" size={14} color="#F44336" />
              <Text style={styles.conflictBannerText}>
                This time is no longer available — pick a new time
              </Text>
            </View>
          )}
          {/* Header binds the service to its price on one line, with the
              duration tucked directly under the name — previously the title
              sat alone above a full-width gap and the price lived on a
              separate row, which read as three loose bands rather than one
              card. */}
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceName, { color: theme.text }]} numberOfLines={2}>
                {serviceName}
                {showInstanceNumber ? ` #${serviceInstanceIndex}` : ''}
                {bookingInfo.isDepositOnly && ' (Deposit)'}
              </Text>
              <Text style={[styles.priceSummaryText, { color: theme.secondaryText }]} numberOfLines={1}>
                {duration}
              </Text>
            </View>
            <Text style={[styles.priceSummaryValue, { color: P.accentText }]}>
              £{effectivePrice.toFixed(2)}
            </Text>
            <TouchableOpacity
              style={[styles.removeButton, { backgroundColor: P.accentDim, borderColor: P.border }, isLoading && styles.disabledButton]}
              onPress={handleRemove}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={P.text} />
              ) : (
                <Text style={[styles.removeText, { color: P.text }]}>×</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Secondary detail — add-ons, deposit note, notes — sits tight
              together as one block instead of each line carrying its own
              margin. Cart is for review + payment, not a full pricing
              ledger, so add-ons stay on one compact labelled line; detailed
              per-add-on pricing is in BookingSheet via Edit. */}
          {(addOnsSummary || bookingInfo.isDepositOnly || !!bookingInfo.notes) && (
            <View style={styles.serviceMetaBlock}>
              {addOnsSummary && (
                <Text style={[styles.priceSummaryAddOns, { color: theme.text }]} numberOfLines={2}>
                  + {addOnsSummary.count} add-on{addOnsSummary.count === 1 ? '' : 's'} (£
                  {addOnsSummary.total.toFixed(2)}): {addOnsSummary.names}
                </Text>
              )}
              {bookingInfo.isDepositOnly && (
                <Text style={[styles.depositNote, { color: theme.secondaryText }]}>
                  Due at appointment — £{BookingService.calculateRemainingBalance(totalPrice, depositPolicyArg).toFixed(2)}
                </Text>
              )}
              {!!bookingInfo.notes && (
                <Text style={[styles.notesPreview, { color: P.sub }]} numberOfLines={2}>
                  Notes: {bookingInfo.notes}
                </Text>
              )}
            </View>
          )}

          {/* Footer: date/time + Edit, separated by a rule so the card ends
              on a deliberate band rather than trailing off. A standalone
              service edits directly, no chooser in between. */}
          <View style={[styles.dateRow, { borderTopColor: P.border }]}>
            <Text
              style={[styles.dateText, { color: theme.secondaryText }, !isScheduled && styles.dateTextWarning]}
              numberOfLines={2}
            >
              {isScheduled
                ? `${formatLongDateNoYear(bookingInfo.selectedDate)} at ${formatTime12(bookingInfo.selectedTime)}`
                : 'Unscheduled'}
            </Text>
            <TouchableOpacity
              style={[styles.itemEditButton, { borderColor: P.accent }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onEdit(item);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil-outline" size={12} color={P.accentText} />
              <Text style={[styles.itemEditButtonText, { color: P.accentText }]}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
        <DialogHost />
      </ErrorBoundary>
    );
  }
);

ServiceCard.displayName = 'ServiceCard';

// Grouped card — several of one provider's services scheduled back-to-back on
// a single day (shared bookingBatchId). Renders as ONE card with the shared
// date and overall time span in the header, then each service as a row, so a
// cart with a grouped provider reads as one appointment rather than N cards.
interface GroupedServiceCardProps {
  items: CartItem[];
  getBooking: (itemId: string) => ServiceBooking;
  onRemove: (itemId: string) => void;
  /** Opens the chooser for this group — which service (or the whole group). */
  onEditGroup: (items: CartItem[]) => void;
  depositPolicy?: ProviderDepositPolicy;
  conflictedIds: Set<string>;
}

const GroupedServiceCard: React.FC<GroupedServiceCardProps> = memo(
  ({ items, getBooking, onRemove, onEditGroup, depositPolicy, conflictedIds }) => {
    const { theme, palette: P } = useTheme();
    const { showConfirm, DialogHost } = useAppDialog();

    const depositPolicyArg = useMemo((): DepositPolicy | number => {
      if (!depositPolicy) return 20;
      return { type: depositPolicy.depositType, amount: depositPolicy.depositAmount };
    }, [depositPolicy]);

    const priceOf = useCallback((item: CartItem) => {
      const full = getCartItemFullPrice(item);
      return getBooking(item.id).isDepositOnly
        ? BookingService.calculateDeposit(full, depositPolicyArg)
        : full;
    }, [getBooking, depositPolicyArg]);

    const groupTotal = useMemo(
      () => items.reduce((sum, item) => sum + priceOf(item), 0),
      [items, priceOf]
    );

    // A group can mix deposit and pay-in-full services, so the footer needs
    // three reconcilable numbers rather than one ambiguous "total": what the
    // services come to, what's charged now, and what's left for the
    // appointment. Deposits are per-service — the provider sets that on each
    // one — so these are summed per item, not derived from the group total.
    const fullPriceOf = useCallback((item: CartItem) => getCartItemFullPrice(item), []);

    const hasDeposit = useMemo(
      () => items.some(item => getBooking(item.id).isDepositOnly),
      [items, getBooking]
    );

    const groupServiceTotal = useMemo(
      () => items.reduce((sum, item) => sum + fullPriceOf(item), 0),
      [items, fullPriceOf]
    );

    const groupRemaining = useMemo(
      () => items.reduce((sum, item) => (
        getBooking(item.id).isDepositOnly
          ? sum + BookingService.calculateRemainingBalance(fullPriceOf(item), depositPolicyArg)
          : sum
      ), 0),
      [items, getBooking, fullPriceOf, depositPolicyArg]
    );

    // Shared day + the span from the first service's start to the last one's
    // end. Items are already time-ordered by buildRenderUnits.
    const first = items[0]!;
    const firstBooking = getBooking(first.id);
    const startMinutes = to24hMinutes(firstBooking.selectedTime);
    const last = items[items.length - 1]!;
    const lastBooking = getBooking(last.id);
    const endMinutes = to24hMinutes(lastBooking.selectedTime) + durationToMinutes(last.duration);
    const isScheduled = Boolean(firstBooking.selectedDate && firstBooking.selectedTime);
    const spanKnown = isScheduled && startMinutes !== Number.MAX_SAFE_INTEGER && endMinutes > startMinutes;
    const hasConflict = items.some(i => conflictedIds.has(i.id));

    const handleRemoveOne = useCallback((item: CartItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      showConfirm(
        'Remove Service',
        `Remove ${item.serviceName} from this appointment?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onRemove(item.id);
            },
          },
        ]
      );
    }, [onRemove, showConfirm]);

    return (
      <View style={[
        styles.serviceCard,
        styles.serviceCardShadow,
        { backgroundColor: P.surface, borderColor: hasConflict ? '#F44336' : P.border, borderWidth: hasConflict ? 1.5 : StyleSheet.hairlineWidth },
      ]}>
        {hasConflict && (
          <View style={styles.conflictBanner}>
            <Ionicons name="alert-circle" size={14} color="#F44336" />
            <Text style={styles.conflictBannerText}>
              This time is no longer available — pick a new time
            </Text>
          </View>
        )}

        {/* Shared header: a filled badge (not a bare icon) so a group card is
            obviously different from a single one at a glance, plus this
            card's Edit — which opens the chooser rather than editing
            straight through. */}
        <View style={styles.groupHeader}>
          <View style={[styles.groupBadge, { backgroundColor: P.accent }]}>
            <Ionicons name="link" size={11} color={P.onAccent} />
            <Text style={[styles.groupBadgeText, { color: P.onAccent }]}>
              GROUP BOOKING · {items.length}
            </Text>
          </View>
          <View style={styles.groupHeaderSpacer} />
          <TouchableOpacity
            style={[styles.itemEditButton, { borderColor: P.accent }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onEditGroup(items);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={12} color={P.accentText} />
            <Text style={[styles.itemEditButtonText, { color: P.accentText }]}>Edit</Text>
          </TouchableOpacity>
        </View>
        <Text
          style={[styles.groupHeaderDate, { color: theme.text }, !isScheduled && styles.dateTextWarning]}
          numberOfLines={2}
        >
          {isScheduled ? formatLongDateNoYear(firstBooking.selectedDate) : 'Unscheduled'}
        </Text>
        {spanKnown && (
          <Text style={[styles.groupHeaderSpan, { color: theme.secondaryText }]}>
            {formatTimeSpan(startMinutes, endMinutes)}
          </Text>
        )}

        {/* One row per service — no per-row date, the header owns it */}
        <View style={styles.groupRows}>
          {items.map(item => {
            const b = getBooking(item.id);
            return (
              <View key={item.id} style={[styles.groupRow, { borderTopColor: P.border }]}>
                <View style={styles.groupRowInfo}>
                  <Text style={[styles.groupRowName, { color: theme.text }]} numberOfLines={1}>
                    {item.serviceName}
                    {b.isDepositOnly ? ' (Deposit)' : ''}
                  </Text>
                  <Text style={[styles.groupRowMeta, { color: theme.secondaryText }]} numberOfLines={1}>
                    {item.duration}
                  </Text>
                  {/* Same labelled add-on line as the single card, so both
                      card types read consistently. */}
                  {(() => {
                    const list = (item.addOns || []).filter((a: any) => a?.name);
                    if (list.length === 0) return null;
                    const total = list.reduce((s: number, a: any) => s + (Number(a?.price) || 0), 0);
                    return (
                      <Text style={[styles.groupRowAddOns, { color: theme.text }]} numberOfLines={2}>
                        + {list.length} add-on{list.length === 1 ? '' : 's'} (£{total.toFixed(2)}):{' '}
                        {list.map((a: any) => a.name).join(', ')}
                      </Text>
                    );
                  })()}
                  {b.isDepositOnly && (
                    // Deposit is set per service by the provider, so name this
                    // row's own deposit and remainder against its own full
                    // price — the price on the right is only the deposit.
                    <Text style={[styles.groupRowDeposit, { color: theme.secondaryText }]}>
                      £{fullPriceOf(item).toFixed(2)} service · £{priceOf(item).toFixed(2)} deposit · £
                      {BookingService.calculateRemainingBalance(fullPriceOf(item), depositPolicyArg).toFixed(2)} at appointment
                    </Text>
                  )}
                </View>
                <Text style={[styles.groupRowPrice, { color: P.accentText }]}>
                  £{priceOf(item).toFixed(2)}
                </Text>
                <TouchableOpacity
                  style={styles.groupRowRemove}
                  onPress={() => handleRemoveOne(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeText}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Group footer — on a deposit group the service total and remainder
            sit above the amount actually charged now, so all three
            reconcile; otherwise it stays a single total. */}
        <View style={[styles.groupFooter, { borderTopColor: P.border }]}>
          {hasDeposit ? (
            <View style={styles.groupFooterBreakdown}>
              <View style={styles.groupFooterRow}>
                <Text style={[styles.groupFooterLabel, { color: theme.secondaryText }]}>
                  {items.length} services
                </Text>
                <Text style={[styles.groupFooterLabel, { color: theme.secondaryText }]}>
                  £{groupServiceTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.groupFooterRow}>
                <Text style={[styles.groupFooterLabel, { color: theme.secondaryText }]}>
                  Remaining at appointment
                </Text>
                <Text style={[styles.groupFooterLabel, { color: theme.secondaryText }]}>
                  £{groupRemaining.toFixed(2)}
                </Text>
              </View>
              <View style={styles.groupFooterRow}>
                <Text style={[styles.groupFooterTotalLabel, { color: theme.text }]}>Deposit due now</Text>
                <Text style={[styles.groupFooterValue, { color: P.accentText }]}>
                  £{groupTotal.toFixed(2)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.groupFooterRow}>
              <Text style={[styles.groupFooterLabel, { color: theme.secondaryText }]}>
                {items.length} services
              </Text>
              <Text style={[styles.groupFooterValue, { color: P.accentText }]}>
                £{groupTotal.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
        <DialogHost />
      </View>
    );
  }
);

GroupedServiceCard.displayName = 'GroupedServiceCard';

// Main Cart Screen Component
const CartScreen: React.FC<CartScreenProps<'CartMain'>> = ({ navigation }) => {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  // A SECOND host, rendered inside the "Confirm Your Details" <Modal> rather
  // than beside it. The screen-level DialogHost above is a sibling of that
  // modal, and iOS won't present a modal from a sibling subtree while another
  // is already up — so the validation alerts below raised from there were
  // never visible, and tapping Continue with a blank name did nothing at all.
  // Same nesting the payment sheet uses for its own in-modal alerts.
  const { showAlert: showReviewAlert, DialogHost: ReviewDialogHost } = useAppDialog();
  const insets = useSafeAreaInsets();

  const {
    items,
    totalItems,
    removeFromCart,
    updateCartItem,
    clearCart,
    getItemsByProvider,
    getBookingSummary,
  } = useCart();

  const { createBookingsFromCart, holdCartCheckoutSlots, releaseCartCheckoutSlots } = useBooking();
  const { user, updateUser } = useAuth();

  // State management
  const [providerDepositPolicies, setProviderDepositPolicies] = useState<Record<string, ProviderDepositPolicy>>({});
  // BookingSheet in edit mode — opened per cart item via ServiceCard's Edit button
  const [showBookingSheet, setShowBookingSheet] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  // Non-null while the "which service?" chooser is up, holding the candidate
  // items for one provider. Only ever set for providers with >1 service.
  const [pickerItems, setPickerItems] = useState<CartItem[] | null>(null);
  // Non-null while the group date/time picker is up, holding the group's items
  // in running order. The calendar itself owns date AND time selection here —
  // it's fed a chain-fit resolver (see groupSlotResolver) so the times it
  // offers are starts where every service still fits back-to-back.
  const [groupRescheduleItems, setGroupRescheduleItems] = useState<CartItem[] | null>(null);
  const [groupRescheduleDate, setGroupRescheduleDate] = useState<string>('');
  const [groupRescheduleTime, setGroupRescheduleTime] = useState<string>('');
  // Chains for the picked day, keyed by their start time, so the time the
  // client taps in the calendar resolves back to a full per-service schedule.
  const groupChainsByStart = useRef<Map<string, BackToBackSlot[]>>(new Map());
  // Providers whose section is collapsed to just its header. Collapsed-by-key
  // rather than expanded-by-key so a newly added provider defaults to open.
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);
  const [paymentTotal, setPaymentTotal] = useState(0); // ADD THIS

  // An RN Modal renders in a native overlay above whatever screen is
  // focused — it isn't scoped to "Cart is the visible screen," just to this
  // boolean being true. If a push notification is tapped while the success
  // modal is open, React Navigation moves focus elsewhere but this state
  // never resets, so the modal keeps rendering on top of the new screen.
  // Dismiss on blur so leaving Cart (for any reason) always closes it.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setShowPaymentSuccessModal(false);
    });
    return unsubscribe;
  }, [navigation]);

  const [checkoutSnapshot, setCheckoutSnapshot] = useState<{
  items: CartItem[];
  bookings: Record<string, ServiceBooking>;
}>({ items: [], bookings: {} });
  // The review list is built from the same render units the cart itself uses:
  // services sharing a bookingBatchId collapse into ONE group block with a
  // shared header and subtotal, rather than repeating a "group booking" tag
  // under every member of the batch. A batch of one isn't a group — same rule
  // buildRenderUnits/MultiBookingSheet apply.
  const checkoutRenderUnits = useMemo((): CartRenderUnit[] => {
    const batchCounts = new Map<string, number>();
    checkoutSnapshot.items.forEach(i => {
      if (!i.bookingBatchId) return;
      batchCounts.set(i.bookingBatchId, (batchCounts.get(i.bookingBatchId) ?? 0) + 1);
    });

    const units: CartRenderUnit[] = [];
    const emittedBatches = new Set<string>();
    checkoutSnapshot.items.forEach(item => {
      const batchId = item.bookingBatchId;
      if (!batchId || (batchCounts.get(batchId) ?? 0) < 2) {
        units.push({ kind: 'single', item });
        return;
      }
      if (emittedBatches.has(batchId)) return;
      emittedBatches.add(batchId);
      // Ordered by start time so the block reads as the actual running order.
      // Reads times from the frozen snapshot, not live cart state, since the
      // snapshot is what's actually being paid for.
      const members = checkoutSnapshot.items
        .filter(i => i.bookingBatchId === batchId)
        .sort((a, b) => to24hMinutes(checkoutSnapshot.bookings[a.id]?.selectedTime)
          - to24hMinutes(checkoutSnapshot.bookings[b.id]?.selectedTime));
      units.push({ kind: 'group', batchId, items: members });
    });
    return units;
  }, [checkoutSnapshot]);

  // One appointment block in the checkout summary — a plain service, or a
  // whole back-to-back group batch collapsed into a single bordered block.
  // Extracted from the summary's JSX so the same renderer can be used under
  // each provider heading (see checkoutProviderSections).
  const renderCheckoutUnit = useCallback((unit: CartRenderUnit, prevUnit: CartRenderUnit | undefined) => {
    // Price for one snapshot item, using the provider's actual
    // deposit policy (percent OR flat £) — never the 20%
    // fallback, which silently ignores fixed-fee policies.
    const priceOf = (item: CartItem) => {
      const booking = (checkoutSnapshot.bookings[item.id] || {}) as ServiceBooking;
      const full = getCartItemFullPrice(item);
      if (!booking.isDepositOnly) return full;
      const policy = providerDepositPolicies[item.providerDisplayName ?? item.providerName];
      const policyArg: DepositPolicy | number = policy
        ? { type: policy.depositType, amount: policy.depositAmount }
        : 20;
      return BookingService.calculateDeposit(full, policyArg);
    };
    // Add-ons are named and priced here too — this is the last
    // screen before paying, so it must account for the number
    // being charged.
    const renderAddOns = (item: CartItem) => {
      const list = (item.addOns || []).filter((a: any) => a?.name);
      if (list.length === 0) return null;
      const total = list.reduce((s: number, a: any) => s + (Number(a?.price) || 0), 0);
      return (
        <Text style={[styles.summaryItemAddOns, { color: P.text }]} numberOfLines={2}>
          + {list.length} add-on{list.length === 1 ? '' : 's'} (£{total.toFixed(2)}):{' '}
          {list.map((a: any) => a.name).join(', ')}
        </Text>
      );
    };

    // Divider only between two plain items. A group draws its
    // own bordered box, so a divider directly above or below
    // one reads as a doubled line. `prevUnit` is the previous
    // unit within this provider's section, not the flat list —
    // the first item under a provider heading never wants one.
    const divider = prevUnit?.kind === 'single'
      ? <View style={[styles.summaryDivider, { backgroundColor: P.sep }]} />
      : null;

    // A group renders as ONE block: shared provider/date/span
    // header, its services as indented rows, and a subtotal —
    // so it reads as a single appointment rather than N
    // unrelated bookings each carrying a repeated group tag.
    if (unit.kind === 'group') {
      const first = unit.items[0]!;
      const firstBooking = (checkoutSnapshot.bookings[first.id] || {}) as ServiceBooking;
      const last = unit.items[unit.items.length - 1]!;
      const lastBooking = (checkoutSnapshot.bookings[last.id] || {}) as ServiceBooking;
      const startMinutes = to24hMinutes(firstBooking.selectedTime);
      const endMinutes = to24hMinutes(lastBooking.selectedTime) + durationToMinutes(last.duration);
      const spanKnown = !!firstBooking.selectedDate
        && startMinutes !== Number.MAX_SAFE_INTEGER
        && endMinutes > startMinutes;
      const groupTotal = unit.items.reduce((sum, i) => sum + priceOf(i), 0);

      return (
        // No divider above a group — its own border already
        // separates it from whatever precedes it, and both
        // together reads as a doubled line.
        <View
          key={unit.batchId}
          style={[styles.summaryGroupBlock, { borderColor: P.accent, backgroundColor: P.accentDim }]}
        >
          <View style={[styles.summaryGroupBadge, { backgroundColor: P.accent }]}>
            <Ionicons name="link" size={10} color={P.onAccent} />
            <Text style={[styles.summaryGroupBadgeText, { color: P.onAccent }]}>
              GROUP BOOKING · {unit.items.length}
            </Text>
          </View>
          {/* No provider line here any more — the section heading this block
              sits under already names them (checkoutProviderSections). */}
          {!!firstBooking.selectedDate && (
            <Text style={[styles.summaryItemDateTime, { color: P.sub }]}>
              {formatLongDateNoYear(firstBooking.selectedDate)}
              {spanKnown ? ` · ${formatTimeSpan(startMinutes, endMinutes)}` : ''}
            </Text>
          )}

          {/* One row per service — no per-row date or
              provider, the header owns both. */}
          <View style={styles.summaryGroupRows}>
            {unit.items.map(groupItem => {
              const gb = (checkoutSnapshot.bookings[groupItem.id] || {}) as ServiceBooking;
              return (
                <View key={groupItem.id} style={styles.summaryGroupRow}>
                  <View style={styles.summaryItemRow}>
                    <Text style={[styles.summaryItemService, { color: P.text }]} numberOfLines={1}>
                      {groupItem.serviceName}{gb.isDepositOnly ? ' (Dep.)' : ''}
                    </Text>
                    <Text style={[styles.summaryItemPrice, { color: P.accentText }]}>
                      £{priceOf(groupItem).toFixed(2)}
                    </Text>
                  </View>
                  {!!gb.selectedTime && (
                    <Text style={[styles.summaryItemDateTime, { color: P.sub }]}>
                      {formatTime12(gb.selectedTime)} · {groupItem.duration}
                    </Text>
                  )}
                  {renderAddOns(groupItem)}
                </View>
              );
            })}
          </View>

          <View style={[styles.summaryGroupFooter, { borderTopColor: P.sep }]}>
            <Text style={[styles.summaryGroupFooterLabel, { color: P.sub }]}>
              {unit.items.length} services back-to-back
            </Text>
            <Text style={[styles.summaryGroupFooterValue, { color: P.accentText }]}>
              £{groupTotal.toFixed(2)}
            </Text>
          </View>
        </View>
      );
    }

    const item = unit.item;
    const b = (checkoutSnapshot.bookings[item.id] || {}) as ServiceBooking;
    return (
      <View key={item.id}>
        {divider}
        <View style={styles.summaryBookingItem}>
          <View style={styles.summaryItemRow}>
            <Text style={[styles.summaryItemService, { color: P.text }]} numberOfLines={1}>
              {item.serviceName}{b.isDepositOnly ? ' (Dep.)' : ''}
            </Text>
            <Text style={[styles.summaryItemPrice, { color: P.accentText }]}>
              £{priceOf(item).toFixed(2)}
            </Text>
          </View>
          {renderAddOns(item)}
          {b.selectedDate && b.selectedTime && (
            <Text style={[styles.summaryItemDateTime, { color: P.sub }]}>
              {formatLongDateNoYear(b.selectedDate)} · {formatTime12(b.selectedTime)}
            </Text>
          )}
        </View>
      </View>
    );
  }, [checkoutSnapshot, providerDepositPolicies, P]);

  // The checkout summary lists appointments grouped by provider. This is a
  // presentation grouping only — unrelated to a GROUP BOOKING (a
  // bookingBatchId batch of services booked back-to-back in one sitting,
  // which stays its own bordered block inside whichever provider owns it).
  // Providers appear in the order their first appointment appears in the
  // cart, so the summary reads in the same order the cart above it did.
  const checkoutProviderSections = useMemo(() => {
    const priceOfItem = (item: CartItem) => {
      const booking = (checkoutSnapshot.bookings[item.id] || {}) as ServiceBooking;
      const full = getCartItemFullPrice(item);
      if (!booking.isDepositOnly) return full;
      const policy = providerDepositPolicies[item.providerDisplayName ?? item.providerName];
      const policyArg: DepositPolicy | number = policy
        ? { type: policy.depositType, amount: policy.depositAmount }
        : 20;
      return BookingService.calculateDeposit(full, policyArg);
    };

    const sections = new Map<string, {
      providerKey: string;
      providerLabel: string;
      units: CartRenderUnit[];
      appointmentCount: number;
      total: number;
    }>();

    checkoutRenderUnits.forEach(unit => {
      const first = unit.kind === 'group' ? unit.items[0]! : unit.item;
      // providerName is the stable cart key; providerDisplayName is what the
      // client actually calls them. Group on the key, label with the name —
      // the same split the cart's own provider sections use.
      const key = first.providerName ?? first.providerDisplayName ?? '';
      const label = first.providerDisplayName ?? first.providerName ?? '';
      const members = unit.kind === 'group' ? unit.items : [unit.item];
      const existing = sections.get(key);
      const subtotal = members.reduce((sum, item) => sum + priceOfItem(item), 0);
      if (existing) {
        existing.units.push(unit);
        existing.appointmentCount += members.length;
        existing.total += subtotal;
      } else {
        sections.set(key, {
          providerKey: key,
          providerLabel: label,
          units: [unit],
          appointmentCount: members.length,
          total: subtotal,
        });
      }
    });

    return [...sections.values()];
  }, [checkoutRenderUnits, checkoutSnapshot, providerDepositPolicies]);
  // Correlation id for the on_hold rows reserved when the user commits to
  // payment (see holdCartBookingSlots below) — threaded through to
  // handlePaymentSuccess so createBookingsFromCart can claim the same
  // batch instead of inserting fresh rows. Null whenever no hold is
  // currently outstanding (not yet created, already claimed, or released).
  const [holdBatchId, setHoldBatchId] = useState<string | null>(null);
  // Secure Stripe checkout owns a separate server batch. Kept distinct from
  // the legacy hold batch while the mock checkout remains available in Expo
  // Go and during the staged release.
  const [serverCheckoutBatchId, setServerCheckoutBatchId] = useState<string | null>(null);
  // True only while the "Confirm & Pay" tap's holdCartCheckoutSlots call is
  // in flight — guards against a double-tap firing two hold batches for
  // the same cart.
  const [isReservingSlots, setIsReservingSlots] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Cart item ids that failed to book on the last checkout attempt (e.g.
  // "time slot no longer available") — flagged with a banner on their
  // ServiceCard so the client can see which item needs a new time, instead
  // of just reading a one-off alert and having no visible next step. Cleared
  // whenever the item is edited/removed or a new checkout attempt starts.
  const [conflictedItemIds, setConflictedItemIds] = useState<Set<string>>(new Set());

  // Customer details review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewEmail, setReviewEmail] = useState('');
  const [reviewPhone, setReviewPhone] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  // Service-level patch-test/pregnancy-safety flags for whatever's in the
  // checkout snapshot — folded into the single Terms checkbox above rather
  // than a separate one (see supabase/migrations/
  // 20260817085443_safety_acknowledgement_checkout.sql, which
  // prepare_checkout enforces server-side regardless of this UI state).
  const [safetyFlagsByServiceId, setSafetyFlagsByServiceId] = useState<
    Map<string, { patchTestRequired: boolean; isPregnancySafe: boolean }>
  >(new Map());
  const [confirmedCustomerInfo, setConfirmedCustomerInfo] = useState<{
    name: string; email: string; phone: string;
  } | null>(null);
  const [showBookingSummaryModal, setShowBookingSummaryModal] = useState(false);
  // Below this many appointments the summary stays a centred card; at or
  // above it, it takes the whole screen. See the <Modal> below.
  const useFullScreenSummary = checkoutSnapshot.items.length >= FULL_SCREEN_SUMMARY_THRESHOLD;
  // Summary → back to the customer-details review step. Shared by the
  // header chevron, the Back button and the Android hardware back gesture,
  // so all three land in the same place.
  const backFromSummary = useCallback(() => {
    setShowBookingSummaryModal(false);
    setShowReviewModal(true);
  }, []);
  const [hasMobileProvider, setHasMobileProvider] = useState(false);
  const [clientAddress, setClientAddress] = useState('');

  // Memoize expensive calculations properly
  const itemsByProvider = useMemo(() => {
    try {
      return getItemsByProvider();
    } catch (error) {
      logger.error('Error getting items by provider:', error);
      return {};
    }
  }, [getItemsByProvider]);

  const bookingSummary = useMemo(() => {
    try {
      return getBookingSummary();
    } catch (error) {
      logger.error('Error getting booking summary:', error);
      return {
        totalProviders: 0,
        totalServices: 0,
        totalInstances: 0,
        providers: {},
      };
    }
  }, [getBookingSummary]);

  // Collapse behaviour has two jobs, both so the cart opens as a scannable
  // list of provider headers rather than a wall of cards:
  //
  //   1. On entry, every section starts collapsed — whatever was already in
  //      the cart is summarised by its header, not expanded.
  //   2. When a booking is added, every *other* section collapses and only
  //      the section that received it is left open, so the new booking is
  //      what's actually visible with space around it.
  //
  // Tracked by item id (not just provider key) so adding a second service to
  // a provider already in the cart counts as an add too, not only a
  // brand-new provider.
  const knownItemIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const providerKeys = Object.keys(itemsByProvider);
    const currentItemIds = new Set(items.map(i => i.id));

    // First run for this mount: collapse everything that's already here.
    if (knownItemIdsRef.current === null) {
      knownItemIdsRef.current = currentItemIds;
      if (providerKeys.length > 0) setCollapsedProviders(new Set(providerKeys));
      return;
    }

    const previousItemIds = knownItemIdsRef.current;
    knownItemIdsRef.current = currentItemIds;

    // Which providers gained an item since last time? (Removals don't
    // re-collapse anything — you're still working in that section.)
    const providersWithNewItems = new Set(
      items
        .filter(i => !previousItemIds.has(i.id))
        // Same fallback CartContext's itemsByProvider grouping uses, so an
        // item with no provider name still maps onto its rendered section.
        .map(i => i.providerName || 'Unknown Provider'),
    );
    if (providersWithNewItems.size === 0) return;

    // Collapse every section except the one(s) that just received an item.
    setCollapsedProviders(
      new Set(providerKeys.filter(k => !providersWithNewItems.has(k))),
    );
  }, [items, itemsByProvider]);

  // Fetch deposit policies for all providers in the cart whenever items change
  useEffect(() => {
    if (items.length === 0) { setProviderDepositPolicies({}); return; }
    const names = [...new Set(items.map(i => i.providerDisplayName ?? i.providerName))];
    getProviderDepositPoliciesByDisplayNames(names)
      .then(policies => setProviderDepositPolicies(policies))
      .catch(() => {}); // silently fall back to default 20% on error
  }, [items]);

  // ── Promo codes ────────────────────────────────────────────────────────────
  // No manual entry in the cart — a code only lands here carried over via
  // CartItem.initialPromoCode (set on the provider profile's "Book Now" for
  // a promotion) and auto-applied below. One code per provider, applying
  // across every service from that provider in the cart. Keyed by the same
  // provider grouping key itemsByProvider uses (item.providerName), so it
  // stays aligned with how the cart is already sectioned.
  const [appliedPromos, setAppliedPromos] = useState<Record<string, DbPromotion>>({});

  const handleApplyPromoToProvider = useCallback(async (providerKey: string, code: string): Promise<string | null> => {
    const providerItems = itemsByProvider[providerKey];
    if (!providerItems || providerItems.length === 0) return 'Could not find that provider in your cart.';
    const trimmed = code.trim();
    if (!trimmed) return 'Enter a code first.';
    try {
      const providerDisplayName = providerItems[0]?.providerDisplayName ?? providerKey;
      const promo = await validatePromoCode(providerDisplayName, trimmed);
      if (!promo) return 'This code isn’t valid for this provider.';
      setAppliedPromos(prev => ({ ...prev, [providerKey]: promo }));
      return null;
    } catch {
      return 'Could not check that code — please try again.';
    }
  }, [itemsByProvider]);

  // Drop applied promos for providers no longer represented in the cart
  useEffect(() => {
    const providersInCart = new Set(items.map(i => i.providerName));
    setAppliedPromos(prev => {
      const stale = Object.keys(prev).filter(p => !providersInCart.has(p));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const p of stale) delete next[p];
      return next;
    });
  }, [items]);

  // Auto-apply the offer code an item was added with (e.g. via a promotion's
  // "Book Now" button), so tapping that button actually gets the discount
  // instead of silently landing at full price. Re-validates through the same
  // path as manual entry — one attempt per provider, and it backs off if the
  // client removes it, rather than reapplying every render.
  const autoAppliedPromoProviders = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) {
      if (!item.initialPromoCode) continue;
      if (autoAppliedPromoProviders.current.has(item.providerName)) continue;
      autoAppliedPromoProviders.current.add(item.providerName);
      handleApplyPromoToProvider(item.providerName, item.initialPromoCode).catch(() => {});
    }
  }, [items, handleApplyPromoToProvider]);

  // One batched query for every service in the review snapshot, not a
  // per-item fetch — drives the safety-acknowledgement line folded into the
  // Terms checkbox below.
  useEffect(() => {
    const ids = checkoutSnapshot.items.map(i => i.serviceId).filter(Boolean);
    if (ids.length === 0) { setSafetyFlagsByServiceId(new Map()); return; }
    let cancelled = false;
    getServiceSafetyFlags(ids)
      .then(map => { if (!cancelled) setSafetyFlagsByServiceId(map); })
      .catch(() => { if (!cancelled) setSafetyFlagsByServiceId(new Map()); });
    return () => { cancelled = true; };
  }, [checkoutSnapshot.items]);

  // Absolute £ discount per cart item (off base+add-ons, capped at the base
  // price). A provider-wide code can still be restricted to specific
  // services or a category — items outside that scope get no discount even
  // though the code is "applied" for the rest of that provider's items.
  const itemPromoDiscounts = useMemo((): Record<string, number> => {
    const discounts: Record<string, number> = {};
    for (const item of items) {
      const promo = appliedPromos[item.providerName];
      if (!promo) continue;
      if (promo.service_ids && promo.service_ids.length > 0 && !promo.service_ids.includes(item.serviceId)) continue;
      if (promo.service_category &&
          promo.service_category.toUpperCase() !== (item.providerService ?? '').toUpperCase()) continue;
      const itemTotal = getCartItemFullPrice(item);
      let off = 0;
      if (promo.discount_percent && promo.discount_percent > 0) {
        off = (itemTotal * promo.discount_percent) / 100;
      } else if (promo.discount_amount && promo.discount_amount > 0) {
        off = promo.discount_amount;
      }
      // discount_text-only promos carry no redeemable value at checkout
      discounts[item.id] = Math.min(off, Number(item.price) || 0);
    }
    return discounts;
  }, [appliedPromos, items]);

  // Read-model derived straight from each CartItem — scheduling, notes, and
  // payment choice all live on the item now (set on the provider profile, or
  // changed later via BookingSheet's edit mode + updateCartItem), so this
  // screen has nothing writable of its own to keep in sync.
  const bookingsByItemId = useMemo((): Record<string, ServiceBooking> => {
    const map: Record<string, ServiceBooking> = {};
    items.forEach(item => {
      map[item.id] = {
        selectedDate: item.selectedDate ?? '',
        selectedTime: item.selectedTime ?? '',
        notes: item.notes ?? '',
        isDepositOnly: item.isDepositOnly ?? false,
      };
    });
    return map;
  }, [items]);

  const getServiceBooking = useCallback(
    (itemId: string): ServiceBooking =>
      bookingsByItemId[itemId] ?? { selectedDate: '', selectedTime: '', notes: '', isDepositOnly: false },
    [bookingsByItemId]
  );

  // Compute effective total considering per-service deposits - FIXED NESTED HOOK
  const effectiveTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = getServiceBooking(item.id);
      // Promo discount comes off before any deposit is calculated
      const itemTotalPrice = getCartItemFullPrice(item) - (itemPromoDiscounts[item.id] ?? 0);
      let effectiveItemPrice: number;
      if (booking.isDepositOnly) {
        const provName = item.providerDisplayName ?? item.providerName;
        const pol = providerDepositPolicies[provName];
        const policyArg: DepositPolicy | number = pol
          ? { type: pol.depositType, amount: pol.depositAmount }
          : 20;
        effectiveItemPrice = BookingService.calculateDeposit(itemTotalPrice, policyArg);
      } else {
        effectiveItemPrice = itemTotalPrice;
      }
      return sum + effectiveItemPrice;
    }, 0);
  }, [items, getServiceBooking, providerDepositPolicies, itemPromoDiscounts]);

  // The fee is separate from provider money: tiered for a full-payment
  // checkout, or £0.99 for an all-deposit checkout.
  const platformFee = useMemo(() => {
    const fullPaymentSubtotal = items.reduce((sum, item) => {
      if (getServiceBooking(item.id).isDepositOnly) return sum;
      return sum + Math.max(0, getCartItemFullPrice(item) - (itemPromoDiscounts[item.id] ?? 0));
    }, 0);
    const isDepositOnlyCheckout = items.length > 0 && items.every(item => getServiceBooking(item.id).isDepositOnly);
    return calculatePlatformFee(fullPaymentSubtotal, isDepositOnlyCheckout);
  }, [items, getServiceBooking, itemPromoDiscounts]);

  const effectiveFinalTotal = useMemo(
    () => effectiveTotal + platformFee,
    [effectiveTotal, platformFee]
  );

  // Same as effectiveTotal but WITHOUT promo discounts — used so the summary
  // reads Subtotal − Promo + Fee = Total exactly, even for deposit-only items
  // (where a promo only reduces the deposit proportionally).
  const effectiveTotalNoPromo = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = getServiceBooking(item.id);
      const itemTotalPrice = getCartItemFullPrice(item);
      if (booking.isDepositOnly) {
        const provName = item.providerDisplayName ?? item.providerName;
        const pol = providerDepositPolicies[provName];
        const policyArg: DepositPolicy | number = pol
          ? { type: pol.depositType, amount: pol.depositAmount }
          : 20;
        return sum + BookingService.calculateDeposit(itemTotalPrice, policyArg);
      }
      return sum + itemTotalPrice;
    }, 0);
  }, [items, getServiceBooking, providerDepositPolicies]);

  const promoSavingsShown = useMemo(
    () => Math.max(0, effectiveTotalNoPromo - effectiveTotal),
    [effectiveTotalNoPromo, effectiveTotal]
  );

  // Splits one provider's items into render units: services sharing a
  // bookingBatchId (scheduled together, so they run back-to-back on one day)
  // collapse into a single grouped card; everything else stays its own card.
  // A batch that's down to one surviving item is no longer a group — same
  // rule MultiBookingSheet applies when it decides whether to mint an id at
  // all — so it renders as a plain single card.
  const buildRenderUnits = useCallback((providerItems: CartItem[]): CartRenderUnit[] => {
    const batchCounts = new Map<string, number>();
    providerItems.forEach(item => {
      if (!item.bookingBatchId) return;
      batchCounts.set(item.bookingBatchId, (batchCounts.get(item.bookingBatchId) ?? 0) + 1);
    });

    const units: CartRenderUnit[] = [];
    const emittedBatches = new Set<string>();
    providerItems.forEach(item => {
      const batchId = item.bookingBatchId;
      if (!batchId || (batchCounts.get(batchId) ?? 0) < 2) {
        units.push({ kind: 'single', item });
        return;
      }
      if (emittedBatches.has(batchId)) return;
      emittedBatches.add(batchId);
      // Ordered by start time so the card reads as the actual running order.
      const members = providerItems
        .filter(i => i.bookingBatchId === batchId)
        .sort((a, b) => {
          const ta = getServiceBooking(a.id).selectedTime;
          const tb = getServiceBooking(b.id).selectedTime;
          return to24hMinutes(ta) - to24hMinutes(tb);
        });
      units.push({ kind: 'group', batchId, items: members });
    });
    return units;
  }, [getServiceBooking]);

  // Compute effective cart items for payment modal
  const effectiveCartItems = useMemo(() => {
    return items.map(item => {
      const booking = getServiceBooking(item.id);
      const itemTotalPrice = getCartItemFullPrice(item) - (itemPromoDiscounts[item.id] ?? 0);
      let effectivePrice: number;
      if (booking.isDepositOnly) {
        const provName = item.providerDisplayName ?? item.providerName;
        const pol = providerDepositPolicies[provName];
        const policyArg: DepositPolicy | number = pol
          ? { type: pol.depositType, amount: pol.depositAmount }
          : 20;
        effectivePrice = BookingService.calculateDeposit(itemTotalPrice, policyArg);
      } else {
        effectivePrice = itemTotalPrice;
      }
      return { item, effectivePrice, isDeposit: !!booking.isDepositOnly };
    });
  }, [items, getServiceBooking, providerDepositPolicies, itemPromoDiscounts]);

  const handleEditItem = useCallback((item: CartItem) => {
    setEditingItem(item);
    setShowBookingSheet(true);
    // Editing is how the client acts on a conflict flag — clear it so the
    // banner doesn't linger once they've picked a new time.
    setConflictedItemIds(prev => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }, []);

  // Picking a single service out of the chooser. If that service is currently
  // part of a group, editing it means it no longer runs back-to-back with the
  // rest — so it leaves the group (bookingBatchId cleared) and becomes its own
  // booking. Warn first, since the client arranged that grouping deliberately.
  const handlePickerSelect = useCallback(
    (item: CartItem) => {
      const batchId = item.bookingBatchId;
      const siblings = batchId
        ? items.filter(i => i.bookingBatchId === batchId && i.id !== item.id)
        : [];

      if (siblings.length === 0) {
        setPickerItems(null);
        handleEditItem(item);
        return;
      }

      setPickerItems(null);
      showConfirm(
        'Split this out?',
        `${item.serviceName} will become its own appointment and may no longer run back-to-back with your other service${siblings.length > 1 ? 's' : ''}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              updateCartItem(item.id, { bookingBatchId: undefined });
              // A group of one isn't a group (same rule MultiBookingSheet
              // applies) — release the last remaining sibling too, so it
              // doesn't render as a one-item "Booked together" card or
              // produce a single-member group_booking_id at checkout.
              if (siblings.length === 1) {
                updateCartItem(siblings[0]!.id, { bookingBatchId: undefined });
              }
              handleEditItem(item);
            },
          },
        ]
      );
    },
    [items, handleEditItem, showConfirm, updateCartItem]
  );

  // "Reschedule all to a new day" from the chooser — opens the group date/time
  // picker rather than silently assigning the next day that happens to fit.
  // The client chose to move this group, so they pick WHERE it moves to; the
  // old behaviour auto-committed a date they never saw until the confirm.
  const handlePickerSelectGroup = useCallback(
    (groupItems: CartItem[]) => {
      setPickerItems(null);
      setGroupRescheduleItems(groupItems);
      setGroupRescheduleDate('');
      setGroupRescheduleTime('');
      groupChainsByStart.current = new Map();
    },
    []
  );

  // What counts as a bookable time for this group: a start where the WHOLE
  // chain fits back-to-back, not where the first service alone fits. Handed to
  // the calendar so its day pills and its time row both use this rule — the
  // calendar's default single-service lookup would offer times the group can't
  // actually take. Each day's chains are cached by start time so tapping a
  // time resolves straight back to its full per-service schedule.
  const groupSlotResolver = useCallback(
    async (date: string): Promise<string[]> => {
      const groupItems = groupRescheduleItems;
      if (!groupItems || groupItems.length === 0) return [];
      try {
        const providerKey = groupItems[0]!.providerId ?? groupItems[0]!.providerName;
        const chains = await AvailabilityService.findAllBackToBackSlots(
          providerKey,
          groupItems.map(item => ({ serviceId: item.serviceId, duration: item.duration })),
          date,
        );
        if (!chains) return [];
        chains.forEach(chain => {
          groupChainsByStart.current.set(`${date}|${chain[0]!.time}`, chain);
        });
        return chains.map(chain => chain[0]!.time);
      } catch (error) {
        logger.error('Error resolving group slots:', error);
        return [];
      }
    },
    [groupRescheduleItems]
  );

  // The chain behind the currently picked day+time, or null before both are
  // chosen — also what the preview list and the confirm button read.
  const groupRescheduleChain = useMemo(
    () => (groupRescheduleDate && groupRescheduleTime
      ? groupChainsByStart.current.get(`${groupRescheduleDate}|${groupRescheduleTime}`) ?? null
      : null),
    [groupRescheduleDate, groupRescheduleTime]
  );

  // "2h 45m total" for the picked chain — start of the first service to the
  // end of the last, so it reflects the real appointment length rather than
  // the sum of the services (which would ignore any gaps between them).
  const groupRescheduleSpanLabel = useMemo(() => {
    if (!groupRescheduleChain || groupRescheduleChain.length === 0) return '';
    const startMinutes = to24hMinutes(groupRescheduleChain[0]!.time);
    const endMinutes = to24hMinutes(groupRescheduleChain[groupRescheduleChain.length - 1]!.endTime);
    if (startMinutes === Number.MAX_SAFE_INTEGER || endMinutes <= startMinutes) return '';
    const total = endMinutes - startMinutes;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h > 0 ? `${h}h` : ''}${h > 0 && m > 0 ? ' ' : ''}${m > 0 ? `${m}m` : ''} total`;
  }, [groupRescheduleChain]);

  // Commit the picked chain — every service moves to the new day at its own
  // slot, and the group stays one group (same batch id reused, or minted if
  // these somehow weren't grouped yet).
  const handleConfirmGroupReschedule = useCallback(() => {
    const groupItems = groupRescheduleItems;
    const schedule = groupRescheduleChain;
    if (!groupItems || !schedule || !groupRescheduleDate) return;
    const existingBatchIds = new Set(
      groupItems.map(i => i.bookingBatchId).filter(Boolean) as string[]
    );
    const batchId =
      existingBatchIds.size === 1
        ? [...existingBatchIds][0]!
        : `cart-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    groupItems.forEach((item, i) => {
      updateCartItem(item.id, {
        selectedDate: groupRescheduleDate,
        selectedTime: schedule[i]!.time,
        bookingBatchId: batchId,
      });
    });
    setGroupRescheduleItems(null);
  }, [groupRescheduleItems, groupRescheduleChain, groupRescheduleDate, updateCartItem]);

  const toggleProviderCollapsed = useCallback((providerName: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerName)) next.delete(providerName);
      else next.add(providerName);
      return next;
    });
  }, []);

  const handleBookingSheetEditSubmit = useCallback(
    (result: BookingSheetResult) => {
      if (!editingItem) return;
      try {
        updateCartItem(editingItem.id, {
          addOns: result.selectedAddOns,
          selectedDate: result.date,
          selectedTime: result.time,
          notes: result.notes,
          isDepositOnly: result.isDepositOnly,
          ...(result.policyAcceptedAt ? { policyAcceptedAt: result.policyAcceptedAt } : {}),
          ...(result.policySnapshot ? { policySnapshot: result.policySnapshot } : {}),
        });
      } catch (error) {
        logger.error('Error saving booking edit:', error);
        showAlert("Couldn't save your changes", 'Please try again.');
      }
    },
    [editingItem, updateCartItem, showAlert]
  );

  // Detect if any provider in the cart is mobile (travels to client)
  useEffect(() => {
    if (items.length === 0) { setHasMobileProvider(false); return; }
    const names = [...new Set(items.map(i => i.providerDisplayName ?? i.providerName))];
    getMobileProviderDisplayNames(names)
      .then(mobileSet => setHasMobileProvider(mobileSet.size > 0))
      .catch(() => setHasMobileProvider(false));
  }, [items]);

  // Navigation handlers - BACK TO HOME
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshing(false);
  }, []);

  const handleContinueShopping = useCallback(() => {
    navigation.getParent()?.navigate('Home');
  }, [navigation]);

  const handleClearCart = useCallback(() => {
    showConfirm('Clear Cart', 'Remove all items from cart?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          try {
            clearCart();
            setError(null);
          } catch (error) {
            logger.error('Error clearing cart:', error);
            setError('Failed to clear cart');
          }
        },
      },
    ]);
  }, [clearCart, showConfirm]);

  // Enhanced checkout with payment modal integration - USE EFFECTIVE TOTAL
  const handleCheckout = useCallback(async () => {
  try {
    setIsLoading(true);
    setError(null);

    if (__DEV__) {
      logger.log('CHECKOUT - Starting...');
      logger.log('Items in cart:', items.length);
      logger.log('Items:', items.map(i => i.serviceName));
    }

    // Validate all items have schedules
    const unscheduled = items.filter(item => {
      const booking = getServiceBooking(item.id);
      return !booking.selectedDate || !booking.selectedTime;
    });

    if (unscheduled.length > 0) {
      showAlert(
        'Schedule Required',
        `Please schedule ${unscheduled.length} appointment(s) before checkout.`
      );
      return;
    }

    // Validate booking data
    const hasInvalidDate = items.some(item => {
      const booking = getServiceBooking(item.id);
      return booking.selectedDate && isNaN(new Date(booking.selectedDate).getTime());
    });

    if (hasInvalidDate) {
      showAlert('Check your appointment times', 'One of your appointment dates isn\'t valid. Please pick it again.');
      return;
    }

    // Catch scheduling conflicts — two cart items for the same provider that
    // overlap each other, or a slot that's since been taken by someone else's
    // booking in Supabase — BEFORE the payment sheet opens. Without this,
    // the first conflict either of those produces is only discovered by
    // the claim RPC's own insert-time check, mid-checkout, after the card
    // has already been authorised.
    const conflictCheck = await AvailabilityService.validateCartBookings(
      items.map(item => {
        const booking = getServiceBooking(item.id);
        return {
          providerName: item.providerId ?? item.providerName,
          date: booking.selectedDate,
          time: booking.selectedTime,
          duration: item.duration,
          cartItemId: item.id,
          serviceId: item.serviceId,
        };
      })
    );
    if (!conflictCheck.isValid) {
      const messages = [...new Set(conflictCheck.conflicts.map(c => c.message))].join('\n');
      showAlert('Scheduling Conflict', messages);
      return;
    }

    // ✅ CAPTURE SNAPSHOT OF ITEMS AND BOOKINGS
    if (__DEV__) {
      logger.log('Capturing checkout snapshot...');
    }
    // Bake promo discounts into the snapshot so the discounted price flows
    // through validation, payment, and the saved booking. A note on the
    // booking tells the provider which code was redeemed.
    const snapshotBookings: Record<string, ServiceBooking> = { ...bookingsByItemId };
    const snapshotItems = items.map(item => {
      const discount = itemPromoDiscounts[item.id] ?? 0;
      if (discount <= 0) return item;
      const promo = appliedPromos[item.providerName];
      const existing = snapshotBookings[item.id];
      const promoNote = `Promo ${promo?.promo_code ?? ''} applied (−£${discount.toFixed(2)})`.trim();
      snapshotBookings[item.id] = {
        ...(existing ?? { selectedDate: '', selectedTime: '', isDepositOnly: false }),
        notes: [existing?.notes, promoNote].filter(Boolean).join('\n'),
      } as ServiceBooking;
      return { ...item, price: Math.max(0, (Number(item.price) || 0) - discount) };
    });
    const snapshot = {
      items: snapshotItems,
      bookings: snapshotBookings,
    };
    if (__DEV__) {
      logger.log('Snapshot captured:', snapshot.items.length, 'items');
    }
    setCheckoutSnapshot(snapshot);

    setPaymentTotal(effectiveFinalTotal);

    // Show review modal pre-filled with user data
    setReviewName(user?.name || '');
    setReviewEmail(user?.email || '');
    setReviewPhone(user?.phone || '');
    setSaveAsDefault(false);
    setIsEditingDetails(false);
    setShowReviewModal(true);

    // Prefill the address instead of making a mobile-booking client retype it
    // every checkout. The saved account default (set via the checkbox below)
    // wins; failing that, fall back to whatever address their last mobile
    // booking used, so returning clients who predate the saved default still
    // get one. The fallback is deliberately not awaited — the field is
    // editable and only required when a mobile provider is in the cart, so a
    // slow lookup shouldn't hold up the review step — and it only ever fills a
    // still-empty field, so it can't overwrite what the client has typed.
    if (hasMobileProvider) {
      if (user?.clientAddress) {
        setClientAddress(user.clientAddress);
      } else {
        getMyLastClientAddress()
          .then(saved => {
            if (saved) setClientAddress(prev => (prev.trim() ? prev : saved));
          })
          .catch(err => logger.error('Could not prefill saved address:', err));
      }
    }
  } catch (error) {
    logger.error('Checkout error:', error);
    showAlert('Something went wrong', 'We couldn\'t start checkout. Please try again.');
  } finally {
    setIsLoading(false);
  }
}, [items, getServiceBooking, effectiveFinalTotal, bookingsByItemId, user, appliedPromos, itemPromoDiscounts, showAlert, hasMobileProvider]);

  // Handle review modal confirmation
  const handleReviewConfirm = useCallback(async () => {
    // Validate name is provided — this becomes the permanent customer_name
    // snapshot on the booking row (providers see it on every booking card,
    // in analytics, clientele, etc.), so an empty value here isn't just a
    // blank field, it's a silent "Client"/'—' fallback everywhere downstream.
    if (!reviewName.trim()) {
      showReviewAlert('Name Required', 'Please enter your name to continue.');
      setIsEditingDetails(true);
      return;
    }
    // Validate phone is provided
    if (!reviewPhone.trim()) {
      showReviewAlert('Phone Required', 'Please enter your phone number to continue.');
      setIsEditingDetails(true);
      return;
    }
    const digitsOnly = reviewPhone.replace(/[\s\-()+ ]/g, '');
    if (digitsOnly.length < 10) {
      showReviewAlert('Check your phone number', 'Please enter a valid phone number.');
      setIsEditingDetails(true);
      return;
    }
    if (hasMobileProvider && !clientAddress.trim()) {
      showReviewAlert('Address Required', 'Your provider is mobile and will travel to you. Please enter your address.');
      setIsEditingDetails(true);
      return;
    }

    // Save customer info
    const customerInfo = { name: reviewName, email: reviewEmail, phone: reviewPhone };
    setConfirmedCustomerInfo(customerInfo);

    // If "Set as Default" is checked, update AuthContext. Email is excluded —
    // account email isn't editable, and updateUser() only persists name/phone
    // to the DB, so including it here silently desyncs local user.email from
    // the real auth email without ever actually changing it server-side.
    if (saveAsDefault) {
      try {
        await updateUser({
          name: reviewName,
          phone: reviewPhone,
          // Only offered when a mobile provider is in the cart — that's the
          // only case the address field is shown or collected at all.
          ...(hasMobileProvider ? { clientAddress: clientAddress.trim() } : {}),
        });
      } catch (err) {
        // Don't block checkout on this — the entered details still carry
        // through to the booking itself via customerInfo above.
        logger.error('Failed to save default contact details:', err);
      }
    }

    // Re-confirm agreement per checkout attempt rather than letting a stale
    // check from a previous cart session carry through silently.
    setAgreedToPolicy(false);
    setShowReviewModal(false);
    setShowBookingSummaryModal(true);
  }, [reviewName, reviewEmail, reviewPhone, saveAsDefault, updateUser, showReviewAlert, hasMobileProvider, clientAddress]);

const handlePaymentSuccess = useCallback(async (paymentMethod: string, paymentIntentId?: string) => {
  if (__DEV__) {
    logger.log('═══════════════════════════════════════');
    logger.log('PAYMENT SUCCESS - FUNCTION CALLED');
    logger.log('═══════════════════════════════════════');
  }

  try {
    // The secure Stripe route has already finalised its server-owned holds in
    // the Edge Function. Do not fall through to the legacy client insert
    // path, which would duplicate the appointments.
    if (USE_STRIPE_PAYMENTS && serverCheckoutBatchId) {
      setServerCheckoutBatchId(null);
      return;
    }
    // Step 0: Check snapshot
    if (__DEV__) {
      logger.log('STEP 0: Checking snapshot...');
      logger.log('Snapshot items count:', checkoutSnapshot.items.length);
      logger.log('Current items count:', items.length);
    }
    
    const itemsToBook = checkoutSnapshot.items;
    const bookingsData = checkoutSnapshot.bookings;

    if (itemsToBook.length === 0) {
      logger.error('CRITICAL: No items in snapshot!');
      logger.error('Snapshot:', JSON.stringify(checkoutSnapshot, null, 2));
      throw new Error('No items to book - snapshot is empty');
    }

    if (__DEV__) {
      logger.log('STEP 0 COMPLETE - Items:', itemsToBook.map(i => i.serviceName));
      logger.log('---');
    }

    // Step 1: Validate
    if (__DEV__) {
      logger.log('STEP 1: Validating bookings...');
    }
    try {
      const validation = BookingService.validateBookings(itemsToBook, bookingsData);
      if (__DEV__) {
        logger.log('Validation result:', validation);
      }

      if (!validation.valid) {
        logger.error('Validation failed:', validation.errors);
        throw new Error('Validation failed: ' + validation.errors.join(', '));
      }
      if (__DEV__) {
        logger.log('STEP 1 COMPLETE - Validation passed');
      }
    } catch (validationError) {
      logger.error('STEP 1 FAILED:', validationError);
      throw validationError;
    }
    if (__DEV__) {
      logger.log('---');
    }

    // Step 2: Create appointment data
    if (__DEV__) {
      logger.log('STEP 2: Creating appointment data...');
    }
    let appointmentData: AppointmentData[];
    try {
      const customerInfo = confirmedCustomerInfo || {
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
      };
      appointmentData = BookingService.createAppointmentData(itemsToBook, bookingsData, customerInfo);
      if (__DEV__) {
        logger.log('Appointment data created:', appointmentData.length);
        logger.log('Appointments:', JSON.stringify(appointmentData, null, 2));
        logger.log('STEP 2 COMPLETE');
      }
    } catch (appointmentError) {
      logger.error('STEP 2 FAILED:', appointmentError);
      throw appointmentError;
    }
    if (__DEV__) {
      logger.log('---');
    }

    // Stamp payment method + the real Stripe PaymentIntent id (when using
    // StripePaymentModal — undefined/omitted for the mock PaymentModal) on
    // every appointment entry. One PaymentIntent covers the whole checkout
    // total, shared across every booking created from it (group checkout).
    appointmentData = appointmentData.map(a => ({
      ...a,
      paymentMethod,
      ...(paymentIntentId ? { paymentIntentId } : {}),
    }));

    // NOTE: the client's allergies/medical notes are deliberately NOT copied
    // into `notes` here. This used to prepend a "Health info: ..." line to
    // every booking's notes, which meant (a) the client's own booking detail
    // showed text under "YOUR NOTES" that they never typed — often the only
    // thing there, on a booking where they'd written nothing — and (b) the
    // provider saw the same facts twice, since ProviderBookingDetailScreen
    // already reads the live client profile and renders allergies and
    // medical notes in its own "Health & Alerts" section (plus the alert
    // strip at the top). Copying health-adjacent data into a free-text field
    // also froze it at checkout time, so a client updating their allergies
    // afterwards left a stale copy on the booking forever.

    // Step 3: Create bookings IN CONTEXT
    if (__DEV__) {
      logger.log('STEP 3: Creating bookings in BookingContext...');
      logger.log('About to call createBookingsFromCart with:');
      logger.log('- Items:', itemsToBook.length);
      logger.log('- Appointments:', appointmentData.length);
    }
    try {
      // Pass the hold batch (if one is outstanding) so createBookingsFromCart
      // claims the already-reserved on_hold rows instead of inserting fresh
      // ones. holdBatchId is cleared unconditionally after this call — the
      // batch is either now claimed, or claim found nothing live and every
      // item fell back to a normal insert; either way there's nothing left
      // to release.
      await createBookingsFromCart(itemsToBook, appointmentData, clientAddress.trim() || undefined, holdBatchId ?? undefined);
      setHoldBatchId(null);
      if (__DEV__) {
        logger.log('STEP 3 COMPLETE - createBookingsFromCart returned');
      }
    } catch (bookingError) {
      setHoldBatchId(null);
      logger.error('STEP 3 FAILED:', bookingError);
      logger.error('Error details:', JSON.stringify(bookingError, null, 2));
      throw bookingError;
    }
    if (__DEV__) {
      logger.log('---');
    }

    // Step 4: Booking-request and payment-received notifications are now
    // sent by createBookingsFromCart in BookingContext, using the real
    // Supabase booking id (not the cart item id) and the real notifications
    // table NotificationsScreen actually reads.
    if (__DEV__) {
      logger.log('STEP 5: Booking confirmations sent by createBookingsFromCart');
      logger.log('---');

      logger.log('═══════════════════════════════════════');
      logger.log('ALL STEPS COMPLETE - PAYMENT SUCCESS FINISHED');
      logger.log('═══════════════════════════════════════');
    }
    
  } catch (error) {
    // ── Consolidated booking-failure diagnostics (always-on) ─────────────
    // logger.error survives release builds (see utils/logger), so this shows
    // in a connected terminal / crash reporter even in production. Search the
    // logs for "BOOKING FAILED" to find every failed checkout and its reason.
    const isBookingErr = error instanceof BookingError;
    const succeededIds = isBookingErr ? (error as BookingError).succeededCartItemIds : [];
    const pgCode = (error as any)?.code;
    logger.error('╔══════════════ BOOKING FAILED ══════════════');
    logger.error('║ reason    :', error instanceof Error ? error.message : String(error));
    logger.error('║ errorType :', isBookingErr ? 'BookingError' : ((error as any)?.name ?? typeof error));
    if (pgCode) logger.error('║ pgCode    :', pgCode); // e.g. 23505 = slot taken, 42501 = RLS
    logger.error('║ userId    :', user?.id ?? '(none)');
    logger.error('║ paidTotal :', `£${effectiveFinalTotal?.toFixed?.(2) ?? '?'} via ${paymentMethod}`);
    logger.error(
      '║ items     :',
      checkoutSnapshot.items.map(i => {
        const apt = checkoutSnapshot.bookings[i.id];
        return {
          service: i.serviceName,
          provider: i.providerDisplayName ?? i.providerName,
          providerId: i.providerId ?? '(unresolved)',
          date: apt?.selectedDate || '(none)',
          time: apt?.selectedTime || '(none)',
          booked: succeededIds.includes(i.id),
        };
      }),
    );
    if (isBookingErr) {
      logger.error('║ partial   :', `${succeededIds.length}/${checkoutSnapshot.items.length} services booked`);
    }
    logger.error('║ stack     :', error instanceof Error ? error.stack : '(none)');
    logger.error('╚═════════════════════════════════════════════');

    // A multi-service checkout can partially succeed — clear only the
    // services that actually booked, so the ones that failed stay in the
    // cart for the client to retry without re-booking (and re-paying for)
    // the ones that already went through. Whatever's left (didn't succeed)
    // gets flagged so the client can see which item needs attention.
    if (error instanceof BookingError) {
      error.succeededCartItemIds.forEach(id => removeFromCart(id));
      const failedIds = checkoutSnapshot.items
        .map(i => i.id)
        .filter(id => !error.succeededCartItemIds.includes(id));
      setConflictedItemIds(new Set(failedIds));
    }
    // The caller (PaymentModal.handlePayment) owns showing the single
    // "Booking Failed" alert and closing the payment sheet — this only needs
    // to propagate the error up to it (after the diagnostics above).
    throw error;
  }
}, [checkoutSnapshot, createBookingsFromCart, holdBatchId, serverCheckoutBatchId, effectiveFinalTotal, items, confirmedCustomerInfo, user, removeFromCart, clientAddress]);

  const navigateToProvider = useCallback(
    (providerItems: CartItem[]) => {
      const slug = providerItems[0]?.providerSlug;
      if (!slug) {
        showAlert('Something went wrong', "We couldn't open that provider's profile.");
        return;
      }
      navigation.navigate('ProviderProfile', { providerId: slug, source: 'cart' });
    },
    [navigation, showAlert]
  );

  // Show loading while fonts are loading

  // Create dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    headerTitle: { fontSize: 26, fontWeight: '600', fontFamily: 'BakbakOne-Regular', color: theme.text },
    title: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text },
    providerName: { fontSize: 12, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 2 },
    providerStats: { fontSize: 9, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText, marginTop: 3 },
    serviceName: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 3 },
    serviceDuration: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText, marginBottom: 6 },
    addOnsTitle: { fontSize: 9, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 5 },
    baseServicePrice: { fontSize: 8, fontFamily: 'Jura-VariableFont_wght', color: theme.secondaryText, marginBottom: 3, fontWeight: '500' },
    addOnItem: { fontSize: 8, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText, marginBottom: 2, paddingLeft: 3 },
    fallbackTitle: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 10, textAlign: 'center' },
    fallbackLabel: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.text, marginBottom: 3, marginTop: 6 },
    notesTitle: { fontSize: 14, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 3 },
    notesSubtitle: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText },
    characterCount: { fontSize: 8, color: theme.secondaryText, textAlign: 'right', marginBottom: 12 },
    cancelText: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text },
    summaryLabel: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.text },
    summaryValue: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', color: theme.text, fontWeight: '700' },
    serviceFeeNote: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText, textAlign: 'right', marginTop: 2 },
    totalLabel: { fontSize: 17, fontFamily: 'BakbakOne-Regular', color: theme.text },
    totalValue: { fontSize: 18, fontFamily: 'BakbakOne-Regular', color: theme.text },
    emptyTitle: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 8 },
    emptyText: { fontSize: 11, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.secondaryText, marginBottom: 16, textAlign: 'center' },
    paymentTitle: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text },
    paymentCloseText: { fontSize: 14, color: theme.text, fontWeight: 'bold' },
    orderSummaryTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 8 },
    orderItemName: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', color: theme.text, flex: 1 },
    orderItemPrice: { fontSize: 10, fontFamily: 'BakbakOne-Regular', color: theme.text },
    orderTotalLabel: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text },
    orderTotalAmount: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text, fontWeight: 'bold' },
    paymentMethodsTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 12 },
    paymentMethodName: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, flex: 1 },
    cardDetailsTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 12 },
    cardInput: { borderRadius: 8, padding: 9, marginBottom: 8, fontSize: 11, fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', borderWidth: 1 },
    liquidGlassSuccessCheckmark: { fontSize: 28, color: theme.text, fontWeight: 'bold' },
    liquidGlassSuccessTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18, color: theme.text, marginBottom: 6, textAlign: 'center' },
    liquidGlassSuccessButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, color: theme.text, fontWeight: '600' },
  }), [theme]);

  // Most items now arrive pre-scheduled from the provider profile — only
  // show the multi-booking scheduling guide when there's still something
  // in the cart that actually needs a date/time picked.
  const hasUnscheduledItems = useMemo(
    () => items.some(item => {
      const booking = getServiceBooking(item.id);
      return !booking.selectedDate || !booking.selectedTime;
    }),
    [items, getServiceBooking]
  );

  return (
    <ErrorBoundary>
      <ThemedBackground style={{ flex: 1 }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: P.bg, borderBottomColor: P.border }]}>
            <TouchableOpacity
              style={[styles.backButton, { backgroundColor: P.surface, borderColor: P.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleContinueShopping();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </TouchableOpacity>

            <Text style={dynamicStyles.headerTitle}>Cart ({String(totalItems ?? 0)})</Text>

            <View style={styles.headerRightButtons}>
              {/* View Bookings Button */}
              <TouchableOpacity
                style={[styles.bookingsButton, { backgroundColor: P.accentDim }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  try {
                    navigation.navigate('Bookings'); // NAVIGATES TO BOOKINGS SCREEN
                  } catch (error) {
                    logger.error('Bookings navigation error:', error);
                    Alert.alert('Navigation Error', 'Unable to open bookings');
                  }
                }}
              >
                <Text style={[styles.bookingsText, { color: P.accentText }]}>View Bookings</Text>
              </TouchableOpacity>
              {/* Clear Button */}
              {items.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleClearCart();
                  }}
                >
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Error Display */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setError(null);
                }}
              >
                <Text style={styles.errorDismiss}>×</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Confirm Your Details Modal */}
          <Modal visible={showReviewModal} animationType="fade" transparent={true}>
            <View style={styles.modalOverlayNoBlur}>
              <View style={[styles.reviewModalContainer, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.reviewModalContent}>
                  {/* Title row with Edit button */}
                  <View style={styles.reviewTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewModalTitle, { color: P.text }]}>Confirm Your Details</Text>
                      <Text style={[styles.reviewModalSubtitle, { color: P.sub }]}>
                        This info will be shared with your provider
                      </Text>
                    </View>
                    {!isEditingDetails && (
                      <TouchableOpacity
                        style={[styles.reviewEditBtn, { backgroundColor: P.accentDim, borderColor: P.border }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setIsEditingDetails(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reviewEditText, { color: P.accentText }]}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Name */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: P.sub }]}>NAME</Text>
                    {isEditingDetails ? (
                      <TextInput
                        style={[styles.reviewInput, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
                        value={reviewName}
                        onChangeText={setReviewName}
                        placeholder="Your name"
                        placeholderTextColor={P.sub}
                      />
                    ) : (
                      <Text style={[styles.reviewFieldValue, { color: P.text }]}>{reviewName || '—'}</Text>
                    )}
                  </View>

                  {/* Email */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: P.sub }]}>EMAIL</Text>
                    {isEditingDetails ? (
                      <TextInput
                        style={[styles.reviewInput, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
                        value={reviewEmail}
                        onChangeText={setReviewEmail}
                        placeholder="your@email.com"
                        placeholderTextColor={P.sub}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    ) : (
                      <Text style={[styles.reviewFieldValue, { color: P.text }]}>{reviewEmail || '—'}</Text>
                    )}
                  </View>

                  {/* Phone */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: P.sub }]}>PHONE NUMBER</Text>
                    {isEditingDetails ? (
                      <TextInput
                        style={[styles.reviewInput, {
                          color: P.text,
                          borderColor: !reviewPhone.trim() ? '#FF3B30' : P.border,
                          backgroundColor: P.surface,
                        }]}
                        value={reviewPhone}
                        onChangeText={setReviewPhone}
                        placeholder="+44 7700 900000"
                        placeholderTextColor={P.sub}
                        keyboardType="phone-pad"
                      />
                    ) : (
                      <Text style={[styles.reviewFieldValue, { color: P.text }]}>{reviewPhone || '—'}</Text>
                    )}
                    {isEditingDetails && !reviewPhone.trim() && (
                      <Text style={styles.reviewPhoneWarning}>Phone number is required to book</Text>
                    )}
                  </View>

                  {/* Address — only shown when a mobile provider is in the cart */}
                  {hasMobileProvider && (
                    <View style={styles.reviewFieldGroup}>
                      <Text style={[styles.reviewFieldLabel, { color: P.sub }]}>YOUR ADDRESS</Text>
                      <Text style={[styles.reviewFieldLabel, { color: P.sub, fontSize: 11, marginBottom: 4 }]}>
                        Your provider is mobile and will come to you
                      </Text>
                      {isEditingDetails ? (
                        <TextInput
                          style={[styles.reviewInput, {
                            color: P.text, borderColor: !clientAddress.trim() ? '#FF3B30' : P.border, backgroundColor: P.surface,
                          }]}
                          value={clientAddress}
                          onChangeText={setClientAddress}
                          placeholder="e.g. 12 High Street, London, SW1A 1AA"
                          placeholderTextColor={P.sub}
                          autoCapitalize="words"
                        />
                      ) : (
                        <Text style={[styles.reviewFieldValue, { color: clientAddress ? P.text : '#FF3B30' }]}>
                          {clientAddress || 'Address required'}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Save as Default — only in edit mode */}
                  {isEditingDetails && (
                    <TouchableOpacity
                      style={styles.reviewCheckboxRow}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSaveAsDefault(!saveAsDefault);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reviewCheckbox, {
                        borderColor: P.border,
                        backgroundColor: saveAsDefault ? P.accent : 'transparent',
                      }]}>
                        {saveAsDefault && <Text style={[styles.reviewCheckmark, { color: P.onAccent }]}>✓</Text>}
                      </View>
                      <Text style={[styles.reviewCheckboxLabel, { color: P.text }]}>
                        Set as default for future bookings
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Buttons */}
                  <View style={[styles.reviewButtonRow, isEditingDetails && { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.reviewCancelBtn, { borderColor: P.border }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        if (isEditingDetails) {
                          setIsEditingDetails(false);
                        } else {
                          setShowReviewModal(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.reviewCancelText, { color: P.text }]}>
                        {isEditingDetails ? 'Done' : 'Cancel'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reviewConfirmBtn, { backgroundColor: P.accent }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        handleReviewConfirm();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.reviewConfirmText, { color: P.onAccent }]}>Continue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            {/* Nested INSIDE this modal on purpose — see showReviewAlert. */}
            <ReviewDialogHost />
          </Modal>

          {/* Booking Summary. A small cart stays a centred card — that reads
              as a confirmation step, and blowing four lines up to fill a
              phone screen feels heavier than the decision is. From
              FULL_SCREEN_SUMMARY_THRESHOLD appointments up it goes full
              screen instead: past that, each appointment carrying its own
              add-ons, group block and time overflowed the 90%-wide /
              85%-tall card into a cramped inner scroll, with the Terms
              checkbox and Confirm & Pay pushed below the fold.

              `key` forces a remount when the presentation flips — React
              Native's Modal doesn't apply a changed
              transparent/presentationStyle to an already-mounted modal. */}
          <Modal
            key={useFullScreenSummary ? 'summary-fullscreen' : 'summary-card'}
            visible={showBookingSummaryModal}
            animationType={useFullScreenSummary ? 'slide' : 'fade'}
            transparent={!useFullScreenSummary}
            {...(useFullScreenSummary ? { presentationStyle: 'fullScreen' as const } : {})}
            onRequestClose={backFromSummary}
          >
            <SummaryShell
              fullScreen={useFullScreenSummary}
              P={P}
              onBack={backFromSummary}
              actions={<>
                  <TouchableOpacity
                    style={[styles.reviewCancelBtn, { borderColor: P.border }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      backFromSummary();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reviewCancelText, { color: P.text }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.reviewConfirmBtn, { backgroundColor: (!agreedToPolicy || isReservingSlots) ? P.accentDim : P.accent }]}
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      console.log('[CartScreen] Confirm & Pay pressed', { agreedToPolicy, isReservingSlots, itemCount: checkoutSnapshot.items.length });
                      // Reserve every item's slot as an on_hold booking
                      // BEFORE opening the payment sheet — closes the
                      // window between "committed to paying" and
                      // "booking actually inserted" that the claim RPC's
                      // insert-time-only conflict check leaves open for
                      // the whole payment-sheet interaction.
                      setIsReservingSlots(true);
                      try {
                        if (USE_STRIPE_PAYMENTS) {
                          const intent = checkoutSnapshot.items.map(item => {
                            const booking = checkoutSnapshot.bookings[item.id];
                            if (!item.providerId || !booking?.selectedDate || !booking.selectedTime) {
                              throw new Error('Every service needs a provider, date and time before payment.');
                            }
                            return {
                              provider_id: item.providerId,
                              service_id: item.serviceId,
                              booking_date: booking.selectedDate,
                              booking_time: booking.selectedTime,
                              add_on_ids: (item.addOns ?? []).map(addOn => String(addOn.id)),
                              use_deposit: Boolean(booking.isDepositOnly),
                              notes: booking.notes,
                              // The single Terms checkbox above folds in
                              // safety acknowledgement when relevant — it
                              // can't be checked while it's required and
                              // unread, so agreedToPolicy IS the ack here.
                              // prepare_checkout re-derives whether each
                              // service actually needs this and rejects
                              // if missing, regardless of this value.
                              safety_ack: agreedToPolicy,
                            };
                          });
                          const prepared = await prepareCheckout(intent);
                          setServerCheckoutBatchId(prepared.checkoutBatchId);
                          setPaymentTotal(prepared.amountDue);
                        } else {
                          console.log('[CartScreen] calling holdCartCheckoutSlots', JSON.stringify(checkoutSnapshot.bookings));
                          const batchId = await holdCartCheckoutSlots(
                            checkoutSnapshot.items,
                            checkoutSnapshot.bookings
                          );
                          console.log('[CartScreen] holdCartCheckoutSlots succeeded', batchId);
                          setHoldBatchId(batchId);
                        }
                        setShowBookingSummaryModal(false);
                        setShowPaymentModal(true);
                      } catch (err) {
                        console.log('[CartScreen] holdCartCheckoutSlots FAILED', err);
                        // prepareCheckout() throws the raw Supabase RPC
                        // error (not a BookingError), so a rejection like
                        // the safety-ack gate's RAISE EXCEPTION message
                        // needs unwrapping too, not just BookingError —
                        // otherwise the client never learns WHY, only
                        // that something failed. Mirrors AddBookingScreen's
                        // catch for the same class of RPC rejection.
                        const message = err instanceof BookingError
                          ? err.message
                          : err instanceof Error
                            ? err.message.replace(/^Error:\s*/, '')
                            : "We couldn't reserve that time. Please try again.";
                        const title = err instanceof BookingError ? 'Scheduling Conflict' : 'Booking Not Completed';
                        // Close the summary sheet FIRST. CartScreen's
                        // DialogHost is a sibling of this <Modal>, not a
                        // child, so an alert raised while the sheet is
                        // still presented never reaches the screen — the
                        // failure looked completely silent. Same
                        // close-then-alert order the payment sheet already
                        // uses on its own failure path.
                        setShowBookingSummaryModal(false);
                        showAlert(title, message);
                      } finally {
                        setIsReservingSlots(false);
                      }
                    }}
                    activeOpacity={0.8}
                    disabled={!agreedToPolicy || isReservingSlots}
                  >
                    {isReservingSlots
                      ? <ActivityIndicator color={P.onAccent} />
                      : <Text style={[styles.reviewConfirmText, { color: agreedToPolicy ? P.onAccent : P.sub }]}>Confirm & Pay</Text>}
                  </TouchableOpacity>
              </>}
            >

              {/* Customer info */}
              {confirmedCustomerInfo && (
                <View style={[styles.summarySection, { backgroundColor: P.surface, borderColor: P.sep }]}>
                  <Text style={[styles.summarySectionTitle, { color: P.sub }]}>CUSTOMER</Text>
                  <Text style={[styles.summaryCustomerName, { color: P.text }]}>{confirmedCustomerInfo.name}</Text>
                  {!!confirmedCustomerInfo.email && (
                    <Text style={[styles.summaryCustomerDetail, { color: P.sub }]}>{confirmedCustomerInfo.email}</Text>
                  )}
                  <Text style={[styles.summaryCustomerDetail, { color: P.sub }]}>{confirmedCustomerInfo.phone}</Text>
                </View>
              )}

              {/* Appointments */}
              <View style={[styles.summarySection, { backgroundColor: P.surface, borderColor: P.sep }]}>
                <Text style={[styles.summarySectionTitle, { color: P.sub }]}>APPOINTMENTS</Text>
                {checkoutProviderSections.map(section => (
                  <View key={section.providerKey} style={styles.summaryProviderGroup}>
                    {/* Same-provider heading. Distinct from a GROUP
                        BOOKING block below it: that means services
                        deliberately booked back-to-back in one sitting,
                        whereas this is simply every appointment that
                        happens to be with the same provider, however
                        far apart. Without it a five-appointment cart
                        read as one undifferentiated list with the
                        provider name repeated under every row. */}
                    <View style={[styles.summaryProviderHeader, { borderBottomColor: P.sep }]}>
                      <Text style={[styles.summaryProviderName, { color: P.text }]} numberOfLines={1}>
                        {section.providerLabel}
                      </Text>
                      <Text style={[styles.summaryProviderMeta, { color: P.sub }]}>
                        {section.appointmentCount} {section.appointmentCount === 1 ? 'appt' : 'appts'} · £{section.total.toFixed(2)}
                      </Text>
                    </View>
                    {section.units.map((unit, index) => renderCheckoutUnit(unit, section.units[index - 1]))}
                  </View>
                ))}
              </View>

              {/* Totals */}
              <View style={[styles.summarySection, { backgroundColor: P.surface, borderColor: P.sep }]}>
                <View style={styles.summaryTotalRow}>
                  <Text style={[styles.summaryTotalLabel, { color: P.sub }]}>Subtotal</Text>
                  <Text style={[styles.summaryTotalValue, { color: P.text }]}>£{effectiveTotal.toFixed(2)}</Text>
                </View>
                {platformFee > 0 && <View style={styles.summaryTotalRow}>
                  <Text style={[styles.summaryTotalLabel, { color: P.sub }]}>Platform Fee</Text>
                  <Text style={[styles.summaryTotalValue, { color: P.text }]}>£{platformFee.toFixed(2)}</Text>
                </View>}
                <View style={[styles.summaryTotalRow, styles.summaryGrandTotalRow, { borderTopColor: P.sep }]}>
                  <Text style={[styles.summaryGrandLabel, { color: P.text }]}>Total</Text>
                  <Text style={[styles.summaryGrandValue, { color: P.accentText }]}>£{effectiveFinalTotal.toFixed(2)}</Text>
                </View>
              </View>

              {/* Policy & Terms agreement — folds in a safety-info
                  acknowledgement when any item's service requires a
                  patch test or is flagged unsafe in pregnancy. This is
                  relaying the PROVIDER's stated requirement for that
                  service, not a CERVICED safety determination.
                  prepare_checkout enforces this server-side regardless
                  of this checkbox — see supabase/migrations/
                  20260817085443_safety_acknowledgement_checkout.sql. */}
              {(() => {
                const safetyItems = checkoutSnapshot.items.filter(i => {
                  const f = safetyFlagsByServiceId.get(i.serviceId);
                  return f && (f.patchTestRequired || !f.isPregnancySafe);
                });
                const needsSafetyAck = safetyItems.length > 0;
                return (
                  <>
                    {needsSafetyAck && (
                      <View style={[styles.safetyAckNotice, { backgroundColor: P.surface, borderColor: P.border }]}>
                        <Text style={[styles.safetyAckNoticeText, { color: P.sub }]}>
                          {safetyItems.length === 1
                            ? `${safetyItems[0]!.serviceName}'s provider has flagged safety information for this treatment (patch test and/or pregnancy) — see the service page for details.`
                            : `${safetyItems.length} services in this order have provider-flagged safety information (patch test and/or pregnancy) — see each service page for details.`}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.reviewCheckboxRow}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); console.log('[CartScreen] checkbox toggled', !agreedToPolicy); setAgreedToPolicy(!agreedToPolicy); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reviewCheckbox, {
                        borderColor: P.border,
                        backgroundColor: agreedToPolicy ? P.accent : 'transparent',
                      }]}>
                        {agreedToPolicy && <Text style={[styles.reviewCheckmark, { color: P.onAccent }]}>✓</Text>}
                      </View>
                      {/* TODO(copy): placeholder legal copy — needs user-directed final wording, not to be treated as reviewed/final */}
                      <Text style={[styles.reviewCheckboxLabel, { color: P.text, flex: 1 }]}>
                        I agree to the Terms & Conditions<Text style={styles.requiredAsterisk}> *</Text> and each provider's cancellation policy
                        {needsSafetyAck ? ', and confirm I have seen the safety information above' : ''}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}

            </SummaryShell>
          </Modal>

          {/* Payment Modal - PASS EFFECTIVE ITEMS & TOTAL */}
          {(() => {
            const ActivePaymentModal = USE_STRIPE_PAYMENTS ? StripePaymentModal : PaymentModal;
            return (
              <ActivePaymentModal
                isVisible={showPaymentModal}
                onClose={() => {
                  // User backed out via the × close button without paying —
                  // free the held slots immediately rather than making the
                  // next client wait out the 10-minute TTL. Best-effort:
                  // releaseCartCheckoutSlots never throws.
                  if (holdBatchId) {
                    releaseCartCheckoutSlots(holdBatchId);
                    setHoldBatchId(null);
                  }
                  if (serverCheckoutBatchId) {
                    cancelCheckout(serverCheckoutBatchId).catch(error => logger.error('Could not release secure checkout:', error));
                    setServerCheckoutBatchId(null);
                  }
                  setShowPaymentModal(false);
                }}
                effectiveCartItems={effectiveCartItems}
                totalAmount={USE_STRIPE_PAYMENTS && serverCheckoutBatchId ? paymentTotal : effectiveFinalTotal}
                checkoutBatchId={serverCheckoutBatchId}
                onPaymentSuccess={(method, paymentIntentId) => handlePaymentSuccess(method, paymentIntentId)}
                onPaymentComplete={() => {
                  clearCart(); // Clear cart immediately after payment simulation
                  setShowPaymentModal(false);
                  setShowPaymentSuccessModal(true);
                }}
                onBookingFailed={(message) => {
                  // Booking failed after payment (or during) — the held
                  // slots are either already claimed/converted by
                  // createBookingsFromCart or still on_hold; releasing here
                  // is a safe no-op for the former (release only matches
                  // rows still status='on_hold') and correct cleanup for
                  // the latter.
                  if (holdBatchId) {
                    releaseCartCheckoutSlots(holdBatchId);
                    setHoldBatchId(null);
                  }
                  if (serverCheckoutBatchId) {
                    cancelCheckout(serverCheckoutBatchId).catch(error => logger.error('Could not release secure checkout:', error));
                    setServerCheckoutBatchId(null);
                  }
                  showAlert('Booking Failed', message);
                }}
              />
            );
          })()}

          {/* Liquid Glass Payment Success Modal - ADDED CONTINUE SHOPPING BUTTON */}
          {showPaymentSuccessModal && (
            <Modal visible={true} animationType="fade" transparent={true}>
              <View style={styles.modalOverlayNoBlur}>
                <View style={[styles.liquidGlassSuccessModalNoBlur, { backgroundColor: P.card }]}>
                  <View style={styles.liquidGlassSuccessContent}>
                    {/* Success Icon */}
                    <View style={styles.liquidGlassSuccessIcon}>
                      <Text style={[styles.liquidGlassSuccessCheckmark, { color: '#34C759' }]}>✓</Text>
                    </View>

                    <Text style={[styles.liquidGlassSuccessTitle, { color: P.text }]}>Success!</Text>

                    <Text style={[styles.liquidGlassSuccessMessage, { color: P.sub }]}>
                      Payment of £{paymentTotal.toFixed(2)} has been processed successfully.
                      Appointments have been booked and will show up in Bookings when confirmed by
                      providers.
                    </Text>

                    <View style={styles.successButtonsContainer}>
                      <TouchableOpacity
                        style={[styles.liquidGlassSuccessButton, { backgroundColor: P.accentDim, borderColor: P.border }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setShowPaymentSuccessModal(false);
                          navigation.navigate('Bookings'); // ✅ JUST NAVIGATE - bookings already created
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: P.accentText }]}>View Bookings</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.liquidGlassSuccessButton, { backgroundColor: P.accentDim, borderColor: P.border }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setShowPaymentSuccessModal(false);
                          handleContinueShopping();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: P.accentText }]}>Continue Shopping</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* "Which service?" chooser — only reachable from a provider header
              with more than one service in the cart. Picking one hands off to
              the same BookingSheet a single-service provider opens directly. */}
          <Modal
            visible={pickerItems !== null}
            animationType="fade"
            transparent
            onRequestClose={() => setPickerItems(null)}
          >
            <TouchableOpacity
              style={styles.pickerOverlay}
              activeOpacity={1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setPickerItems(null);
              }}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.pickerSheet, { backgroundColor: P.card, borderColor: P.border }]}
              >
                {/* The chooser now only ever opens from a group card, so the
                    title can name the group directly instead of asking a
                    generic "which one" question. */}
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  Edit group booking
                </Text>
                <Text style={[styles.pickerSubtitle, { color: P.sub }]}>
                  {(pickerItems ?? [])[0]?.providerDisplayName
                    ?? (pickerItems ?? [])[0]?.providerName
                    ?? ''}
                </Text>

                {/* Reschedule the whole group as a unit, keeping every service
                    back-to-back. Listed first because it's the non-destructive
                    option — the per-service rows below all break the group. */}
                <TouchableOpacity
                  style={[styles.pickerRow, styles.pickerRowFirst, { borderColor: P.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handlePickerSelectGroup(pickerItems ?? []);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="link" size={16} color={P.accentText} />
                  <View style={styles.pickerRowInfo}>
                    <Text style={[styles.pickerRowName, { color: theme.text }]} numberOfLines={1}>
                      Reschedule all {(pickerItems ?? []).length} to a new day
                    </Text>
                    <Text style={[styles.pickerRowMeta, { color: theme.secondaryText }]} numberOfLines={2}>
                      Pick a date & time — they stay one group, back-to-back
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={P.accentText} />
                </TouchableOpacity>

                <Text style={[styles.pickerSectionLabel, { color: P.sub }]}>
                  Or edit one service — it leaves the group
                </Text>

                {(pickerItems ?? []).map((pItem) => {
                  const b = getServiceBooking(pItem.id);
                  const scheduled = Boolean(b.selectedDate && b.selectedTime);
                  // The same service can be in the cart more than once, which
                  // would otherwise render two identical rows here — mirror
                  // ServiceCard and append the instance number when it's a dupe.
                  const isDuplicate =
                    (pickerItems ?? []).filter(i => i.serviceName === pItem.serviceName).length > 1;
                  return (
                    <TouchableOpacity
                      key={pItem.id}
                      style={[styles.pickerRow, { borderColor: P.border }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        handlePickerSelect(pItem);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerRowInfo}>
                        <Text style={[styles.pickerRowName, { color: theme.text }]} numberOfLines={1}>
                          {pItem.serviceName}
                          {isDuplicate ? ` #${pItem.serviceInstanceIndex ?? 1}` : ''}
                          {b.isDepositOnly ? ' (Deposit)' : ''}
                        </Text>
                        <Text
                          style={[
                            styles.pickerRowMeta,
                            { color: theme.secondaryText },
                            !scheduled && styles.dateTextWarning,
                          ]}
                          numberOfLines={2}
                        >
                          {scheduled
                            ? `${formatLongDateNoYear(b.selectedDate)} at ${formatTime12(b.selectedTime)}`
                            : 'Unscheduled'}
                        </Text>
                        <Text style={[styles.pickerRowHint, { color: P.sub }]} numberOfLines={1}>
                          Leaves the group
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={P.accentText} />
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.pickerCancel}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setPickerItems(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerCancelText, { color: P.sub }]}>Cancel</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* Group reschedule — the client picks the day, then a start time out
              of the options where the WHOLE chain still fits back-to-back. The
              per-service times are derived from that one choice, so the group
              can't be broken apart here. */}
          <Modal
            visible={groupRescheduleItems !== null}
            animationType="slide"
            transparent
            onRequestClose={() => setGroupRescheduleItems(null)}
          >
            <View style={styles.groupSheetOverlay}>
              <View style={[styles.groupSheet, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.groupSheetHeader}>
                  <View style={styles.groupSheetHeaderText}>
                    <Text style={[styles.pickerTitle, { color: theme.text }]}>
                      Reschedule {(groupRescheduleItems ?? []).length} services
                    </Text>
                    <Text style={[styles.pickerSubtitle, { color: P.sub }]}>
                      {(groupRescheduleItems ?? [])[0]?.providerDisplayName
                        ?? (groupRescheduleItems ?? [])[0]?.providerName
                        ?? ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setGroupRescheduleItems(null);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={22} color={P.sub} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  {/* The calendar owns BOTH date and time here — the times it
                      shows are chain starts (see groupSlotResolver), so its own
                      day pills and time row already reflect the group's real
                      availability. No second time list. */}
                  <Text style={[styles.pickerSectionLabel, { color: P.sub }]}>
                    Times shown fit all {(groupRescheduleItems ?? []).length} back-to-back
                  </Text>
                  <ModernBeautyCalendar
                    selectedDate={groupRescheduleDate}
                    onDateSelect={setGroupRescheduleDate}
                    selectedTime={groupRescheduleTime}
                    onTimeSelect={setGroupRescheduleTime}
                    providerName={
                      (groupRescheduleItems ?? [])[0]?.providerId
                      ?? (groupRescheduleItems ?? [])[0]?.providerName
                      ?? ''
                    }
                    slotResolver={groupSlotResolver}
                    accentColor={P.accent}
                    textColor={theme.text}
                    subColor={P.sub}
                    surfaceColor={P.surface}
                  />

                  {/* Exactly what each service ends up at, before committing —
                      led by the overall span, so the appointment's real
                      footprint is the headline rather than something the
                      client has to infer from a list of start times. */}
                  {groupRescheduleChain && (
                    <View style={[styles.groupSheetPreview, { borderColor: P.sep }]}>
                      <View style={styles.groupSheetSpanRow}>
                        <Text style={[styles.groupSheetSpanText, { color: theme.text }]}>
                          {groupRescheduleChain[0]!.time} – {groupRescheduleChain[groupRescheduleChain.length - 1]!.endTime}
                        </Text>
                        <Text style={[styles.groupSheetSpanTotal, { color: P.sub }]}>
                          {groupRescheduleSpanLabel}
                        </Text>
                      </View>
                      {(groupRescheduleItems ?? []).map((item, i) => (
                        <View key={item.id} style={styles.groupSheetPreviewRow}>
                          <Text
                            style={[styles.groupSheetPreviewName, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {item.serviceName}
                          </Text>
                          <Text style={[styles.groupSheetPreviewTime, { color: P.accentText }]}>
                            {groupRescheduleChain[i]!.time} – {groupRescheduleChain[i]!.endTime}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={[
                    styles.groupSheetConfirm,
                    { backgroundColor: groupRescheduleChain ? P.accent : P.accentDim },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleConfirmGroupReschedule();
                  }}
                  disabled={!groupRescheduleChain}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.groupSheetConfirmText, { color: groupRescheduleChain ? P.onAccent : P.sub }]}>
                    {groupRescheduleChain
                      ? `Move all to ${formatLongDateNoYear(groupRescheduleDate)}`
                      : 'Pick a date & time'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Edit a cart item's booking — same sheet used to add it from the
              provider profile, pre-filled with what's already set. */}
          {editingItem && (
            <BookingSheet
              isVisible={showBookingSheet}
              onClose={() => setShowBookingSheet(false)}
              mode="edit"
              service={{
                id: editingItem.serviceId,
                dbId: editingItem.serviceId,
                name: editingItem.serviceName,
                price: editingItem.price,
                duration: editingItem.duration,
                description: editingItem.serviceDescription,
              }}
              onSubmit={handleBookingSheetEditSubmit}
              adaptiveAccentColor={P.accent}
              backgroundColor={P.card}
              providerIdentifier={editingItem.providerId ?? editingItem.providerDisplayName ?? editingItem.providerName}
              providerDisplayName={editingItem.providerDisplayName ?? editingItem.providerName}
              providerKey={editingItem.providerName}
              providerServiceCategory={editingItem.providerService}
              initial={{
                selectedAddOns: editingItem.addOns ?? [],
                selectedDate: editingItem.selectedDate,
                selectedTime: editingItem.selectedTime,
                notes: editingItem.notes,
                isDepositOnly: editingItem.isDepositOnly,
                agreedToPolicy: !!editingItem.policyAcceptedAt,
              }}
            />
          )}

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={P.accent}
                colors={[P.accent]}
                progressBackgroundColor={P.card}
              />
            }
          >
            {items.length > 0 ? (
              <>
                {/* Provider Sections — collapsible, so a cart with several
                    providers stays scannable instead of becoming a wall of
                    cards. Collapsed shows the header (and its totals) only. */}
                {Object.entries(itemsByProvider).map(([providerName, providerItems]) => {
                  const providerData = bookingSummary.providers?.[providerName];

                  if (!providerData || !providerItems?.length) return null;

                  const isCollapsed = collapsedProviders.has(providerName);
                  const renderUnits = buildRenderUnits(providerItems);

                  return (
                    <View key={providerName} style={[styles.providerSection, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                      {/* Provider Header — no Edit button here: editing acts on
                          a card (a single service, or a whole group), not on
                          the provider as a whole. */}
                      <View style={styles.providerHeader}>
                        <TouchableOpacity onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          navigateToProvider(providerItems);
                        }}>
                          <View style={styles.providerLogoContainer}>
                            {providerItems[0]?.providerImage ? (
                              <Image
                                source={providerItems[0].providerImage}
                                style={[styles.providerLogo, { borderColor: P.accentDim }]}
                              />
                            ) : (
                              <View style={[styles.providerLogo, { backgroundColor: P.surface, borderColor: P.accentDim }]} />
                            )}
                          </View>
                        </TouchableOpacity>

                        <View style={styles.providerInfo}>
                          <Text style={dynamicStyles.providerName}>
                            {providerItems[0]?.providerDisplayName ?? providerName}
                          </Text>

                          {/* Service Type with Translucent Pill Background */}
                          <View style={[styles.serviceTypePill, { backgroundColor: P.accentDim, borderColor: P.accentDim }]}>
                            <Text style={[styles.serviceTypeText, { color: P.accentText }]}>
                              {providerItems[0]?.providerService || 'SERVICES'}
                            </Text>
                          </View>

                          <Text style={dynamicStyles.providerStats}>
                            {providerData.instanceCount} appointments • £
                            {providerData.total.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Services — one card per render unit: a grouped card
                          for services scheduled together, a single card for
                          everything else. Hidden entirely when collapsed. */}
                      {!isCollapsed && (
                        <View style={styles.servicesList}>
                          {renderUnits.map((unit, index) => {
                            const policyKey = providerItems[0]?.providerDisplayName ?? providerName;
                            const policy = providerDepositPolicies[policyKey];
                            return (
                              <View
                                key={unit.kind === 'group' ? `group-${unit.batchId}` : unit.item.id}
                                style={styles.serviceItemWrapper}
                              >
                                {unit.kind === 'group' ? (
                                  <GroupedServiceCard
                                    items={unit.items}
                                    getBooking={getServiceBooking}
                                    onRemove={removeFromCart}
                                    onEditGroup={setPickerItems}
                                    conflictedIds={conflictedItemIds}
                                    {...(policy !== undefined ? { depositPolicy: policy } : {})}
                                  />
                                ) : (
                                  <ServiceCard
                                    item={unit.item}
                                    bookingInfo={getServiceBooking(unit.item.id)}
                                    onRemove={removeFromCart}
                                    onEdit={handleEditItem}
                                    allCartItems={items}
                                    hasConflict={conflictedItemIds.has(unit.item.id)}
                                    {...(policy !== undefined ? { depositPolicy: policy } : {})}
                                  />
                                )}
                                {/* Visual Separator */}
                                {index < renderUnits.length - 1 && (
                                  <View style={[styles.serviceSeparator, { backgroundColor: P.accentDim }]} />
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Collapse/expand handle — sits at the bottom of the
                          card so collapsing a long section leaves the control
                          under your thumb rather than scrolled off the top. */}
                      <TouchableOpacity
                        style={[styles.collapseHandle, { borderTopColor: P.border }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          toggleProviderCollapsed(providerName);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.collapseHandleText, { color: P.sub }]}>
                          {isCollapsed
                            ? `Show ${providerData.instanceCount} appointment${providerData.instanceCount === 1 ? '' : 's'}`
                            : 'Hide'}
                        </Text>
                        <Ionicons
                          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                          size={16}
                          color={P.sub}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Applied promo codes recap — one code per provider, entered
                    once on that provider's section above; this rolls up
                    what's active across all of them. */}
                {Object.keys(appliedPromos).length > 0 && (
                  <View style={[styles.summary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 }]}>
                    {Object.entries(appliedPromos).map(([providerKey, promo]) => {
                      const providerItems = itemsByProvider[providerKey];
                      if (!providerItems?.length) return null;
                      const providerDiscount = providerItems.reduce((s, it) => s + (itemPromoDiscounts[it.id] ?? 0), 0);
                      return (
                        <View key={providerKey} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: P.accentText }}>
                            {promo.promo_code?.toUpperCase()}
                          </Text>
                          <Text style={{ flex: 1, fontSize: 12, color: P.sub }} numberOfLines={1}>
                            {providerItems[0]?.providerDisplayName ?? providerKey}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#30D158' }}>
                            −£{providerDiscount.toFixed(2)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Summary - USE EFFECTIVE TOTALS + SERVICE FEE NOTE */}
                <View style={[styles.summary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                  <View style={styles.summaryRow}>
                    <Text style={dynamicStyles.summaryLabel}>Subtotal</Text>
                    <Text style={dynamicStyles.summaryValue}>£{effectiveTotalNoPromo.toFixed(2)}</Text>
                  </View>
                  {promoSavingsShown > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={[dynamicStyles.summaryLabel, { color: '#30D158' }]}>Promo Discount</Text>
                      <Text style={[dynamicStyles.summaryValue, { color: '#30D158' }]}>−£{promoSavingsShown.toFixed(2)}</Text>
                    </View>
                  )}
                  {platformFee > 0 && <View style={styles.summaryRow}>
                    <Text style={dynamicStyles.summaryLabel}>Platform Fee</Text>
                    <Text style={dynamicStyles.summaryValue}>£{platformFee.toFixed(2)}</Text>
                  </View>}
                  <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: P.border }]}>
                    <Text style={dynamicStyles.totalLabel}>Total</Text>
                    <Text style={dynamicStyles.totalValue}>£{effectiveFinalTotal.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Checkout Button - USE EFFECTIVE TOTAL. marginBottom tops up
                    to FLOATING_TAB_BAR_CLEARANCE on top of whatever the
                    screen's own SafeAreaView already reserves for the home
                    indicator (insets.bottom) — this screen sits under
                    IslandPillTabBar's floating pill, and a flat spacing.xxl
                    margin left "Book All" sitting right under it. */}
                <TouchableOpacity
                  style={[
                    styles.checkoutButton,
                    { backgroundColor: P.accent, marginBottom: Math.max(spacing.xxl, FLOATING_TAB_BAR_CLEARANCE - insets.bottom) },
                    isLoading && styles.disabledButton,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleCheckout();
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={P.onAccent} size="small" />
                  ) : (
                    <Text style={[styles.checkoutText, { color: P.onAccent }]}>
                      Book All • £{effectiveFinalTotal.toFixed(2)}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Multi-booking guide — only relevant once there's still an
                    unscheduled item; items added from the provider profile
                    already arrive with their own date/time, so this stays
                    hidden for the now-common fully-scheduled cart. */}
                {hasUnscheduledItems && (
                  <View style={styles.multiBookingGuide}>
                    <Text style={[styles.multiBookingGuideTitle, { color: P.text }]}>
                      Booking more than one service?
                    </Text>
                    <View style={styles.multiBookingGuideList}>
                      {[
                        'Each service above gets its own appointment time',
                        'Mix services from different providers in one cart',
                        'Set a date and time for every service, then check out once',
                      ].map((tip) => (
                        <View key={tip} style={styles.multiBookingGuideRow}>
                          <Text style={[styles.multiBookingGuideTick, { color: P.accentText }]}>✓</Text>
                          <Text style={[styles.multiBookingGuideBody, { color: P.sub }]}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyCart}>
                <Text style={dynamicStyles.emptyTitle}>Cart is Empty</Text>
                <Text style={dynamicStyles.emptyText}>Add services to get started</Text>
                <TouchableOpacity
                  style={[styles.browseButton, { backgroundColor: P.accent }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    handleContinueShopping();
                  }}
                >
                  <Text style={[styles.browseText, { color: P.onAccent }]}>Browse Services</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
      <DialogHost />
    </ErrorBoundary>
  );
};
const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: dimensions.navBackButton.width,
    height: dimensions.navBackButton.height,
    borderRadius: dimensions.navBackButton.borderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fonts.title.large,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
  },
  title: {
    fontSize: fonts.title.medium,
    fontFamily: 'BakbakOne-Regular',
  },
  clearText: {
    fontSize: 11,
    fontFamily: 'BakbakOne-Regular',
    color: '#F44336',
  },

  // Header Right Buttons
  headerRightButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bookingsButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
  },
  bookingsText: {
    fontSize: 11,
    fontFamily: 'BakbakOne-Regular',
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(244,67,54,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
  },

  // Error Banner
  errorBanner: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    marginHorizontal: spacing.xl,
    marginVertical: spacing.md,
    padding: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#c62828',
    fontSize: fonts.body.medium,
    flex: 1,
  },
  errorDismiss: {
    color: '#c62828',
    fontSize: fonts.title.medium,
    fontWeight: 'bold',
    marginLeft: spacing.md,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  scrollContent: {
    paddingBottom: dimensions.scroll.paddingBottom,
    flexGrow: 1,
  },

  // Provider Section
  providerSection: {
    borderRadius: dimensions.card.borderRadius,
    marginBottom: spacing.lg,
    paddingTop: spacing.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  // Per-card Edit pill — used by both a single service card (edits it
  // directly) and a group card (opens the chooser).
  itemEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1.5,
  },
  itemEditButtonText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: 'bold',
  },

  // Collapse/expand control at the foot of each provider section.
  collapseHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  collapseHandleText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
  },
  providerLogo: {
    width: dimensions.providerLogo.size + 10,
    height: dimensions.providerLogo.size + 10,
    borderRadius: (dimensions.providerLogo.size + 10) / 2,
    borderWidth: dimensions.providerLogo.borderWidth,
  },
  providerLogoContainer: {
    position: 'relative',
    marginRight: dimensions.providerLogo.marginRight + 4,
  },
  serviceTypePill: {
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
    borderWidth: 1,
  },
  serviceTypeText: {
    fontSize: fonts.serviceTag,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: 'bold',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: fonts.providerName + 3,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.xs,
  },
  providerStats: {
    fontSize: fonts.ratingText,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginTop: spacing.sm,
  },

  // Services List
  servicesList: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  serviceItemWrapper: {
    marginBottom: 0,
  },
  serviceSeparator: {
    height: 1,
    marginVertical: spacing.lg,
    marginHorizontal: spacing.md,
    borderRadius: 1,
  },

  // Service Card
  serviceCard: {
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  serviceCardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  conflictBannerText: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: fonts.serviceText,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: 1,
  },
  // Add-ons/deposit/notes as one tight block under the header, rather than
  // three separately-margined full-width rows.
  serviceMetaBlock: {
    marginTop: spacing.xs,
    gap: 2,
  },
  // Duration, directly under the service name in the header.
  priceSummaryText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  // Bold/darker so add-ons read as labelled paid extras rather than blending
  // into the plain secondary-text lines around them. Spacing is owned by the
  // serviceMetaBlock wrapper, not this line.
  priceSummaryAddOns: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
  },
  priceSummaryValue: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '700',
  },
  depositNote: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  removeButton: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  removeText: {
    fontSize: fonts.title.medium,
    fontWeight: 'bold',
  },

  // Schedule row — plain long-form date/time text. Not interactive: editing
  // is reached from the provider header's Edit button.
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dateText: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  dateTextWarning: {
    color: '#D32F2F',
    fontWeight: 'bold',
  },
  // "Which service?" chooser, opened from a provider header with >1 service.
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pickerSheet: {
    borderRadius: dimensions.card.borderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  pickerTitle: {
    fontSize: fonts.title.medium,
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickerRowFirst: {
    borderTopWidth: 0,
  },
  pickerSubtitle: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  pickerSectionLabel: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.3,
    marginTop: spacing.lg,
    marginBottom: 2,
  },
  pickerRowHint: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    marginTop: 1,
  },

  // Group reschedule sheet — bottom sheet (not the centred chooser dialog),
  // since it holds a calendar and needs the height.
  groupSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  groupSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  groupSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  groupSheetHeaderText: {
    flex: 1,
  },
  groupSheetPreview: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupSheetSpanRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupSheetSpanText: {
    fontSize: fonts.title.small,
    fontFamily: 'BakbakOne-Regular',
  },
  groupSheetSpanTotal: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  groupSheetPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 3,
  },
  groupSheetPreviewName: {
    flex: 1,
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  groupSheetPreviewTime: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
  },
  groupSheetConfirm: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  groupSheetConfirmText: {
    color: '#FFFFFF',
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
  },

  // Grouped card — services scheduled back-to-back, shown as one appointment.
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groupHeaderSpacer: {
    flex: 1,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 9,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  groupHeaderDate: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
  },
  groupHeaderSpan: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    marginTop: 1,
  },
  groupRows: {
    marginTop: spacing.md,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupRowInfo: {
    flex: 1,
  },
  groupRowName: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    marginBottom: 1,
  },
  groupRowMeta: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  groupRowAddOns: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    marginTop: 1,
  },
  groupRowDeposit: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    marginTop: 1,
  },
  groupRowPrice: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
  },
  groupRowRemove: {
    paddingLeft: 2,
    marginTop: -2,
  },
  groupFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  groupFooterBreakdown: {
    gap: 2,
  },
  groupFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupFooterLabel: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  groupFooterTotalLabel: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
  },
  groupFooterValue: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
  },
  pickerRowInfo: {
    flex: 1,
  },
  pickerRowName: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    marginBottom: 2,
  },
  pickerRowMeta: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  pickerCancel: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  pickerCancelText: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
  },
  notesPreview: {
    fontSize: fonts.body.xsmall,
  },

  // Disabled Button State
  disabledButton: {
    opacity: 0.5,
  },

  // Summary - ADDED SERVICE FEE NOTE
  summary: {
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    color: '#000',
  },
  summaryValue: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    color: '#000',
    fontWeight: '700',
  },
  serviceFeeNote: {
    // ADD THIS
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(126,102,103,0.2)',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  totalValue: {
    fontSize: fonts.title.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },

  // Checkout Button
  checkoutButton: {
    borderRadius: dimensions.button.large.borderRadius,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    alignItems: 'center',
  },
  checkoutText: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
    textAlign: 'center',
  },

  // Multi-booking guide — plain inline block, not a card
  multiBookingGuide: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xxl,
  },
  multiBookingGuideTitle: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  multiBookingGuideList: {
    gap: 8,
  },
  multiBookingGuideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  multiBookingGuideTick: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  multiBookingGuideBody: {
    flex: 1,
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    lineHeight: 16,
  },

  // Empty Cart
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: dimensions.emptyState.cardPadding,
  },
  emptyTitle: {
    fontSize: fonts.title.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  browseButton: {
    borderRadius: dimensions.card.borderRadius,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  browseText: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
  },

  // Error Card
  errorCard: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontSize: fonts.body.medium,
    color: '#F44336',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: '#F44336',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: '#fff',
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
  },

  // Payment Modal Styles - UPDATED TEXT COLORS FOR CLARITY
  paymentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
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
  paymentMethodsTitle: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    marginBottom: spacing.lg,
  },
  paymentMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentMethodIcon: {
    fontSize: fonts.title.small,
    marginRight: spacing.md,
  },
  paymentMethodName: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    flex: 1,
  },
  paymentMethodRadio: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardDetails: {
    marginBottom: spacing.xxl,
  },
  cardDetailsTitle: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000', // CLEAR BLACK
    marginBottom: spacing.lg,
  },
  cardInput: {
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardInputHalf: {
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

  // Modal Overlay without additional opacity
  modalOverlayNoBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // Liquid Glass Success Modal Styles - ADDED BUTTONS CONTAINER
  liquidGlassSuccessModalNoBlur: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: dimensions.emptyState.cardPadding,
    borderRadius: dimensions.card.largeBorderRadius,
    width: '88%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  liquidGlassSuccessContent: {
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
  },
  liquidGlassSuccessIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(52,199,89,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.25)',
  },
  liquidGlassSuccessCheckmark: {
    fontSize: fonts.title.large,
    color: '#000',
    fontWeight: 'bold',
  },
  liquidGlassSuccessTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.title.medium,
    color: '#000',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  liquidGlassSuccessMessage: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: fonts.title.small,
    fontWeight: '900',
    color: 'rgba(0, 0, 0, 0.83)',
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  successButtonsContainer: {
    // ADD THIS
    width: '100%',
    gap: spacing.md,
  },
  liquidGlassSuccessButton: {
    borderRadius: dimensions.card.smallBorderRadius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  liquidGlassSuccessButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.body.large,
    color: '#000',
    fontWeight: '600',
  },

  // Review Modal Styles
  reviewModalContainer: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  reviewModalContent: {
    padding: 24,
  },
  reviewModalTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  reviewModalSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 20,
  },
  reviewFieldGroup: {
    marginBottom: 14,
  },
  reviewFieldLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
  },
  reviewInput: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reviewPhoneWarning: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
    color: '#FF3B30',
    marginTop: 4,
    marginLeft: 4,
  },
  safetyAckNotice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  safetyAckNoticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  reviewCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  reviewCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reviewCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCheckboxLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
  },
  requiredAsterisk: {
    color: '#FF3B30',
    fontWeight: '700',
  },
  reviewButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reviewCancelBtn: {
    flex: 1,
    borderRadius: 100,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
  },
  reviewCancelText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  reviewConfirmBtn: {
    flex: 2,
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
  },
  reviewConfirmText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 0.5,
    color: '#fff',
  },

  // Edit toggle
  reviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  reviewEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 8,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  reviewEditText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  reviewFieldValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },

  // Booking Summary — centred-card presentation (small carts)
  summaryModalContainer: {
    maxHeight: '85%',
  },

  // Booking Summary — full-screen presentation (FULL_SCREEN_SUMMARY_THRESHOLD+)
  summaryScreen: {
    flex: 1,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryBackBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeaderTitles: {
    flex: 1,
  },
  summaryScroll: {
    flex: 1,
  },
  summaryScrollContent: {
    padding: 20,
    paddingBottom: 28,
  },
  summaryFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Same-provider grouping inside the APPOINTMENTS section
  summaryProviderGroup: {
    marginTop: 10,
  },
  summaryProviderHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryProviderName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  summaryProviderMeta: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
  },
  summarySection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summarySectionTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  summaryCustomerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 3,
  },
  summaryCustomerDetail: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 2,
  },
  summaryBookingItem: {
    paddingVertical: 8,
  },
  summaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  summaryItemService: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  summaryItemPrice: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },
  summaryItemAddOns: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  summaryItemDateTime: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 11,
  },
  // Group block: its own rounded, accent-bordered box so the grouped services
  // are visibly fenced off as one appointment — the flat badge alone didn't
  // read as obviously grouped against the surrounding plain rows.
  summaryGroupBlock: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
  },
  summaryGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 5,
  },
  summaryGroupBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  summaryGroupRows: {
    marginTop: 6,
  },
  summaryGroupRow: {
    paddingVertical: 5,
  },
  summaryGroupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryGroupFooterLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryGroupFooterValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryTotalLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
  },
  summaryTotalValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryGrandTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginBottom: 0,
  },
  summaryGrandLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
  },
  summaryGrandValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 17,
  },
});
export default CartScreen;
