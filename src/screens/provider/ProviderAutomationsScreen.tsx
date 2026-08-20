import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import {
  updateProviderAutoAccept,
  updateProviderCancellationPolicy,
  updateProviderAutomationSettings,
  getMyProviderProfile,
} from '../../services/databaseService';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C_DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(255,255,255,0.08)',
  green:   '#30D158',
  amber:   '#FF9F0A',
};
const C_LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033',
  text:    '#1C1A18',
  sub:     '#8A8680',
  border:  'rgba(0,0,0,0.08)',
  green:   '#34C759',
  amber:   '#FF9500',
};

// ─── Data shape ───────────────────────────────────────────────────────────────
interface ProviderAutomations {
  // What CERVICED sends on your behalf — you choose when/if
  clientReminderTiming:   string[];   // ['24h', '48h', '72h'] — push to clients
  rebookingNudgeWeeks:    string;     // 'never' | '2' | '4' | '6' | '8' | '12'
  scheduleReleaseDay:     number | null; // 1-31, day of month clients with the profile bell on get notified; null = off
  autoReviewRequest:      boolean;    // 2hrs after completion
  postApptCheckIn:        boolean;    // check-in message day after
  birthdayGreeting:       boolean;    // greeting on client birthday
  newBookingRecap:        boolean;    // send provider a daily recap of upcoming bookings

  // Provider business rules
  autoConfirmBookings:    boolean;
  cancellationNoticeHours:string;     // '0' | '12' | '24' | '48' | '72'
  waitlistEnabled:        boolean;
  autoAcceptWaitlist:     boolean;
  // Owned and edited by PoliciesScreen — carried here only because saving
  // automation_settings REPLACES the whole blob, so a value this screen didn't
  // read back would be deleted on the next save. Never render an editor for it
  // here; that's what created the split this consolidation just undid.
  depositRequiredNew:     boolean;
}

