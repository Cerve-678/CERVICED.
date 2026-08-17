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
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import Icon from '../../components/IconLibrary';

const PLAN_FEATURES = [
  'Unlimited bookings',
  'Priority provider matching',
  'Exclusive member discounts',
  'Early access to new providers',
  'Monthly beauty box discount',
];

export default function SubscriptionScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

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

        <Text style={[styles.title, { color: P.text }]}>Subscription</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          Your plan and billing information
        </Text>

        {/* Current plan */}
        <View style={[styles.planCard, {
          backgroundColor: P.accentDim,
          borderColor: P.border,
        }]}>
          <View style={styles.planTop}>
            <Icon name="star" size={22} color={P.accentText} />
            <Text style={[styles.planName, { color: P.accentText }]}>Free Plan</Text>
          </View>
          <Text style={[styles.planDesc, { color: P.sub }]}>
            You're currently on the free plan. Upgrade to unlock premium features.
          </Text>
        </View>

        {/* Premium teaser */}
        <Text style={[styles.sectionLabel, { color: P.text }]}>CERVICED PREMIUM</Text>
        <Text style={[styles.comingSoonBadge, { color: P.accentText }]}>Coming Soon</Text>
        <View style={styles.featureList}>
          {PLAN_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Icon name="shield-check" size={16} color={P.accentText} />
              <Text style={[styles.featureText, { color: P.sub }]}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.notifyBtn, { backgroundColor: P.accent }]}
          onPress={() => Haptics.selectionAsync().catch(() => {})}
          activeOpacity={0.8}
        >
          <Text style={[styles.notifyText, { color: P.onAccent }]}>NOTIFY ME WHEN AVAILABLE</Text>
        </TouchableOpacity>
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
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  planCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 28,
    gap: 8,
  },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 1 },
  planDesc: { fontSize: 13, lineHeight: 19 },
  sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 2, marginBottom: 4 },
  comingSoonBadge: { fontSize: 12, letterSpacing: 1, marginBottom: 16 },
  featureList: { gap: 12, marginBottom: 28 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14 },
  notifyBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
  },
  notifyText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1, color: '#fff' },
});
