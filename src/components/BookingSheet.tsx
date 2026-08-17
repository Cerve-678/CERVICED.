// src/components/BookingSheet.tsx
// Single, full-screen flow for configuring a service booking — add-ons, date
// & time, notes, and payment option (plus promo code in add mode only). Used
// both to add a fresh service to the cart (mode="add", from
// ProviderProfileScreen) and to edit an item already in the cart
// (mode="edit", from CartScreen's per-item Edit button) — one component, one
// set of rules, instead of the two screens each owning their own copy of
// this UI.
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
  Platform,
  UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardDismissView } from './KeyboardDismissView';
import { ModernBeautyCalendar } from './ModernBeautyCalendar';
import { AvailabilityService } from '../services/AvailabilityService';
import { BookingService, DepositPolicy } from '../services/bookingService';
import {
  getProviderDepositPoliciesByDisplayNames,
  ProviderDepositPolicy,
  validatePromoCode,
} from '../services/databaseService';
import { PromoCodeRow } from './PromoCodeRow';
import { buildThemeTokens, withAlpha, isDarkColor } from '../constants/providerThemes';
import type { DbPromotion } from '../types/database';
import { logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// LayoutAnimation is opt-in on old-architecture Android; without this the
// optional sections snap open instead of animating there. Same guard as
// ModernBeautyCalendar/HomeScreen — set here too so this sheet doesn't
// depend on another module's import side effect.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Matches MultiBookingSheet's own formatShortDate — same "Wed, 12 Aug" style
// used everywhere else a booked date is summarised.
const formatShortDate = (dateStr: string): string =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

export type BookingStep = 'addons' | 'when' | 'pay' | 'confirm';

/** The three steps the progress dots count. "addons" is deliberately absent:
 *  it's conditional on the service having any, so including it would make the
 *  same booking show a different number of steps depending on the service. */
const PROGRESS_STEPS: { key: BookingStep; label: string }[] = [
  { key: 'when', label: 'When' },
  { key: 'pay', label: 'Pay' },
  { key: 'confirm', label: 'Confirm' },
];

/** Slim progress indicator — shows where you are and how much is left, which
 *  is the thing a multi-step flow has to answer to not feel longer than a
 *  single scroll. Shared with MultiBookingSheet so the group flow reads as
 *  the same task, not a different corner of the app. */
export const StepProgress: React.FC<{
  current: BookingStep;
  accentColor: string;
  subColor: string;
  borderColor: string;
}> = ({ current, accentColor, subColor, borderColor }) => {
  const activeIndex = PROGRESS_STEPS.findIndex(s => s.key === current);
  if (activeIndex < 0) return null; // "addons" — no progress shown yet
  return (
    <View style={styles.progressRow}>
      {PROGRESS_STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <View style={[styles.progressBar, { backgroundColor: done || active ? accentColor : borderColor }]} />
            )}
            <View style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  { borderColor: done || active ? accentColor : borderColor },
                  (done || active) && { backgroundColor: accentColor },
                ]}
              />
              <Text
                style={[
                  styles.progressLabel,
                  { color: active ? accentColor : subColor },
                  active && { fontWeight: '700' },
                ]}
              >
                {s.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
};

export interface BookingSheetAddOn {
  id: string | number;
  name: string;
  price: number;
  description?: string;
}

export interface BookingSheetService {
  id: string | number;
  dbId?: string;
  name: string;
  price: number;
  duration: string;
  description: string;
  addOns?: BookingSheetAddOn[];
}

export interface BookingSheetResult {
  selectedAddOns: { id: string | number; name: string; price: number }[];
  date: string;
  time: string;
  notes: string;
  isDepositOnly: boolean;
  /** Only meaningful in mode="add" — carried into the cart item as
   *  CartItem.initialPromoCode so the existing cart auto-apply picks it up. */
  promoCode?: string;
  /** Present when consultationRequired was passed in and the client picked
   *  a date/time for it in this same sheet. */
  consultationBooking?: { date: string; time: string };
  /** Stamped only when the policy checkbox was ticked — the moment of
   *  agreement, plus a frozen copy of the policy agreed to (see
   *  BookingSheetProps.bookingPolicies). Absent if there was no policy to
   *  agree to (provider hasn't set one). */
  policyAcceptedAt?: string;
  policySnapshot?: Record<string, unknown>;
}

