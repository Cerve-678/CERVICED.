import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { WAITLIST_HOLD_MINUTES } from '../constants/waitlist';
import { formatCountdown, holdSecondsLeft } from '../features/bookings/waitlist';

const HOLD_SECONDS = WAITLIST_HOLD_MINUTES * 60;

/**
 * A held waitlist slot's time left, ticking once a second. Kept in its own
 * component so only the countdown re-renders, not the screen around it.
 * `onEnd` fires once, when it reaches 0. The bar is the share of the 15
 * minutes left (WAITLIST_HOLD_MINUTES mirrors the database's
 * waitlist_hold_duration()).
 */
export const WaitlistHoldCountdown = memo(function WaitlistHoldCountdown({
  expiresAt,
  color,
  trackColor,
  textStyle,
  showBar = false,
  showTime = true,
  onEnd,
}: {
  expiresAt: string;
  color: string;
  trackColor?: string;
  textStyle?: TextStyle;
  showBar?: boolean;
  /** false: just the bar, for a second copy below the headline. */
  showTime?: boolean;
  onEnd?: () => void;
}) {
  const [left, setLeft] = useState(() => holdSecondsLeft(expiresAt, Date.now()));
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    endedRef.current = false;
    const tick = () => {
      const next = holdSecondsLeft(expiresAt, Date.now());
      setLeft(next);
      if (next === 0 && !endedRef.current) {
        endedRef.current = true;
        onEndRef.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const share = Math.min(1, left / HOLD_SECONDS);
  return (
    <View style={showBar ? styles.wrap : undefined}>
      {showTime && (
        <Text
          style={[styles.time, { color }, textStyle]}
          accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}
        >
          {formatCountdown(left)}
        </Text>
      )}
      {showBar && (
        <View style={[styles.track, { backgroundColor: trackColor ?? 'rgba(0,0,0,0.08)' }]}>
          <View style={[styles.fill, { backgroundColor: color, width: `${share * 100}%` }]} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  time: { fontFamily: 'BakbakOne-Regular', fontSize: 13, fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
