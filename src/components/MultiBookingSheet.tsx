// src/components/MultiBookingSheet.tsx
// Booking flow for several services from one provider at once — used when
// the client multi-selects services on ProviderProfileScreen and taps
// "Book". Every selected service is shown together, and by default they're
// scheduled as one group on a single day the client picks via the same
// ModernBeautyCalendar used everywhere else in the app — no automatic day
// finder, the client always drives the calendar themselves, same as a
// normal single-service booking. Once a day is picked, the group's times
// are chain-fit back-to-back via AvailabilityService.findAllBackToBackSlots,
// with the client picking which of the fitting start times to use.
// Any individual service can be pulled out of the group via its own
// "Schedule separately" checkbox, which gives it its own independent
// calendar (own date and time), exactly like BookingSheet's single-service
// flow — for when the client wants one service on a different day.
// Add-ons are first decided before this sheet ever opens — a popup on
// ProviderProfileScreen shown the moment a service with add-ons gets
// selected — but stay editable here too via the same popup (AddOnPickerModal),
// opened from an "Edit"/"Add extras" link under each service on the "when"
// step, so a client doesn't have to back out of the sheet to change their
// mind. Deposit policy and the resulting notes/payment choice are shared across
// the whole group — they're the same provider for every item.
// Deliberately does not handle promo codes (BookingSheet's promo entry is
// single-service, mode="add"-only logic not part of this flow).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardDismissView } from './KeyboardDismissView';
import { ModernBeautyCalendar } from './ModernBeautyCalendar';
import { AvailabilityService, type BackToBackSlot } from '../services/AvailabilityService';
import { BookingService, DepositPolicy } from '../services/bookingService';
import {
  getProviderDepositPoliciesByDisplayNames,
  ProviderDepositPolicy,
} from '../services/databaseService';
import { buildThemeTokens, withAlpha, isDarkColor } from '../constants/providerThemes';
import { logger } from '../utils/logger';
import * as Haptics from 'expo-haptics';
import type { BookingSheetService } from './BookingSheet';
import { StepProgress } from './BookingSheet';
import { AddOnPickerModal } from './AddOnPickerModal';

/** Mirrors the single-service sheet's three shared steps. Add-ons are no
 *  longer a step here at all — they're decided per-service at selection
 *  time (a popup shown the moment a service with add-ons gets checked, see
 *  ProviderProfileScreen's toggleServiceSelected), so by the time this sheet
 *  opens every choice is already made. `initialAddOnsByService` just carries
 *  that decision in. */
type MultiBookingStep = 'when' | 'pay' | 'confirm';

export interface MultiBookingSheetResult {
  items: {
    service: BookingSheetService;
    selectedAddOns: { id: string | number; name: string; price: number }[];
    date: string;
    time: string;
    /** True if this service was pulled into "Schedule Separately" — stays a
     *  standalone singleton booking, not part of the group. */
    isSeparate: boolean;
  }[];
  /** Shared by every non-separate item in `items` from this one submission —
   *  undefined if every item ended up separate (nothing to group), or if the
   *  grouped bucket only ever contained a single service (a group of 1 isn't
   *  a group). Consumed by CartContext.addToCart as CartItem.bookingBatchId. */
  groupBatchId?: string | undefined;
  notes: string;
  isDepositOnly: boolean;
  /** Stamped only when the policy checkbox was ticked — mirrors
   *  BookingSheetResult's fields, see MultiBookingSheetProps.bookingPolicies. */
  policyAcceptedAt?: string;
  policySnapshot?: Record<string, unknown>;
}

interface MultiBookingSheetProps {
  isVisible: boolean;
  onClose: () => void;
  services: BookingSheetService[];
  /** Add-ons already chosen per service (keyed by serviceKeyOf) before this
   *  sheet ever opened — picked via the popup shown at selection time.
   *  Seeds the sheet's internal state; omit/empty for "nothing chosen". */
  initialAddOnsByService?: Record<string, SelectedAddOn[]>;
  /** Real provider UUID when known, else display name — for availability lookups. */
  providerIdentifier: string;
  /** Provider's display name — for deposit-policy lookups. */
  providerDisplayName: string;
  /** The provider's live cancellation/booking policy (providers.booking_policies)
   *  — same contract as BookingSheetProps.bookingPolicies. */
  bookingPolicies?: Record<string, unknown> | null;
  adaptiveAccentColor: string;
  /** Sheet's background colour — same contract as BookingSheet: caller
   *  always supplies it, no light/dark fallback of its own. */
  backgroundColor: string;
  onSubmit: (result: MultiBookingSheetResult) => void;
}

type SelectedAddOn = { id: string | number; name: string; price: number };
type ChainStatus = 'idle' | 'loading' | 'found' | 'not-found';

// Same guard as BookingSheet.tsx — dbId is the real services.id UUID for a
// live service, but a defensive check against any non-UUID id slipping
// through avoids feeding a malformed value into UUID-typed lookups.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = (service: BookingSheetService): string | undefined =>
  service.dbId && UUID_RE.test(service.dbId) ? service.dbId : undefined;

const serviceKeyOf = (service: BookingSheetService): string => String(service.dbId ?? service.id);

