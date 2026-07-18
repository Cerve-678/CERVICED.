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
import { useNavigation } from '@react-navigation/native';
import { useCart, CartItem } from '../contexts/CartContext';
import { useBooking, AppointmentData } from '../contexts/BookingContext';
import { BookingService, DepositPolicy } from '../services/bookingService';
import {
  getProviderDepositPoliciesByDisplayNames,
  ProviderDepositPolicy,
  validatePromoCode,
  getUserHealthProfile,
} from '../services/databaseService';
import type { DbPromotion } from '../types/database';
import type { CartScreenProps } from '../navigation/types';
import ErrorBoundary from '../components/ErrorBoundary';
import { FONT_SIZES } from '../constants/Typeography';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';
import { ThemedBackground } from '../components/ThemedBackground';
import { getMobileProviderDisplayNames, getProviderSchedulingConstraints } from '../services/databaseService';
import { BookingError } from '../contexts/BookingContext';
import { useAppDialog } from '../components/AppDialog';

// Static/demo services carry numeric ids — only a real UUID resolves to a services row
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// (Removed duplicate CartScreen definition. The correct CartScreen is defined below.)

// Service booking interface
interface ServiceBooking {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean; // ADD THIS
  depositPolicy?: DepositPolicy;
}

// Effective Item for Payment Modal
interface EffectiveCartItem {
  item: CartItem;
  effectivePrice: number;
  isDeposit: boolean;
}

// Fallback Calendar Component if ModernBeautyCalendar doesn't exist
interface CalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  selectedTime: string;
  providerName: string;
  serviceDuration?: string;
  serviceId?: string | undefined;
  maxDate?: Date;
}

const FallbackCalendar: React.FC<CalendarProps> = ({
  selectedDate,
  onDateSelect,
  onTimeSelect,
  selectedTime,
  providerName,
  serviceDuration: _serviceDuration,
}) => {
  const { theme } = useTheme();
  const [tempDate, setTempDate] = useState(selectedDate);
  const [tempTime, setTempTime] = useState(selectedTime);

  const handleConfirm = useCallback(() => {
    if (tempDate) onDateSelect(tempDate);
    if (tempTime) onTimeSelect(tempTime);
  }, [tempDate, tempTime, onDateSelect, onTimeSelect]);

  return (
    <View style={styles.fallbackCalendar}>
      <Text style={[styles.fallbackTitle, { color: theme.text }]}>Schedule with {providerName}</Text>

      <Text style={[styles.fallbackLabel, { color: theme.text }]}>Date (YYYY-MM-DD):</Text>
      <TextInput
        style={[styles.fallbackInput, { color: theme.text, borderColor: theme.secondaryText }]}
        value={tempDate}
        onChangeText={setTempDate}
        placeholder="2024-12-25"
        placeholderTextColor={theme.secondaryText}
      />

      <Text style={[styles.fallbackLabel, { color: theme.text }]}>Time:</Text>
      <TextInput
        style={[styles.fallbackInput, { color: theme.text, borderColor: theme.secondaryText }]}
        value={tempTime}
        onChangeText={setTempTime}
        placeholder="14:30"
        placeholderTextColor={theme.secondaryText}
      />

      <TouchableOpacity style={styles.fallbackButton} onPress={handleConfirm}>
        <Text style={styles.fallbackButtonText}>Confirm</Text>
      </TouchableOpacity>
    </View>
  );
};

// Try to import ModernBeautyCalendar safely
let ModernBeautyCalendar: React.FC<CalendarProps>;
try {
  ModernBeautyCalendar = require('../components/ModernBeautyCalendar').ModernBeautyCalendar;
} catch (error) {
  console.warn('ModernBeautyCalendar not found, using fallback');
  ModernBeautyCalendar = FallbackCalendar;
}

// Payment Modal Component
interface PaymentModalProps {
  isVisible: boolean;
  onClose: () => void;
  effectiveCartItems: EffectiveCartItem[];
  totalAmount: number;
  onPaymentSuccess: (paymentMethod: string) => Promise<void>;
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
      console.log(`[${timestamp()}] Payment already processing - ignoring duplicate call`);
    }
    return;
  }

  processingRef.current = true;
  if (__DEV__) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${timestamp()}] PAY BUTTON PRESSED`);
    console.log(`${'='.repeat(60)}\n`);
  }

  setIsProcessing(true);
  try {
    if (__DEV__) {
      console.log(`\n[${timestamp()}] Calling onPaymentSuccess...`);
    }
    const startTime = Date.now();
    await onPaymentSuccess(selectedPaymentMethod);
    if (__DEV__) {
      console.log(`[${timestamp()}] onPaymentSuccess completed in ${Date.now() - startTime}ms`);
    }

    if (__DEV__) {
      console.log(`\n[${timestamp()}] Waiting 500ms for AsyncStorage to complete...`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    if (__DEV__) {
      console.log(`[${timestamp()}] 500ms wait complete`);
    }

    if (__DEV__) {
      console.log(`\n[${timestamp()}] Calling onPaymentComplete (clearing cart)...`);
    }
    onPaymentComplete();
    if (__DEV__) {
      console.log(`[${timestamp()}] Cart cleared successfully`);
    }

    if (__DEV__) {
      console.log(`\n[${timestamp()}] Setting success modal visible...`);
    }
    setShowSuccessModal(true);
    if (__DEV__) {
      console.log(`[${timestamp()}] Success modal set to visible`);
    }

    if (__DEV__) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${timestamp()}] PAYMENT FLOW COMPLETE`);
      console.log(`${'='.repeat(60)}\n`);
    }
  } catch (error) {
    console.error(`❌ [${timestamp()}] Booking failed:`, error);

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
      console.log(`[${timestamp()}] Setting isProcessing to false`);
    }
    setIsProcessing(false);
    processingRef.current = false; // ✅ Reset processing guard
    if (__DEV__) {
      console.log(`[${timestamp()}] isProcessing set to false\n`);
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
      <Modal visible={isVisible} animationType="slide" transparent={true}>
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

// Notes Modal Component
interface NotesModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (notes: string) => void;
  serviceName: string;
  providerName: string;
  instanceNumber: number;
  currentNotes: string;
}

