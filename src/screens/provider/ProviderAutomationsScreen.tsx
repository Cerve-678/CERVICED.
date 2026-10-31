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
import { SafeAreaView } from '../../components/SafeArea';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  updateProviderAutoAccept,
  updateProviderCancellationPolicy,
  updateProviderAutomationSettings,
  getMyProviderProfileContext,
  updateCurrentUserMetadata,
} from '../../services/databaseService';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTranslation } from '../../i18n';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C_DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  // Lighter than `accent` for standalone text (section labels, "Done" links) —
  // the muted dusty rose reads as faint at small sizes against near-black cards.
  accentText: '#D9AEB6',
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
  accentText: '#5C4033',
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
        <Text style={[st.sectionLabel, { color: C.accentText }]}>{label}</Text>
      </View>
      <Text style={[st.sectionSub, { color: C.sub }]}>{sub}</Text>
    </View>
  );
}

function AutoCard({
  title, description, value, onToggle, C, children,
}: {
  title: string; description: string; value: boolean; onToggle: (v: boolean) => void;
  C: typeof C_DARK; children?: React.ReactNode;
}) {
  return (
    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
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
  const { t, tp } = useTranslation();
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
        const context = await getMyProviderProfileContext();
        const profile = context?.profile ?? null;
        if (profile) setProviderId(profile.id);
        const m = (context?.userMetadata ?? {}) as {
          pa_client_reminder_timing?: string[];
          pa_rebooking_nudge_weeks?: string;
          pa_auto_review_request?: boolean;
          pa_post_appt_check_in?: boolean;
          pa_birthday_greeting?: boolean;
          pa_new_booking_recap?: boolean;
          pa_auto_confirm_bookings?: boolean;
          pa_cancellation_notice_hours?: string | number;
          pa_waitlist_enabled?: boolean;
          pa_auto_accept_waitlist?: boolean;
          pa_deposit_required_new?: boolean;
        };
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
        updateCurrentUserMetadata({
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
        }),
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
      showToast(t('providerBusiness.automations.saveFailed'), false);
    } finally {
      setSaving(false);
    }
  }, [d, providerId, navigation, t]);

  const set = useCallback(<K extends keyof ProviderAutomations>(key: K, val: ProviderAutomations[K]) => {
    setD(prev => ({ ...prev, [key]: val }));
  }, []);

  const toggleReminder = useCallback((v: string) => {
    setD(prev => ({
      ...prev,
      clientReminderTiming: prev.clientReminderTiming.includes(v)
        ? prev.clientReminderTiming.filter(x => x !== v)
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
        <Text style={[st.headerTitle, { color: C.text }]}>{t('providerBusiness.automations.title')}</Text>
        <TouchableOpacity
          style={[st.saveBtn, { backgroundColor: C.accent, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={st.saveBtnText}>{t('common.save')}</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[st.scroll, { paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
        {toast && <Toast msg={toast.msg} ok={toast.ok} C={C} />}

        {/* ── WHAT CERVICED SENDS FOR YOU ─────────────────────────────── */}
        <SectionHeader
          icon="sparkles-outline"
          label={t('providerBusiness.automations.sendsTitle')}
          sub={t('providerBusiness.automations.sendsSub')}
          C={C}
        />

        {/* Client appointment reminders */}
        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, marginBottom: 8 }]}>
          <Text style={[st.cardTitle, { color: C.text, marginBottom: 4 }]}>{t('providerBusiness.automations.reminders')}</Text>
          <Text style={[st.cardDesc, { color: C.sub, marginBottom: 12 }]}>
            {t('providerBusiness.automations.remindersSub')}
          </Text>
          <View style={st.chipRow}>
            {([
              { v: '1h',  l: tp('providerBusiness.automations.hoursShort', 1) },
              { v: '3h',  l: tp('providerBusiness.automations.hoursShort', 3) },
              { v: '24h', l: tp('providerBusiness.automations.hoursShort', 24) },
              { v: '48h', l: tp('providerBusiness.automations.hoursShort', 48) },
              { v: '72h', l: tp('providerBusiness.automations.hoursShort', 72) },
              { v: '1w',  l: t('providerBusiness.automations.oneWeek') },
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
            <Text style={[st.hint, { color: C.sub }]}>{t('providerBusiness.automations.noReminders')}</Text>
          )}
        </View>

        {/* Rebooking nudges */}
        <ChipSelect
          label={t('providerBusiness.automations.rebooking')}
          options={[
            { v: 'never', l: t('providerBusiness.automations.never') },
            { v: '2',     l: tp('providerBusiness.automations.weeksShort', 2) },
            { v: '4',     l: tp('providerBusiness.automations.weeksShort', 4) },
            { v: '6',     l: tp('providerBusiness.automations.weeksShort', 6) },
            { v: '8',     l: tp('providerBusiness.automations.weeksShort', 8) },
            { v: '12',    l: tp('providerBusiness.automations.weeksShort', 12) },
          ]}
          selected={d.rebookingNudgeWeeks}
          multi={false}
          onSelect={v => set('rebookingNudgeWeeks', v)}
          C={C}
        />
        <Text style={[st.chipHint, { color: C.sub }]}>{t('providerBusiness.automations.rebookingSub')}</Text>

        {/* Schedule release day — the day of the month clients who've
            turned on the notification bell on your profile get notified,
            so they know to check back for new availability. Independent of
            rebooking nudges: this goes to anyone following you, not just
            clients with a completed booking. */}
        <AutoCard
          title={t('providerBusiness.automations.releaseDay')}
          description={t('providerBusiness.automations.releaseDaySub')}
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
                {t('providerBusiness.automations.releaseDayValue', { day: d.scheduleReleaseDay })}
              </Text>
            </TouchableOpacity>
          )}
        </AutoCard>

        <AutoCard
          title={t('providerBusiness.automations.review')}
          description={t('providerBusiness.automations.reviewSub')}
          value={d.autoReviewRequest}
          onToggle={v => set('autoReviewRequest', v)}
          C={C}
        />

        <AutoCard
          title={t('providerBusiness.automations.checkIn')}
          description={t('providerBusiness.automations.checkInSub')}
          value={d.postApptCheckIn}
          onToggle={v => set('postApptCheckIn', v)}
          C={C}
        />

        <AutoCard
          title={t('providerBusiness.automations.birthday')}
          description={t('providerBusiness.automations.birthdaySub')}
          value={d.birthdayGreeting}
          onToggle={v => set('birthdayGreeting', v)}
          C={C}
        />

        <AutoCard
          title={t('providerBusiness.automations.recap')}
          description={t('providerBusiness.automations.recapSub')}
          value={d.newBookingRecap}
          onToggle={v => set('newBookingRecap', v)}
          C={C}
        />

        {/* ── YOUR BUSINESS RULES ─────────────────────────────────────── */}
        <SectionHeader
          icon="settings-outline"
          label={t('providerBusiness.automations.rulesTitle')}
          sub={t('providerBusiness.automations.rulesSub')}
          C={C}
        />

        <AutoCard
          title={t('providerBusiness.automations.autoConfirm')}
          description={t('providerBusiness.automations.autoConfirmSub')}
          value={d.autoConfirmBookings}
          onToggle={v => set('autoConfirmBookings', v)}
          C={C}
        />

        {/* "Require deposit from new clients" moved to PaymentsScreen,
            alongside the payment-type preferences it belongs with. */}

        <AutoCard
          title={t('providerBusiness.automations.waitlist')}
          description={t('providerBusiness.automations.waitlistSub')}
          value={d.waitlistEnabled}
          onToggle={v => set('waitlistEnabled', v)}
          C={C}
        />

        {d.waitlistEnabled && (
          <AutoCard
            title={t('providerBusiness.automations.autoInvite')}
            description={t('providerBusiness.automations.autoInviteSub')}
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
          label={t('providerBusiness.automations.cancelNotice')}
          options={[
            { v: '0',  l: t('providerBusiness.automations.anyTime') },
            { v: '12', l: tp('providerBusiness.automations.hoursShort', 12) },
            { v: '24', l: tp('providerBusiness.automations.hoursShort', 24) },
            { v: '48', l: tp('providerBusiness.automations.hoursShort', 48) },
            { v: '72', l: tp('providerBusiness.automations.hoursShort', 72) },
          ]}
          selected={d.cancellationNoticeHours}
          multi={false}
          onSelect={v => set('cancellationNoticeHours', v)}
          C={C}
        />
        <Text style={[st.chipHint, { color: C.sub }]}>
          {t('providerBusiness.automations.cancelNoticeSub')}
        </Text>

        {/* Info note */}
        <View style={[st.infoBox, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="information-circle-outline" size={15} color={C.sub} style={{ marginTop: 1 }} />
          <Text style={[st.infoText, { color: C.sub }]}>
            {t('providerBusiness.automations.infoNote')}
          </Text>
        </View>
      </ScrollView>

      {/* Schedule release day picker — date-of-month only, same
          Modal-on-iOS/inline-on-Android pattern as ProviderScheduleScreen's
          pickers. onChange writes straight through; there's no separate
          "confirm" step since the day is the only thing being chosen. */}
      {releaseDayPickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" visible={releaseDayPickerVisible}>
            <View style={st.pickerModalWrap}>
              <TouchableOpacity
                style={st.pickerDismiss}
                activeOpacity={1}
                onPress={() => setReleaseDayPickerVisible(false)}
              />
              <View style={[st.pickerSheet, { backgroundColor: C.surface }]}>
                <View style={[st.pickerHeader, { borderBottomColor: C.border }]}>
                  <Text style={[st.pickerLabel, { color: C.text }]}>{t('providerBusiness.automations.releaseDayPicker')}</Text>
                  <TouchableOpacity onPress={() => setReleaseDayPickerVisible(false)}>
                    <Text style={[st.pickerDone, { color: C.accentText }]}>{t('common.done')}</Text>
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

  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
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
