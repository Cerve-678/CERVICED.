// src/features/providers/TodayScheduleCards.tsx
// The two "today" cards on My Profile's Dashboard (owner's pick, 2026-10-29):
//   - TodaySummaryCard: the whole day at a glance, on the profile's accent.
//   - TodayBookingCards: one swipeable card for each of the next few bookings, on any date.
// Which one sits at the top and which sits under Your work is decided by
// todaySchedule.ts. Designs X and Y: https://claude.ai/artifact/GAhSKrF5aDFEiNJsThtmMy
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BookingWithAddOns } from '../../types/database';
import { isDarkColor, withAlpha } from '../../constants/providerThemes';
import {
  DAY_NAMES_ABBREV,
  MONTH_NAMES_ABBREV,
  formatDurationMinutes,
  toLocalDate,
} from '../../utils/dateUtils';
import { compactTime } from './linkOnlyDashboard';
import {
  shortClientName,
  type ScheduleSlot,
  type ScheduleTodo,
  type TodaySchedule,
} from './todaySchedule';

type Schedule = TodaySchedule<BookingWithAddOns>;
type Slot = ScheduleSlot<BookingWithAddOns>;

export interface TodayCardsPalette {
  /** Opaque card colour, as the dashboard's other cards appear. */
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
}

/** Shown under the summary when there's more of the day than this. */
const MAX_SUMMARY_ROWS = 6;
const CARD_WIDTH = 140;
const CARD_GAP = 10;
const CARD_STRIDE = CARD_WIDTH + CARD_GAP;
const SHEET_GUTTER = 20;

const TODO_BG = '#FFD9B3';
const TODO_TEXT = '#5A2A0A';
const FLAG_BG = '#FBEBD9';
const FLAG_TEXT = '#9A3412';

function money(value: number): string {
  return Number.isInteger(value) ? `£${value}` : `£${value.toFixed(2)}`;
}

