import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AvailabilityService } from '../services/AvailabilityService';
import type { EmergencyReason, EmergencyRequestPolicy } from '../services/AvailabilityService';
import { withAlpha } from '../constants/providerThemes';
import { formatLongDateNoYear } from '../utils/dateUtils';
import { RequestTimePanel } from './RequestTimePanel';

/** Emergency/by-request outline. Deliberately NOT the caller's accent: every
 *  other colour in this picker is derived from whatever sheet it's sitting in,
 *  because those all mean "this is bookable". This one means the opposite —
 *  it needs the same warning read on every backdrop, so it's fixed. Applied to
 *  the DATE pill and the TIME chip alike, so a red-outlined day and a
 *  red-outlined time are visibly the same fact. */
const EMERGENCY_OUTLINE = '#FF3B30';

/** One offerable start time. `reasons` is empty for an ordinary slot, and
 *  names the provider's own rules the time breaks when it's only bookable as
 *  a request they have to accept (see AvailabilityService.TimeSlot). */
/** One time in the day's grid. `blocked` is set when the time exists but
 *  can't be taken — already booked, already gone, inside the provider's
 *  notice window, or 'tight': free in itself, but this service won't fit
 *  between the bookings around it. Those still render, greyed and inert: a
 *  day shown as an empty space can't be told apart from one that failed to
 *  load, and hiding a booked-out morning quietly rewrites how busy the
 *  provider looks. */
export type TimeSlot = {
  time: string;
  reasons: EmergencyReason[];
  blocked?: 'booked' | 'past' | 'notice' | 'tight' | undefined;
};

export type DayData = {
  /** Ordinary, unconditional slots only — a day that can ONLY be requested
   *  is not "available", and must not read as one on the day strip or drive
   *  the auto-jump below. */
  available: number;
  /** Slots offered only as a request. */
  requestable: number;
  status: 'past' | 'available' | 'request' | 'closed' | 'full' | 'over' | 'unavailable';
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
  requestable: number;
  status: 'past' | 'available' | 'request' | 'closed' | 'full' | 'over' | 'unavailable';
  times: TimeSlot[];
};

