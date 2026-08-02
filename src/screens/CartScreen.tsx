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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStripe } from '@stripe/stripe-react-native';
import { useCart, CartItem } from '../contexts/CartContext';
import { useBooking, AppointmentData } from '../contexts/BookingContext';
import { BookingService, DepositPolicy } from '../services/bookingService';
import { AvailabilityService } from '../services/AvailabilityService';
import { createPaymentIntent, capturePaymentIntent, cancelPaymentIntent } from '../services/stripeService';
import {
  getProviderDepositPoliciesByDisplayNames,
  ProviderDepositPolicy,
  validatePromoCode,
  getUserHealthProfile,
  getConsultationRequiredProviderIds,
  getProviderIdsWithBookingHistory,
  getConsultationServiceIds,
  getProviderConsultationService,
} from '../services/databaseService';
import type { DbPromotion } from '../types/database';
import type { CartScreenProps } from '../navigation/types';
import ErrorBoundary from '../components/ErrorBoundary';
import { FONT_SIZES } from '../constants/Typeography';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';
import { ThemedBackground } from '../components/ThemedBackground';
import { getMobileProviderDisplayNames } from '../services/databaseService';
import { BookingError } from '../contexts/BookingContext';
import { useAppDialog } from '../components/AppDialog';
import { BookingSheet, type BookingSheetResult } from '../components/BookingSheet';

// Flip to true to switch checkout from the mock PaymentModal (fake, instant,
// no real Stripe call) to StripePaymentModal (real test-mode Stripe Payment
// Sheet — card, Apple Pay, Google Pay). Both share the same props interface,
// so this is the only line that needs to change either direction.
const USE_STRIPE_PAYMENTS = false;
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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
    const { theme, isDarkMode, palette: P } = useTheme();
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

    const [showSuccessModal, setShowSuccessModal] = useState(false);
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
      logger.log(`\n[${timestamp()}] Setting success modal visible...`);
    }
    setShowSuccessModal(true);
    if (__DEV__) {
      logger.log(`[${timestamp()}] Success modal set to visible`);
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
}, [totalAmount, onPaymentSuccess, onPaymentComplete, onClose, onBookingFailed]);

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
                <TouchableOpacity style={styles.paymentCloseButton} onPress={onClose}>
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
                    <Text style={[styles.orderTotalLabel, { color: theme.text }]}>Total</Text>
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
                        selectedPaymentMethod === method.id && { borderColor: P.accent, backgroundColor: 'rgba(175,145,151,0.1)' },
                      ]}
                      onPress={() => setSelectedPaymentMethod(method.id as any)}
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
                style={[styles.payButton, { backgroundColor: P.accent }, isProcessing && { backgroundColor: 'rgba(175,145,151,0.5)' }]}
                onPress={handlePayment}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.payButtonText}>Pay £{totalAmount.toFixed(2)}</Text>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    );
  }
);

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
    onPaymentSuccess,
    onPaymentComplete,
    onBookingFailed,
  }) => {
    const { theme, isDarkMode, palette: P } = useTheme();
    const { initPaymentSheet, presentPaymentSheet } = useStripe();
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
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
        if (__DEV__) logger.log(`[${timestamp()}] Creating PaymentIntent for £${totalAmount.toFixed(2)}...`);
        const { clientSecret, paymentIntentId } = await createPaymentIntent(totalAmount);

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
              colors: { background: P.accent, text: '#FFFFFF', border: P.accent },
              shapes: { borderRadius: 20 },
            },
          },
          // Requires a real Apple merchant ID registered in your Apple
          // Developer account and linked in the Stripe Dashboard — the
          // placeholder in app.json's plugin config ("merchant.com.cerviced")
          // unblocks the build but Apple Pay won't actually appear/function
          // until that registration is real.
          applePay: { merchantCountryCode: 'GB' },
          // Works out of the box in Stripe test mode. app.json's plugin
          // config also needs enableGooglePay: true (currently false) for
          // this to take effect on Android.
          googlePay: { merchantCountryCode: 'GB', testEnv: __DEV__ },
        });
        if (initError) {
          throw new Error(initError.message || 'Could not start payment.');
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === 'Canceled') {
            if (__DEV__) logger.log(`[${timestamp()}] Payment sheet cancelled by user`);
            return;
          }
          throw new Error(presentError.message || 'Payment failed. Please try again.');
        }

        if (__DEV__) logger.log(`[${timestamp()}] Payment authorised (${paymentIntentId}). Calling onPaymentSuccess...`);
        try {
          await onPaymentSuccess('card', paymentIntentId);
          // Booking exists now — actually take the payment. If this specific
          // call fails, the booking still stands (don't fail the whole flow
          // retroactively for something the client already got); it just
          // means the authorised card needs a manual capture from the
          // Stripe dashboard before the ~7-day hold expires.
          try {
            await capturePaymentIntent(paymentIntentId);
          } catch (captureError) {
            logger.error(`💰 [${timestamp()}] ⚠️ Booking succeeded but capture FAILED — needs manual Stripe capture:`, paymentIntentId, captureError);
          }
        } catch (bookingError) {
          logger.error(`💰 [${timestamp()}] ❌ onPaymentSuccess FAILED:`, bookingError);
          // A multi-service cart can partially succeed — some bookings
          // persisted before a sibling item failed. Cancelling the WHOLE
          // authorisation in that case would leave those succeeded bookings
          // marked paid in the DB while the card was never actually
          // charged for them. Capture only what was actually earned instead;
          // only cancel outright when nothing booked at all.
          const succeededAmount = bookingError instanceof BookingError ? bookingError.succeededAmountPaid : 0;
          if (succeededAmount > 0) {
            try {
              await capturePaymentIntent(paymentIntentId, succeededAmount);
            } catch (captureError) {
              logger.error(`💰 [${timestamp()}] ⚠️ Partial booking succeeded but partial capture FAILED — needs manual Stripe capture of £${succeededAmount.toFixed(2)}:`, paymentIntentId, captureError);
            }
          } else {
            // Nothing booked — release the card hold so the client is never
            // left charged with nothing to show for it. Best-effort: if this
            // also fails, the hold still auto-expires (~7 days).
            try {
              await cancelPaymentIntent(paymentIntentId);
            } catch (cancelError) {
              logger.error(`💰 [${timestamp()}] ⚠️ Failed to release payment hold after booking failure:`, paymentIntentId, cancelError);
            }
          }
          throw bookingError;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        onPaymentComplete();
        setShowSuccessModal(true);
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
    }, [totalAmount, initPaymentSheet, presentPaymentSheet, onPaymentSuccess, onPaymentComplete, onClose, onBookingFailed, P, theme, isDarkMode]);

    return (
      <Modal visible={isVisible} animationType="fade" transparent={true}>
        <View style={styles.paymentOverlay}>
          <View style={[styles.paymentModal, { backgroundColor: P.bg }]}>
            <SafeAreaView style={styles.paymentModalContent}>
              <View style={[styles.paymentHeader, { borderBottomColor: P.border }]}>
                <Text style={[styles.paymentTitle, { color: theme.text }]}>Complete Payment</Text>
                <TouchableOpacity style={styles.paymentCloseButton} onPress={onClose}>
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
                    <Text style={[styles.orderTotalLabel, { color: theme.text }]}>Total</Text>
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
                style={[styles.payButton, { backgroundColor: P.accent }, isProcessing && { backgroundColor: 'rgba(175,145,151,0.5)' }]}
                onPress={handlePayment}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.payButtonText}>Pay £{totalAmount.toFixed(2)}</Text>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    );
  }
);

