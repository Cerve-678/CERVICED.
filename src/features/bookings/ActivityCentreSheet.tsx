// src/features/bookings/ActivityCentreSheet.tsx
//
// The bottom sheet behind the Activity Centre button at the top right of
// Bookings. It only shows the list buildClientActivity() made and hands each
// tap back to the screen, which knows how to open the right place.

import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../constants/theme';
import { TodoMark } from '../../components/TodoMark';
import type { ActivityItem, ActivityKind, ClientActivity } from './activityCentre';

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

interface Props {
  visible: boolean;
  onClose: () => void;
  activity: ClientActivity;
  /** True until the first load finishes, so an empty list isn't shown as "all caught up" too early. */
  loading: boolean;
  /** Set when the last load failed; the list then shows what it last had. */
  failed: boolean;
  onOpenItem: (item: ActivityItem) => void;
  P: AppTheme;
  isDarkMode: boolean;
  bottomGap: number;
}

export function ActivityCentreSheet({ visible, onClose, activity, loading, failed, onOpenItem, P, isDarkMode, bottomGap }: Props) {
  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
  };
  const empty = activity.needsYou.length === 0 && activity.inProgress.length === 0;

  const renderRow = (item: ActivityItem, needsYou: boolean) => (
    <TouchableOpacity
      key={item.key}
      style={[st.row, { backgroundColor: P.surface }]}
      activeOpacity={0.7}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onOpenItem(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${needsYou ? 'Needs you. ' : ''}${item.title}. ${item.detail}`}
    >
      <View style={[st.icon, { backgroundColor: needsYou ? P.accent : P.iconBg }]}>
        <Ionicons name={ICONS[item.kind]} size={19} color={needsYou ? P.onAccent : P.accentText} />
      </View>
      <View style={st.rowText}>
        <Text style={[st.rowTitle, { color: P.text }]}>{item.title}</Text>
        <Text style={[st.rowDetail, { color: P.sub }]}>{item.detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={P.sub} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={close}>
        <Pressable style={[st.sheet, { backgroundColor: P.card, paddingBottom: Math.max(32, bottomGap) }]} onPress={e => e.stopPropagation()}>
          <View style={[st.handle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]} />
          <Text style={[st.title, { color: P.text }]}>Activity Centre</Text>
          <Text style={[st.subtitle, { color: P.sub }]}>What's waiting on you, and what you're waiting on</Text>

          {failed && (
            <Text style={[st.notice, { color: P.sub }]}>Couldn't check for updates just now. Pull down on Bookings to try again.</Text>
          )}

          {loading && empty ? (
            <ActivityIndicator color={P.accent} style={st.loading} />
          ) : empty ? (
            <View style={st.empty}>
              <Ionicons name="checkmark-circle-outline" size={36} color={P.accentText} />
              <Text style={[st.emptyTitle, { color: P.text }]}>You're all caught up</Text>
              <Text style={[st.emptyBody, { color: P.sub }]}>
                Refunds, reschedules, forms to fill in and anything else to do with your bookings will show up here.
              </Text>
            </View>
          ) : (
            <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
              {activity.needsYou.length > 0 && (
                <>
                  <View style={st.sectionHead}>
                    <Text style={[st.sectionLabel, { color: P.sub }]}>NEEDS YOU</Text>
                    <TodoMark size={15} />
                  </View>
                  {activity.needsYou.map(item => renderRow(item, true))}
                </>
              )}
              {activity.inProgress.length > 0 && (
                <>
                  <View style={st.sectionHead}>
                    <Text style={[st.sectionLabel, { color: P.sub }]}>IN PROGRESS</Text>
                  </View>
                  {activity.inProgress.map(item => renderRow(item, false))}
                </>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, maxHeight: '85%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 20, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  notice: { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  loading: { marginVertical: 32 },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