type ModernBeautyCalendarProps = {
  selectedDate?: string;
  onDateSelect: (date: string) => void;
  /** `requestReasons` is present only when the client picked a slot the
   *  provider's own rules exclude and they've opted into being asked anyway
   *  — the caller is responsible for confirming that with them before the
   *  booking goes anywhere. Absent for every ordinary slot, so a caller that
   *  ignores it keeps working unchanged. */
  onTimeSelect: (time: string, requestReasons?: EmergencyReason[]) => void;
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
  /** How to NAME the provider in by-request copy. `providerName` above is an
   *  identifier and is frequently a raw UUID, so it can't be shown to anyone.
   *  Falls back to "the provider" when absent. */
  providerLabel?: string;
  /** Opt IN to offering times the provider only accepts as a request (see
   *  AvailabilityService's EmergencyRequestPolicy). Defaults to false, and
   *  deliberately so: a caller that shows these has to carry the resulting
   *  flag all the way through to checkout, or the booking is rejected by the
   *  same rule that made it a request in the first place. Every picker that
   *  can't do that — reschedule, group chains, the consultation prerequisite
   *  — simply never sees them. */
  allowRequests?: boolean;
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

/**
 * A day's summary from its offerable times. A day whose ONLY times are
 * by-request is 'request', not 'available': it stays tappable, but it must
 * not claim ordinary availability on the day strip, in the month dots, or to
 * the auto-jump — those all mean "you can just book this".
 *
 * `isFullyBooked` separates the two ways a day can end up with nothing to
 * offer. Without it both collapsed to 'closed', so a provider booked solid on
 * Tuesday looked exactly like a provider who never works Tuesdays — same grey
 * pill, same empty dot, same dead tap. Those want opposite responses from a
 * client (wait for this provider vs. pick another day), so they can't share a
 * state. Note this is NOT the same question the availability strip's 'full'
 * answers (booked minutes vs open minutes): this one is about THIS service's
 * slot grid, so a day with only 20 minutes free is full for a 2-hour service
 * and open for a 15-minute one.
 */
export const dayDataFrom = (times: TimeSlot[], isFullyBooked = false): DayData => {
  // Blocked times are in `times` so they can be shown, but they are not on
  // offer — counting them would put an availability dot on a day with
  // nothing left and send the auto-jump to it.
  const offerable = times.filter(slot => !slot.blocked);
  const available = offerable.filter(slot => slot.reasons.length === 0).length;
  const requestable = offerable.length - available;
  return {
    available,
    requestable,
    status: available > 0
      ? 'available'
      : requestable > 0
        ? 'request'
        : isFullyBooked
          ? 'full'
          // The day had times and none can be reached any more, but nobody
          // took them — they've simply been and gone (or are inside the
          // provider's notice window). Not 'closed', which means the provider
          // never works this day and is what makes a pill untappable.
          : times.length > 0 ? 'over' : 'closed',
    times,
  };
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
  providerLabel,
  allowRequests = false,
}) => {
  // Popup border — a low-alpha tint of the text colour, so it reads as a
  // hairline on either a light or dark backdrop without a separate flag.
  const popupBorder = useMemo(() => withAlpha(textColor, 0.14), [textColor]);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<SlotsMap>({});
  const [showTimeSelection, setShowTimeSelection] = useState<boolean>(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [showFullCalendar, setShowFullCalendar] = useState<boolean>(false);
  const [showRequestPanel, setShowRequestPanel] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  // null = still checking, true = resolved to a real provider, false = no match
  const [providerFound, setProviderFound] = useState<boolean | null>(null);
  // A provider can go live with zero rows in provider_availability — nothing
  // upstream (search, go-live gating) currently prevents it. Without this,
  // that renders as every day showing 'closed', identical to a provider
  // simply not working that day, and the client only learns the real reason
  // from the booking attempt's rejection after picking a date AND time. Checked
  // once per provider via the same getAvailabilitySummary state the
  // provider's own profile already computes ('unpublished' vs 'closed').
  const [providerUnpublished, setProviderUnpublished] = useState<boolean>(false);
  // This provider's emergency-request opt-ins. Needed here — not just inside
  // getAvailableSlots — because the booking-window rule is enforced on the
  // DATE before any slot lookup happens (see maxDate below), so a provider
  // who accepts requests beyond their window would otherwise still have
  // those dates greyed out. Starts fully closed and stays that way for any
  // provider that hasn't opted in.
  const [emergencyPolicy, setEmergencyPolicy] = useState<EmergencyRequestPolicy>({
    outsideHours: false, blockedDates: false, shortNotice: false, beyondWindow: false,
    beforeMins: null, afterMins: null,
  });
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
  // Which weekly fetch is current. generateWeeklyAvailability awaits up to
  // seven per-day lookups and then REPLACES the whole slots map, so two runs
  // overlapping (paging weeks quickly, or slotResolver changing when a
  // service is pulled out of a group) let the slower, older run land last —
  // the map then holds the previous week's dates, every visible day falls
  // through to the 'unavailable' default in getWeekDays, and a week with real
  // openings renders as completely closed.
  const fetchSeqRef = useRef(0);

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
      // The emergency-request opt-ins only ever change what this picker shows
      // when it's allowed to offer request slots at all. When it isn't (the
      // common case — the feature flag is off), skip the round trip: fetching
      // it would land as a state change that re-runs the whole weekly slot
      // fetch a second time for nothing, which is the lag on first open.
      if (allowRequests) {
        AvailabilityService.getEmergencyRequestPolicy(providerName).then(policy => {
          if (!cancelled) setEmergencyPolicy(policy);
        });
      }
    });
    return () => { cancelled = true; };
  }, [providerName, allowRequests]);

  useEffect(() => {
    generateWeeklyAvailabilityRef.current();
  }, [currentWeek, providerName, serviceDuration, serviceId, maxDate, slotResolver, emergencyPolicy, allowRequests]);

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

    // A week whose only openings are by-request still counts: jumping past
    // it would hide times the provider has explicitly offered to consider.
    const weekDaysNow = getWeekDaysRef.current();
    const firstOpening = weekDaysNow
      .find(day => day.status === 'available' || day.status === 'request');
    if (firstOpening) {
      autoJumpedRef.current = true;
      // Select it here rather than leaving the sheet's own slot resolver to
      // do it. That resolver is several sequential round trips deep, and
      // until SOMETHING sets a date this section renders nothing at all —
      // so the whole time grid sat blank behind "Finding your earliest
      // available time…" even though this week's slots had already arrived.
      // It still runs, and still wins if it lands on something better; this
      // just stops the grid waiting on it.
      if (!selectedDate) onDateSelect(firstOpening.dateString);
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
  }, [availableSlots, isLoadingSlots, providerName, providerFound, providerUnpublished, serviceDuration, serviceId, onDateSelect, slotResolver, selectedDate]);

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
    const seq = ++fetchSeqRef.current;
    setIsLoadingSlots(true);
    const startOfWeek = getStartOfWeek(currentWeek);
    const slots: SlotsMap = {};

    // Resolve ONE day. Pulled out of the loop below so the seven can run
    // concurrently — this used to be a sequential `for` with an await inside,
    // so opening the picker (or paging a week) cost seven round trips end to
    // end and the spinner sat there for all of them. They don't depend on
    // each other, and AvailabilityService de-dupes the provider-level reads
    // they share, so the whole week now costs roughly what one day did.
    const resolveDay = async (date: Date, dateString: string): Promise<DayData> => {
      if (!providerName) {
        return dayDataFrom(generateBeautyTimeSlots(dateString, date.getDay(), providerName));
      }
      try {
        // A custom resolver only ever yields ordinary slots — it has no
        // notion of the provider's emergency opt-ins, so nothing it
        // returns may be presented as a request.
        if (slotResolver) {
          return dayDataFrom((await slotResolver(dateString)).map(time => ({ time, reasons: [] })));
        }
        // getAvailableSlots returns the day's WHOLE grid, taken times
        // included and flagged — so an empty grid means the provider
        // isn't working, while a grid where every entry is taken means
        // they're booked out. Filtering first threw that away.
        const grid = await AvailabilityService.getAvailableSlots(
          providerName,
          dateString,
          serviceDuration,
          serviceId,
          // Ask for the times that have gone as well as the ones left, so a
          // day that's over still shows its shape.
          true,
        );
        // Fullness is measured over ORDINARY slots only. By-request times
        // must not answer it in either direction: they'd mask a genuinely
        // booked-out day at an opted-in provider (there is always a free 4am),
        // and their absence must not make a day the provider simply doesn't
        // work look "booked", which would blame other clients for it.
        // A 'tight' time counts towards fullness even though nobody took it:
        // it's unreachable BECAUSE of the bookings around it, so a day of
        // taken times and the gaps they leave really is booked out for this
        // service. At least one has to be genuinely taken, or the claim has
        // no other client behind it at all.
        const ordinary = grid.filter(slot => !slot.isByRequest);
        const isFullyBooked = ordinary.length > 0
          && ordinary.every(slot => slot.isBooked || slot.unbookable === 'tight')
          && ordinary.some(slot => slot.isBooked);

        // Everything the day contains, each carrying whether it can be taken.
        // A by-request time this caller isn't allowed to offer is dropped
        // outright rather than greyed — greying it would advertise a time
        // this picker can't carry through checkout anyway.
        const slots: TimeSlot[] = grid
          .filter(slot => allowRequests || !slot.isByRequest)
          .map(slot => ({
            time: slot.time,
            reasons: slot.requestReasons ?? [],
            ...(slot.isBooked
              ? { blocked: 'booked' as const }
              : slot.unbookable
                ? { blocked: slot.unbookable }
                : {}),
          }));

        // A day whose WHOLE grid is by-request has no ordinary hours on it at
        // all — the provider doesn't work it (the out-of-hours opt-in fills
        // such a day end to end), it's one they blocked, or it's past their
        // booking window. When this picker can't carry requests the filter
        // above empties it, and 'closed' — "they don't work this day" — is the
        // right answer even if a booking happens to sit there: an accepted
        // out-of-hours request or a manual squeeze-in is the provider's own
        // doing, not other clients taking the day. Showing those times struck
        // through under "Fully booked" told the client the opposite, and sent
        // them to a waitlist that can't help.
        return dayDataFrom(slots, isFullyBooked);
      } catch {
        // Fallback to base schedule without booking filter
        return dayDataFrom(generateBeautyTimeSlots(dateString, date.getDay(), providerName));
      }
    };

    const pending: Promise<void>[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateString = toLocalDateString(date);
      const isPast = date < new Date() && date.toDateString() !== new Date().toDateString();

      if (isPast) {
        slots[dateString] = { available: 0, requestable: 0, status: 'past', times: [] };
        continue;
      }

      // Enforce booking window: dates beyond maxDate are unavailable — unless
      // this provider takes requests beyond it, in which case the date is
      // left in and getAvailableSlots decides (it applies the same window
      // rule itself, and returns by-request slots when the opt-in is on).
      // Without this the picker would grey out dates the provider has
      // explicitly said they'll consider.
      if (maxDate !== undefined && !(allowRequests && emergencyPolicy.beyondWindow)) {
        const maxDateMidnight = new Date(maxDate);
        maxDateMidnight.setHours(23, 59, 59, 999);
        if (date > maxDateMidnight) {
          slots[dateString] = { available: 0, requestable: 0, status: 'unavailable', times: [] };
          continue;
        }
      }

      pending.push(resolveDay(date, dateString).then(day => { slots[dateString] = day; }));
    }

    await Promise.all(pending);

    // A newer run started while this one was awaiting — its result is the
    // one that matches what's on screen, so drop this entirely (including
    // the spinner, which the newer run still owns).
    if (seq !== fetchSeqRef.current) return;
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
    ].map(time => ({ time, reasons: [] }));
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

  // A day the user actually TAPPED invalidates whatever time is already
  // selected: the same clock time usually isn't offered on the new day, and
  // someone moving quickly (tap a new day, go straight for Done/Continue)
  // would otherwise submit a slot that was never available on it. Clearing
  // the time is also what keeps the caller's Done/Continue disabled — every
  // caller already gates on having a time — until a real pick is made.
  //
  // Deliberately done here in the tap handlers rather than in the
  // selectedDate effect above: that effect cannot tell a user tap from the
  // caller auto-resolving an earliest-available date AND time together (they
  // land in the same render), so clearing there would wipe the time the
  // caller had just resolved.
  const selectDateFromTap = useCallback((dateString: string) => {
    onDateSelect(dateString);
    if (dateString !== selectedDate && selectedTime) onTimeSelect('');
  }, [onDateSelect, onTimeSelect, selectedDate, selectedTime]);

  /** The date being requested, defaulting to whatever the picker is already
   *  showing. */
  const requestPanelDate = selectedDate || toLocalDateString(new Date());

  /** Only this date's by-request times. The panel never derives its own — see
   *  RequestTimePanel's header for why that matters. */
  const requestTimesForDate = useMemo(
    () => (availableSlots[requestPanelDate]?.times ?? []).filter(slot => slot.reasons.length > 0),
    [availableSlots, requestPanelDate],
  );

  /** Moving the request sheet's date has to move the WEEK with it: the slot
   *  fetch runs a week at a time, so a date outside the current one has no
   *  resolved times at all until its week is the one being fetched. Without
   *  this, picking a date a month out showed an empty sheet forever. */
  const handleRequestDateChange = useCallback((dateString: string) => {
    const [y, m, d] = dateString.split('-').map(part => parseInt(part, 10));
    setCurrentWeek(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
    selectDateFromTap(dateString);
  }, [selectDateFromTap]);

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

    // A day the provider doesn't work is a dead end here too — only refuse it
    // once its slots have actually loaded and come back empty, so a date whose
    // week hasn't been fetched yet still opens (fetching it is the point).
    if (availableSlots[dateString]?.status === 'closed') return;

    // Set the week to contain this date
    setCurrentWeek(date);
    selectDateFromTap(dateString);
    // Deliberately does NOT close the popup — the client picks a date (and
    // can keep browsing months / re-pick) then taps Done explicitly, rather
    // than the first tap silently dismissing the whole picker.
  };

  const handleDateClick = (dateString: string, dayData: DayData) => {
    // 'past' and 'closed' are dead ends and the pill is already disabled for
    // them — this is the backstop. Every other state has something to say
    // (booked out, over, or "not this far ahead yet"), so it takes the tap.
    if (dayData.status === 'past' || dayData.status === 'closed') return;
    Haptics.selectionAsync().catch(() => {});
    selectDateFromTap(dateString);
  };

  // Picking a time is the last step of the flow, so it's what collapses the
  // picker down to the summary row. Re-tapping the already-selected time
  // collapses too (rather than being a no-op) — that's the obvious gesture
  // for "yes, this one" once a slot was auto-resolved for you.
  const handleTimeClick = (time: string, requestReasons: EmergencyReason[]) => {
    Haptics.selectionAsync().catch(() => {});
    onTimeSelect(time, requestReasons.length > 0 ? requestReasons : undefined);
    LayoutAnimation.configureNext(COLLAPSE_ANIM);
    setIsCollapsed(true);
  };

  /** Picking from the panel closes it: the choice is made, and leaving the
   *  panel up would mean re-opening the picker later landing on the request
   *  list rather than on the ordinary times. */
  const handlePanelPickTime = (time: string, reasons: EmergencyReason[]) => {
    setShowRequestPanel(false);
    handleTimeClick(time, reasons);
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
        requestable: 0,
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
        result[dateString] = availableSlots[dateString].available + availableSlots[dateString].requestable > 0;
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
        transparent statusBarTranslucent navigationBarTranslucent
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
                const isBeyondMax = maxDate !== undefined && !(allowRequests && emergencyPolicy.beyondWindow) && (() => {
                  const maxMidnight = new Date(maxDate);
                  maxMidnight.setHours(23, 59, 59, 999);
                  return date > maxMidnight;
                })();
                // Only once this date's week has been fetched and come back as
                // a non-working day — an un-fetched future date stays tappable
                // so picking it can load its week.
                const isKnownClosed = availableSlots[dateString]?.status === 'closed';
                const isDisabled = isPast || isBeyondMax || isKnownClosed;

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
          any hours, so the booking RPC would reject every date. The day pills
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
          // A past day and a day the provider simply doesn't work are both
          // dead ends — nothing to pick, nowhere to go (requests are off) —
          // so neither takes a tap. 'over' still has a greyed grid and a
          // badge worth showing, and 'unavailable' (too far ahead) has its
          // own one-line explanation, so those stay tappable.
          const isDisabled = providerUnpublished || day.status === 'past' || day.status === 'closed';
          // Both mean "this day had times and none of them are open" — the
          // bar below says exactly that, where an empty space would say the
          // provider doesn't work this day.
          const isFull = day.status === 'full' || day.status === 'over';
          // A day the provider doesn't work, or one too far ahead to book,
          // reads as unavailable at a glance — greyed as heavily as a past
          // day. 'closed' is also inert (see isDisabled); 'unavailable'
          // stays tappable so its "not this far ahead yet" note can show.
          const isClosedDay = day.status === 'closed' || day.status === 'unavailable';
          return (
            <TouchableOpacity
              key={day.dateString}
              style={[
                styles.dayPill,
                { backgroundColor: surfaceColor },
                isSel && { borderWidth: 2, borderColor: accentColor },
                isDisabled && styles.pastDayPill,
                isClosedDay && !isSel && styles.closedDayPill,
                // Dimmed, but less than a closed day and still tappable —
                // it's a real day the client could have booked.
                isFull && !isSel && styles.fullDayPill,
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
              {/* Availability dot — hollow when the day can only be
                  requested, so "just book it" and "ask and see" don't read
                  as the same offer at a glance. */}
              <View style={styles.dotWrap}>
                {day.available > 0
                  ? <View style={[styles.dot, { backgroundColor: accentColor }]} />
                  : day.requestable > 0
                    ? <View style={[styles.dot, styles.dotHollow, { borderColor: accentColor }]} />
                    : isFull
                      // A bar, not a dot: the day HAD times and they're gone.
                      // An empty space would say the provider doesn't work.
                      ? <View style={[styles.dotBooked, { backgroundColor: subColor }]} />
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
        // Selecting a booked-out day has to answer the question the client
        // just asked by tapping it. Rendering nothing (what an empty times
        // array used to do) reads as the app failing to load, and leaves them
        // no way to tell "everything's taken" from "they don't work today" —
        // which decides whether waiting for this provider is worth it.
        const who = providerLabel ?? 'the provider';
        const takesRequests = emergencyPolicy.outsideHours || emergencyPolicy.blockedDates
          || emergencyPolicy.shortNotice || emergencyPolicy.beyondWindow;
        const canRequest = allowRequests && takesRequests;

        // Right-aligned and quiet: an ordinary booking is the main path and
        // this is the exception beside it, not a second call to action
        // competing with the times themselves.
        const requestLink = canRequest && !showRequestPanel ? (
          <TouchableOpacity
              style={styles.requestLink}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                LayoutAnimation.configureNext(COLLAPSE_ANIM);
                setShowRequestPanel(true);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Request a specific time from ${who}`}
            >
              <Text style={[styles.requestLinkText, { color: EMERGENCY_OUTLINE }]}>
                Request a time
              </Text>
              <Text style={[styles.requestLinkChevron, { color: EMERGENCY_OUTLINE }]}>⌄</Text>
          </TouchableOpacity>
        ) : null;

        const requestPanel = (
          <RequestTimePanel
            date={requestPanelDate}
            onDateChange={handleRequestDateChange}
            requestTimes={requestTimesForDate}
            loading={isLoadingSlots}
            onPickTime={handlePanelPickTime}
            onBack={() => {
              LayoutAnimation.configureNext(COLLAPSE_ANIM);
              setShowRequestPanel(false);
            }}
            providerLabel={who}
            // No ceiling at all when this provider takes requests beyond
            // their booking window — same condition the day strip uses, so
            // the two can't disagree about which dates are askable.
            {...(maxDate !== undefined && !emergencyPolicy.beyondWindow ? { maxDate } : {})}
            accentColor={accentColor}
            surfaceColor={surfaceColor}
            textColor={textColor}
            subColor={subColor}
          />
        );

        // A day with no times at all is a day this provider doesn't work.
        // Rendering nothing left the client tapping a dead pill with no idea
        // whether the app had failed — and if the provider takes requests,
        // this is exactly where someone wants to ask for one.
        if (!currentSlots?.times || currentSlots.times.length === 0) {
          if (showRequestPanel) {
            return <View style={styles.timeContainer}>{requestPanel}</View>;
          }
          return (
            <View style={styles.timeContainer}>
              <Text style={[styles.closedDayNotice, { color: subColor }]}>
                {/* Beyond the booking window is a different fact from a day
                    they don't work — the provider may well work it, just not
                    this far out. A day that got here while they DO take
                    beyond-window requests never reaches this branch, because
                    it would have had request times of its own. */}
                {currentSlots?.status === 'unavailable'
                  ? `${who} isn't taking bookings this far ahead yet.`
                  : canRequest
                    ? `${who} doesn't work this day — but you can request a time.`
                    : `${who} doesn't work this day.`}
              </Text>
              {canRequest && currentSlots?.status !== 'unavailable' && (
                <View style={styles.closedDayAction}>{requestLink}</View>
              )}
            </View>
          );
        }

        // Ordinary times keep their blocked entries so the day still shows
        // its shape; by-request ones don't, because the panel only ever
        // offers times that can actually be asked for.
        const openTimes    = currentSlots.times.filter(slot => slot.reasons.length === 0);
        const requestTimes = currentSlots.times.filter(slot => slot.reasons.length > 0 && !slot.blocked);
        const bookableCount = openTimes.filter(slot => !slot.blocked).length;

        // One badge above the grid, rather than a sentence replacing it. When
        // nothing ordinary is left the grid alone can't say WHY — "all taken"
        // and "the day's simply over" look identical greyed out, and they want
        // opposite responses (wait for this provider vs. just pick tomorrow).
        //
        // "Fully booked" is claimed ONLY when every one of the day's times was
        // actually taken by someone. A day that ends up empty because some
        // times were booked and the rest simply expired is not booked out —
        // saying so would blame other clients for hours nobody ever wanted,
        // and tell this one to join a waitlist that won't help them.
        // 'tight' times sit with 'booked' here: they're unreachable because of
        // the bookings around them, so the day genuinely is booked out for
        // this service. A day held up only by tight gaps and no booking at all
        // can't happen — a gap needs something either side of it.
        const blockedTally = { booked: 0, past: 0, notice: 0, tight: 0 };
        openTimes.forEach(slot => { if (slot.blocked) blockedTally[slot.blocked] += 1; });
        const dayBadge = openTimes.length > 0 && bookableCount === 0
          ? (blockedTally.past === 0 && blockedTally.notice === 0
              ? 'Fully booked'
              : blockedTally.past > 0
                ? 'These times have passed'
                : `Too soon — ${who} needs more notice`)
          : null;

        const renderGroup = (group: TimeSlot[]) => {
          const rows = chunkArray(group, Math.ceil(group.length / 3));
          return rows.map((timeRow, idx) => (
            <View key={`open-${idx}`} style={styles.timeRow}>
              {timeRow.map(slot => {
                const timeSel = selectedTime === slot.time;
                const blocked = !!slot.blocked;
                // Strike-through means "someone has this" — only a booked slot
                // earns it. A time that simply passed, is inside the notice
                // window, or is too tight to fit this service between the
                // bookings either side was never taken; it's greyed and inert,
                // but crossing it out would wrongly read as another client
                // having claimed it.
                const taken = slot.blocked === 'booked';
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[
                      styles.timeTab,
                      { backgroundColor: surfaceColor },
                      blocked && styles.timeTabBlocked,
                      timeSel && !blocked && { borderWidth: 2, borderColor: accentColor },
                    ]}
                    onPress={() => handleTimeClick(slot.time, slot.reasons)}
                    disabled={blocked}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: blocked }}
                    accessibilityLabel={
                      blocked
                        ? `${slot.time}, ${slot.blocked === 'booked' ? 'already booked'
                            : slot.blocked === 'past' ? 'already passed'
                            : slot.blocked === 'tight' ? 'not enough time free here'
                            : 'too soon to book'}`
                        : slot.time
                    }
                  >
                    <Text style={[
                      styles.timeText,
                      { color: blocked ? subColor : timeSel ? accentColor : textColor },
                      taken && styles.timeTextBlocked,
                    ]}>
                      {slot.time}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ));
        };

        // Is the time currently chosen one of the red ones? It was picked
        // inside the request sheet, which then closed — so nothing else on
        // this screen still says the chosen time is a request rather than a
        // booking. This banner is the only thing that does.
        const selectedIsRequest = !!selectedTime
          && requestTimes.some(slot => slot.time === selectedTime);

        // The panel opens IN PLACE of the ordinary grid rather than over it:
        // these are two answers to the same question ("when?"), so showing
        // both at once just asks the client to hold two lists at once. It
        // also keeps this out of a Modal — see RequestTimePanel's header for
        // why that matters on iOS.
        return (
          <View style={styles.timeContainer}>
            {!showRequestPanel && (dayBadge || requestLink) && (
              <View style={styles.timeHeaderRow}>
                {dayBadge ? (
                  <View style={[styles.dayBadge, { borderColor: withAlpha(subColor, 0.35) }]}>
                    <Text style={[styles.dayBadgeText, { color: subColor }]}>{dayBadge}</Text>
                  </View>
                ) : <View />}
                {requestLink}
              </View>
            )}

            {showRequestPanel ? requestPanel : (
              openTimes.length > 0 && renderGroup(openTimes)
            )}

            {!showRequestPanel && dayBadge === 'Fully booked' && (
              <Text style={[styles.fullDayHint, { color: subColor }]}>
                Try another day, or join the waitlist on this provider's profile to be told if a space opens.
              </Text>
            )}

            {selectedIsRequest && !showRequestPanel && (
              <View style={[styles.selectedRequestBanner, { borderColor: EMERGENCY_OUTLINE }]}>
                <Text style={[styles.selectedRequestText, { color: EMERGENCY_OUTLINE }]}>
                  {selectedTime} is a request — {who} has to accept it
                </Text>
              </View>
            )}
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
  // Same weight as a past day: both mean "nothing here". Unlike a past day
  // this one still takes a tap.
  closedDayPill:   { opacity: 0.38 },
  fullDayPill:     { opacity: 0.62 },
  dayText:         { fontSize: 10, fontWeight: '500', marginBottom: 3 },
  dayNumberText:   { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  dotWrap:         { height: 6, justifyContent: 'center', alignItems: 'center', marginTop: 3 },
  dot:             { width: 4, height: 4, borderRadius: 2 },
  dotHollow:       { backgroundColor: 'transparent', borderWidth: 1 },
  dotPlaceholder:  { width: 4, height: 4 },
  dotBooked:       { width: 7, height: 2, borderRadius: 1, opacity: 0.65 },

  // ── Time slots ──────────────────────────────────────────────────────
  timeContainer: { paddingTop: 10, paddingHorizontal: 2 },
  fullDayHint:   { fontSize: 12, textAlign: 'center', paddingTop: 4, paddingHorizontal: 16, lineHeight: 17, opacity: 0.85 },
  timeRow:       { flexDirection: 'row', justifyContent: 'center', marginBottom: 6, flexWrap: 'wrap' },
  timeTab:       { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 12, marginHorizontal: 3, marginBottom: 4, minWidth: 68, alignItems: 'center' },
  timeText:      { fontSize: 13, fontWeight: '500' },
  selectedRequestBanner: {
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12,
    marginTop: 10, marginHorizontal: 2,
  },
  selectedRequestText: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },

  // ── Full calendar modal ─────────────────────────────────────────────
  // Right-aligned and quiet: an ordinary booking is the main path, and this
  // is the exception beside it — not a second call to action competing with
  // the times themselves.
  timeHeaderRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  closedDayNotice:    { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingTop: 6 },
  closedDayAction:    { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  dayBadge:           { borderWidth: 1, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 9 },
  dayBadgeText:       { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2 },
  // Greyed and inert, not removed: the day keeps its shape so "all taken"
  // and "never works this day" stay tellable apart.
  timeTabBlocked:     { opacity: 0.4 },
  timeTextBlocked:    { textDecorationLine: 'line-through' },
  requestLink:        { flexDirection: 'row', alignItems: 'center' },
  requestLinkText:    { fontSize: 11.5, fontWeight: '600' },
  requestLinkChevron: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
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