// Service Card Component
interface ServiceCardProps {
  item: CartItem;
  bookingInfo: ServiceBooking;
  onRemove: (itemId: string) => void;
  onEdit: (item: CartItem) => void;
  allCartItems: CartItem[];
  depositPolicy?: ProviderDepositPolicy;
}

const ServiceCard: React.FC<ServiceCardProps> = memo(
  ({
    item,
    bookingInfo,
    onRemove,
    onEdit,
    allCartItems,
    depositPolicy,
  }) => {
    const { theme, palette: P } = useTheme();
    const { showConfirm, DialogHost } = useAppDialog();
    const [isLoading, setIsLoading] = useState(false);

    // Calculate total price safely with null checks
    const totalPrice = useMemo(() => {
      try {
        const basePrice = Number(item?.price) || 0;
        const addOnsTotal = (item?.addOns || []).reduce((sum: number, addOn: any) => {
          return sum + (Number(addOn?.price) || 0);
        }, 0);
        return basePrice + addOnsTotal;
      } catch (error) {
        logger.error('Error calculating price:', error);
        return Number(item?.price) || 0;
      }
    }, [item?.price, item?.addOns]);

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
        showConfirm('Remove Service', `Remove ${item.serviceName} from cart?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => onRemove(item.id),
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
            <TouchableOpacity style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={[styles.serviceCard, styles.serviceCardShadow, { backgroundColor: P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
          {/* Service Info */}
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceName, { color: theme.text }]}>
                {serviceName}
                {showInstanceNumber ? ` #${serviceInstanceIndex}` : ''}
                {bookingInfo.isDepositOnly && ' (Deposit)'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.removeButton, isLoading && styles.disabledButton]}
              onPress={handleRemove}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#333" />
              ) : (
                <Text style={styles.removeText}>×</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Booking breakdown — base price, add-ons, duration, and how the
              payment splits, all itemised in one place instead of scattered
              across separate lines. */}
          <View style={[styles.breakdownContainer, { backgroundColor: P.bg, borderColor: P.border }]}>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]}>Base Price</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>£{Number(item?.price || 0).toFixed(2)}</Text>
            </View>
            {(item?.addOns || []).map((addOn: any, index: number) => (
              <View key={addOn?.id || index} style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]} numberOfLines={1}>
                  • {addOn?.name || 'Unknown'}
                </Text>
                <Text style={[styles.breakdownValue, { color: theme.text }]}>+£{Number(addOn?.price || 0).toFixed(2)}</Text>
              </View>
            ))}
            {item?.addOns && item.addOns.length > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]}>Subtotal</Text>
                <Text style={[styles.breakdownValue, { color: theme.text }]}>£{totalPrice.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]}>Duration</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>{duration}</Text>
            </View>

            <View style={[styles.breakdownDivider, { backgroundColor: P.border }]} />

            {bookingInfo.isDepositOnly ? (
              <>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]}>Deposit Due Now</Text>
                  <Text style={[styles.breakdownValue, { color: P.accent }]}>
                    £{BookingService.calculateDeposit(totalPrice, depositPolicyArg).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: theme.secondaryText }]}>Due at Appointment</Text>
                  <Text style={[styles.breakdownValue, { color: theme.text }]}>
                    £{BookingService.calculateRemainingBalance(totalPrice, depositPolicyArg).toFixed(2)}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownTotalLabel, { color: theme.text }]}>Total</Text>
                <Text style={[styles.breakdownTotalValue, { color: P.accent }]}>£{effectivePrice.toFixed(2)}</Text>
              </View>
            )}
          </View>

          {!!bookingInfo.notes && (
            <Text style={[styles.notesPreview, { color: P.sub }]} numberOfLines={2}>
              Notes: {bookingInfo.notes}
            </Text>
          )}

          {/* Schedule + Edit — the date/time indicator is now the edit
              trigger itself, replacing the separate Edit button below it. */}
          <TouchableOpacity
            style={[styles.bookingSummaryRow, !isScheduled && styles.bookingSummaryRowWarning]}
            onPress={() => onEdit(item)}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.bookingSummaryText, !isScheduled && styles.bookingSummaryTextWarning]}
              numberOfLines={1}
            >
              {isScheduled
                ? `${new Date(bookingInfo.selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${bookingInfo.selectedTime}`
                : 'Unscheduled'}
            </Text>
            <View style={styles.bookingSummaryEdit}>
              <Ionicons
                name="pencil-outline"
                size={13}
                color={isScheduled ? '#2E7D32' : '#D32F2F'}
              />
              <Text style={[styles.bookingSummaryEditText, !isScheduled && styles.bookingSummaryTextWarning]}>
                Edit
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <DialogHost />
      </ErrorBoundary>
    );
  }
);

