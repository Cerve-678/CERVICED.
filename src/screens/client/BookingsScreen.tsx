// BookingsScreen.tsx - COMPLETELY FIXED - NO FREEZING, SMOOTH SCROLLING
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  useWindowDimensions,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useFont } from '../../contexts/FontContext';
import { useBooking, ConfirmedBooking, BookingStatus, createBookingDateTime } from '../../contexts/BookingContext';
import { hasMapDestination, isMobileBooking } from '../../types/booking';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { submitReview, getProviderIdByDisplayName, hasReviewedBooking, getActiveRescheduleRequest, getProviderContactByDisplayName, getProviderContactById, ProviderContactInfo, getMyBookingActionItems, getRebookableService, RebookableService, setBookingTip, getUserWaitlistEntries, leaveWaitlist, type WaitlistEntry, getBookingById, claimWaitlistHold, declineWaitlistHold, type RawBooking } from '../../services/databaseService';
import { ThemedBackground } from '../../components/ThemedBackground';
import SlidingTabs from '../../components/SlidingTabs';
import { useTheme, Theme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import { HomeScreenProps } from '../../navigation/types';
import { logger } from '../../utils/logger';
import { formatLongDate, formatTime12 } from '../../utils/dateUtils';
import type { GroupedListItem } from '../../features/bookings/presentationTypes';
import { BookingCard } from '../../features/bookings/BookingCard';
import { BookingListRow } from '../../features/bookings/BookingListRow';
import { formatBookingDate, resolveServiceCategory } from '../../features/bookings/presentation';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { BOTTOM_SAFE_GAP } from '../../utils/bottomSafeGap';

// ==================== TYPES ====================

type Props = HomeScreenProps<'Bookings'>;
type BookingsListRow =
  | GroupedListItem
  | { kind: 'past-booking'; booking: ConfirmedBooking }
  | { kind: 'waitlist-header' }
  | { kind: 'waitlist'; entry: WaitlistEntry };

// ==================== CONSTANTS ====================


// ==================== HELPER FUNCTIONS ====================

// ==================== COMPONENTS ====================

// Development-only access to Dev Settings via a triple-tap header action.
const HiddenDevMenuTrigger = ({ navigation, theme }: { navigation: any; theme: Theme }) => {
  const tapCountRef = React.useRef(0);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!__DEV__) return null;

  const handleTap = () => {
    tapCountRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    if (tapCountRef.current === 3) {
      logger.log('Opening Dev Settings...');
      navigation.navigate('DevSettings');
      tapCountRef.current = 0;
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <TouchableOpacity
      onPress={handleTap}
      style={{
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      activeOpacity={0.6}
    >
      <Ionicons name="construct-outline" size={18} color={theme.text} />
    </TouchableOpacity>
  );
};

/**
 * The one line of address text on a booking card.
 *
 * A mobile provider comes to the client, so the venue is the client's own
 * address — their provider's location is a private base, not somewhere to
 * send the client. The client already knows their own address, so the card
 * confirms it has gone to the provider rather than reading it back to them.
 * Non-mobile bookings keep the release-gated provider address (null until
 * the policy unlocks it, hence the fallback).
 */
const bookingLocationLine = (b: ConfirmedBooking): string => {
  if (isMobileBooking(b)) {
    return b.clientAddress?.trim()
      ? 'Your address has been sent to the mobile provider'
      : 'Send your address in Messages';
  }
  return b.address || 'Address to be confirmed';
};

const CATEGORY_TABS = [
  { key: 'all' as const,  label: 'Upcoming Bookings' },
  { key: 'past' as const, label: 'Past Bookings' },
];

// How far back the Past Bookings list (and its category filter) looks.
// Display-only — the underlying booking rows are never touched by this.
const PAST_BOOKINGS_VISIBLE_DAYS = 30;

const WaitlistCard = React.memo(function WaitlistCard({
  entry,
  onBook,
  onLeave,
}: {
  entry: WaitlistEntry;
  onBook: (entry: WaitlistEntry) => void;
  onLeave: (entry: WaitlistEntry) => void;
}) {
  const { theme, palette: P } = useTheme();
  const notified = entry.status === 'notified';

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: P.border,
        backgroundColor: P.surface,
        padding: 16,
        marginBottom: 10,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 15, color: theme.text, marginBottom: 2 }}>
              {entry.service_name_snapshot}
            </Text>
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: theme.secondaryText, marginBottom: 8 }}>
              {entry.provider_name_snapshot}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{
                backgroundColor: notified ? 'rgba(52,199,89,0.15)' : 'rgba(255,149,0,0.15)',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}>
                <Text style={{
                  fontFamily: 'BakbakOne-Regular',
                  fontSize: 10,
                  letterSpacing: 0.4,
                  color: notified ? '#34C759' : '#FF9500',
                }}>
                  {notified ? 'SLOT OPENED' : `#${entry.position} IN QUEUE`}
                </Text>
              </View>
            </View>
          </View>
          {notified ? (
            <TouchableOpacity
              style={{
                backgroundColor: P.accent,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                marginLeft: 12,
              }}
              onPress={() => onBook(entry)}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 11, color: P.onAccent }}>Book Now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={{ marginTop: 10, alignSelf: 'flex-start' }}
          onPress={() => onLeave(entry)}
          activeOpacity={0.7}
        >
          <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 11, color: theme.secondaryText, textDecorationLine: 'underline' }}>
            Leave waitlist
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ==================== MAIN COMPONENT ====================

