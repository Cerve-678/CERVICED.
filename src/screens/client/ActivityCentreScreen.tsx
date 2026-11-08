// src/screens/client/ActivityCentreScreen.tsx
//
// The client's Activity Centre as its own page, pushed from the tray button
// at the top right of Bookings and from Settings → For you. It shows the list
// buildClientActivity() makes, as live tiles under a status pill, and opens
// the right place for each tile.
//
// The tiles hang on a dated line only when the things waiting on the client
// fall on two or more days (activityTimeline); otherwise they're grouped as
// Needs you / In progress.
//
// Tiles that need the Bookings screen's own popups (a reschedule offer, a
// waitlist hold) go back to Bookings with the same params a notification
// uses, so there is one path for each, not two.

import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ThemedBackground } from '../../components/ThemedBackground';
import { TodoMark } from '../../components/TodoMark';
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { getBookingById } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { useClientActivity } from '../../features/bookings/useClientActivity';
import { activityTimeline, type ActivityItem } from '../../features/bookings/activityCentre';
import {
  ActivityTile,
  LiveDot,
  StatusPill,
  TimelineGroup,
  TimelineRail,
  useReduceMotion,
} from '../../features/bookings/ActivityLive';
import type { HomeStackParamList } from '../../navigation/types';

const ALL_CLEAR = 'Nothing waiting. All quiet.';
const PILL_MAX_MESSAGES = 6;

// Registered in every client stack that has Bookings; they share these routes.
type Props = { navigation: NativeStackNavigationProp<HomeStackParamList, 'ActivityCentre'> };

export default function ActivityCentreScreen({ navigation }: Props) {
  const { palette: P } = useTheme();
  const bottomGap = useSystemBottomInset() + 24;
  const { showAlert, DialogHost } = useAppDialog();
  const { activity, loaded, failed, refresh } = useClientActivity();
  const [refreshing, setRefreshing] = useState(false);
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const animate = focused && reduceMotion === false;
  const enter = reduceMotion === false;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitleStyle: { fontFamily: 'BakbakOne-Regular', fontSize: 22, color: P.text },
      headerTintColor: P.text,
    });
  }, [navigation, P.text]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openItem = useCallback((item: ActivityItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const { target } = item;
    if (target.type === 'booking') {
      navigation.navigate('BookingDetail', { bookingId: target.bookingId });
      return;
    }
    if (target.type === 'reschedule') {
      // Same path a reschedule notification takes: Bookings re-reads the
      // request and checks the reschedule is still allowed before the picker.
      navigation.navigate('Bookings', { openBookingId: target.bookingId, openReschedule: true }, { pop: true });
      return;
    }
    // A waitlist hold: check it's still held here, so a lapsed one gets a
    // plain answer instead of Bookings quietly finding nothing to open.
    getBookingById(target.bookingId)
      .then(direct => {
        if (direct?.status === 'on_hold') {
          navigation.navigate('Bookings', { openBookingId: target.bookingId }, { pop: true });
        } else {
          showAlert('This slot has gone', "The hold ran out before it was confirmed, so it's been offered to someone else.");
          void refresh();
        }
      })
      .catch((error: unknown) => {
        logger.error('[ActivityCentre] waitlist hold lookup failed', error);
        showAlert("Couldn't open this", 'Please try again in a moment.');
      });
  }, [navigation, showAlert, refresh]);

  const empty = activity.needsYou.length === 0 && activity.inProgress.length === 0;
  const timeline = useMemo(() => activityTimeline(activity), [activity]);
  const pillMessages = useMemo(() => {
    const lines = [...activity.needsYou, ...activity.inProgress].map(item => item.summary).slice(0, PILL_MAX_MESSAGES);
    return lines.length > 0 ? lines : [ALL_CLEAR];
  }, [activity]);

  // Tiles are numbered down the page so their entrances follow one another.
  let order = 0;
  const tile = (item: ActivityItem) => (
    <ActivityTile key={item.key} item={item} index={order++} animate={animate} enter={enter} onPress={openItem} />
  );

  const sectionHead = (label: string, mark: boolean) => (
    <View style={st.sectionHead}>
      <Text style={[st.sectionLabel, { color: P.sub }]}>{label}</Text>
      {mark && <TodoMark size={15} />}
    </View>
  );

  const renderList = () => {
    if (timeline) {
      return (
        <TimelineRail enter={enter}>
          {timeline.days.map(day => (
            <TimelineGroup key={day.key} label={day.label} isToday={day.isToday} animate={animate}>
              {day.items.map(tile)}
            </TimelineGroup>
          ))}
          {timeline.inProgress.length > 0 && (
            <TimelineGroup label="IN PROGRESS" waiting animate={animate}>
              {timeline.inProgress.map(tile)}
            </TimelineGroup>
          )}
        </TimelineRail>
      );
    }
    return (
      <>
        {activity.needsYou.length > 0 && (
          <View style={st.section}>
            {sectionHead('NEEDS YOU', true)}
            {activity.needsYou.map(tile)}
          </View>
        )}
        {activity.inProgress.length > 0 && (
          <View style={st.section}>
            {sectionHead('IN PROGRESS', false)}
            {activity.inProgress.map(tile)}
          </View>
        )}
      </>
    );
  };

  return (
    <ThemedBackground>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[st.content, { paddingBottom: bottomGap }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
      >
        <Text style={[st.subtitle, { color: P.sub }]}>What's waiting on you, and what you're waiting on</Text>

        {failed && (
          <Text style={[st.notice, { color: P.sub }]}>Couldn't check for updates just now. Pull down to try again.</Text>
        )}

        {(!loaded && empty) || reduceMotion === null ? (
          <ActivityIndicator color={P.accent} style={st.loading} />
        ) : (
          <>
            <StatusPill messages={pillMessages} animate={animate} />
            {empty ? (
              <View style={st.empty}>
                <LiveDot pulse="waiting" animate={animate} size={18} />
                <Text style={[st.emptyTitle, { color: P.text }]}>You're all caught up</Text>
                <Text style={[st.emptyBody, { color: P.sub }]}>
                  Refunds, reschedules, forms to fill in and anything else to do with your bookings will show up here.
                </Text>
              </View>
            ) : (
              renderList()
            )}
          </>
        )}
      </ScrollView>
      <DialogHost />
    </ThemedBackground>
  );
}

const st = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  notice: { fontSize: 13, marginBottom: 16 },
  loading: { marginVertical: 48 },
  section: { marginBottom: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 8, marginHorizontal: 4 },
  sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 10.5, letterSpacing: 1.5 },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, marginTop: 8 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
