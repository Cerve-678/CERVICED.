import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { AvailabilityService } from '../services/AvailabilityService';

const ACCENT = '#AF9197';
const ACCENT_LIGHT = 'rgba(175,145,151,0.18)';
                                                    
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
};

// Local YYYY-MM-DD — date.toISOString() converts to UTC first, which shifts
// the calendar date by one for any non-zero UTC offset near midnight (e.g. a
// date picked as "Wednesday" at local midnight can serialize as Tuesday's
// date in UTC+ zones). That wrong date then gets sent to AvailabilityService,
// which re-derives day-of-week from it — silently querying the wrong
// weekday's hours.
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
}) => {
  const { theme, isDarkMode } = useTheme();
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<SlotsMap>({});
  const [showTimeSelection, setShowTimeSelection] = useState<boolean>(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [showFullCalendar, setShowFullCalendar] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  // null = still checking, true = resolved to a real provider, false = no match
  const [providerFound, setProviderFound] = useState<boolean | null>(null);

  // Resolve the provider ONCE up front so a bad/stale name shows a clear
  // message instead of rendering as an indistinguishable "fully booked"
  // week — the two currently look identical (empty slot lists) to a client.
  useEffect(() => {
    let cancelled = false;
    if (!providerName) { setProviderFound(true); return; }
    setProviderFound(null);
    AvailabilityService.resolveProvider(providerName).then(id => {
      if (!cancelled) setProviderFound(!!id);
    });
    return () => { cancelled = true; };
  }, [providerName]);

  useEffect(() => {
    generateWeeklyAvailability();
  }, [currentWeek, providerName, serviceDuration, serviceId, maxDate]);

  useEffect(() => {
    // ✅ FIXED: Proper null check with early return
    if (!selectedDate) {
      setShowTimeSelection(false);
      return;
    }

    const hasSlots = availableSlots[selectedDate] !== undefined;
    setShowTimeSelection(hasSlots);
  }, [selectedDate, availableSlots]);

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

      // Use AvailabilityService to get slots filtered by existing bookings
      if (providerName) {
        try {
          const availableTimeSlots = await AvailabilityService.getAvailableSlots(
            providerName,
            dateString,
            serviceDuration,
            serviceId
          );
          const openSlots = availableTimeSlots
            .filter(slot => !slot.isBooked)
            .map(slot => slot.time);

          slots[dateString] = {
            available: openSlots.length,
            status: openSlots.length > 0 ? 'available' : 'closed',
            times: openSlots
          };
        } catch (error) {
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
    setShowFullCalendar(false);
  };

  const handleDateClick = (dateString: string, dayData: DayData) => {
    if (dayData.status === 'past' || dayData.status === 'closed') return;
    onDateSelect(dateString);
  };

  const handleTimeClick = (time: string) => {
    onTimeSelect(time);
  };

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

  const popupBg   = isDarkMode ? '#252220' : '#FFFFFF';
  const popupSep  = isDarkMode ? 'rgba(126,102,103,0.18)' : 'rgba(126,102,103,0.12)';
  const popupText = isDarkMode ? '#F0ECE7' : '#1C1A18';
  const popupSub  = '#7E6667';

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
            style={[styles.calendarPopup, { backgroundColor: popupBg, borderColor: popupSep, borderWidth: StyleSheet.hairlineWidth }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Month nav */}
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthNavButton}>
                <Text style={[styles.monthNavArrow, { color: popupText }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: popupText }]}>
                {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthNavButton}>
                <Text style={[styles.monthNavArrow, { color: popupText }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekdayRow}>
              {weekDayHeaders.map(day => (
                <Text key={day} style={[styles.weekdayText, { color: popupSub }]}>{day}</Text>
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
                      isToday && [styles.calendarDayToday, { borderColor: theme.accent }],
                      isSelected && { backgroundColor: theme.accent },
                      isDisabled && styles.calendarDayPast
                    ]}
                    onPress={() => handleCalendarDaySelect(date)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        { color: isSelected ? '#fff' : theme.text },
                        isDisabled && { color: theme.secondaryText }
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {/* Availability dot */}
                    <View style={styles.calDotWrap}>
                      {hasSlots && (
                        <View style={[
                          styles.calDot,
                          { backgroundColor: isSelected ? 'rgba(255,255,255,0.75)' : ACCENT },
                        ]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: ACCENT }]} />
              <Text style={[styles.legendText, { color: popupSub }]}>Available slots</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Week navigation ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.navArrow, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFullCalendar(true)} style={styles.weekRangeBtn}>
          <Text style={[styles.weekTitle, { color: theme.text }]}>{formatWeekRange()}</Text>
          <Text style={[styles.weekChevron, { color: theme.secondaryText }]}>▼</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.navArrow, { color: theme.text }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Provider not found ──────────────────────────────────────────
          Distinct from "no hours today" — this means the identifier we
          were given never matched a real provider row at all, so every
          day would otherwise render as an indistinguishable blank/closed
          grid with no way to tell the two failures apart. */}
      {providerFound === false && (
        <View style={styles.notFoundBanner}>
          <Text style={[styles.notFoundText, { color: theme.text }]}>
            We couldn't find this provider's schedule. Try reopening their profile and scheduling again.
          </Text>
        </View>
      )}

      {/* ── Day pills ────────────────────────────────────────────────── */}
      {providerFound !== false && (
      <View style={styles.daysRow}>
        {weekDays.map(day => {
          const isSel = selectedDate === day.dateString;
          const isDisabled = day.status === 'past' || day.status === 'closed';
          const pillBg = isSel ? ACCENT : (isDarkMode ? '#2E2B27' : '#F0EBE6');
          return (
            <TouchableOpacity
              key={day.dateString}
              style={[
                styles.dayPill,
                { backgroundColor: pillBg },
                day.isToday && !isSel && { borderWidth: 1.5, borderColor: ACCENT },
                isDisabled && styles.pastDayPill,
              ]}
              onPress={() => handleDateClick(day.dateString, day)}
              disabled={isDisabled}
              activeOpacity={0.75}
            >
              <Text style={[styles.dayText, { color: isSel ? 'rgba(255,255,255,0.82)' : theme.secondaryText }]}>
                {day.dayName}
              </Text>
              <Text style={[styles.dayNumberText, { color: isSel ? '#fff' : theme.text }]}>
                {day.dayNumber}
              </Text>
              {/* Availability dot */}
              <View style={styles.dotWrap}>
                {day.available > 0
                  ? <View style={[styles.dot, { backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : ACCENT }]} />
                  : <View style={styles.dotPlaceholder} />
                }
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      )}

      {/* ── Time slots ───────────────────────────────────────────────── */}
      {providerFound !== false && showTimeSelection && selectedDate && (() => {
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
                        { backgroundColor: timeSel ? ACCENT : (isDarkMode ? '#2E2B27' : ACCENT_LIGHT) },
                      ]}
                      onPress={() => handleTimeClick(time)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.timeText, { color: timeSel ? '#fff' : theme.text }]}>
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
  legendRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  legendDot:   { width: 6, height: 6, borderRadius: 3 },
  legendText:  { fontSize: 11 },
});