// RFC4122-shaped v4 UUID (Math.random is fine here — these are correlation
// ids, not security tokens). Same shape as BookingContext.tsx's local
// generateUuid — kept as its own copy rather than a cross-file import for
// one small pure function.
const generateUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// BackToBackSlot times are 12h display strings ("10:00 AM") — parsed here
// purely to compute the group's overall span (first start to last end) for
// a single "12:00pm - 3:00pm (3hrs)" summary instead of listing every
// service's own start time.
const parse12h = (t: string): number => {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return NaN;
  let h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const ap = m[3]!.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const formatDuration = (totalMin: number): string => {
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}min`;
  return mins === 0 ? `${hrs}hr` : `${hrs}hr ${mins}min`;
};

const formatShortDate = (dateStr: string): string =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

export const MultiBookingSheet: React.FC<MultiBookingSheetProps> = ({
  isVisible,
  onClose,
  services,
  initialAddOnsByService,
  providerIdentifier,
  providerDisplayName,
  bookingPolicies,
  adaptiveAccentColor,
  backgroundColor,
  onSubmit,
}) => {
  const sheetBackground = backgroundColor;
  const tokens = useMemo(
    () => buildThemeTokens(sheetBackground, sheetBackground, adaptiveAccentColor, sheetBackground),
    [sheetBackground, adaptiveAccentColor]
  );
  // See BookingSheet.tsx's identical onAccentColor — a pale accent (e.g. the
  // client dark-mode blue-grey #E5ECF4) makes hardcoded white text on the
  // close/submit buttons unreadable.
  const onAccentColor = useMemo(
    () => (isDarkColor(adaptiveAccentColor) ? '#fff' : '#1B2740'),
    [adaptiveAccentColor]
  );

  const [addOnsByService, setAddOnsByService] = useState<Record<string, SelectedAddOn[]>>({});
  // Which service's add-ons are being edited via the popup right now — null
  // when it's closed. Holding the service itself (not just its key) so the
  // popup has a name/add-on list to render without a second lookup.
  const [editingAddOnsService, setEditingAddOnsService] = useState<BookingSheetService | null>(null);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<MultiBookingStep>('when');
  const [isDepositOnly, setIsDepositOnly] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [depositPolicy, setDepositPolicy] = useState<ProviderDepositPolicy | undefined>(undefined);

  // Services pulled out of the shared-day group to be scheduled on their
  // own — everything starts grouped (empty set) by default. The per-service
  // checkboxes for picking which ones only show while separateSelectMode is
  // on — a single "Schedule Separately" toggle above the list, not a
  // checkbox sitting on every row all the time.
  const [separateServiceKeys, setSeparateServiceKeys] = useState<Set<string>>(new Set());
  const [separateSelectMode, setSeparateSelectMode] = useState(false);

  // Group scheduling — one calendar, one date, chain-fit across every
  // still-grouped service once a date is picked.
  const [groupDate, setGroupDate] = useState('');
  const [groupTime, setGroupTime] = useState('');
  const [groupChainStatus, setGroupChainStatus] = useState<ChainStatus>('idle');
  // Every chain that fits on the picked day, keyed by its start time, so the
  // time the client taps resolves to that chain. Previously this held only the
  // EARLIEST fitting chain and ignored groupTime entirely — so picking 1:00pm
  // still booked (and summarised) the provider's first opening.
  const [groupChains, setGroupChains] = useState<BackToBackSlot[][] | null>(null);

  // Per-separated-service scheduling — own date/time state per service key,
  // auto-resolved to the earliest slot once, same as BookingSheet does for
  // a single service, but editable via that service's own calendar after.
  const [separateDates, setSeparateDates] = useState<Record<string, string>>({});
  const [separateTimes, setSeparateTimes] = useState<Record<string, string>>({});
  const [resolvingSeparate, setResolvingSeparate] = useState<Record<string, boolean>>({});
  const separateResolvedRef = useRef<Set<string>>(new Set());

  const depositFetched = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reset local state each time the sheet opens. Unlike BookingSheet,
  // `services` is set once by the caller right before opening and never
  // swapped while still visible, so this only needs to key on `isVisible`.
  useEffect(() => {
    if (!isVisible) return;
    setAddOnsByService(initialAddOnsByService ?? {});
    setNotes('');
    setStep('when');
    setIsDepositOnly(false);
    setAgreedToPolicy(false);
    setSeparateServiceKeys(new Set());
    setSeparateSelectMode(false);
    setGroupDate('');
    setGroupTime('');
    setGroupChainStatus('idle');
    setGroupChains(null);
    setSeparateDates({});
    setSeparateTimes({});
    setResolvingSeparate({});
    separateResolvedRef.current = new Set();
    depositFetched.current = false;
  }, [initialAddOnsByService, isVisible]);

  const toggleSeparate = useCallback((serviceKey: string) => {
    setSeparateServiceKeys(prev => {
      const next = new Set(prev);
      if (next.has(serviceKey)) {
        next.delete(serviceKey);
        // Back in the group — drop its standalone slot so re-separating it
        // later resolves a fresh one rather than reusing a stale pick.
        separateResolvedRef.current.delete(serviceKey);
        setSeparateDates(prev2 => {
          const n = { ...prev2 };
          delete n[serviceKey];
          return n;
        });
        setSeparateTimes(prev2 => {
          const n = { ...prev2 };
          delete n[serviceKey];
          return n;
        });
      } else {
        next.add(serviceKey);
      }
      return next;
    });
    // Group membership just changed — the chain-fit result for the old
    // membership no longer applies; the effect below recomputes it against
    // the same groupDate (if one's already picked).
    setGroupChains(null);
    setGroupChainStatus('idle');
  }, []);

  const groupServices = useMemo(
    () => services.filter(s => !separateServiceKeys.has(serviceKeyOf(s))),
    [services, separateServiceKeys]
  );
  const separateServicesList = useMemo(
    () => services.filter(s => separateServiceKeys.has(serviceKeyOf(s))),
    [services, separateServiceKeys]
  );

  // Chain-fit the grouped services once a date is on the calendar (client
  // picked it — never auto-searched) and whenever group membership changes.
  useEffect(() => {
    if (!groupDate || groupServices.length === 0) {
      setGroupChains(null);
      setGroupChainStatus('idle');
      return;
    }
    let cancelled = false;
    // Clear the previous date's resolved chains synchronously, before the new
    // fetch even starts — otherwise the Booking Summary section below reads
    // the chain unconditionally and briefly shows the OLD date's time
    // against the newly-picked date's label during this loading window.
    setGroupChains(null);
    setGroupChainStatus('loading');
    AvailabilityService.findAllBackToBackSlots(
      providerIdentifier,
      groupServices.map(s => ({ serviceId: s.dbId || String(s.id), duration: s.duration })),
      groupDate,
    )
      .then(result => {
        if (cancelled) return;
        setGroupChains(result);
        setGroupChainStatus(result && result.length > 0 ? 'found' : 'not-found');
      })
      .catch(error => {
        if (cancelled) return;
        logger.error('Error chain-fitting group schedule:', error);
        setGroupChains(null);
        setGroupChainStatus('not-found');
      });
    return () => {
      cancelled = true;
    };
  }, [groupDate, groupServices, providerIdentifier]);

  // The chain for the time the client actually picked. Falls back to the
  // earliest only when no time is chosen yet, so the summary has something to
  // show — but once they pick, their choice wins.
  const groupSchedule = useMemo(() => {
    if (!groupChains || groupChains.length === 0) return null;
    if (!groupTime) return groupChains[0]!;
    return groupChains.find(chain => chain[0]!.time === groupTime) ?? null;
  }, [groupChains, groupTime]);

  // What counts as a bookable time for this group: a start where the WHOLE
  // chain fits. Feeding this to the calendar makes its day pills and time row
  // agree with the chain-fit lookup above — otherwise it offers times (based
  // on the first service's duration alone) that resolve to no chain at all.
  const groupSlotResolver = useCallback(
    async (date: string): Promise<string[]> => {
      if (groupServices.length === 0) return [];
      try {
        const chains = await AvailabilityService.findAllBackToBackSlots(
          providerIdentifier,
          groupServices.map(s => ({ serviceId: s.dbId || String(s.id), duration: s.duration })),
          date,
        );
        return chains ? chains.map(chain => chain[0]!.time) : [];
      } catch (error) {
        logger.error('Error resolving group slots:', error);
        return [];
      }
    },
    [groupServices, providerIdentifier]
  );

  // Auto-resolve the earliest slot for each newly-separated service — same
  // convention BookingSheet uses for a single service, just applied per
  // service here. Never re-fires for a service once resolved (tracked in
  // separateResolvedRef, cleared when a service rejoins the group).
  useEffect(() => {
    separateServicesList.forEach(service => {
      const key = serviceKeyOf(service);
      if (separateResolvedRef.current.has(key)) return;
      separateResolvedRef.current.add(key);
      setResolvingSeparate(prev => ({ ...prev, [key]: true }));
      AvailabilityService.resolveNextAvailableSlot(providerIdentifier, service.duration, uuidOf(service))
        .then(slot => {
          if (slot) {
            setSeparateDates(prev => ({ ...prev, [key]: slot.date }));
            setSeparateTimes(prev => ({ ...prev, [key]: slot.time }));
          }
        })
        .catch(error => logger.error('Error auto-resolving separate service slot:', error))
        .finally(() => setResolvingSeparate(prev => ({ ...prev, [key]: false })));
    });
  }, [separateServicesList, providerIdentifier]);

  // Fetch this one provider's deposit policy once — shared across every
  // selected service, since they're all the same provider.
  useEffect(() => {
    if (!isVisible || depositFetched.current) return;
    depositFetched.current = true;
    getProviderDepositPoliciesByDisplayNames([providerDisplayName])
      .then(policies => setDepositPolicy(policies[providerDisplayName]))
      .catch(() => {});
  }, [isVisible, providerDisplayName]);

  useEffect(() => {
    if (depositPolicy?.depositOnly) setIsDepositOnly(true);
  }, [depositPolicy]);

  const servicesTotal = useMemo(() => services.reduce((sum, s) => sum + s.price, 0), [services]);
  const totalAddOnsPrice = useMemo(
    () => Object.values(addOnsByService).flat().reduce((sum, a) => sum + a.price, 0),
    [addOnsByService]
  );
  const subtotal = servicesTotal + totalAddOnsPrice;

  const depositPolicyArg = useMemo((): DepositPolicy | number => {
    if (!depositPolicy) return 20;
    return { type: depositPolicy.depositType, amount: depositPolicy.depositAmount };
  }, [depositPolicy]);

  const effectivePrice = isDepositOnly
    ? BookingService.calculateDeposit(subtotal, depositPolicyArg)
    : subtotal;

  const groupRangeText = useMemo(() => {
    if (!groupSchedule || groupSchedule.length === 0) return null;
    const first = groupSchedule[0]!;
    const last = groupSchedule[groupSchedule.length - 1]!;
    const startMin = parse12h(first.time);
    const endMin = parse12h(last.endTime);
    if (isNaN(startMin) || isNaN(endMin) || endMin <= startMin) {
      return `${first.time} - ${last.endTime}`;
    }
    return `${first.time} - ${last.endTime} (${formatDuration(endMin - startMin)})`;
  }, [groupSchedule]);

  const groupReady = groupServices.length === 0 || (groupChainStatus === 'found' && !!groupSchedule);
  const separateReady = separateServicesList.every(
    s => !!separateDates[serviceKeyOf(s)] && !!separateTimes[serviceKeyOf(s)]
  );
  const scheduleReady = groupReady && separateReady;
  // The checkbox reads "...and this provider's cancellation policy" — with
  // no policy on file there's nothing provider-specific to agree to, so it
  // isn't shown and doesn't block booking. See BookingSheet.tsx's identical
  // requiresPolicyAgreement for the single-service version of this.
  const requiresPolicyAgreement = !!bookingPolicies;
  const submitReady = scheduleReady && (!requiresPolicyAgreement || agreedToPolicy);

  // ── Guided flow ────────────────────────────────────────────────────────
  // Same three steps as the single-service BookingSheet, deliberately — the
  // two sheets are the same task with a different number of services, so
  // they shouldn't feel like different parts of the app. Scheduling stays
  // one step regardless of how many services or whether they're scheduled
  // together or separately, so the step count never varies with cart size.
  const stepOrder = useMemo<MultiBookingStep[]>(() => ['when', 'pay', 'confirm'], []);

  const stepBlocker = useMemo((): string | null => {
    // Checked on "when" (where it's fixable) AND "confirm" (where it's
    // committed), since a schedule can be invalidated after moving past it.
    if (step === 'when' || step === 'confirm') {
      if (!scheduleReady) return 'Choose a date for each service';
    }
    if (step === 'confirm' && requiresPolicyAgreement && !agreedToPolicy) return 'Agree to the terms to continue';
    return null;
  }, [step, scheduleReady, requiresPolicyAgreement, agreedToPolicy]);

  // A scheduling blocker on confirm keeps the button tappable and routes back
  // to "when" — what needs fixing lives on an earlier step, so disabling it
  // here would be a dead end. Terms is fixable in place, so it stays disabled.
  const schedulingFixableElsewhere = step === 'confirm' && !scheduleReady;

  const goToStep = useCallback((next: MultiBookingStep) => {
    Haptics.selectionAsync().catch(() => {});
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const handleBack = useCallback(() => {
    const i = stepOrder.indexOf(step);
    if (i > 0) goToStep(stepOrder[i - 1]!);
  }, [step, stepOrder, goToStep]);

  const handleNext = useCallback(() => {
    if (stepBlocker) return; // guarded by disabling the button too
    const i = stepOrder.indexOf(step);
    if (i >= 0 && i < stepOrder.length - 1) goToStep(stepOrder[i + 1]!);
  }, [step, stepOrder, stepBlocker, goToStep]);

  const isFirstStep = stepOrder.indexOf(step) === 0;

  const handleSubmit = useCallback(() => {
    if (!submitReady) return;
    // One batch id per submission, only when the grouped bucket actually has
    // more than one service — a "group" of 1 is just a standalone booking,
    // same convention createBookingsFromCart already uses for cart-wide
    // grouping (cartItems.length > 1).
    const groupBatchId = groupServices.length > 1 ? generateUuid() : undefined;
    const items = services.map(service => {
      const key = serviceKeyOf(service);
      const selectedAddOns = addOnsByService[key] ?? [];
      const isSeparate = separateServiceKeys.has(key);
      if (isSeparate) {
        return { service, selectedAddOns, date: separateDates[key] ?? '', time: separateTimes[key] ?? '', isSeparate };
      }
      const idx = groupServices.findIndex(s => serviceKeyOf(s) === key);
      return { service, selectedAddOns, date: groupDate, time: groupSchedule?.[idx]?.time ?? '', isSeparate };
    });
    onSubmit({
      items,
      groupBatchId,
      notes: notes.trim(),
      isDepositOnly,
      // Only stamped when this provider actually has a policy to agree to —
      // no checkbox is shown otherwise, so there's nothing to timestamp.
      ...(requiresPolicyAgreement ? { policyAcceptedAt: new Date().toISOString() } : {}),
      ...(bookingPolicies ? { policySnapshot: bookingPolicies } : {}),
    });
    onClose();
  }, [
    submitReady, services, addOnsByService, separateServiceKeys, separateDates, separateTimes,
    groupServices, groupDate, groupSchedule, notes, isDepositOnly, requiresPolicyAgreement, bookingPolicies, onSubmit, onClose,
  ]);

  if (services.length === 0) return null;

  const showFullPaymentOption = !depositPolicy?.depositOnly;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardDismissView style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: sheetBackground }]}>
          <SafeAreaView style={styles.container}>
            <View style={[styles.header, { borderBottomColor: tokens.border }]}>
              {!isFirstStep && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handleBack}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.backButtonText, { color: adaptiveAccentColor }]}>‹</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: tokens.text }]}>
                  Book {services.length} Service{services.length === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: tokens.sub }]}>
                  £{servicesTotal.toFixed(2)} total
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: adaptiveAccentColor }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={[styles.closeButtonText, { color: onAccentColor }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <StepProgress
              current={step}
              accentColor={adaptiveAccentColor}
              subColor={tokens.sub}
              borderColor={tokens.border}
            />

            <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>

              {step === 'when' && (
              <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>When works for you?</Text>

              <View style={styles.section}>
                <View style={styles.summaryHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: tokens.text, marginBottom: 0 }]}>Services</Text>
                  {services.length > 1 && (
                    <TouchableOpacity
                      onPress={() => {
                        if (separateSelectMode) {
                          // Exiting select mode discards any in-progress
                          // separations rather than keeping whatever was
                          // checked — everyone reverts to one group booking
                          // unless the client re-enters and confirms again.
                          setSeparateServiceKeys(new Set());
                          setGroupChains(null);
                          setGroupChainStatus('idle');
                        }
                        setSeparateSelectMode(v => !v);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.8}
                      style={[styles.separateToggleButton, { borderColor: adaptiveAccentColor }]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={adaptiveAccentColor} />
                      <Text style={[styles.separateToggleText, { color: adaptiveAccentColor }]}>
                        {separateSelectMode ? 'Select' : 'Schedule Separately'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {services.map(service => {
                  const serviceKey = serviceKeyOf(service);
                  const selected = addOnsByService[serviceKey] ?? [];
                  const isSeparate = separateServiceKeys.has(serviceKey);
                  return (
                    <View key={serviceKey} style={styles.serviceBlock}>
                      <View style={styles.serviceRow}>
                        {separateSelectMode && (
                          <TouchableOpacity
                            onPress={() => toggleSeparate(serviceKey)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[
                              styles.separateCheckbox,
                              { borderColor: tokens.border, marginRight: 10 },
                              isSeparate && { backgroundColor: adaptiveAccentColor, borderColor: adaptiveAccentColor },
                            ]}
                          >
                            {isSeparate && <Text style={[styles.addOnCheckmark, { color: onAccentColor }]}>✓</Text>}
                          </TouchableOpacity>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.serviceName, { color: tokens.text }]}>{service.name}</Text>
                          <Text style={[styles.serviceMeta, { color: tokens.sub }]}>
                            {service.duration}{isSeparate ? ' • Scheduled separately' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.servicePrice, { color: adaptiveAccentColor }]}>£{service.price}</Text>
                      </View>

                      {/* Add-ons were first decided via the popup at
                          selection time, before this sheet opened — this
                          reopens the same popup to change that pick without
                          backing out of the sheet. */}
                      {(service.addOns?.length ?? 0) > 0 && (
                        <>
                          {selected.length > 0 && (
                            <View style={styles.addOnsWrap}>
                              {selected.map(a => (
                                <View key={a.id} style={styles.addOnSummaryRow}>
                                  <Text style={[styles.addOnSummaryName, { color: tokens.sub }]} numberOfLines={1}>
                                    + {a.name}
                                  </Text>
                                  <Text style={[styles.addOnSummaryPrice, { color: tokens.sub }]}>+£{a.price}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setEditingAddOnsService(service);
                            }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            style={styles.editAddOnsLink}
                          >
                            <Text style={[styles.changeLink, { color: adaptiveAccentColor }]}>
                              {selected.length > 0 ? 'Edit add-ons' : 'Add extras'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>

              {groupServices.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: tokens.text }]}>
                    {groupServices.length === services.length
                      ? 'Date & Time'
                      : `Date & Time — ${groupServices.length} Service${groupServices.length > 1 ? 's' : ''} Together`}
                  </Text>
                  {/* Chain-aware: the times offered are starts where EVERY
                      grouped service still fits back-to-back, not where the
                      first one alone fits. */}
                  <ModernBeautyCalendar
                    selectedDate={groupDate}
                    onDateSelect={setGroupDate}
                    onTimeSelect={setGroupTime}
                    selectedTime={groupTime}
                    providerName={providerIdentifier}
                    slotResolver={groupSlotResolver}
                    accentColor={adaptiveAccentColor}
                    textColor={tokens.text}
                    subColor={tokens.sub}
                    surfaceColor={tokens.surface}
                  />
                  {groupChainStatus === 'loading' && (
                    <View style={styles.resolvingRow}>
                      <ActivityIndicator size="small" color={adaptiveAccentColor} />
                      <Text style={[styles.resolvingText, { color: tokens.sub }]}>
                        Checking availability for all {groupServices.length} services…
                      </Text>
                    </View>
                  )}
                  {groupChainStatus === 'found' && groupRangeText && (
                    <Text style={[styles.groupRangeText, { color: tokens.text }]}>{groupRangeText}</Text>
                  )}
                  {groupChainStatus === 'not-found' && (
                    <Text style={[styles.notFoundText, { color: tokens.sub }]}>
                      That day doesn't have room for all {groupServices.length} services back-to-back — try another date, or mark one "Schedule separately" above.
                    </Text>
                  )}
                </View>
              )}

              {separateServicesList.map(service => {
                const key = serviceKeyOf(service);
                return (
                  <View style={styles.section} key={key}>
                    <Text style={[styles.sectionTitle, { color: tokens.text }]}>Date & Time — {service.name}</Text>
                    {resolvingSeparate[key] && (
                      <View style={styles.resolvingRow}>
                        <ActivityIndicator size="small" color={adaptiveAccentColor} />
                        <Text style={[styles.resolvingText, { color: tokens.sub }]}>Finding the earliest available time…</Text>
                      </View>
                    )}
                    <ModernBeautyCalendar
                      selectedDate={separateDates[key] ?? ''}
                      onDateSelect={d => setSeparateDates(prev => ({ ...prev, [key]: d }))}
                      onTimeSelect={t => setSeparateTimes(prev => ({ ...prev, [key]: t }))}
                      selectedTime={separateTimes[key] ?? ''}
                      providerName={providerIdentifier}
                      serviceDuration={service.duration}
                      accentColor={adaptiveAccentColor}
                      textColor={tokens.text}
                      subColor={tokens.sub}
                      surfaceColor={tokens.surface}
                      {...(uuidOf(service) ? { serviceId: uuidOf(service) } : {})}
                    />
                  </View>
                );
              })}

              </>
              )}

              {step === 'pay' && (
              <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>How would you like to pay?</Text>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>Notes</Text>
                <TextInput
                  style={[styles.notesInput, { borderColor: tokens.border, color: tokens.text, backgroundColor: tokens.surface }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add special requests, allergies, or preferences..."
                  placeholderTextColor={tokens.sub}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={[styles.characterCount, { color: tokens.sub }]}>{notes.length}/500 characters</Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>Payment</Text>
                <View style={styles.paymentButtons}>
                  {showFullPaymentOption && (
                    <TouchableOpacity
                      style={[
                        styles.paymentOptionButton,
                        { backgroundColor: tokens.surface },
                        !isDepositOnly && { backgroundColor: withAlpha(adaptiveAccentColor, 0.14), borderColor: adaptiveAccentColor },
                      ]}
                      onPress={() => setIsDepositOnly(false)}
                    >
                      <Text style={[styles.paymentOptionText, { color: tokens.sub }, !isDepositOnly && { color: adaptiveAccentColor, fontWeight: '700' }]}>
                        Pay Full Amount
                      </Text>
                    </TouchableOpacity>
                  )}
                  {(showFullPaymentOption ? depositPolicy?.depositAvailable !== false : true) && (
                    <TouchableOpacity
                      style={[
                        styles.paymentOptionButton,
                        { backgroundColor: tokens.surface },
                        isDepositOnly && { backgroundColor: withAlpha(adaptiveAccentColor, 0.14), borderColor: adaptiveAccentColor },
                      ]}
                      onPress={() => setIsDepositOnly(true)}
                      activeOpacity={showFullPaymentOption ? 0.7 : 1}
                      disabled={!showFullPaymentOption}
                    >
                      <Text style={[styles.paymentOptionText, { color: tokens.sub }, isDepositOnly && { color: adaptiveAccentColor, fontWeight: '700' }]}>
                        {depositPolicy
                          ? depositPolicy.depositType === 'fixed'
                            ? `Pay Deposit (£${depositPolicy.depositAmount})`
                            : `Pay Deposit (${depositPolicy.depositAmount}%)`
                          : 'Pay Deposit (20%)'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {/* Whichever single option a provider offers, say why it's
                    the only one — a lone unexplained button reads as a bug or
                    a missing choice, not as the provider's policy. */}
                {!showFullPaymentOption && (
                  <Text style={[styles.depositOnlyNotice, { color: tokens.sub }]}>
                    This provider requires a deposit to book — paying in full isn't available for this service.
                  </Text>
                )}
                {showFullPaymentOption && depositPolicy?.depositAvailable === false && (
                  <Text style={[styles.depositOnlyNotice, { color: tokens.sub }]}>
                    This provider doesn't take deposits — the full amount is paid when you book.
                  </Text>
                )}
                {isDepositOnly && (
                  <Text style={[styles.depositRemainingText, { color: tokens.sub }]}>
                    Remaining: £{BookingService.calculateRemainingBalance(subtotal, depositPolicyArg).toFixed(2)} (pay at appointment)
                  </Text>
                )}
              </View>
              </>
              )}

              {step === 'confirm' && (
              <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>Does this look right?</Text>

              <View style={styles.section}>
                <View style={styles.summaryHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: tokens.text, marginBottom: 0 }]}>Booking Summary</Text>
                  {/* The confirm step is where a mistake gets noticed, so it
                      offers a way back to the step that owns it. */}
                  <TouchableOpacity onPress={() => goToStep('when')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.changeLink, { color: adaptiveAccentColor }]}>Change time</Text>
                  </TouchableOpacity>
                </View>

                {/* Every back-to-back service lives inside ONE bordered box,
                    headed by a single link badge — the box is the thing that
                    says "these are one appointment", so nothing in the group
                    renders outside it and no service carries its own icon.
                    Shared date/time sits in the header rather than repeating
                    on every row; per-service start times are already listed
                    above in "Date & Time". A lone group of one isn't a group,
                    so it renders as a plain row with no box at all. */}
                {groupServices.length > 1 && (
                  <View
                    style={[
                      styles.summaryGroupBlock,
                      styles.summaryGroupBlockBanded,
                      {
                        borderColor: withAlpha(adaptiveAccentColor, 0.55),
                        backgroundColor: withAlpha(adaptiveAccentColor, 0.10),
                      },
                    ]}
                  >
                    <View style={styles.summaryGroupHeaderRow}>
                      <View style={[styles.summaryGroupBadge, { backgroundColor: adaptiveAccentColor }]}>
                        <Ionicons name="link" size={12} color="#FFFFFF" />
                        <Text style={styles.summaryGroupBadgeText}>
                          GROUP BOOKING · {groupServices.length}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.summaryGroupSubtitle, { color: tokens.text }]}>
                      {groupServices.length} services back-to-back
                    </Text>
                    <Text style={[styles.summaryItemDateTime, { color: tokens.sub }]}>
                      {groupDate && groupRangeText
                        ? `${formatShortDate(groupDate)} · ${groupRangeText}`
                        : 'Not scheduled yet'}
                    </Text>

                    <View style={[styles.summaryGroupRule, { backgroundColor: withAlpha(adaptiveAccentColor, 0.35) }]} />

                    {groupServices.map(service => {
                      const key = serviceKeyOf(service);
                      const addOnsForService = addOnsByService[key] ?? [];
                      const addOnsTotal = addOnsForService.reduce((s, a) => s + a.price, 0);
                      return (
                        <View key={key}>
                          <View style={styles.summaryItemRow}>
                            <Text style={[styles.summaryItemName, { color: tokens.text, flex: 1 }]}>{service.name}</Text>
                            <Text style={[styles.summaryItemPrice, { color: adaptiveAccentColor }]}>£{service.price.toFixed(2)}</Text>
                          </View>
                          {/* One compact labelled line, same as the cart card
                              and the separately-scheduled block below. */}
                          {addOnsTotal > 0 && (
                            <Text style={[styles.summaryAddOnLine, { color: tokens.text }]} numberOfLines={2}>
                              + {addOnsForService.length} add-on{addOnsForService.length === 1 ? '' : 's'} (£
                              {addOnsTotal.toFixed(2)}): {addOnsForService.map(a => a.name).join(', ')}
                            </Text>
                          )}
                        </View>
                      );
                    })}

                    {/* The group's own total, so the box balances on its own
                        rather than only contributing to the grand total. */}
                    <View style={[styles.summaryGroupRule, { backgroundColor: withAlpha(adaptiveAccentColor, 0.35) }]} />
                    <View style={styles.summaryItemRow}>
                      <Text style={[styles.summaryGroupTotalLabel, { color: tokens.sub }]}>Group total</Text>
                      <Text style={[styles.summaryGroupTotalValue, { color: tokens.text }]}>
                        £{groupServices
                          .reduce((sum, s) => {
                            const k = serviceKeyOf(s);
                            return sum + s.price + (addOnsByService[k] ?? []).reduce((a, x) => a + x.price, 0);
                          }, 0)
                          .toFixed(2)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* A single grouped service is just a normal booking — plain
                    row, its own date/time, no group framing. */}
                {groupServices.length === 1 && groupServices.map(service => {
                  const key = serviceKeyOf(service);
                  const addOnsForService = addOnsByService[key] ?? [];
                  const addOnsTotal = addOnsForService.reduce((s, a) => s + a.price, 0);
                  const soloDateTimeText =
                    groupDate && groupChainStatus === 'found' && groupSchedule?.[0]?.time
                      ? `${formatShortDate(groupDate)} at ${groupSchedule[0].time}`
                      : 'Not scheduled yet';
                  return (
                    <View key={key}>
                      <View style={styles.summaryItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.summaryItemName, { color: tokens.text }]}>{service.name}</Text>
                          <Text style={[styles.summaryItemDateTime, { color: tokens.sub }]}>{soloDateTimeText}</Text>
                        </View>
                        <Text style={[styles.summaryItemPrice, { color: adaptiveAccentColor }]}>£{service.price.toFixed(2)}</Text>
                      </View>
                      {addOnsTotal > 0 && (
                        <Text style={[styles.summaryAddOnLine, { color: tokens.text }]} numberOfLines={2}>
                          + {addOnsForService.length} add-on{addOnsForService.length === 1 ? '' : 's'} (£
                          {addOnsTotal.toFixed(2)}): {addOnsForService.map(a => a.name).join(', ')}
                        </Text>
                      )}
                    </View>
                  );
                })}

                {/* Separately-scheduled services keep their own individual
                    date/time — each was deliberately pulled out of the
                    shared day, so the summary reflects that per-item. */}
                {separateServicesList.length > 0 && groupServices.length > 0 && (
                  <Text style={[styles.summarySeparateHeaderText, { color: tokens.sub }]}>
                    Scheduled separately
                  </Text>
                )}
                {separateServicesList.map(service => {
                  const key = serviceKeyOf(service);
                  const d = separateDates[key];
                  const t = separateTimes[key];
                  const dateTimeText = d && t ? `${formatShortDate(d)} at ${t}` : 'Not scheduled yet';
                  const addOnsForService = addOnsByService[key] ?? [];
                  const addOnsTotal = addOnsForService.reduce((s, a) => s + a.price, 0);
                  return (
                    <View key={key}>
                      <View style={styles.summaryItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.summaryItemName, { color: tokens.text }]}>{service.name}</Text>
                          <Text style={[styles.summaryItemDateTime, { color: tokens.sub }]}>{dateTimeText}</Text>
                        </View>
                        <Text style={[styles.summaryItemPrice, { color: adaptiveAccentColor }]}>£{service.price.toFixed(2)}</Text>
                      </View>
                      {addOnsTotal > 0 && (
                        <Text style={[styles.summaryAddOnLine, { color: tokens.text }]} numberOfLines={2}>
                          + {addOnsForService.length} add-on{addOnsForService.length === 1 ? '' : 's'} (£
                          {addOnsTotal.toFixed(2)}): {addOnsForService.map(a => a.name).join(', ')}
                        </Text>
                      )}
                    </View>
                  );
                })}
                {/* The amount charged now is NOT repeated here — the footer
                    owns that number, so there's exactly one "what am I
                    paying" figure in the sheet. */}
              </View>

              {/* Only shown when this provider actually has a cancellation
                  policy on file — see BookingSheet.tsx's identical
                  requiresPolicyAgreement comment. CERVICED's own Terms &
                  Conditions checkbox on the cart's checkout screen is
                  separate and unaffected. */}
              {requiresPolicyAgreement && (
                <TouchableOpacity
                  style={styles.policyCheckboxRow}
                  onPress={() => setAgreedToPolicy(!agreedToPolicy)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.addOnCheckbox,
                    { borderColor: tokens.border, backgroundColor: agreedToPolicy ? adaptiveAccentColor : 'transparent' },
                  ]}>
                    {agreedToPolicy && <Text style={[styles.addOnCheckmark, { color: onAccentColor }]}>✓</Text>}
                  </View>
                  {/* TODO(copy): placeholder legal copy — needs user-directed final wording, not to be treated as reviewed/final */}
                  <Text style={[styles.policyCheckboxLabel, { color: tokens.text }]}>
                    I agree to the Terms & Conditions<Text style={styles.requiredAsterisk}> *</Text> and this provider's cancellation policy
                  </Text>
                </TouchableOpacity>
              )}
              </>
              )}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: tokens.border, backgroundColor: sheetBackground }]}>
              {/* Rides along on every step so the price is never a surprise
                  revealed only at the end. On a deposit booking this is the
                  deposit, not the service total, so it isn't called "Total". */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: tokens.text }]}>
                  {isDepositOnly ? 'Deposit due now' : 'Total'}
                </Text>
                <Text style={[styles.totalPrice, { color: adaptiveAccentColor }]}>£{effectivePrice.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: adaptiveAccentColor }, !!stepBlocker && styles.submitButtonDisabled]}
                onPress={
                  schedulingFixableElsewhere
                    ? () => goToStep('when')
                    : step === 'confirm'
                    ? handleSubmit
                    : handleNext
                }
                activeOpacity={0.8}
                disabled={!!stepBlocker && !schedulingFixableElsewhere}
              >
                <Text style={[styles.submitButtonText, { color: onAccentColor }]}>
                  {schedulingFixableElsewhere
                    ? 'Choose a date for each service'
                    : stepBlocker
                    ? stepBlocker
                    : step === 'confirm'
                    ? `Book All ${services.length} Service${services.length === 1 ? '' : 's'}`
                    : 'Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Internal overlay, not a second <Modal> — this sheet is already
              a Modal, and React Native doesn't reliably support stacking one
              Modal on top of another (see AddOnPickerModal's file header). */}
          {!!editingAddOnsService && (
            <AddOnPickerModal
              visible
              asOverlay
              serviceName={editingAddOnsService.name}
              addOns={editingAddOnsService.addOns ?? []}
              initialSelected={addOnsByService[serviceKeyOf(editingAddOnsService)] ?? []}
              accentColor={adaptiveAccentColor}
              tokens={{ text: tokens.text, sub: tokens.sub, border: tokens.border, surface: tokens.surface, bg: sheetBackground }}
              onDone={selected => {
                const key = serviceKeyOf(editingAddOnsService);
                setAddOnsByService(prev => {
                  if (selected.length > 0) return { ...prev, [key]: selected };
                  if (!(key in prev)) return prev;
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
                setEditingAddOnsService(null);
              }}
            />
          )}
        </View>
      </KeyboardDismissView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { flex: 1, marginTop: 100, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  headerSubtitle: { fontSize: 13, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 15, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 26 },
  sectionTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, marginBottom: 12 },
  serviceBlock: { marginBottom: 16 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { fontSize: 15, fontWeight: '700' },
  serviceMeta: { fontSize: 12, marginTop: 2 },
  servicePrice: { fontSize: 15, fontWeight: '700' },
  separateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  separateCheckbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  separateLabel: { fontSize: 12, fontWeight: '600' },
  addOnsWrap: { marginTop: 16 },
  summaryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addOnsSummaryLabel: { fontSize: 13 },
  // Matches the cart's "Schedule all together" button (dashed outline, icon +
  // label in a row) so the two grouping affordances read as the same control
  // in both places. Behaviour is unchanged — this is styling only.
  separateToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  separateToggleText: { fontSize: 11, fontWeight: '700' },
  addOnCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addOnCheckmark: { fontSize: 12, fontWeight: '700' },
  policyCheckboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 },
  policyCheckboxLabel: { flex: 1, fontSize: 13 },
  requiredAsterisk: { color: '#FF3B30', fontWeight: '700' },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  resolvingText: { fontSize: 13 },
  groupRangeText: { fontSize: 15, fontWeight: '700', marginTop: 10 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  scheduleRowService: { fontSize: 14, flex: 1, marginRight: 10 },
  scheduleRowTime: { fontSize: 13, fontWeight: '600' },
  notFoundText: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  changeLink:     { fontSize: 13, fontWeight: '700' },
  editAddOnsLink: { marginTop: 8 },
  addOnSummaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  addOnSummaryName:  { fontSize: 13, flex: 1, marginRight: 10 },
  addOnSummaryPrice: { fontSize: 13 },

  backButton:     { width: 28, alignItems: 'flex-start', justifyContent: 'center', marginRight: 4 },
  backButtonText: { fontSize: 28, fontWeight: '300', lineHeight: 28 },
  // The one question each step asks — matches BookingSheet's own stepQuestion.
  stepQuestion:   { fontFamily: 'BakbakOne-Regular', fontSize: 20, letterSpacing: -0.3, marginBottom: 22 },

  notesInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  characterCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  paymentButtons: { flexDirection: 'row', gap: 10 },
  paymentOptionButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingVertical: 12, alignItems: 'center' },
  paymentOptionText: { fontSize: 13, fontWeight: '600' },
  depositOnlyNotice: { fontSize: 13, lineHeight: 18 },
  depositRemainingText: { fontSize: 12, marginTop: 4 },
  summaryGroupBlock: { marginBottom: 4 },
  summaryGroupBlockBanded: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  summaryGroupHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  summaryGroupBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  summaryGroupSubtitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  summaryGroupRule: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  summaryGroupTotalLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  summaryGroupTotalValue: { fontSize: 14, fontWeight: '800' },
  summarySeparateHeaderText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2, marginTop: 2, marginBottom: 4 },
  summaryAddOnLine: { fontSize: 12, fontWeight: '700', paddingLeft: 12, marginTop: -2, marginBottom: 4 },
  summaryItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  summaryItemName: { fontSize: 14, fontWeight: '600' },
  summaryItemDateTime: { fontSize: 12, marginTop: 2 },
  summaryItemPrice: { fontSize: 14, fontWeight: '700' },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  totalLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  totalPrice: { fontFamily: 'BakbakOne-Regular', fontSize: 20, fontWeight: 'bold' },
  submitButton: { borderRadius: 20, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, fontWeight: 'bold' },
});