function timeOf(slot: Slot): string {
  return compactTime(slot.booking.booking_time) ?? '';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function shortDayLabel(ymd: string): string {
  const d = toLocalDate(ymd);
  return `${DAY_NAMES_ABBREV[d.getDay()]} ${d.getDate()} ${MONTH_NAMES_ABBREV[d.getMonth()]}`.toUpperCase();
}

/** "NOW", "NEXT · 25 MIN", "NEXT · 1H 30M", "REQUEST", "DONE" — or '' for
 *  an ordinary later booking. */
function slotTag(slot: Slot): string {
  if (slot.state === 'done') return 'DONE';
  if (slot.state === 'now') return 'NOW';
  if (slot.state === 'next' && slot.minutesUntil !== null) {
    const m = slot.minutesUntil;
    return `NEXT · ${m < 60 ? `${m} MIN` : formatDurationMinutes(m).toUpperCase()}`;
  }
  if (slot.state === 'next') return 'FIRST';
  return slot.isRequest ? 'REQUEST' : '';
}

function todoText(todo: ScheduleTodo<BookingWithAddOns>): string {
  const name = shortClientName(todo.booking.customer_name);
  const time = compactTime(todo.booking.booking_time) ?? '';
  return todo.kind === 'request'
    ? `Answer ${name}'s ${time} request`
    : `${name}'s ${todo.booking.service_name_snapshot.toLowerCase()} needs a patch test`;
}

function todoLine(todos: ScheduleTodo<BookingWithAddOns>[]): string {
  const first = todos[0];
  if (!first) return '';
  return todos.length > 1 ? `${todoText(first)} · +${todos.length - 1} more` : todoText(first);
}

function tap(): void {
  Haptics.selectionAsync().catch(() => {});
}

// ─── X · Summary ──────────────────────────────────────────────────────────────

// Memoised: the screen ticks every minute and re-renders for unrelated state
// (scrolling past the hero, tab switches), and the schedule object only
// changes when something on these cards does.
export const TodaySummaryCard = React.memo(function TodaySummaryCard({
  schedule,
  palette,
  onOpenBooking,
  onOpenDay,
}: {
  schedule: Schedule;
  palette: TodayCardsPalette;
  onOpenBooking: (booking: BookingWithAddOns) => void;
  onOpenDay: (ymd: string) => void;
}) {
  const { phase, today, tomorrow, todos, doneCount, bookedValue } = schedule;
  // Cream on a dark accent, ink on a pale one, so any theme stays readable.
  const ink = isDarkColor(palette.accent) ? '#FFF8F2' : '#26201E';
  const soft = withAlpha(ink, 0.72);
  const faded = withAlpha(ink, 0.4);
  const leadText = isDarkColor(palette.accent) ? '#26201E' : '#FFF8F2';

  const count = today.length;
  const first = today[0];
  const sub =
    count === 0
      ? 'Nothing booked today'
      : phase === 'summaryLeads'
        ? `${money(bookedValue)} booked · first at ${first ? timeOf(first) : ''}`
        : phase === 'cardsLead'
          ? `${doneCount} done · ${count - doneCount} to go · ${money(bookedValue)} booked`
          : `All done · ${money(bookedValue)} booked`;

  // Once the day is done the strip looks ahead; while the summary leads it
  // carries the to-dos; under Your work it says nothing (the cards on top do).
  const tomorrowFirst = tomorrow[0];
  const strip =
    phase === 'dayDone'
      ? {
          text: tomorrowFirst
            ? `Tomorrow: ${plural(tomorrow.length, 'booking')}, first at ${timeOf(tomorrowFirst)}`
            : 'Nothing booked tomorrow yet',
          bg: withAlpha(ink, 0.14),
          fg: ink,
          onPress: () => onOpenDay(schedule.tomorrowYmd),
        }
      : phase === 'summaryLeads' && todos[0]
        ? { text: todoLine(todos), bg: TODO_BG, fg: TODO_TEXT, onPress: () => onOpenBooking(todos[0]!.booking) }
        : null;

  // A long day shows the rows around now rather than every one.
  const startAt =
    count > MAX_SUMMARY_ROWS
      ? Math.min(Math.max(0, (schedule.leadIndex ?? count) - 1), count - MAX_SUMMARY_ROWS)
      : 0;
  const rows = today.slice(startAt, startAt + MAX_SUMMARY_ROWS);
  const hidden = count - rows.length;

  return (
    <View style={styles.summaryShadow}>
      <View style={[styles.summary, { backgroundColor: palette.accent }]}>
        <View style={styles.summaryHeader}>
          <Text style={[styles.eyebrow, { color: soft }]}>TODAY · {shortDayLabel(schedule.todayYmd)}</Text>
          <TouchableOpacity
            style={styles.headerLink}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
            onPress={() => { tap(); onOpenDay(schedule.todayYmd); }}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open today in your calendar"
          >
            <Text style={[styles.headerLinkText, { color: ink }]}>FULL DAY</Text>
            <Ionicons name="chevron-forward" size={13} color={ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.countRow}>
          {count > 0 ? <Text style={[styles.bigCount, { color: ink }]}>{count}</Text> : null}
          <View style={styles.countText}>
            <Text style={[styles.countWord, { color: ink }]}>
              {count === 0 ? 'FREE TODAY' : count === 1 ? 'BOOKING' : 'BOOKINGS'}
            </Text>
            <Text style={[styles.countSub, { color: soft }]}>{sub}</Text>
          </View>
        </View>

        {strip ? (
          <TouchableOpacity
            style={[styles.strip, { backgroundColor: strip.bg }]}
            onPress={() => { tap(); strip.onPress(); }}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <View style={[styles.stripDot, { backgroundColor: strip.fg }]} />
            <Text style={[styles.stripText, { color: strip.fg }]} numberOfLines={2}>{strip.text}</Text>
            <Ionicons name="chevron-forward" size={14} color={strip.fg} />
          </TouchableOpacity>
        ) : null}

        {rows.length > 0 ? (
          <View style={styles.rows}>
            {rows.map(slot => {
              const lead = slot.state === 'now' || slot.state === 'next';
              const done = slot.state === 'done';
              const fg = lead ? leadText : done ? faded : ink;
              const fgSub = lead ? withAlpha(leadText, 0.7) : done ? faded : soft;
              const length = formatDurationMinutes(slot.lengthMinutes);
              return (
                <TouchableOpacity
                  key={slot.booking.id}
                  style={[styles.row, lead && { backgroundColor: ink }]}
                  onPress={() => { tap(); onOpenBooking(slot.booking); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${timeOf(slot)}, ${shortClientName(slot.booking.customer_name)}, ${slot.booking.service_name_snapshot}`}
                >
                  <Text style={[styles.rowTime, { color: fg }]}>{timeOf(slot)}</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: fg }]} numberOfLines={1}>
                      {shortClientName(slot.booking.customer_name)}
                    </Text>
                    <Text style={[styles.rowService, { color: fgSub }]} numberOfLines={1}>
                      {length ? `${slot.booking.service_name_snapshot} · ${length}` : slot.booking.service_name_snapshot}
                    </Text>
                  </View>
                  <Text style={[styles.rowTag, { color: fgSub }]}>{slotTag(slot)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {hidden > 0 ? (
          <Text style={[styles.more, { color: soft }]}>+{hidden} more · see the full day</Text>
        ) : null}
      </View>
    </View>
  );
});

// ─── Y · Booking cards ────────────────────────────────────────────────────────

export const TodayBookingCards = React.memo(function TodayBookingCards({
  schedule,
  palette,
  onOpenBooking,
}: {
  schedule: Schedule;
  palette: TodayCardsPalette;
  onOpenBooking: (booking: BookingWithAddOns) => void;
}) {
  const { phase, upcoming: slots, todos, todayYmd, tomorrowYmd } = schedule;

  const leadInk = isDarkColor(palette.accent) ? '#FFF8F2' : '#26201E';

  // Back to the first card when it changes (a client finishing), so the next
  // booking is always what's showing. Never in the middle of someone's swipe.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const firstId = slots[0]?.booking.id;
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    setActiveIndex(0);
  }, [firstId]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      setActiveIndex(Math.min(slots.length - 1, Math.max(0, Math.round(x / CARD_STRIDE))));
    },
    [slots.length],
  );

  if (slots.length === 0) return null;

  const total = slots.length;
  const todoFirst = phase === 'cardsLead' ? todos[0] : undefined;

  return (
    <View style={styles.cardsSection}>
      <View style={styles.cardsHeader}>
        <View>
          <Text style={[styles.cardsTitle, { color: palette.text }]}>COMING UP</Text>
          <Text style={[styles.cardsDate, { color: palette.sub }]}>
            {total === 1 ? 'Your next booking' : `Your next ${total} bookings`}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cardsScroller}
        contentContainerStyle={styles.cardsTrack}
        snapToInterval={CARD_STRIDE}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
      >
        {slots.map((slot, index) => {
          const lead = index === 0;
          const onToday = slot.booking.booking_date === todayYmd;
          const fg = lead ? leadInk : palette.text;
          const fgSub = lead ? withAlpha(leadInk, 0.75) : palette.sub;
          const tag = onToday
            ? slotTag(slot) || 'LATER TODAY'
            : slot.booking.booking_date === tomorrowYmd
              ? 'TOMORROW'
              : shortDayLabel(slot.booking.booking_date);
          return (
            <TouchableOpacity
              key={slot.booking.id}
              style={[
                styles.bookingCard,
                lead
                  ? [styles.bookingCardLead, { backgroundColor: palette.accent, borderColor: palette.accent }]
                  : { backgroundColor: palette.card, borderColor: palette.border },
              ]}
              onPress={() => { tap(); onOpenBooking(slot.booking); }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${tag}, ${timeOf(slot)}, ${shortClientName(slot.booking.customer_name)}, ${slot.booking.service_name_snapshot}`}
            >
              <Text style={[styles.cardTag, { color: fgSub }]} numberOfLines={1}>{tag}</Text>
              <Text style={[styles.cardTime, { color: fg }]}>{timeOf(slot)}</Text>
              {slot.lengthMinutes > 0 ? (
                <Text style={[styles.cardLength, { color: fgSub }]}>{formatDurationMinutes(slot.lengthMinutes)}</Text>
              ) : null}
              <View style={styles.cardSpacer} />
              <Text style={[styles.cardName, { color: fg }]} numberOfLines={1}>
                {shortClientName(slot.booking.customer_name)}
              </Text>
              <Text style={[styles.cardService, { color: fgSub }]} numberOfLines={2}>
                {slot.booking.service_name_snapshot}
              </Text>
              {slot.isRequest && !onToday ? (
                <View style={styles.flag}>
                  <Text style={styles.flagText}>REQUEST</Text>
                </View>
              ) : null}
              {slot.needsPatchTest ? (
                <View style={styles.flag}>
                  <Text style={styles.flagText}>NEEDS PATCH TEST</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {total > 1 ? (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slots.map((slot, i) => (
            <View
              key={slot.booking.id}
              style={[
                styles.dot,
                i === activeIndex
                  ? { width: 18, backgroundColor: palette.accent }
                  : { backgroundColor: withAlpha(palette.sub, 0.3) },
              ]}
            />
          ))}
        </View>
      ) : null}

      {todoFirst ? (
        <TouchableOpacity
          style={[styles.todoRow, { backgroundColor: palette.card, borderColor: palette.border }]}
          onPress={() => { tap(); onOpenBooking(todoFirst.booking); }}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <View style={styles.todoBadge}>
            <Text style={styles.todoBadgeText}>{todos.length}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.todoEyebrow}>TO DO TODAY</Text>
            <Text style={[styles.todoText, { color: palette.text }]} numberOfLines={2}>{todoLine(todos)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={palette.sub} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // X
  summaryShadow: {
    marginBottom: 14,
    borderRadius: 28,
    shadowColor: '#26201E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5,
  },
  summary: {
    borderRadius: 28,
    padding: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.4,
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingLeft: 12,
  },
  headerLinkText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  bigCount: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 54,
    lineHeight: 60,
  },
  countText: {
    flex: 1,
  },
  countWord: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
    lineHeight: 22,
  },
  countSub: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 1,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  stripDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stripText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  rows: {
    marginTop: 14,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rowTime: {
    width: 54,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    lineHeight: 18,
  },
  rowService: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
  },
  rowTag: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  more: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 10,
    paddingHorizontal: 12,
  },

  // Y
  cardsSection: {
    marginBottom: 14,
  },
  cardsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  cardsTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 26,
    lineHeight: 30,
  },
  cardsDate: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 1,
  },
  // Runs edge to edge under the sheet's padding so the cards scroll off the
  // screen rather than being clipped at the gutter.
  cardsScroller: {
    marginHorizontal: -SHEET_GUTTER,
    marginTop: 14,
  },
  cardsTrack: {
    paddingHorizontal: SHEET_GUTTER,
    gap: CARD_GAP,
    paddingBottom: 14,
  },
  bookingCard: {
    width: CARD_WIDTH,
    height: 196,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: '#B87E92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  bookingCardLead: {
    shadowColor: '#26201E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  cardTag: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
  },
  cardTime: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 28,
    lineHeight: 34,
    marginTop: 6,
  },
  cardLength: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
  },
  cardSpacer: {
    flex: 1,
  },
  cardName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    lineHeight: 20,
  },
  cardService: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  flag: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: FLAG_BG,
  },
  flagText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.8,
    color: FLAG_TEXT,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todoBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FLAG_BG,
  },
  todoBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    color: FLAG_TEXT,
  },
  todoEyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    color: FLAG_TEXT,
  },
  todoText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 1,
  },
});