const DEFAULTS: ProviderAutomations = {
  clientReminderTiming:    ['24h'],
  rebookingNudgeWeeks:     'never',
  scheduleReleaseDay:      null,
  autoReviewRequest:       true,
  postApptCheckIn:         false,
  birthdayGreeting:        false,
  newBookingRecap:         true,
  autoConfirmBookings:     true,  // matches providers.auto_accept_bookings DB default
  cancellationNoticeHours: '0',   // matches providers.cancellation_notice_hours DB default
  waitlistEnabled:         false,
  autoAcceptWaitlist:      false,
  depositRequiredNew:      false,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, sub, C }: { icon: string; label: string; sub: string; C: typeof C_DARK }) {
  return (
    <View style={{ marginBottom: 12, marginTop: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <Ionicons name={icon as any} size={13} color={C.accent} />
        <Text style={[st.sectionLabel, { color: C.accent }]}>{label}</Text>
      </View>
      <Text style={[st.sectionSub, { color: C.sub }]}>{sub}</Text>
    </View>
  );
}

function PlatformBadge({ C }: { C: typeof C_DARK }) {
  return (
    <View style={{ backgroundColor: C.green + '18', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: C.green, letterSpacing: 0.5 }}>CERVICED SENDS</Text>
    </View>
  );
}

function AutoCard({
  title, description, value, onToggle, C, platform, children,
}: {
  title: string; description: string; value: boolean; onToggle: (v: boolean) => void;
  C: typeof C_DARK; platform?: boolean; children?: React.ReactNode;
}) {
  return (
    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
      {platform && <PlatformBadge C={C} />}
      <View style={st.cardRow}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[st.cardTitle, { color: C.text }]}>{title}</Text>
          <Text style={[st.cardDesc, { color: C.sub }]}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={v => { Haptics.selectionAsync().catch(() => {}); onToggle(v); }}
          trackColor={{ false: '#3A3A3C', true: C.accent }}
          thumbColor={value ? '#fff' : '#E5E5EA'}
        />
      </View>
      {children}
    </View>
  );
}

function ChipSelect({
  label, options, selected, multi, onSelect, C,
}: {
  label?: string;
  options: { v: string; l: string }[];
  selected: string | string[];
  multi: boolean;
  onSelect: (v: string) => void;
  C: typeof C_DARK;
}) {
  const isOn = (v: string) => multi ? (selected as string[]).includes(v) : selected === v;
  return (
    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
      {label && <Text style={[st.cardTitle, { color: C.text, marginBottom: 8 }]}>{label}</Text>}
      <View style={st.chipRow}>
        {options.map(({ v, l }) => (
          <TouchableOpacity
            key={v}
            style={[st.chip, { borderColor: C.border, backgroundColor: C.surface }, isOn(v) && { backgroundColor: C.accent, borderColor: C.accent }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(v); }}
          >
            <Text style={[st.chipText, { color: C.sub }, isOn(v) && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Toast({ msg, ok, C }: { msg: string; ok: boolean; C: typeof C_DARK }) {
  return (
    <View style={[st.toast, { backgroundColor: C.surface, borderColor: ok ? C.green + '44' : '#FF6B6B44' }]}>
      <Ionicons name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={15} color={ok ? C.green : '#FF6B6B'} />
      <Text style={[st.toastText, { color: ok ? C.green : '#FF6B6B' }]}>{msg}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProviderAutomationsScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? C_DARK : C_LIGHT;

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [d, setD]               = useState<ProviderAutomations>(DEFAULTS);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [releaseDayPickerVisible, setReleaseDayPickerVisible] = useState(false);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const [{ data: { user } }, profile] = await Promise.all([
          supabase.auth.getUser(),
          getMyProviderProfile(),
        ]);
        if (profile) setProviderId(profile.id);
        const m = user?.user_metadata ?? {};
        // Prefer the providers-table mirror (what cron jobs and clients act
        // on); fall back to legacy user_metadata, then defaults.
        const a = (profile as any)?.automation_settings ?? {};
        setD({
          clientReminderTiming:    a.clientReminderTiming ?? m['pa_client_reminder_timing'] ?? DEFAULTS.clientReminderTiming,
          rebookingNudgeWeeks:     a.rebookingNudgeWeeks  ?? m['pa_rebooking_nudge_weeks']  ?? DEFAULTS.rebookingNudgeWeeks,
          // Providers-row only (added after automation_settings existed) —
          // no legacy user_metadata fallback needed.
          scheduleReleaseDay:      a.scheduleReleaseDay   ?? DEFAULTS.scheduleReleaseDay,
          autoReviewRequest:       a.autoReviewRequest    ?? m['pa_auto_review_request']    ?? DEFAULTS.autoReviewRequest,
          postApptCheckIn:         a.postApptCheckIn      ?? m['pa_post_appt_check_in']     ?? DEFAULTS.postApptCheckIn,
          birthdayGreeting:        a.birthdayGreeting     ?? m['pa_birthday_greeting']      ?? DEFAULTS.birthdayGreeting,
          newBookingRecap:         a.newBookingRecap      ?? m['pa_new_booking_recap']      ?? DEFAULTS.newBookingRecap,
          // These four are enforced straight off the providers row (cron jobs
          // and the booking flow read them from there, not user_metadata) —
          // the row is the real answer, not just a fallback.
          autoConfirmBookings:     profile?.auto_accept_bookings ?? m['pa_auto_confirm_bookings'] ?? DEFAULTS.autoConfirmBookings,
          cancellationNoticeHours: String(profile?.cancellation_notice_hours ?? m['pa_cancellation_notice_hours'] ?? DEFAULTS.cancellationNoticeHours),
          waitlistEnabled:         a.waitlistEnabled      ?? m['pa_waitlist_enabled']       ?? DEFAULTS.waitlistEnabled,
          autoAcceptWaitlist:      a.autoAcceptWaitlist   ?? m['pa_auto_accept_waitlist']   ?? DEFAULTS.autoAcceptWaitlist,
          // Read purely so the save below can write it back unchanged — see
          // the note on the type above.
          depositRequiredNew:      a.depositRequiredNew   ?? m['pa_deposit_required_new']   ?? DEFAULTS.depositRequiredNew,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const saves: Promise<unknown>[] = [
        supabase.auth.updateUser({
          data: {
            pa_client_reminder_timing:    d.clientReminderTiming,
            pa_rebooking_nudge_weeks:     d.rebookingNudgeWeeks,
            pa_auto_review_request:       d.autoReviewRequest,
            pa_post_appt_check_in:        d.postApptCheckIn,
            pa_birthday_greeting:         d.birthdayGreeting,
            pa_new_booking_recap:         d.newBookingRecap,
            pa_auto_confirm_bookings:     d.autoConfirmBookings,
            pa_cancellation_notice_hours: d.cancellationNoticeHours,
            pa_waitlist_enabled:          d.waitlistEnabled,
            pa_auto_accept_waitlist:      d.autoAcceptWaitlist,
            // pa_buffer_mins / pa_max_bookings_per_day /
            // pa_min_booking_notice_hrs / pa_booking_window_days /
            // pa_slot_interval_mins / pa_deposit_required_new are owned by
            // SchedulingScreen and PaymentsScreen now. Writing them here too
            // would push this screen's stale in-memory copy over whatever
            // those screens last saved.
          },
        }).then(({ error }) => { if (error) throw error; }),
      ];
      if (providerId) {
        saves.push(updateProviderAutoAccept(providerId, d.autoConfirmBookings));
        // updateProviderScheduleSettings / updateProviderMaxBookingsPerDay are
        // SchedulingScreen's to call — same clobbering reason as above.
        const cancelHrs = parseInt(d.cancellationNoticeHours, 10) || 0;
        saves.push(updateProviderCancellationPolicy(providerId, cancelHrs));
        // Mirror the client-facing automations onto the providers row —
        // user_metadata is invisible to client screens and pg_cron jobs,
        // so anything that must act on these settings reads them from here.
        saves.push(updateProviderAutomationSettings(providerId, {
          clientReminderTiming: d.clientReminderTiming,
          rebookingNudgeWeeks:  d.rebookingNudgeWeeks,
          ...(d.scheduleReleaseDay != null ? { scheduleReleaseDay: d.scheduleReleaseDay } : {}),
          autoReviewRequest:    d.autoReviewRequest,
          postApptCheckIn:      d.postApptCheckIn,
          birthdayGreeting:     d.birthdayGreeting,
          waitlistEnabled:      d.waitlistEnabled,
          autoAcceptWaitlist:   d.autoAcceptWaitlist,
          // Owned/edited by PoliciesScreen (in its Deposit card), but this
          // call REPLACES the whole automation_settings blob — so the loaded
          // value is passed straight back rather than dropped, which would
          // delete it. Never add an editor for it here.
          depositRequiredNew:   d.depositRequiredNew,
          // Must be mirrored here, not just to user_metadata: the
          // provider-daily-recap cron job reads this key off the providers
          // row and its COALESCE(..., TRUE) treats a missing key as "send",
          // so omitting it made turning the toggle OFF a silent no-op.
          newBookingRecap:      d.newBookingRecap,
        }));
      }
      await Promise.all(saves);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showToast('Could not save — try again', false);
    } finally {
      setSaving(false);
    }
  }, [d, providerId, navigation]);

  const set = useCallback(<K extends keyof ProviderAutomations>(key: K, val: ProviderAutomations[K]) => {
    setD(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleReminder = useCallback((v: string) => {
    setD(prev => ({
      ...prev,
      clientReminderTiming: prev.clientReminderTiming.includes(v)
        ? prev.clientReminderTiming.filter(t => t !== v)
        : [...prev.clientReminderTiming, v],
    }));
  }, []);

  if (loading) {
    return (
      <View style={[st.loadWrap, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <ThemedBackground style={{ flex: 1 }}>
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[st.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: C.text }]}>Automations & Preferences</Text>
        <TouchableOpacity
          style={[st.saveBtn, { backgroundColor: C.accent, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={st.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[st.scroll, { paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
        {toast && <Toast msg={toast.msg} ok={toast.ok} C={C} />}

        {/* ── WHAT CERVICED SENDS FOR YOU ─────────────────────────────── */}
        <SectionHeader
          icon="sparkles-outline"
          label="WHAT CERVICED SENDS FOR YOU"
          sub="These are automated messages the platform sends to your clients on your behalf. Toggle each on or off, and configure timing where applicable."
          C={C}
        />

        {/* Client appointment reminders */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
          <PlatformBadge C={C} />
          <Text style={[st.cardTitle, { color: C.text, marginBottom: 4 }]}>Appointment reminders to clients</Text>
          <Text style={[st.cardDesc, { color: C.sub, marginBottom: 12 }]}>
            Cerviced sends a push notification to clients at each selected interval before their appointment.
          </Text>
          <View style={st.chipRow}>
            {([
              { v: '1h',  l: '1 hr'   },
              { v: '3h',  l: '3 hrs'  },
              { v: '24h', l: '24 hrs' },
              { v: '48h', l: '48 hrs' },
              { v: '72h', l: '72 hrs' },
              { v: '1w',  l: '1 week' },
            ] as const).map(({ v, l }) => {
              const on = d.clientReminderTiming.includes(v);
              return (
                <TouchableOpacity
                  key={v}
                  style={[st.chip, { borderColor: C.border, backgroundColor: C.surface }, on && { backgroundColor: C.accent, borderColor: C.accent }]}
                  onPress={() => toggleReminder(v)}
                >
                  <Text style={[st.chipText, { color: C.sub }, on && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {d.clientReminderTiming.length === 0 && (
            <Text style={[st.hint, { color: C.sub }]}>No reminders selected — clients won't receive any automated reminders.</Text>
          )}
        </View>

        {/* Rebooking nudges */}
        <ChipSelect
          label="Rebooking nudges"
          options={[
            { v: 'never', l: 'Never'    },
            { v: '2',     l: '2 wks'   },
            { v: '4',     l: '4 wks'   },
            { v: '6',     l: '6 wks'   },
            { v: '8',     l: '8 wks'   },
            { v: '12',    l: '12 wks'  },
          ]}
          selected={d.rebookingNudgeWeeks}
          multi={false}
          onSelect={v => set('rebookingNudgeWeeks', v)}
          C={C}
        />
        <Text style={[st.chipHint, { color: C.sub }]}>Cerviced prompts the client to rebook after this many weeks since their last appointment with you.</Text>

        {/* Schedule release day — the day of the month clients who've
            turned on the notification bell on your profile get notified,
            so they know to check back for new availability. Independent of
            rebooking nudges: this goes to anyone following you, not just
            clients with a completed booking. */}
        <AutoCard
          title="Notify followers on schedule release day"
          description="Clients who turned on notifications for your profile get a reminder to check your availability on this day each month."
          value={d.scheduleReleaseDay != null}
          onToggle={(v) => set('scheduleReleaseDay', v ? new Date().getDate() : null)}
          C={C}
        >
          {d.scheduleReleaseDay != null && (
            <TouchableOpacity
              style={[st.dateBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => setReleaseDayPickerVisible(true)}
            >
              <Ionicons name="calendar-outline" size={15} color={C.accent} />
              <Text style={[st.dateBtnText, { color: C.text }]}>
                Day {d.scheduleReleaseDay} of every month
              </Text>
            </TouchableOpacity>
          )}
        </AutoCard>

        <AutoCard
          title="Review request"
          description="2 hours after an appointment is marked completed, Cerviced asks the client to leave a star rating and review."
          value={d.autoReviewRequest}
          onToggle={v => set('autoReviewRequest', v)}
          platform
          C={C}
        />

        <AutoCard
          title="Post-appointment check-in"
          description="The day after a treatment, Cerviced sends a short follow-up asking the client how they're feeling."
          value={d.postApptCheckIn}
          onToggle={v => set('postApptCheckIn', v)}
          platform
          C={C}
        />

        <AutoCard
          title="Birthday greeting"
          description="Cerviced sends a personalised birthday message to clients who have their birthday on file — a simple way to stay front of mind."
          value={d.birthdayGreeting}
          onToggle={v => set('birthdayGreeting', v)}
          platform
          C={C}
        />

        <AutoCard
          title="Daily booking recap"
          description="Each morning, Cerviced sends you a push notification summarising your appointments for the day."
          value={d.newBookingRecap}
          onToggle={v => set('newBookingRecap', v)}
          platform
          C={C}
        />

        {/* ── YOUR BUSINESS RULES ─────────────────────────────────────── */}
        <SectionHeader
          icon="settings-outline"
          label="YOUR BUSINESS RULES"
          sub="These settings control how bookings flow through your calendar and what clients experience when they book with you."
          C={C}
        />

        <AutoCard
          title="Auto-confirm bookings"
          description="New booking requests are confirmed instantly without manual approval. Best for providers with a fixed open schedule."
          value={d.autoConfirmBookings}
          onToggle={v => set('autoConfirmBookings', v)}
          C={C}
        />

        {/* "Require deposit from new clients" moved to PaymentsScreen,
            alongside the payment-type preferences it belongs with. */}

        <AutoCard
          title="Enable waitlist"
          description="When your day is fully booked, clients can join a waitlist. Cerviced notifies them if a slot opens up."
          value={d.waitlistEnabled}
          onToggle={v => set('waitlistEnabled', v)}
          C={C}
        />

        {d.waitlistEnabled && (
          <AutoCard
            title="Auto-invite from waitlist"
            description="When a booking is cancelled, automatically invite and schedule the next person in the queue."
            value={d.autoAcceptWaitlist}
            onToggle={v => set('autoAcceptWaitlist', v)}
            C={C}
          />
        )}

        {/* Buffer time, max bookings per day, booking window, minimum notice
            and start-time intervals all moved to SchedulingScreen — they're
            scheduling rules, not automations, and splitting them across two
            screens made availability impossible to reason about in one place.
            Cancellation notice stays here: it drives the cancellation policy
            clients are shown, not when slots are bookable. */}

        {/* Cancellation notice */}
        <ChipSelect
          label="Cancellation notice required"
          options={[
            { v: '0',  l: 'Any time' },
            { v: '12', l: '12 hrs'   },
            { v: '24', l: '24 hrs'   },
            { v: '48', l: '48 hrs'   },
            { v: '72', l: '72 hrs'   },
          ]}
          selected={d.cancellationNoticeHours}
          multi={false}
          onSelect={v => set('cancellationNoticeHours', v)}
          C={C}
        />
        <Text style={[st.chipHint, { color: C.sub }]}>
          Clients who cancel within this window will be shown your cancellation policy.
        </Text>

        {/* Info note */}
        <View style={[st.infoBox, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="information-circle-outline" size={15} color={C.sub} style={{ marginTop: 1 }} />
          <Text style={[st.infoText, { color: C.sub }]}>
            Automated messages (reminders, nudges, review requests) are sent by Cerviced — not from your personal number or email. Rules such as buffer time and daily caps are applied automatically to every message we send on your behalf.
          </Text>
        </View>
      </ScrollView>

      {/* Schedule release day picker — date-of-month only, same
          Modal-on-iOS/inline-on-Android pattern as ProviderScheduleScreen's
          pickers. onChange writes straight through; there's no separate
          "confirm" step since the day is the only thing being chosen. */}
      {releaseDayPickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="fade" visible={releaseDayPickerVisible}>
            <View style={st.pickerModalWrap}>
              <TouchableOpacity
                style={st.pickerDismiss}
                activeOpacity={1}
                onPress={() => setReleaseDayPickerVisible(false)}
              />
              <View style={[st.pickerSheet, { backgroundColor: C.surface }]}>
                <View style={[st.pickerHeader, { borderBottomColor: C.border }]}>
                  <Text style={[st.pickerLabel, { color: C.text }]}>Release Day</Text>
                  <TouchableOpacity onPress={() => setReleaseDayPickerVisible(false)}>
                    <Text style={[st.pickerDone, { color: C.accent }]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  mode="date"
                  value={new Date(2020, 0, d.scheduleReleaseDay ?? 1)}
                  onChange={(_: DateTimePickerEvent, date?: Date) => {
                    if (date) set('scheduleReleaseDay', date.getDate());
                  }}
                  display="spinner"
                  themeVariant={isDarkMode ? 'dark' : 'light'}
                  textColor={C.text}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            mode="date"
            value={new Date(2020, 0, d.scheduleReleaseDay ?? 1)}
            onChange={(_: DateTimePickerEvent, date?: Date) => {
              setReleaseDayPickerVisible(false);
              if (date) set('scheduleReleaseDay', date.getDate());
            }}
            display="default"
          />
        )
      )}
    </SafeAreaView>
    </ThemedBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe:    { flex: 1 },
  loadWrap:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  saveBtn:     { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scroll: { paddingHorizontal: 20, paddingTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  sectionSub:   { fontSize: 13, lineHeight: 19 },

  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  cardRow:   { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginBottom: 3 },
  cardDesc:  { fontSize: 13, lineHeight: 19 },

  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { borderRadius: 100, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },

  chipHint: { fontSize: 12, lineHeight: 17, marginTop: -2, marginBottom: 16, paddingHorizontal: 2, fontStyle: 'italic' },
  hint:     { fontSize: 12, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },

  infoBox: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 24,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  toastText: { fontSize: 13, fontWeight: '500', flex: 1 },

  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  dateBtnText: { fontSize: 13, fontWeight: '600' },

  pickerModalWrap: { flex: 1, flexDirection: 'column' },
  pickerDismiss:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  pickerHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerLabel:     { fontSize: 15, fontWeight: '600' },
  pickerDone:      { fontSize: 15, fontWeight: '700' },
});