const NotesModal: React.FC<NotesModalProps> = memo(
  ({ isVisible, onClose, onSave, serviceName, providerName, instanceNumber, currentNotes }) => {
    const { isDarkMode, palette: P } = useTheme();
    const { showAlert, DialogHost } = useAppDialog();
    const [notes, setNotes] = useState(currentNotes);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
      setNotes(currentNotes);
    }, [currentNotes]);

    const handleSave = useCallback(async () => {
      try {
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 100));
        onSave(notes.trim());
        onClose();
      } catch (error) {
        console.error('Error saving notes:', error);
        showAlert('Couldn\'t save your note', 'Please try again.');
      } finally {
        setIsLoading(false);
      }
    }, [notes, onSave, onClose, showAlert]);

    return (
      <Modal visible={isVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.notesModal, { backgroundColor: isDarkMode ? 'rgba(37,34,32,0.97)' : 'rgba(255,255,255,0.95)', borderColor: P.border }]}>
            <View style={styles.notesHeader}>
              <Text style={[styles.notesTitle, { color: P.text }]}>Add Notes</Text>
              <Text style={[styles.notesSubtitle, { color: P.sub }]}>
                {serviceName} #{instanceNumber} • {providerName}
              </Text>
            </View>

            <TextInput
              style={[styles.notesInput, { backgroundColor: isDarkMode ? 'rgba(42,38,36,0.6)' : 'rgba(255,255,255,0.5)', borderColor: P.border, color: P.text }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add special requests, allergies, or preferences..."
              placeholderTextColor={P.sub}
              multiline
              numberOfLines={6}
              maxLength={500}
              editable={!isLoading}
            />

            <Text style={[styles.characterCount, { color: P.sub }]}>{notes.length}/500 characters</Text>

            <View style={styles.notesFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }, isLoading && styles.disabledButton]}
                onPress={onClose}
                disabled={isLoading}
              >
                <Text style={[styles.cancelText, { color: P.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: P.accent }, isLoading && styles.disabledButton]}
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <DialogHost />
      </Modal>
    );
  }
);

// Service Card Component
interface ServiceCardProps {
  item: CartItem;
  serviceBooking: ServiceBooking;
  onUpdateBooking: (itemId: string, updates: ServiceBooking) => void;
  onRemove: (itemId: string) => void;
  onShowNotes: (
    itemId: string,
    serviceName: string,
    providerName: string,
    instanceNumber: number,
    currentNotes: string
  ) => void;
  providerName: string;
  allCartItems: CartItem[]; // ADD THIS LINE
  depositPolicy?: ProviderDepositPolicy;
  appliedPromo?: DbPromotion;
  promoDiscount: number;
  onApplyPromo: (itemId: string, code: string) => Promise<string | null>;
  onRemovePromo: (itemId: string) => void;
}

