import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import Icon from '../../components/IconLibrary';
import {
  getClientPointsBalance,
  getClientPointsHistory,
  ClientPointsLedgerEntry,
  ClientPointsReason,
} from '../../services/databaseService';
import { timeAgo } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';

const EARN_WAYS = [
  { icon: 'event-available', label: 'Complete a Booking', points: '+50 pts', desc: 'Every completed appointment', live: true },
  { icon: 'star', label: 'Leave a Review', points: '+20 pts', desc: 'After each booking', live: true },
  { icon: 'emoji-events', label: 'First Booking', points: '+200 pts', desc: 'One-time welcome bonus', live: true },
  { icon: 'cake', label: 'Birthday Bonus', points: '+50 pts', desc: 'On your birthday', live: true },
  { icon: 'person-add', label: 'Refer a Friend', points: '', desc: 'Coming soon', live: false },
];

const REDEEM_WAYS = [
  { icon: 'local-offer', label: '£5 Off a Booking', points: '500 pts' },
  { icon: 'card-giftcard', label: 'Gift a Provider', points: '300 pts' },
  { icon: 'loyalty', label: 'Upgrade Trial', points: '1,000 pts' },
];

const REASON_LABEL: Record<ClientPointsReason, string> = {
  booking_completed: 'Completed a booking',
  review_left: 'Left a review',
  first_booking: 'First booking bonus',
  birthday_bonus: 'Birthday bonus',
};

export default function PointsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<ClientPointsLedgerEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          setLoading(true);
          const [balanceResult, historyResult] = await Promise.all([
            getClientPointsBalance(),
            getClientPointsHistory(),
          ]);
          if (cancelled) return;
          setBalance(balanceResult);
          setHistory(historyResult);
          setLoadError(false);
        } catch (error) {
          if (cancelled) return;
          logger.error('Failed to load points balance/history:', error);
          setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      load();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Rewards</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          Earn points for every booking and interaction
        </Text>

        {/* Balance card */}
        <View style={[styles.balanceCard, {
          backgroundColor: P.accentDim,
          borderColor: P.border,
        }]}>
          <Text style={[styles.balanceLabel, { color: P.accentText }]}>YOUR BALANCE</Text>
          {loading ? (
            <ActivityIndicator color={P.accentText} style={{ marginVertical: 14 }} />
          ) : (
            <Text style={[styles.balanceNum, { color: P.text }]}>{balance.toLocaleString()}</Text>
          )}
          {!loading && <Text style={[styles.balancePts, { color: P.accentText }]}>points</Text>}
          <Text style={[styles.balanceHint, { color: P.sub }]}>
            {loadError
              ? "Couldn't load your balance — pull to refresh in a moment"
              : !loading && balance === 0
                ? 'Make your first booking to start earning'
                : ' '}
          </Text>
        </View>

        {/* How to earn */}
        <Text style={[styles.section, { color: P.accentText }]}>HOW TO EARN</Text>
        {EARN_WAYS.map(way => (
          <View
            key={way.label}
            style={[styles.row, { backgroundColor: P.card, borderColor: P.border, opacity: way.live ? 1 : 0.55 }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: P.iconBg }]}>
              <Icon name={way.icon} size={20} color={P.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: P.text }]}>{way.label}</Text>
              <Text style={[styles.rowDesc, { color: P.sub }]}>{way.desc}</Text>
            </View>
            {way.live && <Text style={[styles.pts, { color: P.accentText }]}>{way.points}</Text>}
          </View>
        ))}

        {/* Recent activity */}
        <Text style={[styles.section, { color: P.accentText, marginTop: 24 }]}>RECENT ACTIVITY</Text>
        {history.length === 0 ? (
          <Text style={[styles.rowDesc, { color: P.sub, marginBottom: 8 }]}>
            {loadError ? 'Couldn’t load your activity right now.' : 'No activity yet.'}
          </Text>
        ) : (
          history.map(entry => (
            <View key={entry.id} style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: P.text }]}>{REASON_LABEL[entry.reason]}</Text>
                <Text style={[styles.rowDesc, { color: P.sub }]}>{timeAgo(entry.created_at)}</Text>
              </View>
              <Text style={[styles.pts, { color: P.accentText }]}>+{entry.delta} pts</Text>
            </View>
          ))
        )}

        {/* How to redeem */}
        <Text style={[styles.section, { color: P.accentText, marginTop: 24 }]}>REDEEM POINTS · COMING SOON</Text>
        {REDEEM_WAYS.map(way => (
          <View key={way.label} style={[styles.row, { backgroundColor: P.card, borderColor: P.border, opacity: 0.55 }]}>
            <View style={[styles.iconWrap, { backgroundColor: P.iconBg }]}>
              <Icon name={way.icon} size={20} color={P.accentText} />
            </View>
            <Text style={[styles.rowLabel, { color: P.text, flex: 1 }]}>{way.label}</Text>
            <Text style={[styles.pts, { color: P.sub }]}>{way.points}</Text>
          </View>
        ))}

        <Text style={[styles.note, { color: P.sub }]}>
          Points never expire while your account is active. Redeeming points and referral bonuses aren't live yet — earning is.
        </Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  balanceCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 28,
    gap: 4,
  },
  balanceLabel: { fontSize: 11, letterSpacing: 2 },
  balanceNum: { fontSize: 52, letterSpacing: 2, lineHeight: 60 },
  balancePts: { fontSize: 14, letterSpacing: 1 },
  balanceHint: { fontSize: 12, marginTop: 6 },
  section: { fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowDesc: { fontSize: 11, marginTop: 2 },
  pts: { fontSize: 13, letterSpacing: 0.5 },
  note: {
    
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 24,
  },
});
