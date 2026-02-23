// BookingsScreen.tsx - COMPLETELY FIXED - NO FREEZING, SMOOTH SCROLLING
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Platform,
  Dimensions,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useFont } from '../contexts/FontContext';
import { useBooking, ConfirmedBooking, BookingStatus } from '../contexts/BookingContext';
import { useCart } from '../contexts/CartContext';
import AppBackground from '../components/AppBackground';
import { HomeScreenProps } from '../navigation/types';

// ==================== TYPES ====================

type Props = HomeScreenProps<'Bookings'>;

interface BookingCardProps {
  booking: ConfirmedBooking;
  onPress: (booking: ConfirmedBooking) => void;
}

// ==================== CONSTANTS ====================

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// ✅ PROVIDER RESCHEDULE CONFIGURATION
const PROVIDER_RESCHEDULE_CONFIG: Record<string, { maxReschedules: number; cooldownHours: number }> = {
  'Hair by Jennifer': { maxReschedules: 1, cooldownHours: 24 },
  'Styled by Kathrine': { maxReschedules: 1, cooldownHours: 24 },
  'Diva Nails': { maxReschedules: 1, cooldownHours: 24 },
  'Jana Aesthetics': { maxReschedules: 1, cooldownHours: 24 },
  'Her Brows': { maxReschedules: 1, cooldownHours: 24 },
  "Kiki's Nails": { maxReschedules: 1, cooldownHours: 24 },
  'Makeup by Mya': { maxReschedules: 1, cooldownHours: 24 },
  'Vikki Laid': { maxReschedules: 1, cooldownHours: 24 },
  'Your Lashed': { maxReschedules: 1, cooldownHours: 24 },
};

// ==================== HELPER FUNCTIONS ====================

const getFullProviderName = (shortName: string): string => {
  const nameMap: Record<string, string> = {
    JENNIFER: 'Hair by Jennifer',
    'Hair by Jennifer': 'Hair by Jennifer',
    KATHRINE: 'Styled by Kathrine',
    'Styled by Kathrine': 'Styled by Kathrine',
    DIVANA: 'Diva Nails',
    'Diva Nails': 'Diva Nails',
    JANA: 'Jana Aesthetics',
    'Jana Aesthetics': 'Jana Aesthetics',
    'HER BROWS': 'Her Brows',
    'Her Brows': 'Her Brows',
    KIKI: "Kiki's Nails",
    "Kiki's Nails": "Kiki's Nails",
    MYA: 'Makeup by Mya',
    'Makeup by Mya': 'Makeup by Mya',
    VIKKI: 'Vikki Laid',
    'Vikki Laid': 'Vikki Laid',
    LASHED: 'Your Lashed',
    'Your Lashed': 'Your Lashed',
  };
  return nameMap[shortName] || shortName;
};

// ✅ Generate dynamic future dates based on ACTUAL calendar months
// ✅ REPLACE the generateDynamicRescheduleDates function:
const generateDynamicRescheduleDates = (selectedMonth?: Date) => {
  const baseDate = selectedMonth || new Date();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  
  const dates = [];
  const today = new Date();
  
  let startDate = new Date(year, month, 1);
  if (startDate < today) {
    startDate = new Date(today);
    startDate.setDate(today.getDate() + 1);
  }
  
  for (let i = 0; i < 3; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i * 2);
    
    if (currentDate.getMonth() !== month) break;
    
    dates.push({
      date: currentDate.toISOString().split('T')[0],
      times: ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'],
    });
  }
  
  // ✅ FIX: Add type safety for nextDate
  while (dates.length < 3) {
    const lastDateEntry = dates[dates.length - 1];
    const nextDate: Date = lastDateEntry?.date
      ? new Date(lastDateEntry.date) // ✅ Safe access
      : new Date(year, month + 1, 1);
    
    nextDate.setDate(nextDate.getDate() + 2);
    
    dates.push({
      date: nextDate.toISOString().split('T')[0],
      times: ['10:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'],
    });
  }
  
  return dates;
};

// ==================== PAYMENT CALCULATION ====================

const calculatePaymentBreakdown = (booking: ConfirmedBooking) => {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((s, a) => s + (a.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge || 2.99;
  const total = subtotal + serviceCharge;

  const paymentType = booking.paymentType || 'full';
  const amountPaidAtCheckout = booking.amountPaid;
  const depositAmount = booking.depositAmount || 0;
  const remainingBalance = total - amountPaidAtCheckout;

  // For deposits: total paid at checkout = deposit + service charge
  const totalPaidAtCheckout = paymentType === 'deposit'
    ? depositAmount + serviceCharge
    : amountPaidAtCheckout;

  return {
    servicePrice,
    addOnsTotal,
    subtotal,
    serviceCharge,
    total,
    paymentType,
    depositAmount,
    amountPaidAtCheckout,
    remainingBalance,
    totalPaidAtCheckout,
  };
};

// ==================== COMPONENTS ====================

const HiddenDevMenuTrigger = ({ navigation }: any) => {
  const tapCountRef = React.useRef(0);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = () => {
    tapCountRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    if (tapCountRef.current === 5) {
      console.log('🛠️ Opening Dev Settings...');
      navigation.navigate('DevSettings');
      tapCountRef.current = 0;
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleTap}
      style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, zIndex: 100 }}
      activeOpacity={1}
    />
  );
};

