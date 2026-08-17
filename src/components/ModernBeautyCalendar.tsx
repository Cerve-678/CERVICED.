import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Modal, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AvailabilityService } from '../services/AvailabilityService';
import { withAlpha } from '../constants/providerThemes';
import { formatLongDateNoYear } from '../utils/dateUtils';

// LayoutAnimation is opt-in on old-architecture Android; without this the
// collapse/expand below snaps instead of animating there.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TimeSlot = string;

type DayData = {
  available: number;
  status: 'past' | 'available' | 'closed' | 'unavailable';
  times: TimeSlot[];
};

type SlotsMap = { [date: string]: DayData };

type WeekDay = {
  date: Date;
  dateString: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  available: number;
  status: 'past' | 'available' | 'closed' | 'unavailable';
  times: TimeSlot[];
};

type ModernBeautyCalendarProps = {
  selectedDate?: string;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  selectedTime?: string;
  providerName?: string;
  serviceDuration?: string; // Duration of the service being booked (e.g., "2 hours", "45 mins")
  serviceId?: string | undefined; // Real services.id UUID — resolves this service's own buffer override
  style?: ViewStyle;
  /** Last date clients can book (today + bookingWindowDays). Undefined = no limit. */
  maxDate?: Date;
  /** Selected day/time highlight colour — the caller derives this from its
   *  own backdrop (not the OS/app dark-mode setting, not a fixed brand
   *  colour) so the picker always complements whatever sheet it's in. */
  accentColor: string;
  /** Primary / secondary text and neutral-surface colours — all derived by
   *  the caller from its own backdrop. No colour in this component reads
   *  the app's light/dark theme. */
  textColor: string;
  subColor: string;
  surfaceColor: string;
  /** Overrides how a day's bookable times are resolved. Default (undefined) is
   *  this-service slots via getAvailableSlots. The cart's group reschedule
   *  passes a chain-fit resolver instead, so the day pills AND the time row
   *  both reflect "every service in the group fits back-to-back", rather than
   *  offering times only the first service could take. Must be stable
   *  (useCallback) — it's a dependency of the weekly availability fetch. */
  slotResolver?: (date: string) => Promise<string[]>;
};

// Local YYYY-MM-DD — date.toISOString() converts to UTC first, which shifts
// the calendar date by one for any non-zero UTC offset near midnight (e.g. a
// date picked as "Wednesday" at local midnight can serialize as Tuesday's
// date in UTC+ zones). That wrong date then gets sent to AvailabilityService,
// which re-derives day-of-week from it — silently querying the wrong
// weekday's hours.
// Height-only ease. Deliberately not a spring/scale: this is a container
// resizing under content that stays put, not an element with its own physics.
const COLLAPSE_ANIM = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity
);

