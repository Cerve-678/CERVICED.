import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking, BookingStatus, ConfirmedBooking, createBookingDateTime } from '../contexts/BookingContext';
import { ProviderHomeScreenProps } from '../navigation/types';
import { supabase } from '../lib/supabase';
import {
  getActiveRescheduleRequest,
  respondToRescheduleRequest,
  insertBookingUserNotification,
  getAvailableSlots,
  markBalanceCollected,
  upsertProviderRescheduleRequest,
  getClientBeautyProfile,
  getClientBookingHistory,
  getIntakeFormByBooking,
  getInfoPacksByBooking,
  getProviderAddressSettings,
  releaseBookingAddress,
  getBookingAddressReleasedAt,
  getBookingWithAddOnsById,
  getBookingUserId,
  getProviderServiceCategoryByUserId,
  getOrCreateConversation,
  ClientBeautyProfile,
  IntakeForm,
  BookingInfoPack,
  ProviderAddressSettings,
} from '../services/databaseService';
import type { DbBooking, ServiceCategory } from '../types/database';
import type { DbBookingRescheduleRequest } from '../types/database';

type Props = ProviderHomeScreenProps<'BookingDetail'>;

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  sep:     'rgba(126,102,103,0.08)',
  iconBg:  'rgba(175,145,151,0.12)',
};
const DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  sep:     'rgba(126,102,103,0.10)',
  iconBg:  'rgba(175,145,151,0.10)',
};

const STATUS_COLORS: Record<string, string> = {
  [BookingStatus.PENDING]: '#FF9500',
  [BookingStatus.UPCOMING]: '#007AFF',
  [BookingStatus.IN_PROGRESS]: '#FF9500',
  [BookingStatus.COMPLETED]: '#34C759',
  [BookingStatus.CANCELLED]: '#FF3B30',
  [BookingStatus.NO_SHOW]: '#8E8E93',
};