// ✅ OPTIMIZED BookingCard - NO INLINE FUNCTIONS
const BookingCard = React.memo<BookingCardProps>(
  ({ booking, onPress }) => {
    const statusColors = {
      [BookingStatus.CANCELLED]: '#F44336',
      [BookingStatus.NO_SHOW]: '#FF9800',
    };

    const showStatusBadge =
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.NO_SHOW ||
      booking.isPendingReschedule;

    const wasRescheduled = !!booking.rescheduleRequest?.originalDate && !booking.isPendingReschedule;
    
    const badgeText = useMemo(() => {
      if (booking.isPendingReschedule) {
        const hasProviderResponse = !!(booking as any).rescheduleRequest?.providerAvailableDates;
        return hasProviderResponse ? 'AVAILABLE' : 'PENDING';
      }
      if (booking.status === BookingStatus.CANCELLED) return 'CANCELLED';
      if (booking.status === BookingStatus.NO_SHOW) return 'NO SHOW';
      return '';
    }, [booking.isPendingReschedule, booking.status]);
    
    const badgeColor = useMemo(() => {
      if (booking.isPendingReschedule) return '#9C27B0';
      return statusColors[booking.status as keyof typeof statusColors] || '#9E9E9E';
    }, [booking.isPendingReschedule, booking.status]);

    const handlePress = useCallback(() => {
      onPress(booking);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [booking, onPress]);

    return (
      <Pressable style={styles.providerCard} onPress={handlePress}>
        <Image source={booking.providerImage} style={styles.providerLogo} resizeMode="cover" />
        <View style={styles.providerInfo}>
          <Text style={styles.providerName} numberOfLines={1}>
            {booking.providerName}
          </Text>
          <Text style={styles.providerService} numberOfLines={1}>
            {booking.serviceName}
          </Text>
          <View style={styles.appointmentTime}>
            <View style={styles.dateTimeRow}>
              <Text style={styles.appointmentDate}>
                {new Date(booking.bookingDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              {wasRescheduled && booking.status === BookingStatus.UPCOMING && (
                <View style={styles.purpleDot} />
              )}
            </View>
            <Text style={styles.appointmentTimeText}>{booking.bookingTime}</Text>
          </View>
          {showStatusBadge && (
            <View style={[styles.statusBadgeSmall, { backgroundColor: badgeColor }]}>
              <Text style={styles.statusBadgeText}>{badgeText}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }
);

BookingCard.displayName = 'BookingCard';

// ==================== MAIN COMPONENT ====================

const BookingsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { textStyles } = useFont();
  const { addToCart, items: cartItems } = useCart();
  
  const {
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    cancelBooking,
    requestReschedule,
    providerRespondToReschedule,
    confirmReschedule,
    reloadBookings,
  } = useBooking();

  const filteredPastBookings = useMemo(() => pastBookings.filter(b => !b.isPendingReschedule), [pastBookings]);
  const filteredUpcomingBookings = useMemo(() => upcomingBookings, [upcomingBookings]);

  const mapRef = useRef<MapView>(null);
  const messageScrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const modalScrollRef = useRef<ScrollView>(null);
  const bookingsListRef = useRef<FlatList>(null);
  const [currentView, setCurrentView] = useState<'tracking' | 'all' | 'past'>('tracking');
  const [selectedBooking, setSelectedBooking] = useState<ConfirmedBooking | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successIcon, setSuccessIcon] = useState('✓');
  const [showCooldownModal, setShowCooldownModal] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasRated, setHasRated] = useState(false);
  const [showRebookAddOnsModal, setShowRebookAddOnsModal] = useState(false);
  const [rebookSelection, setRebookSelection] = useState<'with' | 'without' | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [showTipModal, setShowTipModal] = useState(false);
  const [hasTipped, setHasTipped] = useState(false);
  const [selectedRescheduleMonth, setSelectedRescheduleMonth] = useState<Date>(new Date());
  const [shouldNavigateToCart, setShouldNavigateToCart] = useState(false);

  // ✅ Track rated bookings and reschedules
  const [ratedBookings, setRatedBookings] = useState<Set<string>>(new Set());
  const [tippedBookings, setTippedBookings] = useState<Set<string>>(new Set());
  const [rescheduledBookings, setRescheduledBookings] = useState<Set<string>>(new Set());

  // ✅ Store message history per booking with timestamp (persists for 72hrs after appointment)
  const [messageHistory, setMessageHistory] = useState<Record<string, {
    messages: Array<{
      id: string;
      text: string;
      sender: 'user' | 'provider';
      timestamp: Date;
    }>;
    appointmentDate: string;
  }>>({});

  // ✅ Message state
  const [messages, setMessages] = useState<Array<{
    id: string;
    text: string;
    sender: 'user' | 'provider';
    timestamp: Date;
  }>>([]);

  // ==================== HELPER FUNCTIONS ====================

  const getStatusColor = useCallback((status: string, isPending?: boolean) => {
    if (isPending) return '#9C27B0';
    
    const colorMap: Record<string, string> = {
      [BookingStatus.UPCOMING]: '#4CAF50',
      [BookingStatus.IN_PROGRESS]: '#2196F3',
      [BookingStatus.COMPLETED]: '#2196F3',
      [BookingStatus.CANCELLED]: '#F44336',
      [BookingStatus.NO_SHOW]: '#FF9800',
    };
    return colorMap[status] || '#9E9E9E';
  }, []);

  const focusMapOnLocation = useCallback((coordinates: { latitude: number; longitude: number }) => {
    if (mapRef.current && coordinates) {
      mapRef.current.animateToRegion(
        {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        1000
      );
    }
  }, []);

  const openInMaps = useCallback(async (booking: ConfirmedBooking) => {
    try {
      const { coordinates, address } = booking;
      const label = encodeURIComponent(address);
      const url = Platform.select({
        ios: `maps:${coordinates.latitude},${coordinates.longitude}?q=${label}`,
        android: `geo:${coordinates.latitude},${coordinates.longitude}?q=${label}`,
      });
      if (url) {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          await Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
          );
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to open maps');
    }
  }, []);

  const isLocationVisible = useCallback((bookingDate: string) => {
    const appointmentDate = new Date(bookingDate);
    const now = new Date();
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilAppointment <= 24;
  }, []);

  // ✅ Check if messaging is available (within 72 hours before or after appointment)
  const isMessagingAvailable = useCallback((bookingDate: string) => {
    const appointmentDate = new Date(bookingDate);
    const now = new Date();
    const hoursDifference = Math.abs((appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    return hoursDifference <= 72;
  }, []);

  const handleBookingPress = useCallback((booking: ConfirmedBooking) => {
    setSelectedBooking(booking);
    setModalVisible(true);
  }, []);

  // ✅ Check reschedule limits with same-day restriction
  const canRescheduleBooking = useCallback((booking: ConfirmedBooking) => {
    const config = PROVIDER_RESCHEDULE_CONFIG[booking.providerName] || { maxReschedules: 1, cooldownHours: 24 };
    const rescheduleCount = (booking as any).rescheduleCount || 0;

    if (rescheduleCount >= config.maxReschedules) {
      return {
        canReschedule: false,
        reason: `This provider only allows ${config.maxReschedules} reschedule${config.maxReschedules > 1 ? 's' : ''} per booking.\n\nPlease contact the provider directly for further changes.`,
      };
    }

    // ✅ Check if user has already rescheduled today (same-day limit)
    if (booking.rescheduleRequest?.lastRescheduledAt) {
      const lastTime = new Date(booking.rescheduleRequest.lastRescheduledAt);
      const now = new Date();

      // Check if the last reschedule was today
      const isSameDay = lastTime.toDateString() === now.toDateString();

      if (isSameDay) {
        const cooldownMessage = config.cooldownHours === 24
          ? 'You have already rescheduled this appointment today.\n\nPlease wait 24 hours to reschedule again. This provider requires a 24-hour wait between reschedules.'
          : `You have already rescheduled this appointment today. This provider requires a ${config.cooldownHours}-hour wait between reschedules.`;

        return {
          canReschedule: false,
          reason: cooldownMessage,
        };
      }
    }

    return { canReschedule: true };
  }, []);

  // ✅ FIXED: Book Again - checks cart, shows proper modals
  const handleRebook = useCallback((booking: ConfirmedBooking) => {
    // Check if already in cart
    const alreadyInCart = cartItems.some(item =>
      item.serviceName === booking.serviceName &&
      item.providerName === booking.providerName
    );

    if (alreadyInCart) {
      // Close the booking details modal
      setModalVisible(false);

      // Re-enable scrolling
      setTimeout(() => {
        mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
        modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
      }, 100);

      // Show warning modal
      setSuccessMessage(`${booking.serviceName} from ${booking.providerName} is already in your cart.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    // ✅ FIX: Set selectedBooking BEFORE showing modal
    setSelectedBooking(booking);

    // ✅ FIX: Close main modal first and re-enable scrolling
    setModalVisible(false);

    // Re-enable scrolling immediately
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    if (booking.addOns && booking.addOns.length > 0) {
      // Small delay to allow main modal to close first
      setTimeout(() => {
        setShowRebookAddOnsModal(true);
      }, 300);
    } else {
      // No add-ons, add directly to cart
      const cartItem = {
        providerName: booking.providerName,
        providerImage: booking.providerImage,
        providerService: booking.providerService,
        service: {
          id: `rebook_${Date.now()}`,
          name: booking.serviceName,
          price: booking.price,
          duration: booking.duration,
          description: booking.providerService,
          addOns: [],
        },
        quantity: 1,
      };

      addToCart(cartItem);
      setModalVisible(false);
      setSuccessMessage(`${booking.serviceName} has been added to your cart.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
      setShouldNavigateToCart(true);
    }
  }, [cartItems, addToCart]);

  // ✅ Confirm rebook with/without add-ons
  const confirmRebook = useCallback((selection?: 'with' | 'without') => {
    const finalSelection = selection || rebookSelection;
    if (!selectedBooking || !finalSelection) return;

    // Check if already in cart before adding
    const alreadyInCart = cartItems.some(item =>
      item.serviceName === selectedBooking.serviceName &&
      item.providerName === selectedBooking.providerName
    );

    if (alreadyInCart) {
      setShowRebookAddOnsModal(false);
      setTimeout(() => {
        mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
        modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
      }, 100);
      setSuccessMessage(`${selectedBooking.serviceName} from ${selectedBooking.providerName} is already in your cart.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    setShowRebookAddOnsModal(false);

    // ✅ FIX: Re-enable scrolling when closing add-ons modal
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    const cartItem = {
      providerName: selectedBooking.providerName,
      providerImage: selectedBooking.providerImage,
      providerService: selectedBooking.providerService,
      service: {
        id: `rebook_${Date.now()}`,
        name: selectedBooking.serviceName,
        price: selectedBooking.price,
        duration: selectedBooking.duration,
        description: selectedBooking.providerService,
        addOns: finalSelection === 'with' ? (selectedBooking.addOns || []) : [],
      },
      quantity: 1,
    };

    addToCart(cartItem);
    setRebookSelection(null);
    setModalVisible(false);
    setSuccessMessage(`${selectedBooking.serviceName} has been added to your cart.`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
    setShouldNavigateToCart(true);
  }, [selectedBooking, rebookSelection, addToCart, cartItems]);

  // ==================== ACTION HANDLERS ====================

  const handleCancelBooking = useCallback(async () => {
    if (!selectedBooking) return;

    setIsLoading(true);
    try {
      await cancelBooking(selectedBooking.id);
      setModalVisible(false);
      setShowCancelModal(false);
      setSuccessMessage('Your appointment has been cancelled successfully.');
      setSuccessIcon('✓');
      setShowSuccessModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking, cancelBooking]);

  const handleRescheduleRequest = useCallback(() => {
    if (!selectedBooking) return;

    // ✅ Check if booking has already been rescheduled
    if (rescheduledBookings.has(selectedBooking.id)) {
      setSuccessMessage('This appointment has already been rescheduled.\n\nYou cannot reschedule it again. Please contact the provider directly for further changes.');
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    // ✅ Check cooldown BEFORE opening reschedule modal
    const rescheduleCheck = canRescheduleBooking(selectedBooking);
    if (!rescheduleCheck.canReschedule) {
      setModalVisible(false);
      setCooldownMessage(rescheduleCheck.reason || 'Unable to reschedule at this time');
      setShowCooldownModal(true);
      return;
    }

    setModalVisible(false);
    setSelectedRescheduleMonth(new Date()); // Reset to current month
    setShowRescheduleModal(true);
  }, [selectedBooking, canRescheduleBooking, rescheduledBookings]);

  const handleRescheduleConfirm = useCallback(async () => {
    if (!selectedBooking || selectedDates.length === 0) {
      Alert.alert('Select Date/Time', 'Please select at least one option.');
      return;
    }

    setIsLoading(true);
    try {
      if ((selectedBooking as any).rescheduleRequest?.providerAvailableDates) {
        const selectedSlot = selectedDates[0];
        
        if (!selectedSlot) {
          Alert.alert('Error', 'Please select a time slot.');
          setIsLoading(false);
          return;
        }
        
        const lastHyphenIndex = selectedSlot.lastIndexOf('-');
        
        if (lastHyphenIndex === -1) {
          Alert.alert('Error', 'Invalid time slot format.');
          setIsLoading(false);
          return;
        }
        
        const date = selectedSlot.substring(0, lastHyphenIndex);
        const time = selectedSlot.substring(lastHyphenIndex + 1);
        
        if (!date || !time || date.length < 10) {
          Alert.alert('Error', 'Invalid date/time format.');
          setIsLoading(false);
          return;
        }

        setShowRescheduleModal(false);
        setModalVisible(false);
        setSelectedDates([]);

        await confirmReschedule(selectedBooking.id, date, time);
        await reloadBookings();

        // ✅ Mark booking as rescheduled
        setRescheduledBookings(prev => new Set(prev).add(selectedBooking.id));

        setSuccessMessage('Your appointment has been rescheduled successfully!');
        setSuccessIcon('✓');
        setShowSuccessModal(true);
        
      } else {
        setShowRescheduleModal(false);
        setModalVisible(false);
        setSelectedDates([]);
        
        await requestReschedule(selectedBooking.id, selectedDates);
        await reloadBookings();
        
        setSuccessMessage(`Reschedule request sent! ${selectedBooking.providerName} will respond with available dates.`);
        setSuccessIcon('✓');
        setShowSuccessModal(true);

        // ✅ Use dynamic dates based on selected month
        setTimeout(async () => {
          const mockAvailableDates = generateDynamicRescheduleDates(selectedRescheduleMonth)
            .filter((d): d is { date: string; times: string[] } => d.date !== undefined); // ✅ Filter out undefined dates with type guard

          try {
            await providerRespondToReschedule(selectedBooking.id, mockAvailableDates);
            await reloadBookings();
          } catch (error) {
            console.error('❌ Error simulating provider response:', error);
          }
        }, 300000); // 5 minutes
      }
    } catch (error: any) {
      console.error('❌ Reschedule error:', error);
      Alert.alert('Error', error.message || 'Failed to process reschedule request.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking, selectedDates, selectedRescheduleMonth, requestReschedule, confirmReschedule, providerRespondToReschedule, reloadBookings]);

  // ✅ FIXED: Rating locks after first submission + re-enable scrolling
  const handleRatingSubmit = useCallback(async () => {
    if (!selectedBooking || rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting.');
      return;
    }

    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ✅ Mark as rated
      setRatedBookings(prev => new Set(prev).add(selectedBooking.id));
      setHasRated(true);
      setIsLoading(false);

      setTimeout(() => {
        setShowRatingModal(false);
        setHasRated(false);
        setRating(0);
        setReviewText('');

        // ✅ Re-enable main scroll and modal scroll immediately after closing
        setTimeout(() => {
          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
        }, 100);
      }, 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to submit rating.');
      setIsLoading(false);
    }
  }, [selectedBooking, rating]);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !selectedBooking) return;

    const newMessage = {
      id: `msg_${Date.now()}`,
      text: messageText.trim(),
      sender: 'user' as const,
      timestamp: new Date(),
    };

    // ✅ Update messages state
    setMessages(prev => [...prev, newMessage]);

    // ✅ Save to messageHistory for persistence
    setMessageHistory(prev => ({
      ...prev,
      [selectedBooking.id]: {
        messages: [...(prev[selectedBooking.id]?.messages || []), newMessage],
        appointmentDate: selectedBooking.bookingDate,
      },
    }));

    setMessageText('');

    // Simulate provider response after 2 seconds
    setTimeout(() => {
      const responses = [
        "Thanks for reaching out! I'll get back to you shortly.",
        "Got it! Looking forward to seeing you.",
        "Thanks for letting me know!",
        "Sounds good! See you then.",
      ];

      const randomIndex = Math.floor(Math.random() * responses.length);
      const providerResponse = {
        id: `msg_${Date.now()}_provider`,
        text: responses[randomIndex] || "Thanks for reaching out!",
        sender: 'provider' as const,
        timestamp: new Date(),
      };

      // ✅ Update messages state
      setMessages(prev => [...prev, providerResponse]);

      // ✅ Save provider response to messageHistory
      setMessageHistory(prev => ({
        ...prev,
        [selectedBooking.id]: {
          messages: [...(prev[selectedBooking.id]?.messages || []), providerResponse],
          appointmentDate: selectedBooking.bookingDate,
        },
      }));

      setTimeout(() => {
        messageScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, 2000);

    setTimeout(() => {
      messageScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messageText, selectedBooking]);

  // ✅ FIXED: Tip locks after submission with success modal
  const handleTipSubmit = useCallback(() => {
    if (!selectedBooking || tipAmount <= 0) {
      Alert.alert('Invalid Tip', 'Please enter a valid tip amount.');
      return;
    }
    
    console.log('💰 Processing tip:', tipAmount);
    
    // ✅ Mark as tipped
    setTippedBookings(prev => new Set(prev).add(selectedBooking.id));
    setHasTipped(true);
    
    // Close tip modal and show success
    setShowTipModal(false);
    setSuccessMessage(`Thank you for tipping £${tipAmount.toFixed(2)}!`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    
    // Reset after showing success
    setTimeout(() => {
      setTipAmount(0);
      setHasTipped(false);
    }, 2000);
  }, [selectedBooking, tipAmount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadBookings();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [reloadBookings]);

  // ==================== EFFECTS ====================

  useEffect(() => {
    if (currentBooking?.coordinates && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: currentBooking.coordinates.latitude,
          longitude: currentBooking.coordinates.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        1000
      );
    }
  }, [currentBooking]);

  // ✅ Handle route params - open specific booking from notifications
  useEffect(() => {
    if (route?.params?.openBookingId) {
      const bookingId = route.params.openBookingId;
      const shouldOpenReschedule = route.params.openReschedule;

      console.log('📋 BookingsScreen received params:', { bookingId, shouldOpenReschedule });

      // Switch to 'all' view to show the bookings list instead of map
      setCurrentView('all');

      // Find booking in all lists
      const allBookings = [
        ...(todayBookings || []),
        ...(upcomingBookings || []),
        ...(pastBookings || []),
      ];

      const booking = allBookings.find(b => b.id === bookingId);

      if (booking) {
        console.log('✅ Found booking:', booking.id);
        setSelectedBooking(booking);

        // Small delay to ensure view is switched and modal can open
        setTimeout(() => {
          if (shouldOpenReschedule && booking.isPendingReschedule) {
            // Open reschedule modal directly
            console.log('🔄 Opening reschedule modal');
            setShowRescheduleModal(true);
            setModalVisible(false);
          } else {
            // Open booking details modal
            console.log('📖 Opening booking details modal');
            setModalVisible(true);
          }
        }, 200);

        // Clear params after handling
        navigation.setParams({ openBookingId: undefined, openReschedule: undefined } as any);
      } else {
        console.warn('⚠️ Booking not found:', bookingId);
      }
    }
  }, [route?.params?.openBookingId, route?.params?.openReschedule, todayBookings, upcomingBookings, pastBookings, filteredUpcomingBookings, navigation]);

  // ✅ Load message history when message modal opens
  useEffect(() => {
    if (showMessageModal && selectedBooking) {
      // Load existing messages from history
      const history = messageHistory[selectedBooking.id];
      if (history && history.messages.length > 0) {
        setMessages(history.messages);
        // Scroll to bottom after loading
        setTimeout(() => {
          messageScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
      // Note: Don't clear messages if there's no history - let them persist
    }
  }, [showMessageModal, selectedBooking, messageHistory]);

  // ==================== COMPUTED VALUES ====================

  const routeCoordinates = useMemo(() => todayBookings.map(b => b.coordinates), [todayBookings]);

  const groupedBookings = useMemo(() => {
    const bookings = currentView === 'all' ? filteredUpcomingBookings : filteredPastBookings;
    return bookings.reduce(
      (acc, booking) => {
        const serviceKey = booking.providerService;
        if (!acc[serviceKey]) acc[serviceKey] = [];
        acc[serviceKey].push(booking);
        return acc;
      },
      {} as Record<string, ConfirmedBooking[]>
    );
  }, [currentView, filteredUpcomingBookings, filteredPastBookings]);

  // ✅ Check if booking has been rated or tipped
  const hasBookingBeenRated = useCallback((bookingId: string) => ratedBookings.has(bookingId), [ratedBookings]);
  const hasBookingBeenTipped = useCallback((bookingId: string) => tippedBookings.has(bookingId), [tippedBookings]);

  // ==================== RENDER ====================

  return (
    <AppBackground>
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {/* ✅ SINGLE SCROLLVIEW - NO NESTING */}
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
          bounces={true}
          scrollEnabled={true}
          nestedScrollEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#C850C8"
              colors={['#C850C8']}
              progressBackgroundColor="#FFF"
            />
          }
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>TRACK APPOINTMENT</Text>
              <Text style={styles.headerSubtitle}>
                {todayBookings.length > 0 ? 'Maintenance day is here' : 'No appointments today'}
              </Text>
              <HiddenDevMenuTrigger navigation={navigation} />
            </View>

            {/* Category Toggle */}
            <View style={styles.categoryContainer}>
              <TouchableOpacity
                onPress={() => setCurrentView('all')}
                style={styles.categoryButtonWrapper}
              >
                <BlurView
                  intensity={25}
                  tint="light"
                  style={[
                    styles.categoryButton,
                    currentView === 'all' && styles.categoryButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      currentView === 'all' && styles.categoryTextActive,
                    ]}
                  >
                    All Bookings
                  </Text>
                </BlurView>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCurrentView('past')}
                style={styles.categoryButtonWrapper}
              >
                <BlurView
                  intensity={25}
                  tint="light"
                  style={[
                    styles.categoryButton,
                    currentView === 'past' && styles.categoryButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      currentView === 'past' && styles.categoryTextActive,
                    ]}
                  >
                    Past Bookings
                  </Text>
                </BlurView>
              </TouchableOpacity>
            </View>
            {/* Tracking View */}
            {currentView === 'tracking' && (
              <>
                <View style={styles.mapContainer}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={{
                      latitude: currentBooking?.coordinates.latitude || 34.0736,
                      longitude: currentBooking?.coordinates.longitude || -118.4004,
                      latitudeDelta: 0.15,
                      longitudeDelta: 0.15,
                    }}
                    mapType="standard"
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    showsCompass={false}
                    zoomEnabled={true}
                    scrollEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    {todayBookings.length > 0 ? (
                      <>
                        {todayBookings.map(booking => (
                          <Marker
                            key={booking.id}
                            coordinate={booking.coordinates}
                            title={booking.serviceName}
                            description={booking.providerName}
                            onPress={() => focusMapOnLocation(booking.coordinates)}
                          >
                            <View
                              style={[
                                styles.serviceMarker,
                                booking.id === currentBooking?.id && styles.activeServiceMarker,
                              ]}
                            >
                              <View style={styles.markerContent}>
                                <Text
                                  style={[
                                    styles.serviceLabel,
                                    booking.id === currentBooking?.id && styles.activeServiceLabel,
                                  ]}
                                >
                                  {booking.providerService.toUpperCase()}
                                </Text>
                                <Text style={styles.serviceDuration}> • {booking.duration}</Text>
                              </View>
                              {booking.id === currentBooking?.id && (
                                <View style={styles.activeMarkerDot} />
                              )}
                            </View>
                          </Marker>
                        ))}
                        {routeCoordinates.length > 1 && (
                          <Polyline
                            coordinates={routeCoordinates}
                            strokeColor="#C850C8"
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                          />
                        )}
                      </>
                    ) : (
                      <Marker
                        coordinate={{ latitude: 34.0736, longitude: -118.4004 }}
                        title="No appointments today"
                      >
                        <View style={styles.serviceMarker}>
                          <Text style={styles.serviceLabel}>YOUR AREA</Text>
                        </View>
                      </Marker>
                    )}
                  </MapView>
                </View>

                {todayBookings.length > 0 ? (
                  <>
                    {allTodayBookingsCompleted ? (
                      <View style={styles.upcomingSection}>
                        <BlurView intensity={25} tint="light" style={styles.sectionLabel}>
                          <Text style={styles.congratsLabelText}>
                            🎉 CONGRATULATIONS! ALL BOOKINGS COMPLETED 🎉
                          </Text>
                        </BlurView>
                        <FlatList
                          data={todayBookings}
                          keyExtractor={booking => booking.id}
                          renderItem={({ item: booking }) => (
                            <TouchableOpacity
                              style={styles.appointmentCard}
                              onPress={() => focusMapOnLocation(booking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint="light" style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {booking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {new Date(booking.bookingDate).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })} • {booking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {booking.providerName} - {booking.status.replace('_', ' ')}
                                    </Text>
                                  </View>
                                  <View style={styles.actionButtons}>
                                    <TouchableOpacity
                                      style={[
                                        styles.rateButton,
                                        hasBookingBeenRated(booking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenRated(booking.id)) {
                                          Alert.alert('Already Rated', 'You have already rated this appointment.');
                                          return;
                                        }
                                        setSelectedBooking(booking);
                                        setShowRatingModal(true);
                                      }}
                                      disabled={hasBookingBeenRated(booking.id)}
                                    >
                                      <Text style={styles.buttonText}>
                                        {hasBookingBeenRated(booking.id) ? 'Rated ✓' : 'Rate'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        styles.tipButton,
                                        hasBookingBeenTipped(booking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenTipped(booking.id)) {
                                          Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                          return;
                                        }
                                        setSelectedBooking(booking);
                                        setShowTipModal(true);
                                      }}
                                      disabled={hasBookingBeenTipped(booking.id)}
                                    >
                                      <Text style={styles.buttonText}>
                                        {hasBookingBeenTipped(booking.id) ? 'Tipped ✓' : 'Tip'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.bookAgainButton}
                                      onPress={() => handleRebook(booking)}
                                    >
                                      <Text style={styles.buttonTextWhite}>Book Again</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                          )}
                          scrollEnabled={false}
                        />
                      </View>
                    ) : (
                      <>
                        {currentBooking && (
                          <View style={styles.upcomingSection}>
                            <BlurView intensity={25} tint="light" style={styles.sectionLabel}>
                              <Text style={styles.upcomingLabelText}>UPCOMING</Text>
                            </BlurView>
                            <TouchableOpacity
                              style={styles.appointmentCard}
                              onPress={() => focusMapOnLocation(currentBooking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint="light" style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {currentBooking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {new Date(currentBooking.bookingDate).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })} • {currentBooking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {currentBooking.providerName} - {currentBooking.status.replace('_', ' ')}
                                    </Text>
                                    {currentBooking.status !== BookingStatus.COMPLETED && (
                                      <Text style={styles.appointmentAddress}>
                                        {currentBooking.address}
                                      </Text>
                                    )}
                                  </View>
                                  <View style={styles.actionButtons}>
                                    {currentBooking.status === BookingStatus.COMPLETED ? (
                                      <>
                                        {/* ✅ RATE BUTTON - CHECK IF ALREADY RATED */}
                                        <TouchableOpacity
                                          style={[
                                            styles.rateButton,
                                            hasBookingBeenRated(currentBooking.id) && styles.buttonDisabled
                                          ]}
                                          onPress={() => {
                                            if (hasBookingBeenRated(currentBooking.id)) {
                                              Alert.alert('Already Rated', 'You have already rated this appointment.');
                                              return;
                                            }
                                            setSelectedBooking(currentBooking);
                                            setShowRatingModal(true);
                                          }}
                                          disabled={hasBookingBeenRated(currentBooking.id)}
                                        >
                                          <Text style={styles.buttonText}>
                                            {hasBookingBeenRated(currentBooking.id) ? 'Rated ✓' : 'Rate'}
                                          </Text>
                                        </TouchableOpacity>
                                        {/* ✅ TIP BUTTON - CHECK IF ALREADY TIPPED */}
                                        <TouchableOpacity
                                          style={[
                                            styles.tipButton,
                                            hasBookingBeenTipped(currentBooking.id) && styles.buttonDisabled
                                          ]}
                                          onPress={() => {
                                            if (hasBookingBeenTipped(currentBooking.id)) {
                                              Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                              return;
                                            }
                                            setSelectedBooking(currentBooking);
                                            setShowTipModal(true);
                                          }}
                                          disabled={hasBookingBeenTipped(currentBooking.id)}
                                        >
                                          <Text style={styles.buttonText}>
                                            {hasBookingBeenTipped(currentBooking.id) ? 'Tipped ✓' : 'Tip'}
                                          </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.bookAgainButton}
                                          onPress={() => handleRebook(currentBooking)}
                                        >
                                          <Text style={styles.buttonTextWhite}>Book Again</Text>
                                        </TouchableOpacity>
                                      </>
                                    ) : (
                                      <>
                                        <TouchableOpacity
                                          style={styles.directionsButton}
                                          onPress={() => openInMaps(currentBooking)}
                                        >
                                          <Text style={styles.buttonText}>Directions</Text>
                                        </TouchableOpacity>
                                        {isMessagingAvailable(currentBooking.bookingDate) && (
                                          <TouchableOpacity
                                            style={styles.messageButton}
                                            onPress={() => {
                                              setSelectedBooking(currentBooking);
                                              setShowMessageModal(true);
                                            }}
                                          >
                                            <Text style={styles.buttonText}>Message</Text>
                                          </TouchableOpacity>
                                        )}
                                      </>
                                    )}
                                  </View>
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                          </View>
                        )}
                        {nextBookings.length > 0 && (
                          <View style={styles.nextSection}>
                            <BlurView intensity={25} tint="light" style={styles.sectionLabel}>
                              <Text style={styles.nextLabelText}>NEXT</Text>
                            </BlurView>
                            <FlatList
                              data={nextBookings}
                              keyExtractor={booking => booking.id}
                              renderItem={({ item: booking }) => (
                                <TouchableOpacity
                                  style={styles.nextAppointmentCard}
                                  onPress={() => focusMapOnLocation(booking.coordinates)}
                                  activeOpacity={0.8}
                                >
                                  <BlurView intensity={15} tint="light" style={styles.cardBlur}>
                                    <View style={styles.cardContent}>
                                      <View style={styles.appointmentInfo}>
                                        <Text style={styles.nextAppointmentService}>
                                          {booking.serviceName}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {new Date(booking.bookingDate).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                          })} • {booking.bookingTime}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {booking.providerName} - {booking.duration}
                                        </Text>
                                        {booking.status !== BookingStatus.COMPLETED && (
                                          <Text style={styles.nextAppointmentAddress}>
                                            {booking.address}
                                          </Text>
                                        )}
                                      </View>
                                      <View style={styles.actionButtons}>
                                        {booking.status === BookingStatus.COMPLETED ? (
                                          <>
                                            <TouchableOpacity
                                              style={[
                                                styles.rateButton,
                                                hasBookingBeenRated(booking.id) && styles.buttonDisabled
                                              ]}
                                              onPress={() => {
                                                if (hasBookingBeenRated(booking.id)) {
                                                  Alert.alert('Already Rated', 'You have already rated this appointment.');
                                                  return;
                                                }
                                                setSelectedBooking(booking);
                                                setShowRatingModal(true);
                                              }}
                                              disabled={hasBookingBeenRated(booking.id)}
                                            >
                                              <Text style={styles.buttonText}>
                                                {hasBookingBeenRated(booking.id) ? 'Rated ✓' : 'Rate'}
                                              </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={[
                                                styles.tipButton,
                                                hasBookingBeenTipped(booking.id) && styles.buttonDisabled
                                              ]}
                                              onPress={() => {
                                                if (hasBookingBeenTipped(booking.id)) {
                                                  Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                                  return;
                                                }
                                                setSelectedBooking(booking);
                                                setShowTipModal(true);
                                              }}
                                              disabled={hasBookingBeenTipped(booking.id)}
                                            >
                                              <Text style={styles.buttonText}>
                                                {hasBookingBeenTipped(booking.id) ? 'Tipped ✓' : 'Tip'}
                                              </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={styles.bookAgainButton}
                                              onPress={() => handleRebook(booking)}
                                            >
                                              <Text style={styles.buttonTextWhite}>Book Again</Text>
                                            </TouchableOpacity>
                                          </>
                                        ) : (
                                          <>
                                            <TouchableOpacity
                                              style={styles.directionsButton}
                                              onPress={() => openInMaps(booking)}
                                            >
                                              <Text style={styles.buttonText}>Directions</Text>
                                            </TouchableOpacity>
                                            {isMessagingAvailable(booking.bookingDate) && (
                                              <TouchableOpacity
                                                style={styles.messageButton}
                                                onPress={() => {
                                                  setSelectedBooking(booking);
                                                  setShowMessageModal(true);
                                                }}
                                              >
                                                <Text style={styles.buttonText}>Message</Text>
                                              </TouchableOpacity>
                                            )}
                                          </>
                                        )}
                                      </View>
                                    </View>
                                  </BlurView>
                                </TouchableOpacity>
                              )}
                              scrollEnabled={false}
                              removeClippedSubviews={true}
                              maxToRenderPerBatch={3}
                              windowSize={3}
                              initialNumToRender={3}
                            />
                          </View>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No appointments scheduled for today</Text>
                    <Text style={styles.emptyStateSubtext}>
                      View All Bookings to see upcoming appointments
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* All/Past Bookings View */}
            {(currentView === 'all' || currentView === 'past') && (
              <View style={styles.bookingsContainer}>
                <TouchableOpacity
                  onPress={() => setCurrentView('tracking')}
                  style={styles.backToTrackingButton}
                >
                  <Text style={styles.backToTrackingText}>← Back to Tracking</Text>
                </TouchableOpacity>
                <Text style={styles.bookingsTitle}>
                  {currentView === 'all' ? 'UPCOMING BOOKINGS' : 'PAST BOOKINGS'}
                </Text>
                {Object.keys(groupedBookings).length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      {currentView === 'all' ? 'No upcoming bookings' : 'No past bookings'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    ref={bookingsListRef}
                    data={Object.entries(groupedBookings)}
                    keyExtractor={([serviceType]) => serviceType}
                    onScrollToIndexFailed={(info) => {
                      console.warn('Scroll to index failed:', info);
                      // Fallback: scroll to offset
                      bookingsListRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true,
                      });
                    }}
                    renderItem={({ item: [serviceType, bookings] }) => (
                      <View style={styles.serviceCategory}>
                        <View style={styles.serviceCategoryHeader}>
                          <View style={styles.serviceCategoryTag}>
                            <Text style={styles.serviceCategoryName}>
                              {serviceType.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <FlatList
                          horizontal
                          data={bookings}
                          keyExtractor={booking => booking.id}
                          renderItem={({ item: booking }) => (
                            <BookingCard booking={booking} onPress={handleBookingPress} />
                          )}
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.serviceImagesContainer}
                          removeClippedSubviews={true}
                          maxToRenderPerBatch={5}
                          windowSize={5}
                          initialNumToRender={3}
                          getItemLayout={(data, index) => ({
                            length: 162,
                            offset: 162 * index,
                            index,
                          })}
                        />
                      </View>
                    )}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={false}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={3}
                    windowSize={5}
                    initialNumToRender={2}
                    updateCellsBatchingPeriod={50}
                    contentContainerStyle={styles.flatListContent}
                  />
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ✅ MAIN BOOKING DETAILS MODAL - OPTIMIZED */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => {
            setModalVisible(false);
            setShowReceipt(false);
            // ✅ FIX: Re-enable scrolling when closing modal via back button
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => {
                setModalVisible(false);
                setShowReceipt(false);
                Keyboard.dismiss();
                // ✅ FIX: Re-enable scrolling when closing modal via backdrop
                setTimeout(() => {
                  mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                  modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                }, 100);
              }}
            />
            <View style={styles.modalContentWrapper}>
              <View style={styles.modalContent}>
                <BlurView intensity={95} tint="light" style={styles.modalBlur}>
                  {selectedBooking && (
                    <View style={styles.modalContainer}>
                      <ScrollView
                        ref={modalScrollRef}
                        showsVerticalScrollIndicator={false}
                        bounces={true}
                        scrollEnabled={true}
                        style={styles.modalScrollView}
                        contentContainerStyle={styles.modalScrollContent}
                        keyboardShouldPersistTaps="handled"
                        removeClippedSubviews={false}
                        scrollEventThrottle={16}
                        nestedScrollEnabled={false}
                        directionalLockEnabled={false}
                      >
                          {/* Header */}
                          <View style={styles.modalHeader}>
                            <Image
                              source={selectedBooking.providerImage}
                              style={styles.modalProviderImage}
                              resizeMode="cover"
                            />
                            <Text style={styles.modalProviderName}>
                              {getFullProviderName(selectedBooking.providerName)}
                            </Text>
                            <View style={styles.modalServiceTypeBadge}>
                              <Text style={styles.modalServiceTypeText}>
                                {selectedBooking.providerService.toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          {/* Appointment Details */}
                          <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>APPOINTMENT DETAILS</Text>
                            <View style={styles.modalCard}>
                              <View style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Service</Text>
                                <Text style={styles.modalValue} numberOfLines={2}>
                                  {selectedBooking.serviceName}
                                </Text>
                              </View>
                              <View style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Date</Text>
                                <View style={styles.modalValueWithIndicator}>
                                  {selectedBooking.rescheduleRequest?.originalDate &&
                                   !selectedBooking.isPendingReschedule &&
                                   selectedBooking.status === BookingStatus.UPCOMING && (
                                    <View style={[styles.rescheduledBadge, { marginLeft: -90, marginRight: 8, marginTop: 0, alignSelf: 'flex-start' }]}>
                                      <Text style={styles.rescheduledBadgeText}>RESCHEDULED</Text>
                                    </View>
                                  )}
                                  <Text style={styles.modalValue}>
                                    {new Date(selectedBooking.bookingDate).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Time</Text>
                                <Text style={styles.modalTimeValue}>
                                  {selectedBooking.bookingTime}
                                </Text>
                              </View>
                              <View style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Duration</Text>
                                <Text style={styles.modalValue}>{selectedBooking.duration}</Text>
                              </View>
                              <View style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Status</Text>
                                <View style={[
                                  styles.modalStatusBadge,
                                  { 
                                    backgroundColor: selectedBooking.isPendingReschedule 
                                      ? '#9C27B0' 
                                      : getStatusColor(selectedBooking.status) 
                                  }
                                ]}>
                                  <Text style={styles.modalStatusText}>
                                    {selectedBooking.isPendingReschedule
                                      ? ((selectedBooking as any).rescheduleRequest?.providerAvailableDates
                                        ? 'RESCHEDULE AVAILABLE'
                                        : 'RESCHEDULE PENDING')
                                      : selectedBooking.status.replace('_', ' ').toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              <View style={[styles.modalRow, styles.modalPriceRow]}>
                                <View style={styles.modalPriceLabelContainer}>
                                  <Text style={styles.modalLabel}>Price</Text>
                                  {(selectedBooking.addOns?.length ?? 0) > 0 && (
                                    <Text style={styles.modalPriceNoteInline}>
                                      {' '}
                                      (without add-ons)
                                    </Text>
                                  )}
                                </View>
                                <Text style={styles.modalPriceValueBlack}>
                                  £{selectedBooking.price.toFixed(2)}
                                </Text>
                              </View>
                              {selectedBooking.serviceDescription && (
                                <View style={styles.modalDescriptionSection}>
                                  <Text style={styles.modalDescriptionLabel}>Service Details</Text>
                                  <Text style={styles.modalDescriptionText}>
                                    {selectedBooking.serviceDescription}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Add-Ons */}
                          {(selectedBooking.addOns?.length ?? 0) > 0 && (
                            <View style={styles.modalSection}>
                              <View style={styles.modalAddOnsHeaderCompact}>
                                <Text style={styles.modalSectionTitle}>ADD-ONS</Text>
                                <View style={styles.modalAddOnsBadgeSmall}>
                                  <Text style={styles.modalAddOnsBadgeTextSmall}>
                                    {selectedBooking.addOns?.length ?? 0}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.modalAddOnsCardCompact}>
                                {selectedBooking.addOns?.map((addOn, idx) => (
                                  <View key={idx} style={styles.modalAddOnRowCompact}>
                                    <View style={styles.modalAddOnDotSmall} />
                                    <Text style={styles.modalAddOnNameSmall}>{addOn.name}</Text>
                                    <Text style={styles.modalAddOnPriceSmall}>
                                      +£{addOn.price.toFixed(2)}
                                    </Text>
                                  </View>
                                ))}
                                <View style={styles.modalAddOnsDividerSmall} />
                                <View style={styles.modalTotalRowCompact}>
                                  <Text style={styles.modalTotalLabelSmall}>Total with Add-ons</Text>
                                  <Text style={styles.modalTotalValueSmall}>
                                    £
                                    {(
                                      selectedBooking.price +
                                      (selectedBooking.addOns?.reduce((s, a) => s + a.price, 0) ?? 0)
                                    ).toFixed(2)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          )}

                          {/* Payment Status - ORIGINAL RECEIPT */}
                          <View style={styles.modalSection}>
                            <View style={styles.modalSectionTitleRow}>
                              <Text style={styles.modalSectionTitle}>PAYMENT STATUS</Text>
                              <TouchableOpacity
                                style={[
                                  styles.viewReceiptButton,
                                  showReceipt && styles.viewReceiptButtonActive,
                                ]}
                                onPress={() => {
                                  setShowReceipt(!showReceipt);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.viewReceiptButtonText,
                                    showReceipt && styles.viewReceiptButtonTextActive,
                                  ]}
                                >
                                  {showReceipt ? 'Hide Receipt' : 'View Receipt'}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {!showReceipt && (
                              <View style={styles.modalPaymentCardGrey}>
                                {(() => {
                                  const payment = calculatePaymentBreakdown(selectedBooking);

                                  return (
                                    <>
                                      <View style={styles.modalPaymentRowCompact}>
                                        <Text style={styles.modalPaymentLabelCompact}>
                                          Total
                                        </Text>
                                        <Text style={styles.modalPaymentValueCompact}>
                                          £{payment.total.toFixed(2)}
                                        </Text>
                                      </View>
                                      <View style={styles.modalPaymentRowCompact}>
                                        <Text style={styles.modalPaymentLabelCompact}>
                                          {payment.paymentType === 'full' ? 'Total Paid' : 'Total Paid'}
                                        </Text>
                                        <Text style={styles.modalDepositValueCompact}>
                                          £{payment.paymentType === 'full'
                                            ? payment.amountPaidAtCheckout.toFixed(2)
                                            : payment.totalPaidAtCheckout.toFixed(2)}
                                        </Text>
                                      </View>
                                      <View style={styles.modalRemainingBalanceRowGrey}>
                                        <Text style={styles.modalRemainingBalanceLabelGrey}>
                                          Due at Appointment
                                        </Text>
                                        <Text style={styles.modalRemainingBalanceValueGrey}>
                                          £{payment.remainingBalance.toFixed(2)}
                                        </Text>
                                      </View>
                                      {payment.paymentType === 'full' && (
                                        <View style={styles.fullyPaidBadge}>
                                          <Text style={styles.fullyPaidText}>
                                            Paid in Full
                                          </Text>
                                        </View>
                                      )}
                                    </>
                                  );
                                })()}
                              </View>
                            )}
{/* ✅ ORIGINAL RECEIPT FORMAT */}
                            {showReceipt && (
                              <View style={styles.receiptContainer}>
                                <View style={styles.receiptPaper}>
                                  <Text style={styles.receiptHeaderText}>PAYMENT RECEIPT</Text>
                                  <View style={styles.receiptDivider} />
                                  <View style={styles.receiptSection}>
                                    <View style={styles.receiptRow}>
                                      <Text style={styles.receiptLabel}>Service</Text>
                                      <Text style={styles.receiptValue} numberOfLines={2}>
                                        {selectedBooking.serviceName}
                                      </Text>
                                    </View>
                                    <View style={styles.receiptRow}>
                                      <Text style={styles.receiptLabel}>Base Price</Text>
                                      <Text style={styles.receiptValue}>
                                        £{selectedBooking.price.toFixed(2)}
                                      </Text>
                                    </View>
                                  </View>
                                  {(selectedBooking.addOns?.length ?? 0) > 0 && (
                                    <>
                                      <View style={styles.receiptDivider} />
                                      <View style={styles.receiptSection}>
                                        <Text style={styles.receiptSectionTitle}>ADD-ONS</Text>
                                        {selectedBooking.addOns?.map((addOn, idx) => (
                                          <View key={idx} style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>• {addOn.name}</Text>
                                            <Text style={styles.receiptValue}>
                                              +£{addOn.price.toFixed(2)}
                                            </Text>
                                          </View>
                                        ))}
                                      </View>
                                    </>
                                  )}
                                  <View style={styles.receiptDivider} />
                                  {(() => {
                                    const payment = calculatePaymentBreakdown(selectedBooking);

                                    if (payment.paymentType === 'deposit') {
                                      // DEPOSIT PAYMENT RECEIPT
                                      return (
                                        <View style={styles.receiptSection}>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Subtotal</Text>
                                            <Text style={styles.receiptValue}>
                                              £{payment.subtotal.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Service Charge</Text>
                                            <Text style={styles.receiptValue}>
                                              £{payment.serviceCharge.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={[styles.receiptRow, styles.receiptTotalRow]}>
                                            <Text style={styles.receiptTotalLabel}>Total</Text>
                                            <Text style={styles.receiptTotalValue}>
                                              £{payment.total.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptDivider} />
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Deposit Paid</Text>
                                            <Text style={styles.receiptValueGreen}>
                                              £{payment.depositAmount.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Total Paid</Text>
                                            <Text style={styles.receiptValueGreen}>
                                              £{payment.totalPaidAtCheckout.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={[styles.receiptRow, styles.receiptBalanceRow]}>
                                            <Text style={styles.receiptBalanceLabel}>Balance Due at Appointment</Text>
                                            <Text
                                              style={[
                                                styles.receiptBalanceValue,
                                                payment.remainingBalance > 0 &&
                                                  styles.receiptBalanceValueOrange,
                                              ]}
                                            >
                                              £{payment.remainingBalance.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptDivider} />
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Type</Text>
                                            <Text style={styles.receiptValue}>Deposit</Text>
                                          </View>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Method</Text>
                                            <Text style={styles.receiptValue}>
                                              {(selectedBooking as any).paymentMethod || 'Card'}
                                            </Text>
                                          </View>
                                        </View>
                                      );
                                    } else {
                                      // FULL PAYMENT RECEIPT
                                      return (
                                        <View style={styles.receiptSection}>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Subtotal</Text>
                                            <Text style={styles.receiptValue}>
                                              £{payment.subtotal.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Service Charge</Text>
                                            <Text style={styles.receiptValue}>
                                              £{payment.serviceCharge.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={[styles.receiptRow, styles.receiptTotalRow]}>
                                            <Text style={styles.receiptTotalLabel}>Total</Text>
                                            <Text style={styles.receiptTotalValue}>
                                              £{payment.total.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptDivider} />
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Total Paid</Text>
                                            <Text style={styles.receiptValueGreen}>
                                              £{payment.amountPaidAtCheckout.toFixed(2)}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptDivider} />
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Type</Text>
                                            <Text style={styles.receiptValue}>Full Payment</Text>
                                          </View>
                                          <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Method</Text>
                                            <Text style={styles.receiptValue}>
                                              {(selectedBooking as any).paymentMethod || 'Card'}
                                            </Text>
                                          </View>
                                          <View style={styles.receiptFullyPaidBadge}>
                                            <Text style={styles.receiptFullyPaidText}>
                                              Paid in Full
                                            </Text>
                                          </View>
                                        </View>
                                      );
                                    }
                                  })()}
                                  <View style={styles.receiptDivider} />
                                  <View style={styles.receiptFooter}>
                                    <Text style={styles.receiptReference}>
                                      REF: {selectedBooking.id}
                                    </Text>
                                    <Text style={styles.receiptDate}>
                                      {new Date(selectedBooking.createdAt).toLocaleDateString(
                                        'en-US',
                                        {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        }
                                      )}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>

                          {!showReceipt && (
                            <>
                              {selectedBooking.notes && (
                                <View style={styles.modalSection}>
                                  <Text style={styles.modalSectionTitle}>YOUR NOTES</Text>
                                  <View style={styles.modalNotesCard}>
                                    <Text style={styles.modalNotesText}>{selectedBooking.notes}</Text>
                                  </View>
                                </View>
                              )}
                              {selectedBooking.bookingInstructions && (
                                <View style={styles.modalSection}>
                                  <Text style={styles.modalSectionTitle}>INSTRUCTIONS</Text>
                                  <View style={styles.modalInstructionsCard}>
                                    <Text style={styles.modalInstructionsText}>
                                      {selectedBooking.bookingInstructions}
                                    </Text>
                                  </View>
                                </View>
                              )}

                              {/* HIDE CONTACT IF COMPLETED OR CANCELLED */}
                              {selectedBooking.status !== BookingStatus.COMPLETED && 
                               selectedBooking.status !== BookingStatus.CANCELLED && (
                                <View style={styles.modalSection}>
                                  <Text style={styles.modalSectionTitle}>CONTACT & LOCATION</Text>
                                  <View style={styles.modalCard}>
                                    <View style={styles.modalContactBlock}>
                                      <Text style={styles.modalLabel}>Message Provider</Text>
                                      {isMessagingAvailable(selectedBooking.bookingDate) ? (
                                        <TouchableOpacity
                                          style={styles.modalMessageButtonLarge}
                                          onPress={() => {
                                            setModalVisible(false);
                                            setShowMessageModal(true);
                                            // ✅ FIX: Re-enable scrolling when opening message modal
                                            setTimeout(() => {
                                              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                            }, 100);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.modalMessageButtonText}>
                                            Send Message
                                          </Text>
                                        </TouchableOpacity>
                                      ) : (
                                        <View style={styles.modalLockedBadge}>
                                          <Text style={styles.modalLockedText}>
                                            Available within 72 hours of appointment
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.modalContactBlock}>
                                      <Text style={styles.modalLabel}>Address</Text>
                                      {isLocationVisible(selectedBooking.bookingDate) ? (
                                        <>
                                          <Text style={styles.modalAddressText}>
                                            {selectedBooking.address}
                                          </Text>
                                          <TouchableOpacity
                                            style={styles.modalDirectionsButtonSmall}
                                            onPress={() => {
                                              setModalVisible(false);
                                              openInMaps(selectedBooking);
                                            }}
                                            activeOpacity={0.7}
                                          >
                                            <Text style={styles.modalDirectionsButtonTextSmall}>
                                              GET DIRECTIONS
                                            </Text>
                                          </TouchableOpacity>
                                        </>
                                      ) : (
                                        <View style={styles.modalLockedBadge}>
                                          <Text style={styles.modalLockedText}>
                                            Location revealed 24 hours before appointment
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              )}

                              {/* ACTIONS - UPCOMING */}
                              {selectedBooking.status === BookingStatus.UPCOMING && !selectedBooking.isPendingReschedule && (
                                <View style={styles.modalActionsSection}>
                                  <View style={styles.modalActionsRow}>
                                    <TouchableOpacity
                                      style={styles.modalCancelButton}
                                      onPress={() => {
                                        setModalVisible(false);
                                        setShowCancelModal(true);
                                        // ✅ FIX: Re-enable scrolling when opening cancel modal
                                        setTimeout(() => {
                                          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                        }, 100);
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.modalCancelButtonText}>Cancel Booking</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.modalActionButton}
                                      onPress={() => {
                                        handleRescheduleRequest();
                                        // ✅ FIX: Re-enable scrolling when opening reschedule modal
                                        setTimeout(() => {
                                          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                        }, 100);
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.modalActionButtonText}>Reschedule</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}

                              {/* ACTIONS - COMPLETED */}
                              {selectedBooking.status === BookingStatus.COMPLETED && (
                                <View style={styles.modalActionsSection}>
                                  <View style={styles.modalActionsRow}>
                                    <TouchableOpacity
                                      style={[
                                        styles.modalRateButton,
                                        hasBookingBeenRated(selectedBooking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenRated(selectedBooking.id)) {
                                          Alert.alert('Already Rated', 'You have already rated this appointment.');
                                          return;
                                        }
                                        setModalVisible(false);
                                        setShowRatingModal(true);
                                      }}
                                      disabled={hasBookingBeenRated(selectedBooking.id)}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.modalButtonText}>
                                        {hasBookingBeenRated(selectedBooking.id) ? 'Rated ✓' : 'Rate'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        styles.modalTipButton,
                                        hasBookingBeenTipped(selectedBooking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenTipped(selectedBooking.id)) {
                                          Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                          return;
                                        }
                                        setModalVisible(false);
                                        setShowTipModal(true);
                                      }}
                                      disabled={hasBookingBeenTipped(selectedBooking.id)}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.modalButtonText}>
                                        {hasBookingBeenTipped(selectedBooking.id) ? 'Tipped ✓' : 'Tip'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.modalBookAgainButton}
                                      onPress={() => {
                                        if (selectedBooking) {
                                          handleRebook(selectedBooking);
                                        }
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.modalButtonText}>
                                        Book Again
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              )}

                              {/* RESCHEDULE STATUS */}
                              {selectedBooking.isPendingReschedule && (
                                <View style={styles.modalActionsSection}>
                                  <View style={styles.rescheduleStatusCard}>
                                    <Text style={styles.rescheduleStatusTitle}>
                                      {(selectedBooking as any).rescheduleRequest?.providerAvailableDates
                                        ? 'Available Times Received!'
                                        : 'Reschedule Requested'}
                                    </Text>
                                    <Text style={styles.rescheduleStatusText}>
                                      {(selectedBooking as any).rescheduleRequest?.providerAvailableDates
                                        ? `${selectedBooking.providerName} has responded with available times. Select your preferred slot to confirm your new appointment.`
                                        : `Waiting for ${selectedBooking.providerName} to confirm new dates. You'll be notified once they respond with available times.`}
                                    </Text>

                                    {/* Action Buttons Row */}
                                    <View style={styles.modalActionsRow}>
                                      {/* Cancel Booking Button - Always visible */}
                                      <TouchableOpacity
                                        style={[styles.modalCancelButton, { flex: 1, marginRight: (selectedBooking as any).rescheduleRequest?.providerAvailableDates ? 6 : 0 }]}
                                        onPress={() => {
                                          setModalVisible(false);
                                          setShowCancelModal(true);
                                          // ✅ FIX: Re-enable scrolling when opening cancel modal
                                          setTimeout(() => {
                                            mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                            modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                          }, 100);
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Text style={styles.modalCancelButtonText}>Cancel Booking</Text>
                                      </TouchableOpacity>

                                      {/* Reschedule Now or Cancel Request */}
                                      {(selectedBooking as any).rescheduleRequest?.providerAvailableDates ? (
                                        <TouchableOpacity
                                          style={[styles.confirmRescheduleButton, { flex: 1, marginLeft: 6 }]}
                                          onPress={() => {
                                            setModalVisible(false);
                                            setShowRescheduleModal(true);
                                            // ✅ FIX: Re-enable scrolling when opening reschedule modal
                                            setTimeout(() => {
                                              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                            }, 100);
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Text style={styles.confirmRescheduleText}>
                                            Reschedule Now
                                          </Text>
                                        </TouchableOpacity>
                                      ) : null}
                                    </View>
                                  </View>
                                </View>
                              )}
                            </>
                          )}
                          <View style={styles.modalBottomSpace} />
                        </ScrollView>

                        <View style={styles.modalFooter}>
                          <TouchableOpacity
                            style={styles.modalCloseButtonFullWidth}
                            onPress={() => {
                              setModalVisible(false);
                              setShowReceipt(false);
                              // ✅ FIX: Re-enable scrolling when closing modal
                              setTimeout(() => {
                                mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                                modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                              }, 100);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.modalCloseButtonFullWidthText}>CLOSE</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </BlurView>
                </View>
              </View>
            </View>
          </Modal>

        {/* ✅ CANCEL MODAL */}
        <Modal
          visible={showCancelModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowCancelModal(false)}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.rescheduleModalOverlay}>
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <Text style={styles.rescheduleTitle}>Cancel Booking</Text>
                  <Text style={styles.rescheduleSubtitle}>
                    Are you sure you want to cancel "{selectedBooking?.serviceName}"?
                    {'\n\n'}This action cannot be undone.
                  </Text>
                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={styles.cancelRescheduleButton}
                      onPress={() => setShowCancelModal(false)}
                      disabled={isLoading}
                    >
                      <Text style={styles.cancelRescheduleText}>Keep Booking</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmRescheduleButton, { backgroundColor: '#F44336' }]}
                      onPress={handleCancelBooking}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.confirmRescheduleText}>Yes, Cancel</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ✅ RESCHEDULE MODAL WITH DYNAMIC DATES */}
        <Modal
          visible={showRescheduleModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowRescheduleModal(false);
            setSelectedDates([]);
          }}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.rescheduleModalOverlay}>
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <Text style={styles.rescheduleTitle}>
                    {(selectedBooking as any)?.rescheduleRequest?.providerAvailableDates
                      ? 'Choose New Time'
                      : 'Request Reschedule'}
                  </Text>
                  <Text style={styles.rescheduleSubtitle}>
                    {(selectedBooking as any)?.rescheduleRequest?.providerAvailableDates
                      ? `${selectedBooking?.providerName} has availability on these dates`
                      : 'Select your preferred dates'}
                  </Text>

                  {(selectedBooking as any)?.rescheduleRequest?.providerAvailableDates ? (
                    <ScrollView
                      style={styles.availableDatesScrollView}
                      scrollEnabled={true}
                      showsVerticalScrollIndicator={false}
                      bounces={true}
                      nestedScrollEnabled={true}
                      keyboardShouldPersistTaps="handled"
                      removeClippedSubviews={true}
                      scrollEventThrottle={16}
                    >
                      {(selectedBooking as any).rescheduleRequest.providerAvailableDates.map(
                        (dateOption: any, idx: number) => (
                          <View key={idx} style={styles.dateOptionCard}>
                            <Text style={styles.dateOptionDate}>
                              {new Date(dateOption.date).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </Text>
                            <View style={styles.timeSlots}>
                              {dateOption.times.map((time: string, timeIdx: number) => {
                                const slotKey = `${dateOption.date}-${time}`;
                                const isSelected = selectedDates.includes(slotKey);
                                
                                return (
                                  <TouchableOpacity
                                    key={timeIdx}
                                    style={[
                                      styles.timeSlotChip,
                                      isSelected && styles.timeSlotChipActive,
                                    ]}
                                    onPress={() => {
                                      setSelectedDates([slotKey]);
                                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[
                                        styles.timeSlotText,
                                        isSelected && styles.timeSlotTextActive,
                                      ]}
                                    >
                                      {time}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )
                      )}
                    </ScrollView>
                  ) : (
                    <View style={styles.dateSuggestions}>
                      {['Tomorrow', 'This Weekend', 'Next Week', 'Next Month'].map(suggestion => {
                        const isSelected = selectedDates.includes(suggestion);
                        
                        return (
                          <TouchableOpacity
                            key={suggestion}
                            style={[
                              styles.dateSuggestionChip,
                              isSelected && styles.dateSuggestionActive,
                            ]}
                            onPress={() => {
                              setSelectedDates(prev =>
                                prev.includes(suggestion)
                                  ? prev.filter(d => d !== suggestion)
                                  : [...prev, suggestion]
                              );
                              
                              // ✅ UPDATE SELECTED MONTH WHEN "NEXT MONTH" IS CLICKED
                              if (suggestion === 'Next Month') {
                                const nextMonth = new Date();
                                nextMonth.setMonth(nextMonth.getMonth() + 1);
                                setSelectedRescheduleMonth(nextMonth);
                              }
                              
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.dateSuggestionText,
                                isSelected && styles.dateSuggestionTextActive,
                              ]}
                            >
                              {suggestion}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={styles.cancelRescheduleButton}
                      onPress={() => {
                        setShowRescheduleModal(false);
                        setSelectedDates([]);
                      }}
                      disabled={isLoading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelRescheduleText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.confirmRescheduleButton,
                        selectedDates.length === 0 && styles.confirmRescheduleButtonDisabled,
                      ]}
                      onPress={handleRescheduleConfirm}
                      disabled={isLoading || selectedDates.length === 0}
                      activeOpacity={0.7}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.confirmRescheduleText}>
                          {(selectedBooking as any)?.rescheduleRequest?.providerAvailableDates
                            ? 'Confirm Booking'
                            : 'Send Request'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ✅ SUCCESS/ERROR MODAL */}
        <Modal
          visible={showSuccessModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowSuccessModal(false);
            // ✅ FIX: Re-enable scrolling when closing success modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
              // ✅ FIX: Navigate to Cart AFTER modal closes if flag is set
              if (shouldNavigateToCart) {
                setShouldNavigateToCart(false);
                (navigation as any).getParent()?.navigate('Cart');
              }
            }, 100);
          }}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.rescheduleModalOverlay}>
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <View style={styles.successIconContainer}>
                    <Text style={styles.successIcon}>{successIcon}</Text>
                  </View>
                  <Text style={styles.rescheduleTitle}>
                    {successIcon === '✓' ? 'Success!' : 'Item already in Cart'}
                  </Text>
                  <Text style={styles.rescheduleSubtitle}>{successMessage}</Text>
                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={[styles.confirmRescheduleButton, { flex: 1 }]}
                      onPress={() => {
                        setShowSuccessModal(false);
                        // ✅ FIX: Re-enable scrolling when closing success modal
                        setTimeout(() => {
                          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                          // ✅ FIX: Navigate to Cart AFTER modal closes if flag is set
                          if (shouldNavigateToCart) {
                            setShouldNavigateToCart(false);
                            (navigation as any).getParent()?.navigate('Cart');
                          }
                        }, 100);
                      }}
                    >
                      <Text style={styles.confirmRescheduleText}>Got It</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ✅ COOLDOWN MODAL - Reschedule restriction warning */}
        <Modal
          visible={showCooldownModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowCooldownModal(false);
            // ✅ Re-enable scrolling when closing cooldown modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.rescheduleModalOverlay}>
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <View style={styles.successIconContainer}>
                    <Text style={styles.successIcon}>⚠️</Text>
                  </View>
                  <Text style={styles.rescheduleTitle}>Cannot Reschedule</Text>
                  <Text style={styles.rescheduleSubtitle}>{cooldownMessage}</Text>
                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={[styles.confirmRescheduleButton, { flex: 1 }]}
                      onPress={() => {
                        setShowCooldownModal(false);
                        // ✅ Re-enable scrolling when closing cooldown modal
                        setTimeout(() => {
                          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                        }, 100);
                      }}
                    >
                      <Text style={styles.confirmRescheduleText}>Got It</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ✅ RATING MODAL - LOCKS AFTER FIRST SUBMISSION */}
        <Modal
          visible={showRatingModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowRatingModal(false);
            setHasRated(false);
            setRating(0);
            setReviewText('');
            // ✅ FIX: Re-enable scrolling when closing rating modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.rescheduleModalOverlay}
            >
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  {!hasRated ? (
                    <>
                      <Text style={styles.rescheduleTitle}>Rate Your Experience</Text>
                      <Text style={styles.rescheduleSubtitle}>
                        How was your appointment with {selectedBooking?.providerName}?
                      </Text>

                      <View style={styles.starContainer}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <TouchableOpacity
                            key={star}
                            onPress={() => setRating(star)}
                            style={styles.starButton}
                          >
                            <Text style={[styles.starText, star <= rating && styles.starTextActive]}>
                              ★
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={styles.reviewInputContainer}>
                        <Text style={styles.reviewInputLabel}>Share your experience (optional)</Text>
                        <TextInput
                          style={styles.reviewInput}
                          multiline
                          numberOfLines={4}
                          placeholder="Tell us about your experience..."
                          placeholderTextColor="#999"
                          value={reviewText}
                          onChangeText={setReviewText}
                          maxLength={500}
                          textAlignVertical="top"
                          autoCapitalize="sentences"
                          autoCorrect={true}
                          returnKeyType="default"
                          blurOnSubmit={true}
                        />
                        <Text style={styles.characterCount}>{reviewText.length}/500</Text>
                      </View>

                      <View style={styles.rescheduleActions}>
                        <TouchableOpacity
                          style={styles.cancelRescheduleButton}
                          onPress={() => {
                            setShowRatingModal(false);
                            setRating(0);
                            setReviewText('');
                            Keyboard.dismiss();
                            // ✅ FIX: Re-enable scrolling when skipping rating
                            setTimeout(() => {
                              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                            }, 100);
                          }}
                        >
                          <Text style={styles.cancelRescheduleText}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.confirmRescheduleButton,
                            rating === 0 && styles.confirmRescheduleButtonDisabled,
                          ]}
                          onPress={handleRatingSubmit}
                          disabled={rating === 0 || isLoading}
                        >
                          {isLoading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text style={styles.confirmRescheduleText}>Submit Review</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      {/* ✅ THANKS FOR RATING MESSAGE */}
                      <View style={styles.successIconContainer}>
                        <Text style={styles.successIcon}>✓</Text>
                      </View>
                      <Text style={styles.rescheduleTitle}>Thanks for Your Rating!</Text>
                      <Text style={styles.rescheduleSubtitle}>
                        Your feedback helps us improve our services.
                      </Text>
                    </>
                  )}
                </BlurView>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ✅ REBOOK ADD-ONS MODAL */}
        <Modal
          visible={showRebookAddOnsModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowRebookAddOnsModal(false);
            setRebookSelection(null);
            // ✅ FIX: Re-enable scrolling when closing add-ons modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <Pressable
            style={styles.rescheduleModalOverlay}
            onPress={() => {
              setShowRebookAddOnsModal(false);
              setRebookSelection(null);
              Keyboard.dismiss();
              // ✅ FIX: Re-enable scrolling when closing add-ons modal
              setTimeout(() => {
                mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
              }, 100);
            }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <Text style={styles.rescheduleTitle}>Include Add-Ons?</Text>
                  <Text style={styles.rescheduleSubtitle}>
                    Would you like to include the same add-ons from your previous booking?
                  </Text>

                  {selectedBooking?.addOns && selectedBooking.addOns.length > 0 && (
                    <View style={styles.addOnsList}>
                      {selectedBooking.addOns.map((addOn, idx) => (
                        <View key={idx} style={styles.addOnItemRow}>
                          <View style={styles.addOnDot} />
                          <Text style={styles.addOnItemName}>{addOn.name}</Text>
                          <Text style={styles.addOnItemPrice}>+£{addOn.price.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={styles.cancelRescheduleButton}
                      onPress={() => confirmRebook('without')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelRescheduleText}>Without Add-Ons</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmRescheduleButton}
                      onPress={() => confirmRebook('with')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.confirmRescheduleText}>With Add-Ons</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        </Modal>

                {/* ✅ IN-APP MESSAGE MODAL */}
        <Modal
          visible={showMessageModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowMessageModal(false);
            setMessageText('');
            Keyboard.dismiss();
            // ✅ FIX: Re-enable scrolling when closing message modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.rescheduleModalOverlay}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.rescheduleModalOverlay}>
                <View style={styles.rescheduleModalContent}>
                  <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                    <Text style={styles.rescheduleTitle}>Message Provider</Text>
                    <Text style={styles.rescheduleSubtitle}>
                      Chat with {selectedBooking?.providerName}
                    </Text>

                      {/* Message History */}
                      <ScrollView
                        ref={messageScrollRef}
                        style={styles.messageHistory}
                        contentContainerStyle={[styles.messageHistoryContent, { paddingBottom: 100 }]}
                        scrollEnabled={true}
                        showsVerticalScrollIndicator={false}
                        bounces={true}
                        nestedScrollEnabled={true}
                        onScrollBeginDrag={() => Keyboard.dismiss()}
                      >
                        {messages.length === 0 ? (
                          <Text style={styles.noMessagesText}>No messages yet. Start the conversation!</Text>
                        ) : (
                          messages.map((message) => (
                            <View
                              key={message.id}
                              style={[
                                styles.messageBubble,
                                message.sender === 'user' ? styles.userMessage : styles.providerMessage
                              ]}
                            >
                              <Text style={[
                                styles.messageText,
                                { color: message.sender === 'user' ? '#FFF' : '#000' }
                              ]}>{message.text}</Text>
                              <Text style={[
                                styles.messageTime,
                                { color: message.sender === 'user' ? '#FFF' : '#000' }
                              ]}>
                                {message.timestamp.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </Text>
                            </View>
                          ))
                        )}
                      </ScrollView>

                      {/* Message Input - positioned at bottom */}
                      <View style={styles.messageInputWrapper}>
                        <View style={styles.messageInputContainer}>
                          <TextInput
                            style={styles.messageInput}
                            multiline
                            placeholder="Type your message..."
                            placeholderTextColor="#999"
                            value={messageText}
                            onChangeText={setMessageText}
                            maxLength={500}
                            autoCapitalize="sentences"
                            autoCorrect={true}
                          />
                          <TouchableOpacity
                            style={[
                              styles.sendButton,
                              !messageText.trim() && styles.sendButtonDisabled,
                            ]}
                            onPress={handleSendMessage}
                            disabled={!messageText.trim()}
                          >
                            <Text style={styles.sendButtonText}>Send</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Close Button at bottom */}
                      <TouchableOpacity
                        style={styles.closeModalButton}
                        onPress={() => {
                          setShowMessageModal(false);
                          setMessageText('');
                          Keyboard.dismiss();
                          // ✅ FIX: Re-enable scrolling when closing message modal
                          setTimeout(() => {
                            mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                            modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                          }, 100);
                        }}
                      >
                        <Text style={styles.closeModalButtonText}>Close</Text>
                      </TouchableOpacity>
                  </BlurView>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>

        {/* ✅ TIP MODAL WITH SUCCESS MESSAGE */}
        <Modal
          visible={showTipModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowTipModal(false);
            setTipAmount(0);
            // ✅ FIX: Re-enable scrolling when closing tip modal
            setTimeout(() => {
              mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
              modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
            }, 100);
          }}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.rescheduleModalOverlay}
            >
              <View style={styles.rescheduleModalContent}>
                <BlurView intensity={95} tint="light" style={styles.rescheduleBlur}>
                  <Text style={styles.rescheduleTitle}>Leave a Tip</Text>
                  <Text style={styles.rescheduleSubtitle}>
                    Show your appreciation for {selectedBooking?.providerName}
                  </Text>

                  <View style={styles.tipContainer}>
                    <View style={styles.tipQuickButtons}>
                      {[5, 10, 15, 20].map(amount => (
                        <TouchableOpacity
                          key={amount}
                          style={[
                            styles.tipQuickButton,
                            tipAmount === amount && styles.tipQuickButtonActive,
                          ]}
                          onPress={() => setTipAmount(amount)}
                        >
                          <Text
                            style={[
                              styles.tipQuickButtonText,
                              tipAmount === amount && styles.tipQuickButtonTextActive,
                            ]}
                          >
                            £{amount}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.tipCustomContainer}>
                      <Text style={styles.tipCustomLabel}>Or enter custom amount:</Text>
                      <View style={styles.tipInputWrapper}>
                        <Text style={styles.tipCurrencySymbol}>£</Text>
                        <TextInput
                          style={styles.tipInput}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor="#999"
                          value={tipAmount > 0 ? tipAmount.toString() : ''}
                          onChangeText={(text) => {
                            const amount = parseFloat(text);
                            setTipAmount(isNaN(amount) ? 0 : amount);
                          }}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.rescheduleActions}>
                    <TouchableOpacity
                      style={styles.cancelRescheduleButton}
                      onPress={() => {
                        setShowTipModal(false);
                        setTipAmount(0);
                        // ✅ FIX: Re-enable scrolling when skipping tip
                        setTimeout(() => {
                          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
                          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
                        }, 100);
                      }}
                    >
                      <Text style={styles.cancelRescheduleText}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.confirmRescheduleButton,
                        tipAmount <= 0 && styles.confirmRescheduleButtonDisabled,
                      ]}
                      onPress={handleTipSubmit}
                      disabled={tipAmount <= 0}
                    >
                      <Text style={styles.confirmRescheduleText}>Send Tip</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </AppBackground>
  );
}
// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingTop: 40,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 1,
  },
  headerTitle: {
    fontFamily: 'BakbakOne',
    fontSize: 28,
    color: '#000',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontFamily: 'Jura',
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  categoryButtonWrapper: {
    flex: 1,
  },
  categoryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(200, 80, 200, 0.3)',
    borderColor: '#C850C8',
  },
  categoryText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: '#C850C8',
    letterSpacing: 1,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  mapContainer: {
    height: 300,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  serviceMarker: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(200, 80, 200, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  activeServiceMarker: {
    borderColor: '#C850C8',
    borderWidth: 3,
  },
  markerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceLabel: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: '#000',
    letterSpacing: 1,
  },
  serviceDuration: {
    fontFamily: 'Jura',
    fontSize: 9,
    color: '#666',
    fontWeight: '600',
  },
  activeServiceLabel: {
    color: '#C850C8',
  },
  activeMarkerDot: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 12,
    height: 12,
    backgroundColor: '#C850C8',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  upcomingSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  nextSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  upcomingLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: '#C850C8',
    letterSpacing: 1,
    fontWeight: '800',
  },
  nextLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: '#000',
    letterSpacing: 1,
    fontWeight: '800',
  },
  congratsLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: '#000000ff',
    letterSpacing: 0.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  appointmentCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  nextAppointmentCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardBlur: {
    padding: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    flexDirection: 'column',
    gap: 16,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentService: {
    fontFamily: 'BakbakOne',
    fontSize: 16,
    color: '#000',
    marginBottom: 4,
    letterSpacing: 0.5,
    fontWeight: 'bold',
  },
  appointmentProvider: {
    fontFamily: 'Jura',
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.8)',
    marginBottom: 4,
    fontWeight: '600',
  },
  appointmentAddress: {
    fontFamily: 'barbakOne',
    fontWeight: '400',
    fontSize: 12,
    color: '#C850C8',
    fontStyle: 'italic',
  },
  nextAppointmentService: {
    fontFamily: 'BakbakOne',
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  nextAppointmentProvider: {
    fontFamily: 'Jura',
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.8)',
    marginBottom: 4,
    fontWeight: '600',
  },
  nextAppointmentAddress: {
    fontFamily: 'Jura',
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.6)',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  directionsButton: {
    flex: 1,
    backgroundColor: '#87c5f850',
    borderColor: '#4e94cdff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  messageButton: {
    flex: 1,
    backgroundColor: '#39be3d41',
    borderColor: '#2a972cff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  rateButton: {
    flex: 1,
    backgroundColor: '#d900ff2d',
    borderColor: '#bf00ffff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  tipButton: {
    flex: 1,
    backgroundColor: '#4CAF5050',
    borderColor: '#2b6a2eff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  bookAgainButton: {
    flex: 1,
    backgroundColor: '#f28f0c58',
    borderColor: '#b9550dff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },

  // ✅ DISABLED BUTTON STATE
  buttonDisabled: {
    opacity: 0.5,
    backgroundColor: '#E0E0E0',
  },
  buttonText: {
    fontFamily: 'BakbakOne',
    fontSize: 9,
    color: '#000',
    fontWeight: 'bold',
  },
  buttonTextWhite: {
    fontFamily: 'BakbakOne',
    fontSize: 9,
    color: '#000',
    fontWeight: 'bold',
  },
  bookingsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backToTrackingButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backToTrackingText: {
    fontFamily: 'BakbakOne',
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '800',
  },
  bookingsTitle: {
    fontFamily: 'BakbakOne',
    fontSize: 18,
    color: '#000',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
    fontWeight: '800',
  },
  serviceCategory: {
    marginBottom: 24,
  },
  serviceCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceCategoryTag: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  serviceCategoryName: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: '#fff',
    letterSpacing: 1,
  },
  serviceImagesContainer: {
    gap: 12,
  },
  providerCard: {
    width: 150,
    marginRight: 12,
    backgroundColor: '#FFF',
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  providerLogo: {
    width: '100%',
    height: 100,
    backgroundColor: '#F5F5F5',
  },
  providerInfo: {
    padding: 10,
  },
  providerName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  providerService: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  appointmentTime: {
    marginTop: 4,
  },
  appointmentDate: {
    fontSize: 10,
    color: '#999',
  },
  appointmentTimeText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontFamily: 'BakbakOne',
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontFamily: 'Jura',
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.4)',
    textAlign: 'center',
  },
  statusBadgeSmall: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { 
    fontSize: 9, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  flatListContent: { 
    paddingBottom: 20 
  },
  modalBackdrop: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentWrapper: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: 25,
    overflow: 'hidden',
  },
  modalContent: { 
    borderRadius: 25, 
    overflow: 'hidden' 
  },
  modalBlur: { 
    backgroundColor: 'rgba(255, 255, 255, 0.95)' 
  },
  modalContainer: { 
    maxHeight: '100%' 
  },
  modalScrollView: { 
    maxHeight: '100%' 
  },
  modalScrollContent: { 
    paddingBottom: 20 
  },
  modalHeader: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalProviderImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(200, 80, 200, 0.3)',
  },
  modalProviderName: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#000', 
    marginBottom: 8 
  },
  modalServiceTypeBadge: {
    backgroundColor: 'rgba(200, 80, 200, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200, 80, 200, 0.3)',
  },
  modalServiceTypeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#C850C8',
    letterSpacing: 0.5
  },
  completedStatusBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    marginTop: 12,
  },
  completedStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },
  modalSection: { 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: 'rgba(0, 0, 0, 0.05)' 
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  modalSectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalCard: { 
    backgroundColor: 'rgba(0, 0, 0, 0.02)', 
    borderRadius: 12, 
    padding: 15 
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalLabel: { 
    fontSize: 13, 
    color: '#666', 
    flex: 1 
  },
  modalValue: { 
    fontSize: 13, 
    color: '#000', 
    fontWeight: '500', 
    textAlign: 'right',
    flex: 1,
  },
  modalTimeValue: { 
    fontSize: 13, 
    color: '#000', 
    fontWeight: 'bold', 
    flex: 1, 
    textAlign: 'right' 
  },
  modalStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modalStatusText: { 
    fontSize: 11, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  modalPriceRow: { 
    marginBottom: 0 
  },
  modalPriceLabelContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  modalPriceNoteInline: { 
    fontSize: 11, 
    color: '#999', 
    fontStyle: 'italic' 
  },
  modalPriceValueBlack: { 
    fontSize: 16, 
    color: '#000', 
    fontWeight: 'bold' 
  },
  modalDescriptionSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalDescriptionLabel: { 
    fontSize: 12, 
    color: '#666', 
    marginBottom: 6 
  },
  modalDescriptionText: { 
    fontSize: 12, 
    color: '#333', 
    lineHeight: 18 
  },
  modalAddOnsHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalAddOnsBadgeSmall: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  modalAddOnsBadgeTextSmall: { 
    fontSize: 10, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  modalAddOnsCardCompact: {
    backgroundColor: 'rgba(255, 152, 0, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.2)',
  },
  modalAddOnRowCompact: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  modalAddOnDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9800',
    marginRight: 8,
  },
  modalAddOnNameSmall: { 
    fontSize: 12, 
    color: '#333', 
    flex: 1 
  },
  modalAddOnPriceSmall: { 
    fontSize: 12, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  modalAddOnsDividerSmall: {
    height: 1,
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    marginVertical: 8,
  },
  modalTotalRowCompact: { 
    flexDirection: 'row', 
    justifyContent: 'space-between' 
  },
  modalTotalLabelSmall: { 
    fontSize: 12, 
    color: '#333', 
    fontWeight: 'bold' 
  },
  modalTotalValueSmall: { 
    fontSize: 14, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  modalPaymentCardGrey: { 
    backgroundColor: 'rgba(0, 0, 0, 0.03)', 
    borderRadius: 12, 
    padding: 15 
  },
  modalPaymentRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalPaymentLabelCompact: { 
    fontSize: 12, 
    color: '#666' 
  },
  modalPaymentValueCompact: { 
    fontSize: 12, 
    color: '#333', 
    fontWeight: '600' 
  },
  modalDepositValueCompact: { 
    fontSize: 12, 
    color: '#4CAF50', 
    fontWeight: '600' 
  },
  modalRemainingBalanceRowGrey: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalRemainingBalanceLabelGrey: { 
    fontSize: 13, 
    color: '#333', 
    fontWeight: 'bold' 
  },
  modalRemainingBalanceValueGrey: { 
    fontSize: 14, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  fullyPaidBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10,
    alignSelf: 'center',
  },
  fullyPaidText: { 
    color: '#4CAF50', 
    fontSize: 13, 
    fontWeight: 'bold' 
  },
  modalNotesCard: {

    backgroundColor: 'rgba(33, 150, 243, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.2)',
  },
  modalNotesText: { 
    fontSize: 12, 
    color: '#333', 
    lineHeight: 18 
  },
  modalInstructionsCard: {
    backgroundColor: 'rgba(156, 39, 176, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(156, 39, 176, 0.2)',
  },
  modalInstructionsText: { 
    fontSize: 12, 
    color: '#333', 
    lineHeight: 18 
  },
  modalContactBlock: { 
    marginVertical: 10 
  },
  modalMessageButtonLarge: {
    backgroundColor: '#25D366',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  modalMessageButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: '600' 
  },
  modalLockedBadge: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  modalLockedText: { 
    color: '#E65100', 
    fontSize: 12, 
    fontStyle: 'italic' 
  },
  modalAddressText: { 
    fontSize: 14, 
    color: '#333', 
    marginTop: 8, 
    lineHeight: 20 
  },
  modalDirectionsButtonSmall: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 102,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  modalDirectionsButtonTextSmall: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modalActionsSection: { 
    padding: 20 
  },
  modalActionsRow: { 
    flexDirection: 'row', 
    gap: 12 
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCancelButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: 'bold' 
  },
  modalActionButton: {
    flex: 1,
    backgroundColor: '#9C27B0',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalActionButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: 'bold' 
  },
  rebookButtonModal: {
    backgroundColor: '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rebookButtonTextModal: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completedActionButton: {
    flex: 1,
    backgroundColor: '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 44,
  },
  completedActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalRateButton: {
    flex: 1,
    backgroundColor: '#f200ff1e',
    borderColor: '#bf00ff89',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalTipButton: {
    flex: 1,
    backgroundColor: '#4caf4f31',
    borderColor: '#2b6a2e8e',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalBookAgainButton: {
    flex: 1,
    backgroundColor: '#f28e0c29',
    borderColor: '#b9550d71',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalButtonText: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
  },
  modalBottomSpace: { 
    height: 20 
  },
  modalFooter: { 
    borderTopWidth: 1, 
    borderTopColor: 'rgba(0, 0, 0, 0.1)', 
    padding: 15 
  },
  modalCloseButtonFullWidth: {
    backgroundColor: '#4f4f4fe2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonFullWidthText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  viewReceiptButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    borderColor: '#CFCFCF',
    borderWidth: 1,
  },
  viewReceiptButtonActive: { 
    backgroundColor: '#4CAF50' 
  },
  viewReceiptButtonText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#333' 
  },
  viewReceiptButtonTextActive: { 
    color: '#FFF' 
  },
  receiptContainer: { 
    marginTop: 12, 
    backgroundColor: '#F5F5F5', 
    borderRadius: 8, 
    padding: 12 
  },
  receiptPaper: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  receiptHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
    letterSpacing: 1,
  },
  receiptDivider: { 
    height: 1, 
    backgroundColor: '#E0E0E0', 
    marginVertical: 10 
  },
  receiptSection: { 
    marginVertical: 5 
  },
  receiptSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
    alignItems: 'flex-start',
  },
  receiptLabel: { 
    fontSize: 12, 
    color: '#666', 
    flex: 1 
  },
  receiptValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    textAlign: 'right',
    maxWidth: '50%',
  },
  receiptValueGreen: { 
    fontSize: 12, 
    color: '#4CAF50', 
    fontWeight: 'bold', 
    textAlign: 'right' 
  },
  receiptTotalRow: { 
    marginTop: 5, 
    paddingTop: 5 
  },
  receiptTotalLabel: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#333' 
  },
  receiptTotalValue: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#333' 
  },
  receiptBalanceRow: { 
    marginTop: 5 
  },
  receiptBalanceLabel: { 
    fontSize: 13, 
    fontWeight: 'bold', 
    color: '#333' 
  },
  receiptBalanceValue: { 
    fontSize: 13, 
    fontWeight: 'bold', 
    color: '#333' 
  },
  receiptBalanceValueOrange: { 
    color: '#FF9800' 
  },
  receiptFullyPaidBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'center',
  },
  receiptFullyPaidText: { 
    color: '#4CAF50', 
    fontSize: 12, 
    fontWeight: 'bold' 
  },
  receiptFooter: { 
    marginTop: 10, 
    alignItems: 'center' 
  },
  receiptReference: { 
    fontSize: 10, 
    color: '#999', 
    marginBottom: 2 
  },
  receiptDate: { 
    fontSize: 10, 
    color: '#999' 
  },
  rescheduleModalOverlay: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescheduleModalContent: { 
    width: '90%', 
    maxWidth: 400, 
    maxHeight: '80%',
    borderRadius: 20, 
    overflow: 'hidden' 
  },
  rescheduleBlur: { 
    padding: 24, 
    backgroundColor: 'rgba(255, 255, 255, 0.95)' 
  },
  rescheduleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  rescheduleSubtitle: { 
    fontSize: 14, 
    textAlign: 'center', 
    marginBottom: 20, 
    color: '#666',
    lineHeight: 20,
  },
  dateSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  dateSuggestionChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  dateSuggestionActive: { 
    backgroundColor: '#E8D4F5', 
    borderColor: '#9C27B0' 
  },
  dateSuggestionText: { 
    fontSize: 14, 
    color: '#666' 
  },
  dateSuggestionTextActive: { 
    color: '#9C27B0', 
    fontWeight: '600' 
  },
  rescheduleActions: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    gap: 12 
  },
  cancelRescheduleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  cancelRescheduleText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#666' 
  },
  confirmRescheduleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#9C27B0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmRescheduleButtonDisabled: { 
    backgroundColor: '#CCCCCC' 
  },
  confirmRescheduleText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#FFF' 
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 24,
  },
  starButton: {
    padding: 4,
  },
  starText: {
    fontSize: 36,
    color: '#DDD',
  },
  starTextActive: {
    color: '#FFB300',
  },
  reviewInputContainer: {
    marginBottom: 20,
  },
  reviewInputLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  reviewInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  characterCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  rescheduleStatusCard: {
    backgroundColor: 'rgba(156, 39, 176, 0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'rgba(156, 39, 176, 0.3)',
  },
  rescheduleStatusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9C27B0',
    marginBottom: 8,
    textAlign: 'center',
  },
  rescheduleStatusText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  successIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 40,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  availableDatesScrollView: {
    maxHeight: 300,
    marginBottom: 20,
  },
  dateOptionCard: {
    backgroundColor: 'rgba(156, 39, 176, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(156, 39, 176, 0.15)',
  },
  dateOptionDate: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  timeSlots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  timeSlotChip: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    minWidth: 80,
    alignItems: 'center',
  },
  timeSlotChipActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  timeSlotText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  timeSlotTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  purpleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9C27B0',
  },
  modalValueWithIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-start',
  },
  rescheduledBadge: {
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9C27B0',
    marginRight: 5,
  },
  rescheduledBadgeText: {
    fontSize: 9,
    color: '#9C27B0',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  addOnsList: {
    backgroundColor: 'rgba(255, 152, 0, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.2)',
  },
  addOnItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addOnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9800',
    marginRight: 8,
  },
  addOnItemName: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  addOnItemPrice: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  tipContainer: {
    marginBottom: 20,
  },
  tipQuickButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tipQuickButton: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    minWidth: 70,
    alignItems: 'center',
  },
  tipQuickButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  tipQuickButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
  },
  tipQuickButtonTextActive: {
    color: '#FFF',
  },
  tipCustomContainer: {
    marginTop: 8,
  },
  tipCustomLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  tipInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
  },
  tipCurrencySymbol: {
    fontSize: 18,
    color: '#333',
    fontWeight: 'bold',
    marginRight: 8,
  },
  tipInput: {
    flex: 1,
    fontSize: 18,
    color: '#333',
    paddingVertical: 12,
    fontWeight: 'bold',
  },

