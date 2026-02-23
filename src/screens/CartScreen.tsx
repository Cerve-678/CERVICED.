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
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { useNavigation } from '@react-navigation/native';
import { useCart, CartItem } from '../contexts/CartContext';
import { useBooking, AppointmentData } from '../contexts/BookingContext';
import { BookingService } from '../services/bookingService';
import { NotificationService } from '../services/notificationService';
import type { CartScreenProps } from '../navigation/types';
import ErrorBoundary from '../components/ErrorBoundary';
import { FONT_SIZES } from '../constants/Typeography';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

// (Removed duplicate CartScreen definition. The correct CartScreen is defined below.)

// Service booking interface
interface ServiceBooking {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean; // ADD THIS
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
  onPaymentSuccess: () => Promise<void>; // ✅ ASYNC
  onPaymentComplete: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = memo(
  ({
    isVisible,
    onClose,
    effectiveCartItems,
    totalAmount,
    onPaymentSuccess,
    onPaymentComplete,
  }) => {
    const { theme } = useTheme();
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
      console.log(`[${timestamp()}] STARTING PAYMENT SIMULATION (2s delay)...`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (__DEV__) {
      console.log(`[${timestamp()}] PAYMENT SIMULATION COMPLETE`);
    }

    if (__DEV__) {
      console.log(`\n[${timestamp()}] Calling onPaymentSuccess...`);
    }
    const startTime = Date.now();
    try {
      await onPaymentSuccess();
      const duration = Date.now() - startTime;
      if (__DEV__) {
        console.log(`[${timestamp()}] onPaymentSuccess completed in ${duration}ms`);
      }
    } catch (bookingError) {
      const duration = Date.now() - startTime;
      console.error(`💰 [${timestamp()}] ❌ onPaymentSuccess FAILED after ${duration}ms:`, bookingError);
      throw bookingError;
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
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [${timestamp()}] PAYMENT ERROR`);
    console.error(`${'='.repeat(60)}`);
    console.error(`❌ [${timestamp()}] Error:`, error);
    console.error(`❌ [${timestamp()}] Error message:`, (error as Error).message);
    console.error(`❌ [${timestamp()}] Error stack:`, (error as Error).stack);
    console.error(`${'='.repeat(60)}\n`);

    Alert.alert(
      'Payment Failed',
      'There was an error: ' + (error as Error).message
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
}, [totalAmount, onPaymentSuccess, onPaymentComplete, onClose]);

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
          <BlurView intensity={40} tint={theme.blurTint} style={styles.paymentModal}>
            <SafeAreaView style={styles.paymentModalContent}>
              {/* Payment Header */}
              <View style={styles.paymentHeader}>
                <Text style={[styles.paymentTitle, { color: theme.text }]}>Complete Payment</Text>
                <TouchableOpacity style={styles.paymentCloseButton} onPress={onClose}>
                  <Text style={[styles.paymentCloseText, { color: theme.text }]}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.paymentContent} showsVerticalScrollIndicator={false}>
                {/* Order Summary - UPDATED WITH BREAKDOWN */}
                <View style={styles.orderSummary}>
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
                        selectedPaymentMethod === method.id && styles.selectedPaymentMethod,
                      ]}
                      onPress={() => setSelectedPaymentMethod(method.id as any)}
                    >
                      <Text style={styles.paymentMethodIcon}>{method.icon}</Text>
                      <Text style={[styles.paymentMethodName, { color: theme.text }]}>{method.name}</Text>
                      <View
                        style={[
                          styles.paymentMethodRadio,
                          selectedPaymentMethod === method.id && styles.selectedPaymentMethodRadio,
                        ]}
                      >
                        {selectedPaymentMethod === method.id && (
                          <View style={styles.paymentMethodRadioInner} />
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
                      style={[styles.cardInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                      placeholder="Card Number"
                      placeholderTextColor={theme.secondaryText}
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
                        style={[styles.cardInput, styles.cardInputHalf, { backgroundColor: theme.cardBackground, color: theme.text }]}
                        placeholder="MM/YY"
                        placeholderTextColor={theme.secondaryText}
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
                        style={[styles.cardInput, styles.cardInputHalf, { backgroundColor: theme.cardBackground, color: theme.text }]}
                        placeholder="CVC"
                        placeholderTextColor={theme.secondaryText}
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
                      style={[styles.cardInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                      placeholder="Cardholder Name"
                      placeholderTextColor={theme.secondaryText}
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
                style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
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
          </BlurView>
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
    const { isDarkMode } = useTheme();
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
        Alert.alert('Error', 'Failed to save notes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }, [notes, onSave, onClose]);

    return (
      <Modal visible={isVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.notesModal, isDarkMode && { backgroundColor: 'rgba(44, 44, 46, 0.95)', borderColor: 'rgba(255,255,255,0.15)' }]}>
            <View style={styles.notesHeader}>
              <Text style={[styles.notesTitle, isDarkMode && { color: '#FFF' }]}>Add Notes</Text>
              <Text style={[styles.notesSubtitle, isDarkMode && { color: 'rgba(255,255,255,0.6)' }]}>
                {serviceName} #{instanceNumber} • {providerName}
              </Text>
            </View>

            <TextInput
              style={[styles.notesInput, isDarkMode && { backgroundColor: 'rgba(58,58,60,0.6)', borderColor: 'rgba(255,255,255,0.15)', color: '#FFF' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add special requests, allergies, or preferences..."
              placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)'}
              multiline
              numberOfLines={6}
              maxLength={500}
              editable={!isLoading}
            />

            <Text style={[styles.characterCount, isDarkMode && { color: 'rgba(255,255,255,0.4)' }]}>{notes.length}/500 characters</Text>

            <View style={styles.notesFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, isDarkMode && { backgroundColor: 'rgba(255,255,255,0.1)' }, isLoading && styles.disabledButton]}
                onPress={onClose}
                disabled={isLoading}
              >
                <Text style={[styles.cancelText, isDarkMode && { color: '#FFF' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, isLoading && styles.disabledButton]}
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
  }) => {
    const { theme, isDarkMode } = useTheme();
    const [showCalendar, setShowCalendar] = useState(false);
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
        console.error('Error calculating price:', error);
        return Number(item?.price) || 0;
      }
    }, [item?.price, item?.addOns]);

    const effectivePrice = useMemo(() => {
      if (serviceBooking.isDepositOnly) {
        return BookingService.calculateDeposit(totalPrice);
      }
      return totalPrice;
    }, [totalPrice, serviceBooking.isDepositOnly]);

    const handleDateSelect = useCallback(
      (date: string) => {
        try {
          onUpdateBooking(item.id, {
            ...serviceBooking,
            selectedDate: date,
          });
        } catch (error) {
          console.error('Error updating date:', error);
          Alert.alert('Error', 'Failed to update date');
        }
      },
      [item.id, serviceBooking, onUpdateBooking]
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
          Alert.alert('Error', 'Failed to update time');
        }
      },
      [item.id, serviceBooking, onUpdateBooking]
    );

    const handleDepositToggle = useCallback(
      (isDeposit: boolean) => {
        try {
          onUpdateBooking(item.id, {
            ...serviceBooking,
            isDepositOnly: isDeposit,
          });
        } catch (error) {
          console.error('Error updating deposit toggle:', error);
        }
      },
      [item.id, serviceBooking, onUpdateBooking]
    );

    const handleRemove = useCallback(async () => {
      try {
        setIsLoading(true);
        Alert.alert('Remove Service', `Remove ${item.serviceName} from cart?`, [
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
    }, [item.id, item.serviceName, onRemove]);

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
        <BlurView
          intensity={20}
          tint={theme.blurTint}
          style={[styles.serviceCard, styles.serviceCardShadow]}
        >
          {/* Service Info */}
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceName, { color: theme.text }]}>
                {serviceName}
                {showInstanceNumber ? ` #${serviceInstanceIndex}` : ''}
                {serviceBooking.isDepositOnly && ' (Deposit)'}
              </Text>
              <Text style={styles.servicePrice}>£{effectivePrice.toFixed(2)}</Text>
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
                    <Text style={styles.addOnsTotal}>
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
                ? `${new Date(serviceBooking.selectedDate).toLocaleDateString()} at ${serviceBooking.selectedTime}`
                : 'Tap to Schedule'}
            </Text>
          </TouchableOpacity>

          {/* Deposit Toggle - ADD THIS */}
          <View style={styles.depositToggle}>
            <Text style={[styles.depositToggleLabel, isDarkMode && { color: '#FFF' }]}>Payment Option</Text>
            <View style={styles.depositButtons}>
              <TouchableOpacity
                style={[
                  styles.depositOptionButton,
                  isDarkMode && { backgroundColor: 'rgba(255,255,255,0.08)' },
                  !serviceBooking.isDepositOnly && styles.depositOptionButtonActive,
                ]}
                onPress={() => handleDepositToggle(false)}
              >
                <Text
                  style={[
                    styles.depositOptionText,
                    isDarkMode && { color: 'rgba(255,255,255,0.6)' },
                    !serviceBooking.isDepositOnly && styles.depositOptionTextActive,
                  ]}
                >
                  Pay Full Amount
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.depositOptionButton,
                  isDarkMode && { backgroundColor: 'rgba(255,255,255,0.08)' },
                  serviceBooking.isDepositOnly && styles.depositOptionButtonActive,
                ]}
                onPress={() => handleDepositToggle(true)}
              >
                <Text
                  style={[
                    styles.depositOptionText,
                    isDarkMode && { color: 'rgba(255,255,255,0.6)' },
                    serviceBooking.isDepositOnly && styles.depositOptionTextActive,
                  ]}
                >
                  Pay Deposit Only (20%)
                </Text>
              </TouchableOpacity>
            </View>

            {serviceBooking.isDepositOnly && (
              <View style={styles.depositInfo}>
                <Text style={styles.depositInfoText}>
                  Deposit: £{BookingService.calculateDeposit(totalPrice).toFixed(2)}
                </Text>
                <Text style={styles.depositRemainingText}>
                  Remaining: £{BookingService.calculateRemainingBalance(totalPrice).toFixed(2)} (pay
                  at appointment)
                </Text>
              </View>
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
                providerName={providerName}
                serviceDuration={duration}
              />
            </View>
          )}

          {/* Notes Button - Same design as schedule button */}
          <TouchableOpacity
            style={[
              styles.notesButton,
              serviceBooking?.notes ? styles.notesButtonWithContent : styles.notesButtonEmpty,
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
            <Text
              style={[
                styles.notesButtonText,
                serviceBooking?.notes
                  ? styles.notesButtonTextWithContent
                  : styles.notesButtonTextEmpty,
              ]}
            >
              {serviceBooking?.notes
                ? `Notes: ${serviceBooking.notes.substring(0, 30)}${serviceBooking.notes.length > 30 ? '...' : ''}`
                : 'Add Notes'}
            </Text>
          </TouchableOpacity>
        </BlurView>
      </ErrorBoundary>
    );
  }
);

// Main Cart Screen Component
const CartScreen: React.FC<CartScreenProps<'CartMain'>> = ({ navigation }) => {
  const { theme, isDarkMode } = useTheme();
  const [fontsLoaded] = useFonts({
    'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });

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
  const [reviewName, setReviewName] = useState('');
  const [reviewEmail, setReviewEmail] = useState('');
  const [reviewPhone, setReviewPhone] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [confirmedCustomerInfo, setConfirmedCustomerInfo] = useState<{
    name: string; email: string; phone: string;
  } | null>(null);

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

  // Compute effective total considering per-service deposits - FIXED NESTED HOOK
  const effectiveTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const booking = serviceBookings[item.id] || { isDepositOnly: false };
      // Inline calculation without nested useMemo
      const basePrice = Number(item?.price) || 0;
      const addOnsTotal = (item?.addOns || []).reduce((s: number, addOn: any) => {
        return s + (Number(addOn?.price) || 0);
      }, 0);
      const itemTotalPrice = basePrice + addOnsTotal;
      const effectiveItemPrice = booking.isDepositOnly
        ? BookingService.calculateDeposit(itemTotalPrice)
        : itemTotalPrice;
      return sum + effectiveItemPrice;
    }, 0);
  }, [items, serviceBookings]);

  const effectiveFinalTotal = useMemo(
    () => effectiveTotal + getServiceFee(),
    [effectiveTotal, getServiceFee]
  );

  // Compute effective cart items for payment modal
  const effectiveCartItems = useMemo(() => {
    return items.map(item => {
      const booking = serviceBookings[item.id] || { isDepositOnly: false };
      const basePrice = Number(item?.price) || 0;
      const addOnsTotal = (item?.addOns || []).reduce((s: number, addOn: any) => {
        return s + (Number(addOn?.price) || 0);
      }, 0);
      const itemTotalPrice = basePrice + addOnsTotal;
      const effectivePrice = booking.isDepositOnly
        ? BookingService.calculateDeposit(itemTotalPrice)
        : itemTotalPrice;
      return { item, effectivePrice, isDeposit: !!booking.isDepositOnly };
    });
  }, [items, serviceBookings]);

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
          Alert.alert('Error', 'Failed to save notes');
        }
      }
    },
    [currentNotesItem, getServiceBooking, updateServiceBooking]
  );

  // Navigation handlers - BACK TO HOME
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setRefreshing(false);
  }, []);

  const handleContinueShopping = useCallback(() => {
    navigation.getParent()?.navigate('Home');
  }, [navigation]);

  const handleClearCart = useCallback(() => {
    Alert.alert('Clear Cart', 'Remove all items from cart?', [
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
  }, [clearCart]);

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
      Alert.alert(
        'Schedule Required',
        `Please schedule ${unscheduled.length} appointment(s) before checkout.`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Validate booking data
    const bookingErrors: string[] = [];
    items.forEach(item => {
      const booking = getServiceBooking(item.id);
      if (booking.selectedDate) {
        const date = new Date(booking.selectedDate);
        if (isNaN(date.getTime())) {
          bookingErrors.push(`Invalid date for ${item.serviceName}`);
        }
      }
    });

    if (bookingErrors.length > 0) {
      Alert.alert('Booking Errors', bookingErrors.join('\n'));
      return;
    }

    // ✅ CAPTURE SNAPSHOT OF ITEMS AND BOOKINGS
    if (__DEV__) {
      console.log('Capturing checkout snapshot...');
    }
    const snapshot = {
      items: [...items], // Clone array
      bookings: { ...serviceBookings }, // Clone object
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
    setShowReviewModal(true);
  } catch (error) {
    console.error('Checkout error:', error);
    Alert.alert('Error', 'Something went wrong during checkout. Please try again.');
  } finally {
    setIsLoading(false);
  }
}, [items, getServiceBooking, effectiveFinalTotal, serviceBookings, user]);

  // Handle review modal confirmation
  const handleReviewConfirm = useCallback(async () => {
    // Validate phone is provided
    if (!reviewPhone.trim()) {
      Alert.alert('Phone Required', 'Please enter your phone number to continue.');
      return;
    }
    const digitsOnly = reviewPhone.replace(/[\s\-()+ ]/g, '');
    if (digitsOnly.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number (at least 10 digits).');
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
    setShowPaymentModal(true);
  }, [reviewName, reviewEmail, reviewPhone, saveAsDefault, updateUser]);

// REPLACE THE ENTIRE handlePaymentSuccess FUNCTION WITH THIS:
const handlePaymentSuccess = useCallback(async () => {
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

    // Step 3: Create bookings IN CONTEXT
    if (__DEV__) {
      console.log('STEP 3: Creating bookings in BookingContext...');
      console.log('About to call createBookingsFromCart with:');
      console.log('- Items:', itemsToBook.length);
      console.log('- Appointments:', appointmentData.length);
    }
    try {
      await createBookingsFromCart(itemsToBook, appointmentData);
      if (__DEV__) {
        console.log('STEP 3 COMPLETE - createBookingsFromCart returned');
      }
    } catch (bookingError) {
      console.error('STEP 3 FAILED:', bookingError);
      console.error('Error details:', JSON.stringify(bookingError, null, 2));
      throw bookingError;
    }
    if (__DEV__) {
      console.log('---');
    }

    // Step 4: Send payment notification
    if (__DEV__) {
      console.log('STEP 4: Sending payment notification...');
    }
    try {
      await NotificationService.addPaymentSuccess(
        effectiveFinalTotal,
        itemsToBook[0]?.providerName || 'Provider',
        itemsToBook.length > 1 ? `${itemsToBook.length} services` : itemsToBook[0]?.serviceName || 'Service',
        itemsToBook[0]?.providerImage
      );
      if (__DEV__) {
        console.log('STEP 4 COMPLETE - Payment notification sent');
      }
    } catch (notifError) {
      console.error('STEP 4 WARNING - Notification failed (non-critical):', notifError);
      // Don't throw - notifications are not critical
    }
    if (__DEV__) {
      console.log('---');
    }

    // Step 5: Booking confirmations are now sent by createBookingsFromCart in BookingContext
    // This ensures the correct booking.id (not cart item id) is used
    if (__DEV__) {
      console.log('STEP 5: Booking confirmations sent by createBookingsFromCart');
      console.log('---');

      console.log('═══════════════════════════════════════');
      console.log('ALL STEPS COMPLETE - PAYMENT SUCCESS FINISHED');
      console.log('═══════════════════════════════════════');
    }
    
  } catch (error) {
    console.error('═══════════════════════════════════════');
    console.error('❌ PAYMENT SUCCESS FUNCTION FAILED');
    console.error('Error:', error);
    console.error('Error message:', (error as Error).message);
    console.error('Error stack:', (error as Error).stack);
    console.error('═══════════════════════════════════════');
    
    Alert.alert(
      'Booking Failed',
      'Failed to create bookings: ' + (error as Error).message
    );
    throw error;
  }
}, [checkoutSnapshot, createBookingsFromCart, effectiveFinalTotal, items, confirmedCustomerInfo, user]);

  // Provider navigation with better error handling - NORMALIZE FOR "MAKEUP BY MYA"
  const navigateToProvider = useCallback(
    (providerName: string) => {
      try {
        // Normalize provider name: trim, lowercase, replace spaces with hyphens for matching
        const normalizedName = providerName.trim().toUpperCase().replace(/\s+/g, ' ');
        const normalizedForMapping = normalizedName.toUpperCase().replace(/\s+/g, '');

        const providerMapping: Record<string, string> = {
          JENNIFER: 'hair-by-jennifer',
          HAIRBYJENNIFER: 'hair-by-jennifer',
          'HAIR BY JENNIFER': 'hair-by-jennifer',
          KATHRINE: 'styled-by-kathrine',
          'STYLED BY KATHRINE': 'styled-by-kathrine',
          'STYLED BYKATHRINE': 'styled-by-kathrine',
          DIVANA: 'diva-nails',
          'DIVA NAILS': 'diva-nails',
          DIVANAILS: 'diva-nails',
          JANA: 'jana-aesthetics',
          'JANA AESTHETICS': 'jana-aesthetics',
          JANAAESTHETICS: 'jana-aesthetics',
          'HER BROWS': 'her-brows',
          HERBROWS: 'her-brows',
          KIKI: 'kiki-nails',
          'KIKI NAILS': 'kiki-nails',
          KIKISNAILS: 'kiki-nails',
          MYA: 'makeup-by-mya',
          'MAKEUP BY MYA': 'makeup-by-mya',
          MAKEUPBYMYA: 'makeup-by-mya',
          VIKKI: 'vikki-laid',
          'VIKKI LAID': 'vikki-laid',
          VIKKILAID: 'vikki-laid',
          LASHED: 'your-lashed',
          'YOUR LASHED': 'your-lashed',
          YOURLASHED: 'your-lashed',
          'ROSEMAY AESTHETICS': 'rosemay-aesthetics',
          ROSEMAYAESTHETICS: 'rosemay-aesthetics',
          'FILLER BY JESS': 'fillerbyjess',
          FILLERBYJESS: 'fillerbyjess',
          'EYEBROW DELUXE': 'eyebrowdeluxe',
          EYEBROWDELUXE: 'eyebrowdeluxe',
          'LASHES GALORE': 'lashesgalore',
          LASHESGALORE: 'lashesgalore',
          ZEE: 'zeenail-artist',
          'ZEE NAIL ARTIST': 'zeenail-artist',
          ZEENAILARTIST: 'zeenail-artist',
          ZOE: 'painted-by-zoe',
          'PAINTED BY ZOE': 'painted-by-zoe',
          PAINTEDBYZOE: 'painted-by-zoe',
          'BRAIDED SLICK': 'braided-slick',
          BRAIDEDSLICK: 'braided-slick',
          LASHBAE: 'lash-bae',
          'LASH BAE': 'lash-bae',
        };

        const providerId = providerMapping[normalizedForMapping] || providerMapping[normalizedName];
        if (!providerId) {
          console.warn(`Provider not found: ${providerName}`);
          Alert.alert('Error', 'Provider not found');
          return;
        }

        // Navigate within Home stack - ProviderProfile is in the same stack
        navigation.navigate('ProviderProfile', {
          providerId,
          source: 'cart',
        });
      } catch (error) {
        console.error('Navigation error:', error);
        Alert.alert('Navigation Error', 'Unable to open provider profile');
      }
    },
    [navigation]
  );
  // Get provider logo from assets - ADD NORMALIZED KEYS
  const getProviderLogo = useCallback((providerName: string) => {
    const normalizedForMapping = providerName.toUpperCase().replace(/\s+/g, '');
    const logoMapping: Record<string, any> = {
      JENNIFER: require('../../assets/logos/hairbyjennifer.png'),
      HAIRBYJENNIFER: require('../../assets/logos/hairbyjennifer.png'),
      'HAIR BY JENNIFER': require('../../assets/logos/hairbyjennifer.png'),
      KATHRINE: require('../../assets/logos/styledbykathrine.png'),
      'STYLED BY KATHRINE': require('../../assets/logos/styledbykathrine.png'),
      'STYLED BYKATHRINE': require('../../assets/logos/styledbykathrine.png'),
      DIVANA: require('../../assets/logos/divanails.png'),
      'DIVA NAILS': require('../../assets/logos/divanails.png'),
      DIVANAILS: require('../../assets/logos/divanails.png'),
      JANA: require('../../assets/logos/janaaesthetics.png'),
      'JANA AESTHETICS': require('../../assets/logos/janaaesthetics.png'),
      JANAAESTHETICS: require('../../assets/logos/janaaesthetics.png'),
      'HER BROWS': require('../../assets/logos/herbrows.png'),
      HERBROWS: require('../../assets/logos/herbrows.png'),
      KIKI: require('../../assets/logos/kikisnails.png'),
      'KIKI NAILS': require('../../assets/logos/kikisnails.png'),
      KIKISNAILS: require('../../assets/logos/kikisnails.png'),
      MYA: require('../../assets/logos/makeupbymya.png'),
      'MAKEUP BY MYA': require('../../assets/logos/makeupbymya.png'),
      MAKEUPBYMYA: require('../../assets/logos/makeupbymya.png'),
      VIKKI: require('../../assets/logos/vikkilaid.png'),
      'VIKKI LAID': require('../../assets/logos/vikkilaid.png'),
      VIKKILAID: require('../../assets/logos/vikkilaid.png'),
      LASHED: require('../../assets/logos/yourlashed.png'),
      'YOUR LASHED': require('../../assets/logos/yourlashed.png'),
      YOURLASHED: require('../../assets/logos/yourlashed.png'),
      'ROSEMAY AESTHETICS': require('../../assets/logos/RoseMayAesthetics.png'),
      ROSEMAYAESTHETICS: require('../../assets/logos/RoseMayAesthetics.png'),
      'FILLER BY JESS': require('../../assets/logos/fillerbyjess.png'),
      FILLERBYJESS: require('../../assets/logos/fillerbyjess.png'),
      'EYEBROW DELUXE': require('../../assets/logos/eyebrowdeluxe.png'),
      EYEBROWDELUXE: require('../../assets/logos/eyebrowdeluxe.png'),
      'LASHES GALORE': require('../../assets/logos/lashesgalore.png'),
      LASHESGALORE: require('../../assets/logos/lashesgalore.png'),
      ZEE: require('../../assets/logos/ZeeNail Artist.png'),
      'ZEE NAIL ARTIST': require('../../assets/logos/ZeeNail Artist.png'),
      ZEENAILARTIST: require('../../assets/logos/ZeeNail Artist.png'),
      ZOE: require('../../assets/logos/paintedbyZoe.png'),
      'PAINTED BY ZOE': require('../../assets/logos/paintedbyZoe.png'),
      PAINTEDBYZOE: require('../../assets/logos/paintedbyZoe.png'),
      'BRAIDED SLICK': require('../../assets/logos/braided slick.png'),
      BRAIDEDSLICK: require('../../assets/logos/braided slick.png'),
      LASHBAE: require('../../assets/logos/LashBae.png'),
      'LASH BAE': require('../../assets/logos/LashBae.png'),
    };
    return (
      logoMapping[normalizedForMapping] ||
      logoMapping[providerName] ||
      require('../../assets/images/background.png')
    );
  }, []);

  // UPDATED: Display name with normalization
  const getDisplayProviderName = useCallback((providerName: string) => {
    const normalizedName = providerName.trim().toUpperCase().replace(/\s+/g, ' ');
    const displayNames: Record<string, string> = {
      JENNIFER: 'Hair by Jennifer',
      'HAIR BY JENNIFER': 'Hair by Jennifer',
      KATHRINE: 'Styled by Kathrine',
      'STYLED BY KATHRINE': 'Styled by Kathrine',
      DIVANA: 'Diva Nails',
      'DIVA NAILS': 'Diva Nails',
      JANA: 'Jana Aesthetics',
      'JANA AESTHETICS': 'Jana Aesthetics',
      'HER BROWS': 'Her Brows',
      KIKI: 'Kiki Nails',
      'KIKI NAILS': 'Kiki Nails',
      MYA: 'Makeup by Mya',
      'MAKEUP BY MYA': 'Makeup by Mya',
      VIKKI: 'Vikki Laid',
      'VIKKI LAID': 'Vikki Laid',
      LASHED: 'Your Lashed',
      'YOUR LASHED': 'Your Lashed',
      'ROSEMAY AESTHETICS': 'RoseMay Aesthetics',
      'FILLER BY JESS': 'Filler by Jess',
      'EYEBROW DELUXE': 'Eyebrow Deluxe',
      'LASHES GALORE': 'Lashes Galore',
      ZEE: 'Zee Nail Artist',
      'ZEE NAIL ARTIST': 'Zee Nail Artist',
      ZOE: 'Painted by Zoe',
      'PAINTED BY ZOE': 'Painted by Zoe',
      'BRAIDED SLICK': 'Braided Slick',
    };
    return displayNames[normalizedName] || providerName;
  }, []);

  // Show loading while fonts are loading
  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DA70D6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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
    cardInput: { backgroundColor: theme.cardBackground, borderRadius: 8, padding: 9, marginBottom: 8, fontSize: 11, fontFamily: 'Jura-VariableFont_wght', color: theme.text, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    liquidGlassSuccessCheckmark: { fontSize: 28, color: theme.text, fontWeight: 'bold' },
    liquidGlassSuccessTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18, color: theme.text, marginBottom: 6, textAlign: 'center' },
    liquidGlassSuccessButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, color: theme.text, fontWeight: '600' },
  }), [theme]);

  return (
    <ErrorBoundary>
      <ThemedBackground>
        <StatusBar barStyle={theme.statusBar} translucent={true} backgroundColor="transparent" />
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleContinueShopping}
              activeOpacity={0.7}
            >
              <Text style={dynamicStyles.backText}>←</Text>
            </TouchableOpacity>

            <Text style={dynamicStyles.headerTitle}>Cart ({String(totalItems ?? 0)})</Text>

            <View style={styles.headerRightButtons}>
              {/* View Bookings Button */}
              <TouchableOpacity
                style={styles.bookingsButton}
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
              <BlurView intensity={60} tint={theme.blurTint} style={styles.reviewModalContainer}>
                <View style={styles.reviewModalContent}>
                  <Text style={[styles.reviewModalTitle, { color: theme.text }]}>Confirm Your Details</Text>
                  <Text style={[styles.reviewModalSubtitle, { color: theme.secondaryText }]}>
                    This info will be shared with your provider
                  </Text>

                  {/* Name */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: theme.secondaryText }]}>NAME</Text>
                    <TextInput
                      style={[styles.reviewInput, { color: theme.text, borderColor: theme.border, backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : 'rgba(255,255,255,0.15)' }]}
                      value={reviewName}
                      onChangeText={setReviewName}
                      placeholder="Your name"
                      placeholderTextColor={theme.secondaryText}
                    />
                  </View>

                  {/* Email */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: theme.secondaryText }]}>EMAIL</Text>
                    <TextInput
                      style={[styles.reviewInput, { color: theme.text, borderColor: theme.border, backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : 'rgba(255,255,255,0.15)' }]}
                      value={reviewEmail}
                      onChangeText={setReviewEmail}
                      placeholder="your@email.com"
                      placeholderTextColor={theme.secondaryText}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  {/* Phone */}
                  <View style={styles.reviewFieldGroup}>
                    <Text style={[styles.reviewFieldLabel, { color: theme.secondaryText }]}>PHONE NUMBER</Text>
                    <TextInput
                      style={[styles.reviewInput, {
                        color: theme.text,
                        borderColor: !reviewPhone.trim() ? '#FF3B30' : theme.border,
                        backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : 'rgba(255,255,255,0.15)',
                      }]}
                      value={reviewPhone}
                      onChangeText={setReviewPhone}
                      placeholder="+44 7700 900000"
                      placeholderTextColor={theme.secondaryText}
                      keyboardType="phone-pad"
                    />
                    {!reviewPhone.trim() && (
                      <Text style={styles.reviewPhoneWarning}>Phone number is required to book</Text>
                    )}
                  </View>

                  {/* Save as Default */}
                  <TouchableOpacity
                    style={styles.reviewCheckboxRow}
                    onPress={() => setSaveAsDefault(!saveAsDefault)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.reviewCheckbox, {
                      borderColor: theme.border,
                      backgroundColor: saveAsDefault ? theme.accent : 'transparent',
                    }]}>
                      {saveAsDefault && <Text style={styles.reviewCheckmark}>✓</Text>}
                    </View>
                    <Text style={[styles.reviewCheckboxLabel, { color: theme.text }]}>
                      Set as default for future bookings
                    </Text>
                  </TouchableOpacity>

                  {/* Buttons */}
                  <View style={styles.reviewButtonRow}>
                    <TouchableOpacity
                      style={[styles.reviewCancelBtn, { borderColor: theme.border }]}
                      onPress={() => setShowReviewModal(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.reviewCancelText, { color: theme.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reviewConfirmBtn, { backgroundColor: theme.accent }]}
                      onPress={handleReviewConfirm}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reviewConfirmText}>Continue to Payment</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            </View>
          </Modal>

          {/* Payment Modal - PASS EFFECTIVE ITEMS & TOTAL */}
          <PaymentModal
            isVisible={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            effectiveCartItems={effectiveCartItems}
            totalAmount={effectiveFinalTotal}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentComplete={() => {
              clearCart(); // Clear cart immediately after payment simulation
              setServiceBookings({}); // Clear bookings state
              setShowPaymentModal(false);
              setShowPaymentSuccessModal(true);
            }}
          />

          {/* Liquid Glass Payment Success Modal - ADDED CONTINUE SHOPPING BUTTON */}
          {showPaymentSuccessModal && (
            <Modal visible={true} animationType="fade" transparent={true}>
              <View style={styles.modalOverlayNoBlur}>
                <BlurView intensity={60} tint={theme.blurTint} style={styles.liquidGlassSuccessModalNoBlur}>
                  <View style={styles.liquidGlassSuccessContent}>
                    {/* Success Icon */}
                    <View style={styles.liquidGlassSuccessIcon}>
                      <Text style={[styles.liquidGlassSuccessCheckmark, { color: theme.text }]}>✓</Text>
                    </View>

                    <Text style={[styles.liquidGlassSuccessTitle, { color: theme.text }]}>Success!</Text>

                    <Text style={[styles.liquidGlassSuccessMessage, { color: theme.secondaryText }]}>
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
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: theme.text }]}>View Bookings</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.liquidGlassSuccessButton}
                        onPress={() => {
                          setShowPaymentSuccessModal(false);
                          handleContinueShopping();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.liquidGlassSuccessButtonText, { color: theme.text }]}>Continue Shopping</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </BlurView>
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
                tintColor="#C850C8"
                colors={['#C850C8']}
                progressBackgroundColor="#FFF"
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

                  // ADD THESE CONSOLE LOGS RIGHT HERE - WRAPPED IN __DEV__
                  if (__DEV__) {
                    console.log('=== PROVIDER LOGO DEBUG ===');
                    console.log('Provider name from cart:', providerName);
                    console.log('Provider items[0]:', providerItems[0]);
                    console.log('Provider service:', providerItems[0]?.providerService);
                    console.log('Logo from function:', getProviderLogo(providerName));
                    console.log('===========================');
                  }

                  return (
                    <View key={providerName} style={styles.providerSection}>
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

                        <TouchableOpacity onPress={() => navigateToProvider(providerName)}>
                          <View style={styles.providerLogoContainer}>
                            <Image
                              source={getProviderLogo(providerName)}
                              style={styles.providerLogo}
                              onError={error => {
                                console.warn('Provider logo failed to load:', error);
                              }}
                            />
                          </View>
                        </TouchableOpacity>

                        <View style={styles.providerInfo}>
                          <Text style={dynamicStyles.providerName}>
                            {getDisplayProviderName(providerName)}
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

                {/* Summary - USE EFFECTIVE TOTALS + SERVICE FEE NOTE */}
                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={dynamicStyles.summaryLabel}>Subtotal</Text>
                    <Text style={dynamicStyles.summaryValue}>£{effectiveTotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={dynamicStyles.summaryLabel}>Service Fee</Text>
                    <Text style={dynamicStyles.summaryValue}>£{getServiceFee().toFixed(2)}</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={dynamicStyles.totalLabel}>Total</Text>
                    <Text style={dynamicStyles.totalValue}>£{effectiveFinalTotal.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Checkout Button - USE EFFECTIVE TOTAL */}
                <TouchableOpacity
                  style={[styles.checkoutButton, isLoading && styles.disabledButton]}
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
                  style={styles.browseButton}
                  onPress={handleContinueShopping} // SAME NAV LOGIC TO HOME MAIN
                >
                  <Text style={styles.browseText}>Browse Services</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
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
    color: '#DA70D6',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  backButton: {
    width: dimensions.navBackButton.width,
    height: dimensions.navBackButton.height,
    borderRadius: dimensions.navBackButton.borderRadius,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    backgroundColor: 'rgba(218,112,214,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
  },
  bookingsText: {
    fontSize: 11,
    fontFamily: 'BakbakOne-Regular',
    color: '#DA70D6',
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(244,67,54,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#ffebee',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: dimensions.card.borderRadius,
    marginBottom: spacing.lg,
    paddingTop: spacing.xl,
    overflow: 'hidden',
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
    borderColor: 'rgba(255,255,255,0.5)',
  },
  providerLogoContainer: {
    position: 'relative',
    marginRight: dimensions.providerLogo.marginRight + 4,
  },
  serviceTypePill: {
    backgroundColor: 'rgba(218,112,214,0.15)',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(218,112,214,0.3)',
  },
  serviceTypeText: {
    fontSize: fonts.serviceTag,
    fontFamily: 'BakbakOne-Regular',
    color: '#DA70D6',
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
    height: 2,
    backgroundColor: 'rgba(218, 112, 214, 0.65)',
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
    shadowColor: '#DA70D6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
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
    color: '#DA70D6',
    marginBottom: spacing.xs,
  },
  serviceDuration: {
    fontSize: fonts.locationText,
    fontFamily: 'Jura-VariableFont_wght',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: spacing.md,
  },
  addOnsContainer: {
    backgroundColor: 'rgba(218,112,214,0.1)',
    padding: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    borderColor: 'rgba(218,112,214,0.3)',
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
    borderTopColor: 'rgba(218,112,214,0.3)',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  addOnsTotal: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    color: '#c32dbeff',
    fontWeight: '900',
  },
  removeButton: {
    width: dimensions.button.small.width,
    height: dimensions.button.small.height,
    borderRadius: dimensions.button.small.borderRadius,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    backgroundColor: 'rgba(218,112,214,0.1)',
    borderColor: '#DA70D6',
  },
  depositOptionText: {
    fontSize: fonts.body.xsmall,
    fontFamily: 'bakbakone-regular',
    color: 'rgba(0,0,0,0.6)',
  },
  depositOptionTextActive: {
    color: '#c32dbeff',
    fontWeight: '900',
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
    backgroundColor: 'rgba(255,255,255,0.9)',
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
    backgroundColor: '#2196F3',
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
    backgroundColor: 'rgba(33,150,243,0.1)',
    borderColor: 'rgba(33,150,243,0.3)',
  },
  notesButtonWithContent: {
    backgroundColor: 'rgba(33,150,243,0.1)',
    borderColor:'rgba(33,150,243,0.3)',
  },
  notesButtonText: {
    fontSize: fonts.body.small,
    fontFamily: 'BakbakOne-Regular',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  notesButtonTextEmpty: {
    color: '#1976D2',
  },
  notesButtonTextWithContent: {
    color: '#1976D2',
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
    backgroundColor: 'rgba(255,255,255,0.5)',
    color: '#000',
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
    backgroundColor: '#2196F3',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
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
    backgroundColor: 'rgba(0,0,0,0.8)',
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
    backgroundColor: 'rgba(0,0,0,0.8)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedPaymentMethod: {
    borderColor: '#DA70D6',
    backgroundColor: 'rgba(218,112,214,0.1)',
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
    borderColor: '#DA70D6',
  },
  paymentMethodRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DA70D6',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    color: '#000',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardInputHalf: {
    flex: 1,
  },
  payButton: {
    backgroundColor: '#DA70D6',
    borderRadius: dimensions.button.large.borderRadius,
    padding: spacing.lg,
    alignItems: 'center',
    margin: spacing.xl,
    marginTop: 0,
  },
  payButtonDisabled: {
    backgroundColor: 'rgba(218,112,214,0.5)',
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
  },
  liquidGlassSuccessContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: dimensions.card.largeBorderRadius,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  liquidGlassSuccessIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(87, 177, 78, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: dimensions.card.smallBorderRadius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
});
export default CartScreen;
