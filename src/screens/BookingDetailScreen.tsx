// BookingDetailScreen.tsx
// Full-screen booking detail view extracted from BookingsScreen modal.
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  Linking, Platform, Modal, Pressable, ActivityIndicator, TextInput,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView,
  LayoutAnimation, UIManager,
} from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
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
import { hasMapDestination, isAddressPending } from '../types/booking';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import {
  submitReview, getProviderIdByDisplayName, hasReviewedBooking,
  getIntakeFormByBooking, IntakeForm, getProviderContactByDisplayName,
  getProviderContactById,
  ProviderContactInfo, getProviderAddressPolicyByDisplayName,
  getProviderAddressPolicy,
  getProviderCancellationPolicyById,
  getProviderReschedulePolicyById,
  ProviderAddressPolicy,
  getProviderCancellationPolicy,
  getInfoPacksByBooking, markInfoPackViewed, BookingInfoPack,
  getProviderReschedulePolicyByDisplayName,
  ProviderReschedulePolicy,
  getRebookableService,
  setBookingTip,
  getBookingTip,
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

// Short info packs (a quick heads-up) read better as a small popup than a
// full-screen takeover; longer ones (policies, prep instructions) still need
// the dedicated reading screen.
const INFO_PACK_POPUP_MAX_CHARS = 240;
function isLongInfoPack(pack: BookingInfoPack): boolean {
  return (pack.title?.length ?? 0) + (pack.content?.length ?? 0) > INFO_PACK_POPUP_MAX_CHARS;
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
  const [todoLoaded, setTodoLoaded] = useState(false);
  const [reschedulePolicy, setReschedulePolicy] = useState<ProviderReschedulePolicy | null>(null);
  const [addrSettings, setAddrSettings] = useState<ProviderAddressPolicy | null>(null);
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
  const [rebookBusy, setRebookBusy] = useState(false);
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

  // Load booking data on mount / bookingId change
  useEffect(() => {
    if (!bookingId) return;
    setTodoLoaded(false);
    // Load both to-do sources together and reveal the section only once BOTH
    // have settled — loading them independently makes the section pop in (and
    // shove the layout down) twice as each request resolves separately.
    Promise.allSettled([
      getIntakeFormByBooking(bookingId).then(setBookingIntakeForm),
      getInfoPacksByBooking(bookingId).then(setBookingInfoPacks),
    ]).finally(() => {
      // The section still has to wait on this network round-trip, but at
      // least it eases into place instead of snapping in and shoving the
      // rest of the screen down a beat after everything else has settled.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTodoLoaded(true);
    });
  }, [bookingId]);

  // Re-fetch on refocus — without this, returning from ClientIntakeFormScreen
  // after submitting kept showing the form as pending: this screen's state was
  // only ever set on mount, never after the DB row flipped to 'completed'.
  useEffect(() => {
    if (!bookingId) return;
    const unsubscribe = navigation.addListener('focus', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      getIntakeFormByBooking(bookingId).then(setBookingIntakeForm).catch(() => {});
      getInfoPacksByBooking(bookingId).then(setBookingInfoPacks).catch(() => {});
    });
    return unsubscribe;
  }, [navigation, bookingId]);

  // Hydrate rated/tipped state from the DB. These were local-only, so after any
  // remount an already-rated booking showed an active "Rate" button again (the
  // duplicate insert was blocked, but the UI misreported the state).
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    hasReviewedBooking(bookingId)
      .then(reviewed => {
        if (cancelled || !reviewed) return;
        setHasRated(true);
        setRatedBookings(prev => new Set(prev).add(bookingId));
      })
      .catch(() => {});
    getBookingTip(bookingId)
      .then(tip => {
        if (cancelled || tip == null || tip <= 0) return;
        setHasTipped(true);
        setTippedBookings(prev => new Set(prev).add(bookingId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;
    // Look these up by provider ID, falling back to the name only for legacy
    // cached bookings that predate providerId. booking.providerName is a
    // SNAPSHOT taken when the booking was made, so a provider who later renames
    // stops matching their own past bookings — which silently dropped their
    // reschedule limits, cancellation notice period and address countdown for
    // every booking already on the books. The id never changes.
    const pid = booking.providerId;

    (pid
      ? getProviderReschedulePolicyById(pid)
      : getProviderReschedulePolicyByDisplayName(booking.providerName)
    ).then(setReschedulePolicy).catch(() => {});

    (pid
      ? getProviderCancellationPolicyById(pid)
      : getProviderCancellationPolicy(booking.providerName)
    ).then(setCancellationNoticeHrs).catch(() => {});

    if (!booking.clientAddress) {
      // Policy only. This screen needs the release policy to render the
      // countdown; a client must never be sent an address the policy hasn't
      // unlocked. The address itself arrives gated via the client_bookings view.
      (pid
        ? getProviderAddressPolicy(pid)
        : getProviderAddressPolicyByDisplayName(booking.providerName)
      ).then(setAddrSettings).catch(() => {});
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
    // coordinates is typed non-null but is null whenever the release view masks
    // it or the provider never geocoded, so reading .latitude straight off it
    // threw a TypeError that the catch below reported as "Unable to open maps".
    if (!hasMapDestination(b)) {
      Alert.alert('Location Unavailable', 'This appointment does not have a mappable address yet.');
      return;
    }
    const { latitude, longitude } = b.coordinates;
    try {
      const label = encodeURIComponent(b.address);
      const url = Platform.select({
        ios: `maps:${latitude},${longitude}?q=${label}`,
        android: `geo:${latitude},${longitude}?q=${label}`,
      });
      if (url && await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
    } catch { Alert.alert('Error', 'Unable to open maps'); }
  }, []);

  const openContactSheet = useCallback(async (b: ConfirmedBooking) => {
    setContactSheetInfo(null);
    setContactSheetVisible(true);
    setContactSheetLoading(true);
    try {
      // By id where possible — a renamed provider no longer matches the name
      // snapshot stored on their past bookings, which silently collapsed this
      // sheet to in-app-only (losing email / WhatsApp / phone).
      const info = b.providerId
        ? await getProviderContactById(b.providerId)
        : await getProviderContactByDisplayName(b.providerName);
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

  /**
   * Add a past booking's service back to the cart, revalidated against live data.
   *
   * This previously copied the booking's snapshot in with a synthetic id
   * (`rebook_<timestamp>`) and the ORIGINAL price — so a client could re-book a
   * service the provider had deleted, or at a stale price, with no real
   * service_id attached to the cart item. Now the service is re-resolved and the
   * rebook is refused if the provider is no longer live or the service is gone.
   */
  const addRebookToCart = useCallback(async (b: ConfirmedBooking, includeAddOns: boolean) => {
    setRebookBusy(true);
    try {
      const providerDbId =
        b.providerId ?? (await getProviderIdByDisplayName(b.providerName).catch(() => null)) ?? undefined;

      const live = providerDbId
        ? await getRebookableService(providerDbId, b.serviceName).catch(() => null)
        : null;

      if (!live) {
        setSuccessMessage(
          `${b.providerName} no longer offers ${b.serviceName}. Check their profile for their current services.`,
        );
        setSuccessIcon('⚠️');
        setShowSuccessModal(true);
        return;
      }

      const h = Math.floor(live.durationMinutes / 60);
      const m = live.durationMinutes % 60;
      const duration = `${h > 0 ? `${h}h ` : ''}${m > 0 ? `${m}m` : ''}`.trim() || b.duration;
      const priceChanged = Math.abs(live.price - b.price) > 0.005;

      // Re-resolve the booking's add-ons against the live list by name, so a
      // rebook carries today's add-on prices and real add-on ids. Any add-on the
      // provider has since removed or deactivated is dropped rather than
      // re-booked from a stale snapshot.
      const previousAddOnNames = new Set((b.addOns ?? []).map(a => a.name));
      const liveAddOns = includeAddOns
        ? live.addOns.filter(a => previousAddOnNames.has(a.name))
        : [];
      const droppedAddOns = includeAddOns
        ? (b.addOns ?? []).filter(a => !live.addOns.some(l => l.name === a.name))
        : [];

      addToCart({
        providerName: b.providerName,
        providerDisplayName: live.providerDisplayName,
        // Without providerSlug the cart's provider logo can't open the profile
        // and shows a "couldn't open that provider's profile" alert instead.
        providerSlug: live.providerSlug,
        providerId: providerDbId,
        // b.providerImage can be a plain string or an {uri} object depending
        // on where the snapshot came from — Image requires {uri}, so a raw
        // string here silently renders nothing in the cart.
        providerImage: typeof b.providerImage === 'string' ? { uri: b.providerImage } : b.providerImage,
        providerService: b.providerService,
        service: {
          id: live.id,
          name: live.name,
          price: live.price,
          duration,
          description: b.providerService,
          addOns: liveAddOns,
        },
        quantity: 1,
      });

      const notes: string[] = [];
      if (priceChanged) notes.push(`The price is now £${live.price.toFixed(2)} (was £${b.price.toFixed(2)}).`);
      if (droppedAddOns.length > 0) {
        notes.push(
          `${droppedAddOns.map(a => a.name).join(', ')} ${droppedAddOns.length === 1 ? 'is' : 'are'} no longer offered and ${droppedAddOns.length === 1 ? 'was' : 'were'} not added.`,
        );
      }
      setSuccessMessage(
        notes.length > 0
          ? `${live.name} added to your cart. ${notes.join(' ')}`
          : `${live.name} has been added to your cart.`,
      );
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      setShouldNavigateToCart(true);
    } finally {
      setRebookBusy(false);
    }
  }, [addToCart]);

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
      addRebookToCart(b, false);
    }
  }, [cartItems, addRebookToCart]);

  const confirmRebook = useCallback((selection: 'with' | 'without') => {
    if (!booking) return;
    setShowRebookAddOnsModal(false);
    addRebookToCart(booking, selection === 'with');
  }, [booking, addRebookToCart]);

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

  /**
   * Record a tip. This previously only set local component state, so the tip was
   * discarded on unmount and the provider never saw it — while the UI said
   * "Thank you for tipping".
   *
   * Tips are stored on the booking's review row (reviews.tip_amount), which
   * requires a review to exist, so an unrated booking is asked to rate first.
   * Nothing is marked as tipped unless the write actually succeeded.
   */
  const handleTipSubmit = useCallback(async () => {
    if (!booking || tipAmount <= 0) { Alert.alert('Invalid Tip', 'Please enter a valid tip amount.'); return; }
    setIsLoading(true);
    try {
      const attached = await setBookingTip(booking.id, tipAmount);
      if (!attached) {
        Alert.alert(
          'Rate First',
          'Tips are added to your review, so please rate this appointment before leaving a tip.',
        );
        return;
      }
      setTippedBookings(prev => new Set(prev).add(booking.id));
      setHasTipped(true);
      setShowTipModal(false);
      // Deliberately does NOT say the tip was paid — no payment provider is
      // wired up for tips, so this records the amount for the provider only.
      setSuccessMessage(`Your £${tipAmount.toFixed(2)} tip has been added to your review for ${booking.providerName}.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      setTimeout(() => setTipAmount(0), 2000);
    } catch {
      Alert.alert('Error', 'Failed to save your tip. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [booking, tipAmount]);

  /**
   * Open the real chat thread with this provider.
   *
   * This used to fall back to a local-only composer when providerId was missing:
   * the client typed a message, saw it appear in the thread, and it was never
   * sent anywhere — no DB write, no notification. Now a missing id is resolved
   * from the provider name, and if even that fails we say so instead of
   * pretending the message went through.
   */
  const openProviderChat = useCallback(async (b: ConfirmedBooking) => {
    let providerDbId = b.providerId;
    if (!providerDbId) {
      providerDbId = (await getProviderIdByDisplayName(b.providerName).catch(() => null)) ?? undefined;
    }
    if (!providerDbId) {
      Alert.alert(
        'Chat Unavailable',
        `We couldn't find ${b.providerName}'s account to open a chat. Please try another contact method.`,
      );
      return;
    }
    navigation.navigate('ProviderChat', {
      providerId: providerDbId,
      providerDbId,
      providerName: b.providerName,
    });
  }, [navigation]);

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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
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

          {/* To-do: intake form + info packs — only after both loads settle, so
              the section appears once instead of popping in twice. The intake
              form row stays visible after completion (dimmed, "Completed"
              badge) instead of disappearing — it used to only render while
              status === 'pending', so once submitted there was no way back
              into ClientIntakeFormScreen to see the answers you'd just filled in. */}
          {todoLoaded && (bookingIntakeForm || bookingInfoPacks.length > 0) && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>TO DO</Text>
              {bookingIntakeForm && (
                <TouchableOpacity style={[st.todoCard, { backgroundColor: C.card, borderColor: C.border, opacity: bookingIntakeForm.status === 'completed' ? 0.72 : 1 }]} activeOpacity={0.8}
                  onPress={() => navigation.navigate('ClientIntakeForm', { formId: bookingIntakeForm.id, bookingId: bookingIntakeForm.bookingId, serviceName: booking.serviceName })}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text }]}>{bookingIntakeForm.title}</Text>
                    <Text style={[{ fontSize: 12, color: C.sub, marginTop: 2 }]}>
                      {bookingIntakeForm.status === 'completed' ? 'Submitted — tap to review your answers' : 'Your provider needs this before your appointment'}
                    </Text>
                  </View>
                  <View style={[st.todoBadge, { backgroundColor: bookingIntakeForm.status === 'completed' ? '#34C759' : C.accent }]}>
                    <Text style={st.todoBadgeText}>{bookingIntakeForm.status === 'completed' ? 'Completed' : 'Required'}</Text>
                  </View>
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
              <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowReceipt(v => !v); }} activeOpacity={0.7}>
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
              <View style={[st.receiptContainer, { backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5' }]}>
                <View style={[st.receiptPaper, { backgroundColor: C.card, borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E0E0E0' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, position: 'relative' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: 1, color: C.text, textAlign: 'center' }}>PAYMENT RECEIPT</Text>
                    <TouchableOpacity
                      onPress={async () => { try { await shareReceipt(booking); } catch { Alert.alert('Error', 'Could not generate receipt.'); } }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ position: 'absolute', right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="share-outline" size={16} color={C.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 }} />

                  {/* Booking */}
                  {[['Service', booking.serviceName], ['Date', booking.bookingDate], ['Time', booking.bookingTime]].map(([l, v]) => (
                    <View key={l} style={st.rcptRow}>
                      <Text style={{ color: C.sub, fontSize: 13 }}>{l}</Text>
                      <Text style={{ color: C.text, fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={2}>{v}</Text>
                    </View>
                  ))}

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 }} />

                  {/* Itemised breakdown */}
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>Base Price</Text>
                    <Text style={{ color: C.text, fontSize: 13 }}>£{payment.servicePrice.toFixed(2)}</Text>
                  </View>
                  {(booking.addOns ?? []).map((a, i) => (
                    <View key={`ao-${i}`} style={st.rcptRow}>
                      <Text style={{ color: C.sub, fontSize: 13, flexShrink: 1, marginRight: 12 }} numberOfLines={1}>• {a.name}</Text>
                      <Text style={{ color: C.text, fontSize: 13 }}>+£{a.price.toFixed(2)}</Text>
                    </View>
                  ))}
                  {payment.addOnsTotal > 0 && (
                    <View style={st.rcptRow}>
                      <Text style={{ color: C.sub, fontSize: 13 }}>Subtotal</Text>
                      <Text style={{ color: C.text, fontSize: 13 }}>£{payment.subtotal.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>Service Charge</Text>
                    <Text style={{ color: C.text, fontSize: 13 }}>£{payment.serviceCharge.toFixed(2)}</Text>
                  </View>

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 }} />

                  {/* Totals */}
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Total</Text>
                    <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>£{payment.total.toFixed(2)}</Text>
                  </View>
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>{payment.paymentType === 'deposit' ? 'Deposit Paid' : 'Total Paid'}</Text>
                    <Text style={{ color: '#34C759', fontSize: 13, fontWeight: '600' }}>£{(payment.paymentType === 'deposit' ? payment.totalPaidAtCheckout : payment.amountPaidAtCheckout).toFixed(2)}</Text>
                  </View>
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>Due at Appointment</Text>
                    <Text style={{ color: payment.remainingBalance > 0 ? '#FF9500' : C.sub, fontSize: 13, fontWeight: '600' }}>£{payment.remainingBalance.toFixed(2)}</Text>
                  </View>
                  <View style={st.rcptRow}>
                    <Text style={{ color: C.sub, fontSize: 13 }}>Payment Method</Text>
                    <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                      {(booking.paymentMethod && METHOD_LABELS[booking.paymentMethod]) || 'Card'}
                    </Text>
                  </View>

                  {payment.paymentType === 'full' && (
                    <View style={st.receiptFullyPaidBadge}>
                      <Text style={st.receiptFullyPaidText}>Paid in Full</Text>
                    </View>
                  )}

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8 }} />

                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: C.sub, fontSize: 10, marginBottom: 2 }}>REF: {booking.id?.slice(0, 8).toUpperCase()}</Text>
                    <Text style={{ color: C.sub, fontSize: 10 }}>
                      {new Date(booking.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Notes / Instructions */}
          {booking.notes && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>YOUR NOTES</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20, padding: 16 }}>{booking.notes}</Text>
              </View>
            </View>
          )}
          {booking.bookingInstructions && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>INSTRUCTIONS</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 14, lineHeight: 20, padding: 16 }}>{booking.bookingInstructions}</Text>
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
                  ) : hasMapDestination(booking) ? (
                    <TouchableOpacity onPress={() => openInMaps(booking)} activeOpacity={0.7}>
                      <Text style={[st.rowValue, { color: C.accent }]}>{booking.address}</Text>
                    </TouchableOpacity>
                  ) : !isAddressPending(booking.address) ? (
                    // A real address the provider never geocoded — show it as
                    // plain text rather than a Directions link that can't work.
                    <Text style={[st.rowValue, { color: C.text }]}>{booking.address}</Text>
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
                <TouchableOpacity style={[st.primaryBtn, { flex: 1, backgroundColor: C.accent }]} disabled={rebookBusy} onPress={() => handleRebook(booking)} activeOpacity={0.7}>
                  {rebookBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={st.primaryBtnText}>Book Again</Text>}
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
              {/* sheetBtn is `flex:1`, meant to share a sheetBtns row with a
                  sibling — used alone (even with alignSelf:'stretch') it has
                  no row to fill and Yoga collapses it, so the button barely
                  rendered / wasn't reliably tappable. Wrapping it in the row
                  gives flex:1 something to fill again. */}
              <View style={[st.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.accent }]}
                  onPress={() => { setShowSuccessModal(false); if (shouldNavigateToCart) { setShouldNavigateToCart(false); navigation.getParent()?.navigate('Cart'); } }} activeOpacity={0.7}>
                  <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center' }}>Got It</Text>
                </TouchableOpacity>
              </View>
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
              <View style={[st.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity style={[st.sheetBtn, { backgroundColor: C.accent }]} onPress={() => setShowCooldownModal(false)} activeOpacity={0.7}>
                  <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center' }}>Got It</Text>
                </TouchableOpacity>
              </View>
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
                    onPress={() => { setContactSheetVisible(false); openProviderChat(booking); }}>
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

        {/* The local-only "in-app message" fallback modal was removed: it wrote
            to component state only, so every message a client sent from here was
            silently discarded. Contact → In-app message now opens the real
            ProviderChat thread (provider_messages + realtime) via
            openProviderChat, which resolves the provider id or reports failure. */}

        {/* ─── Info Pack Full-Screen Reader — long packs only. Short ones get
            the compact popup below instead of taking over the whole screen. */}
        <Modal visible={!!viewingPack && isLongInfoPack(viewingPack)} animationType="fade" transparent={false} statusBarTranslucent onRequestClose={() => setViewingPack(null)}>
          <View style={{ flex: 1, backgroundColor: isDarkMode ? '#1A1815' : '#F5F1EC' }}>
            <SafeAreaView style={{ flex: 1 }}>
              {/* Header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
              }}>
                <TouchableOpacity onPress={() => setViewingPack(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={26} color={C.accent} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: C.sub }}>
                    FROM {booking.providerName?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ width: 26 }} />
              </View>

              {viewingPack && (
                <ScrollView
                  contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 60 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Service pill */}
                  <View style={{
                    alignSelf: 'flex-start', backgroundColor: C.accent + '22',
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 14,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.accent }}>
                      {viewingPack.service?.toUpperCase()}
                    </Text>
                  </View>

                  {/* Title */}
                  <Text style={{
                    fontSize: 26, fontWeight: '800', letterSpacing: -0.5,
                    color: isDarkMode ? '#F0ECE7' : '#1C1A18',
                    marginBottom: 24, lineHeight: 32,
                  }}>
                    {viewingPack.title}
                  </Text>

                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginBottom: 24 }} />

                  {/* Body */}
                  <Text style={{ fontSize: 16, lineHeight: 26, color: isDarkMode ? '#D8D2CB' : '#3A3733' }}>
                    {viewingPack.content}
                  </Text>
                </ScrollView>
              )}
            </SafeAreaView>
          </View>
        </Modal>

        {/* ─── Info Pack Popup — short packs, as a small sheet instead of a
            takeover screen ─── */}
        <Modal visible={!!viewingPack && !isLongInfoPack(viewingPack)} animationType="fade" transparent onRequestClose={() => setViewingPack(null)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 28 }} onPress={() => setViewingPack(null)}>
            <Pressable style={{ width: '100%', maxWidth: 420, borderRadius: 20, padding: 22, backgroundColor: isDarkMode ? '#252220' : '#FFF' }} onPress={e => e.stopPropagation()}>
              {viewingPack && (
                <>
                  <View style={{
                    alignSelf: 'flex-start', backgroundColor: C.accent + '22',
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.accent }}>
                      {viewingPack.service?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: C.text, marginBottom: 10 }}>
                    {viewingPack.title}
                  </Text>
                  <Text style={{ fontSize: 15, lineHeight: 22, color: C.sub }}>
                    {viewingPack.content}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setViewingPack(null)}
                    activeOpacity={0.8}
                    style={{ marginTop: 18, alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: C.accent }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Got it</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
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
  receiptContainer: { borderRadius: 8, padding: 12 },
  receiptPaper: { padding: 16, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed' },
  receiptFullyPaidBadge: { backgroundColor: 'rgba(52,199,89,0.15)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, marginTop: 10, alignSelf: 'center' },
  receiptFullyPaidText: { color: '#34C759', fontSize: 12, fontWeight: '700' },
  rcptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
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