interface BookingSheetProps {
  isVisible: boolean;
  onClose: () => void;
  mode: 'add' | 'edit';
  service: BookingSheetService | null;
  /** Real provider UUID when known, else display name — for availability lookups. */
  providerIdentifier: string;
  /** Provider's display name — for deposit-policy and promo *validation* lookups. */
  providerDisplayName: string;
  /** The cart's provider grouping key (CartItem.providerName) — used as the
   *  promo-preview key in mode="add"; mode="edit" has no promo entry so this
   *  just needs to be a stable string there. */
  providerKey: string;
  /** Provider's service category — narrows promo eligibility the same way
   *  CartScreen's itemPromoDiscounts does, so the add-mode preview matches. */
  providerServiceCategory?: string;
  /** The provider's live cancellation/booking policy (providers.booking_policies)
   *  — snapshotted into the result when the client agrees, so the eventual
   *  booking row remembers what was actually agreed to even if the provider
   *  edits their policy later. Caller already has this loaded (e.g.
   *  ProviderProfileScreen's own Policy tab reads the same data). */
  bookingPolicies?: Record<string, unknown> | null;
  adaptiveAccentColor: string;
  /** Sheet's background colour — always the caller's own content-backdrop
   *  colour (e.g. the provider's card colour, or the cart's card colour),
   *  never derived from system/app dark mode. The sheet has no light/dark
   *  fallback of its own; every caller must supply this. */
  backgroundColor: string;
  initial?:
    | {
        selectedAddOns?: { id: string | number; name: string; price: number }[] | undefined;
        selectedDate?: string | undefined;
        selectedTime?: string | undefined;
        notes?: string | undefined;
        isDepositOnly?: boolean | undefined;
        /** Whether this cart item already had terms/cancellation policy
         *  agreed to (mode="edit" only — seeded from the item's own
         *  policyAcceptedAt, not any cross-booking/device-wide memory).
         *  Re-editing an already-agreed item shouldn't force re-ticking the
         *  same box it was added with. */
        agreedToPolicy?: boolean | undefined;
      }
    | undefined;
  /** When set, this provider requires a consultation before this client's
   *  first real booking — the sheet shows a second Date & Time picker for
   *  it, above the main service's, and both are scheduled together on
   *  submit. Caller adds both as separate cart items. */
  consultationRequired?: BookingSheetService | null;
  onSubmit: (result: BookingSheetResult) => void;
}

