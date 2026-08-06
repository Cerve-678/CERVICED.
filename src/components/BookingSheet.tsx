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
  LayoutAnimation,
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
import { buildThemeTokens, withAlpha } from '../constants/providerThemes';
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

// Matches ModernBeautyCalendar's collapse timing so the two kinds of
// expand/collapse in this sheet feel like one behaviour, not two.
const OPTIONAL_ANIM = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity
);

// Matches MultiBookingSheet's own formatShortDate — same "Wed, 12 Aug" style
// used everywhere else a booked date is summarised.
const formatShortDate = (dateStr: string): string =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

/**
 * An optional section that stays shut until the client asks for it.
 *
 * Notes and Promo Code are the two things in this sheet nobody has to fill
 * in, but expanded they read as heavily as the required steps — a textarea
 * and a text input demanding attention before you can reach the button.
 * Collapsed to one line each, the default view shows only what's actually
 * needed to book, and the capability is one tap away rather than gone.
 *
 * `summary` is what the row shows once there's something to show, so a
 * filled-in section never hides its own content behind a generic label.
 */
const OptionalSection: React.FC<{
  label: string;
  summary?: string | undefined;
  tokens: { text: string; sub: string; border: string; surface: string };
  accentColor: string;
  children: React.ReactNode;
}> = ({ label, summary, tokens, accentColor, children }) => {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.summaryHeaderRow}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            LayoutAnimation.configureNext(OPTIONAL_ANIM);
            setOpen(false);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionTitle, { color: tokens.text, marginBottom: 0 }]}>{label}</Text>
          <Text style={[styles.changeLink, { color: accentColor }]}>Done</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 12 }}>{children}</View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.optionalRow, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        LayoutAnimation.configureNext(OPTIONAL_ANIM);
        setOpen(true);
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={summary ? `${label}: ${summary}. Tap to edit.` : `${label}. Tap to add.`}
    >
      <Text
        style={[styles.optionalRowText, { color: summary ? tokens.text : tokens.sub }]}
        numberOfLines={1}
      >
        {summary ?? label}
      </Text>
      <Text style={[styles.optionalRowAction, { color: accentColor }]}>{summary ? 'Edit' : 'Add'}</Text>
    </TouchableOpacity>
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
  selectedAddOns: Array<{ id: string | number; name: string; price: number }>;
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
  adaptiveAccentColor: string;
  /** Sheet's background colour — always the caller's own content-backdrop
   *  colour (e.g. the provider's card colour, or the cart's card colour),
   *  never derived from system/app dark mode. The sheet has no light/dark
   *  fallback of its own; every caller must supply this. */
  backgroundColor: string;
  initial?: {
    selectedAddOns?: Array<{ id: string | number; name: string; price: number }> | undefined;
    selectedDate?: string | undefined;
    selectedTime?: string | undefined;
    notes?: string | undefined;
    isDepositOnly?: boolean | undefined;
  };
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
  const isDark = tokens.isDark;

  const [selectedAddOns, setSelectedAddOns] = useState<
    Array<{ id: string | number; name: string; price: number }>
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

  // Two-step flow: pick add-ons first (its own screen, like the old
  // AddOnsModal), then "Next" into the booking screen — add-ons, notes,
  // payment and promo, and where the picked add-ons show up as a read-only
  // summary instead of the interactive list. Services with no add-ons skip
  // straight to "book" — there's nothing to pick.
  const [step, setStep] = useState<'addons' | 'book'>('book');

  const resolvedOnce = useRef(false);
  const depositFetched = useRef(false);

  // Reset/seed local state each time the sheet opens for a (possibly new) service.
  useEffect(() => {
    if (!isVisible) return;
    setSelectedAddOns(initial?.selectedAddOns ?? []);
    setSelectedDate(initial?.selectedDate ?? '');
    setSelectedTime(initial?.selectedTime ?? '');
    setNotes(initial?.notes ?? '');
    setIsDepositOnly(initial?.isDepositOnly ?? false);
    setAgreedToPolicy(false);
    setLocalPromo(undefined);
    setConsultationDate('');
    setConsultationTime('');
    setStep((service?.addOns?.length ?? 0) > 0 ? 'addons' : 'book');
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

  const handleSubmit = useCallback(() => {
    if (!service) return;
    if (consultationScheduleMissing) return; // guarded by disabling the button too
    if (!agreedToPolicy) return; // guarded by disabling the button too
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
    });
    onClose();
  }, [service, consultationScheduleMissing, agreedToPolicy, selectedAddOns, selectedDate, selectedTime, notes, isDepositOnly, mode, localPromo, consultationRequired, consultationDate, consultationTime, onSubmit, onClose]);

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
          {step === 'book' && hasAddOns && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep('addons')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.backButtonText, { color: adaptiveAccentColor }]}>‹</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: tokens.text }]}>
              {step === 'addons' ? 'Choose Add-ons' : mode === 'add' ? 'Book Service' : 'Edit Booking'}
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
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
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
                      {isSelected && <Text style={styles.addOnCheckmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <>
              {/* First of the two groups — see PAYMENT & DETAILS below. */}
              <Text style={[styles.groupHeading, styles.groupHeadingFirst, { color: tokens.sub }]}>
                YOUR APPOINTMENT
              </Text>

              {hasAddOns && (
                <View style={styles.section}>
                  <View style={styles.summaryHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: tokens.text }]}>Add-ons</Text>
                    <TouchableOpacity onPress={() => setStep('addons')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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

              <OptionalSection
                label="Add notes"
                summary={notes.trim() ? notes.trim() : undefined}
                tokens={tokens}
                accentColor={adaptiveAccentColor}
              >
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
              </OptionalSection>

              {/* Second of the two groups. Everything above is about the
                  appointment itself; everything below is about paying for
                  it. Two headings give the eye somewhere to rest in what
                  was otherwise seven equally-weighted sections in a row. */}
              <Text style={[styles.groupHeading, { color: tokens.sub, borderTopColor: tokens.border }]}>
                PAYMENT & DETAILS
              </Text>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>Payment</Text>
                {showFullPaymentOption ? (
                  <View style={styles.paymentButtons}>
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
                    {depositPolicy?.depositAvailable !== false && (
                      <TouchableOpacity
                        style={[
                          styles.paymentOptionButton,
                          { backgroundColor: tokens.surface },
                          isDepositOnly && { backgroundColor: withAlpha(adaptiveAccentColor, 0.14), borderColor: adaptiveAccentColor },
                        ]}
                        onPress={() => setIsDepositOnly(true)}
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
                ) : (
                  <Text style={[styles.depositOnlyNotice, { color: tokens.sub }]}>
                    This provider requires a deposit to book — paying in full isn't available for this service.
                  </Text>
                )}
                {isDepositOnly && (
                  <View style={[styles.depositInfo, { backgroundColor: isDark ? 'rgba(76,175,80,0.16)' : 'rgba(76,175,80,0.1)' }]}>
                    <Text style={[styles.depositInfoText, { color: isDark ? '#7BD989' : '#2E7D32' }]}>
                      Deposit: £{BookingService.calculateDeposit(subtotal, depositPolicyArg).toFixed(2)}
                    </Text>
                    <Text style={[styles.depositRemainingText, { color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)' }]}>
                      Remaining: £{BookingService.calculateRemainingBalance(subtotal, depositPolicyArg).toFixed(2)} (pay at appointment)
                    </Text>
                  </View>
                )}
              </View>

              {/* Promo entry only on the add flow (from the provider profile) —
                  the cart itself has no promo code input; a code carried in
                  via CartItem.initialPromoCode still auto-applies there. */}
              {mode === 'add' && (
                <OptionalSection
                  label="Have a promo code?"
                  summary={localPromo?.promo_code ? `Promo ${localPromo.promo_code} applied` : undefined}
                  tokens={tokens}
                  accentColor={adaptiveAccentColor}
                >
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
                </OptionalSection>
              )}

              {service && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: tokens.text }]}>Booking Summary</Text>
                  <View style={styles.summaryItemRow}>
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

              <TouchableOpacity
                style={styles.policyCheckboxRow}
                onPress={() => setAgreedToPolicy(!agreedToPolicy)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.addOnCheckbox,
                  { borderColor: tokens.border, backgroundColor: agreedToPolicy ? adaptiveAccentColor : 'transparent' },
                ]}>
                  {agreedToPolicy && <Text style={styles.addOnCheckmark}>✓</Text>}
                </View>
                {/* TODO(copy): placeholder legal copy — needs user-directed final wording, not to be treated as reviewed/final */}
                <Text style={[styles.policyCheckboxLabel, { color: tokens.text }]}>
                  I agree to the Terms & Conditions<Text style={styles.requiredAsterisk}> *</Text> and this provider's cancellation policy
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: tokens.border, backgroundColor: sheetBackground }]}>
          {step === 'addons' ? (
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: adaptiveAccentColor }]}
              onPress={() => setStep('book')}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>
                {`Next${totalAddOnsPrice > 0 ? ` • +£${totalAddOnsPrice.toFixed(2)}` : ''}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* The single "what am I paying" figure in the sheet. On a
                  deposit booking this is the deposit, not the service total,
                  so it must not be labelled "Total" — the rest of the service
                  price is still owed to the provider at the appointment. */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: tokens.text }]}>
                  {isDepositOnly ? 'Deposit due now' : 'Total'}
                </Text>
                <Text style={[styles.totalPrice, { color: adaptiveAccentColor }]}>£{effectivePrice.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: adaptiveAccentColor }, (consultationScheduleMissing || !agreedToPolicy) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={consultationScheduleMissing || !agreedToPolicy}
              >
                <Text style={styles.submitButtonText}>
                  {consultationScheduleMissing
                    ? 'Choose a consultation time'
                    : !agreedToPolicy
                    ? 'Agree to terms to continue'
                    : mode === 'add' ? 'Add to Cart' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
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
  closeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
  addOnCheckmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  policyCheckboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 },
  policyCheckboxLabel: { flex: 1, fontSize: 13 },
  requiredAsterisk: { color: '#FF3B30', fontWeight: '700' },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  resolvingText: { fontSize: 13 },
  consultationNotice: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  // Group heading — smaller and quieter than a sectionTitle. It separates
  // the two halves of the sheet without competing with the section titles
  // inside them.
  groupHeading: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18, marginBottom: 16,
  },
  groupHeadingFirst: { borderTopWidth: 0, paddingTop: 0 },

  // Collapsed optional section — deliberately lighter than a sectionTitle so
  // the required steps stay visually dominant.
  optionalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14, marginBottom: 12,
  },
  optionalRowText:   { flex: 1, fontSize: 14, marginRight: 12 },
  optionalRowAction: { fontSize: 13, fontWeight: '700' },

  notesInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  characterCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  paymentButtons: { flexDirection: 'row', gap: 10 },
  paymentOptionButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingVertical: 12, alignItems: 'center' },
  paymentOptionText: { fontSize: 13, fontWeight: '600' },
  depositOnlyNotice: { fontSize: 13, lineHeight: 18 },
  depositInfo: { borderRadius: 12, padding: 12, marginTop: 10 },
  depositInfoText: { fontSize: 13, fontWeight: '700' },
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
  submitButton: { borderRadius: 20, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: '#fff', fontWeight: 'bold' },
});