const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const ModernBeautyCalendar: React.FC<ModernBeautyCalendarProps> = ({
  selectedDate,
  onDateSelect,
  onTimeSelect,
  selectedTime,
  providerName,
  serviceDuration,
  serviceId,
  style = {},
  maxDate,
  accentColor,
  textColor,
  subColor,
  surfaceColor,
  slotResolver,
}) => {
  // Popup border — a low-alpha tint of the text colour, so it reads as a
  // hairline on either a light or dark backdrop without a separate flag.
  const popupBorder = useMemo(() => withAlpha(textColor, 0.14), [textColor]);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<SlotsMap>({});
  const [showTimeSelection, setShowTimeSelection] = useState<boolean>(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [showFullCalendar, setShowFullCalendar] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  // null = still checking, true = resolved to a real provider, false = no match
  const [providerFound, setProviderFound] = useState<boolean | null>(null);
  // A provider can go live with zero rows in provider_availability — nothing
  // upstream (search, go-live gating) currently prevents it. Without this,
  // that renders as every day showing 'closed', identical to a provider
  // simply not working that day, and the client only learns the real reason
  // from createBooking()'s rejection after picking a date AND time. Checked
  // once per provider via the same getAvailabilitySummary state the
  // provider's own profile already computes ('unpublished' vs 'closed').
  const [providerUnpublished, setProviderUnpublished] = useState<boolean>(false);
  // Once the client has actively picked a time, the whole picker collapses to
  // a one-line summary — a week strip plus ~20 time chips is the single
  // largest block in the booking sheet, and it's pure noise once the choice
  // is made. Only a real tap sets this: a date/time arriving from props (the
  // auto-resolved earliest slot, or an edit-mode initial value) must NOT
  // start the picker collapsed, or the client never sees that something was
  // chosen on their behalf.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  // Guards the auto-jump-to-next-availability below so it fires once per
  // provider/service, not on every manual week navigation.
  const autoJumpedRef = useRef(false);
  // Effects are declared before the helpers below to keep related availability
  // state together. Refs let those effects invoke the latest helper without
  // recreating the availability fetch on every render.
  const generateWeeklyAvailabilityRef = useRef<() => Promise<void>>(async () => {});
  const getWeekDaysRef = useRef<() => WeekDay[]>(() => []);

  // Resolve the provider ONCE up front so a bad/stale name shows a clear
  // message instead of rendering as an indistinguishable "fully booked"
  // week — the two currently look identical (empty slot lists) to a client.
  useEffect(() => {
    let cancelled = false;
    if (!providerName) { setProviderFound(true); return; }
    setProviderFound(null);
    setProviderUnpublished(false);
    AvailabilityService.resolveProvider(providerName).then(id => {
      if (cancelled) return;
      setProviderFound(!!id);
      if (!id) return;
      AvailabilityService.getAvailabilitySummary(providerName).then(summary => {
        if (!cancelled && summary?.state === 'unpublished') setProviderUnpublished(true);
      });
    });
    return () => { cancelled = true; };
  }, [providerName]);

  useEffect(() => {
    generateWeeklyAvailabilityRef.current();
  }, [currentWeek, providerName, serviceDuration, serviceId, maxDate, slotResolver]);

  // A new provider/service is a genuinely different schedule to check —
  // allow one fresh auto-jump attempt for it.
  useEffect(() => {
    autoJumpedRef.current = false;
  }, [providerName, serviceId]);

  // If the week currently on screen has nothing bookable at all, don't make
  // the client page forward hunting for an open day — jump straight to the
  // earliest date that has one. Runs once per provider/service; manual
  // navigation afterwards is left alone even if it lands on an empty week.
  useEffect(() => {
    if (autoJumpedRef.current || isLoadingSlots || !providerName || providerFound !== true || providerUnpublished) return;
    if (Object.keys(availableSlots).length === 0) return;

    const thisWeekHasOpening = getWeekDaysRef.current().some(day => day.status === 'available');
    if (thisWeekHasOpening) {
      autoJumpedRef.current = true;
      return;
    }
    autoJumpedRef.current = true;
    // findNextAvailableDate only knows single-service availability, so under a
    // custom resolver it would jump to a day this caller considers unbookable.
    // Leave the client on the current week instead — the day pills already
    // show, correctly, that nothing here fits.
    if (slotResolver) return;
    AvailabilityService.findNextAvailableDate(providerName, serviceDuration, serviceId).then(nextDate => {
      if (!nextDate) return;
      setCurrentWeek(new Date(nextDate + 'T00:00:00'));
      onDateSelect(nextDate);
    });
  }, [availableSlots, isLoadingSlots, providerName, providerFound, providerUnpublished, serviceDuration, serviceId, onDateSelect, slotResolver]);

  useEffect(() => {
    // ✅ FIXED: Proper null check with early return
    if (!selectedDate) {
      setShowTimeSelection(false);
      return;
    }

    const hasSlots = availableSlots[selectedDate] !== undefined;
    setShowTimeSelection(hasSlots);
  }, [selectedDate, availableSlots]);

  // Changing the date invalidates the collapsed summary: the chosen time
  // belongs to the old day and may not even exist on the new one, so the
  // picker has to reopen for a fresh time pick. Skips the very first run so
  // an initial/auto-resolved date doesn't count as a "change".
  const lastCollapsedDateRef = useRef<string | undefined>(selectedDate);
  useEffect(() => {
    if (lastCollapsedDateRef.current === selectedDate) return;
    lastCollapsedDateRef.current = selectedDate;
    setIsCollapsed(prev => {
      if (!prev) return prev;
      LayoutAnimation.configureNext(COLLAPSE_ANIM);
      return false;
    });
  }, [selectedDate]);

  const generateWeeklyAvailability = async () => {
    setIsLoadingSlots(true);
    const startOfWeek = getStartOfWeek(currentWeek);
    const slots: SlotsMap = {};

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateString = toLocalDateString(date);
      const isPast = date < new Date() && date.toDateString() !== new Date().toDateString();

      if (isPast) {
        slots[dateString] = { available: 0, status: 'past', times: [] };
        continue;
      }

      // Enforce booking window: dates beyond maxDate are unavailable
      if (maxDate !== undefined) {
        const maxDateMidnight = new Date(maxDate);
        maxDateMidnight.setHours(23, 59, 59, 999);
        if (date > maxDateMidnight) {
          slots[dateString] = { available: 0, status: 'unavailable', times: [] };
          continue;
        }
      }

      // Use AvailabilityService to get slots filtered by existing bookings —
      // or the caller's own rule, when what counts as "bookable" is more than
      // one service fitting (see slotResolver).
      if (providerName) {
        try {
          const openSlots = slotResolver
            ? await slotResolver(dateString)
            : (await AvailabilityService.getAvailableSlots(
                providerName,
                dateString,
                serviceDuration,
                serviceId
              ))
                .filter(slot => !slot.isBooked)
                .map(slot => slot.time);

          slots[dateString] = {
            available: openSlots.length,
            status: openSlots.length > 0 ? 'available' : 'closed',
            times: openSlots
          };
        } catch {
          // Fallback to base schedule without booking filter
          const dayOfWeek = date.getDay();
          const times = generateBeautyTimeSlots(dateString, dayOfWeek, providerName);
          slots[dateString] = {
            available: times.length,
            status: times.length > 0 ? 'available' : 'closed',
            times
          };
        }
      } else {
        // No provider specified, use default slots
        const dayOfWeek = date.getDay();
        const times = generateBeautyTimeSlots(dateString, dayOfWeek, providerName);
        slots[dateString] = {
          available: times.length,
          status: times.length > 0 ? 'available' : 'closed',
          times
        };
      }
    }

    setAvailableSlots(slots);
    setIsLoadingSlots(false);
  };
  generateWeeklyAvailabilityRef.current = generateWeeklyAvailability;

  const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  // Fallback used only when Supabase is unreachable. Returns standard hours —
  // real schedule must come from AvailabilityService (Supabase provider_availability).
  const generateBeautyTimeSlots = (
    _dateString: string,
    _dayOfWeek: number,
    _providerName?: string
  ): TimeSlot[] => {
    return [
      '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
      '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
    ];
  };

  const navigateWeek = (direction: number) => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() + direction * 7);
    setCurrentWeek(newWeek);
  };

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(calendarMonth.getMonth() + direction);
    setCalendarMonth(newMonth);
  };

  const getCalendarDays = (): (Date | null)[] => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    // Add empty slots for days before the 1st
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleCalendarDaySelect = (date: Date) => {
    const dateString = toLocalDateString(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return; // Don't allow past dates

    // Don't allow dates beyond the booking window
    if (maxDate !== undefined) {
      const maxDateMidnight = new Date(maxDate);
      maxDateMidnight.setHours(23, 59, 59, 999);
      if (date > maxDateMidnight) return;
    }

    // Set the week to contain this date
    setCurrentWeek(date);
    onDateSelect(dateString);
    // Deliberately does NOT close the popup — the client picks a date (and
    // can keep browsing months / re-pick) then taps Done explicitly, rather
    // than the first tap silently dismissing the whole picker.
  };

  const handleDateClick = (dateString: string, dayData: DayData) => {
    if (dayData.status === 'past' || dayData.status === 'closed') return;
    Haptics.selectionAsync().catch(() => {});
    onDateSelect(dateString);
  };

  // Picking a time is the last step of the flow, so it's what collapses the
  // picker down to the summary row. Re-tapping the already-selected time
  // collapses too (rather than being a no-op) — that's the obvious gesture
  // for "yes, this one" once a slot was auto-resolved for you.
  const handleTimeClick = (time: string) => {
    Haptics.selectionAsync().catch(() => {});
    onTimeSelect(time);
    LayoutAnimation.configureNext(COLLAPSE_ANIM);
    setIsCollapsed(true);
  };

  const handleExpand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    LayoutAnimation.configureNext(COLLAPSE_ANIM);
    setIsCollapsed(false);
  }, []);

  const formatWeekRange = (): string => {
    const startOfWeek = getStartOfWeek(currentWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startMonth = startOfWeek.toLocaleDateString('en-GB', { month: 'short' });
    const endMonth = endOfWeek.toLocaleDateString('en-GB', { month: 'short' });
    const startDay = startOfWeek.getDate();
    const endDay = endOfWeek.getDate();
    return startMonth === endMonth
      ? `${startMonth} ${startDay} - ${endDay}`
      : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  };

  const getWeekDays = (): WeekDay[] => {
    const startOfWeek = getStartOfWeek(currentWeek);
    const days: WeekDay[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateString = toLocalDateString(date);
      const dayData = availableSlots[dateString] || {
        available: 0,
        status: 'unavailable' as const,
        times: []
      };

      days.push({
        date,
        dateString,
        dayName: date.toLocaleDateString('en-GB', { weekday: 'short' }),
        dayNumber: date.getDate(),
        isToday: date.toDateString() === new Date().toDateString(),
        ...dayData
      });
    }
    
    return days;
  };
  getWeekDaysRef.current = getWeekDays;

  const weekDays = getWeekDays();

  const calendarDays = getCalendarDays();
  const weekDayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Sync availability map for the popup month view — used for dot indicators only.
  // No API calls; uses the same provider schedule logic as the week view fallback.
  const monthAvailability = useMemo<Record<string, boolean>>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: Record<string, boolean> = {};
    calendarDays.forEach(date => {
      if (!date) return;
      if (date < today) return;
      const dateString = toLocalDateString(date);
      // If the real week-slot data already loaded for this date, use it
      if (availableSlots[dateString] !== undefined) {
        result[dateString] = availableSlots[dateString].available > 0;
      } else {
        // Fall back to the sync schedule
        const times = generateBeautyTimeSlots(dateString, date.getDay(), providerName);
        result[dateString] = times.length > 0;
      }
    });
    return result;
  }, [calendarDays, availableSlots, providerName]);

  // Collapsed summary — replaces the entire week strip + time grid once the
  // client has confirmed a slot, so the sheet below it stays readable.
  if (isCollapsed && selectedDate && selectedTime) {
    return (
      <View style={[styles.container, style]}>
        <TouchableOpacity
          style={[styles.summaryRow, { backgroundColor: surfaceColor, borderColor: withAlpha(accentColor, 0.45) }]}
          onPress={handleExpand}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Selected ${formatLongDateNoYear(selectedDate)} at ${selectedTime}. Tap to change.`}
        >
          <View style={styles.summaryTextWrap}>
            <Text style={[styles.summaryDate, { color: textColor }]} numberOfLines={1}>
              {formatLongDateNoYear(selectedDate)}
            </Text>
            <Text style={[styles.summaryTime, { color: accentColor }]}>{selectedTime}</Text>
          </View>
          <Text style={[styles.summaryChange, { color: accentColor }]}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* ── Full Calendar Popup ──────────────────────────────────────── */}
      <Modal
        visible={showFullCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullCalendar(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFullCalendar(false)}
        >
          <View
            style={[styles.calendarPopup, { backgroundColor: surfaceColor, borderColor: popupBorder, borderWidth: StyleSheet.hairlineWidth }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Month nav */}
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthNavButton}>
                <Text style={[styles.monthNavArrow, { color: textColor }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: textColor }]}>
                {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthNavButton}>
                <Text style={[styles.monthNavArrow, { color: textColor }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekdayRow}>
              {weekDayHeaders.map(day => (
                <Text key={day} style={[styles.weekdayText, { color: subColor }]}>{day}</Text>
              ))}
            </View>

            {/* Calendar grid with dots */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((date, index) => {
                if (!date) return <View key={`empty-${index}`} style={styles.calendarDay} />;

                const dateString = toLocalDateString(date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast     = date < today;
                const isToday    = date.toDateString() === new Date().toDateString();
                const isSelected = selectedDate === dateString;
                const hasSlots   = !isPast && monthAvailability[dateString] === true;
                const isBeyondMax = maxDate !== undefined && (() => {
                  const maxMidnight = new Date(maxDate);
                  maxMidnight.setHours(23, 59, 59, 999);
                  return date > maxMidnight;
                })();
                const isDisabled = isPast || isBeyondMax;

                return (
                  <TouchableOpacity
                    key={`day-${index}`}
                    style={[
                      styles.calendarDay,
                      isToday && [styles.calendarDayToday, { borderColor: accentColor }],
                      isSelected && { borderWidth: 2, borderColor: accentColor },
                      isDisabled && styles.calendarDayPast
                    ]}
                    onPress={() => handleCalendarDaySelect(date)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        { color: isSelected ? accentColor : textColor },
                        isDisabled && { color: subColor }
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {/* Availability dot */}
                    <View style={styles.calDotWrap}>
                      {hasSlots && (
                        <View style={[styles.calDot, { backgroundColor: accentColor }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legend + explicit close — picking a date no longer auto-
                dismisses the popup (see handleCalendarDaySelect), so the
                client needs an explicit way to confirm and close. */}
            <View style={styles.legendDoneRow}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.legendText, { color: subColor }]}>Available slots</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowFullCalendar(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.calendarDoneButton, { backgroundColor: accentColor }]}
              >
                <Text style={styles.calendarDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Week navigation ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.navArrow, { color: textColor }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFullCalendar(true)} style={styles.weekRangeBtn}>
          <Text style={[styles.weekTitle, { color: textColor }]}>{formatWeekRange()}</Text>
          <Text style={[styles.weekChevron, { color: subColor }]}>▼</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.navArrow, { color: textColor }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Provider not found ──────────────────────────────────────────
          Distinct from "no hours today" — this means the identifier we
          were given never matched a real provider row at all, so every
          day would otherwise render as an indistinguishable blank/closed
          grid with no way to tell the two failures apart. */}
      {providerFound === false && (
        <View style={styles.notFoundBanner}>
          <Text style={[styles.notFoundText, { color: textColor }]}>
            We couldn't find this provider's schedule. Try reopening their profile and scheduling again.
          </Text>
        </View>
      )}

      {/* ── No schedule published ────────────────────────────────────────
          Distinct from providerFound === false (bad identifier) and from a
          day simply being 'closed' — this provider exists but has never set
          any hours, so createBooking would reject every date. The day pills
          still render (dimmed, disabled) so the week strip's shape stays
          recognisable instead of the section just vanishing; the time row
          is skipped entirely since there is nothing to ever populate it. */}
      {providerFound === true && providerUnpublished && (
        <View style={styles.notFoundBanner}>
          <Text style={[styles.notFoundText, { color: textColor }]}>
            No current availability — please check back later.
          </Text>
        </View>
      )}

      {/* ── Day pills ────────────────────────────────────────────────── */}
      {providerFound !== false && (
      <View style={[styles.daysRow, providerUnpublished && styles.daysRowDimmed]}>
        {weekDays.map(day => {
          const isSel = selectedDate === day.dateString;
          const isDisabled = providerUnpublished || day.status === 'past' || day.status === 'closed';
          return (
            <TouchableOpacity
              key={day.dateString}
              style={[
                styles.dayPill,
                { backgroundColor: surfaceColor },
                isSel && { borderWidth: 2, borderColor: accentColor },
                isDisabled && styles.pastDayPill,
              ]}
              onPress={() => handleDateClick(day.dateString, day)}
              disabled={isDisabled}
              activeOpacity={0.75}
            >
              <Text style={[styles.dayText, { color: isSel ? accentColor : subColor }]}>
                {day.dayName}
              </Text>
              <Text style={[styles.dayNumberText, { color: isSel ? accentColor : textColor }]}>
                {day.dayNumber}
              </Text>
              {/* Availability dot */}
              <View style={styles.dotWrap}>
                {day.available > 0
                  ? <View style={[styles.dot, { backgroundColor: accentColor }]} />
                  : <View style={styles.dotPlaceholder} />
                }
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      )}

      {/* ── Time slots ───────────────────────────────────────────────── */}
      {providerFound !== false && !providerUnpublished && showTimeSelection && selectedDate && (() => {
        const currentSlots = availableSlots[selectedDate];
        if (!currentSlots?.times || currentSlots.times.length === 0) return null;
        const chunkedTimes = chunkArray(currentSlots.times, Math.ceil(currentSlots.times.length / 3));
        return (
          <View style={styles.timeContainer}>
            {chunkedTimes.map((timeRow, idx) => (
              <View key={idx} style={styles.timeRow}>
                {timeRow.map(time => {
                  const timeSel = selectedTime === time;
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[
                        styles.timeTab,
                        { backgroundColor: surfaceColor },
                        timeSel && { borderWidth: 2, borderColor: accentColor },
                      ]}
                      onPress={() => handleTimeClick(time)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.timeText, { color: timeSel ? accentColor : textColor }]}>
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })()}
    </View>
  );
};

// Helper to chunk array into rows
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const styles = StyleSheet.create({
  // ── Main container ──────────────────────────────────────────────────
  container: { paddingVertical: 10, paddingHorizontal: 4 },

  // ── Collapsed summary row ───────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 2,
  },
  summaryTextWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  summaryDate:     { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  summaryTime:     { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  summaryChange:   { fontSize: 13, fontWeight: '600', marginLeft: 10 },

  // ── Provider-not-found banner ─────────────────────────────────────────
  notFoundBanner: { paddingVertical: 14, paddingHorizontal: 10 },
  notFoundText:   { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // ── Week navigation header ──────────────────────────────────────────
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 },
  navButton:    { width: 28, alignItems: 'center' },
  navArrow:     { fontSize: 24, fontWeight: '300', lineHeight: 28 },
  weekRangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weekTitle:    { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  weekChevron:  { fontSize: 10, marginTop: 2 },

  // ── Day pills ───────────────────────────────────────────────────────
  daysRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  daysRowDimmed:   { opacity: 0.45 },
  dayPill:         { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 8, marginHorizontal: 2 },
  pastDayPill:     { opacity: 0.38 },
  dayText:         { fontSize: 10, fontWeight: '500', marginBottom: 3 },
  dayNumberText:   { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  dotWrap:         { height: 6, justifyContent: 'center', alignItems: 'center', marginTop: 3 },
  dot:             { width: 4, height: 4, borderRadius: 2 },
  dotPlaceholder:  { width: 4, height: 4 },

  // ── Time slots ──────────────────────────────────────────────────────
  timeContainer: { paddingTop: 10, paddingHorizontal: 2 },
  timeRow:       { flexDirection: 'row', justifyContent: 'center', marginBottom: 6, flexWrap: 'wrap' },
  timeTab:       { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 12, marginHorizontal: 3, marginBottom: 4, minWidth: 68, alignItems: 'center' },
  timeText:      { fontSize: 13, fontWeight: '500' },

  // ── Full calendar modal ─────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  calendarPopup: {
    width: 300,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  monthHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthNavButton: { padding: 8 },
  monthNavArrow:  { fontSize: 22, fontWeight: '300' },
  monthTitle:     { fontSize: 16, fontWeight: '600' },
  weekdayRow:     { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekdayText:    { fontSize: 11, fontWeight: '500', width: 32, textAlign: 'center' },
  calendarGrid:   { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: {
    width: '14.28%',
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  calendarDayToday: { borderWidth: 1.5, borderRadius: 12 },
  calendarDayPast: { opacity: 0.35 },
  calendarDayText: { fontSize: 13, fontWeight: '500' },
  calDotWrap:  { height: 5, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  calDot:      { width: 4, height: 4, borderRadius: 2 },
  legendDoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 6, height: 6, borderRadius: 3 },
  legendText:  { fontSize: 11 },
  calendarDoneButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 },
  calendarDoneText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