// Main Cart Screen Component
const CartScreen: React.FC<CartScreenProps<'CartMain'>> = ({ navigation }) => {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();

  const {
    items,
    totalItems,
    totalPrice,
    removeFromCart,
    updateCartItem,
    clearCart,
    getServiceFee,
    getFinalTotal,
    getItemsByProvider,
    getBookingSummary,
    addToCart,
  } = useCart();

  const { createBookingsFromCart } = useBooking();
  const { user, updateUser } = useAuth();

  // State management
  const [providerDepositPolicies, setProviderDepositPolicies] = useState<Record<string, ProviderDepositPolicy>>({});
  // BookingSheet in edit mode — opened per cart item via ServiceCard's Edit button
  const [showBookingSheet, setShowBookingSheet] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  // Set right after auto-adding a required consultation to the cart (see
  // handleCheckout) — the effect below opens its date/time picker as soon
  // as the new item actually shows up in `items`, since addToCart() is a
  // dispatch and the item isn't available synchronously.
  const [pendingConsultationSchedule, setPendingConsultationSchedule] = useState<{ providerId: string; serviceId: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);
  const [paymentTotal, setPaymentTotal] = useState(0); // ADD THIS

  const [checkoutSnapshot, setCheckoutSnapshot] = useState<{
  items: CartItem[];
  bookings: Record<string, ServiceBooking>;
}>({ items: [], bookings: {} });
  const [refreshing, setRefreshing] = useState(false);

  // Customer details review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewEmail, setReviewEmail] = useState('');
  const [reviewPhone, setReviewPhone] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [confirmedCustomerInfo, setConfirmedCustomerInfo] = useState<{
    name: string; email: string; phone: string;
  } | null>(null);
  const [showBookingSummaryModal, setShowBookingSummaryModal] = useState(false);
  const [hasMobileProvider, setHasMobileProvider] = useState(false);
  const [clientAddress, setClientAddress] = useState('');
  // Providers in the cart that require a consultation before a new client's
  // first booking, which of those the client already has history with, and
  // which cart items are themselves consultation bookings — used to block
  // checkout on a non-consultation service with a first-time provider that
  // requires one. App-level check, same as every other createBooking()
  // checkout validation (date-in-past, availability, blocked dates).
  const [consultationRequiredProviderIds, setConsultationRequiredProviderIds] = useState<Set<string>>(new Set());
  const [providersWithHistory, setProvidersWithHistory] = useState<Set<string>>(new Set());
  const [consultationServiceIds, setConsultationServiceIds] = useState<Set<string>>(new Set());

  // Memoize expensive calculations properly
  const itemsByProvider = useMemo(() => {
    try {
      return getItemsByProvider();
    } catch (error) {
      logger.error('Error getting items by provider:', error);
      return {};
    }
  }, [items]);

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
  }, [items, totalPrice]);

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
      const itemTotal = (Number(item.price) || 0) +
        (item.addOns ?? []).reduce((s, a) => s + (Number(a.price) || 0), 0);
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

  const totalPromoDiscount = useMemo(
    () => Object.values(itemPromoDiscounts).reduce((s, v) => s + v, 0),
    [itemPromoDiscounts]
  );

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
      // Inline calculation without nested useMemo
      const basePrice = Number(item?.price) || 0;
      const addOnsTotal = (item?.addOns || []).reduce((s: number, addOn: any) => {
        return s + (Number(addOn?.price) || 0);
      }, 0);
      // Promo discount comes off before any deposit is calculated
      const itemTotalPrice = basePrice + addOnsTotal - (itemPromoDiscounts[item.id] ?? 0);
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

  const effectiveFinalTotal = useMemo(
    () => effectiveTotal + getServiceFee(),
    [effectiveTotal, getServiceFee]
  );

  // Same as effectiveTotal but WITHOUT promo discounts — used so the summary
  // reads Subtotal − Promo + Fee = Total exactly, even for deposit-only items
  // (where a promo only reduces the deposit proportionally).
  const effectiveTotalNoPromo = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = getServiceBooking(item.id);
      const basePrice = Number(item?.price) || 0;
      const addOnsTotal = (item?.addOns || []).reduce((s: number, addOn: any) => s + (Number(addOn?.price) || 0), 0);
      const itemTotalPrice = basePrice + addOnsTotal;
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

  // Compute effective cart items for payment modal
  const effectiveCartItems = useMemo(() => {
    return items.map(item => {
      const booking = getServiceBooking(item.id);
      const basePrice = Number(item?.price) || 0;
      const addOnsTotal = (item?.addOns || []).reduce((s: number, addOn: any) => {
        return s + (Number(addOn?.price) || 0);
      }, 0);
      const itemTotalPrice = basePrice + addOnsTotal - (itemPromoDiscounts[item.id] ?? 0);
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
  }, []);

  // Opens the date/time picker for an auto-added required consultation as
  // soon as it actually appears in the cart.
  useEffect(() => {
    if (!pendingConsultationSchedule) return;
    const newItem = items.find(
      i => i.providerId === pendingConsultationSchedule.providerId && i.serviceId === pendingConsultationSchedule.serviceId
    );
    if (newItem) {
      handleEditItem(newItem);
      setPendingConsultationSchedule(null);
    }
  }, [items, pendingConsultationSchedule, handleEditItem]);

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
        });
      } catch (error) {
        logger.error('Error saving booking edit:', error);
        showAlert("Couldn't save your changes", 'Please try again.');
      }
    },
    [editingItem, updateCartItem, showAlert]
  );

  // "Schedule together" — find one day where every service in this
  // provider's cart section fits back-to-back, instead of the client
  // picking a time for each service individually and hoping they don't
  // clash (or worse, discovering the clash only after paying). Order
  // follows how the services already appear in the cart.
  const [isSchedulingTogether, setIsSchedulingTogether] = useState(false);
  const handleScheduleTogether = useCallback(async (providerItems: CartItem[]) => {
    if (providerItems.length < 2) return;
    setIsSchedulingTogether(true);
    try {
      const providerKey = providerItems[0]!.providerId ?? providerItems[0]!.providerName;
      const result = await AvailabilityService.findNextBackToBackDay(
        providerKey,
        providerItems.map(item => ({ serviceId: item.serviceId, duration: item.duration }))
      );
      if (!result) {
        showAlert(
          'No Availability Found',
          "We couldn't find a day in the next couple of weeks with room for all these services back-to-back. Try scheduling them individually instead."
        );
        return;
      }
      const displayDate = new Date(result.date + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
      const summary = providerItems
        .map((item, i) => `${item.serviceName}: ${result.schedule[i]!.time}`)
        .join('\n');
      showConfirm(
        `Schedule for ${displayDate}?`,
        summary,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Schedule All',
            onPress: () => {
              providerItems.forEach((item, i) => {
                updateCartItem(item.id, {
                  selectedDate: result.date,
                  selectedTime: result.schedule[i]!.time,
                });
              });
            },
          },
        ]
      );
    } catch (error) {
      logger.error('Error scheduling services together:', error);
      showAlert("Couldn't find a shared time", 'Please try again or schedule these individually.');
    } finally {
      setIsSchedulingTogether(false);
    }
  }, [showAlert, showConfirm, updateCartItem]);

  // Detect if any provider in the cart is mobile (travels to client)
  useEffect(() => {
    if (items.length === 0) { setHasMobileProvider(false); return; }
    const names = [...new Set(items.map(i => i.providerDisplayName ?? i.providerName))];
    getMobileProviderDisplayNames(names)
      .then(mobileSet => setHasMobileProvider(mobileSet.size > 0))
      .catch(() => setHasMobileProvider(false));
  }, [items]);

  // Detect providers that require a consultation before a new client's first
  // booking, which of those the client already has booking history with, and
  // which cart items are themselves consultation services.
  useEffect(() => {
    if (items.length === 0) {
      setConsultationRequiredProviderIds(new Set());
      setProvidersWithHistory(new Set());
      setConsultationServiceIds(new Set());
      return;
    }
    const providerIds = [...new Set(items.map(i => i.providerId).filter((id): id is string => !!id))];
    const serviceIds = [...new Set(items.map(i => i.serviceId).filter((id): id is string => !!id && UUID_RE.test(id)))];

    getConsultationRequiredProviderIds(providerIds)
      .then(async requiredSet => {
        setConsultationRequiredProviderIds(requiredSet);
        if (requiredSet.size === 0) { setProvidersWithHistory(new Set()); return; }
        const historySet = await getProviderIdsWithBookingHistory([...requiredSet]);
        setProvidersWithHistory(historySet);
      })
      .catch(() => { setConsultationRequiredProviderIds(new Set()); setProvidersWithHistory(new Set()); });

    getConsultationServiceIds(serviceIds)
      .then(setConsultationServiceIds)
      .catch(() => setConsultationServiceIds(new Set()));
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

    // Providers who require a consultation before a new client's first
    // booking: auto-add their consultation service to the cart and open its
    // date/time picker immediately (via pendingConsultationSchedule, handled
    // in the effect above) rather than blocking with nowhere to go, or
    // silently adding it and hoping the client finds it themselves.
    if (consultationRequiredProviderIds.size > 0) {
      const needsConsultation = items.filter(item => {
        if (!item.providerId || !consultationRequiredProviderIds.has(item.providerId)) return false;
        if (item.serviceId && consultationServiceIds.has(item.serviceId)) return false; // this item IS the consultation
        if (providersWithHistory.has(item.providerId)) return false; // already a returning client
        const bookingConsultationInCart = items.some(
          other => other.providerId === item.providerId && other.serviceId && consultationServiceIds.has(other.serviceId)
        );
        return !bookingConsultationInCart;
      });
      // One at a time — if a client somehow needs consultations with two
      // different providers in the same cart, they'll get prompted for the
      // second on their next checkout attempt after finishing the first.
      const triggeringItem = needsConsultation[0];
      if (triggeringItem?.providerId) {
        const providerLabel = triggeringItem.providerDisplayName ?? triggeringItem.providerName;
        const consultService = await getProviderConsultationService(triggeringItem.providerId);
        setIsLoading(false);
        if (!consultService) {
          showAlert(
            'Consultation Required',
            `${providerLabel} requires a consultation before a new client's first booking but hasn't set one up yet — please message them directly.`
          );
          return;
        }
        const mins = consultService.durationMinutes;
        const durationLabel = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}min` : ''}`;
        addToCart({
          providerName: triggeringItem.providerName,
          providerDisplayName: triggeringItem.providerDisplayName,
          providerSlug: triggeringItem.providerSlug,
          providerId: triggeringItem.providerId,
          providerImage: triggeringItem.providerImage,
          providerService: consultService.categoryName,
          service: {
            id: consultService.id,
            name: consultService.name,
            price: consultService.price,
            duration: durationLabel,
            description: consultService.description,
          },
          quantity: 1,
        });
        // No alert here — BookingSheet opens right after (via the effect
        // above once the new item lands in `items`) and its own header
        // shows the consultation's name and price, which is enough to tell
        // the client what's happening without stacking two modals at once
        // (unreliable on Android, per BookingSheet's own opening comment).
        setPendingConsultationSchedule({ providerId: triggeringItem.providerId, serviceId: consultService.id });
        return;
      }
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
    // createBooking()'s own insert-time check, mid-checkout, after the card
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
  } catch (error) {
    logger.error('Checkout error:', error);
    showAlert('Something went wrong', 'We couldn\'t start checkout. Please try again.');
  } finally {
    setIsLoading(false);
  }
}, [items, getServiceBooking, effectiveFinalTotal, bookingsByItemId, user, appliedPromos, itemPromoDiscounts, showAlert, consultationRequiredProviderIds, consultationServiceIds, providersWithHistory, addToCart]);

  // Handle review modal confirmation
  const handleReviewConfirm = useCallback(async () => {
    // Validate phone is provided
    if (!reviewPhone.trim()) {
      showAlert('Phone Required', 'Please enter your phone number to continue.');
      return;
    }
    const digitsOnly = reviewPhone.replace(/[\s\-()+ ]/g, '');
    if (digitsOnly.length < 10) {
      showAlert('Check your phone number', 'Please enter a valid phone number.');
      return;
    }
    if (hasMobileProvider && !clientAddress.trim()) {
      showAlert('Address Required', 'Your provider is mobile and will travel to you. Please enter your address.');
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
      await updateUser({ name: reviewName, phone: reviewPhone });
    }

    setShowReviewModal(false);
    setShowBookingSummaryModal(true);
  }, [reviewName, reviewEmail, reviewPhone, saveAsDefault, updateUser, showAlert, hasMobileProvider, clientAddress]);