// ✅ iMESSAGE CHAT STYLES - ADD ALL OF THESE:
chatContainer: {
  flex: 1,
  backgroundColor: '#FFFFFF',
},
chatHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: '#F9F9F9',
  borderBottomWidth: 1,
  borderBottomColor: '#E5E5E5',
},
chatBackButton: {
  paddingVertical: 8,
  paddingHorizontal: 4,
},
chatBackText: {
  fontSize: 16,
  color: '#007AFF',
  fontWeight: '600',
},
chatHeaderCenter: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
},
chatProviderAvatar: {
  width: 36,
  height: 36,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: '#E5E5E5',
},
chatHeaderInfo: {
  alignItems: 'center',
},
chatProviderName: {
  fontSize: 15,
  fontWeight: '600',
  color: '#000',
},
chatAppointmentInfo: {
  fontSize: 11,
  color: '#8E8E93',
  marginTop: 2,
},
chatHeaderSpacer: {
  width: 60,
},
chatMessagesContainer: {
  flex: 1,
  backgroundColor: '#FFFFFF',
},
chatMessagesContent: {
  padding: 16,
  paddingBottom: 80,
},
chatEmptyState: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 100,
},
chatEmptyIconContainer: {
  width: 80,
  height: 80,
  borderRadius: 40,
  backgroundColor: '#F0F0F0',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
},
chatEmptyIcon: {
  fontSize: 40,
},
chatEmptyTitle: {
  fontSize: 18,
  fontWeight: '600',
  color: '#000',
  marginBottom: 8,
},
chatEmptySubtitle: {
  fontSize: 14,
  color: '#8E8E93',
  textAlign: 'center',
  paddingHorizontal: 40,
  lineHeight: 20,
},
chatMessageRow: {
  flexDirection: 'row',
  marginBottom: 12,
  alignItems: 'flex-end',
  gap: 8,
},
chatMessageRowUser: {
  justifyContent: 'flex-end',
},
chatMessageAvatar: {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: '#E5E5E5',
},
chatMessageAvatarSpacer: {
  width: 30,
},
chatMessageBubble: {
  maxWidth: '70%',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 18,
},
chatMessageBubbleProvider: {
  backgroundColor: '#E9E9EB',
  borderBottomLeftRadius: 4,
},
chatMessageBubbleUser: {
  backgroundColor: '#007AFF',
  borderBottomRightRadius: 4,
},
chatMessageText: {
  fontSize: 15,
  color: '#000',
  lineHeight: 20,
},
chatMessageTextUser: {
  color: '#FFF',
},
chatMessageTime: {
  fontSize: 11,
  color: '#8E8E93',
  marginTop: 4,
},
chatMessageTimeUser: {
  color: 'rgba(255, 255, 255, 0.7)',
},
chatInputContainer: {
  backgroundColor: '#F9F9F9',
  borderTopWidth: 1,
  borderTopColor: '#E5E5E5',
  paddingHorizontal: 12,
  paddingVertical: 8,
},
chatInputWrapper: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
  backgroundColor: '#FFF',
  borderRadius: 20,
  borderWidth: 1,
  borderColor: '#E5E5E5',
  paddingHorizontal: 12,
  paddingVertical: 6,
},
chatInput: {
  flex: 1,
  fontSize: 16,
  color: '#000',
  maxHeight: 100,
  paddingVertical: 6,
},
chatSendButton: {
  backgroundColor: '#007AFF',
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 16,
  justifyContent: 'center',
  alignItems: 'center',
},
chatSendButtonDisabled: {
  backgroundColor: '#C7C7CC',
},
chatSendButtonText: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '600',
},
// Message Modal Styles
messageHistory: {
  maxHeight: 300,
  marginBottom: 16,
  borderRadius: 12,
  backgroundColor: 'rgba(0,0,0,0.02)',
  padding: 12,
},
messageHistoryContent: {
  paddingBottom: 8,
},
noMessagesText: {
  textAlign: 'center',
  color: '#999',
  fontSize: 14,
  fontStyle: 'italic',
  paddingVertical: 20,
},
messageBubble: {
  maxWidth: '80%',
  padding: 12,
  borderRadius: 16,
  marginBottom: 8,
},
userMessage: {
  alignSelf: 'flex-end',
  backgroundColor: '#5d0dbf7b',
},
providerMessage: {
  alignSelf: 'flex-start',
  backgroundColor: '#E5E5EA',
},
messageText: {
  fontSize: 15,
  lineHeight: 20,
  marginBottom: 4,
},
messageTime: {
  fontSize: 11,
  opacity: 0.7,
  textAlign: 'right',
},
messageInputContainer: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
  marginBottom: 12,
},
messageInput: {
  flex: 1,
  backgroundColor: 'rgba(255,255,255,0.8)',
  borderRadius: 20,
  paddingHorizontal: 16,
  paddingVertical: 10,
  fontSize: 15,
  maxHeight: 100,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.1)',
},
sendButton: {
  backgroundColor: '#5d0dbf7b',
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 20,
  justifyContent: 'center',
  alignItems: 'center',
  minWidth: 60,
},
sendButtonDisabled: {
  backgroundColor: '#C7C7CC',
},
sendButtonText: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '600',
},
messageModalHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 16,
  paddingRight: 8,
},
messageModalHeaderContainer: {
  marginBottom: 20,
  paddingBottom: 16,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(0, 0, 0, 0.1)',
},
modalHeaderContent: {
  flex: 1,
  paddingRight: 12,
},
closeMessageButton: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: 'rgba(0,0,0,0.08)',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
},
closeButtonText: {
  fontSize: 24,
  fontWeight: '600',
  color: '#333',
  lineHeight: 24,
},
messageInputWrapper: {
  position: 'absolute',
  bottom: 60,
  left: 0,
  right: 0,
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderTopWidth: 1,
  borderTopColor: 'rgba(0, 0, 0, 0.1)',
},
closeModalButton: {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: '#C850C8',
  paddingVertical: 16,
  alignItems: 'center',
  justifyContent: 'center',
},
closeModalButtonText: {
  color: '#FFF',
  fontSize: 16,
  fontWeight: '600',
  fontFamily: 'BakbakOne',
  letterSpacing: 0.5,
},
});

export default BookingsScreen;