const BookingsScreen: React.FC<Props> = ({ navigation, route }) => {
  useFont();
  const { theme, isDarkMode, palette: P } = useTheme();
  // Measured per render, not captured at module load, so the full-screen modal
  // backdrops still cover the window after a rotation or in split-screen.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const styles = useMemo(
    () => createStyles(theme, isDarkMode, P, screenWidth, screenHeight),
    [theme, isDarkMode, P, screenWidth, screenHeight],
  );
  const { user } = useAuth();
  const { addToCart } = useCart();

  const {
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    providerRespondToReschedule,
    reloadBookings,
  } = useBooking();

  // Past Bookings only shows the last 30 days of history — older rows stay
  // in the database untouched (receipts/reviews/transactions are unaffected),
  // they just drop out of this list and its category filter.
  const filteredPastBookings = useMemo(() => {
    const cutoff = new Date(Date.now() - PAST_BOOKINGS_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
    return pastBookings.filter(b => !b.isPendingReschedule && createBookingDateTime(b.bookingDate, b.bookingTime) >= cutoff);
  }, [pastBookings]);
  const filteredUpcomingBookings = useMemo(() => upcomingBookings, [upcomingBookings]);

  // Past Bookings is a flat list with a category filter rather than the
  // always-grouped sections Upcoming uses (see pastCategoryFilter below).
  const pastCategories = useMemo(() => {
    const set = new Set<string>();
    for (const b of filteredPastBookings) set.add(resolveServiceCategory(b.serviceName, b.providerService));
    return Array.from(set).sort();
  }, [filteredPastBookings]);

  const [pastCategoryFilter, setPastCategoryFilter] = useState<string | null>(null);
  const [pastFilterOpen, setPastFilterOpen] = useState(false);
  const [pastFilterAnchor, setPastFilterAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const pastFilterButtonRef = useRef<View>(null);

  const openPastFilterMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // measureInWindow exists on the underlying native view via NativeMethods,
    // but isn't part of View's public ref type.
    const node = pastFilterButtonRef.current as unknown as {
      measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void;
    } | null;
    node?.measureInWindow((x, y, width, height) => {
      setPastFilterAnchor({ x, y, width, height });
      setPastFilterOpen(true);
    });
  }, []);

  const pastBookingsFiltered = useMemo(() => {
    const source = pastCategoryFilter
      ? filteredPastBookings.filter(b => resolveServiceCategory(b.serviceName, b.providerService) === pastCategoryFilter)
      : filteredPastBookings;
    // filteredPastBookings is sorted oldest-first; history reads most-recent-first.
    return [...source].reverse();
  }, [filteredPastBookings, pastCategoryFilter]);

  const mapRef = useRef<MapView>(null);
  const mainScrollRef = useRef<FlatList<BookingsListRow>>(null);
  const modalScrollRef = useRef<ScrollView>(null);

  // Give-up timer for the "open booking from notification" effect below — a
  // booking that never resolves (e.g. it belongs to another user's stale
  // notification) must not leave openBookingId/highlightBookingId set forever,
  // or every later bookings-list refresh (realtime, focus, etc.) re-runs that
  // whole effect indefinitely and the screen appears to freeze.
  const notifBookingGiveUpRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => {
    if (notifBookingGiveUpRef.current) clearTimeout(notifBookingGiveUpRef.current.timer);
  }, []);

  const [activeFilters, setActiveFilters] = useState<Set<'all' | 'past'>>(new Set());
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  // A time-boxed waitlist hold (waitlist_holds.sql) — deliberately excluded
  // from todayBookings/upcomingBookings/pastBookings (see client_bookings
  // view) so it never shows as a phantom confirmed appointment. Fetched
  // directly by id only when a waitlist_slot_available notification points
  // at one; see the route-params effect below.
  const [waitlistHold, setWaitlistHold] = useState<RawBooking | null>(null);
  const [waitlistHoldBusy, setWaitlistHoldBusy] = useState(false);

  // Load waitlist entries for this user
  useEffect(() => {
    if (!user?.id) return;
    getUserWaitlistEntries(user.id)
      .then(setWaitlistEntries)
      .catch(() => {});
  }, [user?.id]);

  const handleConfirmWaitlistHold = useCallback(async () => {
    if (!waitlistHold) return;
    setWaitlistHoldBusy(true);
    try {
      await claimWaitlistHold(waitlistHold.id);
      setWaitlistHold(null);
      await reloadBookings();
    } catch (err: any) {
      Alert.alert('Could not confirm', toUserMessageAllowingDbGuard(err, 'This hold may have expired. Please check with the provider for other openings.', 'BookingsScreen.confirmWaitlistHold'));
      setWaitlistHold(null);
    } finally {
      setWaitlistHoldBusy(false);
    }
  }, [waitlistHold, reloadBookings]);

  const handleDeclineWaitlistHold = useCallback(async () => {
    if (!waitlistHold) return;
    setWaitlistHoldBusy(true);
    try {
      await declineWaitlistHold(waitlistHold.id);
    } catch {}
    setWaitlistHold(null);
    setWaitlistHoldBusy(false);
  }, [waitlistHold]);

  // Pending intake forms + unread info packs per booking — drives the "!" badge
  const refreshBookingActionItems = useCallback(() => {
    if (!user?.id) return;
    getMyBookingActionItems()
      .then(setBookingActionItems)
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refreshBookingActionItems();
  }, [refreshBookingActionItems, upcomingBookings.length]);

  // Re-check when returning to this screen (e.g. after filling an intake form)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshBookingActionItems);
    return unsubscribe;
  }, [navigation, refreshBookingActionItems]);

  const toggleFilter = useCallback((filter: 'all' | 'past') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (filter !== 'past') {
      setPastCategoryFilter(null);
      setPastFilterOpen(false);
    }
    setActiveFilters(prev => {
      if (prev.has(filter)) {
        return new Set();
      }
      return new Set([filter]);
    });
  }, []);

  const isFilterView = activeFilters.size > 0;
  const [selectedBooking, setSelectedBooking] = useState<ConfirmedBooking | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successIcon, setSuccessIcon] = useState('✓');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasRated, setHasRated] = useState(false);
  const [showRebookAddOnsModal, setShowRebookAddOnsModal] = useState(false);
  const [rebookSelection, setRebookSelection] = useState<'with' | 'without' | null>(null);
  // Resolved once in handleRebook, consumed by confirmRebook — carries the
  // provider's slug (so the cart's provider logo can open the profile) and
  // today's live price/duration/add-ons instead of rebooking a stale snapshot.
  const [rebookContext, setRebookContext] = useState<{ providerDbId: string; live: RebookableService } | null>(null);
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [contactSheetBooking, setContactSheetBooking] = useState<ConfirmedBooking | null>(null);
  const [contactSheetInfo, setContactSheetInfo] = useState<ProviderContactInfo | null>(null);
  const [contactSheetLoading, setContactSheetLoading] = useState(false);
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [showTipModal, setShowTipModal] = useState(false);
  const [shouldNavigateToCart, setShouldNavigateToCart] = useState(false);
  const [bookingActionItems, setBookingActionItems] = useState<Record<string, number>>({});
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // ✅ Track rated bookings and tips
  const [ratedBookings, setRatedBookings] = useState<Set<string>>(new Set());
  const [tippedBookings, setTippedBookings] = useState<Set<string>>(new Set());

  // ✅ Track highlighted booking (from notification navigation) and recently added bookings
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [recentlyAddedBookings, setRecentlyAddedBookings] = useState<Set<string>>(new Set());

  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const focusMapOnLocation = useCallback((coordinates: { latitude: number; longitude: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    } catch {
      Alert.alert('Error', 'Unable to open maps');
    }
  }, []);

  const openContactSheet = useCallback(async (booking: ConfirmedBooking) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContactSheetBooking(booking);
    setContactSheetInfo(null);
    setContactSheetVisible(true);
    setContactSheetLoading(true);
    try {
      // Prefer provider id (stable); fall back to name for legacy bookings.
      const info = booking.providerId
        ? await getProviderContactById(booking.providerId)
        : await getProviderContactByDisplayName(booking.providerName);
      setContactSheetInfo(info);
    } catch {
      setContactSheetInfo({ preferred_contact_methods: ['in_app'], whatsapp_number: null, email: null, phone: null });
    } finally {
      setContactSheetLoading(false);
    }
  }, []);

  const openProviderChat = useCallback(async (booking: ConfirmedBooking) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let providerDbId = booking.providerId;
    if (!providerDbId) {
      providerDbId = (await getProviderIdByDisplayName(booking.providerName).catch(() => null)) ?? undefined;
    }
    if (!providerDbId) {
      Alert.alert(
        'Chat Unavailable',
        `We couldn't find ${booking.providerName}'s account to open a chat. Please try another contact method.`,
      );
      return;
    }
    navigation.navigate('ProviderChat', {
      providerId: providerDbId,
      providerDbId,
      providerName: booking.providerName,
    });
  }, [navigation]);

  // In-app messaging is always available — the old ±72-hour window around the
  // appointment is gone. (Signature kept so the call sites stay unchanged.)
  const isMessagingAvailable = useCallback((_bookingDate: string) => true, []);

  const handleBookingPress = useCallback((booking: ConfirmedBooking) => {
    navigation.navigate('BookingDetail', { bookingId: booking.id });
  }, [navigation]);

  // Book Again — always adds a new, independently-schedulable cart instance.
  // No "already in cart" gate: a client can have more than one booking with
  // the same provider (even the same service) in a single checkout, each
  // with its own date/time.
  const handleRebook = useCallback(async (booking: ConfirmedBooking) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ✅ FIX: Set selectedBooking BEFORE showing modal
    setSelectedBooking(booking);

    // ✅ FIX: Close main modal first and re-enable scrolling
    setModalVisible(false);

    // Re-enable scrolling immediately
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    // Re-resolve against the provider's current live service — this is what
    // carries providerSlug into the cart (without it, the cart's provider
    // logo can't open the profile and shows an error instead), and it also
    // picks up today's price/duration/add-ons rather than rebooking whatever
    // was true when the original booking was made.
    const providerDbId = booking.providerId
      ?? (await getProviderIdByDisplayName(booking.providerName).catch(() => null)) ?? undefined;

    if (!providerDbId) {
      setSuccessMessage(`We couldn't find ${booking.providerName}'s current profile. Please book from their profile directly.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    const live = await getRebookableService(providerDbId, booking.serviceName).catch(() => null);
    if (!live) {
      setSuccessMessage(`${booking.providerName} no longer offers ${booking.serviceName}. Check their profile for their current services.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }
    setRebookContext({ providerDbId, live });

    if (booking.addOns && booking.addOns.length > 0) {
      // Small delay to allow main modal to close first
      setTimeout(() => {
        setShowRebookAddOnsModal(true);
      }, 300);
    } else {
      // No add-ons, add directly to cart
      const cartItem = {
        providerName: booking.providerName,
        providerDisplayName: live.providerDisplayName,
        providerSlug: live.providerSlug,
        providerId: providerDbId,
        // booking.providerImage can be a plain string or an {uri} object
        // depending on where the booking snapshot came from — Image requires
        // {uri}, so a raw string here silently renders nothing in the cart.
        providerImage: typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage,
        providerService: booking.providerService,
        service: {
          id: live.id,
          name: live.name,
          price: live.price,
          duration: booking.duration,
          description: booking.providerService,
          addOns: [],
        },
        quantity: 1,
        // Always a new cart instance — the client may already have this
        // same provider/service in the cart from an earlier "Book Again" or
        // from the provider profile, and each rebook is its own appointment.
        forceNewInstance: true,
      };

      addToCart(cartItem);
      setModalVisible(false);
      setSuccessMessage(`${booking.serviceName} has been added to your cart.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
      setShouldNavigateToCart(true);
    }
  }, [addToCart]);

  // ✅ Confirm rebook with/without add-ons
  const confirmRebook = useCallback((selection?: 'with' | 'without') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const finalSelection = selection || rebookSelection;
    if (!selectedBooking || !finalSelection) return;

    setShowRebookAddOnsModal(false);

    // ✅ FIX: Re-enable scrolling when closing add-ons modal
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    // Re-resolve the booking's add-ons against the live list by name, so a
    // rebook carries today's add-on prices and real add-on ids — any add-on
    // the provider has since removed or deactivated is silently dropped
    // rather than re-booked from a stale snapshot.
    const live = rebookContext?.live;
    const previousAddOnNames = new Set((selectedBooking.addOns ?? []).map(a => a.name));
    const liveAddOns = finalSelection === 'with' && live
      ? live.addOns.filter(a => previousAddOnNames.has(a.name))
      : [];

    const cartItem = {
      providerName: selectedBooking.providerName,
      providerDisplayName: live?.providerDisplayName,
      providerSlug: live?.providerSlug,
      providerId: rebookContext?.providerDbId ?? selectedBooking.providerId,
      providerImage: typeof selectedBooking.providerImage === 'string' ? { uri: selectedBooking.providerImage } : selectedBooking.providerImage,
      providerService: selectedBooking.providerService,
      service: {
        id: live?.id ?? selectedBooking.serviceId ?? `rebook_${Date.now()}`,
        name: live?.name ?? selectedBooking.serviceName,
        price: live?.price ?? selectedBooking.price,
        duration: selectedBooking.duration,
        description: selectedBooking.providerService,
        addOns: liveAddOns,
      },
      quantity: 1,
      // Always a new cart instance — see handleRebook for why rebooking must
      // never merge into an existing item's quantity instead of creating a
      // separately-schedulable appointment.
      forceNewInstance: true,
    };

    addToCart(cartItem);
    setRebookSelection(null);
    setRebookContext(null);
    setModalVisible(false);
    setSuccessMessage(`${selectedBooking.serviceName} has been added to your cart.`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
    setShouldNavigateToCart(true);
  }, [selectedBooking, rebookSelection, rebookContext, addToCart]);

  // ✅ FIXED: Rating locks after first submission + re-enable scrolling
  const handleRatingSubmit = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!selectedBooking || rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to submit a review.');
      return;
    }

    setIsLoading(true);
    try {
      // The booking's stored provider UUID is the source of truth; the
      // display-name lookup is only a legacy fallback
      const providerId = selectedBooking.providerId
        ?? await getProviderIdByDisplayName(selectedBooking.providerName);

      if (providerId) {
        // Check not already reviewed
        const alreadyReviewed = await hasReviewedBooking(selectedBooking.id);
        if (!alreadyReviewed) {
          await submitReview({
            booking_id: selectedBooking.id,
            provider_id: providerId,
            service_id: null,
            user_id: user.id,
            rating,
            ...(reviewText.trim() ? { comment: reviewText.trim() } : {}),
          });
        }
      }

      // Mark as rated in local state
      setRatedBookings(prev => new Set(prev).add(selectedBooking.id));
      setHasRated(true);
      setIsLoading(false);

      setTimeout(() => {
        setShowRatingModal(false);
        setRating(0);
        setReviewText('');
        setTimeout(() => {
          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
        }, 100);
      }, 2000);
    } catch {
      Alert.alert('Error', 'Failed to submit rating.');
      setIsLoading(false);
    }
  }, [selectedBooking, rating, reviewText, user]);

  // Tips are stored on the booking's review row (reviews.tip_amount), which
  // requires a review to exist first — setBookingTip returns false rather
  // than silently dropping the tip when there's nothing to attach it to.
  // This previously only set local component state (tippedBookings), so the
  // tip was discarded on unmount and the provider never saw it.
  const handleTipSubmit = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!selectedBooking || tipAmount <= 0) {
      Alert.alert('Invalid Tip', 'Please enter a valid tip amount.');
      return;
    }

    setIsLoading(true);
    try {
      const attached = await setBookingTip(selectedBooking.id, tipAmount);
      if (!attached) {
        setIsLoading(false);
        Alert.alert('Rate First', 'Tips are added to your review, so please rate this appointment before leaving a tip.');
        return;
      }

      setTippedBookings(prev => new Set(prev).add(selectedBooking.id));
      setShowTipModal(false);
      setSuccessMessage(`Your £${tipAmount.toFixed(2)} tip has been added to your review for ${selectedBooking.providerName}.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      setTimeout(() => setTipAmount(0), 2000);
    } catch (error) {
      logger.error('Failed to save tip:', error);
      Alert.alert('Error', 'Failed to save your tip. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking, tipAmount]);

  const retryLoadBookings = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRetrying(true);
    try {
      await reloadBookings();
      setBookingsError(null); // Only clear on success
    } catch {
      setBookingsError('Failed to load bookings. Pull down to retry.');
    } finally {
      setRetrying(false);
    }
  }, [reloadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setBookingsError(null);
    try {
      await reloadBookings();

      // Refresh user location
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setUserLocation(newLocation);
          logger.log('Location refreshed:', newLocation);

          // Center map on user location if no active bookings
          if (mapRef.current && !currentBooking) {
            mapRef.current.animateToRegion(
              {
                ...newLocation,
                latitudeDelta: 0.15,
                longitudeDelta: 0.15,
              },
              1000
            );
          }
        }
      } catch (locationError) {
        logger.error('Error refreshing location:', locationError);
      }
    } catch (error) {
      logger.error('Refresh failed:', error);
      setBookingsError('Failed to load bookings. Pull down to retry.');
    } finally {
      setRefreshing(false);
    }
  }, [reloadBookings, currentBooking]);

  // ==================== HEADER OPTIONS ====================

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: isFilterView ? 'My Bookings' : 'Track Appointment',
      headerShadowVisible: false,
      headerTransparent: true,
      headerBlurEffect: isDarkMode ? undefined : 'regular',
      headerLargeTitle: false,
      headerStyle: {
        backgroundColor: isDarkMode ? P.bg : 'transparent',
      },
      headerTitleStyle: {
        fontFamily: 'BakbakOne-Regular',
        fontSize: 22,
        color: P.text,
      },
      headerTintColor: P.text,
      // This component renders no production UI.
      headerRight: () => <HiddenDevMenuTrigger navigation={navigation} theme={theme} />,
    });
  }, [navigation, isFilterView, theme, isDarkMode, P]);

  // ==================== EFFECTS ====================

  // Detect initial load failure from BookingContext
  useEffect(() => {
    reloadBookings().catch(() => {
      setBookingsError('Failed to load bookings. Pull down to retry.');
    });
  }, [reloadBookings]);

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

  // Keep map location current only while this tab is visible. Tab screens
  // remain mounted, so a permanent timer otherwise polls GPS while the
  // client is browsing elsewhere in the app.
  const currentBookingRef = useRef(currentBooking);
  currentBookingRef.current = currentBooking;

  useFocusEffect(useCallback(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    const startLocationUpdates = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted' && active) {
          const applyLocation = (location: Location.LocationObject) => {
            if (!active) return;
            const newLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            setUserLocation(newLocation);

            if (mapRef.current && !currentBookingRef.current) {
              mapRef.current.animateToRegion(
                {
                  ...newLocation,
                  latitudeDelta: 0.15,
                  longitudeDelta: 0.15,
                },
                1000
              );
            }
          };

          applyLocation(await Location.getCurrentPositionAsync({}));
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 60_000,
              distanceInterval: 100,
            },
            applyLocation,
          );
          if (!active) subscription.remove();
        }
      } catch (error) {
        logger.error('Error getting location:', error);
      }
    };

    void startLocationUpdates();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []));

  // ✅ Reset map to user area when all bookings are completed
  useEffect(() => {
    if (allTodayBookingsCompleted && mapRef.current && userLocation) {
      logger.log('All bookings completed, centering map on user location');
      mapRef.current.animateToRegion(
        {
          ...userLocation,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        },
        1000
      );
    }
  }, [allTodayBookingsCompleted, userLocation]);

  // ✅ Handle route params - open specific booking from notifications
  useEffect(() => {
    if (route?.params?.openBookingId || route?.params?.highlightBookingId) {
      const bookingId = route.params.openBookingId || route.params.highlightBookingId;
      const shouldOpenReschedule = route.params.openReschedule;
      const shouldOpenReview = route.params.openReview;
      const shouldHighlight = !!route.params.highlightBookingId;

      logger.log('BookingsScreen received params:', { bookingId, shouldOpenReschedule, shouldHighlight });

      // Find booking in all lists
      const allBookings = [
        ...(todayBookings || []),
        ...(upcomingBookings || []),
        ...(pastBookings || []),
      ];

      const booking = allBookings.find(b => b.id === bookingId);

      if (booking) {
        logger.log('Found booking:', booking.id);

        // Auto-detect which tab the booking belongs to
        const isInPast = (pastBookings || []).some(b => b.id === bookingId);
        const correctTab: 'all' | 'past' = isInPast ? 'past' : 'all';
        logger.log('Auto-detected tab:', correctTab);
        setActiveFilters(new Set([correctTab]));

        setSelectedBooking(booking);

        // Set highlight state for smart scroll and highlight animation
        if (shouldHighlight) {
          setHighlightedBookingId(bookingId!);
          // Clear highlight after animation completes
          setTimeout(() => {
            setHighlightedBookingId(null);
          }, 3000);
        }

        // Move past the list header once the history view is active. The
        // outer FlatList owns scrolling, so this keeps notification-driven
        // navigation on the same virtualized surface as manual browsing.
        setTimeout(() => {
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollToOffset({ offset: 200, animated: true });
            logger.log('Scrolled to bookings section');
          }
        }, 400);

        // Small delay to ensure view is switched, then navigate to the detail/reschedule screen
        setTimeout(async () => {
          if (shouldOpenReschedule) {
            // Sync active reschedule request from Supabase before navigating
            if (!booking.rescheduleRequest?.providerAvailableDates) {
              try {
                const dbReq = await getActiveRescheduleRequest(booking.id);
                if (dbReq?.status === 'provider_responded' && (dbReq.provider_available_slots ?? []).length > 0) {
                  await providerRespondToReschedule(booking.id, dbReq.provider_available_slots!);
                }
              } catch {}
            }
            logger.log('Navigating to Reschedule screen');
            navigation.navigate('Reschedule', { bookingId: booking.id });
          } else if (shouldOpenReview) {
            // review_request's "Rate Now" — open the rating sheet directly on
            // this screen rather than pushing BookingDetail. The modal already
            // lives here and reads selectedBooking, which is set above.
            logger.log('Opening rating modal for booking:', booking.id);
            setRating(0);
            setReviewText('');
            setShowRatingModal(true);
          } else if (route.params?.openBookingId) {
            logger.log('Navigating to BookingDetail screen');
            navigation.navigate('BookingDetail', { bookingId: booking.id });
          }
        }, 500);

        // Clear params after handling
        navigation.setParams({ openBookingId: undefined, openReschedule: undefined, openReview: undefined, highlightBookingId: undefined, initialTab: undefined } as any);
        if (notifBookingGiveUpRef.current) {
          clearTimeout(notifBookingGiveUpRef.current.timer);
          notifBookingGiveUpRef.current = null;
        }
      } else {
        // Not in the normal lists — could be a waitlist hold (deliberately
        // excluded from them, see client_bookings view) rather than actually
        // missing. Check directly before falling back to the retry/give-up
        // path below.
        getBookingById(bookingId!)
          .then(direct => {
            if (direct?.status === 'on_hold') {
              setWaitlistHold(direct);
              navigation.setParams({ openBookingId: undefined, openReschedule: undefined, openReview: undefined, highlightBookingId: undefined, initialTab: undefined } as any);
              if (notifBookingGiveUpRef.current) {
                clearTimeout(notifBookingGiveUpRef.current.timer);
                notifBookingGiveUpRef.current = null;
              }
            }
          })
          .catch(() => {});

        logger.warn('⚠️ Booking not found:', bookingId);
        // Bookings may still be loading — allow a few seconds of retries as
        // the list refreshes, but give up and clear the params once that
        // window passes so this effect stops re-running on every future
        // bookings-list change (which is what caused the freeze).
        if (notifBookingGiveUpRef.current?.id !== bookingId) {
          if (notifBookingGiveUpRef.current) clearTimeout(notifBookingGiveUpRef.current.timer);
          notifBookingGiveUpRef.current = {
            id: bookingId!,
            timer: setTimeout(() => {
              navigation.setParams({ openBookingId: undefined, openReschedule: undefined, openReview: undefined, highlightBookingId: undefined, initialTab: undefined } as any);
              notifBookingGiveUpRef.current = null;
            }, 8000),
          };
        }
      }
    } else if (route?.params?.initialTab) {
      // Fallback: handle initialTab when no bookingId (e.g. generic "view past bookings")
      logger.log('BookingsScreen: switching to tab:', route.params.initialTab);
      setActiveFilters(new Set([route.params.initialTab]));
      navigation.setParams({ initialTab: undefined } as any);
    }
  }, [route?.params?.openBookingId, route?.params?.openReschedule, route?.params?.openReview, route?.params?.highlightBookingId, route?.params?.initialTab, todayBookings, upcomingBookings, pastBookings, filteredUpcomingBookings, navigation, providerRespondToReschedule]);

  // ✅ Update selectedBooking ONLY when modal is visible and booking state changes
  // Use ref to track last update to prevent infinite loops
  const lastBookingUpdateRef = useRef<string>('');

  useEffect(() => {
    if (!modalVisible || !selectedBooking) {
      return;
    }

    const updatedBooking = [...todayBookings, ...upcomingBookings, ...pastBookings].find(
      b => b.id === selectedBooking.id
    );

    if (!updatedBooking) {
      return;
    }

    // ✅ Create unique state signature to detect REAL changes only
    const newStateSignature = `${updatedBooking.id}|${updatedBooking.isPendingReschedule}|${updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0}|${updatedBooking.bookingDate}|${updatedBooking.bookingTime}`;

    // ✅ Only update if state signature actually changed (prevents re-render loops)
    if (lastBookingUpdateRef.current !== newStateSignature) {
      const oldSignature = lastBookingUpdateRef.current.split('|');
      const wasPending = oldSignature[1] === 'true';
      const oldDatesCount = parseInt(oldSignature[2] || '0');
      const isPending = updatedBooking.isPendingReschedule || false;
      const datesCount = updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0;
      const hasDatesObject = !!updatedBooking.rescheduleRequest?.providerAvailableDates;

      logger.log(`[${updatedBooking.providerName}] Booking ${updatedBooking.id} state update:`, {
        from: `${wasPending ? (oldDatesCount > 0 ? 'AVAILABLE' : 'PENDING') : 'UPCOMING'}`,
        to: `${isPending ? (datesCount > 0 ? 'AVAILABLE' : 'PENDING') : 'UPCOMING'}`,
        dates: `${oldDatesCount} → ${datesCount}`,
        hasDatesObject,
        signature: {
          old: lastBookingUpdateRef.current,
          new: newStateSignature
        }
      });

      lastBookingUpdateRef.current = newStateSignature;
      setSelectedBooking(updatedBooking);
    }
  }, [todayBookings, upcomingBookings, pastBookings, modalVisible, selectedBooking]);

  // ✅ Track recently added bookings (created within last 24 hours)
  useEffect(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const allBookings = [...(todayBookings || []), ...(upcomingBookings || [])];
    const recentIds = new Set<string>();

    allBookings.forEach(booking => {
      const createdAt = new Date(booking.createdAt);
      if (createdAt >= twentyFourHoursAgo) {
        recentIds.add(booking.id);
      }
    });

    setRecentlyAddedBookings(recentIds);
  }, [todayBookings, upcomingBookings]);

  // ==================== COMPUTED VALUES ====================

  const routeCoordinates = useMemo(
    () => todayBookings.map(b => b.coordinates).filter(Boolean) as { latitude: number; longitude: number }[],
    [todayBookings]
  );

  const listItems = useMemo((): GroupedListItem[] => {
    // Past Bookings renders as its own flat, category-filtered list (see
    // pastBookingsFiltered) rather than the always-grouped sections here.
    if (!activeFilters.has('all')) return [];
    const source = filteredUpcomingBookings;

    const categoryMap = new Map<string, ConfirmedBooking[]>();
    for (const b of source) {
      const cat = resolveServiceCategory(b.serviceName, b.providerService);
      const arr = categoryMap.get(cat) ?? [];
      arr.push(b);
      categoryMap.set(cat, arr);
    }

    const items: GroupedListItem[] = [];
    for (const [serviceType, bookings] of categoryMap) {
      items.push({ kind: 'category', serviceType, bookings });
    }
    return items;
  }, [activeFilters, filteredUpcomingBookings]);

  const virtualizedListRows = useMemo((): BookingsListRow[] => {
    let rows: BookingsListRow[] = [];
    if (activeFilters.has('past')) {
      rows = pastBookingsFiltered.map(booking => ({ kind: 'past-booking' as const, booking }));
    } else if (isFilterView) {
      rows = [...listItems];
    }
    if (waitlistEntries.length > 0) {
      rows.push({ kind: 'waitlist-header' });
      rows.push(...waitlistEntries.map(entry => ({ kind: 'waitlist' as const, entry })));
    }
    return rows;
  }, [activeFilters, isFilterView, listItems, pastBookingsFiltered, waitlistEntries]);

  // ✅ Check if booking has been rated or tipped
  const hasBookingBeenRated = useCallback((bookingId: string) => ratedBookings.has(bookingId), [ratedBookings]);
  const hasBookingBeenTipped = useCallback((bookingId: string) => tippedBookings.has(bookingId), [tippedBookings]);

  // Stable renderItem reference so the outer bookings FlatList doesn't hand a
  // brand-new function to every row on every parent re-render.
  const renderServiceCategoryRow = useCallback(({ item }: { item: { serviceType: string; bookings: ConfirmedBooking[] } }) => {
    const { serviceType, bookings } = item;
    const rowHasTag = bookings.some((b: ConfirmedBooking) => b.isPendingReschedule);

    return (
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
            <BookingCard
              booking={booking}
              onPress={handleBookingPress}
              isHighlighted={highlightedBookingId === booking.id}
              isRecentlyAdded={recentlyAddedBookings.has(booking.id)}
              actionCount={bookingActionItems[booking.id] ?? 0}
              rowHasTag={rowHasTag}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.serviceImagesContainer}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          windowSize={5}
          initialNumToRender={3}
          getItemLayout={(_data, index) => ({
            length: 160,
            offset: 160 * index,
            index,
          })}
        />
      </View>
    );
  }, [handleBookingPress, highlightedBookingId, recentlyAddedBookings, bookingActionItems, styles.serviceCategory, styles.serviceCategoryHeader, styles.serviceCategoryName, styles.serviceCategoryTag, styles.serviceImagesContainer]);

  // Single flat row for the Past Bookings list — no category header, since
  // grouping there is done via the filter button instead.
  const renderPastBookingRow = useCallback(({ item: booking }: { item: ConfirmedBooking }) => (
    <View style={styles.pastBookingRowWrap}>
      <BookingListRow
        booking={booking}
        onPress={handleBookingPress}
        isHighlighted={highlightedBookingId === booking.id}
        isRecentlyAdded={recentlyAddedBookings.has(booking.id)}
        actionCount={bookingActionItems[booking.id] ?? 0}
      />
    </View>
  ), [handleBookingPress, highlightedBookingId, recentlyAddedBookings, bookingActionItems, styles.pastBookingRowWrap]);

  const handleBookWaitlistEntry = useCallback((entry: WaitlistEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('ProviderProfile', { providerId: entry.provider_id });
  }, [navigation]);

  const handleLeaveWaitlistEntry = useCallback((entry: WaitlistEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    leaveWaitlist(entry.id).then(() => {
      setWaitlistEntries(prev => prev.filter(candidate => candidate.id !== entry.id));
    }).catch(() => {});
  }, []);

  const renderBookingsListRow = useCallback(({ item }: { item: BookingsListRow }) => {
    if (item.kind === 'category') return renderServiceCategoryRow({ item });
    if (item.kind === 'past-booking') return renderPastBookingRow({ item: item.booking });
    if (item.kind === 'waitlist-header') {
      return (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[styles.bookingsTitle, { marginTop: 24, marginBottom: 12 }]}>ON WAITLIST</Text>
        </View>
      );
    }
    return (
      <WaitlistCard
        entry={item.entry}
        onBook={handleBookWaitlistEntry}
        onLeave={handleLeaveWaitlistEntry}
      />
    );
  }, [handleBookWaitlistEntry, handleLeaveWaitlistEntry, renderServiceCategoryRow, renderPastBookingRow, styles.bookingsTitle]);

  const bookingListKeyExtractor = useCallback((item: BookingsListRow) => {
    if (item.kind === 'category') return `category-${item.serviceType}`;
    if (item.kind === 'past-booking') return `past-${item.booking.id}`;
    if (item.kind === 'waitlist-header') return 'waitlist-header';
    return `waitlist-${item.entry.id}`;
  }, []);

  // ==================== RENDER ====================

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {/* One vertical list owns scrolling. Booking-category and waitlist rows
            stay virtualized instead of being mounted inside a ScrollView. */}
        <FlatList
          ref={mainScrollRef}
          data={virtualizedListRows}
          keyExtractor={bookingListKeyExtractor}
          renderItem={renderBookingsListRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { flexGrow: 1, paddingBottom: isFilterView ? 120 : 40 }]}
          bounces={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={P.accent}
              colors={[P.accent]}
              progressBackgroundColor={P.surface}
              progressViewOffset={60}
            />
          }
          keyboardShouldPersistTaps="handled"
          // The list header owns a native MapView. Detaching that header on
          // Android can return a blank map when the user scrolls back, so row
          // virtualization stays enabled while native-view clipping does not.
          removeClippedSubviews={false}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          onScrollToIndexFailed={(info) => {
            logger.warn('Scroll to index failed:', info);
            mainScrollRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
          ListHeaderComponent={(
          <View style={styles.content}>
            {/* Refresh indicator — the native RefreshControl spinner sits behind
                the transparent header and is easy to miss, so mirror its state
                here in the always-visible content area just below the header. */}
            {refreshing && (
              <View style={styles.refreshIndicatorRow}>
                <ActivityIndicator size="small" color={P.accent} />
              </View>
            )}

            {/* Category Toggle */}
            <View style={styles.categoryContainer}>
              <SlidingTabs
                tabs={CATEGORY_TABS}
                activeKey={activeFilters.has('all') ? 'all' : activeFilters.has('past') ? 'past' : null}
                onPress={toggleFilter}
                accentColor={P.accent}
                activeTextColor={P.onAccent}
                inactiveTextColor={P.sub}
                inactiveBackgroundColor={P.surface}
                tabFontFamily="BakbakOne-Regular"
                centerContent
                equalWidth
                gap={16}
                springBounciness={0}
                springSpeed={14}
              />
            </View>
            {/* Tracking View */}
            {!isFilterView && (
              <>
                <View style={styles.mapContainer}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={{
                      latitude: currentBooking?.coordinates?.latitude ?? userLocation?.latitude ?? 51.5074,
                      longitude: currentBooking?.coordinates?.longitude ?? userLocation?.longitude ?? -0.1278,
                      latitudeDelta: 0.15,
                      longitudeDelta: 0.15,
                    }}
                    mapType="standard"
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                    showsCompass={false}
                    zoomEnabled={true}
                    scrollEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    {todayBookings.length > 0 && !allTodayBookingsCompleted ? (
                      <>
                        {todayBookings.filter(hasMapDestination).map(booking => (
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
                            strokeColor={P.accent}
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                          />
                        )}
                      </>
                    ) : (
                      <Marker
                        coordinate={{ latitude: userLocation?.latitude ?? 51.5074, longitude: userLocation?.longitude ?? -0.1278 }}
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
                        <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
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
                              onPress={() => booking.coordinates && focusMapOnLocation(booking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {booking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {formatBookingDate(booking.bookingDate)} • {booking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {booking.providerName} - {booking.status.replace('_', ' ')}
                                    </Text>
                                    <Text style={styles.appointmentAddress}>
                                      {bookingLocationLine(booking)}
                                    </Text>
                                  </View>
                                  <View style={styles.actionButtons}>
                                    <TouchableOpacity
                                      style={[
                                        styles.rateButton,
                                        hasBookingBeenRated(booking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                            <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
                              <Text style={styles.upcomingLabelText}>UPCOMING</Text>
                            </BlurView>
                            <TouchableOpacity
                              style={styles.appointmentCard}
                              onPress={() => focusMapOnLocation(currentBooking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {currentBooking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {formatBookingDate(currentBooking.bookingDate)} • {currentBooking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {currentBooking.providerName} - {currentBooking.status.replace('_', ' ')}
                                    </Text>
                                    <Text style={styles.appointmentAddress}>
                                      {bookingLocationLine(currentBooking)}
                                    </Text>
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
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                                        {hasMapDestination(currentBooking) && (
                                          <TouchableOpacity
                                            style={styles.directionsButton}
                                            onPress={() => openInMaps(currentBooking)}
                                          >
                                            <Text style={styles.buttonText}>Directions</Text>
                                          </TouchableOpacity>
                                        )}
                                        {isMessagingAvailable(currentBooking.bookingDate) && (
                                          <TouchableOpacity
                                            style={styles.messageButton}
                                            onPress={() => openContactSheet(currentBooking)}
                                          >
                                            <Text style={styles.buttonText}>Contact</Text>
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
                            <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
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
                                  <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                    <View style={styles.cardContent}>
                                      <View style={styles.appointmentInfo}>
                                        <Text style={styles.nextAppointmentService}>
                                          {booking.serviceName}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {formatBookingDate(booking.bookingDate)} • {booking.bookingTime}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {booking.providerName} - {booking.duration}
                                        </Text>
                                        <Text style={styles.nextAppointmentAddress}>
                                          {bookingLocationLine(booking)}
                                        </Text>
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
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                                            {hasMapDestination(booking) && (
                                              <TouchableOpacity
                                                style={styles.directionsButton}
                                                onPress={() => openInMaps(booking)}
                                              >
                                                <Text style={styles.buttonText}>Directions</Text>
                                              </TouchableOpacity>
                                            )}
                                            {isMessagingAvailable(booking.bookingDate) && (
                                              <TouchableOpacity
                                                style={styles.messageButton}
                                                onPress={() => openContactSheet(booking)}
                                              >
                                                <Text style={styles.buttonText}>Contact</Text>
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
                      View Upcoming to see your next appointments
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* All/Past Bookings View */}
            {isFilterView && (
              <View style={styles.bookingsContainer}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setActiveFilters(new Set());
                  }}
                  style={styles.backToTrackingButton}
                >
                  <Text style={styles.backToTrackingText}>← Back to Tracking</Text>
                </TouchableOpacity>
                {activeFilters.has('past') && pastCategories.length > 0 && (
                  <View style={styles.pastFilterSection}>
                    <TouchableOpacity
                      ref={pastFilterButtonRef}
                      style={[styles.pastFilterButton, { backgroundColor: P.surface, borderColor: P.border }]}
                      onPress={openPastFilterMenu}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="filter-outline" size={14} color={P.text} />
                      <Text style={[styles.pastFilterButtonText, { color: P.text }]} numberOfLines={1}>
                        {pastCategoryFilter ? pastCategoryFilter.charAt(0) + pastCategoryFilter.slice(1).toLowerCase() : 'All categories'}
                      </Text>
                      <Ionicons name={pastFilterOpen ? 'chevron-up' : 'chevron-down'} size={14} color={P.sub} />
                    </TouchableOpacity>
                  </View>
                )}
                <Modal visible={pastFilterOpen} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setPastFilterOpen(false)}>
                  <Pressable style={styles.pastFilterScrim} onPress={() => setPastFilterOpen(false)}>
                    {pastFilterAnchor && (
                      <Pressable
                        onPress={e => e.stopPropagation()}
                        style={[
                          styles.pastFilterDropdown,
                          {
                            backgroundColor: P.card,
                            borderColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
                            top: pastFilterAnchor.y + pastFilterAnchor.height + 6,
                            right: screenWidth - (pastFilterAnchor.x + pastFilterAnchor.width),
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.pastFilterOption}
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setPastCategoryFilter(null);
                            setPastFilterOpen(false);
                          }}
                        >
                          <Text style={[styles.pastFilterOptionText, { color: !pastCategoryFilter ? P.accent : P.text, fontWeight: !pastCategoryFilter ? '700' : '500' }]}>
                            All
                          </Text>
                          {!pastCategoryFilter && <Ionicons name="checkmark" size={16} color={P.accent} />}
                        </TouchableOpacity>
                        {pastCategories.map(cat => {
                          const isActive = pastCategoryFilter === cat;
                          return (
                            <TouchableOpacity
                              key={cat}
                              style={[styles.pastFilterOption, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
                              activeOpacity={0.7}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setPastCategoryFilter(cat);
                                setPastFilterOpen(false);
                              }}
                            >
                              <Text style={[styles.pastFilterOptionText, { color: isActive ? P.accent : P.text, fontWeight: isActive ? '700' : '500' }]}>
                                {cat.charAt(0) + cat.slice(1).toLowerCase()}
                              </Text>
                              {isActive && <Ionicons name="checkmark" size={16} color={P.accent} />}
                            </TouchableOpacity>
                          );
                        })}
                      </Pressable>
                    )}
                  </Pressable>
                </Modal>
                {bookingsError && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(244, 67, 54, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(244, 67, 54, 0.3)',
                    borderRadius: 12,
                    marginHorizontal: 4,
                    marginBottom: 12,
                    marginTop: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}>
                    <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: '500', flex: 1 }}>
                      {retrying ? 'Reloading bookings...' : bookingsError}
                    </Text>
                    {retrying ? (
                      <ActivityIndicator size="small" color="#D32F2F" style={{ marginLeft: 12 }} />
                    ) : (
                      <TouchableOpacity onPress={retryLoadBookings}>
                        <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: 'bold', marginLeft: 12 }}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {(activeFilters.has('past') ? pastBookingsFiltered.length === 0 : listItems.length === 0) ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      {activeFilters.has('past')
                        ? (pastCategoryFilter ? `No ${pastCategoryFilter.toLowerCase()} bookings` : 'No past bookings')
                        : 'No upcoming bookings'}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
          )}
        />

        {/* ─── Contact Sheet ─── */}
        <Modal visible={contactSheetVisible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setContactSheetVisible(false)}>
          <Pressable style={csSt.overlay} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setContactSheetVisible(false); }}>
            <Pressable style={[csSt.sheet, { backgroundColor: P.card }]} onPress={e => e.stopPropagation()}>
              <View style={[csSt.handle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]} />
              <Text style={[csSt.title, { color: P.text }]}>Contact {contactSheetBooking?.providerName}</Text>
              <Text style={[csSt.subtitle, { color: '#7E6667' }]}>Choose how you'd like to get in touch</Text>
              {contactSheetLoading ? <ActivityIndicator color={P.accent} style={{ marginVertical: 24 }} /> : (
                <View style={csSt.options}>
                  <TouchableOpacity
                    style={[csSt.option, { backgroundColor: P.surface }]}
                    activeOpacity={0.7}
                    onPress={() => { setContactSheetVisible(false); if (contactSheetBooking) openProviderChat(contactSheetBooking); }}
                  >
                    <View style={[csSt.optionIcon, { backgroundColor: '#5B1E32' }]}><Text style={csSt.optionEmoji}>💬</Text></View>
                    <View style={csSt.optionText}>
                      <Text style={[csSt.optionLabel, { color: P.text }]}>In-app message</Text>
                      <Text style={[csSt.optionDesc, { color: '#7E6667' }]}>Chat directly inside Cerviced</Text>
                    </View>
                    <Text style={[csSt.optionChevron, { color: P.sub }]}>›</Text>
                  </TouchableOpacity>
                  {contactSheetInfo?.preferred_contact_methods?.includes('email') && contactSheetInfo.email && (
                    <TouchableOpacity
                      style={[csSt.option, { backgroundColor: P.surface }]}
                      activeOpacity={0.7}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setContactSheetVisible(false); Linking.openURL(`mailto:${contactSheetInfo!.email}`); }}
                    >
                      <View style={[csSt.optionIcon, { backgroundColor: '#1C3A5B' }]}><Text style={csSt.optionEmoji}>✉️</Text></View>
                      <View style={csSt.optionText}>
                        <Text style={[csSt.optionLabel, { color: P.text }]}>Email</Text>
                        <Text style={[csSt.optionDesc, { color: '#7E6667' }]} numberOfLines={1}>{contactSheetInfo.email}</Text>
                      </View>
                      <Text style={[csSt.optionChevron, { color: P.sub }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {contactSheetInfo?.preferred_contact_methods?.includes('whatsapp') && contactSheetInfo.whatsapp_number && (
                    <TouchableOpacity
                      style={[csSt.option, { backgroundColor: P.surface }]}
                      activeOpacity={0.7}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setContactSheetVisible(false); Linking.openURL(`https://wa.me/${contactSheetInfo!.whatsapp_number!.replace(/\D/g, '')}`); }}
                    >
                      <View style={[csSt.optionIcon, { backgroundColor: '#1A3D2B' }]}><Text style={csSt.optionEmoji}>💚</Text></View>
                      <View style={csSt.optionText}>
                        <Text style={[csSt.optionLabel, { color: P.text }]}>WhatsApp</Text>
                        <Text style={[csSt.optionDesc, { color: '#7E6667' }]}>{contactSheetInfo.whatsapp_number}</Text>
                      </View>
                      <Text style={[csSt.optionChevron, { color: P.sub }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {contactSheetInfo?.preferred_contact_methods?.includes('phone') && contactSheetInfo.phone && (
                    <TouchableOpacity
                      style={[csSt.option, { backgroundColor: P.surface }]}
                      activeOpacity={0.7}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setContactSheetVisible(false); Linking.openURL(`tel:${contactSheetInfo!.phone}`); }}
                    >
                      <View style={[csSt.optionIcon, { backgroundColor: '#2B2B1A' }]}><Text style={csSt.optionEmoji}>📞</Text></View>
                      <View style={csSt.optionText}>
                        <Text style={[csSt.optionLabel, { color: P.text }]}>Phone call</Text>
                        <Text style={[csSt.optionDesc, { color: '#7E6667' }]}>{contactSheetInfo.phone}</Text>
                      </View>
                      <Text style={[csSt.optionChevron, { color: P.sub }]}>›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={{ height: 10 }} />
            </Pressable>
          </Pressable>
        </Modal>

        {/* ─── Rebook add-ons confirm — the original booking had add-ons, so
            ask whether to carry them into the new one. This modal was
            previously missing entirely: handleRebook flipped
            showRebookAddOnsModal to true but nothing rendered it, so "Book
            Again" on any booking with add-ons was a silent dead end.
            Centered popup card (not a slide-up sheet) to match the rest of
            the booking-detail confirmation dialogs, no emoji icons. ─── */}
        <Modal visible={showRebookAddOnsModal} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShowRebookAddOnsModal(false)}>
          <View style={popSt.overlay}>
            <View style={[popSt.sheetContent, { backgroundColor: P.card }]}>
              <Text style={[popSt.sheetTitle, { color: P.text }]}>Include Add-Ons?</Text>
              <Text style={[popSt.sheetSub, { color: P.sub }]}>
                Would you like to include the same add-ons from your previous booking?
              </Text>
              {selectedBooking?.addOns?.map((a, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: P.text }}>• {a.name}</Text>
                  <Text style={{ color: P.sub }}>+£{a.price.toFixed(2)}</Text>
                </View>
              ))}
              <View style={[popSt.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: P.surface, borderColor: P.border }]} onPress={() => confirmRebook('without')} activeOpacity={0.7}>
                  <Text style={{ color: P.text }}>Without Add-Ons</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: P.accent }]} onPress={() => confirmRebook('with')} activeOpacity={0.7}>
                  <Text style={{ color: P.onAccent, fontWeight: '600' }}>With Add-Ons</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── Success / Notice Modal — drives every setShowSuccessModal(true)
            call in this screen (Book Again confirmations, tip sent, rating
            thanks, etc). This state existed and was set all over the file but
            nothing ever rendered it, so those confirmations were silently
            invisible. ─── */}
        <Modal visible={showSuccessModal} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent
          onRequestClose={() => { setShowSuccessModal(false); if (shouldNavigateToCart) { setShouldNavigateToCart(false); navigation.getParent()?.navigate('Cart' as never); } }}>
          <View style={popSt.overlay}>
            <View style={[popSt.sheetContent, { backgroundColor: P.card }]}>
              <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>{successIcon}</Text>
              <Text style={[popSt.sheetTitle, { color: P.text }]}>{successIcon === '✓' ? 'Success!' : 'Notice'}</Text>
              <Text style={[popSt.sheetSub, { color: P.sub }]}>{successMessage}</Text>
              <View style={[popSt.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: P.accent }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowSuccessModal(false); if (shouldNavigateToCart) { setShouldNavigateToCart(false); navigation.getParent()?.navigate('Cart' as never); } }} activeOpacity={0.7}>
                  <Text style={{ color: P.onAccent, fontWeight: '600', textAlign: 'center' }}>Got It</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── Waitlist Hold Modal — a time-boxed slot reserved via
            invite_next_waitlist_entry() (waitlist_holds.sql). Fetched
            directly by id (see the route-params effect above) since it's
            deliberately excluded from the normal bookings lists. ─── */}
        <Modal visible={!!waitlistHold} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => setWaitlistHold(null)}>
          <View style={popSt.overlay}>
            <View style={[popSt.sheetContent, { backgroundColor: P.card }]}>
              <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>⏳</Text>
              <Text style={[popSt.sheetTitle, { color: P.text }]}>A Slot Opened Up!</Text>
              {waitlistHold && (
                <Text style={[popSt.sheetSub, { color: P.sub }]}>
                  {waitlistHold.service_name_snapshot} with {waitlistHold.provider_name_snapshot}{'\n'}
                  {formatLongDate(waitlistHold.booking_date)}
                  {' at '}
                  {formatTime12(waitlistHold.booking_time)}
                  {'\n\n'}This is held just for you — it'll be released to the next person if you don't respond in time.
                </Text>
              )}
              <View style={[popSt.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[popSt.sheetBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  onPress={handleDeclineWaitlistHold}
                  disabled={waitlistHoldBusy}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: P.text, fontWeight: '600', textAlign: 'center' }}>Not This Time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[popSt.sheetBtn, { backgroundColor: P.accent }]}
                  onPress={handleConfirmWaitlistHold}
                  disabled={waitlistHoldBusy}
                  activeOpacity={0.7}
                >
                  {waitlistHoldBusy ? (
                    <ActivityIndicator color={P.onAccent} size="small" />
                  ) : (
                    <Text style={{ color: P.onAccent, fontWeight: '600', textAlign: 'center' }}>Confirm This Slot</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ─── Rating Modal — the "Rate" button on the Today map view set
            showRatingModal/rating/reviewText but nothing rendered a modal, so
            tapping Rate did nothing visible. handleRatingSubmit already wired
            up a real submitReview() call; only the UI was missing. ─── */}
        <Modal visible={showRatingModal} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => { setShowRatingModal(false); setRating(0); setReviewText(''); }}>
          <KeyboardDismissView style={popSt.overlay} dismissOnTap>
            <View style={[popSt.sheetContent, { backgroundColor: P.card }]}>
                {!hasRated ? (
                  <>
                    <Text style={[popSt.sheetTitle, { color: P.text }]}>Rate Your Experience</Text>
                    <Text style={[popSt.sheetSub, { color: P.sub }]}>
                      How was your appointment with {selectedBooking?.providerName}?
                    </Text>
                    <View style={styles.starContainer}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <TouchableOpacity key={s} style={styles.starButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRating(s); }}>
                          <Text style={[styles.starText, s <= rating && styles.starTextActive]}>★</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.reviewInputContainer}>
                      <TextInput
                        style={styles.reviewInput}
                        multiline numberOfLines={3} placeholder="Share your experience (optional)"
                        placeholderTextColor={P.sub}
                        value={reviewText} onChangeText={setReviewText} maxLength={500}
                      />
                      <Text style={styles.characterCount}>{reviewText.length}/500</Text>
                    </View>
                    <View style={popSt.sheetBtns}>
                      <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: P.surface, borderColor: P.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowRatingModal(false); setRating(0); setReviewText(''); }} activeOpacity={0.7}>
                        <Text style={{ color: P.text }}>Skip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: rating === 0 ? (isDarkMode ? '#3A3A3C' : '#E0E0E0') : P.accent }]} disabled={rating === 0 || isLoading} onPress={handleRatingSubmit} activeOpacity={0.7}>
                        {isLoading ? <ActivityIndicator size="small" color={P.onAccent} /> : <Text style={{ color: P.onAccent, fontWeight: '600' }}>Submit</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>✓</Text>
                    <Text style={[popSt.sheetTitle, { color: P.text }]}>Thanks!</Text>
                    <Text style={[popSt.sheetSub, { color: P.sub }]}>Your feedback helps improve our services.</Text>
                  </>
                )}
              </View>
          </KeyboardDismissView>
        </Modal>

        {/* ─── Tip Modal — same dead-state issue as Rating above. handleTipSubmit
            now actually persists via setBookingTip() instead of only flipping
            local state. ─── */}
        <Modal visible={showTipModal} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => { setShowTipModal(false); setTipAmount(0); }}>
          <KeyboardDismissView style={popSt.overlay} dismissOnTap>
            <View style={[popSt.sheetContent, { backgroundColor: P.card }]}>
                <Text style={[popSt.sheetTitle, { color: P.text }]}>Leave a Tip</Text>
                <Text style={[popSt.sheetSub, { color: P.sub }]}>
                  Show your appreciation for {selectedBooking?.providerName}
                </Text>
                <View style={styles.tipContainer}>
                  <View style={styles.tipQuickButtons}>
                    {[5, 10, 15, 20].map(amt => (
                      <TouchableOpacity key={amt} style={[styles.tipQuickButton, tipAmount === amt && styles.tipQuickButtonActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setTipAmount(amt); }} activeOpacity={0.7}>
                        <Text style={[styles.tipQuickButtonText, tipAmount === amt && styles.tipQuickButtonTextActive]}>£{amt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.tipCustomContainer}>
                    <Text style={styles.tipCustomLabel}>Custom amount</Text>
                    <View style={styles.tipInputWrapper}>
                      <Text style={styles.tipCurrencySymbol}>£</Text>
                      <TextInput
                        style={styles.tipInput} keyboardType="decimal-pad" placeholder="0.00"
                        placeholderTextColor={P.sub}
                        value={tipAmount > 0 ? tipAmount.toString() : ''}
                        onChangeText={t => setTipAmount(isNaN(parseFloat(t)) ? 0 : parseFloat(t))}
                      />
                    </View>
                  </View>
                </View>
                <View style={popSt.sheetBtns}>
                  <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: P.surface, borderColor: P.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowTipModal(false); setTipAmount(0); }} activeOpacity={0.7}>
                    <Text style={{ color: P.text }}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[popSt.sheetBtn, { backgroundColor: tipAmount <= 0 ? (isDarkMode ? '#3A3A3C' : '#E0E0E0') : P.accent }]} disabled={tipAmount <= 0 || isLoading} onPress={handleTipSubmit} activeOpacity={0.7}>
                    {isLoading ? <ActivityIndicator size="small" color={P.onAccent} /> : <Text style={{ color: P.onAccent, fontWeight: '600' }}>Send Tip</Text>}
                  </TouchableOpacity>
                </View>
              </View>
          </KeyboardDismissView>
        </Modal>

      </SafeAreaView>
    </ThemedBackground>
  );
}
// ==================== STYLES ====================

const createStyles = (
  theme: Theme,
  isDarkMode: boolean,
  P: AppTheme,
  screenWidth: number,
  screenHeight: number,
) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingTop: 150,
  },
  refreshIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginBottom: 12,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 1,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    color: theme.text,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: theme.secondaryText,
    textAlign: 'center',
  },
  categoryContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 32,
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
    backgroundColor: P.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: P.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  activeServiceMarker: {
    borderColor: P.accent,
    borderWidth: 3,
  },
  markerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: P.text,
    letterSpacing: 1,
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    color: P.sub,
    fontWeight: '600',
  },
  activeServiceLabel: {
    color: P.accentText,
  },
  activeMarkerDot: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 12,
    height: 12,
    backgroundColor: P.accent,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: isDarkMode ? '#201D1A' : '#fff',
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: P.accentText,
    letterSpacing: 1,
    fontWeight: '800',
  },
  nextLabelText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: P.text,
    letterSpacing: 1,
    fontWeight: '800',
  },
  congratsLabelText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: P.text,
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
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    flexDirection: 'column',
    gap: 16,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentService: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: P.text,
    marginBottom: 4,
    letterSpacing: 0.5,
    fontWeight: 'bold',
  },
  appointmentProvider: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: P.sub,
    marginBottom: 4,
    fontWeight: '600',
  },
  appointmentAddress: {
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '400',
    fontSize: 12,
    color: P.accentText,
    fontStyle: 'italic',
  },
  nextAppointmentService: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: P.text,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  nextAppointmentProvider: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: P.sub,
    marginBottom: 4,
    fontWeight: '600',
  },
  nextAppointmentAddress: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: P.sub,
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
    backgroundColor: P.accentDim,
    borderColor: P.accent,
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
    backgroundColor: isDarkMode ? '#48484A' : '#E0E0E0',
  },
  buttonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    color: P.text,
    fontWeight: 'bold',
  },
  buttonTextWhite: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 9,
    color: P.text,
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '800',
  },
  bookingsTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    color: P.text,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
    fontWeight: '800',
  },
  serviceCategory: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  serviceCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceCategoryTag: {
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  serviceCategoryName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    color: isDarkMode ? '#000' : '#fff',
    letterSpacing: 1,
  },
  serviceImagesContainer: {
    gap: 8,
  },
  pastBookingRowWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pastFilterSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  pastFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pastFilterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 160,
  },
  pastFilterScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pastFilterDropdown: {
    position: 'absolute',
    minWidth: 170,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  pastFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  pastFilterOptionText: {
    fontSize: 14,
  },
  emptyState: {
    // Not flex: 1 — this View sits inside a ScrollView's content (itself
    // flex: 1, height driven by content not viewport), so a flexed child
    // here has nothing real to grow against and can render at zero height,
    // silently hiding the text inside it.
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    color: P.sub,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: P.sub,
    textAlign: 'center',
  },
  flatListContent: {
    paddingBottom: 20
  },
  modalBackdrop: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)',
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
    backgroundColor: isDarkMode ? 'rgba(28, 28, 30, 0.95)' : '#FFFFFF'
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
    borderBottomColor: P.border,
  },
  modalProviderImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: P.accent,
  },
  modalProviderName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: P.text,
    marginBottom: 8
  },
  modalServiceTypeBadge: {
    backgroundColor: P.accentDim,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.accent,
  },
  modalServiceTypeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: P.accentText,
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
    borderBottomColor: P.border
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: P.sub,
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
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
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
    color: P.sub,
    flex: 1
  },
  modalValue: {
    fontSize: 13,
    color: P.text,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  modalTimeValue: {
    fontSize: 13,
    color: P.text,
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
    color: P.sub,
    fontStyle: 'italic'
  },
  modalPriceValueBlack: {
    fontSize: 16,
    color: P.text,
    fontWeight: 'bold'
  },
  modalDescriptionSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  modalDescriptionLabel: {
    fontSize: 12,
    color: P.sub,
    marginBottom: 6
  },
  modalDescriptionText: {
    fontSize: 12,
    color: P.text,
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
    color: P.text,
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
    color: P.text,
    fontWeight: 'bold'
  },
  modalTotalValueSmall: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold'
  },
  modalPaymentCardGrey: {
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
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
    color: P.sub
  },
  modalPaymentValueCompact: {
    fontSize: 12,
    color: P.text,
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
    borderTopColor: P.border,
  },
  modalRemainingBalanceLabelGrey: {
    fontSize: 13,
    color: P.text,
    fontWeight: 'bold'
  },
  modalRemainingBalanceValueGrey: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold'
  },
  fullyPaidBadge: {
    backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#E8F5E9',
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
    color: P.text,
    lineHeight: 18
  },
  modalInstructionsCard: {
    backgroundColor: P.accentDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: P.accent,
  },
  modalInstructionsText: {
    fontSize: 12,
    color: P.text,
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
    backgroundColor: isDarkMode ? 'rgba(255, 152, 0, 0.1)' : '#FFF3E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255, 152, 0, 0.3)' : '#FFE0B2',
  },
  modalLockedText: {
    color: '#E65100',
    fontSize: 12,
    fontStyle: 'italic'
  },
  modalAddressText: {
    fontSize: 14,
    color: P.text,
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
    backgroundColor: P.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalActionButtonText: {
    color: P.onAccent,
    fontSize: 14,
    fontWeight: 'bold'
  },
  rebookButtonModal: {
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rebookButtonTextModal: {
    color: isDarkMode ? '#000' : '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completedActionButton: {
    flex: 1,
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 44,
  },
  completedActionText: {
    color: isDarkMode ? '#000' : '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalRateButton: {
    flex: 1,
    backgroundColor: P.accentDim,
    borderColor: P.accent,
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: P.text,
    fontWeight: 'bold',
  },
  modalBottomSpace: {
    height: 20
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: P.border,
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
    backgroundColor: P.surface,
    borderRadius: 20,
    borderColor: P.border,
    borderWidth: 1,
  },
  viewReceiptButtonActive: {
    backgroundColor: '#4CAF50'
  },
  viewReceiptButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.text
  },
  viewReceiptButtonTextActive: {
    color: '#FFF'
  },
  receiptContainer: {
    marginTop: 12,
    backgroundColor: P.surface,
    borderRadius: 8,
    padding: 12
  },
  receiptPaper: {
    backgroundColor: P.card,
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.border,
    borderStyle: 'dashed',
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  receiptHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: P.text,
    letterSpacing: 1,
  },
  receiptShareBtn: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptShareIcon: {
    fontSize: 14,
    color: P.text,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: isDarkMode ? '#48484A' : '#E0E0E0',
    marginVertical: 10
  },
  receiptSection: {
    marginVertical: 5
  },
  receiptSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: P.sub,
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
    color: P.sub,
    flex: 1
  },
  receiptValue: {
    fontSize: 12,
    color: P.text,
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
    color: P.text
  },
  receiptTotalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: P.text
  },
  receiptBalanceRow: {
    marginTop: 5
  },
  receiptBalanceLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: P.text
  },
  receiptBalanceValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: P.text
  },
  receiptBalanceValueOrange: {
    color: '#FF9800'
  },
  receiptFullyPaidBadge: {
    backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#E8F5E9',
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
    color: P.sub,
    marginBottom: 2
  },
  receiptDate: {
    fontSize: 10,
    color: P.sub
  },
  rescheduleModalOverlay: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)',
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
    backgroundColor: isDarkMode ? 'rgba(28, 28, 30, 0.95)' : '#FFFFFF'
  },
  rescheduleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: P.text,
  },
  rescheduleSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: P.sub,
    lineHeight: 20,
  },
  dateSuggestions: {
    marginBottom: 24,
  },
  dateSuggestionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateSuggestionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    borderRadius: 20,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSuggestionActive: {
    backgroundColor: P.accentDim,
    borderColor: P.accent
  },
  dateSuggestionText: {
    fontSize: 14,
    color: P.sub
  },
  dateSuggestionTextActive: {
    color: P.accentText,
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
    backgroundColor: P.surface,
    alignItems: 'center',
  },
  cancelRescheduleText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.sub
  },
  confirmRescheduleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: P.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmRescheduleButtonDisabled: {
    backgroundColor: isDarkMode ? '#48484A' : '#CCCCCC'
  },
  confirmRescheduleText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.onAccent
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
    color: P.sub,
  },
  starTextActive: {
    color: '#FFB300',
  },
  reviewInputContainer: {
    marginBottom: 20,
  },
  reviewInputLabel: {
    fontSize: 13,
    color: P.sub,
    marginBottom: 8,
    fontWeight: '600',
  },
  reviewInput: {
    backgroundColor: P.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: P.text,
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: P.border,
  },
  characterCount: {
    fontSize: 11,
    color: P.sub,
    textAlign: 'right',
    marginTop: 4,
  },
  rescheduleStatusCard: {
    backgroundColor: P.accentDim,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: P.accent,
  },
  rescheduleStatusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: P.accentText,
    marginBottom: 8,
    textAlign: 'center',
  },
  rescheduleStatusText: {
    fontSize: 14,
    color: P.sub,
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
    backgroundColor: P.accentDim,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.accent,
  },
  dateOptionDate: {
    fontSize: 15,
    fontWeight: 'bold',
    color: P.text,
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
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    minWidth: 80,
    alignItems: 'center',
  },
  timeSlotChipActive: {
    backgroundColor: P.accent,
    borderColor: P.accent,
  },
  timeSlotText: {
    fontSize: 13,
    color: P.sub,
    fontWeight: '600',
  },
  timeSlotTextActive: {
    color: P.onAccent,
    fontWeight: 'bold',
  },
  purpleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: P.accent,
  },
  modalValueWithIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-start',
  },
  rescheduledBadge: {
    backgroundColor: P.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.accent,
    marginRight: 5,
  },
  rescheduledBadgeText: {
    fontSize: 9,
    color: P.accentText,
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
    color: P.text,
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
    backgroundColor: P.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    minWidth: 70,
    alignItems: 'center',
  },
  tipQuickButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  tipQuickButtonText: {
    fontSize: 16,
    color: P.sub,
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
    color: P.sub,
    marginBottom: 8,
    fontWeight: '600',
  },
  tipInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 12,
  },
  tipCurrencySymbol: {
    fontSize: 18,
    color: P.text,
    fontWeight: 'bold',
    marginRight: 8,
  },
  tipInput: {
    flex: 1,
    fontSize: 18,
    color: P.text,
    paddingVertical: 12,
    fontWeight: 'bold',
  },

