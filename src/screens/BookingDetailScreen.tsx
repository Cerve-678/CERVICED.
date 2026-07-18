// BookingDetailScreen.tsx
// Full-screen booking detail view extracted from BookingsScreen modal.
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  Linking, Platform, Modal, Pressable, ActivityIndicator, TextInput,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFont } from '../contexts/FontContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking, ConfirmedBooking, BookingStatus, createBookingDateTime } from '../contexts/BookingContext';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import {
  submitReview, getProviderIdByDisplayName, hasReviewedBooking,
  getIntakeFormByBooking, IntakeForm, getProviderContactByDisplayName,
  ProviderContactInfo, getProviderAddressSettingsByDisplayName,
  ProviderAddressSettings,
  getProviderCancellationPolicy,
  getInfoPacksByBooking, markInfoPackViewed, BookingInfoPack,
  getProviderReschedulePolicyByDisplayName,
  ProviderReschedulePolicy,
} from '../services/databaseService';

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = {
  navigation: any;
  route: { params: { bookingId: string } };
};

const METHOD_LABELS: Record<string, string> = {
  card: 'Credit/Debit Card', paypal: 'PayPal', apple: 'Apple Pay', google: 'Google Pay',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const _DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const _MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDisplayDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return `${_DAYS[d.getDay()]} ${d.getDate()} ${_MONTHS[d.getMonth()]}`;
  }
  return dateStr;
}