const STATUS_LABELS: Record<string, string> = {
  [BookingStatus.PENDING]: 'Pending Confirmation',
  [BookingStatus.UPCOMING]: 'Upcoming',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No Show',
};

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Which beauty profile fields are relevant per provider service category.
// 'allergies', 'medicalNotes', 'photographyConsent' are always critical — included for all.
const SERVICE_PROFILE_FIELDS: Partial<Record<ServiceCategory, (keyof ClientBeautyProfile)[]>> = {
  HAIR:       ['hairType', 'scalpCondition', 'hairGoals', 'treatmentHistory', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
  NAILS:      ['nailLength', 'nailShape', 'allergies', 'skinConcerns', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  LASHES:     ['lashStyle', 'lashStatus', 'skinType', 'skinConcerns', 'allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  BROWS:      ['browStyle', 'browCondition', 'skinType', 'skinConcerns', 'allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  MUA:        ['skinType', 'skinTone', 'skinConcerns', 'makeupCoverage', 'makeupFinish', 'makeupEyes', 'makeupLips', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
  AESTHETICS: ['skinType', 'skinTone', 'skinConcerns', 'sensitiveAreas', 'allergies', 'treatmentHistory', 'medicalNotes', 'photographyConsent'],
  MALE:       ['hairType', 'scalpCondition', 'skinType', 'skinTone', 'skinConcerns', 'allergies', 'medicalNotes', 'photographyConsent'],
  KIDS:       ['allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  OTHER:      ['hairType', 'scalpCondition', 'hairGoals', 'treatmentHistory', 'skinType', 'skinTone', 'skinConcerns', 'sensitiveAreas', 'nailLength', 'nailShape', 'lashStyle', 'lashStatus', 'browStyle', 'browCondition', 'makeupCoverage', 'makeupFinish', 'makeupEyes', 'makeupLips', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDisplayDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  return dateStr;
}

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDDMMYYYY(text: string): string | null {
  const parts = text.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  const d = parseInt(dd, 10), m = parseInt(mm, 10), y = parseInt(yyyy, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y) || d < 1 || d > 31 || m < 1 || m > 12) return null;
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

function buildInvoiceHTML(booking: any, totalPrice: number): string {
  const statusColors: Record<string, string> = {
    UPCOMING: '#007AFF', COMPLETED: '#34C759',
    CANCELLED: '#FF3B30', NO_SHOW: '#FF3B30',
    PENDING: '#FF9500', IN_PROGRESS: '#AF9197',
  };
  const statusColor = statusColors[booking.status] ?? '#AF9197';
  const addOnsRows = (booking.addOns ?? []).map((a: any) =>
    `<tr><td style="padding:8px 0;color:#555;padding-left:20px;font-size:16px">+ ${a.name}</td><td style="padding:8px 0;color:#555;font-size:16px;text-align:right">£${Number(a.price).toFixed(2)}</td></tr>`
  ).join('');
  const depositLabel = booking.paymentType === 'deposit' ? 'Deposit paid' : 'Full payment';
  const balanceRow = booking.remainingBalance > 0
    ? `<tr><td style="padding:8px 0;color:#FF9500;font-weight:600;font-size:17px">Balance due</td><td style="padding:8px 0;color:#FF9500;font-weight:600;font-size:17px;text-align:right">£${Number(booking.remainingBalance).toFixed(2)}</td></tr>`
    : '';
  const rawMethod = booking.paymentMethod as string | undefined;
  const METHOD_LABELS: Record<string, string> = {
    card: 'Credit/Debit Card', paypal: 'PayPal', apple: 'Apple Pay', google: 'Google Pay',
  };
  const paymentMethodLabel = (rawMethod && METHOD_LABELS[rawMethod]) ? METHOD_LABELS[rawMethod]! : 'Card';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #fff; color: #111; padding: 48px 40px; max-width: 560px; margin: 0 auto; }
  .brand { font-size: 44px; font-weight: 900; letter-spacing: 8px; text-align: center; margin-bottom: 6px; }
  .sub-brand { font-size: 15px; letter-spacing: 3px; color: #888; text-align: center; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 6px 18px; border-radius: 20px; font-size: 14px; font-weight: 600; letter-spacing: 1px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}66; margin: 0 auto 28px; }
  .badge-wrap { text-align: center; }
  .perf { border: none; border-top: 2px dashed #ddd; margin: 20px 0; }
  .label { font-size: 13px; letter-spacing: 2px; color: #888; margin-bottom: 12px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 17px; vertical-align: middle; padding: 8px 0; }
  .bold td { font-weight: 600; }
  .total-block { margin-top: 20px; padding-top: 16px; border-top: 2.5px solid #111; display: flex; justify-content: space-between; align-items: center; }
  .total-label { font-size: 14px; letter-spacing: 2px; font-weight: 700; }
  .total-value { font-size: 30px; font-weight: 900; }
  .ref-block { margin-top: 36px; text-align: center; }
  .ref-label { font-size: 13px; letter-spacing: 2px; color: #888; }
  .ref-value { font-size: 17px; font-weight: 700; letter-spacing: 4px; margin-top: 6px; }
  .footer { margin-top: 44px; text-align: center; font-size: 13px; color: #bbb; letter-spacing: 1px; }
  section { margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="brand">CERVICED</div>
  <div class="sub-brand">BOOKING INVOICE</div>
  <div class="badge-wrap"><span class="badge">${booking.status ?? 'BOOKING'}</span></div>

  <hr class="perf"/>

  <section>
    <div class="label">SERVICE</div>
    <table>
      <tr class="bold"><td style="padding:6px 0">${booking.serviceName ?? '—'}</td><td style="padding:6px 0;text-align:right">£${Number(booking.price).toFixed(2)}</td></tr>
      ${addOnsRows}
    </table>
  </section>

  <hr class="perf"/>

  <section>
    <div class="label">CLIENT</div>
    <table>
      <tr><td style="padding:6px 0;color:#555">Name</td><td style="padding:6px 0;text-align:right;font-weight:600">${booking.customerName ?? '—'}</td></tr>
    </table>
  </section>

  <hr class="perf"/>

  <section>
    <div class="label">APPOINTMENT</div>
    <table>
      <tr><td style="padding:6px 0;color:#555">Date</td><td style="padding:6px 0;text-align:right;font-weight:600">${booking.bookingDate ?? '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#555">Time</td><td style="padding:6px 0;text-align:right;font-weight:600">${booking.bookingTime ?? '—'}${booking.endTime && booking.endTime !== booking.bookingTime ? ' – ' + booking.endTime : ''}</td></tr>
    </table>
  </section>

  <hr class="perf"/>

  <section>
    <div class="label">PAYMENT</div>
    <table>
      <tr><td style="padding:6px 0;color:#34C759;font-weight:600">${depositLabel}</td><td style="padding:6px 0;color:#34C759;font-weight:600;text-align:right">£${Number(booking.amountPaid ?? 0).toFixed(2)}</td></tr>
      ${balanceRow}
      <tr><td style="padding:6px 0;color:#555">Payment method</td><td style="padding:6px 0;color:#555;text-align:right;font-weight:600">${paymentMethodLabel}</td></tr>
    </table>
    <div class="total-block">
      <span class="total-label">TOTAL</span>
      <span class="total-value">£${totalPrice.toFixed(2)}</span>
    </div>
  </section>

  <div class="ref-block">
    <div class="ref-label">REFERENCE</div>
    <div class="ref-value">${(booking.id ?? '').slice(0, 8).toUpperCase()}</div>
  </div>

  <div class="footer">cerviced.app</div>
</body>
</html>`;
}

export default function ProviderBookingDetailScreen({ route, navigation }: Props) {
  const { bookingId, booking: passedBooking } = route.params;
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { getBookingById, updateBookingStatus, cancelBooking } = useBooking();

  const contextBooking = useMemo(
    () => passedBooking ?? getBookingById(bookingId),
    [passedBooking, bookingId, getBookingById]
  );

  const [fetchedBooking, setFetchedBooking] = useState<ConfirmedBooking | null>(null);
  const [fetching, setFetching] = useState(false);
  // Seed from the booking object directly — clientUserId on ConfirmedBooking is the source of truth.
  // The DB fallback below only fires when the field is absent (legacy local-only bookings).
  const [clientUserId, setClientUserId] = useState<string | null>(
    contextBooking?.clientUserId ?? null
  );
  const [clientProfile, setClientProfile] = useState<ClientBeautyProfile | null>(null);
  const [intakeForm, setIntakeForm] = useState<IntakeForm | null>(null);
  const [bookingInfoPacks, setBookingInfoPacks] = useState<BookingInfoPack[]>([]);
  const [showSupportDropdown, setShowSupportDropdown] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const [dbReschedule, setDbReschedule] = useState<DbBookingRescheduleRequest | null>(null);
  const [liveBookingOverrides, setLiveBookingOverrides] = useState<{ bookingDate?: string; bookingTime?: string; endTime?: string; status?: string } | null>(null);
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [outboundSlots, setOutboundSlots] = useState<{ date: string; times: string[] }[]>([]);
  const [slotDate, setSlotDate] = useState('');
  const [slotTimes, setSlotTimes] = useState('');
  const [suggestedTimes, setSuggestedTimes] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [respondLoading, setRespondLoading] = useState(false);
  const [respondSent, setRespondSent] = useState(false);
  const [inputError, setInputError] = useState('');
  const [sendApology, setSendApology] = useState(false);
  const [apologyText, setApologyText] = useState(
    "Sorry, I'm not available on the dates you requested. Here are some alternative dates I can offer:"
  );
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [balanceCollected, setBalanceCollected] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showInitRescheduleModal, setShowInitRescheduleModal] = useState(false);
  const [initRescheduleSlots, setInitRescheduleSlots] = useState<{ date: string; times: string[] }[]>([]);
  const [initSlotDate, setInitSlotDate] = useState('');
  const [initSlotTimes, setInitSlotTimes] = useState('');
  const [initSuggestedTimes, setInitSuggestedTimes] = useState<string[]>([]);
  const [initSelectedTimes, setInitSelectedTimes] = useState<string[]>([]);
  const [initLoadingTimes, setInitLoadingTimes] = useState(false);
  const [initInputError, setInitInputError] = useState('');
  const [initSent, setInitSent] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  const [addressSettings, setAddressSettings] = useState<ProviderAddressSettings | null>(null);
  const [addressReleasedAt, setAddressReleasedAt] = useState<string | null>(null);
  const [releasingAddress, setReleasingAddress] = useState(false);

  const [providerServiceCategory, setProviderServiceCategory] = useState<ServiceCategory | null>(null);
  const [clientHistoryVisible, setClientHistoryVisible] = useState(false);
  const [clientHistoryBookings, setClientHistoryBookings] = useState<DbBooking[]>([]);
  const [clientHistoryLoading, setClientHistoryLoading] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);

  useEffect(() => {
    if (contextBooking || !bookingId) return;
    setFetching(true);
    getBookingWithAddOnsById(bookingId)
      .then(raw => {
        if (!raw) { setFetching(false); return; }
        const d = raw as any;
        const to12 = (t: string) => {
          const [hs, ms] = t.split(':');
          let h = parseInt(hs ?? '0');
          const m = parseInt(ms ?? '0');
          const p = h >= 12 ? 'PM' : 'AM';
          if (h > 12) h -= 12;
          if (h === 0) h = 12;
          return `${h}:${String(m).padStart(2, '0')} ${p}`;
        };
        const rawStart = d.booking_time ? d.booking_time.slice(0, 5) : '';
        const rawEnd   = d.end_time   ? d.end_time.slice(0, 5)   : '';
        const mapped = {
          id: d.id,
          providerId: d.provider_id,
          providerName: d.provider_name_snapshot ?? '',
          providerImage: d.provider_logo_snapshot ?? '',
          serviceName: d.service_name_snapshot ?? '',
          duration: '',
          price: d.base_price ?? 0,
          bookingDate: d.booking_date ?? '',
          bookingTime: rawStart ? to12(rawStart) : '',
          endTime: rawEnd ? to12(rawEnd) : '',
          address: d.provider_address_snapshot ?? '',
          status: d.status as BookingStatus,
          paymentType: d.payment_type ?? 'full',
          amountPaid: d.amount_paid ?? 0,
          depositAmount: d.deposit_amount ?? 0,
          remainingBalance: d.remaining_balance ?? 0,
          serviceCharge: d.service_charge ?? 0,
          customerName: d.customer_name ?? '',
          customerEmail: d.customer_email ?? '',
          customerPhone: d.customer_phone ?? '',
          isPendingReschedule: false,
          addOns: (d.add_ons ?? []).map((a: any) => ({ name: a.name_snapshot, price: a.price_snapshot })),
          groupBookingId: d.group_booking_id ?? undefined,
          notes: d.notes ?? undefined,
          bookingInstructions: d.booking_instructions ?? undefined,
          clientAddress: d.client_address ?? undefined,
          clientUserId: d.user_id ?? undefined,
        } as unknown as ConfirmedBooking;
        setFetchedBooking(mapped);
        if (d.user_id) setClientUserId(d.user_id);
        setFetching(false);
      })
      .catch(() => { setFetching(false); });
  }, [bookingId, contextBooking]);

  useEffect(() => {
    if (!bookingId) return;
    getActiveRescheduleRequest(bookingId)
      .then(r => setDbReschedule(r))
      .catch(() => {});
  }, [bookingId]);

  // Realtime: keep reschedule state + booking date/time in sync while screen is open.
  // Without this, if the client confirms a reschedule the provider still sees the old
  // date and the "reschedule pending" UI until they close and reopen the screen.
  useEffect(() => {
    if (!bookingId) return;

    const to12 = (t: string) => {
      const [hs, ms] = t.split(':');
      let h = parseInt(hs ?? '0');
      const m = parseInt(ms ?? '0');
      const p = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return `${h}:${String(m).padStart(2, '0')} ${p}`;
    };

    const channel = supabase
      .channel(`provider-booking-live-${bookingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_reschedule_requests', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          const row = payload.new as DbBookingRescheduleRequest | null;
          // If row was deleted or status is confirmed/rejected, clear the reschedule UI
          if (!row || (payload.eventType === 'DELETE')) {
            setDbReschedule(null);
          } else {
            setDbReschedule(row);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
        (payload) => {
          const d = payload.new as any;
          if (!d) return;
          const rawStart = d.booking_time ? (d.booking_time as string).slice(0, 5) : '';
          const rawEnd = d.end_time ? (d.end_time as string).slice(0, 5) : '';
          setLiveBookingOverrides(prev => ({
            ...prev,
            ...(d.booking_date && { bookingDate: d.booking_date }),
            ...(rawStart && { bookingTime: to12(rawStart) }),
            ...(rawEnd && { endTime: to12(rawEnd) }),
            ...(d.status && { status: d.status }),
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    const providerId = contextBooking?.providerId ?? fetchedBooking?.providerId;
    if (!providerId) return;
    getProviderAddressSettings(providerId)
      .then(s => setAddressSettings(s))
      .catch(() => {});
  }, [contextBooking?.providerId, fetchedBooking?.providerId]);

  useEffect(() => {
    if (!bookingId) return;
    getBookingAddressReleasedAt(bookingId)
      .then(t => setAddressReleasedAt(t))
      .catch(() => {});
  }, [bookingId]);

  // For context-passed bookings we also look up user_id from Supabase
  useEffect(() => {
    if (!bookingId || clientUserId) return;
    getBookingUserId(bookingId)
      .then(uid => { if (uid) setClientUserId(uid); })
      .catch(() => {});
  }, [bookingId, clientUserId]);

  useEffect(() => {
    if (!clientUserId) return;
    getClientBeautyProfile(clientUserId)
      .then(p => {
        setClientProfile(p);
        // Auto-expand if allergies or medical notes are present
        if (p && (p.allergies.length > 0 || p.medicalNotes)) {
          setProfileExpanded(true);
        }
      })
      .catch(() => {});
  }, [clientUserId]);

  useEffect(() => {
    if (!bookingId) return;
    getIntakeFormByBooking(bookingId)
      .then(f => setIntakeForm(f))
      .catch(() => {});
    getInfoPacksByBooking(bookingId)
      .then(p => setBookingInfoPacks(p))
      .catch(() => {});
  }, [bookingId]);

  // Fetch current provider's service category once for profile filtering
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const category = await getProviderServiceCategoryByUserId(user.id);
        if (category) setProviderServiceCategory(category as ServiceCategory);
      } catch {}
    })();
  }, []);

  const baseBooking = contextBooking ?? fetchedBooking;
  const booking = baseBooking ? {
    ...baseBooking,
    ...(liveBookingOverrides?.bookingDate !== undefined && { bookingDate: liveBookingOverrides.bookingDate }),
    ...(liveBookingOverrides?.bookingTime !== undefined && { bookingTime: liveBookingOverrides.bookingTime }),
    ...(liveBookingOverrides?.endTime !== undefined && { endTime: liveBookingOverrides.endTime }),
    ...(liveBookingOverrides?.status !== undefined && { status: liveBookingOverrides.status as BookingStatus }),
  } as ConfirmedBooking : baseBooking;

  // Fetch real available slots when provider enters a complete DD/MM/YYYY date
  useEffect(() => {
    const isoDate = parseDDMMYYYY(slotDate);
    if (!isoDate || !booking?.providerId) {
      setSuggestedTimes([]);
      setSelectedTimes([]);
      return;
    }
    let cancelled = false;
    setLoadingTimes(true);
    setInputError('');
    getAvailableSlots(booking.providerId, isoDate)
      .then(slots => {
        if (!cancelled) { setSuggestedTimes(slots); setSelectedTimes([]); }
      })
      .catch(() => { if (!cancelled) setSuggestedTimes([]); })
      .finally(() => { if (!cancelled) setLoadingTimes(false); });
    return () => { cancelled = true; };
  }, [slotDate, booking?.providerId]);

  const toggleTime = useCallback((time: string) => {
    setSelectedTimes(prev =>
      prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time]
    );
  }, []);

  const handleAddSlot = useCallback(() => {
    const isoDate = parseDDMMYYYY(slotDate.trim());
    const manualTimes = slotTimes.trim().split(',').map(t => t.trim()).filter(Boolean);
    const allTimes = [...new Set([...selectedTimes, ...manualTimes])];
    if (!isoDate) {
      setInputError('Enter a complete date in DD/MM/YYYY format.');
      return;
    }
    if (allTimes.length === 0) {
      setInputError('Select a time slot or type at least one time.');
      return;
    }
    setInputError('');
    setOutboundSlots(prev => {
      const existing = prev.find(s => s.date === isoDate);
      if (existing) {
        return prev.map(s => s.date === isoDate
          ? { ...s, times: [...new Set([...s.times, ...allTimes])] }
          : s
        );
      }
      return [...prev, { date: isoDate, times: allTimes }];
    });
    setSlotDate('');
    setSlotTimes('');
    setSuggestedTimes([]);
    setSelectedTimes([]);
  }, [slotDate, slotTimes, selectedTimes]);

  const handleRespondSubmit = useCallback(async () => {
    if (outboundSlots.length === 0) {
      setInputError('Add at least one date slot before sending.');
      return;
    }
    if (!booking) return;
    setRespondLoading(true);
    setInputError('');
    try {
      await respondToRescheduleRequest(booking.id, outboundSlots);
      await insertBookingUserNotification({
        booking_id: booking.id,
        type: 'reschedule_provider_response',
        title: sendApology ? `${booking.providerName} can't make those dates` : 'Provider Responded',
        message: sendApology
          ? apologyText
          : `${booking.providerName} has shared available dates for your reschedule request.`,
        priority: 'high',
        is_actionable: true,
        provider_id: booking.providerId,
      });
      setDbReschedule(prev => prev ? { ...prev, status: 'provider_responded', provider_available_slots: outboundSlots } : prev);
      setRespondSent(true);
    } catch {
      setInputError('Could not send response. Please try again.');
    } finally {
      setRespondLoading(false);
    }
  }, [outboundSlots, booking, sendApology, apologyText]);

  const closeRespondModal = useCallback(() => {
    setShowRespondModal(false);
    setOutboundSlots([]);
    setSlotDate('');
    setSlotTimes('');
    setSuggestedTimes([]);
    setSelectedTimes([]);
    setRespondSent(false);
    setInputError('');
    setSendApology(false);
  }, []);

  // Fetch available slots when provider enters a date in the initiate reschedule modal
  useEffect(() => {
    const isoDate = parseDDMMYYYY(initSlotDate);
    if (!isoDate || !booking?.providerId) { setInitSuggestedTimes([]); setInitSelectedTimes([]); return; }
    let cancelled = false;
    setInitLoadingTimes(true);
    getAvailableSlots(booking.providerId, isoDate)
      .then(slots => { if (!cancelled) { setInitSuggestedTimes(slots); setInitSelectedTimes([]); } })
      .catch(() => { if (!cancelled) setInitSuggestedTimes([]); })
      .finally(() => { if (!cancelled) setInitLoadingTimes(false); });
    return () => { cancelled = true; };
  }, [initSlotDate, booking?.providerId]);

  const toggleInitTime = useCallback((time: string) => {
    setInitSelectedTimes(prev => prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time]);
  }, []);

  const handleAddInitSlot = useCallback(() => {
    const isoDate = parseDDMMYYYY(initSlotDate.trim());
    if (!isoDate) { setInitInputError('Enter a valid date (DD/MM/YYYY).'); return; }
    const manual = initSlotTimes.trim().split(',').map(t => t.trim()).filter(Boolean);
    const allTimes = [...new Set([...initSelectedTimes, ...manual])];
    if (allTimes.length === 0) { setInitInputError('Select or enter at least one time.'); return; }
    setInitInputError('');
    setInitRescheduleSlots(prev => {
      const existing = prev.find(s => s.date === isoDate);
      if (existing) return prev.map(s => s.date === isoDate ? { ...s, times: [...new Set([...s.times, ...allTimes])] } : s);
      return [...prev, { date: isoDate, times: allTimes }];
    });
    setInitSlotDate(''); setInitSlotTimes(''); setInitSuggestedTimes([]); setInitSelectedTimes([]);
  }, [initSlotDate, initSlotTimes, initSelectedTimes]);

  const handleInitRescheduleSubmit = useCallback(async () => {
    if (initRescheduleSlots.length === 0) { setInitInputError('Add at least one date and time slot.'); return; }
    if (!booking) return;
    setInitLoading(true);
    setInitInputError('');
    try {
      await upsertProviderRescheduleRequest({
        booking_id: booking.id,
        original_date: booking.bookingDate,
        original_time: booking.bookingTime,
        proposed_slots: initRescheduleSlots,
      });
      await insertBookingUserNotification({
        booking_id: booking.id,
        type: 'reschedule_request',
        title: `${booking.providerName} needs to reschedule`,
        message: `${booking.providerName} has proposed new times for your ${booking.serviceName} appointment. Tap to choose a slot.`,
        priority: 'high',
        is_actionable: true,
        provider_id: booking.providerId,
      });
      setDbReschedule(prev => prev ? { ...prev, status: 'provider_responded', provider_available_slots: initRescheduleSlots, requested_by: 'provider' } : {
        id: '', booking_id: booking.id, requested_by: 'provider', original_date: booking.bookingDate,
        original_time: booking.bookingTime, requested_dates: [], provider_available_slots: initRescheduleSlots,
        status: 'provider_responded', reschedule_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      setInitSent(true);
    } catch {
      setInitInputError('Could not send reschedule request. Please try again.');
    } finally {
      setInitLoading(false);
    }
  }, [initRescheduleSlots, booking]);

  const closeInitRescheduleModal = useCallback(() => {
    setShowInitRescheduleModal(false);
    setInitRescheduleSlots([]); setInitSlotDate(''); setInitSlotTimes('');
    setInitSuggestedTimes([]); setInitSelectedTimes([]);
    setInitInputError(''); setInitSent(false);
  }, []);

  const handleReleaseAddress = useCallback(async () => {
    if (!booking || releasingAddress) return;
    setReleasingAddress(true);
    try {
      await releaseBookingAddress(booking.id);
      const now = new Date().toISOString();
      setAddressReleasedAt(now);
      await insertBookingUserNotification({
        booking_id: booking.id,
        type: 'booking_confirmed',
        title: 'Address Released',
        message: `${booking.providerName} has shared their address for your upcoming appointment.`,
        priority: 'high',
        is_actionable: false,
        provider_id: booking.providerId ?? null,
      });
    } catch {
      Alert.alert('Error', 'Could not release address. Please try again.');
    } finally {
      setReleasingAddress(false);
    }
  }, [booking, releasingAddress]);

  const addressPolicy = useMemo(
    () => addressSettings?.address_release_policy ?? 'manual',
    [addressSettings]
  );

  const isAddressReleased = useMemo(() => {
    if (!booking) return false;
    return !!addressReleasedAt
      || addressPolicy === 'always'
      || (addressPolicy === 'on_confirmation' && (
        booking.status === BookingStatus.UPCOMING ||
        booking.status === BookingStatus.IN_PROGRESS ||
        booking.status === BookingStatus.COMPLETED
      ));
  }, [booking, addressReleasedAt, addressPolicy]);

  const handleStatusChange = useCallback(
    (newStatus: BookingStatus) => {
      if (!booking) return;
      const label = STATUS_LABELS[newStatus] || newStatus;
      setPendingConfirm({
        title: `Mark as ${label}`,
        message: `The booking status will be updated to ${label}.`,
        confirmLabel: `Mark ${label}`,
        destructive: newStatus === BookingStatus.NO_SHOW,
        onConfirm: async () => {
          // The on_booking_status_changed DB trigger notifies the client
          // (in_progress / no_show / review request) — no app-side insert,
          // or the client would be pinged twice.
          await updateBookingStatus(booking.id, newStatus);
          navigation.goBack();
        },
      });
    },
    [booking, updateBookingStatus, navigation]
  );

  const handleConfirm = useCallback(() => {
    if (!booking) return;
    setPendingConfirm({
      title: 'Confirm Booking',
      message: 'The client will be notified that their booking is confirmed.',
      confirmLabel: 'Confirm Booking',
      onConfirm: async () => {
        // pending → confirmed fires the DB trigger, which notifies the client
        await updateBookingStatus(booking.id, BookingStatus.UPCOMING);
        navigation.goBack();
      },
    });
  }, [booking, updateBookingStatus, navigation]);

  const handleDecline = useCallback(() => {
    if (!booking) return;
    setPendingConfirm({
      title: 'Decline Booking',
      message: 'The client will be notified. This cannot be undone.',
      confirmLabel: 'Decline',
      destructive: true,
      onConfirm: async () => {
        // pending → cancelled by the provider: the DB trigger sends the
        // client the "declined" notification and invites the next waitlist
        // entry — no app-side inserts, or both would fire twice.
        await cancelBooking(booking.id);
        navigation.goBack();
      },
    });
  }, [booking, cancelBooking, navigation]);

  const handleCancel = useCallback(() => {
    if (!booking) return;
    setPendingConfirm({
      title: 'Cancel Booking',
      message: 'This cannot be undone. The client will be notified.',
      confirmLabel: 'Cancel Booking',
      destructive: true,
      onConfirm: async () => {
        // The DB trigger notifies the client and invites the next waitlist
        // entry on cancellation — no app-side inserts needed.
        await cancelBooking(booking.id);
        navigation.goBack();
      },
    });
  }, [booking, cancelBooking, navigation]);

  const handleCollectBalance = useCallback(() => {
    if (!booking || balanceCollected) return;
    setPendingConfirm({
      title: 'Collect Balance',
      message: `Confirm £${booking.remainingBalance.toFixed(2)} has been received from the client.`,
      confirmLabel: 'Mark as Collected',
      onConfirm: async () => {
        await markBalanceCollected(booking.id);
        insertBookingUserNotification({
          booking_id: booking.id,
          type: 'balance_collected',
          title: 'Balance Received',
          message: `Your remaining balance of £${booking.remainingBalance.toFixed(2)} for ${booking.serviceName} has been marked as received.`,
          priority: 'medium',
          provider_id: booking.providerId,
        }).catch(() => {});
        setBalanceCollected(true);
      },
    });
  }, [booking, balanceCollected]);


  const handleCallClient = useCallback(() => {
    if (!booking?.customerPhone) return;
    Linking.openURL(`tel:${booking.customerPhone}`);
  }, [booking]);

  const handleOpenChat = useCallback(async () => {
    if (!booking?.providerId || !clientUserId) return;
    try {
      const clientName = booking.customerName ?? 'Client';
      const conversationId = await getOrCreateConversation(booking.providerId, clientUserId);
      navigation.navigate('ProviderConversation', { conversationId, clientUserId, clientName });
    } catch {
      Alert.alert('Error', 'Could not open chat. Try again.');
    }
  }, [booking, clientUserId, navigation]);

  const handleShare = useCallback(async () => {
    if (!booking) return;
    const t = booking.price + (booking.addOns?.reduce((s: number, a: { price: number }) => s + a.price, 0) ?? 0);
    try {
      const html = buildInvoiceHTML(booking, t);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Invoice', UTI: 'com.adobe.pdf' });
    } catch {
      Alert.alert('Invoice error', 'Could not generate the invoice. Rebuild the app if this persists.');
    }
  }, [booking]);

  const hasBeautyData = (p: ClientBeautyProfile) =>
    p.hairType || p.skinType || p.styleVibe || p.medicalNotes ||
    p.allergies.length > 0 || p.skinConcerns.length > 0 || p.treatmentHistory.length > 0;

  // Must be above early returns — hooks cannot be called after conditional returns
  const displayDuration = useMemo(() => {
    if (!booking) return '';
    if (booking.duration) return booking.duration;
    if (booking.bookingTime && booking.endTime && booking.bookingTime !== booking.endTime) {
      const parseMin = (t: string) => {
        const clean = t.trim().toUpperCase();
        const isPM = clean.includes('PM');
        const isAM = clean.includes('AM');
        const part = clean.replace(/[AP]M/i, '').trim();
        const [hs, ms] = part.split(':');
        let h = parseInt(hs || '0', 10);
        const m = parseInt(ms || '0', 10);
        if (isAM && h === 12) h = 0;
        if (isPM && h !== 12) h += 12;
        return h * 60 + m;
      };
      const diff = parseMin(booking.endTime) - parseMin(booking.bookingTime);
      if (diff > 0) {
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
      }
    }
    return '';
  }, [booking?.duration, booking?.bookingTime, booking?.endTime]);

  if (fetching) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg }]}>
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={P.accent} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg }]}>
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: P.text }]}>Booking not found</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[booking.status] || '#007AFF';

  const isActive = booking.status === BookingStatus.UPCOMING || booking.status === BookingStatus.IN_PROGRESS;
  const isPendingConfirmation = booking.status === BookingStatus.PENDING;
  const isPending = booking.isPendingReschedule || dbReschedule?.status === 'pending';
  const hasRescheduleRequest = dbReschedule?.status === 'pending' || dbReschedule?.status === 'provider_responded';
  const canRespondToReschedule = dbReschedule?.status === 'pending';
  const blurTint = isDarkMode ? 'dark' : 'light';

  // ── Time-based action gating ──
  // Start Appointment: only on the appointment day. No Show: only once the
  // start time has passed (you can't no-show someone before they're due).
  // Confirm: not for requests whose date/time has already gone by.
  const apptStart = booking.bookingDate && booking.bookingTime
    ? createBookingDateTime(booking.bookingDate, booking.bookingTime)
    : null;
  const isApptToday = booking.bookingDate === new Date().toISOString().split('T')[0];
  const apptStartPassed = !!apptStart && apptStart.getTime() < Date.now();
  const pendingExpired = isPendingConfirmation && apptStartPassed;

  const totalPrice = booking.price + (booking.addOns?.reduce((s: number, a: { price: number }) => s + a.price, 0) ?? 0);
  const initials = (booking.customerName || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const perf = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const rowDiv = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: P.bg }}>
        {/* ── Calendar-style header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.iconBtn, { backgroundColor: P.surface }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: P.text }]}>Booking Details</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => setShowHelpDropdown(v => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.iconBtn, { backgroundColor: P.surface }]}
            >
              <Ionicons name="help-circle-outline" size={17} color={P.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.iconBtn, { backgroundColor: P.surface }]}
            >
              <Ionicons name="share-outline" size={17} color={P.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowMoreSheet(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.iconBtn, { backgroundColor: P.surface }]}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={P.text} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════ THE RECEIPT ══════════════ */}
        <View style={styles.receiptScene}>
          {/* 3D depth layers — stacked paper sheets behind the card */}
          <View style={[styles.receiptDepthLayer, styles.receiptDepth3, {
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.45)',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(200,200,200,0.60)',
          }]} />
          <View style={[styles.receiptDepthLayer, styles.receiptDepth2, {
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.60)',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.09)' : 'rgba(220,220,220,0.70)',
          }]} />
          <View style={[styles.receiptDepthLayer, styles.receiptDepth1, {
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.75)',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(240,240,240,0.85)',
          }]} />

          {/* Main receipt card */}
          <View style={styles.receiptOuter}>
          <BlurView intensity={isDarkMode ? 45 : 65} tint={blurTint} style={styles.receiptBlur}>
            <View style={[styles.receiptCard, { borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.90)' }]}>

              {/* Top-edge highlight (light catching the glass) */}
              <View style={[styles.receiptTopHighlight, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.70)' }]} />

              {/* ── Receipt Header ── */}
              <View style={styles.receiptHeader}>
                <Text style={[styles.receiptBrand, { color: P.text }]}>CERVICED</Text>
                <Text style={[styles.receiptSubBrand, { color: P.sub }]}>Booking Receipt</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                    {STATUS_LABELS[booking.status]}{isPending ? '  ·  Reschedule Requested' : ''}
                  </Text>
                </View>
              </View>

              {/* ── Completion banner (completed bookings only) ── */}
              {booking.status === BookingStatus.COMPLETED && (
                <View style={[styles.completionBanner, { backgroundColor: '#34C75912', borderColor: '#34C75940' }]}>
                  <Text style={styles.completionIcon}>✓</Text>
                  <View>
                    <Text style={[styles.completionTitle, { color: '#34C759' }]}>Appointment Complete</Text>
                    <Text style={[styles.completionSub, { color: '#34C75999' }]}>This appointment has been completed</Text>
                  </View>
                </View>
              )}

              {/* ── Perforated divider ── */}
              <Perf color={perf} />

              {/* ── SERVICE section ── */}
              <View style={styles.section}>
                {!showHelpDropdown && <Text style={[styles.sectionLabel, { color: P.sub }]}>SERVICE</Text>}
                <Row label={booking.serviceName} value={`£${booking.price.toFixed(2)}`} textColor={P.text} divColor={rowDiv} bold />
                {(booking.addOns ?? []).map((a: { name: string; price: number }, i: number) => (
                  <Row key={i} label={a.name} value={`£${a.price.toFixed(2)}`} textColor={P.text} divColor={rowDiv} indent />
                ))}
                {(booking.addOns ?? []).length > 0 && (
                  <View style={[styles.subtotalRow, { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)' }]}>
                    <Text style={[styles.subtotalLabel, { color: P.text + '77' }]}>Subtotal</Text>
                    <Text style={[styles.subtotalValue, { color: P.text }]}>£{totalPrice.toFixed(2)}</Text>
                  </View>
                )}
              </View>

              {/* ── Perforated divider ── */}
              <Perf color={perf} />

              {/* ── APPOINTMENT section ── */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: P.sub }]}>APPOINTMENT</Text>
                <Row label="Date" value={formatDisplayDate(booking.bookingDate) || '—'} textColor={P.text} divColor={rowDiv} />
                <Row label="Time" value={booking.bookingTime && booking.endTime && booking.bookingTime !== booking.endTime ? `${booking.bookingTime} – ${booking.endTime}` : booking.bookingTime || '—'} textColor={P.text} divColor={rowDiv} />
                {displayDuration ? (
                  <Row label="Duration" value={displayDuration} textColor={P.text} divColor={rowDiv} />
                ) : null}
                {addressSettings?.business_type !== 'mobile' && addressPolicy === 'manual' ? (
                  isAddressReleased ? (
                    <Row
                      label="Location"
                      value="Address sent to client"
                      textColor={P.text}
                      valueColor="#34C759"
                      divColor={rowDiv}
                      last
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={handleReleaseAddress}
                      activeOpacity={0.7}
                      disabled={releasingAddress}
                    >
                      <Text style={[styles.rowLabel, { color: P.text }]} numberOfLines={1}>Location</Text>
                      {releasingAddress ? (
                        <ActivityIndicator size="small" color={P.accent} />
                      ) : (
                        <Text style={[styles.rowValue, { color: P.accent }]}>Address will be confirmed…</Text>
                      )}
                    </TouchableOpacity>
                  )
                ) : booking.address ? (
                  <Row label="Location" value={booking.address} textColor={P.text} divColor={rowDiv} last />
                ) : null}
              </View>

              {/* ── Perforated divider ── */}
              <Perf color={perf} />

              {/* ── ADDRESS section — mobile providers only; client sends this via messaging ── */}
              {addressSettings?.business_type === 'mobile' && (
                <>
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: P.sub }]}>ADDRESS</Text>

                    {booking.clientAddress ? (
                      <>
                        <View style={[addrStyles.addressBlock, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderColor: rowDiv }]}>
                          <Text style={[addrStyles.addressLabel, { color: P.sub }]}>CLIENT ADDRESS</Text>
                          <Text style={[addrStyles.addressText, { color: P.text }]}>{booking.clientAddress}</Text>
                        </View>
                        <View style={[addrStyles.statusRow, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: rowDiv, marginTop: 8 }]}>
                          <View style={[addrStyles.statusDot, { backgroundColor: P.accent }]} />
                          <Text style={[addrStyles.statusText, { color: P.sub }]}>Mobile — you travel to the client</Text>
                        </View>
                      </>
                    ) : (
                      <View style={[addrStyles.statusRow, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: rowDiv }]}>
                        <View style={[addrStyles.statusDot, { backgroundColor: P.accent }]} />
                        <Text style={[addrStyles.statusText, { color: P.sub }]}>Mobile — waiting for client to send their address in Messages</Text>
                      </View>
                    )}
                  </View>

                  {/* ── Perforated divider ── */}
                  <Perf color={perf} />
                </>
              )}

              {/* ── NOTES section ── */}
              {(booking.notes || booking.bookingInstructions) && (
                <>
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: P.sub }]}>NOTES</Text>
                    {booking.notes ? (
                      <View style={[styles.notesBlock, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
                        <Text style={[styles.notesLabel, { color: P.sub }]}>Client note</Text>
                        <Text style={[styles.notesText, { color: P.text }]}>{booking.notes}</Text>
                      </View>
                    ) : null}
                    {booking.bookingInstructions ? (
                      <View style={[styles.notesBlock, { backgroundColor: isDarkMode ? 'rgba(255,149,0,0.08)' : 'rgba(255,149,0,0.05)', borderColor: isDarkMode ? 'rgba(255,149,0,0.25)' : 'rgba(255,149,0,0.20)', marginTop: booking.notes ? 10 : 0 }]}>
                        <Text style={[styles.notesLabel, { color: '#FF9500' }]}>Booking instructions</Text>
                        <Text style={[styles.notesText, { color: P.text }]}>{booking.bookingInstructions}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Perf color={perf} />
                </>
              )}

              {/* ── CLIENT section ── */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: P.sub }]}>CLIENT</Text>
                <View style={styles.clientHeader}>
                  <View style={[styles.avatar, { backgroundColor: '#a342c322', borderColor: '#a342c355' }]}>
                    <Text style={[styles.avatarText, { color: '#a342c3' }]}>{initials}</Text>
                  </View>
                  <Text style={[styles.clientNameLarge, { color: P.text }]}>{booking.customerName || 'Unknown'}</Text>
                  {clientUserId ? (
                    <TouchableOpacity
                      onPress={async () => {
                        setClientHistoryVisible(true);
                        setClientHistoryLoading(true);
                        try {
                          const h = await getClientBookingHistory(clientUserId);
                          setClientHistoryBookings(h);
                        } catch {}
                        setClientHistoryLoading(false);
                      }}
                      style={{ marginLeft: 'auto', padding: 8 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="eye-outline" size={22} color={P.accent} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* ── Client alert strip: allergies + medical notes ── */}
                {clientProfile && (clientProfile.allergies.length > 0 || clientProfile.medicalNotes) && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setProfileExpanded(v => !v)}
                    style={{
                      marginTop: 10,
                      marginBottom: 4,
                      borderRadius: 10,
                      backgroundColor: '#FF3B3012',
                      borderWidth: 1,
                      borderColor: '#FF3B3044',
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons name="warning-outline" size={16} color="#FF3B30" />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#FF3B30', lineHeight: 17 }}>
                      {[
                        clientProfile.allergies.length > 0 && `${clientProfile.allergies.length} allerg${clientProfile.allergies.length > 1 ? 'ies' : 'y'} on file`,
                        clientProfile.medicalNotes && 'Medical notes on file',
                      ].filter(Boolean).join('  ·  ')}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#FF3B30', opacity: 0.7 }}>
                      {profileExpanded ? 'Hide' : 'View'}
                    </Text>
                  </TouchableOpacity>
                )}

                {booking.customerPhone ? (
                  <Row label="Phone" value={booking.customerPhone} textColor={P.text} divColor={rowDiv} />
                ) : null}
                {booking.customerEmail ? (
                  <Row label="Email" value={booking.customerEmail} textColor={P.text} divColor={rowDiv} last />
                ) : null}
                {(booking.customerPhone || booking.customerEmail) && (
                  <View style={styles.contactRow}>
                    {booking.customerPhone ? (
                      <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#34C759' }]} onPress={handleCallClient}>
                        <Text style={styles.contactBtnText}>Call Client</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.contactBtn, { backgroundColor: '#a342c3' }]}
                      onPress={handleOpenChat}
                    >
                      <Text style={styles.contactBtnText}>Message</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* ── Perforated divider ── */}
              <Perf color={perf} />

              {/* ── CLIENT PROFILE section ── */}
              {clientProfile && (() => {
                // Determine which fields to show; fall back to all if category unknown
                const relevantFields = providerServiceCategory
                  ? SERVICE_PROFILE_FIELDS[providerServiceCategory]
                  : undefined;
                const show = (field: keyof ClientBeautyProfile) =>
                  !relevantFields || relevantFields.includes(field);
                const hasCritical = clientProfile.allergies.length > 0 || !!clientProfile.medicalNotes;
                return (
                  <>
                    <View style={styles.section}>
                      {/* Tappable header with expand/collapse */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setProfileExpanded(v => !v)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: profileExpanded ? 10 : 0 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.sectionLabel, { color: P.sub, marginBottom: 0 }]}>CLIENT PROFILE</Text>
                          {hasCritical && (
                            <View style={{ backgroundColor: '#FF3B3018', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FF3B30' }}>
                                {[clientProfile.allergies.length > 0 && '⚠', clientProfile.medicalNotes && '⚕'].filter(Boolean).join(' ')}
                              </Text>
                            </View>
                          )}
                          {providerServiceCategory ? (
                            <View style={{ backgroundColor: '#a342c322', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#a342c3', letterSpacing: 0.4 }}>
                                {providerServiceCategory}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Ionicons
                          name={profileExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={P.sub}
                        />
                      </TouchableOpacity>
                      {profileExpanded && (() => {
                        const catLabel = (label: string) => (
                          <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: P.sub, opacity: 0.6, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' }}>
                            {label}
                          </Text>
                        );
                        const chipRow = (items: string[], color?: string) => (
                          <View style={styles.profileChips}>
                            {items.map((item, i) => (
                              <View key={i} style={[styles.profileChip, {
                                backgroundColor: color ? color + '18' : P.surface,
                                borderColor: color ? color + '44' : isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',
                              }]}>
                                <Text style={[styles.profileChipText, { color: color ?? P.text }]}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        );

                        const s = (f: keyof ClientBeautyProfile) => show(f);
                        const CR = (items: string[], color?: string) => chipRow(items, color);

                        const hasSkin = (s('skinType') && clientProfile.skinType) || (s('skinTone') && clientProfile.skinTone) || (s('skinConcerns') && clientProfile.skinConcerns.length > 0) || (s('sensitiveAreas') && clientProfile.sensitiveAreas.length > 0);
                        const hasHair = (s('hairType') && clientProfile.hairType) || (s('scalpCondition') && clientProfile.scalpCondition) || (s('hairGoals') && clientProfile.hairGoals.length > 0) || (s('treatmentHistory') && clientProfile.treatmentHistory.length > 0);
                        const hasNails = (s('nailLength') && clientProfile.nailLength) || (s('nailShape') && clientProfile.nailShape);
                        const hasLashesBrows = (s('lashStyle') && clientProfile.lashStyle) || (s('lashStatus') && clientProfile.lashStatus) || (s('browStyle') && clientProfile.browStyle) || (s('browCondition') && clientProfile.browCondition);
                        const hasMakeup = (s('makeupCoverage') && clientProfile.makeupCoverage) || (s('makeupFinish') && clientProfile.makeupFinish) || (s('makeupEyes') && clientProfile.makeupEyes) || (s('makeupLips') && clientProfile.makeupLips);
                        const hasStyle = s('styleVibe') && clientProfile.styleVibe;
                        const hasAlerts = (s('allergies') && clientProfile.allergies.length > 0) || (s('medicalNotes') && clientProfile.medicalNotes);

                        return (
                          <>
                            {/* ── HEALTH & ALERTS (always first) ── */}
                            {hasAlerts && catLabel('Health & Alerts')}
                            {s('allergies') && clientProfile.allergies.length > 0 && (
                              <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                <Text style={[styles.rowLabel, { color: '#FF9500' }]}>⚠ Allergies</Text>
                                {CR(clientProfile.allergies, '#FF9500')}
                              </View>
                            )}
                            {s('medicalNotes') && clientProfile.medicalNotes ? (
                              <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                <Text style={[styles.rowLabel, { color: '#FF3B30' }]}>⚕ Medical notes</Text>
                                <Text style={[styles.rowValue, { color: P.text, flex: 1, textAlign: 'left', marginLeft: 8 }]}>{clientProfile.medicalNotes}</Text>
                              </View>
                            ) : null}

                            {/* ── SKIN ── */}
                            {hasSkin && (
                              <>
                                {catLabel('Skin')}
                                {s('skinType') && clientProfile.skinType ? <Row label="Skin type" value={clientProfile.skinType} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('skinTone') && clientProfile.skinTone ? <Row label="Skin tone" value={clientProfile.skinTone} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('skinConcerns') && clientProfile.skinConcerns.length > 0 && (
                                  <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                    <Text style={[styles.rowLabel, { color: P.text }]}>Skin concerns</Text>
                                    {CR(clientProfile.skinConcerns)}
                                  </View>
                                )}
                                {s('sensitiveAreas') && clientProfile.sensitiveAreas.length > 0 && (
                                  <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                    <Text style={[styles.rowLabel, { color: P.text }]}>Sensitive areas</Text>
                                    {CR(clientProfile.sensitiveAreas)}
                                  </View>
                                )}
                              </>
                            )}

                            {/* ── HAIR ── */}
                            {hasHair && (
                              <>
                                {catLabel('Hair')}
                                {s('hairType') && clientProfile.hairType ? <Row label="Hair type" value={clientProfile.hairType} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('scalpCondition') && clientProfile.scalpCondition ? <Row label="Scalp condition" value={clientProfile.scalpCondition} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('treatmentHistory') && clientProfile.treatmentHistory.length > 0 && (
                                  <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                    <Text style={[styles.rowLabel, { color: P.text }]}>Treatment history</Text>
                                    {CR(clientProfile.treatmentHistory)}
                                  </View>
                                )}
                                {s('hairGoals') && clientProfile.hairGoals.length > 0 && (
                                  <View style={[styles.profileChipRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: rowDiv }]}>
                                    <Text style={[styles.rowLabel, { color: P.text }]}>Hair goals</Text>
                                    {CR(clientProfile.hairGoals)}
                                  </View>
                                )}
                              </>
                            )}

                            {/* ── NAILS ── */}
                            {hasNails && (
                              <>
                                {catLabel('Nails')}
                                {s('nailLength') && clientProfile.nailLength ? <Row label="Preferred length" value={clientProfile.nailLength} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('nailShape') && clientProfile.nailShape ? <Row label="Preferred shape" value={clientProfile.nailShape} textColor={P.text} divColor={rowDiv} /> : null}
                              </>
                            )}

                            {/* ── LASHES & BROWS ── */}
                            {hasLashesBrows && (
                              <>
                                {catLabel('Lashes & Brows')}
                                {s('lashStyle') && clientProfile.lashStyle ? <Row label="Lash style" value={clientProfile.lashStyle} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('lashStatus') && clientProfile.lashStatus ? <Row label="Lash status" value={clientProfile.lashStatus} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('browStyle') && clientProfile.browStyle ? <Row label="Brow style" value={clientProfile.browStyle} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('browCondition') && clientProfile.browCondition ? <Row label="Brow condition" value={clientProfile.browCondition} textColor={P.text} divColor={rowDiv} /> : null}
                              </>
                            )}

                            {/* ── MAKEUP ── */}
                            {hasMakeup && (
                              <>
                                {catLabel('Makeup')}
                                {s('makeupCoverage') && clientProfile.makeupCoverage ? <Row label="Coverage" value={clientProfile.makeupCoverage} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('makeupFinish') && clientProfile.makeupFinish ? <Row label="Finish" value={clientProfile.makeupFinish} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('makeupEyes') && clientProfile.makeupEyes ? <Row label="Eye style" value={clientProfile.makeupEyes} textColor={P.text} divColor={rowDiv} /> : null}
                                {s('makeupLips') && clientProfile.makeupLips ? <Row label="Lip preference" value={clientProfile.makeupLips} textColor={P.text} divColor={rowDiv} /> : null}
                              </>
                            )}

                            {/* ── STYLE ── */}
                            {hasStyle && (
                              <>
                                {catLabel('Style')}
                                <Row label="Style vibe" value={clientProfile.styleVibe!} textColor={P.text} divColor={rowDiv} />
                              </>
                            )}

                            {/* ── CONSENT ── */}
                            {catLabel('Consent')}
                            {s('photographyConsent') && (
                              <Row
                                label="Photography consent"
                                value={clientProfile.photographyConsent ? 'Yes' : 'No'}
                                textColor={P.text} divColor={rowDiv} last
                                valueColor={clientProfile.photographyConsent ? '#34C759' : '#FF3B30'}
                              />
                            )}
                          </>
                        );
                      })()}
                    </View>
                    <Perf color={perf} />
                  </>
                );
              })()}

              {/* ── FORMS & PACKS section — receiving area only, no creation here.
                    Forms/packs are built in their own screens and auto-send. ── */}
              <View style={styles.section}>
                <View style={styles.intakeFormHeader}>
                  <Text style={[styles.sectionLabel, { color: P.sub }]}>FORMS & PACKS</Text>
                </View>
                {intakeForm ? (
                  <TouchableOpacity
                    style={[styles.intakeFormCard, {
                      backgroundColor: intakeForm.status === 'completed' ? '#34C759' + '12' : '#FF9500' + '12',
                      borderColor: intakeForm.status === 'completed' ? '#34C759' + '44' : '#FF9500' + '44',
                    }]}
                    onPress={() => navigation.navigate('ProviderIntakeForm', {
                      bookingId: booking!.id,
                      clientUserId: clientUserId ?? '',
                      serviceName: booking!.serviceName,
                      formId: intakeForm.id,
                    })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.intakeFormCardInner}>
                      <Text style={[styles.intakeFormTitle, { color: P.text }]}>{intakeForm.title}</Text>
                      <View style={[styles.intakeFormStatus, {
                        backgroundColor: intakeForm.status === 'completed' ? '#34C759' + '22' : '#FF9500' + '22',
                      }]}>
                        <Text style={[styles.intakeFormStatusText, {
                          color: intakeForm.status === 'completed' ? '#34C759' : '#FF9500',
                        }]}>
                          {intakeForm.status === 'completed' ? '✓ Received' : '⏳ Sent'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.intakeFormSub, { color: P.sub }]}>
                      {intakeForm.status === 'completed'
                        ? 'Client responses received — tap to view'
                        : 'Sent to client — waiting to receive'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.intakeFormEmpty, { color: P.sub }]}>
                    No form on this booking — forms linked to this service send automatically.
                  </Text>
                )}

                {/* Info packs sent with this booking + read receipts */}
                {bookingInfoPacks.map(pack => (
                  <View
                    key={pack.id}
                    style={[styles.intakeFormCard, {
                      marginTop: 8,
                      backgroundColor: pack.viewedAt ? '#34C759' + '12' : P.card,
                      borderColor: pack.viewedAt ? '#34C759' + '44' : P.border,
                    }]}
                  >
                    <View style={styles.intakeFormCardInner}>
                      <Text style={[styles.intakeFormTitle, { color: P.text }]}>📄 {pack.title}</Text>
                      <View style={[styles.intakeFormStatus, {
                        backgroundColor: pack.viewedAt ? '#34C759' + '22' : P.sub + '22',
                      }]}>
                        <Text style={[styles.intakeFormStatusText, {
                          color: pack.viewedAt ? '#34C759' : P.sub,
                        }]}>
                          {pack.viewedAt ? '✓ Read' : '⏳ Sent'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.intakeFormSub, { color: P.sub }]}>
                      {pack.viewedAt
                        ? 'Client has read this info pack'
                        : 'Sent to client — not read yet'}
                    </Text>
                  </View>
                ))}
              </View>

              {/* ── Perforated divider ── */}
              <Perf color={perf} />

              {/* ── PAYMENT section ── */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: P.sub }]}>PAYMENT</Text>
                <Row
                  label={booking.paymentType === 'deposit' ? 'Deposit paid' : 'Full payment'}
                  value={`£${booking.amountPaid.toFixed(2)}`}
                  textColor={P.text}
                  divColor={rowDiv}
                  valueColor="#34C759"
                  bold
                />
                {booking.remainingBalance > 0 && !balanceCollected && (
                  <>
                    <Row
                      label="Balance due"
                      value={`£${booking.remainingBalance.toFixed(2)}`}
                      textColor={P.text}
                      divColor={rowDiv}
                      valueColor="#FF9500"
                      bold
                    />
                    {(booking.status === BookingStatus.UPCOMING || booking.status === BookingStatus.IN_PROGRESS) && (
                      <TouchableOpacity
                        style={[styles.collectBalanceRow, { borderColor: isDarkMode ? 'rgba(255,149,0,0.25)' : 'rgba(255,149,0,0.3)', backgroundColor: isDarkMode ? 'rgba(255,149,0,0.08)' : 'rgba(255,149,0,0.06)' }]}
                        onPress={handleCollectBalance}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="checkmark-circle-outline" size={15} color="#FF9500" style={{ marginRight: 6 }} />
                        <Text style={[styles.collectBalanceText, { color: '#FF9500' }]}>Mark balance collected</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                {balanceCollected && (
                  <View style={[styles.collectBalanceRow, { borderColor: '#34C75940', backgroundColor: '#34C75910' }]}>
                    <Ionicons name="checkmark-circle" size={15} color="#34C759" style={{ marginRight: 6 }} />
                    <Text style={[styles.collectBalanceText, { color: '#34C759' }]}>Balance collected</Text>
                  </View>
                )}

                {/* Grand total block */}
                <View style={[styles.totalBlock, { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]}>
                  <Text style={[styles.totalLabel, { color: P.text }]}>TOTAL</Text>
                  <Text style={[styles.totalValue, { color: P.text }]}>£{totalPrice.toFixed(2)}</Text>
                </View>
              </View>

              {/* ── Reschedule section ── */}
              {hasRescheduleRequest && dbReschedule && (
                <>
                  <Perf color={perf} />
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: '#FF9500' }]}>
                      {dbReschedule.status === 'pending' ? 'RESCHEDULE REQUEST' : 'RESCHEDULE · RESPONDED'}
                    </Text>
                    <Text style={[styles.rescheduleNote, { color: P.sub }]}>
                      Requested {formatDisplayDate(dbReschedule.created_at.split('T')[0] ?? dbReschedule.created_at)}
                    </Text>
                    {(dbReschedule.requested_dates ?? []).map((date: string, i: number) => (
                      <View key={i} style={[styles.slotChip, { backgroundColor: '#FF9500' + '18', borderColor: '#FF9500' + '44' }]}>
                        <Text style={[styles.slotChipText, { color: P.text }]}>📅  {formatDisplayDate(date)}</Text>
                      </View>
                    ))}
                    {dbReschedule.status === 'provider_responded' && (dbReschedule.provider_available_slots ?? []).length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={[styles.rescheduleNote, { color: P.text + '77', marginBottom: 6 }]}>Your offered slots:</Text>
                        {(dbReschedule.provider_available_slots ?? []).map((slot, i) => (
                          <View key={i} style={[styles.slotChip, { backgroundColor: '#34C75915', borderColor: '#34C75944' }]}>
                            <Text style={[styles.slotChipText, { color: P.text }]}>
                              ✅  {formatDisplayDate(slot.date)}  ·  {(slot.times ?? []).join(', ')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {canRespondToReschedule && (
                      <TouchableOpacity
                        style={[styles.respondBtn, { backgroundColor: '#FF9500' }]}
                        onPress={() => setShowRespondModal(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.respondBtnText}>Respond to Reschedule</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              {/* ── Receipt Footer ── */}
              <View style={[styles.receiptFooter, { borderTopColor: perf }]}>
                <Text style={[styles.footerText, { color: P.sub }]}>
                  #{booking.id?.slice(0, 8).toUpperCase() ?? ''}
                </Text>
                <Text style={[styles.footerText, { color: P.sub }]}>cerviced.app</Text>
              </View>

            </View>
          </BlurView>
          </View>{/* receiptOuter */}
        </View>{/* receiptScene */}

        {/* ── Action buttons below the receipt ── */}
        {isPendingConfirmation && (
          <View style={styles.actions}>
            {pendingExpired ? (
              <Text style={{ textAlign: 'center', fontSize: 13, color: '#FF9500', marginBottom: 10 }}>
                This request's appointment time has passed — it can no longer be confirmed.
              </Text>
            ) : (
              <ActionButton color="#34C759" label="Confirm Booking" onPress={handleConfirm} />
            )}
            <ActionButton color="#FF3B30" label="Decline Booking" onPress={handleDecline} ghost />
          </View>
        )}
        {isActive && (
          <View style={styles.actions}>
            {booking.status === BookingStatus.UPCOMING && (
              isApptToday ? (
                <ActionButton color={P.accent} label="Start Appointment" onPress={() => handleStatusChange(BookingStatus.IN_PROGRESS)} />
              ) : (
                <Text style={{ textAlign: 'center', fontSize: 13, color: P.sub, marginBottom: 10 }}>
                  {apptStartPassed
                    ? 'The appointment day has passed — mark it No Show or Cancel.'
                    : `You can start this appointment on ${formatDisplayDate(booking.bookingDate)}.`}
                </Text>
              )
            )}
            {booking.status === BookingStatus.IN_PROGRESS && (
              <ActionButton color={P.accent} label="Mark Complete" onPress={() => handleStatusChange(BookingStatus.COMPLETED)} />
            )}
            <View style={styles.secondaryActions}>
              {apptStartPassed && booking.status !== BookingStatus.IN_PROGRESS && (
                <ActionButton color="#FF9500" label="No Show" onPress={() => handleStatusChange(BookingStatus.NO_SHOW)} ghost />
              )}
              <ActionButton color="#FF3B30" label="Cancel" onPress={handleCancel} ghost />
            </View>
          </View>
        )}

        <View style={{ height: 56 }} />
      </ScrollView>

      {/* Reschedule Respond Modal */}
      <Modal
        visible={showRespondModal}
        transparent
        animationType="slide"
        onRequestClose={closeRespondModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.respondModal, { backgroundColor: P.card }]}>

            {respondSent ? (
              /* ── Success state ── */
              <View style={styles.sentState}>
                <Text style={styles.sentIcon}>✓</Text>
                <Text style={[styles.sentTitle, { color: P.text }]}>Response Sent</Text>
                <Text style={[styles.sentSub, { color: P.text + '88' }]}>
                  The client has been notified of your available dates.
                </Text>
                <TouchableOpacity
                  style={[styles.respondModalBtn, { backgroundColor: '#FF9500', marginTop: 20, alignSelf: 'stretch' }]}
                  onPress={closeRespondModal}
                >
                  <Text style={styles.respondModalBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.respondModalTitle, { color: P.text }]}>Send Available Dates</Text>

                {/* Client's requested dates */}
                {(dbReschedule?.requested_dates ?? []).length > 0 && (
                  <View style={{ marginBottom: 4 }}>
                    <Text style={[styles.inputLabel, { color: P.text + '66', marginBottom: 4 }]}>CLIENT REQUESTED</Text>
                    {(dbReschedule?.requested_dates ?? []).map((d, i) => (
                      <Text key={i} style={[styles.respondModalSub, { color: P.text + '99' }]}>{formatDisplayDate(d)}</Text>
                    ))}
                  </View>
                )}

                {/* Apology toggle */}
                <TouchableOpacity
                  style={[styles.apologyToggle, {
                    backgroundColor: sendApology
                      ? (isDarkMode ? 'rgba(255,59,48,0.15)' : 'rgba(255,59,48,0.08)')
                      : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    borderColor: sendApology ? '#FF3B30' + '66' : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'),
                  }]}
                  onPress={() => setSendApology(v => !v)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.apologyCheck, {
                    backgroundColor: sendApology ? '#FF3B30' : 'transparent',
                    borderColor: sendApology ? '#FF3B30' : (isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'),
                  }]}>
                    {sendApology && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>x</Text>}
                  </View>
                  <Text style={[styles.apologyToggleText, { color: sendApology ? '#FF3B30' : P.text + 'AA' }]}>
                    Apologise — none of the requested dates work
                  </Text>
                </TouchableOpacity>

                {sendApology && (
                  <TextInput
                    style={[styles.respondInput, styles.apologyInput, { color: P.text, borderColor: '#FF3B30' + '44', backgroundColor: isDarkMode ? 'rgba(255,59,48,0.08)' : 'rgba(255,59,48,0.04)' }]}
                    value={apologyText}
                    onChangeText={setApologyText}
                    multiline
                    numberOfLines={3}
                    placeholderTextColor={P.text + '44'}
                  />
                )}

                <View style={[styles.divider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginVertical: 16 }]} />

                {/* Date input — auto-formats DD/MM/YYYY, triggers slot fetch when complete */}
                <Text style={[styles.inputLabel, { color: P.text + '88' }]}>DATE</Text>
                <TextInput
                  style={[styles.respondInput, { color: P.text, borderColor: inputError ? '#FF3B30' : (isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'), backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={P.text + '44'}
                  value={slotDate}
                  onChangeText={v => { setInputError(''); setSlotDate(formatDateInput(v)); }}
                  keyboardType="number-pad"
                />

                {/* Auto-loaded time chips */}
                {loadingTimes && (
                  <View style={styles.chipsLoadingRow}>
                    <ActivityIndicator size="small" color="#FF9500" />
                    <Text style={[styles.chipsLoadingText, { color: P.sub }]}>Loading your availability</Text>
                  </View>
                )}
                {!loadingTimes && suggestedTimes.length > 0 && (
                  <View style={styles.chipsSection}>
                    <Text style={[styles.inputLabel, { color: P.text + '88' }]}>YOUR AVAILABLE SLOTS</Text>
                    <View style={styles.chipsRow}>
                      {suggestedTimes.map(time => {
                        const on = selectedTimes.includes(time);
                        return (
                          <TouchableOpacity
                            key={time}
                            style={[
                              styles.timeChip,
                              on
                                ? { backgroundColor: '#FF9500', borderColor: '#FF9500' }
                                : { backgroundColor: 'transparent', borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
                            ]}
                            onPress={() => toggleTime(time)}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.timeChipText, { color: on ? '#fff' : P.text + 'CC' }]}>{time}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
                {!loadingTimes && !!parseDDMMYYYY(slotDate) && suggestedTimes.length === 0 && (
                  <Text style={[styles.noSlotsText, { color: P.sub }]}>No availability set for this date.</Text>
                )}

                {/* Manual / extra times */}
                <Text style={[styles.inputLabel, { color: P.text + '88', marginTop: 10 }]}>
                  {suggestedTimes.length > 0 ? 'ADD EXTRA TIMES (OPTIONAL)' : 'TIMES'}
                </Text>
                <TextInput
                  style={[styles.respondInput, { color: P.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  placeholder="e.g. 10:00, 14:30"
                  placeholderTextColor={P.text + '44'}
                  value={slotTimes}
                  onChangeText={setSlotTimes}
                  keyboardType="numbers-and-punctuation"
                />

                {!!inputError && (
                  <Text style={styles.inputErrorText}>{inputError}</Text>
                )}

                <TouchableOpacity
                  style={[styles.addSlotBtn, { borderColor: '#FF9500' }]}
                  onPress={handleAddSlot}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.addSlotBtnText, { color: '#FF9500' }]}>+ Add Date</Text>
                </TouchableOpacity>

                {/* Accumulated outbound slots */}
                {outboundSlots.length > 0 && (
                  <View style={styles.slotsList}>
                    <Text style={[styles.inputLabel, { color: '#FF9500' }]}>
                      {sendApology ? 'ALTERNATIVE DATES' : 'DATES BEING SENT'}
                    </Text>
                    {outboundSlots.map((slot, i) => (
                      <View key={i} style={[styles.slotRow, { backgroundColor: isDarkMode ? 'rgba(255,149,0,0.12)' : 'rgba(255,149,0,0.08)' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.slotRowDate, { color: P.text }]}>{formatDisplayDate(slot.date)}</Text>
                          <Text style={[styles.slotRowTimes, { color: P.text + '99' }]}>{slot.times.join('  ·  ')}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setOutboundSlots(prev => prev.filter((_, idx) => idx !== i))}>
                          <Text style={{ color: '#FF3B30', fontSize: 18, paddingLeft: 10 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={[styles.respondModalActions, { marginTop: 16 }]}>
                  <TouchableOpacity
                    style={[styles.respondModalBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]}
                    onPress={closeRespondModal}
                  >
                    <Text style={[styles.respondModalBtnText, { color: P.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.respondModalBtn, { backgroundColor: outboundSlots.length > 0 ? '#FF9500' : '#FF950055', opacity: respondLoading ? 0.6 : 1 }]}
                    onPress={handleRespondSubmit}
                    disabled={respondLoading || outboundSlots.length === 0}
                  >
                    {respondLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.respondModalBtnText}>Send Response</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Client history modal ── */}
      <Modal
        visible={clientHistoryVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setClientHistoryVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.respondModal, { backgroundColor: P.card, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={[styles.respondModalTitle, { color: P.text }]}>
                {booking?.customerName ? `${booking.customerName}'s History` : 'Client History'}
              </Text>
              <TouchableOpacity onPress={() => setClientHistoryVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={P.text} />
              </TouchableOpacity>
            </View>
            {clientHistoryLoading ? (
              <ActivityIndicator color={P.accent} style={{ marginVertical: 32 }} />
            ) : clientHistoryBookings.length === 0 ? (
              <Text style={[styles.respondModalSub, { color: P.sub, textAlign: 'center', marginVertical: 24 }]}>
                No previous bookings found.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 504 }}>
                {clientHistoryBookings.map((h, i) => {
                  const statusColor =
                    h.status === 'completed' ? '#34C759' :
                    h.status === 'cancelled' ? '#FF3B30' :
                    h.status === 'no_show'   ? '#FF9500' : P.sub;
                  const dateParts = (h.booking_date ?? '').split('-');
                  const displayDate = dateParts.length === 3
                    ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
                    : h.booking_date ?? '';
                  const amount = (h.base_price ?? 0) + (h.add_ons_total ?? 0);
                  return (
                    <View
                      key={h.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        borderBottomWidth: i < clientHistoryBookings.length - 1 ? StyleSheet.hairlineWidth : 0,
                        borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        gap: 12,
                      }}
                    >
                      <View style={{ alignItems: 'center', minWidth: 36 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: P.text }}>
                          {dateParts[2] ?? '—'}
                        </Text>
                        <Text style={{ fontSize: 10, color: P.sub, textTransform: 'uppercase' }}>
                          {dateParts[1] ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(dateParts[1]) - 1] ?? '' : ''}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: P.text }} numberOfLines={1}>
                          {h.service_name_snapshot ?? 'Service'}
                        </Text>
                        <Text style={{ fontSize: 11, color: P.sub, marginTop: 2 }}>
                          {displayDate}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: P.text }}>
                        £{amount.toFixed(2)}
                      </Text>
                      <View style={{ backgroundColor: statusColor + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }}>
                          {h.status?.replace('_', ' ') ?? ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Provider-initiated reschedule modal ── */}
      <Modal
        visible={showInitRescheduleModal}
        transparent
        animationType="slide"
        onRequestClose={closeInitRescheduleModal}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.respondModal, { backgroundColor: P.card }]}>
            {initSent ? (
              <View style={styles.sentState}>
                <Text style={styles.sentIcon}>✓</Text>
                <Text style={[styles.sentTitle, { color: P.text }]}>Request Sent</Text>
                <Text style={[styles.sentSub, { color: P.text + '88' }]}>
                  {booking?.customerName ?? 'The client'} has been notified and can choose from your proposed times.
                </Text>
                <TouchableOpacity
                  style={[styles.respondModalBtn, { backgroundColor: '#FF9500', marginTop: 20, alignSelf: 'stretch' }]}
                  onPress={closeInitRescheduleModal}
                >
                  <Text style={styles.respondModalBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.respondModalTitle, { color: P.text }]}>Propose New Times</Text>
                <Text style={[styles.respondModalSub, { color: P.text + '77', marginBottom: 14 }]}>
                  Add the dates and times you're available. The client will pick one to confirm.
                </Text>

                {/* Date input */}
                <Text style={[styles.inputLabel, { color: P.text + '77' }]}>DATE (DD/MM/YYYY)</Text>
                <TextInput
                  style={[styles.respondInput, { color: P.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  value={initSlotDate}
                  onChangeText={v => setInitSlotDate(formatDateInput(v))}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={P.text + '44'}
                  keyboardType="numeric"
                />

                {/* Suggested chips */}
                {initLoadingTimes && <ActivityIndicator size="small" color={P.accent} style={{ marginBottom: 8 }} />}
                {initSuggestedTimes.length > 0 && (
                  <View style={styles.chipsRow}>
                    {initSuggestedTimes.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, initSelectedTimes.includes(t) && { backgroundColor: P.accent }]}
                        onPress={() => toggleInitTime(t)}
                      >
                        <Text style={[styles.timeChipText, { color: initSelectedTimes.includes(t) ? '#fff' : P.text }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Manual time entry */}
                <Text style={[styles.inputLabel, { color: P.text + '77', marginTop: 8 }]}>TIMES (comma-separated)</Text>
                <TextInput
                  style={[styles.respondInput, { color: P.text, borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  value={initSlotTimes}
                  onChangeText={setInitSlotTimes}
                  placeholder="e.g. 10:00, 14:30"
                  placeholderTextColor={P.text + '44'}
                />

                <TouchableOpacity style={[styles.addSlotBtn, { borderColor: P.accent + '66' }]} onPress={handleAddInitSlot}>
                  <Text style={[styles.addSlotBtnText, { color: P.accent }]}>+ Add date</Text>
                </TouchableOpacity>

                {initInputError ? <Text style={styles.inputErrorText}>{initInputError}</Text> : null}

                {/* Added slots */}
                {initRescheduleSlots.map((slot, i) => (
                  <View key={i} style={[styles.slotRow, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.slotRowDate, { color: P.text }]}>{formatDisplayDate(slot.date)}</Text>
                      <Text style={[styles.slotRowTimes, { color: P.text + '88' }]}>{slot.times.join(', ')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setInitRescheduleSlots(prev => prev.filter((_, idx) => idx !== i))}>
                      <Ionicons name="close-circle" size={18} color={P.text + '55'} />
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={[styles.respondModalActions, { marginTop: 16 }]}>
                  <TouchableOpacity style={[styles.respondModalBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]} onPress={closeInitRescheduleModal}>
                    <Text style={[styles.respondModalBtnText, { color: P.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.respondModalBtn, { backgroundColor: initRescheduleSlots.length > 0 ? '#FF9500' : '#FF950055', opacity: initLoading ? 0.6 : 1 }]}
                    onPress={handleInitRescheduleSubmit}
                    disabled={initLoading || initRescheduleSlots.length === 0}
                  >
                    {initLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.respondModalBtnText}>Send Request</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Help dropdown ── */}
      <Modal
        visible={showHelpDropdown}
        transparent
        animationType="none"
        onRequestClose={() => setShowHelpDropdown(false)}
      >
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowHelpDropdown(false)}
          />
          <View style={[styles.helpDropdownCard, {
            top: insets.top + 62,
            right: 16,
            width: 240,
            backgroundColor: isDarkMode ? '#2C2926' : '#FFFFFF',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
          }]}>
            <View style={styles.helpDropdownContent}>
              <View style={styles.helpDropdownRow}>
                <Text style={[styles.helpDropdownLabel, { color: P.accent }]}>SERVICE</Text>
                <Text style={[styles.helpDropdownBody, { color: P.text }]}>Base price plus any add-ons selected at booking.</Text>
              </View>
              <View style={[styles.helpDropdownDivider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]} />
              <View style={styles.helpDropdownRow}>
                <Text style={[styles.helpDropdownLabel, { color: P.accent }]}>PAYMENT</Text>
                <Text style={[styles.helpDropdownBody, { color: P.text }]}>Any deposit paid, balance remaining, and the full total.</Text>
              </View>
              <View style={[styles.helpDropdownDivider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]} />
              <View style={styles.helpDropdownRow}>
                <Text style={[styles.helpDropdownLabel, { color: P.accent }]}>REF</Text>
                <Text style={[styles.helpDropdownBody, { color: P.text }]}>Unique booking ID — quote this when contacting support.</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Support dropdown ── */}
      <Modal
        visible={showMoreSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoreSheet(false)}
      >
        <TouchableOpacity style={styles.moreSheetOverlay} activeOpacity={1} onPress={() => setShowMoreSheet(false)} />
        <View style={[styles.moreSheet, { backgroundColor: isDarkMode ? '#1C1C1E' : '#F2F2F7' }]}>
          <View style={[styles.moreSheetHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)' }]} />
          {booking && (booking.status === BookingStatus.UPCOMING || booking.status === BookingStatus.IN_PROGRESS) && (
            <TouchableOpacity
              style={[styles.moreSheetRow, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
              onPress={() => { setShowMoreSheet(false); setTimeout(() => setShowInitRescheduleModal(true), 260); }}
              activeOpacity={0.7}
            >
              <View style={[styles.moreSheetIcon, { backgroundColor: '#FF950018' }]}>
                <Ionicons name="calendar-outline" size={18} color="#FF9500" />
              </View>
              <View style={styles.moreSheetTextBlock}>
                <Text style={[styles.moreSheetTitle, { color: P.text }]}>Request Reschedule</Text>
                <Text style={[styles.moreSheetSub, { color: P.text + '66' }]}>Propose new times to the client</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={P.text + '44'} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.moreSheetRow}
            onPress={() => { setShowMoreSheet(false); Linking.openURL('mailto:support@cerviced.app?subject=Booking%20Support'); }}
            activeOpacity={0.7}
          >
            <View style={[styles.moreSheetIcon, { backgroundColor: '#007AFF18' }]}>
              <Ionicons name="headset-outline" size={18} color="#007AFF" />
            </View>
            <View style={styles.moreSheetTextBlock}>
              <Text style={[styles.moreSheetTitle, { color: P.text }]}>Get Support</Text>
              <Text style={[styles.moreSheetSub, { color: P.text + '66' }]}>Contact the CERVICED team</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={P.text + '44'} />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Confirm/decline dialog ── */}
      <Modal
        visible={!!pendingConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingConfirm(null)}
      >
        <TouchableOpacity
          style={styles.dialogOverlay}
          activeOpacity={1}
          onPress={() => setPendingConfirm(null)}
        />
        {pendingConfirm && (
          <View style={styles.dialogPositioner} pointerEvents="box-none">
            <View style={[styles.dialog, { backgroundColor: P.card }]}>
              <Text style={[styles.dialogTitle, { color: P.text }]}>{pendingConfirm.title}</Text>
              <Text style={[styles.dialogMessage, { color: P.text + '88' }]}>{pendingConfirm.message}</Text>
              <View style={[styles.dialogDivider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />
              <TouchableOpacity
                style={styles.dialogBtn}
                activeOpacity={0.65}
                onPress={() => {
                  const fn = pendingConfirm.onConfirm;
                  setPendingConfirm(null);
                  Promise.resolve(fn()).catch(() =>
                    Alert.alert('Action failed', 'Could not complete this action. Check your connection and try again.')
                  );
                }}
              >
                <Text style={[styles.dialogBtnText, { color: pendingConfirm.destructive ? '#FF3B30' : '#007AFF', fontWeight: '600' }]}>
                  {pendingConfirm.confirmLabel}
                </Text>
              </TouchableOpacity>
              <View style={[styles.dialogDivider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />
              <TouchableOpacity
                style={styles.dialogBtn}
                activeOpacity={0.65}
                onPress={() => setPendingConfirm(null)}
              >
                <Text style={[styles.dialogBtnText, { color: P.text + 'AA' }]}>Keep</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Perforated receipt divider */
function Perf({ color }: { color: string }) {
  return (
    <View style={styles.perfRow}>
      {Array.from({ length: 24 }).map((_, i) => (
        <View key={i} style={[styles.perfDot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** Single label/value row inside the receipt */
function Row({
  label,
  value,
  textColor,
  divColor,
  bold,
  indent,
  last,
  valueColor,
}: {
  label: string;
  value: string;
  textColor: string;
  divColor: string;
  bold?: boolean;
  indent?: boolean;
  last?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={[
      styles.row,
      !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divColor },
    ]}>
      <Text style={[
        styles.rowLabel,
        { color: indent ? textColor + '88' : textColor },
        bold && styles.rowLabelBold,
        indent && { paddingLeft: 12 },
      ]} numberOfLines={1}>
        {indent ? '· ' : ''}{label}
      </Text>
      <Text style={[
        styles.rowValue,
        { color: valueColor ?? (indent ? textColor + '88' : textColor) },
        bold && styles.rowValueBold,
      ]}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  color,
  label,
  onPress,
  ghost,
}: {
  color: string;
  label: string;
  onPress: () => void;
  ghost?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        ghost
          ? { backgroundColor: color + '14', borderWidth: 1.5, borderColor: color + '55' }
          : { backgroundColor: color },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.actionBtnText, ghost && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:      { flex: 1 },
  container: { flex: 1 },
  content:   { paddingHorizontal: 16, paddingBottom: 40 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16 },

  // ── Calendar-style header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  // ── Support dropdown ──
  supportDropdown: {
    position: 'absolute',
    right: 16,
    minWidth: 160,
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  supportDropdownBlur: {
    borderRadius: 22,
  },
  supportDropdownInner: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  supportDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  supportDropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Help dropdown ──
  helpDropdownCard: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: { elevation: 14 },
    }),
  },
  helpDropdownContent: {
    paddingVertical: 4,
  },
  helpDropdownRow: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  helpDropdownLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  helpDropdownBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  helpDropdownDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
  },
  // ── Receipt 3D scene ──
  receiptScene: {
    marginBottom: 20,
    // lift the whole scene with a deep shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.22,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },

  // Depth layer base
  receiptDepthLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 22,
    borderWidth: 1,
  },
  receiptDepth3: {
    transform: [{ translateY: 10 }, { scaleX: 0.94 }],
    opacity: 0.6,
  },
  receiptDepth2: {
    transform: [{ translateY: 6 }, { scaleX: 0.96 }],
    opacity: 0.75,
  },
  receiptDepth1: {
    transform: [{ translateY: 3 }, { scaleX: 0.98 }],
    opacity: 0.90,
  },

  // Main receipt card
  receiptOuter: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  receiptBlur: { borderRadius: 22 },
  receiptCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Top-edge highlight — simulates light catching the top rim
  receiptTopHighlight: {
    height: 2,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 2,
    marginBottom: -4,
  },

  // ── Receipt header ──
  receiptHeader: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  receiptHelpBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    padding: 4,
  },
  receiptBrand: {
    fontSize: 30,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 3,
    marginBottom: 4,
  },
  receiptSubBrand: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Perforated divider ──
  perfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 4,
  },
  perfDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // ── Section ──
  section: {
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },

  // ── Rows ──
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  rowLabelBold: {
    fontWeight: '700',
    fontSize: 15,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  rowValueBold: {
    fontWeight: '800',
    fontSize: 15,
  },

  // ── Service subtotal ──
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  subtotalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  subtotalValue: {
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Client ──
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '800',
  },
  clientNameLarge: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  contactBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  contactBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Payment total block ──
  totalBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1.5,
  },
  totalLabel: {
    fontSize: 20,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
  },

  // ── Completion banner ──
  completionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 22,
    marginBottom: 4,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  completionIcon: {
    fontSize: 26,
    color: '#34C759',
    fontWeight: '700',
  },
  completionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  completionSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // ── Reschedule ──
  rescheduleNote: {
    fontSize: 13,
    marginBottom: 10,
  },
  slotChip: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  slotChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  respondBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 13,
    alignItems: 'center',
  },
  respondBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Receipt footer ──
  receiptFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },

  // ── Action buttons (below receipt) ──
  actions: {
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Respond modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  respondModal: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  respondModalTitle: {
    fontSize: 20,
    fontFamily: 'BakbakOne-Regular',
    marginBottom: 6,
  },
  respondModalSub: {
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  respondInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  chipsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  chipsLoadingText: {
    fontSize: 13,
  },
  chipsSection: {
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  noSlotsText: {
    fontSize: 13,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  addSlotBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 16,
  },
  addSlotBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  slotsList: {
    marginBottom: 4,
    gap: 8,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  slotRowDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  slotRowTimes: {
    fontSize: 13,
    marginTop: 2,
  },
  respondModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  respondModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: 'center',
  },
  respondModalBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  sentState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  sentIcon: {
    fontSize: 44,
    color: '#34C759',
    marginBottom: 12,
  },
  sentTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  sentSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Apology toggle
  apologyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  apologyCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apologyToggleText: {
    fontSize: 14,
    flex: 1,
  },
  apologyInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 0,
  },
  inputErrorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginBottom: 8,
    marginTop: -4,
  },

  // Balance collection
  collectBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 8,
  },
  collectBalanceText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // More options sheet
  moreSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  moreSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  moreSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  moreSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  moreSheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreSheetTextBlock: {
    flex: 1,
  },
  moreSheetTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  moreSheetSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Confirm/decline dialog
  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dialogPositioner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  dialog: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  dialogMessage: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    lineHeight: 18,
  },
  dialogDivider: {
    height: StyleSheet.hairlineWidth,
  },
  dialogBtn: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  dialogBtnText: {
    fontSize: 17,
    fontWeight: '400',
  },

  // ── Client profile chips ──
  profileChipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 8,
  },
  profileChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  profileChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  profileChipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Notes section ──
  notesBlock: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Intake form section ──
  intakeFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  intakeFormPlusBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  intakeFormPlusBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  intakeFormCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  intakeFormCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  intakeFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  intakeFormStatus: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  intakeFormStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  intakeFormSub: {
    fontSize: 12,
  },
  intakeFormEmpty: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});

// ── Address section styles ────────────────────────────────────────────────────
const addrStyles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  addressBlock: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
    opacity: 0.5,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  policyDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
    opacity: 0.55,
  },
  releasedAt: {
    fontSize: 10,
    opacity: 0.45,
    textAlign: 'center',
    marginTop: 2,
  },
});