const ServiceCard: React.FC<ServiceCardProps> = memo(
  ({
    item,
    serviceBooking,
    onUpdateBooking,
    onRemove,
    onShowNotes,
    providerName,
    allCartItems,
    depositPolicy,
    appliedPromo,
    promoDiscount,
    onApplyPromo,
    onRemovePromo,
  }) => {
    const { theme, isDarkMode, palette: P } = useTheme();
    const { showAlert, showConfirm, DialogHost } = useAppDialog();
    const [showCalendar, setShowCalendar] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Promo code — one per booking, entered right on this card
    const [promoInput, setPromoInput] = useState('');
    const [promoApplying, setPromoApplying] = useState(false);
    const [promoError, setPromoError] = useState<string | null>(null);

    const handleApplyPromoPress = useCallback(async () => {
      if (!promoInput.trim() || promoApplying) return;
      setPromoApplying(true);
      setPromoError(null);
      const error = await onApplyPromo(item.id, promoInput);
      setPromoApplying(false);
      if (error) {
        setPromoError(error);
      } else {
        setPromoInput('');
      }
    }, [promoInput, promoApplying, onApplyPromo, item.id]);

    // Scheduling constraints fetched once per provider
    const [constraints, setConstraints] = useState<{
      bookingWindowDays: number;
    }>({ bookingWindowDays: 60 });
    const constraintsFetched = useRef(false);

    // Fetch constraints the first time the calendar is opened. Prefer the
    // real provider UUID (set on the cart item when it was added) over the
    // display name — an exact-match name lookup silently returns nothing on
    // any case/punctuation drift, which is indistinguishable from "provider
    // has no constraints" and was masking real lookup failures.
    useEffect(() => {
      if (!showCalendar || constraintsFetched.current) return;
      constraintsFetched.current = true;
      getProviderSchedulingConstraints(item.providerId ?? item.providerDisplayName ?? providerName).then(setConstraints).catch(() => {
        // keep defaults on error
      });
    }, [showCalendar, providerName, item.providerId, item.providerDisplayName]);

    // Compute maxDate from booking window (0 = no limit)
    const maxDate = useMemo<Date | undefined>(() => {
      if (!constraints.bookingWindowDays) return undefined;
      const d = new Date();
      d.setDate(d.getDate() + constraints.bookingWindowDays);
      return d;
    }, [constraints.bookingWindowDays]);

    // Calculate total price safely with null checks
    const totalPrice = useMemo(() => {
      try {
        const basePrice = Number(item?.price) || 0;
        const addOnsTotal = (item?.addOns || []).reduce((sum: number, addOn: any) => {
          return sum + (Number(addOn?.price) || 0);
        }, 0);
        return basePrice + addOnsTotal;
      } catch (error) {
        console.error('Error calculating price:', error);
        return Number(item?.price) || 0;
      }
    }, [item?.price, item?.addOns]);

    const depositPolicyArg = useMemo((): DepositPolicy | number => {
      if (!depositPolicy) return 20;
      return { type: depositPolicy.depositType, amount: depositPolicy.depositAmount };
    }, [depositPolicy]);

    const effectivePrice = useMemo(() => {
      if (serviceBooking.isDepositOnly) {
        return BookingService.calculateDeposit(totalPrice, depositPolicyArg);
      }
      return totalPrice;
    }, [totalPrice, serviceBooking.isDepositOnly, depositPolicyArg]);

    const depositLabel = useMemo(() => {
      if (!depositPolicy) return 'Pay Deposit (20%)';
      if (depositPolicy.depositType === 'fixed') {
        return `Pay Deposit (£${depositPolicy.depositAmount} flat)`;
      }
      return `Pay Deposit (${depositPolicy.depositAmount}%)`;
    }, [depositPolicy]);

    const handleDateSelect = useCallback(
      (date: string) => {
        try {
          onUpdateBooking(item.id, {
            ...serviceBooking,
            selectedDate: date,
          });
        } catch (error) {
          console.error('Error updating date:', error);
          showAlert('Couldn\'t update date', 'Please try selecting it again.');
        }
      },
      [item.id, serviceBooking, onUpdateBooking, showAlert]
    );

    const handleTimeSelect = useCallback(
      (time: string) => {
        try {
          if (__DEV__) {
            console.log('TIME SELECTED:', time); // ADD THIS
          }
          onUpdateBooking(item.id, {
            ...serviceBooking,
            selectedTime: time,
          });
        } catch (error) {
          console.error('Error updating time:', error);
          showAlert('Couldn\'t update time', 'Please try selecting it again.');
        }
      },
      [item.id, serviceBooking, onUpdateBooking, showAlert]
    );

    const handleDepositToggle = useCallback(
      (isDeposit: boolean) => {
        try {
          onUpdateBooking(item.id, {
            ...serviceBooking,
            isDepositOnly: isDeposit,
            ...(isDeposit && depositPolicy
              ? { depositPolicy: { type: depositPolicy.depositType, amount: depositPolicy.depositAmount } }
              : {}),
          });
        } catch (error) {
          console.error('Error updating deposit toggle:', error);
        }
      },
      [item.id, serviceBooking, onUpdateBooking, depositPolicy]
    );

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
        console.error('Error removing item:', error);
      } finally {
        setIsLoading(false);
      }
    }, [item.id, item.serviceName, onRemove, showConfirm]);

    const isScheduled = Boolean(serviceBooking?.selectedDate && serviceBooking?.selectedTime);

    // CORRECT - only show # if there are duplicates
    const serviceName = item?.serviceName || 'Unknown Service';
    const serviceInstanceIndex = item?.serviceInstanceIndex || 1;
    const duration = item?.duration || 'Unknown duration'; // ADD THIS LINE
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
                {serviceBooking.isDepositOnly && ' (Deposit)'}
              </Text>
              <Text style={[styles.servicePrice, { color: P.accent }]}>£{effectivePrice.toFixed(2)}</Text>
              <Text style={[styles.serviceDuration, { color: theme.secondaryText }]}>{duration}</Text>

              {/* Enhanced add-ons display with proper pricing */}
              {item?.addOns && item.addOns.length > 0 && (
                <View style={styles.addOnsContainer}>
                  <Text style={[styles.addOnsTitle, { color: theme.text }]}>Add-ons:</Text>
                  <Text style={[styles.baseServicePrice, { color: theme.secondaryText }]}>
                    Base Service: £{Number(item?.price || 0).toFixed(2)}
                  </Text>
                  {item.addOns.map((addOn: any, index: number) => (
                    <Text key={addOn?.id || index} style={[styles.addOnItem, { color: theme.secondaryText }]}>
                      • {addOn?.name || 'Unknown'} (+£{Number(addOn?.price || 0).toFixed(2)})
                    </Text>
                  ))}
                  <View style={styles.addOnsTotalContainer}>
                    <Text style={[styles.addOnsTotal, { color: P.accent }]}>
                      Total with Add-ons: £{totalPrice.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
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

          {/* Scheduling with Enhanced Shadow */}
          <TouchableOpacity
            style={[
              styles.scheduleButton,
              styles.scheduleButtonShadow,
              isScheduled && styles.scheduleButtonScheduled,
            ]}
            onPress={() => setShowCalendar(!showCalendar)}
          >
            <Text
              style={[styles.scheduleButtonText, isScheduled && styles.scheduleButtonTextScheduled]}
            >
              {isScheduled
                ? `${new Date(serviceBooking.selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${serviceBooking.selectedTime}`
                : 'Tap to Schedule'}
            </Text>
          </TouchableOpacity>

          {/* Deposit Toggle - ADD THIS */}
          <View style={styles.depositToggle}>
            <Text style={[styles.depositToggleLabel, { color: P.sub }]}>Payment Option</Text>
            <View style={styles.depositButtons}>
              <TouchableOpacity
                style={[
                  styles.depositOptionButton,
                  { backgroundColor: isDarkMode ? P.surface : 'rgba(175,145,151,0.06)' },
                  !serviceBooking.isDepositOnly && { backgroundColor: 'rgba(175,145,151,0.14)', borderColor: P.accent },
                ]}
                onPress={() => handleDepositToggle(false)}
              >
                <Text
                  style={[
                    styles.depositOptionText,
                    { color: P.sub },
                    !serviceBooking.isDepositOnly && { color: P.accent, fontWeight: '700' },
                  ]}
                >
                  Pay Full Amount
                </Text>
              </TouchableOpacity>

              {/* Hidden when the provider turned deposits off in their policies */}
              {depositPolicy?.depositAvailable !== false && (
                <TouchableOpacity
                  style={[
                    styles.depositOptionButton,
                    { backgroundColor: isDarkMode ? P.surface : 'rgba(175,145,151,0.06)' },
                    serviceBooking.isDepositOnly && { backgroundColor: 'rgba(175,145,151,0.14)', borderColor: P.accent },
                  ]}
                  onPress={() => handleDepositToggle(true)}
                >
                  <Text
                    style={[
                      styles.depositOptionText,
                      { color: P.sub },
                      serviceBooking.isDepositOnly && { color: P.accent, fontWeight: '700' },
                    ]}
                  >
                    {depositLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {serviceBooking.isDepositOnly && (
              <View style={styles.depositInfo}>
                <Text style={styles.depositInfoText}>
                  Deposit: £{BookingService.calculateDeposit(totalPrice, depositPolicyArg).toFixed(2)}
                </Text>
                <Text style={styles.depositRemainingText}>
                  Remaining: £{BookingService.calculateRemainingBalance(totalPrice, depositPolicyArg).toFixed(2)} (pay
                  at appointment)
                </Text>
              </View>
            )}
          </View>

          {/* Promo code — specific to this booking */}
          <View style={{ marginTop: 10 }}>
            {appliedPromo ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                borderWidth: StyleSheet.hairlineWidth, borderColor: P.border,
                backgroundColor: P.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: P.accent }}>
                  {appliedPromo.promo_code?.toUpperCase()}
                </Text>
                <Text style={{ flex: 1, fontSize: 11, color: P.sub }} numberOfLines={1}>
                  {appliedPromo.title}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#30D158' }}>
                  −£{promoDiscount.toFixed(2)}
                </Text>
                <TouchableOpacity onPress={() => onRemovePromo(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#FF6868' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: P.border,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                    fontSize: 13, color: P.text, backgroundColor: P.surface,
                  }}
                  placeholder="Promo code for this booking"
                  placeholderTextColor={P.sub}
                  value={promoInput}
                  onChangeText={t => { setPromoInput(t); setPromoError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={{
                    borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center',
                    backgroundColor: promoInput.trim() ? P.accent : P.surface,
                  }}
                  onPress={handleApplyPromoPress}
                  disabled={!promoInput.trim() || promoApplying}
                  activeOpacity={0.8}
                >
                  {promoApplying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 12, fontWeight: '700', color: promoInput.trim() ? '#fff' : P.sub }}>Apply</Text>}
                </TouchableOpacity>
              </View>
            )}
            {promoError && (
              <Text style={{ fontSize: 11, color: '#FF6868', marginTop: 6 }}>{promoError}</Text>
            )}
          </View>

          {/* Calendar */}
          {showCalendar && (
            <View style={styles.calendarContainer}>
              <ModernBeautyCalendar
                selectedDate={serviceBooking.selectedDate}
                onDateSelect={handleDateSelect}
                onTimeSelect={handleTimeSelect}
                selectedTime={serviceBooking.selectedTime}
                providerName={item.providerId ?? item.providerDisplayName ?? providerName}
                serviceDuration={duration}
                {...(item.serviceId && UUID_RE.test(item.serviceId) ? { serviceId: item.serviceId } : {})}
                {...(maxDate !== undefined ? { maxDate } : {})}
              />
            </View>
          )}

          {/* Notes Button - Same design as schedule button */}
          <TouchableOpacity
            style={[
              styles.notesButton,
              { backgroundColor: 'rgba(175,145,151,0.1)', borderColor: 'rgba(175,145,151,0.3)' },
            ]}
            onPress={() =>
              onShowNotes(
                item.id,
                serviceName,
                providerName,
                serviceInstanceIndex,
                serviceBooking?.notes || ''
              )
            }
          >
            <Text style={[styles.notesButtonText, { color: P.accent }]}>
              {serviceBooking?.notes
                ? `Notes: ${serviceBooking.notes.substring(0, 30)}${serviceBooking.notes.length > 30 ? '...' : ''}`
                : 'Add Notes'}
            </Text>
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
    clearCart,
    getServiceFee,
    getFinalTotal,
    getItemsByProvider,
    getBookingSummary,
  } = useCart();

  const { createBookingsFromCart } = useBooking();
  const { user, updateUser } = useAuth();

  // State management
  const [serviceBookings, setServiceBookings] = useState<Record<string, ServiceBooking>>({});
  const [providerDepositPolicies, setProviderDepositPolicies] = useState<Record<string, ProviderDepositPolicy>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [currentNotesItem, setCurrentNotesItem] = useState<{
    itemId: string;
    serviceName: string;
    providerName: string;
    instanceNumber: number;
    currentNotes: string;
  } | null>(null);
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

  // Memoize expensive calculations properly
  const itemsByProvider = useMemo(() => {
    try {
      return getItemsByProvider();
    } catch (error) {
      console.error('Error getting items by provider:', error);
      return {};
    }
  }, [items]);

  const bookingSummary = useMemo(() => {
    try {
      return getBookingSummary();
    } catch (error) {
      console.error('Error getting booking summary:', error);
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
  // Each booking (cart item) can carry its own code — a client with three
  // services from the same provider might have three different promos, one
  // per service. Entry happens on the individual ServiceCard, not globally.
  // Keyed by cart item id.
  const [appliedPromos, setAppliedPromos] = useState<Record<string, DbPromotion>>({});

  const handleApplyPromoToItem = useCallback(async (itemId: string, code: string): Promise<string | null> => {
    const item = items.find(i => i.id === itemId);
    if (!item) return 'Could not find that service in your cart.';
    const trimmed = code.trim();
    if (!trimmed) return 'Enter a code first.';
    try {
      const providerName = item.providerDisplayName ?? item.providerName;
      const promo = await validatePromoCode(providerName, trimmed);
      if (!promo) return 'This code isn’t valid for this provider.';
      if (promo.service_ids && promo.service_ids.length > 0 && !promo.service_ids.includes(item.serviceId)) {
        return 'This code doesn’t apply to this service.';
      }
      if (promo.service_category &&
          promo.service_category.toUpperCase() !== (item.providerService ?? '').toUpperCase()) {
        return 'This code doesn’t apply to this service.';
      }
      setAppliedPromos(prev => ({ ...prev, [itemId]: promo }));
      return null;
    } catch {
      return 'Could not check that code — please try again.';
    }
  }, [items]);

  const handleRemovePromoFromItem = useCallback((itemId: string) => {
    setAppliedPromos(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  // Drop applied promos for items no longer in the cart
  useEffect(() => {
    const idsInCart = new Set(items.map(i => i.id));
    setAppliedPromos(prev => {
      const stale = Object.keys(prev).filter(id => !idsInCart.has(id));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const id of stale) delete next[id];
      return next;
    });
  }, [items]);

  // Auto-apply the offer code an item was added with (e.g. via a promotion's
  // "Book Now" button), so tapping that button actually gets the discount
  // instead of silently landing at full price. Re-validates through the same
  // path as manual entry — one attempt per item, and it backs off if the
  // client removes it, rather than reapplying every render.
  const autoAppliedPromoIds = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) {
      if (!item.initialPromoCode) continue;
      if (autoAppliedPromoIds.current.has(item.id)) continue;
      autoAppliedPromoIds.current.add(item.id);
      handleApplyPromoToItem(item.id, item.initialPromoCode).catch(() => {});
    }
  }, [items, handleApplyPromoToItem]);

  // Absolute £ discount per cart item (off base+add-ons, capped at the base price).
  const itemPromoDiscounts = useMemo((): Record<string, number> => {
    const discounts: Record<string, number> = {};
    for (const [itemId, promo] of Object.entries(appliedPromos)) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;
      const itemTotal = (Number(item.price) || 0) +
        (item.addOns ?? []).reduce((s, a) => s + (Number(a.price) || 0), 0);
      let off = 0;
      if (promo.discount_percent && promo.discount_percent > 0) {
        off = (itemTotal * promo.discount_percent) / 100;
      } else if (promo.discount_amount && promo.discount_amount > 0) {
        off = promo.discount_amount;
      }
      // discount_text-only promos carry no redeemable value at checkout
      discounts[itemId] = Math.min(off, Number(item.price) || 0);
    }
    return discounts;
  }, [appliedPromos, items]);

  const totalPromoDiscount = useMemo(
    () => Object.values(itemPromoDiscounts).reduce((s, v) => s + v, 0),
    [itemPromoDiscounts]
  );

  // Compute effective total considering per-service deposits - FIXED NESTED HOOK
  const effectiveTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = serviceBookings[item.id] || { isDepositOnly: false };
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
  }, [items, serviceBookings, providerDepositPolicies, itemPromoDiscounts]);

  const effectiveFinalTotal = useMemo(
    () => effectiveTotal + getServiceFee(),
    [effectiveTotal, getServiceFee]
  );

  // Same as effectiveTotal but WITHOUT promo discounts — used so the summary
  // reads Subtotal − Promo + Fee = Total exactly, even for deposit-only items
  // (where a promo only reduces the deposit proportionally).
  const effectiveTotalNoPromo = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = serviceBookings[item.id] || { isDepositOnly: false };
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
  }, [items, serviceBookings, providerDepositPolicies]);

  const promoSavingsShown = useMemo(
    () => Math.max(0, effectiveTotalNoPromo - effectiveTotal),
    [effectiveTotalNoPromo, effectiveTotal]
  );

  // Compute effective cart items for payment modal
  const effectiveCartItems = useMemo(() => {
    return items.map(item => {
      const booking = serviceBookings[item.id] || { isDepositOnly: false };
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
  }, [items, serviceBookings, providerDepositPolicies, itemPromoDiscounts]);

  // Booking state management
  const updateServiceBooking = useCallback((itemId: string, updates: ServiceBooking) => {
    try {
      setServiceBookings(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], ...updates },
      }));
    } catch (error) {
      console.error('Error updating booking:', error);
      setError('Failed to update booking');
    }
  }, []);

  const getServiceBooking = useCallback(
    (itemId: string): ServiceBooking => {
      return (
        serviceBookings[itemId] || {
          selectedDate: '',
          selectedTime: '',
          notes: '',
          isDepositOnly: false, // ADD THIS
        }
      );
    },
    [serviceBookings]
  );

  // ADD THIS NEW FUNCTION RIGHT HERE (after getServiceBooking)
  const getProviderScheduledCount = useCallback(
    (providerItems: CartItem[]) => {
      const scheduled = providerItems.filter(item => {
        const booking = getServiceBooking(item.id);
        return booking.selectedDate && booking.selectedTime;
      }).length;

      return {
        scheduled,
        total: providerItems.length,
        isComplete: scheduled === providerItems.length,
      };
    },
    [getServiceBooking]
  );

  const handleShowNotes = useCallback(
    (
      itemId: string,
      serviceName: string,
      providerName: string,
      instanceNumber: number,
      currentNotes: string
    ) => {
      setCurrentNotesItem({ itemId, serviceName, providerName, instanceNumber, currentNotes });
      setShowNotesModal(true);
    },
    []
  );

  const handleSaveNotes = useCallback(
    (notes: string) => {
      if (currentNotesItem) {
        try {
          const currentBooking = getServiceBooking(currentNotesItem.itemId);
          updateServiceBooking(currentNotesItem.itemId, {
            ...currentBooking,
            notes: notes.trim(),
          });
        } catch (error) {
          console.error('Error saving notes:', error);
          showAlert('Couldn\'t save your note', 'Please try again.');
        }
      }
    },
    [currentNotesItem, getServiceBooking, updateServiceBooking, showAlert]
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
          try {
            clearCart();
            setServiceBookings({});
            setError(null);
          } catch (error) {
            console.error('Error clearing cart:', error);
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
      console.log('CHECKOUT - Starting...');
      console.log('Items in cart:', items.length);
      console.log('Items:', items.map(i => i.serviceName));
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

    // ✅ CAPTURE SNAPSHOT OF ITEMS AND BOOKINGS
    if (__DEV__) {
      console.log('Capturing checkout snapshot...');
    }
    // Bake promo discounts into the snapshot so the discounted price flows
    // through validation, payment, and the saved booking. A note on the
    // booking tells the provider which code was redeemed.
    const snapshotBookings: typeof serviceBookings = { ...serviceBookings };
    const snapshotItems = items.map(item => {
      const discount = itemPromoDiscounts[item.id] ?? 0;
      if (discount <= 0) return item;
      const promo = appliedPromos[item.id];
      const existing = snapshotBookings[item.id];
      const promoNote = `Promo ${promo?.promo_code ?? ''} applied (−£${discount.toFixed(2)})`.trim();
      snapshotBookings[item.id] = {
        ...(existing ?? { selectedDate: '', selectedTime: '', isDepositOnly: false }),
        notes: [existing?.notes, promoNote].filter(Boolean).join('\n'),
      } as typeof serviceBookings[string];
      return { ...item, price: Math.max(0, (Number(item.price) || 0) - discount) };
    });
    const snapshot = {
      items: snapshotItems,
      bookings: snapshotBookings,
    };
    if (__DEV__) {
      console.log('Snapshot captured:', snapshot.items.length, 'items');
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
    console.error('Checkout error:', error);
    showAlert('Something went wrong', 'We couldn\'t start checkout. Please try again.');
  } finally {
    setIsLoading(false);
  }
}, [items, getServiceBooking, effectiveFinalTotal, serviceBookings, user, appliedPromos, itemPromoDiscounts, showAlert]);

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

    // If "Set as Default" is checked, update AuthContext
    if (saveAsDefault) {
      await updateUser({ name: reviewName, email: reviewEmail, phone: reviewPhone });
    }

    setShowReviewModal(false);
    setShowBookingSummaryModal(true);
  }, [reviewName, reviewEmail, reviewPhone, saveAsDefault, updateUser, showAlert, hasMobileProvider, clientAddress]);

