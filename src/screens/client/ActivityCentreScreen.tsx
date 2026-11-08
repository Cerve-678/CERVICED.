// src/screens/client/ActivityCentreScreen.tsx
//
// The client's Activity Centre as its own page, pushed from the tray button
// at the top right of Bookings and from Settings → For you. It shows the list
// buildClientActivity() makes and opens the right place for each row.
//
// Rows that need the Bookings screen's own popups (a reschedule offer, a
// waitlist hold) go back to Bookings with the same params a notification
// uses, so there is one path for each, not two.

import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ThemedBackground } from '../../components/ThemedBackground';
import { TodoMark } from '../../components/TodoMark';
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { getBookingById } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { useClientActivity } from '../../features/bookings/useClientActivity';
import type { ActivityItem, ActivityKind } from '../../features/bookings/activityCentre';
import type { HomeStackParamList } from '../../navigation/types';

const ICONS: Record<ActivityKind, keyof typeof Ionicons.glyphMap> = {
  fee_to_pay: 'card-outline',
  waitlist_hold: 'time-outline',
  reschedule_pick: 'calendar-outline',
  intake_form: 'create-outline',
  info_pack: 'document-text-outline',
  no_show_dispute: 'alert-circle-outline',
  refund_request: 'return-down-back-outline',
  refund_pending: 'hourglass-outline',
  reschedule_waiting: 'calendar-clear-outline',
  awaiting_confirmation: 'hourglass-outline',
};

// Registered in every client stack that has Bookings; they share these routes.
type Props = { navigation: NativeStackNavigationProp<HomeStackParamList, 'ActivityCentre'> };

export default function ActivityCentreScreen({ navigation }: Props) {
  const { palette: P } = useTheme();
  const bottomGap = useSystemBottomInset() + 24;
  const { showAlert, DialogHost } = useAppDialog();
  const { activity, loaded, failed, refresh } = useClientActivity();
  const [refreshing, setRefreshing] = useState(false);

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

  const renderRow = (item: ActivityItem, needsYou: boolean) => (
    <TouchableOpacity
      key={item.key}
      style={[st.row, { backgroundColor: P.card }]}
      activeOpacity={0.7}
      onPress={() => openItem(item)}
      accessibilityRole="button"
      accessibilityLabel={`${needsYou ? 'Needs you. ' : ''}${item.title}. ${item.detail}`}
    >
      <View style={[st.icon, { backgroundColor: needsYou ? P.accent : P.iconBg }]}>
        <Ionicons name={ICONS[item.kind]} size={20} color={needsYou ? P.onAccent : P.accentText} />
      </View>
      <View style={st.rowText}>
        <Text style={[st.rowTitle, { color: P.text }]}>{item.title}</Text>
        <Text style={[st.rowDetail, { color: P.sub }]}>{item.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={P.sub} />
    </TouchableOpacity>
  );

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

        {!loaded && empty ? (
          <ActivityIndicator color={P.accent} style={st.loading} />
        ) : empty ? (
          <View style={st.empty}>
            <Ionicons name="checkmark-circle-outline" size={44} color={P.accentText} />
            <Text style={[st.emptyTitle, { color: P.text }]}>You're all caught up</Text>
            <Text style={[st.emptyBody, { color: P.sub }]}>
              Refunds, reschedules, forms to fill in and anything else to do with your bookings will show up here.
            </Text>
          </View>
        ) : (
          <>
            {activity.needsYou.length > 0 && (
              <View style={st.section}>
                <View style={st.sectionHead}>
                  <Text style={[st.sectionLabel, { color: P.sub }]}>NEEDS YOU</Text>
                  <TodoMark size={15} />
                </View>
                {activity.needsYou.map(item => renderRow(item, true))}
              </View>
            )}
            {activity.inProgress.length > 0 && (
              <View style={st.section}>
                <View style={st.sectionHead}>
                  <Text style={[st.sectionLabel, { color: P.sub }]}>IN PROGRESS</Text>
                </View>
                {activity.inProgress.map(item => renderRow(item, false))}
              </View>
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
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  notice: { fontSize: 13, marginBottom: 16 },
  loading: { marginVertical: 48 },
  section: { gap: 10, marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
