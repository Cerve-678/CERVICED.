import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import Icon from '../components/IconLibrary';

const EARN_WAYS = [
  { icon: 'event-available', label: 'Complete a Booking', points: '+50 pts', desc: 'Every completed appointment' },
  { icon: 'star', label: 'Leave a Review', points: '+20 pts', desc: 'After each booking' },
  { icon: 'person-add', label: 'Refer a Friend', points: '+100 pts', desc: 'When they make their first booking' },
  { icon: 'emoji-events', label: 'First Booking', points: '+200 pts', desc: 'One-time welcome bonus' },
  { icon: 'cake', label: 'Birthday Bonus', points: '+50 pts', desc: 'On your birthday month' },
];

const REDEEM_WAYS = [
  { icon: 'local-offer', label: '£5 Off a Booking', points: '500 pts' },
  { icon: 'card-giftcard', label: 'Gift a Provider', points: '300 pts' },
  { icon: 'loyalty', label: 'Upgrade Trial', points: '1,000 pts' },
];

export default function PointsScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  const balance = 0;

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
          <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.text }]}>Rewards</Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          Earn points for every booking and interaction
        </Text>

        {/* Balance card */}
        <View style={[styles.balanceCard, {
          backgroundColor: isDarkMode ? 'rgba(175,145,151,0.15)' : 'rgba(175,145,151,0.08)',
          borderColor: 'rgba(175,145,151,0.3)',
        }]}>
          <Text style={[styles.balanceLabel, { color: theme.accent }]}>YOUR BALANCE</Text>
          <Text style={[styles.balanceNum, { color: theme.text }]}>{balance.toLocaleString()}</Text>
          <Text style={[styles.balancePts, { color: theme.accent }]}>points</Text>
          <Text style={[styles.balanceHint, { color: theme.secondaryText }]}>
            Make your first booking to start earning
          </Text>
        </View>

        {/* How to earn */}
        <Text style={[styles.section, { color: theme.accent }]}>HOW TO EARN</Text>
        {EARN_WAYS.map(way => (
          <View key={way.label} style={[styles.row, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? 'rgba(175,145,151,0.15)' : 'rgba(175,145,151,0.1)' }]}>
              <Icon name={way.icon} size={20} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{way.label}</Text>
              <Text style={[styles.rowDesc, { color: theme.secondaryText }]}>{way.desc}</Text>
            </View>
            <Text style={[styles.pts, { color: theme.accent }]}>{way.points}</Text>
          </View>
        ))}

        {/* How to redeem */}
        <Text style={[styles.section, { color: theme.accent, marginTop: 24 }]}>REDEEM POINTS</Text>
        {REDEEM_WAYS.map(way => (
          <View key={way.label} style={[styles.row, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: isDarkMode ? 'rgba(175,145,151,0.15)' : 'rgba(175,145,151,0.1)' }]}>
              <Icon name={way.icon} size={20} color={theme.accent} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.text, flex: 1 }]}>{way.label}</Text>
            <Text style={[styles.pts, { color: theme.secondaryText }]}>{way.points}</Text>
          </View>
        ))}

        <Text style={[styles.note, { color: theme.secondaryText }]}>
          Points never expire while your account is active. Redemption launches with the full booking system.
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
