import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useProviderDialog } from '../components/ProviderDialog';
import { useTheme } from '../contexts/ThemeContext';
import {
  getMyProviderProfile,
  getProviderAvailability,
  getProviderAvailabilityWindows,
  replaceProviderAvailabilityWindows,
  upsertProviderAvailability,
  getProviderBlockedDates,
  addProviderBlockedDate,
  removeProviderBlockedDate,
} from '../services/databaseService';
import type { DbProviderAvailability, DbProviderBlockedDate } from '../types/database';
import { ThemedBackground } from '../components/ThemedBackground';

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  sep:     'rgba(126,102,103,0.08)',
  iconBg:  'rgba(175,145,151,0.12)',
};
const DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  sep:     'rgba(126,102,103,0.10)',
  iconBg:  'rgba(175,145,151,0.10)',
};

// ─── Day helpers ──────────────────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

type DayRow = {
  dow: number;
  isOpen: boolean;
  openTime: string;  // 'HH:MM:SS'
  closeTime: string;
  dirty: boolean;
};
type ExtraPeriod = { openTime: string; closeTime: string };

function makeDefault(): DayRow[] {
  return DISPLAY_ORDER.map(dow => ({
    dow,
    isOpen: dow >= 1 && dow <= 5,
    openTime: '09:00:00',
    closeTime: '18:00:00',
    dirty: false,
  }));
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
function hhmmss(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}:00`;
}

function formatTime(t: string): string {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeToDate(t: string): Date {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToYMD(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProviderScheduleScreen() {
  const navigation = useNavigation();
  const { showToast, DialogHost } = useProviderDialog();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;

  const [tab, setTab] = useState<'hours' | 'blocked'>('hours');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Hours tab state
  const [days, setDays] = useState<DayRow[]>(makeDefault());
  const [extraPeriods, setExtraPeriods] = useState<Record<number, ExtraPeriod[]>>({});

  // Time picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ dow: number; field: 'open' | 'close'; periodIndex?: number | undefined } | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());

  // Blocked dates tab state
  const [blockedDates, setBlockedDates] = useState<DbProviderBlockedDate[]>([]);
  const [blockPickerVisible, setBlockPickerVisible] = useState(false);
  const [blockPickerDate, setBlockPickerDate] = useState<Date>(new Date());
  const [blockReason, setBlockReason] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await getMyProviderProfile();
      if (!profile) return;
      setProviderId(profile.id);

      const [avail, windows, blocked] = await Promise.all([
        getProviderAvailability(profile.id),
        getProviderAvailabilityWindows(profile.id).catch(() => []),
        getProviderBlockedDates(profile.id),
      ]);

      if (windows.length > 0 || avail.length > 0) {
        const extras: Record<number, ExtraPeriod[]> = {};
        for (const day of DISPLAY_ORDER) {
          extras[day] = windows
            .filter(w => w.day_of_week === day)
            .slice(1)
            .map(w => ({ openTime: w.start_time, closeTime: w.end_time }));
        }
        setExtraPeriods(extras);
        setDays(makeDefault().map(row => {
          // Existing schedules created by older versions have one period per
          // day; display that period in this concise weekly editor.
          const window = windows.find(w => w.day_of_week === row.dow);
          const dbRow = avail.find((a: DbProviderAvailability) => a.day_of_week === row.dow);
          if (window) return {
            ...row,
            isOpen: true,
            openTime: window.start_time,
            closeTime: window.end_time,
            dirty: false,
          };
          if (!dbRow) return row;
          return {
            ...row,
            isOpen: !dbRow.is_closed,
            openTime: dbRow.open_time,
            closeTime: dbRow.close_time,
            dirty: false,
          };
        }));
      }
      setBlockedDates(blocked);
    } catch (e) {
      console.error('ProviderScheduleScreen loadData:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Hours tab handlers ─────────────────────────────────────────────────────
  function toggleDay(dow: number) {
    setDays(prev => prev.map(d => d.dow === dow ? { ...d, isOpen: !d.isOpen, dirty: true } : d));
  }

  function openTimePicker(dow: number, field: 'open' | 'close', periodIndex?: number) {
    const row = days.find(d => d.dow === dow)!;
    const extra = periodIndex === undefined ? null : extraPeriods[dow]?.[periodIndex];
    setPickerTarget({ dow, field, periodIndex });
    setPickerDate(timeToDate(field === 'open' ? (extra?.openTime ?? row.openTime) : (extra?.closeTime ?? row.closeTime)));
    setPickerVisible(true);
  }

  function handleTimeChange(_: DateTimePickerEvent, date?: Date) {
    if (!date || !pickerTarget) return;
    if (Platform.OS === 'android') setPickerVisible(false);
    const timeStr = hhmmss(date);
    if (pickerTarget.periodIndex !== undefined) {
      setExtraPeriods(prev => ({
        ...prev,
        [pickerTarget.dow]: (prev[pickerTarget.dow] ?? []).map((period, index) =>
          index === pickerTarget.periodIndex
            ? (pickerTarget.field === 'open' ? { ...period, openTime: timeStr } : { ...period, closeTime: timeStr })
            : period,
        ),
      }));
      return;
    }
    setDays(prev => prev.map(d => {
      if (d.dow !== pickerTarget.dow) return d;
      return pickerTarget.field === 'open'
        ? { ...d, openTime: timeStr, dirty: true }
        : { ...d, closeTime: timeStr, dirty: true };
    }));
  }

  function addSplitPeriod(dow: number) {
    const row = days.find(d => d.dow === dow);
    if (!row) return;
    const [oh, om] = row.openTime.split(':').map(Number);
    const [ch, cm] = row.closeTime.split(':').map(Number);
    const open = (oh ?? 0) * 60 + (om ?? 0);
    const close = (ch ?? 0) * 60 + (cm ?? 0);
    if (close - open < 180) { showToast('Use at least three working hours before adding a break.', 'info'); return; }
    const breakStart = Math.floor((open + close - 60) / 2 / 15) * 15;
    const toTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
    setDays(prev => prev.map(d => d.dow === dow ? { ...d, closeTime: toTime(breakStart), dirty: true } : d));
    setExtraPeriods(prev => ({ ...prev, [dow]: [...(prev[dow] ?? []), { openTime: toTime(breakStart + 60), closeTime: row.closeTime }] }));
  }

  function removeExtraPeriod(dow: number, index: number) {
    setExtraPeriods(prev => ({ ...prev, [dow]: (prev[dow] ?? []).filter((_, i) => i !== index) }));
  }

  async function handleSaveHours() {
    if (!providerId) return;
    // Write EVERY day, not just the ones the provider touched. The rows the
    // provider never toggled still render as open Mon-Fri 9-6 (makeDefault())
    // — that's what they see and believe they're saving — but a day with no
    // row in provider_availability is treated as closed everywhere a client
    // checks availability (AvailabilityService, createBooking). Saving only
    // "dirty" days meant a provider who accepted the shown defaults, or only
    // edited one day, ended up with some or all days silently un-persisted:
    // the screen looked fully configured but clients could never book those
    // days at all.
    setSaving(true);
    try {
      const allWindows = days.flatMap(d => d.isOpen ? [
        { day_of_week: d.dow, start_time: d.openTime, end_time: d.closeTime },
        ...(extraPeriods[d.dow] ?? []).map(period => ({ day_of_week: d.dow, start_time: period.openTime, end_time: period.closeTime })),
      ] : []);
      const invalid = allWindows.some(w => w.start_time >= w.end_time)
        || allWindows.some((w, index) => allWindows.some((other, otherIndex) =>
          index !== otherIndex && w.day_of_week === other.day_of_week && w.start_time < other.end_time && w.end_time > other.start_time,
        ));
      if (invalid) { showToast('Each working period must be valid and cannot overlap another period.', 'error'); return; }
      await Promise.all(days.map(d =>
        upsertProviderAvailability(providerId, d.dow, d.openTime, d.closeTime, !d.isOpen),
      ));
      // v2 is the booking source for newly saved schedules. This editor saves
      // one period per open day; the data model also supports split shifts.
      await replaceProviderAvailabilityWindows(
        providerId,
        allWindows,
      );
      setDays(prev => prev.map(d => ({ ...d, dirty: false })));
      navigation.goBack();
    } catch (e) {
      showToast('Could not save hours. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Blocked dates handlers ─────────────────────────────────────────────────
  async function handleAddBlock() {
    if (!providerId) return;
    setAddingBlock(true);
    try {
      const ymd = dateToYMD(blockPickerDate);
      if (blockedDates.some(b => b.blocked_date === ymd)) {
        showToast('This date is already blocked.', 'info');
        return;
      }
      await addProviderBlockedDate(providerId, ymd, blockReason.trim() || null);
      setBlockReason('');
      const updated = await getProviderBlockedDates(providerId);
      setBlockedDates(updated);
    } catch (e) {
      showToast('Could not block date. Please try again.', 'error');
    } finally {
      setAddingBlock(false);
    }
  }

  async function handleRemoveBlock(id: string) {
    try {
      await removeProviderBlockedDate(id);
      setBlockedDates(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      showToast('Could not remove blocked date.', 'error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: P.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={P.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={[s.safe, { backgroundColor: P.bg }]} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: P.text }]}>My Schedule</Text>
          <TouchableOpacity style={[s.closeBtn, { backgroundColor: P.surface }]} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>

        {/* Segmented control */}
        <View style={[s.segWrap, { backgroundColor: P.surface }]}>
          <TouchableOpacity
            style={[s.seg, tab === 'hours' && [s.segActive, { backgroundColor: P.accent }]]}
            onPress={() => setTab('hours')}
          >
            <Text style={[s.segTxt, { color: P.sub }, tab === 'hours' && [s.segTxtActive, { color: P.ice }]]}>Weekly Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.seg, tab === 'blocked' && [s.segActive, { backgroundColor: P.accent }]]}
            onPress={() => setTab('blocked')}
          >
            <Text style={[s.segTxt, { color: P.sub }, tab === 'blocked' && [s.segTxtActive, { color: P.ice }]]}>Blocked Dates</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hours tab ───────────────────────────────────────────────────── */}
        {tab === 'hours' && (
          <>
            <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
              {days.map((day, idx) => (
                <View key={day.dow} style={[s.dayRow, idx < days.length - 1 && [s.dayRowBorder, { borderBottomColor: P.border }]]}>
                  <View style={s.dayLeft}>
                    <Text style={[s.dayLabel, { color: P.text }]}>{DAY_FULL[day.dow]}</Text>
                    {!day.isOpen && <Text style={[s.closedTag, { color: P.sub }]}>Closed</Text>}
                  </View>
                  <View style={s.dayRight}>
                    {day.isOpen && (
                      <View style={s.periodStack}>
                        <View style={s.timeRow}>
                          <TouchableOpacity style={[s.timeBtn, { backgroundColor: P.card }]} onPress={() => openTimePicker(day.dow, 'open')}>
                            <Text style={[s.timeTxt, { color: P.text }]}>{formatTime(day.openTime)}</Text>
                          </TouchableOpacity>
                          <Text style={[s.timeSep, { color: P.sub }]}>→</Text>
                          <TouchableOpacity style={[s.timeBtn, { backgroundColor: P.card }]} onPress={() => openTimePicker(day.dow, 'close')}>
                            <Text style={[s.timeTxt, { color: P.text }]}>{formatTime(day.closeTime)}</Text>
                          </TouchableOpacity>
                        </View>
                        {(extraPeriods[day.dow] ?? []).map((period, periodIndex) => (
                          <View key={`${day.dow}-${periodIndex}`} style={s.timeRow}>
                            <TouchableOpacity style={[s.timeBtn, { backgroundColor: P.card }]} onPress={() => openTimePicker(day.dow, 'open', periodIndex)}>
                              <Text style={[s.timeTxt, { color: P.text }]}>{formatTime(period.openTime)}</Text>
                            </TouchableOpacity>
                            <Text style={[s.timeSep, { color: P.sub }]}>→</Text>
                            <TouchableOpacity style={[s.timeBtn, { backgroundColor: P.card }]} onPress={() => openTimePicker(day.dow, 'close', periodIndex)}>
                              <Text style={[s.timeTxt, { color: P.text }]}>{formatTime(period.closeTime)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeExtraPeriod(day.dow, periodIndex)} hitSlop={8}>
                              <Ionicons name="close-circle-outline" size={17} color={P.sub} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity style={s.breakBtn} onPress={() => addSplitPeriod(day.dow)}>
                          <Ionicons name="add" size={14} color={P.accent} />
                          <Text style={[s.breakTxt, { color: P.accent }]}>Add break</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <Switch
                      value={day.isOpen}
                      onValueChange={() => toggleDay(day.dow)}
                      trackColor={{ false: P.surface, true: P.accent }}
                      thumbColor={day.isOpen ? P.ice : P.sub}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={[s.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: P.accent, borderColor: P.ice + '30' }, saving && s.saveBtnDim]}
                onPress={handleSaveHours}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={P.ice} size="small" />
                  : <Text style={[s.saveTxt, { color: P.ice }]}>Save Hours</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Native time picker (iOS inline / Android modal) */}
            {pickerVisible && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="slide" visible={pickerVisible}>
                  <View style={s.pickerModalWrap}>
                    {/* Tap-to-dismiss overlay — sibling of sheet, never its parent */}
                    <TouchableOpacity
                      style={s.pickerDismiss}
                      activeOpacity={1}
                      onPress={() => setPickerVisible(false)}
                    />
                    <View style={[s.pickerSheet, { backgroundColor: P.surface }]}>
                      <View style={[s.pickerHeader, { borderBottomColor: P.border }]}>
                        <Text style={[s.pickerLabel, { color: P.text }]}>
                          {pickerTarget
                            ? `${DAY_LABELS[pickerTarget.dow]} — ${pickerTarget.field === 'open' ? 'Open' : 'Close'}`
                            : ''}
                        </Text>
                        <TouchableOpacity onPress={() => setPickerVisible(false)}>
                          <Text style={[s.pickerDone, { color: P.accent }]}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        mode="time"
                        value={pickerDate}
                        onChange={handleTimeChange}
                        display="spinner"
                        themeVariant={isDarkMode ? 'dark' : 'light'}
                        textColor={P.text}
                        style={{ width: '100%' }}
                      />
                      <View style={{ height: Math.max(24, insets.bottom), backgroundColor: P.surface }} />
                    </View>
                  </View>
                </Modal>
              ) : (
                <DateTimePicker
                  mode="time"
                  value={pickerDate}
                  onChange={handleTimeChange}
                  display="default"
                />
              )
            )}
          </>
        )}

        {/* ── Blocked Dates tab ────────────────────────────────────────────── */}
        {tab === 'blocked' && (
          <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {/* Add new blocked date */}
            <View style={[s.blockAddCard, { backgroundColor: P.surface }]}>
              <Text style={[s.blockAddTitle, { color: P.text }]}>Block a Date</Text>
              <TouchableOpacity style={[s.datePickBtn, { backgroundColor: P.card }]} onPress={() => setBlockPickerVisible(true)}>
                <Ionicons name="calendar-outline" size={16} color={P.accent} />
                <Text style={[s.datePickTxt, { color: P.text }]}>{formatYMD(dateToYMD(blockPickerDate))}</Text>
              </TouchableOpacity>
              <TextInput
                style={[s.reasonInput, { backgroundColor: P.card, color: P.text }]}
                placeholder="Reason (optional)"
                placeholderTextColor={P.sub}
                value={blockReason}
                onChangeText={setBlockReason}
              />
              <TouchableOpacity
                style={[s.addBlockBtn, { backgroundColor: P.accent, borderColor: P.ice + '30' }, addingBlock && s.saveBtnDim]}
                onPress={handleAddBlock}
                disabled={addingBlock}
              >
                {addingBlock
                  ? <ActivityIndicator color={P.ice} size="small" />
                  : <Text style={[s.saveTxt, { color: P.ice }]}>Block This Date</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Date picker for block */}
            {blockPickerVisible && (
              Platform.OS === 'ios' ? (
                <Modal transparent animationType="slide" visible={blockPickerVisible}>
                  <View style={s.pickerModalWrap}>
                    <TouchableOpacity
                      style={s.pickerDismiss}
                      activeOpacity={1}
                      onPress={() => setBlockPickerVisible(false)}
                    />
                    <View style={[s.pickerSheet, { backgroundColor: P.surface }]}>
                      <View style={[s.pickerHeader, { borderBottomColor: P.border }]}>
                        <Text style={[s.pickerLabel, { color: P.text }]}>Select Date</Text>
                        <TouchableOpacity onPress={() => setBlockPickerVisible(false)}>
                          <Text style={[s.pickerDone, { color: P.accent }]}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        mode="date"
                        value={blockPickerDate}
                        onChange={(_, d) => { if (d) setBlockPickerDate(d); }}
                        display="spinner"
                        themeVariant={isDarkMode ? 'dark' : 'light'}
                        textColor={P.text}
                        minimumDate={new Date()}
                        style={{ width: '100%' }}
                      />
                      <View style={{ height: Math.max(24, insets.bottom), backgroundColor: P.surface }} />
                    </View>
                  </View>
                </Modal>
              ) : (
                <DateTimePicker
                  mode="date"
                  value={blockPickerDate}
                  onChange={(_, d) => { if (d) { setBlockPickerDate(d); setBlockPickerVisible(false); } }}
                  display="default"
                  minimumDate={new Date()}
                />
              )
            )}

            {/* Existing blocked dates list */}
            {blockedDates.length === 0 ? (
              <View style={s.emptyBlock}>
                <Ionicons name="calendar-clear-outline" size={32} color={P.sub} />
                <Text style={[s.emptyBlockTxt, { color: P.sub }]}>No blocked dates</Text>
              </View>
            ) : (
              <>
                <Text style={[s.sectionLabel, { color: P.sub }]}>Blocked Days</Text>
                {blockedDates.map(b => (
                  <View key={b.id} style={[s.blockedRow, { backgroundColor: P.surface }]}>
                    <View style={s.blockedInfo}>
                      <Text style={[s.blockedDate, { color: P.text }]}>{formatYMD(b.blocked_date)}</Text>
                      {b.reason ? <Text style={[s.blockedReason, { color: P.sub }]}>{b.reason}</Text> : null}
                    </View>
                    <TouchableOpacity style={s.trashBtn} onPress={() => handleRemoveBlock(b.id)}>
                      <Ionicons name="trash-outline" size={18} color="#FF6868" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      <DialogHost />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  segWrap:      { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 4 },
  seg:          { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segActive:    {},
  segTxt:       { fontSize: 14, fontWeight: '600' },
  segTxtActive: {},

  safe:        { flex: 1 },
  list:        { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  // Day rows
  dayRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  dayRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  dayLeft:      { flex: 1 },
  dayLabel:     { fontSize: 16, fontWeight: '500' },
  closedTag:    { fontSize: 12, marginTop: 2 },
  dayRight:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodStack:  { gap: 5, alignItems: 'flex-end' },
  timeBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  timeTxt:      { fontSize: 13, fontWeight: '600' },
  timeSep:      { fontSize: 12 },
  breakBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end', paddingVertical: 2 },
  breakTxt:     { fontSize: 11, fontWeight: '700' },

  // Footer save button
  footer:      { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  saveBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  saveBtnDim:  { opacity: 0.6 },
  saveTxt:     { fontSize: 15, fontWeight: '700' },

  // Native time/date picker bottom sheet (iOS)
  // Overlay and sheet are SIBLINGS inside pickerModalWrap so the overlay colour
  // never leaks through the sheet — the sheet's own background covers everything below it.
  pickerModalWrap: { flex: 1, flexDirection: 'column' },
  pickerDismiss:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  pickerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerLabel:   { fontSize: 15, fontWeight: '600' },
  pickerDone:    { fontSize: 15, fontWeight: '700' },

  // Blocked dates tab
  blockAddCard:  { borderRadius: 16, padding: 16, marginBottom: 20, gap: 12 },
  blockAddTitle: { fontSize: 16, fontWeight: '600' },
  datePickBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  datePickTxt:   { fontSize: 15, fontWeight: '500' },
  reasonInput:   { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBlockBtn:   { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },

  sectionLabel:  { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },

  blockedRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  blockedInfo:   { flex: 1 },
  blockedDate:   { fontSize: 15, fontWeight: '600' },
  blockedReason: { fontSize: 13, marginTop: 2 },
  trashBtn:      { padding: 6 },

  emptyBlock:    { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyBlockTxt: { fontSize: 15 },
});