const handlePaymentSuccess = useCallback(async (paymentMethod: string) => {
  if (__DEV__) {
    console.log('═══════════════════════════════════════');
    console.log('PAYMENT SUCCESS - FUNCTION CALLED');
    console.log('═══════════════════════════════════════');
  }

  try {
    // Step 0: Check snapshot
    if (__DEV__) {
      console.log('STEP 0: Checking snapshot...');
      console.log('Snapshot items count:', checkoutSnapshot.items.length);
      console.log('Current items count:', items.length);
    }
    
    const itemsToBook = checkoutSnapshot.items;
    const bookingsData = checkoutSnapshot.bookings;

    if (itemsToBook.length === 0) {
      console.error('CRITICAL: No items in snapshot!');
      console.error('Snapshot:', JSON.stringify(checkoutSnapshot, null, 2));
      throw new Error('No items to book - snapshot is empty');
    }

    if (__DEV__) {
      console.log('STEP 0 COMPLETE - Items:', itemsToBook.map(i => i.serviceName));
      console.log('---');
    }

    // Step 1: Validate
    if (__DEV__) {
      console.log('STEP 1: Validating bookings...');
    }
    try {
      const validation = BookingService.validateBookings(itemsToBook, bookingsData);
      if (__DEV__) {
        console.log('Validation result:', validation);
      }

      if (!validation.valid) {
        console.error('Validation failed:', validation.errors);
        throw new Error('Validation failed: ' + validation.errors.join(', '));
      }
      if (__DEV__) {
        console.log('STEP 1 COMPLETE - Validation passed');
      }
    } catch (validationError) {
      console.error('STEP 1 FAILED:', validationError);
      throw validationError;
    }
    if (__DEV__) {
      console.log('---');
    }

    // Step 2: Create appointment data
    if (__DEV__) {
      console.log('STEP 2: Creating appointment data...');
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
        console.log('Appointment data created:', appointmentData.length);
        console.log('Appointments:', JSON.stringify(appointmentData, null, 2));
        console.log('STEP 2 COMPLETE');
      }
    } catch (appointmentError) {
      console.error('STEP 2 FAILED:', appointmentError);
      throw appointmentError;
    }
    if (__DEV__) {
      console.log('---');
    }

    // Stamp payment method on every appointment entry
    appointmentData = appointmentData.map(a => ({ ...a, paymentMethod }));

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
      console.log('STEP 3: Creating bookings in BookingContext...');
      console.log('About to call createBookingsFromCart with:');
      console.log('- Items:', itemsToBook.length);
      console.log('- Appointments:', appointmentData.length);
    }
    try {
      await createBookingsFromCart(itemsToBook, appointmentData, clientAddress.trim() || undefined);
      if (__DEV__) {
        console.log('STEP 3 COMPLETE - createBookingsFromCart returned');
      }
    } catch (bookingError) {
      throw bookingError;
    }
    if (__DEV__) {
      console.log('---');
    }

    // Step 4: Booking-request and payment-received notifications are now
    // sent by createBookingsFromCart in BookingContext, using the real
    // Supabase booking id (not the cart item id) and the real notifications
    // table NotificationsScreen actually reads.
    if (__DEV__) {
      console.log('STEP 5: Booking confirmations sent by createBookingsFromCart');
      console.log('---');

      console.log('═══════════════════════════════════════');
      console.log('ALL STEPS COMPLETE - PAYMENT SUCCESS FINISHED');
      console.log('═══════════════════════════════════════');
    }
    
  } catch (error) {
    // A multi-service checkout can partially succeed — clear only the
    // services that actually booked, so the ones that failed stay in the
    // cart for the client to retry without re-booking (and re-paying for)
    // the ones that already went through.
    if (error instanceof BookingError) {
      error.succeededCartItemIds.forEach(id => removeFromCart(id));
    }
    // Not logged/alerted here — the caller (PaymentModal.handlePayment) owns
    // showing the single "Booking Failed" alert and closing the payment
    // sheet, so this only needs to propagate the error up to it.
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
    expandIcon: { fontSize: 10, color: theme.text },
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
                    console.error('Bookings navigation error:', error);
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
          <Modal visible={showReviewModal} animationType="slide" transparent={true}>
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
          <Modal visible={showBookingSummaryModal} animationType="slide" transparent={true}>
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
          <PaymentModal
            isVisible={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            effectiveCartItems={effectiveCartItems}
            totalAmount={effectiveFinalTotal}
            onPaymentSuccess={(method) => handlePaymentSuccess(method)}
            onPaymentComplete={() => {
              clearCart(); // Clear cart immediately after payment simulation
              setServiceBookings({}); // Clear bookings state
              setShowPaymentModal(false);
              setShowPaymentSuccessModal(true);
            }}
            onBookingFailed={(message) => showAlert('Booking Failed', message)}
          />

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

          {/* Notes Modal */}
          {currentNotesItem && (
            <NotesModal
              isVisible={showNotesModal}
              onClose={() => setShowNotesModal(false)}
              onSave={handleSaveNotes}
              serviceName={currentNotesItem.serviceName}
              providerName={currentNotesItem.providerName}
              instanceNumber={currentNotesItem.instanceNumber}
              currentNotes={currentNotesItem.currentNotes}
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
                {/* Provider Sections */}
                {Object.entries(itemsByProvider).map(([providerName, providerItems]) => {
                  const isExpanded = expandedProvider === providerName;
                  const providerData = bookingSummary.providers?.[providerName];

                  if (!providerData || !providerItems?.length) return null;

                  return (
                    <View key={providerName} style={[styles.providerSection, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
                      {/* Provider Header */}
                      <TouchableOpacity
                        style={styles.providerHeader}
                        onPress={() => setExpandedProvider(isExpanded ? null : providerName)}
                      >
                        {(() => {
                          const scheduleStatus = getProviderScheduledCount(providerItems);
                          return (
                            <View
                              style={[
                                styles.scheduledTag,
                                scheduleStatus.isComplete
                                  ? styles.scheduledTagComplete
                                  : styles.scheduledTagIncomplete,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.scheduledTagText,
                                  scheduleStatus.isComplete
                                    ? styles.scheduledTagTextComplete
                                    : styles.scheduledTagTextIncomplete,
                                ]}
                              >
                                SCHEDULED {scheduleStatus.scheduled}/{scheduleStatus.total}
                              </Text>
                            </View>
                          );
                        })()}

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

                        <Text style={[dynamicStyles.expandIcon, isExpanded && styles.expandIconRotated]}>
                          ▼
                        </Text>
                      </TouchableOpacity>

                      {/* Services List */}
                      {isExpanded && (
                        <View style={styles.servicesList}>
                          {providerItems.map((item, index) => (
                            <View key={item.id} style={styles.serviceItemWrapper}>
                              <ServiceCard
                                item={item}
                                serviceBooking={getServiceBooking(item.id)}
                                onUpdateBooking={updateServiceBooking}
                                onRemove={removeFromCart}
                                onShowNotes={handleShowNotes}
                                providerName={providerName}
                                allCartItems={items}
                                {...(providerDepositPolicies[providerItems[0]?.providerDisplayName ?? providerName] !== undefined
                                  ? { depositPolicy: providerDepositPolicies[providerItems[0]?.providerDisplayName ?? providerName] }
                                  : {})}
                                {...(appliedPromos[item.id] !== undefined ? { appliedPromo: appliedPromos[item.id] } : {})}
                                promoDiscount={itemPromoDiscounts[item.id] ?? 0}
                                onApplyPromo={handleApplyPromoToItem}
                                onRemovePromo={handleRemovePromoFromItem}
                              />
                              {/* Visual Separator */}
                              {index < providerItems.length - 1 && (
                                <View style={styles.serviceSeparator} />
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Applied promo codes recap — codes are entered per-service on each
                    card above; this just rolls up what's active. */}
                {Object.keys(appliedPromos).length > 0 && (
                  <View style={[styles.summary, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 }]}>
                    {Object.entries(appliedPromos).map(([itemId, promo]) => {
                      const item = items.find(i => i.id === itemId);
                      if (!item) return null;
                      return (
                        <View key={itemId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: P.accent }}>
                            {promo.promo_code?.toUpperCase()}
                          </Text>
                          <Text style={{ flex: 1, fontSize: 12, color: P.sub }} numberOfLines={1}>
                            {item.serviceName}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#30D158' }}>
                            −£{(itemPromoDiscounts[itemId] ?? 0).toFixed(2)}
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
  // ADD ALL THESE STYLES RIGHT HERE:
  scheduledTag: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    zIndex: 10,
  },
  scheduledTagIncomplete: {
    backgroundColor: 'rgba(158,158,158,0.15)',
    borderColor: 'rgba(158,158,158,0.3)',
  },
  scheduledTagComplete: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderColor: 'rgba(76,175,80,0.3)',
  },
  scheduledTagText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: 'bold',
  },
  scheduledTagTextIncomplete: {
    color: '#757575',
  },
  scheduledTagTextComplete: {
    color: '#2E7D32',
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
  expandIcon: {
    fontSize: fonts.serviceTag,
    color: '#000',
  },
  expandIconRotated: {
    transform: [{ rotate: '180deg' }],
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
  servicePrice: {
    fontSize: fonts.title.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#AF9197',
    marginBottom: spacing.xs,
  },
  serviceDuration: {
    fontSize: fonts.locationText,
    fontFamily: 'Jura-VariableFont_wght',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: spacing.md,
  },
  addOnsContainer: {
    backgroundColor: 'rgba(175,145,151,0.1)',
    padding: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    borderColor: 'rgba(175,145,151,0.25)',
    marginTop: spacing.md,
  },
  addOnsTitle: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.sm,
  },
  baseServicePrice: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght bold',
    color: 'rgba(0,0,0,0.8)',
    marginBottom: spacing.xs,
    fontWeight: '300',
  },
  addOnItem: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght bold',
    color: 'rgba(0,0,0,0.7)',
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs,
  },
  addOnsTotalContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(175,145,151,0.25)',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  addOnsTotal: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#AF9197',
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

  // Schedule Button - slightly smaller
  scheduleButton: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.3)',
  },
  scheduleButtonShadow: {
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  scheduleButtonScheduled: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderColor: 'rgba(76,175,80,0.3)',
    shadowColor: '#4CAF50',
  },
  scheduleButtonText: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#D32F2F',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  scheduleButtonTextScheduled: {
    color: '#2E7D32',
  },

  // Deposit Toggle Styles - slightly smaller
  depositToggle: {
    marginBottom: spacing.xs,
  },
  depositToggleLabel: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght bold',
    fontWeight: '300',
    color: '#333',
    marginBottom: spacing.md,
  },
  depositButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  depositOptionButton: {
    flex: 1,
    padding: spacing.xs,
    borderRadius: dimensions.card.smallBorderRadius,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  depositOptionButtonActive: {
    backgroundColor: 'rgba(175,145,151,0.14)',
    borderColor: '#AF9197',
  },
  depositOptionText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'BakbakOne-Regular',
    color: 'rgba(0,0,0,0.6)',
  },
  depositOptionTextActive: {
    color: '#AF9197',
    fontWeight: '700',
  },
  depositInfo: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
  },
  depositInfoText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght bold',
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: spacing.xs,
  },
  depositRemainingText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'Jura-VariableFont_wght bold',
    color: 'rgba(0,0,0,0.7)',
  },

  // Calendar Container
  calendarContainer: {
    marginBottom: spacing.sm,
  },

  // Fallback Calendar
  fallbackCalendar: {
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  fallbackTitle: {
    fontSize: fonts.body.medium,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  fallbackLabel: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    color: '#333',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  fallbackInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    fontSize: fonts.body.medium,
    backgroundColor: '#fff',
  },
  fallbackButton: {
    backgroundColor: '#AF9197',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  fallbackButtonText: {
    color: '#fff',
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.buttonText.small,
  },

  // Notes Button - slightly smaller
  notesButton: {
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
  },
  notesButtonEmpty: {
    backgroundColor: 'rgba(175,145,151,0.1)',
    borderColor: 'rgba(175,145,151,0.3)',
  },
  notesButtonWithContent: {
    backgroundColor: 'rgba(175,145,151,0.1)',
    borderColor: 'rgba(175,145,151,0.3)',
  },
  notesButtonText: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  notesButtonTextEmpty: {
    color: '#AF9197',
  },
  notesButtonTextWithContent: {
    color: '#AF9197',
  },

  // Notes Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesModal: {
    width: '90%',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: dimensions.card.borderRadius,
    padding: spacing.xl,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  notesHeader: {
    marginBottom: spacing.lg,
  },
  notesTitle: {
    fontSize: fonts.title.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
    marginBottom: spacing.xs,
  },
  notesSubtitle: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    color: 'rgba(0,0,0,0.6)',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    height: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
    fontSize: fonts.body.medium,
  },
  characterCount: {
    fontSize: fonts.body.xsmall,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  notesFooter: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#000',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#AF9197',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveText: {
    fontSize: fonts.body.large,
    fontFamily: 'BakbakOne-Regular',
    color: '#fff',
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
