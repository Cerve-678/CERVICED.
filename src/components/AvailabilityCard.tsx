// AvailabilityCard.tsx
// Live availability on both profile screens — the provider's own
// (ProviderMyProfileScreen) and the client-facing one (ProviderProfileScreen).
//
// Replaces the hand-typed `slots_text` field, which was a static string a
// provider set once and which drifted out of date immediately. Everything
// rendered here comes from AvailabilityService.getAvailabilitySummary(),
// derived from the same records that actually govern booking.
//
// ONE component for both audiences on purpose: the two profile screens are
// meant to stay visually in sync, and a duplicated card is exactly how they
// would drift. The only difference is `onEditSchedule` — passed on the
// provider's own profile to surface an edit affordance, omitted for clients.
// This card never edits availability itself; ProviderScheduleScreen owns that.
import React, { useCallback, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { AvailabilityDayState, AvailabilitySummary } from '../services/AvailabilityService';

export interface AvailabilityCardProps {
  summary: AvailabilitySummary | null;
  /** True while the summary is still loading — renders a quiet placeholder. */
  loading?: boolean;
  cardBg: string;
  blurIntensity: number;
  blurTint: 'light' | 'dark';
  borderColor: string;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  /** Provider's own profile only. Omit for client-facing use. */
  onEditSchedule?: (() => void) | undefined;
  /**
   * Client-facing only: the "notify me about availability" toggle that used
   * to sit inside the old slots pill. Kept here so replacing that pill
   * doesn't quietly remove a working feature. Omit on the provider's own
   * profile — a provider doesn't subscribe to their own availability.
   */
  onToggleNotifications?: (() => void) | undefined;
  notificationsEnabled?: boolean;
}

// Dot colours are the semantic status palette, deliberately NOT the provider's
// accent: these encode meaning (open/away/full), so they must stay legible and
// consistent no matter which accent a provider picks for their theme.
const STATE_DOT: Record<AvailabilityDayState, string> = {
  open:    '#34C759',
  full:    '#FF9F0A',
  blocked: '#FF453A',
  closed:  'rgba(126,102,103,0.35)',
};

const STATE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  open:        'checkmark-circle',
  full:        'time',
  blocked:     'airplane',
  closed:      'moon',
  unpublished: 'calendar-outline',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// State meanings differ by audience: without booking visibility the dots show
// opening hours only, so a client must not hear "free".
const STATE_WORDS: Record<AvailabilityDayState, string> = {
  open:    'open',
  full:    'fully booked',
  blocked: 'away',
  closed:  'closed',
};

const DayDot: React.FC<{
  label: string;
  dayOfWeek: number;
  state: AvailabilityDayState;
  isToday: boolean;
  subTextColor: string;
  textColor: string;
}> = React.memo(({ label, dayOfWeek, state, isToday, subTextColor, textColor }) => (
  <View
    style={styles.dayCell}
    accessible
    accessibilityLabel={`${isToday ? 'Today' : DAY_NAMES[dayOfWeek] ?? ''}: ${STATE_WORDS[state]}`}
  >
    <Text
      style={[
        styles.dayLabel,
        { color: isToday ? textColor : subTextColor },
        isToday && styles.dayLabelToday,
      ]}
      importantForAccessibility="no"
    >
      {label}
    </Text>
    <View
      style={[styles.dot, { backgroundColor: STATE_DOT[state] }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  </View>
));
DayDot.displayName = 'DayDot';

const AvailabilityCard: React.FC<AvailabilityCardProps> = React.memo(
  ({
    summary,
    loading = false,
    cardBg,
    blurIntensity,
    blurTint,
    borderColor,
    textColor,
    subTextColor,
    accentColor,
    onEditSchedule,
    onToggleNotifications,
    notificationsEnabled = false,
  }) => {
    const pressAnimatedValue = useRef(new Animated.Value(1)).current;

    const handlePressIn = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 0.97,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }, [pressAnimatedValue]);

    const handlePressOut = useCallback(() => {
      Animated.spring(pressAnimatedValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }, [pressAnimatedValue]);

    // Activation lives on onPress, not onPressOut: onPressOut also fires when
    // a touch turns into a scroll, and this card sits inside a ScrollView on
    // both screens.
    const handlePress = useCallback(() => {
      Haptics.selectionAsync().catch(() => {});
      onEditSchedule?.();
    }, [onEditSchedule]);

    const animatedStyle = useMemo(
      () => ({ transform: [{ scale: pressAnimatedValue }] }),
      [pressAnimatedValue],
    );

    const highlightColors = useMemo(
      () => [
        blurTint === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.30)',
        'transparent',
      ] as [string, string],
      [blurTint],
    );

    // Nothing to show rather than a misleading "closed": a failed or pending
    // fetch must not read as a factual claim about the provider's schedule.
    if (loading || !summary) {
      if (!loading) return null;
      return (
        <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.headline, { color: subTextColor }]}>Checking availability…</Text>
        </BlurView>
      );
    }

    const dotColor = summary.state === 'unpublished' ? STATE_DOT['closed'] : STATE_DOT[summary.state];

    const body = (
      <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <LinearGradient
          colors={highlightColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.cardHighlight}
        />

        <View style={styles.headerRow}>
          <View style={styles.headlineWrap}>
            <Ionicons
              name={STATE_ICON[summary.state] ?? 'calendar-outline'}
              size={15}
              color={dotColor}
            />
            <Text style={[styles.headline, { color: textColor }]} numberOfLines={1}>
              {summary.headline}
            </Text>
          </View>
          {onEditSchedule && (
            <View style={[styles.editChip, { borderColor }]}>
              <Text style={[styles.editChipText, { color: accentColor }]}>EDIT</Text>
              <Ionicons name="chevron-forward" size={11} color={accentColor} />
            </View>
          )}
          {onToggleNotifications && (
            <TouchableOpacity
              style={styles.bellButton}
              onPress={onToggleNotifications}
              activeOpacity={0.65}
              accessibilityLabel="Notify me about availability"
              accessibilityRole="button"
              accessibilityState={{ selected: notificationsEnabled }}
            >
              <Ionicons
                name={notificationsEnabled ? 'notifications' : 'notifications-outline'}
                size={16}
                color={notificationsEnabled ? '#34C759' : subTextColor}
              />
            </TouchableOpacity>
          )}
        </View>

        {summary.detail && (
          <Text style={[styles.detail, { color: subTextColor }]} numberOfLines={1}>
            {summary.detail}
          </Text>
        )}

        {summary.days.length > 0 && (
          <View style={styles.strip}>
            {summary.days.map((day, index) => (
              <DayDot
                key={day.date}
                label={day.label}
                dayOfWeek={day.dayOfWeek}
                state={day.state}
                isToday={index === 0}
                subTextColor={subTextColor}
                textColor={textColor}
              />
            ))}
          </View>
        )}
      </BlurView>
    );

    // Only the provider's own card is wrapped in a press target. That wrapper
    // would swallow taps on the client's bell, so the two props must never be
    // passed together — they're per-audience by design, not combinable.
    if (!onEditSchedule) return body;

    return (
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={`${summary.headline}. Edit your schedule.`}
      >
        <Animated.View style={animatedStyle}>{body}</Animated.View>
      </TouchableOpacity>
    );
  },
);

AvailabilityCard.displayName = 'AvailabilityCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  headline: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  detail: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    marginTop: 4,
    marginLeft: 22,
    letterSpacing: -0.1,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  dayCell: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  dayLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
  },
  dayLabelToday: {
    // BakbakOne ships a single weight, so "today" is marked by full-strength
    // color (set inline) rather than a heavier face.
    opacity: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  editChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  bellButton: {
    padding: 4,
    borderRadius: 12,
  },
});

export default AvailabilityCard;
