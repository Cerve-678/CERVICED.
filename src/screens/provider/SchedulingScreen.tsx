/**
 * Scheduling & Availability — every "when can clients book me" setting in one
 * place. This screen is the SOURCE OF TRUTH for each field it renders: no
 * other screen may edit them (see the ownership note on each save below).
 *
 * Availability used to be spread across three screens with no single place a
 * provider could reason about it:
 *
 *   • ServicesPricingScreen  — typical windows, new clients, walk-ins, groups
 *   • ProviderAutomationsScreen — buffer, booking horizon, min notice, slot
 *     intervals, daily cap
 *   • ProviderScheduleScreen — the actual working-hours calendar
 *
 * The first two moved here. The calendar did NOT: it's a 839-line screen with
 * its own blocked-date/override editors, so this screen links out to it rather
 * than absorbing or duplicating it.
 *
 * PERSISTENCE — this screen deliberately mirrors ProviderAutomationsScreen's
 * dual-write rather than inventing its own:
 *   1. `user_metadata` (pa_* keys) — legacy, still read as a fallback.
 *   2. the `providers` row — what the booking flow and pg_cron jobs actually
 *      read. A setting written only to user_metadata is invisible to them and
 *      silently does nothing.
 * Both must be written. See the load path below for the same precedence order.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { toUserMessage } from '../../utils/userFacingError';
import {
  getMyProviderProfile,
  updateProviderContactDetails,
  updateProviderScheduleSettings,
  updateProviderMaxBookingsPerDay,
} from '../../services/databaseService';
import {
  Card, ChipGroup, RadioGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  AVAILABILITY_OPTS, NEW_CLIENTS_OPTS,
  BUFFER_OPTS, BOOKING_WINDOW_OPTS, MIN_NOTICE_OPTS, SLOT_INTERVAL_OPTS, MAX_PER_DAY_OPTS,
} from '../../features/business-details/options';

export default function SchedulingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);

  // Availability shape (moved from ServicesPricingScreen)
  const [availWindows, setAvailWindows]   = useState<string[]>([]);
  const [acceptsNew, setAcceptsNew]       = useState('yes');
  const [walkIns, setWalkIns]             = useState(false);
  const [groupBookings, setGroupBookings] = useState(false);

  // Booking rules (moved from ProviderAutomationsScreen)
  const [bufferMins, setBufferMins]             = useState('0');
  const [bookingWindowDays, setBookingWindowDays] = useState('60');
  const [minBookingNoticeHrs, setMinNotice]     = useState('0');
  const [slotIntervalMins, setSlotInterval]     = useState('60');
  const [maxBookingsPerDay, setMaxPerDay]       = useState('unlimited');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: { user } }, profile] = await Promise.all([
          supabase.auth.getUser(),
          getMyProviderProfile(),
        ]);
        const m = user?.user_metadata ?? {};
        if (profile) {
          setProviderId(profile.id ?? null);
          setAvailWindows(profile.availability_windows ?? []);
          setAcceptsNew(profile.accepts_new_clients ?? 'yes');
          setWalkIns(profile.walk_ins_welcome ?? false);
          setGroupBookings(profile.group_bookings_available ?? false);
        }
        // Same precedence as ProviderAutomationsScreen: the providers row is
        // the real answer (it's what gets enforced), user_metadata is only a
        // legacy fallback for accounts saved before the columns existed.
        setBufferMins(String(profile?.buffer_mins ?? m['pa_buffer_mins'] ?? '0'));
        setBookingWindowDays(String(profile?.booking_window_days ?? m['pa_booking_window_days'] ?? '60'));
        setMinNotice(String(profile?.min_booking_notice_hrs ?? m['pa_min_booking_notice_hrs'] ?? '0'));
        setSlotInterval(String(profile?.slot_interval_mins ?? m['pa_slot_interval_mins'] ?? '60'));
        setMaxPerDay(
          profile?.max_bookings_per_day != null
            ? (profile.max_bookings_per_day === 0 ? 'unlimited' : String(profile.max_bookings_per_day))
            : (m['pa_max_bookings_per_day'] ?? 'unlimited'),
        );
      } catch {
        flash('Could not load your scheduling settings', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleChip(list: string[], setList: (v: string[]) => void, val: string) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  const handleSave = useCallback(async () => {
    if (!providerId) { flash('No provider profile found', 'error'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const capInt = maxBookingsPerDay === 'unlimited' ? 0 : parseInt(maxBookingsPerDay, 10) || 0;

      await Promise.all([
        // Legacy mirror — kept in sync so a provider who saves here doesn't
        // see stale values if any older read path still falls back to it.
        supabase.auth.updateUser({
          data: {
            pa_buffer_mins:            bufferMins,
            pa_booking_window_days:    bookingWindowDays,
            pa_min_booking_notice_hrs: minBookingNoticeHrs,
            pa_slot_interval_mins:     slotIntervalMins,
            pa_max_bookings_per_day:   maxBookingsPerDay,
          },
        }).then(({ error }) => { if (error) throw error; }),

        updateProviderContactDetails(providerId, {
          availability_windows: availWindows,
          accepts_new_clients: (acceptsNew as 'yes' | 'waitlist' | 'no') || null,
          walk_ins_welcome: walkIns,
          group_bookings_available: groupBookings,
        }),

        updateProviderScheduleSettings(providerId, {
          booking_window_days:    parseInt(bookingWindowDays, 10)   || 60,
          slot_interval_mins:     parseInt(slotIntervalMins, 10)    || 60,
          buffer_mins:            parseInt(bufferMins, 10)          || 0,
          min_booking_notice_hrs: parseInt(minBookingNoticeHrs, 10) || 0,
        }),

        updateProviderMaxBookingsPerDay(providerId, capInt),
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(toUserMessage(e, 'Could not save your changes.', 'SchedulingScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }, [
    providerId, availWindows, acceptsNew, walkIns, groupBookings,
    bufferMins, bookingWindowDays, minBookingNoticeHrs, slotIntervalMins,
    maxBookingsPerDay, navigation,
  ]);

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <Text style={[s.headerTitle, { color: C.text }]}>Scheduling & Availability</Text>
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: C.surface }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.5}
          >
            <Ionicons name="close" size={22} color={C.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {toast && <Toast message={toast.message} type={toast.type} />}

          {/* The calendar stays its own screen — this is a signpost to it, not
              a duplicate of it. Without this the two halves of "scheduling"
              would have no visible connection to each other. */}
          {/* backgroundColor/borderColor must be set inline: `s.card` bakes in
              the DARK palette as its static StyleSheet fallback, so without
              these the row renders near-black in light mode. */}
          <TouchableOpacity
            style={[s.card, { backgroundColor: C.card, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 13 }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('ProviderSchedule'); }}
            activeOpacity={0.7}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent + '18' }}>
              <Ionicons name="calendar-outline" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.3, color: C.text }}>
                Working Hours & Blocked Dates
              </Text>
              <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: 2, lineHeight: 16, color: C.sub }}>
                Your day-by-day hours, breaks, blocked dates and one-off changes
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.sub} style={{ opacity: 0.5 }} />
          </TouchableOpacity>

          <Card
            title="Availability"
            sub="The shape of your typical week. Your actual bookable slots come from Working Hours above."
          >
            <SectionLabel text="When you're typically available" />
            <ChipGroup
              options={AVAILABILITY_OPTS}
              selected={availWindows}
              onToggle={v => toggleChip(availWindows, setAvailWindows, v)}
            />

            <View style={{ height: 18 }} />
            <SectionLabel text="New clients" />
            <RadioGroup options={NEW_CLIENTS_OPTS} value={acceptsNew} onChange={setAcceptsNew} />

            <View style={{ height: 14 }} />
            <ToggleRow label="Walk-ins welcome" sub="Clients can book without advance notice" value={walkIns} onChange={setWalkIns} />
            <ToggleRow label="Group bookings" sub="Bridal parties, hen dos, group sessions" value={groupBookings} onChange={setGroupBookings} />
          </Card>

          <Card
            title="Booking Rules"
            sub="How bookings land in your calendar — these are enforced when a client picks a slot."
          >
            <SectionLabel text="Buffer time between appointments" />
            <RadioGroup options={BUFFER_OPTS} value={bufferMins} onChange={setBufferMins} />

            <View style={{ height: 18 }} />
            <SectionLabel text="Appointment start-time intervals" />
            <RadioGroup options={SLOT_INTERVAL_OPTS} value={slotIntervalMins} onChange={setSlotInterval} />

            <View style={{ height: 18 }} />
            <SectionLabel text="Minimum notice before booking" />
            <RadioGroup options={MIN_NOTICE_OPTS} value={minBookingNoticeHrs} onChange={setMinNotice} />

            <View style={{ height: 18 }} />
            <SectionLabel text="How far ahead clients can book" />
            <RadioGroup options={BOOKING_WINDOW_OPTS} value={bookingWindowDays} onChange={setBookingWindowDays} />

            <View style={{ height: 18 }} />
            <SectionLabel text="Maximum bookings per day" />
            <RadioGroup options={MAX_PER_DAY_OPTS} value={maxBookingsPerDay} onChange={setMaxPerDay} />
          </Card>

          <SaveButton saving={saving} onPress={handleSave} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