function calculatePaymentBreakdown(booking: ConfirmedBooking) {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((s, a) => s + (a.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge || 2.99;
  const total = subtotal + serviceCharge;
  const paymentType = booking.paymentType || 'full';
  const amountPaidAtCheckout = booking.amountPaid;
  const depositAmount = booking.depositAmount || 0;
  const remainingBalance = total - amountPaidAtCheckout;
  const totalPaidAtCheckout = paymentType === 'deposit'
    ? depositAmount + serviceCharge
    : amountPaidAtCheckout;
  return { servicePrice, addOnsTotal, subtotal, serviceCharge, total, paymentType, depositAmount, amountPaidAtCheckout, remainingBalance, totalPaidAtCheckout };
}

async function shareReceipt(booking: ConfirmedBooking) {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((s, a) => s + (a.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge || 2.99;
  const total = subtotal + serviceCharge;
  const paymentType = booking.paymentType || 'full';
  const depositAmount = booking.depositAmount || 0;
  const amountPaid = booking.amountPaid || 0;
  const remainingBalance = total - amountPaid;
  const addOnRows = (booking.addOns ?? []).map(a =>
    `<tr><td style="padding:6px 0;color:#555;padding-left:16px">+ ${a.name}</td><td style="padding:6px 0;color:#555;text-align:right">£${Number(a.price).toFixed(2)}</td></tr>`
  ).join('');
  const dateStr = new Date(booking.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const ref = (booking.id ?? '').slice(0, 8).toUpperCase();
  const m = (booking as any).paymentMethod as string | undefined;
  const paymentMethodLabel = (m && METHOD_LABELS[m]) ? METHOD_LABELS[m]! : 'Card';
  const paymentRows = paymentType === 'deposit'
    ? `<tr><td style="padding:6px 0;color:#34C759;font-weight:600">Deposit Paid</td><td style="text-align:right">£${depositAmount.toFixed(2)}</td></tr>
       <tr><td style="padding:6px 0;color:#34C759;font-weight:600">Total Paid</td><td style="text-align:right">£${(depositAmount + serviceCharge).toFixed(2)}</td></tr>
       ${remainingBalance > 0 ? `<tr><td style="color:#FF9500;font-weight:600">Balance Due at Appointment</td><td style="text-align:right">£${remainingBalance.toFixed(2)}</td></tr>` : ''}
       <tr><td style="color:#555">Payment Method</td><td style="text-align:right">${paymentMethodLabel}</td></tr>`
    : `<tr><td style="color:#34C759;font-weight:600">Total Paid</td><td style="text-align:right">£${amountPaid.toFixed(2)}</td></tr>
       <tr><td style="color:#555">Payment Method</td><td style="text-align:right">${paymentMethodLabel}</td></tr>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Helvetica,Arial,sans-serif;background:#fff;color:#111;padding:48px 40px;max-width:520px;margin:0 auto}.brand{font-size:38px;font-weight:900;letter-spacing:8px;text-align:center;margin-bottom:4px}.sub{font-size:13px;letter-spacing:3px;color:#888;text-align:center;margin-bottom:24px}.perf{border:none;border-top:2px dashed #ddd;margin:18px 0}table{width:100%;border-collapse:collapse}td{font-size:15px;vertical-align:middle;padding:6px 0}.bold td{font-weight:600}.total-block{margin-top:18px;padding-top:14px;border-top:2.5px solid #111;display:flex;justify-content:space-between}.total-value{font-size:28px;font-weight:900}.ref-block{margin-top:24px;text-align:center}.ref-value{font-size:18px;font-weight:700;letter-spacing:3px;color:#555}.date{font-size:12px;color:#aaa;margin-top:4px}</style></head><body><div class="brand">CERVICED</div><div class="sub">PAYMENT RECEIPT</div><hr class="perf"/><section><div>SERVICE</div><table><tr class="bold"><td>${booking.serviceName ?? '—'}</td><td style="text-align:right">£${servicePrice.toFixed(2)}</td></tr>${addOnRows}${addOnRows ? `<tr><td style="color:#888;font-size:13px">Subtotal</td><td style="color:#888;font-size:13px;text-align:right">£${subtotal.toFixed(2)}</td></tr>` : ''}</table></section><hr class="perf"/><section><div>BOOKING</div><table><tr><td style="color:#555">Provider</td><td style="text-align:right">${booking.providerName ?? '—'}</td></tr><tr><td style="color:#555">Date</td><td style="text-align:right">${booking.bookingDate ?? '—'}</td></tr><tr><td style="color:#555">Time</td><td style="text-align:right">${booking.bookingTime ?? '—'}</td></tr></table></section><hr class="perf"/><section><div>PAYMENT</div><table>${paymentRows}</table><div class="total-block"><span>TOTAL</span><span class="total-value">£${total.toFixed(2)}</span></div></section><hr class="perf"/><div class="ref-block"><div>REFERENCE</div><div class="ref-value">${ref}</div><div class="date">${dateStr}</div></div></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Receipt', UTI: 'com.adobe.pdf' });
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BookingDetailScreen({ navigation, route }: Props) {
  useFont();
  const { bookingId } = route.params;
  const { theme, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { addToCart, items: cartItems } = useCart();
  const {
    todayBookings, upcomingBookings, pastBookings,
    cancelBooking, canReschedule,
  } = useBooking();

  // Look up the booking from context
  const booking = useMemo(() =>
    [...(todayBookings ?? []), ...(upcomingBookings ?? []), ...(pastBookings ?? [])].find(b => b.id === bookingId)
  , [bookingId, todayBookings, upcomingBookings, pastBookings]);

  // Async data loaded on mount
  const [bookingIntakeForm, setBookingIntakeForm] = useState<IntakeForm | null>(null);
  const [bookingInfoPacks, setBookingInfoPacks] = useState<BookingInfoPack[]>([]);
  const [reschedulePolicy, setReschedulePolicy] = useState<ProviderReschedulePolicy | null>(null);
  const [addrSettings, setAddrSettings] = useState<ProviderAddressSettings | null>(null);
  const [addrCountdown, setAddrCountdown] = useState('');
  const [cancellationNoticeHrs, setCancellationNoticeHrs] = useState(0);

  // UI state
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasRated, setHasRated] = useState(false);
  const [ratedBookings, setRatedBookings] = useState<Set<string>>(new Set());
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [hasTipped, setHasTipped] = useState(false);
  const [tippedBookings, setTippedBookings] = useState<Set<string>>(new Set());
  const [showRebookAddOnsModal, setShowRebookAddOnsModal] = useState(false);
  const [rebookSelection, setRebookSelection] = useState<'with' | 'without' | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successIcon, setSuccessIcon] = useState('✓');
  const [shouldNavigateToCart, setShouldNavigateToCart] = useState(false);
  const [showCooldownModal, setShowCooldownModal] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState('');
  const [viewingPack, setViewingPack] = useState<BookingInfoPack | null>(null);
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [contactSheetInfo, setContactSheetInfo] = useState<ProviderContactInfo | null>(null);
  const [contactSheetLoading, setContactSheetLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; text: string; sender: 'user' | 'provider'; timestamp: Date }>>([]);
  const messageScrollRef = useRef<ScrollView>(null);

  // Load booking data on mount / bookingId change
  useEffect(() => {
    if (!bookingId) return;
    getIntakeFormByBooking(bookingId).then(setBookingIntakeForm).catch(() => {});
    getInfoPacksByBooking(bookingId).then(setBookingInfoPacks).catch(() => {});
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;
    getProviderReschedulePolicyByDisplayName(booking.providerName)
      .then(setReschedulePolicy).catch(() => {});
    getProviderCancellationPolicy(booking.providerName)
      .then(setCancellationNoticeHrs).catch(() => {});
    if (!booking.clientAddress) {
      getProviderAddressSettingsByDisplayName(booking.providerName)
        .then(setAddrSettings).catch(() => {});
    }
  }, [booking?.id]);

  // Address countdown timer
  useEffect(() => {
    if (!booking || booking.clientAddress) return;
    const policy = addrSettings?.address_release_policy ?? null; // ProviderAddressSettings field
    if (!policy || policy === 'always' || policy === 'manual') return;
    const offsetDays: Record<string, number> = {
      on_confirmation: 0, day_before: 1, two_days_before: 2,
      three_days_before: 3, five_days_before: 5, week_before: 7,
    };
    const days = offsetDays[policy];
    if (days === undefined) return;
    const tick = () => {
      const appt = new Date(`${booking.bookingDate}T12:00:00`);
      const releaseAt = new Date(appt);
      releaseAt.setDate(releaseAt.getDate() - days);
      const diff = releaseAt.getTime() - Date.now();
      if (diff <= 0) { setAddrCountdown(''); return; }
      const totalHours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (totalHours >= 48) setAddrCountdown(`${Math.ceil(diff / 86400000)} days`);
      else if (totalHours >= 1) setAddrCountdown(`${totalHours}h ${mins}m`);
      else setAddrCountdown(`${mins}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [booking?.id, booking?.bookingDate, addrSettings]);

  const getStatusColor = useCallback((status: string, isPending?: boolean) => {
    if (isPending) return '#AF9197';
    const map: Record<string, string> = {
      [BookingStatus.UPCOMING]: '#4CAF50', [BookingStatus.IN_PROGRESS]: '#2196F3',
      [BookingStatus.COMPLETED]: '#2196F3', [BookingStatus.CANCELLED]: '#F44336',
      [BookingStatus.NO_SHOW]: '#FF9800',
    };
    return map[status] || '#9E9E9E';
  }, []);

  const openInMaps = useCallback(async (b: ConfirmedBooking) => {
    try {
      const label = encodeURIComponent(b.address);
      const url = Platform.select({
        ios: `maps:${b.coordinates.latitude},${b.coordinates.longitude}?q=${label}`,
        android: `geo:${b.coordinates.latitude},${b.coordinates.longitude}?q=${label}`,
      });
      if (url && await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${b.coordinates.latitude},${b.coordinates.longitude}`);
    } catch { Alert.alert('Error', 'Unable to open maps'); }
  }, []);

  const openContactSheet = useCallback(async (b: ConfirmedBooking) => {
    setContactSheetInfo(null);
    setContactSheetVisible(true);
    setContactSheetLoading(true);
    try {
      const info = await getProviderContactByDisplayName(b.providerName);
      setContactSheetInfo(info);
    } catch {
      setContactSheetInfo({ preferred_contact_methods: ['in_app'], whatsapp_number: null, email: null, phone: null });
    } finally { setContactSheetLoading(false); }
  }, []);

  const handleCancelBooking = useCallback(async () => {
    if (!booking) return;
    if (booking.status !== BookingStatus.PENDING && cancellationNoticeHrs > 0 && booking.bookingDate && booking.bookingTime) {
      const apptMs = createBookingDateTime(booking.bookingDate, booking.bookingTime).getTime();
      const hoursUntil = (apptMs - Date.now()) / 3_600_000;
      if (hoursUntil >= 0 && hoursUntil < cancellationNoticeHrs) {
        Alert.alert('Cancellation Not Allowed', `This provider requires ${cancellationNoticeHrs} hours' notice to cancel.`);
        return;
      }
    }
    setIsLoading(true);
    try {
      await cancelBooking(booking.id);
      setShowCancelModal(false);
      setSuccessMessage('Your appointment has been cancelled successfully.');
      setSuccessIcon('✓');
      setShowSuccessModal(true);
    } catch { Alert.alert('Error', 'Failed to cancel booking. Please try again.'); }
    finally { setIsLoading(false); }
  }, [booking, cancelBooking, cancellationNoticeHrs]);

  const handleReschedulePress = useCallback(() => {
    if (!booking) return;
    const check = canReschedule(booking.id);
    if (!check.canReschedule) {
      setCooldownMessage(check.reason || 'Unable to reschedule at this time');
      setShowCooldownModal(true);
      return;
    }
    if (reschedulePolicy) {
      const used = booking.rescheduleRequest?.rescheduleCount ?? 0;
      if (reschedulePolicy.maxReschedules !== null && used >= reschedulePolicy.maxReschedules) {
        setCooldownMessage(`${booking.providerName} allows ${reschedulePolicy.maxReschedules} reschedule${reschedulePolicy.maxReschedules === 1 ? '' : 's'} per booking.`);
        setShowCooldownModal(true);
        return;
      }
      if (reschedulePolicy.rescheduleNoticeHours > 0 && booking.bookingDate && booking.bookingTime) {
        const start = createBookingDateTime(booking.bookingDate, booking.bookingTime);
        const hoursUntil = (start.getTime() - Date.now()) / 3_600_000;
        if (hoursUntil >= 0 && hoursUntil < reschedulePolicy.rescheduleNoticeHours) {
          setCooldownMessage(`${booking.providerName} requires ${reschedulePolicy.rescheduleNoticeHours} hours' notice to reschedule.`);
          setShowCooldownModal(true);
          return;
        }
      }
    }
    navigation.navigate('Reschedule', { bookingId: booking.id });
  }, [booking, canReschedule, reschedulePolicy, navigation]);

  const handleRebook = useCallback((b: ConfirmedBooking) => {
    const alreadyInCart = cartItems.some(item =>
      item.serviceName === b.serviceName && item.providerName === b.providerName
    );
    if (alreadyInCart) {
      setSuccessMessage(`${b.serviceName} from ${b.providerName} is already in your cart.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }
    if (b.addOns && b.addOns.length > 0) {
      setShowRebookAddOnsModal(true);
    } else {
      addToCart({
        providerName: b.providerName, providerId: b.providerId,
        providerImage: b.providerImage, providerService: b.providerService,
        service: { id: `rebook_${Date.now()}`, name: b.serviceName, price: b.price, duration: b.duration, description: b.providerService, addOns: [] },
        quantity: 1,
      });
      setSuccessMessage(`${b.serviceName} has been added to your cart.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      setShouldNavigateToCart(true);
    }
  }, [cartItems, addToCart]);

  const confirmRebook = useCallback((selection: 'with' | 'without') => {
    if (!booking) return;
    setShowRebookAddOnsModal(false);
    addToCart({
      providerName: booking.providerName, providerId: booking.providerId,
      providerImage: booking.providerImage, providerService: booking.providerService,
      service: {
        id: `rebook_${Date.now()}`,
        name: booking.serviceName, price: booking.price, duration: booking.duration,
        description: booking.providerService,
        addOns: selection === 'with' ? (booking.addOns || []) : [],
      },
      quantity: 1,
    });
    setSuccessMessage(`${booking.serviceName} has been added to your cart.`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    setShouldNavigateToCart(true);
  }, [booking, addToCart]);

  const handleRatingSubmit = useCallback(async () => {
    if (!booking || rating === 0) { Alert.alert('Rating Required', 'Please select a rating.'); return; }
    if (!user?.id) { Alert.alert('Error', 'You must be logged in.'); return; }
    setIsLoading(true);
    try {
      const providerId = booking.providerId ?? await getProviderIdByDisplayName(booking.providerName);
      if (providerId) {
        const alreadyReviewed = await hasReviewedBooking(booking.id);
        if (!alreadyReviewed) {
          await submitReview({ booking_id: booking.id, provider_id: providerId, service_id: null, user_id: user.id, rating, ...(reviewText.trim() ? { comment: reviewText.trim() } : {}) });
        }
      }
      setRatedBookings(prev => new Set(prev).add(booking.id));
      setHasRated(true);
      setTimeout(() => { setShowRatingModal(false); setRating(0); setReviewText(''); }, 2000);
    } catch { Alert.alert('Error', 'Failed to submit rating.'); }
    finally { setIsLoading(false); }
  }, [booking, rating, reviewText, user]);

  const handleTipSubmit = useCallback(() => {
    if (!booking || tipAmount <= 0) { Alert.alert('Invalid Tip', 'Please enter a valid tip amount.'); return; }
    setTippedBookings(prev => new Set(prev).add(booking.id));
    setHasTipped(true);
    setShowTipModal(false);
    setSuccessMessage(`Thank you for tipping £${tipAmount.toFixed(2)}!`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    setTimeout(() => setTipAmount(0), 2000);
  }, [booking, tipAmount]);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;
    const msg = { id: `msg_${Date.now()}`, text: messageText.trim(), sender: 'user' as const, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    setMessageText('');
    setTimeout(() => messageScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messageText]);

  const C = isDarkMode ? {
    bg: '#1A1815', card: '#252220', text: '#F0ECE7', sub: '#7E6667',
    border: 'rgba(126,102,103,0.18)', accent: '#AF9197',
  } : {
    bg: '#F5F1EC', card: '#FFFFFF', text: '#000000', sub: '#7E6667',
    border: 'rgba(126,102,103,0.14)', accent: '#AF9197',
  };

  if (!booking) {
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.sub, fontSize: 16 }}>Booking not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.accent, fontSize: 16 }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  const payment = calculatePaymentBreakdown(booking);
  const hasBeenRated = ratedBookings.has(booking.id);
  const hasBeenTipped = tippedBookings.has(booking.id);
  const isUpcoming = booking.status === BookingStatus.UPCOMING && !booking.isPendingReschedule;
  const isCompleted = booking.status === BookingStatus.COMPLETED;
  const isPending = booking.status === BookingStatus.PENDING;

  return (
    <ThemedBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
        {/* Back button row */}
        <View style={[st.topBar, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} activeOpacity={0.7}>
            <Text style={[st.backArrow, { color: C.accent }]}>‹</Text>
            <Text style={[st.backLabel, { color: C.sub }]}>Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={st.header}>
            {booking.providerImage ? (
              <Image source={typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage} style={st.providerImg} resizeMode="cover" />
            ) : (
              <View style={[st.providerImg, { backgroundColor: '#AF9197', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>
                  {booking.providerName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'P'}
                </Text>
              </View>
            )}
            <Text style={[st.providerName, { color: C.text }]}>{booking.providerName}</Text>
            <View style={[st.typeBadge, { backgroundColor: C.accent + '22' }]}>
              <Text style={[st.typeText, { color: C.accent }]}>{booking.providerService.toUpperCase()}</Text>
            </View>
          </View>

          {/* Appointment Details */}
          <View style={st.section}>
            <Text style={[st.sectionTitle, { color: C.sub }]}>APPOINTMENT DETAILS</Text>
            <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
              {[
                ['Service', booking.serviceName],
                ['Date', formatDisplayDate(booking.bookingDate)],
                ['Time', booking.bookingTime],
                ['Duration', booking.duration],
              ].map(([label, value]) => (
                <View key={label} style={[st.row, { borderBottomColor: C.border }]}>
                  <Text style={[st.rowLabel, { color: C.sub }]}>{label}</Text>
                  <Text style={[st.rowValue, { color: C.text }]} numberOfLines={2}>{value}</Text>
                </View>
              ))}
              <View style={[st.row, { borderBottomColor: C.border }]}>
                <Text style={[st.rowLabel, { color: C.sub }]}>Status</Text>
                <View style={[st.statusBadge, { backgroundColor: getStatusColor(booking.status, booking.isPendingReschedule) }]}>
                  <Text style={st.statusText}>
                    {booking.isPendingReschedule
                      ? ((booking as any).rescheduleRequest?.providerAvailableDates ? 'RESCHEDULE AVAILABLE' : 'RESCHEDULE PENDING')
                      : booking.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={[st.row, { borderBottomWidth: 0 }]}>
                <Text style={[st.rowLabel, { color: C.sub }]}>Price</Text>
                <Text style={[st.rowValue, { color: C.text, fontWeight: '700' }]}>£{booking.price.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Pending confirmation callout */}
          {isPending && (
            <View style={st.section}>
              <View style={{ backgroundColor: 'rgba(255,149,0,0.10)', borderColor: 'rgba(255,149,0,0.30)', borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="time-outline" size={18} color="#FF9500" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FF9500' }}>Awaiting Confirmation</Text>
                  <Text style={{ fontSize: 12, color: '#FF950099', marginTop: 2 }}>
                    Your provider hasn't confirmed this booking yet. You'll be notified once it's confirmed.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* To-do: intake form + info packs */}
          {((bookingIntakeForm && bookingIntakeForm.status === 'pending') || bookingInfoPacks.length > 0) && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>TO DO</Text>
              {bookingIntakeForm && bookingIntakeForm.status === 'pending' && (
                <TouchableOpacity style={[st.todoCard, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.8}
                  onPress={() => navigation.navigate('ClientIntakeForm', { formId: bookingIntakeForm.id, bookingId: bookingIntakeForm.bookingId, serviceName: booking.serviceName })}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text }]}>{bookingIntakeForm.title}</Text>
                    <Text style={[{ fontSize: 12, color: C.sub, marginTop: 2 }]}>Your provider needs this before your appointment</Text>
                  </View>
                  <View style={[st.todoBadge, { backgroundColor: C.accent }]}><Text style={st.todoBadgeText}>Required</Text></View>
                </TouchableOpacity>
              )}
              {bookingInfoPacks.map(pack => (
                <TouchableOpacity key={pack.id} style={[st.todoCard, { backgroundColor: C.card, borderColor: C.border, opacity: pack.viewedAt ? 0.72 : 1 }]} activeOpacity={0.8}
                  onPress={() => {
                    setViewingPack(pack);
                    if (!pack.viewedAt) {
                      markInfoPackViewed(pack.id).catch(() => {});
                      setBookingInfoPacks(prev => prev.map(p => p.id === pack.id ? { ...p, viewedAt: new Date().toISOString() } : p));
                    }
                  }}>
                  <Text style={{ fontSize: 20 }}>📄</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text }]}>{pack.title}</Text>
                    <Text style={[{ fontSize: 12, color: C.sub, marginTop: 2 }]}>Prep & aftercare info from your provider</Text>
                  </View>
                  {!pack.viewedAt && <View style={[st.todoBadge, { backgroundColor: '#34C759' }]}><Text style={st.todoBadgeText}>New</Text></View>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Add-ons */}
          {(booking.addOns?.length ?? 0) > 0 && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>ADD-ONS ({booking.addOns!.length})</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                {booking.addOns!.map((a, i) => (
                  <View key={i} style={[st.row, { borderBottomColor: C.border, borderBottomWidth: i < booking.addOns!.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
                    <Text style={[st.rowLabel, { color: C.sub }]}>{a.name}</Text>
                    <Text style={[st.rowValue, { color: C.text }]}>+£{a.price.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Payment */}
          <View style={st.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>PAYMENT STATUS</Text>
              <TouchableOpacity onPress={() => setShowReceipt(v => !v)} activeOpacity={0.7}>
                <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{showReceipt ? 'Hide' : 'View Receipt'}</Text>
              </TouchableOpacity>
            </View>
            {!showReceipt ? (
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={st.row}><Text style={[st.rowLabel, { color: C.sub }]}>Total</Text><Text style={[st.rowValue, { color: C.text }]}>£{payment.total.toFixed(2)}</Text></View>
                <View style={st.row}><Text style={[st.rowLabel, { color: C.sub }]}>Total Paid</Text><Text style={[st.rowValue, { color: '#34C759' }]}>£{(payment.paymentType === 'deposit' ? payment.totalPaidAtCheckout : payment.amountPaidAtCheckout).toFixed(2)}</Text></View>
                <View style={[st.row, { borderBottomWidth: 0 }]}><Text style={[st.rowLabel, { color: C.sub }]}>Due at Appointment</Text><Text style={[st.rowValue, { color: payment.remainingBalance > 0 ? '#FF9500' : C.sub }]}>£{payment.remainingBalance.toFixed(2)}</Text></View>
              </View>
            ) : (
              <View style={[st.receipt, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: C.text }]}>PAYMENT RECEIPT</Text>
                  <TouchableOpacity onPress={async () => { try { await shareReceipt(booking); } catch { Alert.alert('Error', 'Could not generate receipt.'); } }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="share-outline" size={18} color={C.text} />
                  </TouchableOpacity>
                </View>
                {[['Service', booking.serviceName], ['Date', booking.bookingDate], ['Time', booking.bookingTime]].map(([l, v]) => (
                  <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>{l}</Text>
                    <Text style={{ color: C.text, fontSize: 13 }}>{v}</Text>
                  </View>
                ))}
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>TOTAL</Text>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>£{payment.total.toFixed(2)}</Text>
                </View>
                <Text style={{ color: C.sub, fontSize: 11, marginTop: 8 }}>REF: {booking.id?.slice(0, 8).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Notes / Instructions */}
          {booking.notes && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>YOUR NOTES</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{booking.notes}</Text>
              </View>
            </View>
          )}
          {booking.bookingInstructions && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>INSTRUCTIONS</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{booking.bookingInstructions}</Text>
              </View>
            </View>
          )}

          {/* Contact & Location */}
          {booking.status !== BookingStatus.COMPLETED && booking.status !== BookingStatus.CANCELLED && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>CONTACT & LOCATION</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[st.row, { borderBottomColor: C.border }]}>
                  <Text style={[st.rowLabel, { color: C.sub }]}>Contact Provider</Text>
                  <TouchableOpacity onPress={() => openContactSheet(booking)} style={[st.actionChip, { backgroundColor: C.accent }]} activeOpacity={0.7}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Contact</Text>
                  </TouchableOpacity>
                </View>
                <View style={[st.row, { borderBottomWidth: 0 }]}>
                  <Text style={[st.rowLabel, { color: C.sub }]}>{booking.clientAddress ? 'Your Address' : 'Location'}</Text>
                  {booking.clientAddress ? (
                    <Text style={[st.rowValue, { color: C.text }]}>{booking.clientAddress}</Text>
                  ) : booking.address ? (
                    <TouchableOpacity onPress={() => openInMaps(booking)} activeOpacity={0.7}>
                      <Text style={[st.rowValue, { color: C.accent }]}>{booking.address}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[st.rowValue, { color: C.sub, fontStyle: 'italic' }]}>
                      {addrCountdown ? `Available in ${addrCountdown}` : 'Address to be confirmed'}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Reschedule status banner */}
          {booking.isPendingReschedule && (
            <View style={st.section}>
              <View style={[st.rescheduleBanner, { backgroundColor: C.card, borderColor: C.accent }]}>
                <Text style={[{ fontSize: 14, fontWeight: '700', color: C.accent, marginBottom: 4 }]}>
                  {(booking as any).rescheduleRequest?.providerAvailableDates ? 'Available Times Received!' : 'Reschedule Requested'}
                </Text>
                <Text style={{ fontSize: 13, color: C.sub }}>
                  {(booking as any).rescheduleRequest?.providerAvailableDates
                    ? `${booking.providerName} has responded with available times. Tap Reschedule Now to confirm.`
                    : `Waiting for ${booking.providerName} to respond with available dates.`}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={st.actions}>
            {isPending && (
              <TouchableOpacity style={[st.cancelBtn, { borderColor: C.border }]} onPress={() => setShowCancelModal(true)} activeOpacity={0.7}>
                <Text style={[st.cancelBtnText, { color: '#F44336' }]}>Decline Request</Text>
              </TouchableOpacity>
            )}
            {isUpcoming && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={[st.cancelBtn, { borderColor: C.border, flex: 1 }]} onPress={() => setShowCancelModal(true)} activeOpacity={0.7}>
                  <Text style={[st.cancelBtnText, { color: '#F44336' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: C.accent }]} onPress={handleReschedulePress} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>Reschedule</Text>
                </TouchableOpacity>
              </View>
            )}
            {booking.isPendingReschedule && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={[st.cancelBtn, { borderColor: C.border, flex: 1 }]} onPress={() => setShowCancelModal(true)} activeOpacity={0.7}>
                  <Text style={[st.cancelBtnText, { color: '#F44336' }]}>Cancel Booking</Text>
                </TouchableOpacity>
                {(booking as any).rescheduleRequest?.providerAvailableDates && (
                  <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: C.accent }]} onPress={() => navigation.navigate('Reschedule', { bookingId: booking.id })} activeOpacity={0.7}>
                    <Text style={st.primaryBtnText}>Reschedule Now</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {isCompleted && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: hasBeenRated ? C.border : C.accent }]} disabled={hasBeenRated} onPress={() => setShowRatingModal(true)} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>{hasBeenRated ? 'Rated ✓' : 'Rate'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: hasBeenTipped ? C.border : '#34C759' }]} disabled={hasBeenTipped} onPress={() => setShowTipModal(true)} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>{hasBeenTipped ? 'Tipped ✓' : 'Tip'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: C.accent }]} onPress={() => handleRebook(booking)} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>Book Again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* ─── Cancel Modal ─── */}
        <Modal visible={showCancelModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowCancelModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={st.overlay}>
              <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
                <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Cancel Booking</Text>
                <Text style={[st.sheetSub, { color: C.sub }]}>Are you sure you want to cancel "{booking.serviceName}"? This cannot be undone.</Text>
                <View style={st.sheetBtns}>
                  <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setShowCancelModal(false)} disabled={isLoading} activeOpacity={0.7}>
                    <Text style={{ color: C.text, fontWeight: '600' }}>Keep Booking</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.sheetBtn, { backgroundColor: '#F44336' }]} onPress={handleCancelBooking} disabled={isLoading} activeOpacity={0.7}>
                    {isLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '600' }}>Yes, Cancel</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ─── Success Modal ─── */}
        <Modal visible={showSuccessModal} animationType="fade" transparent statusBarTranslucent
          onRequestClose={() => { setShowSuccessModal(false); if (shouldNavigateToCart) { setShouldNavigateToCart(false); navigation.getParent()?.navigate('Cart'); } }}>
          <View style={st.overlay}>
            <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
              <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>{successIcon}</Text>
              <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>{successIcon === '✓' ? 'Success!' : 'Notice'}</Text>
              <Text style={[st.sheetSub, { color: C.sub }]}>{successMessage}</Text>
              <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.accent, alignSelf: 'stretch', marginTop: 16 }]}
                onPress={() => { setShowSuccessModal(false); if (shouldNavigateToCart) { setShouldNavigateToCart(false); navigation.getParent()?.navigate('Cart'); } }} activeOpacity={0.7}>
                <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center' }}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ─── Cooldown Modal ─── */}
        <Modal visible={showCooldownModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowCooldownModal(false)}>
          <View style={st.overlay}>
            <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
              <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>⚠️</Text>
              <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Cannot Reschedule</Text>
              <Text style={[st.sheetSub, { color: C.sub }]}>{cooldownMessage}</Text>
              <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.accent, alignSelf: 'stretch', marginTop: 16 }]} onPress={() => setShowCooldownModal(false)} activeOpacity={0.7}>
                <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center' }}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ─── Rating Modal ─── */}
        <Modal visible={showRatingModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => { setShowRatingModal(false); setRating(0); setReviewText(''); }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.overlay}>
              <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
                {!hasRated ? (
                  <>
                    <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Rate Your Experience</Text>
                    <Text style={[st.sheetSub, { color: C.sub }]}>How was your appointment with {booking.providerName}?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 16 }}>
                      {[1,2,3,4,5].map(s => (
                        <TouchableOpacity key={s} onPress={() => setRating(s)}>
                          <Text style={{ fontSize: 32, color: s <= rating ? '#FFD700' : (isDarkMode ? '#555' : '#CCC') }}>★</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[st.reviewInput, { backgroundColor: isDarkMode ? '#2C2C2E' : '#F8F8F8', color: C.text, borderColor: C.border }]}
                      multiline numberOfLines={3} placeholder="Share your experience (optional)"
                      placeholderTextColor={C.sub} value={reviewText} onChangeText={setReviewText} maxLength={500}
                    />
                    <View style={st.sheetBtns}>
                      <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => { setShowRatingModal(false); setRating(0); setReviewText(''); }} activeOpacity={0.7}>
                        <Text style={{ color: C.text }}>Skip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.sheetBtn, { backgroundColor: rating === 0 ? C.border : C.accent }]} disabled={rating === 0 || isLoading} onPress={handleRatingSubmit} activeOpacity={0.7}>
                        {isLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '600' }}>Submit</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>✓</Text>
                    <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Thanks!</Text>
                    <Text style={[st.sheetSub, { color: C.sub }]}>Your feedback helps improve our services.</Text>
                  </>
                )}
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ─── Tip Modal ─── */}
        <Modal visible={showTipModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => { setShowTipModal(false); setTipAmount(0); }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.overlay}>
              <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
                <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Leave a Tip</Text>
                <Text style={[st.sheetSub, { color: C.sub }]}>Show your appreciation for {booking.providerName}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
                  {[5, 10, 15, 20].map(amt => (
                    <TouchableOpacity key={amt} style={[st.tipChip, { backgroundColor: tipAmount === amt ? C.accent : C.card, borderColor: tipAmount === amt ? C.accent : C.border }]} onPress={() => setTipAmount(amt)} activeOpacity={0.7}>
                      <Text style={{ color: tipAmount === amt ? '#FFF' : C.text, fontWeight: '600' }}>£{amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#2C2C2E' : '#F8F8F8', borderRadius: 10, paddingHorizontal: 12, marginBottom: 16 }}>
                  <Text style={{ color: C.text, fontSize: 16 }}>£</Text>
                  <TextInput style={{ flex: 1, color: C.text, fontSize: 16, paddingVertical: 10 }} keyboardType="decimal-pad" placeholder="Custom amount" placeholderTextColor={C.sub}
                    value={tipAmount > 0 ? tipAmount.toString() : ''} onChangeText={t => setTipAmount(isNaN(parseFloat(t)) ? 0 : parseFloat(t))} />
                </View>
                <View style={st.sheetBtns}>
                  <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => { setShowTipModal(false); setTipAmount(0); }} activeOpacity={0.7}>
                    <Text style={{ color: C.text }}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.sheetBtn, { backgroundColor: tipAmount <= 0 ? C.border : C.accent }]} disabled={tipAmount <= 0} onPress={handleTipSubmit} activeOpacity={0.7}>
                    <Text style={{ color: '#FFF', fontWeight: '600' }}>Send Tip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </Modal>

        {/* ─── Rebook Add-ons Modal ─── */}
        <Modal visible={showRebookAddOnsModal} animationType="fade" transparent statusBarTranslucent onRequestClose={() => { setShowRebookAddOnsModal(false); setRebookSelection(null); }}>
          <View style={st.overlay}>
            <View style={[st.sheetContent, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]}>
              <Text style={[st.sheetTitle, { color: isDarkMode ? '#F0ECE7' : '#111' }]}>Include Add-Ons?</Text>
              <Text style={[st.sheetSub, { color: C.sub }]}>Would you like to include the same add-ons from your previous booking?</Text>
              {booking.addOns?.map((a, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: C.text }}>• {a.name}</Text>
                  <Text style={{ color: C.sub }}>+£{a.price.toFixed(2)}</Text>
                </View>
              ))}
              <View style={[st.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => confirmRebook('without')} activeOpacity={0.7}>
                  <Text style={{ color: C.text }}>Without Add-Ons</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.accent }]} onPress={() => confirmRebook('with')} activeOpacity={0.7}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>With Add-Ons</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── Contact Sheet ─── */}
        <Modal visible={contactSheetVisible} animationType="slide" transparent onRequestClose={() => setContactSheetVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setContactSheetVisible(false)}>
            <Pressable style={[st.contactSheet, { backgroundColor: isDarkMode ? '#201D1A' : '#FFF' }]} onPress={e => e.stopPropagation()}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)', alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[st.sheetTitle, { color: C.text }]}>Contact {booking.providerName}</Text>
              {contactSheetLoading ? <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} /> : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[st.contactOption, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.7}
                    onPress={() => {
                      setContactSheetVisible(false);
                      if (booking.providerId) {
                        navigation.navigate('ProviderChat', { providerId: booking.providerId, providerDbId: booking.providerId, providerName: booking.providerName });
                      } else {
                        setShowMessageModal(true);
                      }
                    }}>
                    <View style={[st.contactIcon, { backgroundColor: '#5B1E32' }]}><Text>💬</Text></View>
                    <View style={{ flex: 1 }}><Text style={[{ fontWeight: '600', color: C.text }]}>In-app message</Text><Text style={{ color: C.sub, fontSize: 12 }}>Chat directly inside Cerviced</Text></View>
                    <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                  {contactSheetInfo?.preferred_contact_methods?.includes('email') && contactSheetInfo.email && (
                    <TouchableOpacity style={[st.contactOption, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.7} onPress={() => { setContactSheetVisible(false); Linking.openURL(`mailto:${contactSheetInfo!.email}`); }}>
                      <View style={[st.contactIcon, { backgroundColor: '#1C3A5B' }]}><Text>✉️</Text></View>
                      <View style={{ flex: 1 }}><Text style={[{ fontWeight: '600', color: C.text }]}>Email</Text><Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{contactSheetInfo.email}</Text></View>
                      <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
                    </TouchableOpacity>
                  )}
                  {contactSheetInfo?.preferred_contact_methods?.includes('whatsapp') && contactSheetInfo.whatsapp_number && (
                    <TouchableOpacity style={[st.contactOption, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.7} onPress={() => { setContactSheetVisible(false); Linking.openURL(`https://wa.me/${contactSheetInfo!.whatsapp_number!.replace(/\D/g, '')}`); }}>
                      <View style={[st.contactIcon, { backgroundColor: '#1A3D2B' }]}><Text>💚</Text></View>
                      <View style={{ flex: 1 }}><Text style={[{ fontWeight: '600', color: C.text }]}>WhatsApp</Text><Text style={{ color: C.sub, fontSize: 12 }}>{contactSheetInfo.whatsapp_number}</Text></View>
                      <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
                    </TouchableOpacity>
                  )}
                  {contactSheetInfo?.preferred_contact_methods?.includes('phone') && contactSheetInfo.phone && (
                    <TouchableOpacity style={[st.contactOption, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.7} onPress={() => { setContactSheetVisible(false); Linking.openURL(`tel:${contactSheetInfo!.phone}`); }}>
                      <View style={[st.contactIcon, { backgroundColor: '#2B2B1A' }]}><Text>📞</Text></View>
                      <View style={{ flex: 1 }}><Text style={[{ fontWeight: '600', color: C.text }]}>Phone call</Text><Text style={{ color: C.sub, fontSize: 12 }}>{contactSheetInfo.phone}</Text></View>
                      <Text style={{ color: C.sub, fontSize: 20 }}>›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={{ height: 30 }} />
            </Pressable>
          </Pressable>
        </Modal>

        {/* ─── In-app Message Modal (legacy fallback) ─── */}
        <Modal visible={showMessageModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => { setShowMessageModal(false); setMessageText(''); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: isDarkMode ? '#000' : '#FFF', paddingTop: Platform.OS === 'ios' ? 54 : 30 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
                <TouchableOpacity onPress={() => { setShowMessageModal(false); setMessageText(''); }} style={{ marginRight: 12 }}>
                  <Text style={{ fontSize: 28, color: C.accent }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{booking.providerName}</Text>
              </View>
              <ScrollView ref={messageScrollRef} style={{ flex: 1, padding: 16 }} contentContainerStyle={{ flexGrow: 1 }}>
                {messages.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: C.sub }}>Start a conversation</Text>
                  </View>
                ) : messages.map(msg => (
                  <View key={msg.id} style={{ alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                    <View style={{ backgroundColor: msg.sender === 'user' ? C.accent : C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '80%' }}>
                      <Text style={{ color: msg.sender === 'user' ? '#FFF' : C.text }}>{msg.text}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, gap: 8 }}>
                <TextInput style={[st.msgInput, { backgroundColor: isDarkMode ? '#2C2C2E' : '#F0F0F0', color: C.text, flex: 1 }]} multiline placeholder="Message..." placeholderTextColor={C.sub} value={messageText} onChangeText={setMessageText} maxLength={500} />
                <TouchableOpacity style={[st.sendBtn, { backgroundColor: messageText.trim() ? C.accent : C.border }]} onPress={handleSendMessage} disabled={!messageText.trim()}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>↑</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ─── Info Pack Viewer ─── */}
        <Modal visible={!!viewingPack} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setViewingPack(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewingPack(null)} />
            <View style={{ maxHeight: '78%', backgroundColor: isDarkMode ? '#201D1A' : '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 130 }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)' }} />
              {viewingPack && (
                <>
                  <Text style={{ fontSize: 19, fontWeight: '800', color: isDarkMode ? '#F0ECE7' : '#1C1A18', marginBottom: 4 }}>{viewingPack.title}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, marginBottom: 14 }}>{viewingPack.service?.toUpperCase()} • FROM {booking.providerName?.toUpperCase()}</Text>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={{ fontSize: 15, lineHeight: 23, color: isDarkMode ? '#D8D2CB' : '#3A3733' }}>{viewingPack.content}</Text>
                  </ScrollView>
                  <TouchableOpacity style={{ marginTop: 18, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: C.accent }} onPress={() => setViewingPack(null)} activeOpacity={0.85}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backArrow: { fontSize: 28, fontWeight: '300', marginRight: 4 },
  backLabel: { fontSize: 16 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: 20 },
  providerImg: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  providerName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 6 },
  typeBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  typeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 13, flex: 0.4 },
  rowValue: { fontSize: 13, fontWeight: '500', flex: 0.6, textAlign: 'right' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  todoCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 8 },
  todoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  todoBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  receipt: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  actions: { marginTop: 8, marginBottom: 8, gap: 12 },
  cancelBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  rescheduleBanner: { borderRadius: 14, borderWidth: 1, padding: 16 },
  actionChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheetContent: { borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sheetSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  sheetBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  reviewInput: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, minHeight: 80, fontSize: 14, marginBottom: 16 },
  tipChip: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  contactSheet: { maxHeight: '75%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40 },
  contactOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  msgInput: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