const handlePaymentSuccess = useCallback(async (paymentMethod: string, paymentIntentId?: string) => {
  if (__DEV__) {
    logger.log('═══════════════════════════════════════');
    logger.log('PAYMENT SUCCESS - FUNCTION CALLED');
    logger.log('═══════════════════════════════════════');
  }

  try {
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

    // Fetch client health data so the provider sees it immediately on the booking.
    // Allergies and medical notes are critical for the provider before accepting.
    try {
      const healthProfile = await getUserHealthProfile(user?.id ?? '');
      const parts: string[] = [];
      if (healthProfile?.allergies?.length) parts.push(`Allergies: ${(healthProfile.allergies as string[]).join(', ')}`);
      if (healthProfile?.medical_notes) parts.push(`Medical notes: ${healthProfile.medical_notes}`);
      if (parts.length) {
        const healthPrefix = `Health info: ${parts.join(' | ')}\n`;
        appointmentData = appointmentData.map(a => ({
          ...a,
          notes: healthPrefix + (a.notes || ''),
        }));
      }
    } catch {
      // Non-critical — booking proceeds without health data prefix
    }

    // Step 3: Create bookings IN CONTEXT
    if (__DEV__) {
      logger.log('STEP 3: Creating bookings in BookingContext...');
      logger.log('About to call createBookingsFromCart with:');
      logger.log('- Items:', itemsToBook.length);
      logger.log('- Appointments:', appointmentData.length);
    }
    try {
      await createBookingsFromCart(itemsToBook, appointmentData, clientAddress.trim() || undefined);
      if (__DEV__) {
        logger.log('STEP 3 COMPLETE - createBookingsFromCart returned');
      }
    } catch (bookingError) {
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
    // the ones that already went through.
    if (error instanceof BookingError) {
      error.succeededCartItemIds.forEach(id => removeFromCart(id));
    }
    // The caller (PaymentModal.handlePayment) owns showing the single
    // "Booking Failed" alert and closing the payment sheet — this only needs
    // to propagate the error up to it (after the diagnostics above).
    throw error;
  }
}, [checkoutSnapshot, createBookingsFromCart, effectiveFinalTotal, items, confirmedCustomerInfo, user, removeFromCart]);

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
    backText: { fontSize: 18, fontWeight: '600', color: theme.text, marginTop: -2 },
    headerTitle: { fontSize: 26, fontWeight: '600', fontFamily: 'BakbakOne-Regular', color: theme.text },
    title: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text },
    providerName: { fontSize: 12, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 2 },
    providerStats: { fontSize: 9, fontFamily: 'Jura-VariableFont_wght bold', fontWeight: '500', color: theme.secondaryText, marginTop: 3 },
    serviceName: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 3 },
    serviceDuration: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', color: theme.secondaryText, marginBottom: 6 },
    addOnsTitle: { fontSize: 9, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 5 },
    baseServicePrice: { fontSize: 8, fontFamily: 'Jura-VariableFont_wght bold', color: theme.secondaryText, marginBottom: 3, fontWeight: '300' },
    addOnItem: { fontSize: 8, fontFamily: 'Jura-VariableFont_wght bold', color: theme.secondaryText, marginBottom: 2, paddingLeft: 3 },
    fallbackTitle: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 10, textAlign: 'center' },
    fallbackLabel: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', color: theme.text, marginBottom: 3, marginTop: 6 },
    notesTitle: { fontSize: 14, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 3 },
    notesSubtitle: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', color: theme.secondaryText },
    characterCount: { fontSize: 8, color: theme.secondaryText, textAlign: 'right', marginBottom: 12 },
    cancelText: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text },
    summaryLabel: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', color: theme.text },
    summaryValue: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', color: theme.text, fontWeight: '600' },
    serviceFeeNote: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght', color: theme.secondaryText, textAlign: 'right', marginTop: 2 },
    totalLabel: { fontSize: 17, fontFamily: 'BakbakOne-Regular', color: theme.text },
    totalValue: { fontSize: 18, fontFamily: 'BakbakOne-Regular', color: theme.text },
    emptyTitle: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 8 },
    emptyText: { fontSize: 11, fontFamily: 'Jura-VariableFont_wght', color: theme.secondaryText, marginBottom: 16, textAlign: 'center' },
    paymentTitle: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text },
    paymentCloseText: { fontSize: 14, color: theme.text, fontWeight: 'bold' },
    orderSummaryTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 8 },
    orderItemName: { fontSize: 10, fontFamily: 'Jura-VariableFont_wght', color: theme.text, flex: 1 },
    orderItemPrice: { fontSize: 10, fontFamily: 'BakbakOne-Regular', color: theme.text },
    orderTotalLabel: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text },
    orderTotalAmount: { fontSize: 15, fontFamily: 'BakbakOne-Regular', color: theme.text, fontWeight: 'bold' },
    paymentMethodsTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 12 },
    paymentMethodName: { fontSize: 11, fontFamily: 'BakbakOne-Regular', color: theme.text, flex: 1 },
    cardDetailsTitle: { fontSize: 13, fontFamily: 'BakbakOne-Regular', color: theme.text, marginBottom: 12 },
    cardInput: { borderRadius: 8, padding: 9, marginBottom: 8, fontSize: 11, fontFamily: 'Jura-VariableFont_wght', borderWidth: 1 },
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
              onPress={handleContinueShopping}
              activeOpacity={0.7}
            >
              <Text style={dynamicStyles.backText}>←</Text>
            </TouchableOpacity>

            <Text style={dynamicStyles.headerTitle}>Cart ({String(totalItems ?? 0)})</Text>

            <View style={styles.headerRightButtons}>
              {/* View Bookings Button */}
              <TouchableOpacity
                style={[styles.bookingsButton, { backgroundColor: 'rgba(175,145,151,0.18)' }]}
                onPress={() => {
                  try {
                    navigation.navigate('Bookings'); // NAVIGATES TO BOOKINGS SCREEN
                  } catch (error) {
                    logger.error('Bookings navigation error:', error);
                    Alert.alert('Navigation Error', 'Unable to open bookings');
                  }
                }}
              >
                <Text style={styles.bookingsText}>View Bookings</Text>
              </TouchableOpacity>
              {/* Clear Button */}
              {items.length > 0 && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClearCart}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Error Display */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
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
                        style={[styles.reviewEditBtn, { backgroundColor: 'rgba(175,145,151,0.12)', borderColor: P.border }]}
                        onPress={() => setIsEditingDetails(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reviewEditText, { color: P.accent }]}>Edit</Text>
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
                      onPress={() => setSaveAsDefault(!saveAsDefault)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reviewCheckbox, {
                        borderColor: P.border,
                        backgroundColor: saveAsDefault ? P.accent : 'transparent',
                      }]}>
                        {saveAsDefault && <Text style={styles.reviewCheckmark}>✓</Text>}
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
                      onPress={handleReviewConfirm}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reviewConfirmText}>Continue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>

          {/* Booking Summary Modal */}
          <Modal visible={showBookingSummaryModal} animationType="fade" transparent={true}>
            <View style={styles.modalOverlayNoBlur}>
              <View style={[styles.reviewModalContainer, styles.summaryModalContainer, { backgroundColor: P.card, borderColor: P.border }]}>
                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                  <View style={styles.reviewModalContent}>
                    <Text style={[styles.reviewModalTitle, { color: P.text }]}>Booking Summary</Text>
                    <Text style={[styles.reviewModalSubtitle, { color: P.sub }]}>Review your appointments before payment</Text>

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
                      {checkoutSnapshot.items.map((item, index) => {
                        const booking = checkoutSnapshot.bookings[item.id] || {};
                        const basePrice = Number(item?.price) || 0;
                        const addOnsTotal = (item?.addOns || []).reduce((s: number, a: any) => s + (Number(a?.price) || 0), 0);
                        const itemTotal = basePrice + addOnsTotal;
                        const isDeposit = !!(booking as ServiceBooking).isDepositOnly;
                        // Use the provider's actual deposit policy (percent OR flat £) —
                        // never the 20% fallback, which silently ignores fixed-fee policies.
                        const itemPromoName = item.providerDisplayName ?? item.providerName;
                        const itemDepositPolicy = providerDepositPolicies[itemPromoName];
                        const itemDepositPolicyArg: DepositPolicy | number = itemDepositPolicy
                          ? { type: itemDepositPolicy.depositType, amount: itemDepositPolicy.depositAmount }
                          : 20;
                        const displayPrice = isDeposit ? BookingService.calculateDeposit(itemTotal, itemDepositPolicyArg) : itemTotal;
                        const b = booking as ServiceBooking;
                        return (
                          <View key={item.id}>
                            {index > 0 && <View style={[styles.summaryDivider, { backgroundColor: P.sep }]} />}
                            <View style={styles.summaryBookingItem}>
                              <View style={styles.summaryItemRow}>
                                <Text style={[styles.summaryItemService, { color: P.text }]} numberOfLines={1}>
                                  {item.serviceName}{isDeposit ? ' (Dep.)' : ''}
                                </Text>
                                <Text style={[styles.summaryItemPrice, { color: P.accent }]}>
                                  £{displayPrice.toFixed(2)}
                                </Text>
                              </View>
                              <Text style={[styles.summaryItemProvider, { color: P.sub }]}>
                                {item.providerDisplayName ?? item.providerName ?? ''}
                              </Text>
                              {b.selectedDate && b.selectedTime && (
                                <Text style={[styles.summaryItemDateTime, { color: P.sub }]}>
                                  {new Date(b.selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {b.selectedTime}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Totals */}
                    <View style={[styles.summarySection, { backgroundColor: P.surface, borderColor: P.sep }]}>
                      <View style={styles.summaryTotalRow}>
                        <Text style={[styles.summaryTotalLabel, { color: P.sub }]}>Subtotal</Text>
                        <Text style={[styles.summaryTotalValue, { color: P.text }]}>£{effectiveTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.summaryTotalRow}>
                        <Text style={[styles.summaryTotalLabel, { color: P.sub }]}>Platform Fee</Text>
                        <Text style={[styles.summaryTotalValue, { color: P.text }]}>£{getServiceFee().toFixed(2)}</Text>
                      </View>
                      <View style={[styles.summaryTotalRow, styles.summaryGrandTotalRow, { borderTopColor: P.sep }]}>
                        <Text style={[styles.summaryGrandLabel, { color: P.text }]}>Total</Text>
                        <Text style={[styles.summaryGrandValue, { color: P.accent }]}>£{effectiveFinalTotal.toFixed(2)}</Text>
                      </View>
                    </View>

                    {/* Buttons */}
                    <View style={styles.reviewButtonRow}>
                      <TouchableOpacity
                        style={[styles.reviewCancelBtn, { borderColor: P.border }]}
                        onPress={() => {
                          setShowBookingSummaryModal(false);
                          setShowReviewModal(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reviewCancelText, { color: P.text }]}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.reviewConfirmBtn, { backgroundColor: P.accent }]}
                        onPress={() => {
                          setShowBookingSummaryModal(false);
                          setShowPaymentModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.reviewConfirmText}>Confirm & Pay</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Payment Modal - PASS EFFECTIVE ITEMS & TOTAL */}
          {(() => {
            const ActivePaymentModal = USE_STRIPE_PAYMENTS ? StripePaymentModal : PaymentModal;
            return (
              <ActivePaymentModal
                isVisible={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                effectiveCartItems={effectiveCartItems}
                totalAmount={effectiveFinalTotal}
                onPaymentSuccess={(method, paymentIntentId) => handlePaymentSuccess(method, paymentIntentId)}
                onPaymentComplete={() => {
                  clearCart(); // Clear cart immediately after payment simulation
                  setShowPaymentModal(false);
                  setShowPaymentSuccessModal(true);
                }}
                onBookingFailed={(message) => showAlert('Booking Failed', message)}
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
                        style={styles.liquidGlassSuccessButton}
                        onPress={() => {
                          setShowPaymentSuccessModal(false);
                          navigation.navigate('Bookings'); // ✅ JUST NAVIGATE - bookings already created
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: P.accent }]}>View Bookings</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.liquidGlassSuccessButton}
                        onPress={() => {
                          setShowPaymentSuccessModal(false);
                          handleContinueShopping();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: P.accent }]}>Continue Shopping</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </Modal>
          )}

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
                tintColor="#AF9197"
                colors={['#AF9197']}
                progressBackgroundColor={isDarkMode ? '#252220' : '#FFF'}
              />
            }
          >
            {items.length > 0 ? (
              <>
                {/* Provider Sections — always shown, no expand/collapse */}
                {Object.entries(itemsByProvider).map(([providerName, providerItems]) => {
                  const providerData = bookingSummary.providers?.[providerName];

                  if (!providerData || !providerItems?.length) return null;

                  return (
                    <View key={providerName} style={[styles.providerSection, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                      {/* Provider Header */}
                      <View style={styles.providerHeader}>
                        <TouchableOpacity
                          style={[styles.headerEditButton, { borderColor: P.accent }]}
                          onPress={() => providerItems[0] && handleEditItem(providerItems[0])}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="pencil-outline" size={12} color={P.accent} />
                          <Text style={[styles.headerEditButtonText, { color: P.accent }]}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => navigateToProvider(providerItems)}>
                          <View style={styles.providerLogoContainer}>
                            {providerItems[0]?.providerImage ? (
                              <Image
                                source={providerItems[0].providerImage}
                                style={styles.providerLogo}
                              />
                            ) : (
                              <View style={[styles.providerLogo, { backgroundColor: isDarkMode ? '#333' : '#EEE' }]} />
                            )}
                          </View>
                        </TouchableOpacity>

                        <View style={styles.providerInfo}>
                          <Text style={dynamicStyles.providerName}>
                            {providerItems[0]?.providerDisplayName ?? providerName}
                          </Text>

                          {/* Service Type with Translucent Pill Background */}
                          <View style={styles.serviceTypePill}>
                            <Text style={styles.serviceTypeText}>
                              {providerItems[0]?.providerService || 'SERVICES'}
                            </Text>
                          </View>

                          <Text style={dynamicStyles.providerStats}>
                            {providerData.instanceCount} appointments • £
                            {providerData.total.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Multiple services with this one provider — offer to find one
                          day where they all fit back-to-back, instead of the client
                          scheduling each one individually and hoping they don't clash. */}
                      {providerItems.length > 1 && (
                        <TouchableOpacity
                          style={[styles.scheduleTogetherButton, { borderColor: P.accent }]}
                          onPress={() => handleScheduleTogether(providerItems)}
                          disabled={isSchedulingTogether}
                          activeOpacity={0.8}
                        >
                          {isSchedulingTogether ? (
                            <ActivityIndicator size="small" color={P.accent} />
                          ) : (
                            <>
                              <Ionicons name="calendar-outline" size={14} color={P.accent} />
                              <Text style={[styles.scheduleTogetherText, { color: P.accent }]}>
                                Schedule all {providerItems.length} together
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {/* Services List — always visible, breakdown included on each card */}
                      <View style={styles.servicesList}>
                        {providerItems.map((item, index) => (
                          <View key={item.id} style={styles.serviceItemWrapper}>
                            <ServiceCard
                              item={item}
                              bookingInfo={getServiceBooking(item.id)}
                              onRemove={removeFromCart}
                              onEdit={handleEditItem}
                              allCartItems={items}
                              {...(providerDepositPolicies[providerItems[0]?.providerDisplayName ?? providerName] !== undefined
                                ? { depositPolicy: providerDepositPolicies[providerItems[0]?.providerDisplayName ?? providerName] }
                                : {})}
                            />
                            {/* Visual Separator */}
                            {index < providerItems.length - 1 && (
                              <View style={styles.serviceSeparator} />
                            )}
                          </View>
                        ))}
                      </View>
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
                          <Text style={{ fontSize: 13, fontWeight: '700', color: P.accent }}>
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
                  <View style={styles.summaryRow}>
                    <Text style={dynamicStyles.summaryLabel}>Platform Fee</Text>
                    <Text style={dynamicStyles.summaryValue}>£{getServiceFee().toFixed(2)}</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={dynamicStyles.totalLabel}>Total</Text>
                    <Text style={dynamicStyles.totalValue}>£{effectiveFinalTotal.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Checkout Button - USE EFFECTIVE TOTAL */}
                <TouchableOpacity
                  style={[styles.checkoutButton, { backgroundColor: P.accent }, isLoading && styles.disabledButton]}
                  onPress={handleCheckout}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.checkoutText}>
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
                          <Text style={[styles.multiBookingGuideTick, { color: P.accent }]}>✓</Text>
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
                  onPress={handleContinueShopping}
                >
                  <Text style={styles.browseText}>Browse Services</Text>
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
  loadingText: {
    marginTop: spacing.md,
    fontSize: fonts.body.medium,
    color: '#AF9197',
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
  backText: {
    fontSize: fonts.body.large,
    fontWeight: '600',
    marginTop: -2,
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
    backgroundColor: 'rgba(175,145,151,0.18)',
    borderRadius: dimensions.card.smallBorderRadius,
  },
  bookingsText: {
    fontSize: 11,
    fontFamily: 'BakbakOne-Regular',
    color: '#AF9197',
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
  scheduleTogetherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  scheduleTogetherText: {
    fontSize: 13,
    fontWeight: '600',
  },
  providerLogo: {
    width: dimensions.providerLogo.size + 10,
    height: dimensions.providerLogo.size + 10,
    borderRadius: (dimensions.providerLogo.size + 10) / 2,
    borderWidth: dimensions.providerLogo.borderWidth,
    borderColor: 'rgba(175,145,151,0.25)',
  },
  providerLogoContainer: {
    position: 'relative',
    marginRight: dimensions.providerLogo.marginRight + 4,
  },
  serviceTypePill: {
    backgroundColor: 'rgba(175,145,151,0.15)',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(175,145,151,0.3)',
  },
  serviceTypeText: {
    fontSize: fonts.serviceTag,
    fontFamily: 'BakbakOne-Regular',
    color: '#AF9197',
    fontWeight: 'bold',
  },
  // Header Edit button — replaces the old "SCHEDULED X/Y" pill; opens
  // BookingSheet for this provider's (first) cart item.
  headerEditButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1.5,
    zIndex: 10,
  },
  headerEditButtonText: {
    fontSize: fonts.body.xsmall,
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
    fontFamily: 'Jura-VariableFont_wght bold',
    fontWeight: '500',
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
    backgroundColor: 'rgba(175,145,151,0.25)',
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
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: fonts.serviceText,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.xs,
  },
  // Booking breakdown — itemised base price, add-ons, duration, and payment
  // split. Replaces the old scattered price/duration/add-ons text.
  breakdownContainer: {
    padding: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  breakdownLabel: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  breakdownValue: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght bold',
  },
  breakdownDivider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  breakdownTotalLabel: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '700',
  },
  breakdownTotalValue: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '700',
  },
  removeButton: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    backgroundColor: 'rgba(175,145,151,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  removeText: {
    fontSize: fonts.title.medium,
    color: '#333',
    fontWeight: 'bold',
  },

  // Schedule row — date/time on the left, doubles as the item's Edit
  // trigger (tap anywhere on it) instead of a separate Edit button below.
  bookingSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  bookingSummaryRowWarning: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderColor: 'rgba(244,67,54,0.3)',
  },
  bookingSummaryText: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#2E7D32',
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  bookingSummaryTextWarning: {
    color: '#D32F2F',
  },
  bookingSummaryEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookingSummaryEditText: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  notesPreview: {
    fontSize: fonts.body.xsmall,
    marginBottom: spacing.sm,
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
    color: '#000',
  },
  summaryValue: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    color: '#000',
    fontWeight: '600',
  },
  serviceFeeNote: {
    // ADD THIS
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght',
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
    backgroundColor: '#AF9197',
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
    color: 'rgba(0,0,0,0.6)',
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  browseButton: {
    backgroundColor: '#AF9197',
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
  selectedPaymentMethod: {
    borderColor: '#AF9197',
    backgroundColor: 'rgba(175,145,151,0.1)',
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
  selectedPaymentMethodRadio: {
    borderColor: '#AF9197',
  },
  paymentMethodRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#AF9197',
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
    backgroundColor: '#AF9197',
    borderRadius: dimensions.button.large.borderRadius,
    padding: spacing.lg,
    alignItems: 'center',
    margin: spacing.xl,
    marginTop: 0,
  },
  payButtonDisabled: {
    backgroundColor: 'rgba(175,145,151,0.5)',
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
    backgroundColor: 'rgba(175,145,151,0.12)',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(175,145,151,0.3)',
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
    fontSize: 15,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reviewPhoneWarning: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: '#FF3B30',
    marginTop: 4,
    marginLeft: 4,
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
    fontSize: 13,
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
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },

  // Booking Summary Modal
  summaryModalContainer: {
    maxHeight: '85%',
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
  summaryItemProvider: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    marginBottom: 2,
  },
  summaryItemDateTime: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
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
    fontSize: 13,
  },
  summaryTotalValue: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
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