export const BookingSheet: React.FC<BookingSheetProps> = ({
  isVisible,
  onClose,
  mode,
  service,
  providerIdentifier,
  providerDisplayName,
  providerKey,
  providerServiceCategory,
  bookingPolicies,
  adaptiveAccentColor,
  backgroundColor,
  initial,
  consultationRequired,
  onSubmit,
}) => {
  const sheetBackground = backgroundColor;
  // Every other colour in this sheet (text/sub/border/surface) is derived
  // from its own backdrop too — nothing here reads the app's light/dark
  // theme, so the sheet looks the same regardless of system appearance.
  const tokens = useMemo(
    () => buildThemeTokens(sheetBackground, sheetBackground, adaptiveAccentColor, sheetBackground),
    [sheetBackground, adaptiveAccentColor]
  );
  // Text/icons drawn ON a solid adaptiveAccentColor fill (close button,
  // submit button) can't assume white — a pale accent (e.g. the client
  // dark-mode blue-grey #E5ECF4) makes white text unreadable. Pick black or
  // white by the accent's own luminance instead of hardcoding either.
  const onAccentColor = useMemo(
    () => (isDarkColor(adaptiveAccentColor) ? '#fff' : '#1B2740'),
    [adaptiveAccentColor]
  );

  const [selectedAddOns, setSelectedAddOns] = useState<
    { id: string | number; name: string; price: number }[]
  >([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isDepositOnly, setIsDepositOnly] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isResolvingSlot, setIsResolvingSlot] = useState(false);
  const [depositPolicy, setDepositPolicy] = useState<ProviderDepositPolicy | undefined>(undefined);

  // Required-consultation date/time — scheduled alongside the main service
  // in this same sheet when consultationRequired is passed in.
  const [consultationDate, setConsultationDate] = useState('');
  const [consultationTime, setConsultationTime] = useState('');
  const [isResolvingConsultationSlot, setIsResolvingConsultationSlot] = useState(false);
  const consultationResolvedOnce = useRef(false);

  // mode="add" local promo preview (mode="edit" uses the real cart state via props)
  const [localPromo, setLocalPromo] = useState<DbPromotion | undefined>(undefined);

  // Guided flow. Each step asks for one kind of thing, so the client is never
  // reading a scroll of seven competing sections:
  //   addons  — optional extras (skipped entirely when the service has none)
  //   when    — date & time, plus the consultation's own date & time
  //   pay     — deposit vs full, promo code, notes
  //   confirm — the full booking read back, and the terms gate
  // "addons" stays first and stays conditional, exactly as before.
  const [step, setStep] = useState<BookingStep>('when');

  const resolvedOnce = useRef(false);
  const depositFetched = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reset/seed local state each time the sheet opens for a (possibly new) service.
  useEffect(() => {
    if (!isVisible) return;
    setSelectedAddOns(initial?.selectedAddOns ?? []);
    setSelectedDate(initial?.selectedDate ?? '');
    setSelectedTime(initial?.selectedTime ?? '');
    setNotes(initial?.notes ?? '');
    setIsDepositOnly(initial?.isDepositOnly ?? false);
    setAgreedToPolicy(initial?.agreedToPolicy ?? false);
    setLocalPromo(undefined);
    setConsultationDate('');
    setConsultationTime('');
    setStep((service?.addOns?.length ?? 0) > 0 ? 'addons' : 'when');
    resolvedOnce.current = false;
    depositFetched.current = false;
    consultationResolvedOnce.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, service?.id]);

  // Auto-resolve the earliest available slot — no manual "Next Available"
  // button. Fires for a brand-new booking, or for an existing item that has
  // no date/time yet; never overrides a date/time the user already chose.
  useEffect(() => {
    if (!isVisible || !service || resolvedOnce.current) return;
    if (initial?.selectedDate && initial?.selectedTime) { resolvedOnce.current = true; return; }
    resolvedOnce.current = true;
    setIsResolvingSlot(true);
    const uuidServiceId = service.dbId && UUID_RE.test(service.dbId) ? service.dbId : undefined;
    AvailabilityService.resolveNextAvailableSlot(providerIdentifier, service.duration, uuidServiceId)
      .then(slot => {
        if (slot) {
          setSelectedDate(slot.date);
          setSelectedTime(slot.time);
        }
      })
      .catch(error => logger.error('Error auto-resolving next available slot:', error))
      .finally(() => setIsResolvingSlot(false));
  }, [isVisible, service, providerIdentifier, initial?.selectedDate, initial?.selectedTime]);

  // Same auto-resolve, for the required consultation's own slot — always
  // resolved fresh (a consultation is never pre-filled via `initial`, it's
  // always a brand-new addition).
  useEffect(() => {
    if (!isVisible || !consultationRequired || consultationResolvedOnce.current) return;
    consultationResolvedOnce.current = true;
    setIsResolvingConsultationSlot(true);
    const uuidConsultationId = consultationRequired.dbId && UUID_RE.test(consultationRequired.dbId)
      ? consultationRequired.dbId
      : (typeof consultationRequired.id === 'string' && UUID_RE.test(consultationRequired.id) ? consultationRequired.id : undefined);
    AvailabilityService.resolveNextAvailableSlot(providerIdentifier, consultationRequired.duration, uuidConsultationId)
      .then(slot => {
        if (slot) {
          setConsultationDate(slot.date);
          setConsultationTime(slot.time);
        }
      })
      .catch(error => logger.error('Error auto-resolving consultation slot:', error))
      .finally(() => setIsResolvingConsultationSlot(false));
  }, [isVisible, consultationRequired, providerIdentifier]);

  // Fetch this one provider's deposit policy when the sheet opens.
  useEffect(() => {
    if (!isVisible || depositFetched.current) return;
    depositFetched.current = true;
    getProviderDepositPoliciesByDisplayNames([providerDisplayName])
      .then(policies => setDepositPolicy(policies[providerDisplayName]))
      .catch(() => {});
  }, [isVisible, providerDisplayName]);

  // Provider requires deposit-only (set in their business details) — the
  // client has no "pay in full" choice, so force it regardless of whatever
  // isDepositOnly started as.
  useEffect(() => {
    if (depositPolicy?.depositOnly) setIsDepositOnly(true);
  }, [depositPolicy]);

  const uuidServiceId = service?.dbId && UUID_RE.test(service.dbId) ? service.dbId : undefined;

  const toggleAddOn = useCallback((addOn: BookingSheetAddOn) => {
    setSelectedAddOns(prev => {
      const exists = prev.find(a => a.id === addOn.id);
      return exists ? prev.filter(a => a.id !== addOn.id) : [...prev, { id: addOn.id, name: addOn.name, price: addOn.price }];
    });
  }, []);

  const totalAddOnsPrice = useMemo(
    () => selectedAddOns.reduce((sum, a) => sum + a.price, 0),
    [selectedAddOns]
  );
  const subtotal = (service?.price ?? 0) + totalAddOnsPrice;

  // Local discount preview for mode="add" — mirrors CartScreen's
  // itemPromoDiscounts math so the number shown here matches what lands in
  // the cart once the item and its initialPromoCode are both there.
  const localPromoDiscount = useMemo(() => {
    if (!localPromo || !service) return 0;
    if (localPromo.service_ids?.length && !localPromo.service_ids.includes(String(service.dbId ?? service.id))) return 0;
    if (localPromo.service_category &&
        providerServiceCategory &&
        localPromo.service_category.toUpperCase() !== providerServiceCategory.toUpperCase()) return 0;
    let off = 0;
    if (localPromo.discount_percent && localPromo.discount_percent > 0) {
      off = (subtotal * localPromo.discount_percent) / 100;
    } else if (localPromo.discount_amount && localPromo.discount_amount > 0) {
      off = localPromo.discount_amount;
    }
    return Math.min(off, service.price);
  }, [localPromo, service, providerServiceCategory, subtotal]);

  const depositPolicyArg = useMemo((): DepositPolicy | number => {
    if (!depositPolicy) return 20;
    return { type: depositPolicy.depositType, amount: depositPolicy.depositAmount };
  }, [depositPolicy]);

  const effectivePrice = isDepositOnly
    ? BookingService.calculateDeposit(subtotal, depositPolicyArg)
    : subtotal - localPromoDiscount;

  // Deposit-booking summary figures — same `subtotal` basis the deposit
  // itself is calculated from, so the three numbers always reconcile.
  const summaryServiceTotal = subtotal;
  const summaryRemaining = useMemo(
    () => (isDepositOnly ? BookingService.calculateRemainingBalance(subtotal, depositPolicyArg) : 0),
    [isDepositOnly, subtotal, depositPolicyArg]
  );

  const handleLocalApplyPromo = useCallback(async (_key: string, code: string): Promise<string | null> => {
    const trimmed = code.trim();
    if (!trimmed) return 'Enter a code first.';
    try {
      const promo = await validatePromoCode(providerDisplayName, trimmed);
      if (!promo) return 'This code isn’t valid for this provider.';
      setLocalPromo(promo);
      return null;
    } catch {
      return 'Could not check that code — please try again.';
    }
  }, [providerDisplayName]);

  const handleLocalRemovePromo = useCallback(() => setLocalPromo(undefined), []);

  const consultationScheduleMissing = !!consultationRequired && (!consultationDate || !consultationTime);

  // ── Step navigation ────────────────────────────────────────────────────
  // The order is computed, not hardcoded, so "addons" can drop out entirely
  // for a service that has none without every back/next call having to know
  // about that special case.
  // Reads service?.addOns rather than the `hasAddOns` const below, which is
  // declared after this component's early `return null` and so can't be a
  // hook dependency.
  const stepOrder = useMemo<BookingStep[]>(
    () =>
      (service?.addOns?.length ?? 0) > 0
        ? ['addons', 'when', 'pay', 'confirm']
        : ['when', 'pay', 'confirm'],
    [service?.addOns?.length]
  );

  // The checkbox reads "...and this provider's cancellation policy" — when
  // the provider hasn't set one, there's nothing provider-specific to agree
  // to, so it shouldn't be shown or block booking. (CERVICED's own Terms &
  // Conditions agreement is separate and always required — that's the cart's
  // own checkout checkbox, untouched by this.)
  const requiresPolicyAgreement = !!bookingPolicies;

  // What's missing before this step can be left. null = good to continue.
  // Each step gates only its OWN requirements, so the client is told what's
  // wrong while they're still looking at it, instead of at the very end.
  const stepBlocker = useMemo((): string | null => {
    // Scheduling is checked on "when" (where it's fixable) AND on "confirm"
    // (where it's committed). Re-checking at the end isn't redundant: the
    // date/time can be cleared after the client has already moved past that
    // step, which would otherwise leave an enabled "Add to Cart" that
    // silently does nothing because handleSubmit's own guard rejects it.
    if (step === 'when' || step === 'confirm') {
      if (!selectedDate || !selectedTime) return 'Choose a date and time';
      if (consultationScheduleMissing) return 'Choose a consultation time';
    }
    if (step === 'confirm' && requiresPolicyAgreement && !agreedToPolicy) return 'Agree to the terms to continue';
    return null;
  }, [step, selectedDate, selectedTime, consultationScheduleMissing, requiresPolicyAgreement, agreedToPolicy]);

  // Whether handleSubmit's own requirements are met right now, regardless of
  // which step is showing — used by the edit-mode "Done" shortcut so a
  // client fixing one field (e.g. just the date) isn't forced to click
  // through every remaining step to save it, as long as terms were already
  // agreed and scheduling is already valid from an earlier pass.
  const canFinishNow =
    !!selectedDate && !!selectedTime && !consultationScheduleMissing && (!requiresPolicyAgreement || agreedToPolicy);

  const goToStep = useCallback((next: BookingStep) => {
    Haptics.selectionAsync().catch(() => {});
    setStep(next);
    // A step change is a new screen — start it at the top, or the client
    // lands mid-content carried over from the previous step's scroll.
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

  // A scheduling blocker reached on the confirm step is the one case where the
  // button must stay tappable rather than disabled: what needs fixing lives on
  // an earlier step, so greying it out here would strand the client with no
  // way forward. It sends them back to "when" instead. (Terms, by contrast,
  // IS fixable right here, so that one stays disabled as normal.)
  const schedulingFixableElsewhere =
    step === 'confirm' && (!selectedDate || !selectedTime || consultationScheduleMissing);

  const handleSubmit = useCallback(() => {
    if (!service) return;
    if (consultationScheduleMissing) return; // guarded by disabling the button too
    if (requiresPolicyAgreement && !agreedToPolicy) return; // guarded by disabling the button too
    onSubmit({
      selectedAddOns,
      date: selectedDate,
      time: selectedTime,
      notes: notes.trim(),
      isDepositOnly,
      ...(mode === 'add' && localPromo?.promo_code ? { promoCode: localPromo.promo_code } : {}),
      ...(consultationRequired && consultationDate && consultationTime
        ? { consultationBooking: { date: consultationDate, time: consultationTime } }
        : {}),
      // Only stamped when this provider actually has a policy to agree to —
      // no checkbox is shown otherwise, so there's nothing to timestamp.
      ...(requiresPolicyAgreement ? { policyAcceptedAt: new Date().toISOString() } : {}),
      ...(bookingPolicies ? { policySnapshot: bookingPolicies } : {}),
    });
    onClose();
  }, [service, consultationScheduleMissing, requiresPolicyAgreement, agreedToPolicy, selectedAddOns, selectedDate, selectedTime, notes, isDepositOnly, mode, localPromo, consultationRequired, consultationDate, consultationTime, bookingPolicies, onSubmit, onClose]);

  if (!service) return null;

  const availableAddOns = service.addOns ?? [];
  const hasAddOns = availableAddOns.length > 0;
  const showFullPaymentOption = !depositPolicy?.depositOnly;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true} onRequestClose={onClose}>
      {/* Without this, opening the keyboard for the Notes field left the
          footer (Add to Cart / Save Changes) exactly where it was — on
          shorter screens the keyboard covered it outright, or squeezed it
          off the bottom of the visible sheet. */}
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
              {step === 'addons'
                ? 'Choose Add-ons'
                : mode === 'add' ? 'Book Service' : 'Edit Booking'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: tokens.sub }]}>
              {service.name} • £{service.price}
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
          {step === 'addons' ? (
            <View style={styles.section}>
              {availableAddOns.map(addOn => {
                const isSelected = selectedAddOns.some(a => a.id === addOn.id);
                return (
                  <TouchableOpacity
                    key={addOn.id}
                    style={[
                      styles.addOnCard,
                      { borderColor: isSelected ? adaptiveAccentColor : tokens.border, backgroundColor: tokens.surface },
                      isSelected && { borderWidth: 2 },
                    ]}
                    onPress={() => toggleAddOn(addOn)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.addOnName, { color: tokens.text }]}>{addOn.name}</Text>
                      {!!addOn.description && (
                        <Text style={[styles.addOnDescription, { color: tokens.sub }]}>{addOn.description}</Text>
                      )}
                    </View>
                    <Text style={[styles.addOnPrice, { color: adaptiveAccentColor }]}>+£{addOn.price}</Text>
                    <View
                      style={[
                        styles.addOnCheckbox,
                        { borderColor: tokens.border },
                        isSelected && { backgroundColor: adaptiveAccentColor, borderColor: adaptiveAccentColor },
                      ]}
                    >
                      {isSelected && <Text style={[styles.addOnCheckmark, { color: onAccentColor }]}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : step === 'when' ? (
            <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>When works for you?</Text>

              {hasAddOns && (
                <View style={styles.section}>
                  <View style={styles.summaryHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: tokens.text }]}>Add-ons</Text>
                    <TouchableOpacity onPress={() => goToStep('addons')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.changeLink, { color: adaptiveAccentColor }]}>Change</Text>
                    </TouchableOpacity>
                  </View>
                  {selectedAddOns.length > 0 ? (
                    selectedAddOns.map(a => (
                      <View key={a.id} style={styles.addOnSummaryRow}>
                        <Text style={[styles.addOnSummaryName, { color: tokens.text }]}>{a.name}</Text>
                        <Text style={[styles.addOnSummaryPrice, { color: tokens.sub }]}>+£{a.price}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.addOnsSummaryEmpty, { color: tokens.sub }]}>No add-ons selected</Text>
                  )}
                </View>
              )}

              {consultationRequired && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: tokens.text }]}>Consultation Required</Text>
                  <Text style={[styles.consultationNotice, { color: tokens.sub }]}>
                    This provider requires a consultation before your first booking with them. Choose a time for it below — {consultationRequired.name} (£{consultationRequired.price}).
                  </Text>
                  {isResolvingConsultationSlot && (
                    <View style={styles.resolvingRow}>
                      <ActivityIndicator size="small" color={adaptiveAccentColor} />
                      <Text style={[styles.resolvingText, { color: tokens.sub }]}>Finding the earliest consultation slot…</Text>
                    </View>
                  )}
                  <ModernBeautyCalendar
                    selectedDate={consultationDate}
                    onDateSelect={setConsultationDate}
                    onTimeSelect={setConsultationTime}
                    selectedTime={consultationTime}
                    providerName={providerIdentifier}
                    serviceDuration={consultationRequired.duration}
                    accentColor={adaptiveAccentColor}
                    textColor={tokens.text}
                    subColor={tokens.sub}
                    surfaceColor={tokens.surface}
                    {...(consultationRequired.dbId && UUID_RE.test(consultationRequired.dbId) ? { serviceId: consultationRequired.dbId } : {})}
                  />
                </View>
              )}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>
                  {consultationRequired ? `Date & Time — ${service.name}` : 'Date & Time'}
                </Text>
                {isResolvingSlot && (
                  <View style={styles.resolvingRow}>
                    <ActivityIndicator size="small" color={adaptiveAccentColor} />
                    <Text style={[styles.resolvingText, { color: tokens.sub }]}>Finding your earliest available time…</Text>
                  </View>
                )}
                <ModernBeautyCalendar
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  onTimeSelect={setSelectedTime}
                  selectedTime={selectedTime}
                  providerName={providerIdentifier}
                  serviceDuration={service.duration}
                  accentColor={adaptiveAccentColor}
                  textColor={tokens.text}
                  subColor={tokens.sub}
                  surfaceColor={tokens.surface}
                  {...(uuidServiceId ? { serviceId: uuidServiceId } : {})}
                />
              </View>
            </>
          ) : step === 'pay' ? (
            <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>How would you like to pay?</Text>

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
                            ? `Pay Deposit (£${depositPolicy.depositAmount} flat)`
                            : `Pay Deposit (${depositPolicy.depositAmount}%)`
                          : 'Pay Deposit (20%)'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!showFullPaymentOption && (
                  <Text style={[styles.depositOnlyNotice, { color: tokens.sub }]}>
                    This provider requires a deposit to book — paying in full isn't available for this service.
                  </Text>
                )}
                {isDepositOnly && (
                  <Text style={[styles.depositRemainingText, { color: tokens.sub }]}>
                    Remaining: £{BookingService.calculateRemainingBalance(subtotal, depositPolicyArg).toFixed(2)} (pay at appointment)
                  </Text>
                )}
              </View>

              {/* Promo entry only on the add flow (from the provider profile) —
                  the cart itself has no promo code input; a code carried in
                  via CartItem.initialPromoCode still auto-applies there. */}
              {mode === 'add' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: tokens.text }]}>Have a promo code?</Text>
                  <PromoCodeRow
                    providerKey={providerKey}
                    {...(localPromo !== undefined ? { appliedPromo: localPromo } : {})}
                    discount={localPromoDiscount}
                    onApply={handleLocalApplyPromo}
                    onRemove={handleLocalRemovePromo}
                    borderColor={tokens.border}
                    surfaceColor={tokens.surface}
                    textColor={tokens.text}
                    subColor={tokens.sub}
                    accentColor={adaptiveAccentColor}
                  />
                </View>
              )}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>Add notes</Text>
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
            </>
          ) : (
            <>
              <Text style={[styles.stepQuestion, { color: tokens.text }]}>Does this look right?</Text>

              {service && (
                <View style={styles.section}>
                  <View style={styles.summaryHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: tokens.text, marginBottom: 0 }]}>Booking Summary</Text>
                    {/* The confirm step is where a mistake gets noticed, so
                        it has to offer a way back to the step that owns it
                        rather than making the client hunt for the ‹ button. */}
                    <TouchableOpacity onPress={() => goToStep('when')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.changeLink, { color: adaptiveAccentColor }]}>Change time</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.summaryItemRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryItemName, { color: tokens.text }]}>{service.name}</Text>
                      <Text style={[styles.summaryItemDateTime, { color: tokens.sub }]}>
                        {selectedDate && selectedTime ? `${formatShortDate(selectedDate)} at ${selectedTime}` : 'Not scheduled yet'}
                      </Text>
                    </View>
                    <Text style={[styles.summaryItemPrice, { color: adaptiveAccentColor }]}>£{(service.price ?? 0).toFixed(2)}</Text>
                  </View>
                  {/* Add-ons are itemised here rather than folded into the
                      service price — the summary shouldn't show a number the
                      client can't account for. */}
                  {selectedAddOns.map(a => (
                    <View key={a.id} style={styles.summaryAddOnRow}>
                      <Text style={[styles.summaryAddOnName, { color: tokens.sub }]} numberOfLines={1}>
                        + {a.name}
                      </Text>
                      <Text style={[styles.summaryAddOnPrice, { color: tokens.sub }]}>£{a.price.toFixed(2)}</Text>
                    </View>
                  ))}
                  {consultationRequired && (
                    <View style={styles.summaryItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.summaryItemName, { color: tokens.text }]}>{consultationRequired.name}</Text>
                        <Text style={[styles.summaryItemDateTime, { color: tokens.sub }]}>
                          {consultationDate && consultationTime ? `${formatShortDate(consultationDate)} at ${consultationTime}` : 'Not scheduled yet'}
                        </Text>
                      </View>
                      <Text style={[styles.summaryItemPrice, { color: adaptiveAccentColor }]}>£{consultationRequired.price.toFixed(2)}</Text>
                    </View>
                  )}
                  {/* On a deposit booking the service total and what's left to
                      settle with the provider are context the footer can't
                      show. The amount being charged now is NOT repeated here —
                      the footer owns that number, so there's exactly one
                      "what am I paying" figure in the sheet. */}
                  {isDepositOnly && (
                    <>
                      <View style={[styles.summaryDivider, { backgroundColor: tokens.border }]} />
                      <View style={styles.summaryAddOnRow}>
                        <Text style={[styles.summaryAddOnName, { color: tokens.sub }]}>Service total</Text>
                        <Text style={[styles.summaryAddOnPrice, { color: tokens.sub }]}>£{summaryServiceTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.summaryAddOnRow}>
                        <Text style={[styles.summaryAddOnName, { color: tokens.sub }]}>Remaining at appointment</Text>
                        <Text style={[styles.summaryAddOnPrice, { color: tokens.sub }]}>£{summaryRemaining.toFixed(2)}</Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* Only shown when this provider actually has a cancellation
                  policy on file — the checkbox text names "this provider's
                  cancellation policy" specifically, so with no policy set
                  there's nothing provider-specific to agree to and booking
                  should proceed like normal. CERVICED's own Terms &
                  Conditions agreement lives separately on the cart's own
                  checkout screen and is unaffected by this. */}
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
          {step === 'addons' ? (
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: adaptiveAccentColor }]}
              onPress={() => goToStep('when')}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitButtonText, { color: onAccentColor }]}>
                {`Next${totalAddOnsPrice > 0 ? ` • +£${totalAddOnsPrice.toFixed(2)}` : ''}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* The running total rides along on every step so the price is
                  never a surprise revealed only at the end. On a deposit
                  booking this is the deposit, not the service total, so it
                  must not be labelled "Total" — the rest is still owed to
                  the provider at the appointment. */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: tokens.text }]}>
                  {isDepositOnly ? 'Deposit due now' : 'Total'}
                </Text>
                <Text style={[styles.totalPrice, { color: adaptiveAccentColor }]}>£{effectivePrice.toFixed(2)}</Text>
              </View>

              {/* On the last step this commits the booking; before that it
                  just advances. Either way the label says what will happen,
                  and a blocker replaces it with what's missing. */}
              <View style={styles.footerButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: adaptiveAccentColor },
                    !!stepBlocker && styles.submitButtonDisabled,
                  ]}
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
                      ? 'Choose a date and time'
                      : stepBlocker
                      ? stepBlocker
                      : step === 'confirm'
                      ? (mode === 'add' ? 'Add to Cart' : 'Save Changes')
                      : 'Continue'}
                  </Text>
                </TouchableOpacity>

                {/* Editing an existing cart item is a correction to one
                    field, not a fresh multi-step booking — once whatever's
                    already set is valid (date/time picked, terms already
                    agreed from the original add-to-cart), the client should
                    be able to bail out and save right here instead of being
                    walked through "pay"/"confirm" again just to re-confirm
                    choices they aren't changing. Not shown in "add" mode,
                    where there's nothing yet to save until confirm. */}
                {mode === 'edit' && step !== 'confirm' && canFinishNow && (
                  <TouchableOpacity
                    style={[styles.submitButton, styles.doneButton, { borderColor: adaptiveAccentColor }]}
                    onPress={handleSubmit}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.submitButtonText, { color: adaptiveAccentColor }]}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
          </SafeAreaView>
        </View>
      </KeyboardDismissView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Dimmed backdrop + rounded sheet sliding up from the bottom — same
  // transparent-overlay idiom as CartScreen's PaymentModal, instead of an
  // opaque full-screen pageSheet.
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { flex: 1, marginTop: 100, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 28, alignItems: 'flex-start', justifyContent: 'center', marginRight: 4 },
  backButtonText: { fontSize: 28, fontWeight: '300', lineHeight: 28 },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  headerSubtitle: { fontSize: 13, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 15, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 26 },
  sectionTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, marginBottom: 12 },
  summaryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  changeLink: { fontSize: 13, fontWeight: '700' },
  addOnSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  addOnSummaryName: { fontSize: 14 },
  addOnSummaryPrice: { fontSize: 13, fontWeight: '600' },
  addOnsSummaryEmpty: { fontSize: 13 },
  addOnCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10,
  },
  addOnName: { fontSize: 14, fontWeight: '600' },
  addOnDescription: { fontSize: 12, marginTop: 2 },
  addOnPrice: { fontSize: 13, fontWeight: '700', marginRight: 10 },
  addOnCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addOnCheckmark: { fontSize: 12, fontWeight: '700' },
  policyCheckboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 },
  policyCheckboxLabel: { flex: 1, fontSize: 13 },
  requiredAsterisk: { color: '#FF3B30', fontWeight: '700' },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  resolvingText: { fontSize: 13 },
  consultationNotice: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  // The one question each step is asking. Sets the step's purpose before any
  // controls appear, so the client reads an intent rather than a form.
  stepQuestion: {
    fontFamily: 'BakbakOne-Regular', fontSize: 20,
    letterSpacing: -0.3, marginBottom: 22,
  },

  // ── Step progress ───────────────────────────────────────────────────
  progressRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2,
  },
  progressStep:  { alignItems: 'center', gap: 5 },
  progressDot:   { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5 },
  progressLabel: { fontSize: 10, fontWeight: '500' },
  // Sits level with the dots, not the labels below them.
  progressBar:   { height: 1.5, width: 34, marginHorizontal: 7, marginBottom: 15 },

  notesInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  characterCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  paymentButtons: { flexDirection: 'row', gap: 10 },
  paymentOptionButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingVertical: 12, alignItems: 'center' },
  paymentOptionText: { fontSize: 13, fontWeight: '600' },
  depositOnlyNotice: { fontSize: 13, lineHeight: 18 },
  depositRemainingText: { fontSize: 12, marginTop: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  totalLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  totalPrice: { fontFamily: 'BakbakOne-Regular', fontSize: 20, fontWeight: 'bold' },
  summaryAddOnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2, paddingLeft: 12 },
  summaryAddOnName: { fontSize: 12, flex: 1, marginRight: 8 },
  summaryAddOnPrice: { fontSize: 12 },
  summaryItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  summaryItemName: { fontSize: 14, fontWeight: '600' },
  summaryItemDateTime: { fontSize: 12, marginTop: 2 },
  summaryItemPrice: { fontSize: 14, fontWeight: '700' },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  footerButtonRow: { flexDirection: 'row', gap: 10 },
  submitButton: { borderRadius: 20, paddingVertical: 15, alignItems: 'center', flex: 1 },
  doneButton: { backgroundColor: 'transparent', borderWidth: 1.5 },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, fontWeight: 'bold' },
});
