import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BookingStatus } from '../../contexts/BookingContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatBookingDate } from './presentation';
import type { BookingCardProps } from './presentationTypes';

/**
 * Presentation-only card for a booking in the client's booking lists.
 * Data loading and navigation remain owned by the screen that renders it.
 */
export const BookingCard = React.memo<BookingCardProps>(
  ({ booking, onPress, isHighlighted = false, isRecentlyAdded = false, actionCount = 0, rowHasTag = false }) => {
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

    const handlePress = useCallback(() => {
      onPress(booking);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [booking, onPress]);

    return (
      <View style={styles.wrapper}>
        <Pressable onPress={handlePress}>
          <Animated.View style={[styles.card, { borderColor: highlightBorderColor, backgroundColor: highlightBackgroundColor }]}>
            <View style={styles.imageWrapper}>
              {booking.providerImage ? (
                <Image source={typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage} style={styles.logo} resizeMode="cover" fadeDuration={0} />
              ) : (
                <View style={[styles.logo, styles.fallbackLogo, { backgroundColor: P.accent }]}>
                  <Text style={[styles.fallbackLogoText, { color: P.onAccent }]}>
                    {booking.providerName?.split(' ').map((word: string) => word[0]).slice(0, 2).join('').toUpperCase() || 'P'}
                  </Text>
                </View>
              )}
              {showStatusBadge && <View style={[styles.statusDot, { backgroundColor: badgeColor }]} accessible accessibilityLabel={badgeText} />}
              {isRecentlyAdded && booking.status === BookingStatus.UPCOMING && <View style={styles.recentlyAddedDot} />}
            </View>
            <View style={rowHasTag ? styles.infoTall : styles.info}>
              <Text style={styles.providerName} numberOfLines={1}>{booking.providerName}</Text>
              <Text style={styles.serviceName} numberOfLines={1}>{booking.serviceName}</Text>
              {(booking.addOns?.length ?? 0) > 0 && (
                <View style={styles.addOnPill}>
                  <Text style={styles.addOnPillText}>+ {booking.addOns!.length} add-on{booking.addOns!.length === 1 ? '' : 's'}</Text>
                </View>
              )}
              <View style={styles.appointmentTime}>
                <Text style={styles.appointmentDate}>{formatBookingDate(booking.bookingDate)}</Text>
                <Text style={styles.appointmentTimeText}>{booking.bookingTime}</Text>
              </View>
              {booking.isPendingReschedule ? (
                <View style={[styles.rescheduleBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.rescheduleBadgeText} numberOfLines={1}>
                    {badgeText === 'AVAILABLE' ? 'Reschedule Available' : 'Reschedule Pending'}
                  </Text>
                </View>
              ) : rowHasTag ? <View style={styles.rescheduleBadgeSpacer} /> : null}
            </View>
            {actionCount > 0 && booking.status !== BookingStatus.CANCELLED && (
              <View style={styles.actionBadge}><Text style={styles.actionBadgeText}>!</Text></View>
            )}
          </Animated.View>
        </Pressable>
      </View>
    );
  },
);

BookingCard.displayName = 'BookingCard';

const createStyles = (isDarkMode: boolean, P: ReturnType<typeof useTheme>['palette']) => StyleSheet.create({
  wrapper: { marginRight: 4 },
  card: { width: 156, borderRadius: 15, overflow: 'hidden', borderWidth: 1 },
  logo: { width: '100%', height: 92, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: P.surface },
  fallbackLogo: { alignItems: 'center', justifyContent: 'center' },
  fallbackLogoText: { fontSize: 18, fontWeight: '800' },
  imageWrapper: { position: 'relative', overflow: 'hidden', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  info: { padding: 9, height: 96 },
  infoTall: { padding: 9, height: 118 },
  providerName: { fontSize: 12, fontWeight: 'bold', color: P.text, marginBottom: 2 },
  serviceName: { fontSize: 11, color: P.sub, marginBottom: 3 },
  addOnPill: { alignSelf: 'flex-start', backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 3 },
  addOnPillText: { fontSize: 9, color: P.sub, letterSpacing: 0.2 },
  appointmentTime: { marginTop: 4, alignItems: 'flex-start', marginBottom: 20 },
  appointmentDate: { fontSize: 11, fontWeight: '600', color: P.text },
  appointmentTimeText: { fontSize: 10, color: P.sub },
  rescheduleBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 6 },
  rescheduleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, color: P.onAccent },
  rescheduleBadgeSpacer: { height: 24 },
  recentlyAddedDot: { position: 'absolute', top: 2, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF', zIndex: 10 },
  statusDot: { position: 'absolute', top: 6, left: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF', zIndex: 10 },
  actionBadge: { position: 'absolute', bottom: 6, right: 6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, zIndex: 2, borderWidth: 1.5, borderColor: '#fff' },
  actionBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 },
});
