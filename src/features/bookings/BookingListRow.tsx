import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { BookingStatus } from '../../contexts/BookingContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatBookingDate } from './presentation';
import type { BookingCardProps } from './presentationTypes';

/**
 * Full-width list row for a booking — used where a screen needs a real
 * vertical list (e.g. Past Bookings) rather than the horizontal-scrolling
 * carousel `BookingCard` renders. Same data contract as `BookingCard` so the
 * two are interchangeable per-section.
 */
export const BookingListRow = React.memo<BookingCardProps>(
  ({ booking, onPress, isHighlighted = false, isRecentlyAdded = false, actionCount = 0 }) => {
    const { isDarkMode, palette: P } = useTheme();
    const styles = useMemo(() => createStyles(isDarkMode, P), [isDarkMode, P]);
    const highlightAnim = useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;

    useEffect(() => {
      if (!isHighlighted) return;

      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.delay(1500),
        Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]).start();
    }, [highlightAnim, isHighlighted]);

    const highlightBorderColor = highlightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)', P.accent],
    });
    const highlightBackgroundColor = highlightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [P.card, P.accentDim],
    });

    const showStatusBadge =
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.NO_SHOW ||
      booking.status === BookingStatus.PENDING ||
      booking.isPendingReschedule;

    const badgeText = useMemo(() => {
      if (booking.isPendingReschedule) {
        return (booking as any).rescheduleRequest?.providerAvailableDates ? 'AVAILABLE' : 'PENDING';
      }
      if (booking.status === BookingStatus.PENDING) return 'AWAITING CONFIRMATION';
      if (booking.status === BookingStatus.CANCELLED) return 'CANCELLED';
      if (booking.status === BookingStatus.NO_SHOW) return 'NO SHOW';
      return '';
    }, [booking]);

    const badgeColor = useMemo(() => {
      if (booking.isPendingReschedule) return P.accent;
      if (booking.status === BookingStatus.PENDING) return '#FF9500';
      if (booking.status === BookingStatus.CANCELLED) return '#F44336';
      if (booking.status === BookingStatus.NO_SHOW) return '#FF9800';
      return '#9E9E9E';
    }, [P.accent, booking.isPendingReschedule, booking.status]);

    // The reschedule badge sits on P.accent, whose contrasting text color is
    // theme-defined (one palette needs dark text on a pale accent); the other
    // badge colors are fixed hex literals where white always reads.
    const statusPillTextColor = booking.isPendingReschedule ? P.onAccent : '#fff';

    const handlePress = useCallback(() => {
      onPress(booking);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [booking, onPress]);

    return (
      <Pressable onPress={handlePress}>
        <Animated.View style={[styles.row, { borderColor: highlightBorderColor, backgroundColor: highlightBackgroundColor }]}>
          <View style={styles.imageWrapper}>
            {booking.providerImage ? (
              <Image source={typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage} style={styles.logo} contentFit="cover" transition={0} />
            ) : (
              <View style={[styles.logo, styles.fallbackLogo, { backgroundColor: P.accent }]}>
                <Text style={[styles.fallbackLogoText, { color: P.onAccent }]}>
                  {booking.providerName?.split(' ').map((word: string) => word[0]).slice(0, 2).join('').toUpperCase() || 'P'}
                </Text>
              </View>
            )}
            {isRecentlyAdded && booking.status === BookingStatus.UPCOMING && <View style={styles.recentlyAddedDot} />}
            {actionCount > 0 && booking.status !== BookingStatus.CANCELLED && (
              <View style={styles.actionBadge}><Text style={styles.actionBadgeText}>!</Text></View>
            )}
          </View>
          <View style={styles.info}>
            <View style={styles.infoTopRow}>
              <Text style={styles.providerName} numberOfLines={1}>{booking.providerName}</Text>
              {showStatusBadge && (
                <View style={[styles.statusPill, { backgroundColor: badgeColor }]}>
                  <Text style={[styles.statusPillText, { color: statusPillTextColor }]} numberOfLines={1}>{badgeText}</Text>
                </View>
              )}
            </View>
            <Text style={styles.serviceName} numberOfLines={1}>{booking.serviceName}</Text>
            {(booking.addOns?.length ?? 0) > 0 && (
              <Text style={styles.addOnText} numberOfLines={1}>+ {booking.addOns!.length} add-on{booking.addOns!.length === 1 ? '' : 's'}</Text>
            )}
            <View style={styles.appointmentTime}>
              <Text style={styles.appointmentDate}>{formatBookingDate(booking.bookingDate)}</Text>
              <Text style={styles.appointmentTimeText}> · {booking.bookingTime}</Text>
            </View>
            {booking.isPendingReschedule && (
              <View style={[styles.rescheduleBadge, { backgroundColor: badgeColor }]}>
                <Text style={styles.rescheduleBadgeText} numberOfLines={1}>
                  {badgeText === 'AVAILABLE' ? 'Reschedule Available' : 'Reschedule Pending'}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  },
);

BookingListRow.displayName = 'BookingListRow';

const createStyles = (isDarkMode: boolean, P: ReturnType<typeof useTheme>['palette']) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 15, borderWidth: 1, padding: 10 },
  imageWrapper: { position: 'relative', marginRight: 12 },
  logo: { width: 60, height: 60, borderRadius: 12, backgroundColor: P.surface },
  fallbackLogo: { alignItems: 'center', justifyContent: 'center' },
  fallbackLogoText: { fontSize: 16, fontWeight: '800' },
  info: { flex: 1, minWidth: 0 },
  infoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  providerName: { flex: 1, fontSize: 14, fontWeight: 'bold', color: P.text, marginRight: 8 },
  serviceName: { fontSize: 12, color: P.sub, marginTop: 2 },
  addOnText: { fontSize: 11, color: P.sub, marginTop: 2 },
  appointmentTime: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  appointmentDate: { fontSize: 12, fontWeight: '600', color: P.text },
  appointmentTimeText: { fontSize: 11, color: P.sub },
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 130 },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  rescheduleBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 6 },
  rescheduleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, color: P.onAccent },
  recentlyAddedDot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF', zIndex: 10 },
  actionBadge: { position: 'absolute', bottom: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, zIndex: 2, borderWidth: 1.5, borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF' },
  actionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', lineHeight: 13 },
});
