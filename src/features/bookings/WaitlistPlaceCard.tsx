import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import type { MyWaitlistPlace } from '../../services/databaseService';
import { WaitlistHoldCountdown } from '../../components/WaitlistHoldCountdown';
import {
  holdEndLabel,
  offeredSlotLabel,
  placeInLineLabel,
  waitlistCardState,
  waitlistDatesLabel,
} from './waitlist';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface WaitlistPlaceCardProps {
  place: MyWaitlistPlace;
  /** The time the list was last laid out; a held card ends itself on time. */
  nowMs: number;
  busy: boolean;
  onConfirmAndPay: (place: MyWaitlistPlace) => void;
  onPass: (place: MyWaitlistPlace) => void;
  /** Opens the place's ticket. */
  onOpen: (place: MyWaitlistPlace) => void;
  onRejoin: (place: MyWaitlistPlace) => void;
  onDismiss: (place: MyWaitlistPlace) => void;
  /** A held card's time just ran out. */
  onHoldEnded: () => void;
}

/**
 * One waitlist place in Bookings' "Waiting for" section. Held: the slot is
 * the client's for the time shown, with Confirm & pay and Pass it on. Waiting:
 * their place in line and their dates (tap for the ticket). Gone: the hold ended,
 * they've come off this waitlist, and can rejoin.
 */
export const WaitlistPlaceCard = React.memo<WaitlistPlaceCardProps>(({
  place, nowMs, busy, onConfirmAndPay, onPass, onOpen, onRejoin, onDismiss, onHoldEnded,
}) => {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const state = waitlistCardState(place, nowMs);
  const slot = offeredSlotLabel(place.offeredDate, place.offeredTime);
  const who = `${place.serviceName} · ${place.providerName}`;

  if (state === 'held' && place.offerExpiresAt) {
    return (
      <View style={[styles.card, styles.heldCard]}>
        <View style={styles.rowBetween}>
          <View style={[styles.pill, { backgroundColor: P.accent }]}>
            <Text style={[styles.pillText, { color: P.onAccent }]}>{tr('shared.newc.heldForYou')}</Text>
          </View>
          <WaitlistHoldCountdown
            expiresAt={place.offerExpiresAt}
            color={P.accentText}
            textStyle={styles.countdown}
            onEnd={onHoldEnded}
          />
        </View>
        <Text style={styles.slot}>{slot ?? 'Your slot'}</Text>
        <Text style={styles.sub} numberOfLines={1}>{who}</Text>
        <WaitlistHoldCountdown
          expiresAt={place.offerExpiresAt}
          color={P.accent}
          trackColor={P.accentDim}
          showBar
          showTime={false}
        />
        <Text style={styles.note}>
          Pay to confirm it before the time runs out. The clock keeps running while you pay, and a payment that misses it is cancelled or refunded in full.
        </Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, styles.lineButton]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onPass(place); }}
            disabled={busy}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={tr('shared.newc2.passOn', { slot: slot ?? tr('shared.newc2.thisSlot') })}
          >
            <Text style={[styles.buttonText, { color: P.sub }]}>{tr('shared.newc.passItOn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: P.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onConfirmAndPay(place); }}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={tr('shared.newc2.confirmPayFor', { slot: slot ?? tr('shared.newc2.thisSlot') })}
          >
            {busy
              ? <ActivityIndicator color={P.onAccent} size="small" />
              : <Text style={[styles.buttonText, { color: P.onAccent }]}>{tr('shared.newc.confirmPay')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state === 'waiting') {
    return (
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpen(place); }}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${who}, ${placeInLineLabel(place.placeInLine)}, ${waitlistDatesLabel(place.preferredDates)}. ${tr('shared.newc2.openTicket')}`}
      >
        <View style={styles.rowBetween}>
          <View style={styles.names}>
            <Text style={styles.service} numberOfLines={1}>{place.serviceName}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {place.providerName} · {waitlistDatesLabel(place.preferredDates)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: P.accentDim }]}>
            <Text style={[styles.pillText, { color: P.accentText }]}>{placeInLineLabel(place.placeInLine)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  // Gone. Passing ends a hold before its time; running out ends it on time.
  const expiresMs = place.offerExpiresAt ? new Date(place.offerExpiresAt).getTime() : NaN;
  const endedMs = place.offerEndedAt ? new Date(place.offerEndedAt).getTime() : NaN;
  const passed = Number.isFinite(expiresMs) && Number.isFinite(endedMs) && endedMs < expiresMs - 5000;
  const until = holdEndLabel(place.offerExpiresAt);
  return (
    <View style={styles.card}>
      <View style={styles.goneTop}>
        <View style={[styles.icon, { backgroundColor: P.accentDim }]}>
          <Ionicons name="time-outline" size={18} color={P.accentText} />
        </View>
        <View style={styles.names}>
          <Text style={styles.service} numberOfLines={2}>{slot ? tr('shared.newc2.slotGone', { slot }) : tr('shared.newc.yourHeldSlotHasGone')}</Text>
          <Text style={styles.sub} numberOfLines={1}>{who}</Text>
        </View>
      </View>
      <Text style={styles.note}>
        {passed
          ? tr('shared.newc.youPassedOnItSoYou')
          : until
          ? tr('shared.newc2.heldUntilOff', { time: until })
          : "Its time ran out, so you've come off this waitlist."}
        {' '}{tr('shared.newc.rejoinToBeOfferedTheNext')}
      </Text>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.lineButton]}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onDismiss(place); }}
          disabled={busy}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: P.sub }]}>{tr('shared.notifications.dismiss')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: P.accent }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onRejoin(place); }}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={tr('shared.newc2.rejoinA11y', { service: place.serviceName })}
        >
          {busy
            ? <ActivityIndicator color={P.onAccent} size="small" />
            : <Text style={[styles.buttonText, { color: P.onAccent }]}>{tr('shared.newc.rejoin')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
});
WaitlistPlaceCard.displayName = 'WaitlistPlaceCard';

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 16,
      gap: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: P.border,
      backgroundColor: P.card,
    },
    heldCard: { borderWidth: 1.5, borderColor: P.accent },
    pressed: { opacity: 0.85 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    names: { flex: 1, gap: 2 },
    pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
    pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 0.3 },
    countdown: { fontSize: 16 },
    slot: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.text, marginTop: 2 },
    service: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text },
    sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', color: P.sub },
    note: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12.5, fontWeight: '600', color: P.sub, lineHeight: 17 },
    goneTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
    button: { flex: 1, minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    lineButton: { borderWidth: 1, borderColor: P.border },
    buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 12.5, letterSpacing: 0.3 },
  });
