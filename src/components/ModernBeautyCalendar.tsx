import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { AvailabilityService } from '../services/AvailabilityService';
                                                    
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
  style?: ViewStyle;
};

export const ModernBeautyCalendar: React.FC<ModernBeautyCalendarProps> = ({
  selectedDate,
  onDateSelect,
  onTimeSelect,
  selectedTime,
  providerName,
  serviceDuration,
  style = {}
}) => {
  const { theme, isDarkMode } = useTheme();
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [availableSlots, setAvailableSlots] = useState<SlotsMap>({});
  const [showTimeSelection, setShowTimeSelection] = useState<boolean>(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [showFullCalendar, setShowFullCalendar] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  useEffect(() => {
    generateWeeklyAvailability();
  }, [currentWeek, providerName, serviceDuration]);

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
      const dateString = date.toISOString().split('T')[0]!; // Non-null assertion: ISO date string always has 'T'
      const isPast = date < new Date() && date.toDateString() !== new Date().toDateString();

      if (isPast) {
        slots[dateString] = { available: 0, status: 'past', times: [] };
        continue;
      }

      // Use AvailabilityService to get slots filtered by existing bookings
      if (providerName) {
        try {
          const availableTimeSlots = await AvailabilityService.getAvailableSlots(
            providerName,
            dateString,
            serviceDuration
          );
          // Only include slots that are not already booked
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

  const generateBeautyTimeSlots = (
    dateString: string, 
    dayOfWeek: number, 
    providerName?: string
  ): TimeSlot[] => {
    const beautyHours: TimeSlot[] = [
      '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
      '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
    ];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    return beautyHours.filter(time => {
      let isAvailable = true;
      switch (providerName) {
        case 'KATHRINE':
        case 'Styled by Kathrine':
          if (time === '12:00 PM' || (isWeekend && ['9:00 AM', '6:00 PM'].includes(time))) {
            isAvailable = false;
          }
          break;
        case 'DIVA':
        case 'Diva Nails':
          if (['12:00 PM', '1:00 PM'].includes(time)) {
            isAvailable = false;
          }
          break;
        case 'LASHED':
        case 'Your Lashed':
          if (isWeekend && time === '9:00 AM') {
            isAvailable = false;
          }
          break;
        case 'VIKKI LAID':
        case 'Vikki Laid':
          isAvailable = ['10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'].includes(time);
          break;
        case 'MYA':
        case 'Makeup by Mya':
          if (time === '1:00 PM') {
            isAvailable = false;
          }
          break;
        case 'JENNIFER':
        case 'Hair by Jennifer':
          if (time === '12:00 PM') {
            isAvailable = false;
          }
          break;
        case 'JANA':
        case 'Jana Aesthetics':
          if (['12:00 PM', '1:00 PM'].includes(time)) {
            isAvailable = false;
          }
          break;
        case 'HER BROWS':
        case 'Her Brows':
          if (isWeekend && time === '6:00 PM') {
            isAvailable = false;
          }
          break;
        case 'KIKI':
        case "Kiki's Nails":
          if (time === '1:00 PM') {
            isAvailable = false;
          }
          break;
        case 'ROSEMAY AESTHETICS':
        case 'RoseMay Aesthetics':
          if (['12:00 PM', '1:00 PM'].includes(time)) {
            isAvailable = false;
          }
          break;
        case 'FILLER BY JESS':
        case 'Filler by Jess':
          if (['12:00 PM', '1:00 PM'].includes(time)) {
            isAvailable = false;
          }
          break;
        case 'EYEBROW DELUXE':
        case 'Eyebrow Deluxe':
          if (isWeekend && time === '6:00 PM') {
            isAvailable = false;
          }
          break;
        case 'LASHES GALORE':
        case 'Lashes Galore':
          if (isWeekend && time === '9:00 AM') {
            isAvailable = false;
          }
          break;
        case 'ZEE NAIL ARTIST':
        case 'Zee Nail Artist':
          if (time === '1:00 PM') {
            isAvailable = false;
          }
          break;
        case 'PAINTED BY ZOE':
        case 'Painted by Zoe':
          if (time === '12:00 PM') {
            isAvailable = false;
          }
          break;
        case 'BRAIDED SLICK':
        case 'Braided Slick':
          if (time === '12:00 PM' || (isWeekend && time === '9:00 AM')) {
            isAvailable = false;
          }
          break;
      }
      // Removed random 15% blocking - availability is now based on actual bookings
      return isAvailable;
    });
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
    const dateString = date.toISOString().split('T')[0]!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return; // Don't allow past dates

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
    const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' });
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
      const dateString = date.toISOString().split('T')[0]!; // Non-null assertion: ISO date string always has 'T'
      const dayData = availableSlots[dateString] || {
        available: 0,
        status: 'unavailable' as const,
        times: []
      };

      days.push({
        date,
        dateString,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
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

  return (
    <View style={[styles.container, style]}>
      {/* Full Calendar Modal */}
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
            style={[
              styles.calendarPopup,
              { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }
            ]}
            onStartShouldSetResponder={() => true}
          >
            {/* Month Navigation */}
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthNavButton}>
                <Text style={{ color: theme.text, fontSize: 18 }}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: theme.text }]}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthNavButton}>
                <Text style={{ color: theme.text, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayRow}>
              {weekDayHeaders.map(day => (
                <Text key={day} style={[styles.weekdayText, { color: theme.secondaryText }]}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <View key={`empty-${index}`} style={styles.calendarDay} />;
                }
                const dateString = date.toISOString().split('T')[0]!;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast = date < today;
                const isToday = date.toDateString() === new Date().toDateString();
                const isSelected = selectedDate === dateString;

                return (
                  <TouchableOpacity
                    key={`day-${index}`}
                    style={[
                      styles.calendarDay,
                      isToday && [styles.calendarDayToday, { borderColor: theme.accent }],
                      isSelected && { backgroundColor: theme.accent },
                      isPast && styles.calendarDayPast
                    ]}
                    onPress={() => handleCalendarDaySelect(date)}
                    disabled={isPast}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        { color: isSelected ? '#fff' : theme.text },
                        isPast && { color: theme.secondaryText }
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Week Navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton}>
          <Text style={{ color: theme.text, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFullCalendar(true)}>
          <Text style={[styles.weekTitle, { color: theme.text }]}>
            {formatWeekRange()} <Text style={{ fontSize: 10 }}>▼</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.navButton}>
          <Text style={{ color: theme.text, fontSize: 22 }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Days */}
      <View style={styles.daysRow}>
        {weekDays.map(day => (
          <TouchableOpacity
            key={day.dateString}
            style={[
              styles.dayPill,
              { backgroundColor: isDarkMode ? '#000' : '#f5f5f5', borderColor: isDarkMode ? theme.border : 'transparent' },
              isDarkMode && { borderWidth: 1 },
              day.isToday && [styles.todayPill, { borderColor: theme.accent }],
              selectedDate === day.dateString && { backgroundColor: theme.accent },
              day.status === 'past' && styles.pastDayPill
            ]}
            onPress={() => handleDateClick(day.dateString, day)}
            disabled={day.status === 'past' || day.status === 'closed'}
          >
            <Text style={[
              styles.dayText,
              { color: selectedDate === day.dateString ? '#FFFFFF' : theme.text }
            ]}>
              {day.dayName}
            </Text>
            <Text style={[
              styles.dayNumberText,
              { color: selectedDate === day.dateString ? '#FFFFFF' : theme.text }
            ]}>
              {day.dayNumber}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Time Selection - ✅ COMPLETELY FIXED */}
      {showTimeSelection && selectedDate && (() => {
        const currentSlots = availableSlots[selectedDate];
        if (!currentSlots?.times || currentSlots.times.length === 0) {
          return null;
        }

        const chunkedTimes = chunkArray(
          currentSlots.times, 
          Math.ceil(currentSlots.times.length / 3)
        );

        return (
          <View style={styles.timeContainer}>
            {chunkedTimes.map((timeRow, idx) => (
              <View key={idx} style={styles.timeRow}>
                {timeRow.map(time => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeTab,
                      {
                        backgroundColor: selectedTime === time
                          ? theme.accent
                          : (isDarkMode ? '#000' : '#f0f0f0'),
                        borderColor: isDarkMode ? theme.border : 'transparent'
                      },
                      isDarkMode && { borderWidth: 1 }
                    ]}
                    onPress={() => handleTimeClick(time)}
                  >
                    <Text style={[
                      styles.timeText,
                      { color: selectedTime === time ? '#FFFFFF' : theme.text }
                    ]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
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
  container: { padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  navButton: { padding: 8 },
  weekTitle: { fontSize: 16, fontWeight: '600' },

  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  dayPill: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  todayPill: { borderWidth: 1, borderColor: '#007AFF' },
  cloudSelectedDay: { backgroundColor: 'rgba(0,122,255,0.15)' },
  pastDayPill: { opacity: 0.4 },

  dayText: { fontSize: 12, color: '#333' },
  dayNumberText: { fontSize: 15, fontWeight: '600', color: '#333' },
  cloudSelectedDayText: { color: '#007AFF' },

  timeContainer: { marginTop: 10, alignItems: 'center' },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 6,
    flexWrap: 'wrap'
  },
  timeTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 4,
    marginBottom: 5,
    minWidth: 62,
    alignItems: 'center',
  },
  cloudSelectedTime: { backgroundColor: 'rgba(0,122,255,0.15)' },
  timeText: { fontSize: 13, color: '#333' },
  cloudSelectedTimeText: { color: '#007AFF', fontWeight: '600' },

  // Full Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarPopup: {
    width: 280,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNavButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '500',
    width: 32,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  calendarDayToday: {
    borderWidth: 1,
  },
  calendarDayPast: {
    opacity: 0.4,
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '500',
  },
});