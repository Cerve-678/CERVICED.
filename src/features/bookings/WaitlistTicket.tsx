import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import type { MyWaitlistPlace } from '../../services/databaseService';
import { WAITLIST_HOLD_MINUTES } from '../../constants/waitlist';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { formatShortDayDate, ordinalSuffix } from '../../utils/dateUtils';
import {
  formatCountdown,
  heldTimeRangeLabel,
  holdSecondsLeft,
  offeredSlotLabel,
  waitlistCardState,
  waitlistDatesLabel,
} from './waitlist';

const HOLD_SECONDS = WAITLIST_HOLD_MINUTES * 60;
const DISPLAY = 'BakbakOne-Regular';
const BODY = 'Jura-VariableFont_wght';

/** Today's price and length of the held service, read when a hold opens. */
export interface WaitlistTicketService {
  price: number;
  durationMinutes: number;
}

interface WaitlistTicketProps {
  /** The place shown. null = closed. */
  place: MyWaitlistPlace | null;
  /** The time the list was last laid out. */
  nowMs: number;
  busy: boolean;
  /** Price and length for a held slot; null while it loads or if it can't be read. */
  service: WaitlistTicketService | null;
  /** Set once the held slot is paid for: the ticket is stamped. */
  paid: { paid: number; leftToPay: number; requestSent: boolean } | null;
  onClose: () => void;
  onConfirmAndPay: (place: MyWaitlistPlace) => void;
  onPass: (place: MyWaitlistPlace) => void;
  onChangeDates: (place: MyWaitlistPlace) => void;
  onLeave: (place: MyWaitlistPlace) => void;
  /** The hold's time just ran out on screen. */
  onHoldEnded: () => void;
  /** Sheets opened from the ticket (change dates, pay). They have to be
   *  rendered inside this modal to show on top of it on iOS. */
  children?: React.ReactNode;
}

/**
 * A client's waitlist ticket. Waiting: their place in line, shown big and as
 * dots, and the dates they gave. Held: a ring counting down the hold, the
 * date and time large, Confirm & pay and Pass it on. A place that has gone
 * closes the ticket; Bookings' "Waiting for" card says what happened.
 */