// ✅ iMESSAGE CHAT STYLES - ADD ALL OF THESE:
chatContainer: {
  flex: 1,
  backgroundColor: P.card,
},
chatHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: P.card,
  borderBottomWidth: 1,
  borderBottomColor: P.border,
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
  borderColor: P.border,
},
chatHeaderInfo: {
  alignItems: 'center',
},
chatProviderName: {
  fontSize: 15,
  fontWeight: '600',
  color: P.text,
},
chatAppointmentInfo: {
  fontSize: 11,
  color: P.sub,
  marginTop: 2,
},
chatHeaderSpacer: {
  width: 60,
},
chatMessagesContainer: {
  flex: 1,
  backgroundColor: P.card,
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
  backgroundColor: P.surface,
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
  color: P.text,
  marginBottom: 8,
},
chatEmptySubtitle: {
  fontSize: 14,
  color: P.sub,
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
  borderColor: P.border,
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
  backgroundColor: isDarkMode ? '#3A3A3C' : '#E9E9EB',
  borderBottomLeftRadius: 4,
},
chatMessageBubbleUser: {
  backgroundColor: '#007AFF',
  borderBottomRightRadius: 4,
},
chatMessageText: {
  fontSize: 15,
  color: P.text,
  lineHeight: 20,
},
chatMessageTextUser: {
  color: '#FFF',
},
chatMessageTime: {
  fontSize: 11,
  color: P.sub,
  marginTop: 4,
},
chatMessageTimeUser: {
  color: 'rgba(255, 255, 255, 0.7)',
},
chatInputContainer: {
  backgroundColor: P.card,
  borderTopWidth: 1,
  borderTopColor: P.border,
  paddingHorizontal: 12,
  paddingVertical: 8,
},
chatInputWrapper: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
  backgroundColor: P.card,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: P.border,
  paddingHorizontal: 12,
  paddingVertical: 6,
},
chatInput: {
  flex: 1,
  fontSize: 16,
  color: P.text,
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
  backgroundColor: isDarkMode ? '#48484A' : '#C7C7CC',
},
chatSendButtonText: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '600',
},
// ==================== REDESIGNED MESSAGE MODAL STYLES ====================
msgModalContainer: {
  flex: 1,
},
msgModalPanel: {
  flex: 1,
  backgroundColor: P.bg,
  paddingTop: Platform.OS === 'ios' ? 54 : 30,
},
msgHeaderBar: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: P.border,
  backgroundColor: isDarkMode ? 'rgba(28,28,30,0.95)' : 'rgba(255,255,255,0.95)',
},
msgBackButton: {
  width: 36,
  height: 36,
  alignItems: 'center',
  justifyContent: 'center',
},
msgBackArrow: {
  fontSize: 32,
  fontWeight: '300',
  color: P.accentText,
  marginTop: -2,
},
msgHeaderCenter: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
msgAvatarWrapper: {
  position: 'relative',
  marginBottom: 4,
},
msgAvatar: {
  width: 36,
  height: 36,
  borderRadius: 18,
},
msgAvatarFallback: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: P.accent,
  alignItems: 'center',
  justifyContent: 'center',
},
msgAvatarInitial: {
  color: P.onAccent,
  fontSize: 16,
  fontWeight: '700',
},
msgOnlineDot: {
  position: 'absolute',
  bottom: 0,
  right: -1,
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: '#34C759',
  borderWidth: 2,
  borderColor: isDarkMode ? '#000' : '#FFF',
},
msgHeaderName: {
  fontSize: 14,
  fontWeight: '600',
  color: P.text,
},
msgHeaderStatus: {
  fontSize: 11,
  color: P.sub,
  marginTop: 1,
},
msgHeaderSpacer: {
  width: 36,
},
msgChatArea: {
  flex: 1,
  backgroundColor: P.bg,
},
msgChatContent: {
  paddingHorizontal: 16,
  paddingTop: 16,
  paddingBottom: 12,
},
msgEmptyState: {
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 80,
  paddingHorizontal: 40,
},
msgEmptyIconCircle: {
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: isDarkMode ? 'rgba(200,80,200,0.15)' : 'rgba(200,80,200,0.1)',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
},
msgEmptyIcon: {
  fontSize: 32,
},
msgEmptyTitle: {
  fontSize: 18,
  fontWeight: '600',
  color: P.text,
  marginBottom: 8,
},
msgEmptySubtitle: {
  fontSize: 14,
  color: P.sub,
  textAlign: 'center',
  lineHeight: 20,
},
msgTimeDivider: {
  textAlign: 'center',
  fontSize: 12,
  color: P.sub,
  marginVertical: 12,
  fontWeight: '500',
},
msgBubble: {
  maxWidth: '78%',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 20,
  marginBottom: 6,
},
msgBubbleUser: {
  alignSelf: 'flex-end',
  backgroundColor: P.accent,
  borderBottomRightRadius: 6,
},
msgBubbleProvider: {
  alignSelf: 'flex-start',
  backgroundColor: P.card,
  borderBottomLeftRadius: 6,
  ...(isDarkMode ? {} : {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  }),
},
msgBubbleText: {
  fontSize: 16,
  lineHeight: 22,
},
msgInputBar: {
  paddingHorizontal: 12,
  paddingTop: 10,
  paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: P.border,
  backgroundColor: isDarkMode ? 'rgba(28,28,30,0.98)' : '#FFFFFF',
},
msgInputRow: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
},
msgTextInput: {
  flex: 1,
  backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : '#F2F2F7',
  borderRadius: 22,
  paddingHorizontal: 18,
  paddingTop: 10,
  paddingBottom: 10,
  fontSize: 16,
  color: P.text,
  maxHeight: 100,
  minHeight: 40,
},
msgSendCircle: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: P.accent,
  alignItems: 'center',
  justifyContent: 'center',
},
msgSendCircleDisabled: {
  backgroundColor: isDarkMode ? '#3A3A3C' : '#D1D1D6',
},
msgSendArrow: {
  color: P.onAccent,
  fontSize: 20,
  fontWeight: '700',
  marginTop: -1,
},