export function WaitlistTicket({
  place, nowMs, busy, service, paid, onClose, onConfirmAndPay, onPass, onChangeDates, onLeave, onHoldEnded, children,
}: WaitlistTicketProps) {
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const insets = useSafeAreaInsets();
  const bottomInset = useSystemBottomInset();
  // Keep the last place on screen while the sheet slides away.
  const lastPlace = useRef<MyWaitlistPlace | null>(place);
  if (place) lastPlace.current = place;
  const shown = place ?? lastPlace.current;
  const state = shown ? waitlistCardState(shown, nowMs) : 'gone';
  const visible = !!place && (state !== 'gone' || !!paid);

  // pageSheet already starts below the status bar on iOS; Android shows the
  // modal full screen, so it needs the inset itself.
  const topPad = Platform.OS === 'android' ? insets.top + 12 : 18;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Text style={styles.cap}>{paid ? 'Booked' : state === 'held' ? 'Held for you' : 'Waitlist'}</Text>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onClose(); }}
            hitSlop={12}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={P.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
          {shown && paid && (
            <>
              <View style={styles.ticket}>
                <View style={styles.top}>
                  <View style={[styles.stamp, { backgroundColor: P.accent }]}>
                    <Ionicons name="checkmark" size={30} color={P.onAccent} />
                  </View>
                  <Text style={[styles.xl, { marginTop: 8 }]}>From the waitlist</Text>
                  <Text style={styles.sub}>{paid.requestSent ? `Sent to ${shown.providerName} to accept` : 'to your diary'}</Text>
                </View>
                {ticketCut()}
                <View style={styles.bottom}>
                  {row('When', offeredSlotLabel(shown.offeredDate, shown.offeredTime) ?? 'Your slot')}
                  {row('Service', shown.serviceName)}
                  {row('Paid today', `£${paid.paid.toFixed(2)}`)}
                  {paid.leftToPay > 0 && row('Left to pay at the appointment', `£${paid.leftToPay.toFixed(2)}`)}
                  {row('Status', paid.requestSent ? 'Request sent' : 'Confirmed')}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: P.accentDim }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); onClose(); }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: P.accentText }]}>See booking</Text>
              </TouchableOpacity>
            </>
          )}

          {shown && !paid && state === 'held' && shown.offerExpiresAt && (
            <>
              <View style={styles.ticket}>
                <View style={styles.top}>
                  <HoldRing expiresAt={shown.offerExpiresAt} onEnd={onHoldEnded} />
                  <Text style={styles.xl}>{shown.offeredDate ? formatShortDayDate(shown.offeredDate) : 'Your slot'}</Text>
                  {!!heldTimeRangeLabel(shown.offeredTime, service?.durationMinutes ?? null) && (
                    <Text style={[styles.lg, { color: P.accentText }]}>
                      {heldTimeRangeLabel(shown.offeredTime, service?.durationMinutes ?? null)}
                    </Text>
                  )}
                </View>
                {ticketCut()}
                <View style={styles.bottom}>
                  {row('Service', shown.serviceName)}
                  {row('With', shown.providerName)}
                  {service && row('Price', `£${service.price.toFixed(2).replace(/\.00$/, '')}`)}
                </View>
              </View>
              <Text style={styles.note}>
                Pay to confirm it before the time runs out. The clock keeps running while you pay.
              </Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: P.accent }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onConfirmAndPay(shown); }}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Confirm and pay"
              >
                {busy
                  ? <ActivityIndicator color={P.onAccent} size="small" />
                  : <Text style={[styles.buttonText, { color: P.onAccent }]}>Confirm & pay</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.lineButton]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); onPass(shown); }}
                disabled={busy}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: P.sub }]}>Pass it on</Text>
              </TouchableOpacity>
            </>
          )}

          {shown && !paid && state === 'waiting' && (
            <>
              <View style={styles.ticket}>
                <View style={styles.top}>
                  <Text style={styles.cap}>You're in line for</Text>
                  <Text style={styles.lg}>{shown.serviceName}</Text>
                  <Text style={styles.sub}>{shown.providerName}</Text>
                  {placeNumber(shown.placeInLine)}
                  {queueDots(shown.placeInLine)}
                </View>
                {ticketCut()}
                <View style={styles.bottom}>
                  {row('Your dates', waitlistDatesLabel(shown.preferredDates))}
                  {row('If a slot opens', `Held for you ${WAITLIST_HOLD_MINUTES} min`)}
                </View>
              </View>
              <View style={styles.pair}>
                <TouchableOpacity
                  style={[styles.button, styles.pairButton, { backgroundColor: P.accentDim }]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onChangeDates(shown); }}
                  disabled={busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={[styles.buttonText, { color: P.accentText }]}>Change dates</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.pairButton, styles.lineButton]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onLeave(shown); }}
                  disabled={busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Leave the ${shown.serviceName} waitlist`}
                >
                  <Text style={[styles.buttonText, { color: P.sub }]}>Leave</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
      {children}
    </Modal>
  );

  function row(label: string, value: string) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
      </View>
    );
  }

  function ticketCut() {
    return (
      <View style={styles.cut}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={styles.dash} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>
    );
  }

  function placeNumber(n: number | null) {
    if (n == null || !Number.isFinite(n) || n < 1) {
      return <Text style={[styles.lg, { marginTop: 10 }]}>In line</Text>;
    }
    const label = ordinalSuffix(Math.floor(n));
    const digits = label.replace(/\D+$/, '');
    return (
      <Text style={styles.place} accessibilityLabel={`${label} in line`}>
        {digits}<Text style={styles.placeSuffix}>{label.slice(digits.length)}</Text>
      </Text>
    );
  }

  /** The people ahead (up to four, then "+n"), then the client. */
  function queueDots(n: number | null) {
    if (n == null || !Number.isFinite(n) || n < 1) return null;
    const ahead = Math.floor(n) - 1;
    const shownAhead = Math.min(ahead, 4);
    return (
      <View style={styles.queue} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {ahead > shownAhead && <Text style={styles.queueMore}>+{ahead - shownAhead}</Text>}
        {Array.from({ length: shownAhead }, (_, i) => <View key={i} style={styles.dot} />)}
        <View style={[styles.dot, styles.you]} />
      </View>
    );
  }
}

/**
 * The hold's ring, ticking once a second. Kept in its own component so only
 * the ring re-renders. `onEnd` fires once, when it reaches 0.
 */
const HoldRing = memo(function HoldRing({ expiresAt, onEnd }: { expiresAt: string; onEnd: () => void }) {
  const { palette: P } = useTheme();
  const [left, setLeft] = useState(() => holdSecondsLeft(expiresAt, Date.now()));
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    let ended = false;
    const tick = () => {
      const next = holdSecondsLeft(expiresAt, Date.now());
      setLeft(next);
      if (next === 0 && !ended) {
        ended = true;
        onEndRef.current();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const size = 150;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, left / HOLD_SECONDS);
  return (
    <View style={ringStyles.wrap} accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}>
      <Svg width={size} height={size} style={ringStyles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={P.accentDim} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={P.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - share)}
        />
      </Svg>
      <Text style={[ringStyles.time, { color: P.text }]}>{formatCountdown(left)}</Text>
      <Text style={[ringStyles.left, { color: P.sub }]}>LEFT</Text>
    </View>
  );
});

const ringStyles = StyleSheet.create({
  wrap: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  svg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  time: { fontFamily: DISPLAY, fontSize: 34, fontVariant: ['tabular-nums'] },
  left: { position: 'absolute', bottom: 34, fontFamily: DISPLAY, fontSize: 11, letterSpacing: 1.6 },
});

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: P.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
    content: { paddingHorizontal: 20, gap: 12 },
    cap: { fontFamily: DISPLAY, fontSize: 11.5, letterSpacing: 1.8, textTransform: 'uppercase', color: P.sub },
    xl: { fontFamily: DISPLAY, fontSize: 26, color: P.text, textAlign: 'center' },
    lg: { fontFamily: DISPLAY, fontSize: 19, color: P.text, textAlign: 'center' },
    sub: { fontFamily: BODY, fontSize: 14, fontWeight: '600', color: P.sub, textAlign: 'center' },
    note: { fontFamily: BODY, fontSize: 13, fontWeight: '600', color: P.sub, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
    ticket: {
      backgroundColor: P.card,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: P.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    top: { alignItems: 'center', paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18, gap: 4 },
    bottom: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 10 },
    cut: { height: 24, justifyContent: 'center' },
    dash: { marginHorizontal: 16, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: P.border },
    notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: P.bg, borderWidth: 1, borderColor: P.border },
    notchLeft: { left: -13 },
    notchRight: { right: -13 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
    rowLabel: { fontFamily: BODY, fontSize: 14, fontWeight: '600', color: P.sub },
    rowValue: { flexShrink: 1, fontFamily: DISPLAY, fontSize: 14, color: P.text, textAlign: 'right' },
    place: { fontFamily: DISPLAY, fontSize: 66, lineHeight: 74, color: P.text, marginTop: 8 },
    placeSuffix: { fontFamily: DISPLAY, fontSize: 26 },
    queue: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    queueMore: { fontFamily: DISPLAY, fontSize: 11, color: P.sub },
    dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: P.accentDim },
    you: {
      backgroundColor: P.accent,
      borderWidth: 4,
      borderColor: P.accentDim,
    },
    stamp: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    pair: { flexDirection: 'row', gap: 10 },
    pairButton: { flex: 1 },
    button: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    lineButton: { borderWidth: 1, borderColor: P.border },
    buttonText: { fontFamily: DISPLAY, fontSize: 14, letterSpacing: 0.6 },
  });