// ── Intake form to-do card ──
intakeFormTodo: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  backgroundColor: 'rgba(163,66,195,0.10)',
  borderWidth: 1.5,
  borderColor: 'rgba(163,66,195,0.35)',
  borderRadius: 14,
  padding: 14,
},
intakeFormTodoIcon: {
  width: 40, height: 40, borderRadius: 20,
  backgroundColor: 'rgba(163,66,195,0.15)',
  alignItems: 'center', justifyContent: 'center',
},
intakeFormTodoTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: P.accentText,
  marginBottom: 3,
},
intakeFormTodoSub: {
  fontSize: 12,
  color: P.accentText,
  opacity: 0.75,
  lineHeight: 17,
},
intakeFormTodoBadge: {
  backgroundColor: P.accent,
  borderRadius: 6,
  paddingHorizontal: 7,
  paddingVertical: 3,
},
intakeFormTodoBadgeText: {
  color: P.onAccent,
  fontSize: 10,
  fontWeight: '800',
  letterSpacing: 0.3,
},

// ── Group Booking Card ───────────────────────────────────────────────────────
});

// ── Contact Sheet Styles ──────────────────────────────────────────────────────
// Layout only — colors are theme-dependent and applied at the call site via
// isDarkMode-branched overrides, same pattern as popSt below.
const csSt = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', paddingBottom: BOTTOM_SAFE_GAP },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 20 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  title:       { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle:    { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  options:     { gap: 10 },
  option:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 14 },
  optionIcon:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionEmoji: { fontSize: 20 },
  optionText:  { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  optionDesc:  { fontSize: 12, marginTop: 2 },
  optionChevron: { fontSize: 22, fontWeight: '300' },
});

// Centered popup-card modals (confirmations, rate, tip) — as opposed to csSt's
// bottom sheet, which is reserved for the multi-option Contact Sheet.
const popSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheetContent: { borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sheetSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  // width: '100%' matters here — a lone flex:1 button (Success/Cooldown
  // modals only ever have one) has no sibling to size against in an
  // unconstrained row, and Yoga can collapse it to zero width so it never
  // renders/taps. Two-button rows fill 100% either way, so this is a no-op there.
  sheetBtns: { flexDirection: 'row', width: '100%', gap: 12, marginTop: 4 },
  sheetBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
});

export default BookingsScreen;
