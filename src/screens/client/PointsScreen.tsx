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
import { useTranslation, type TranslationKey } from '../../i18n';

// `points` is the number shown in the "+{count} pts" chip; '' hides it.
const EARN_WAYS: { icon: string; labelKey: TranslationKey; points: string; descKey: TranslationKey; live: boolean }[] = [
  { icon: 'event-available', labelKey: 'clientAccount.points.earn.booking', points: '2', descKey: 'clientAccount.points.earn.bookingDesc', live: true },
  { icon: 'star', labelKey: 'clientAccount.points.earn.review', points: '2', descKey: 'clientAccount.points.earn.reviewDesc', live: true },
  { icon: 'auto-awesome', labelKey: 'clientAccount.points.earn.firstReview', points: '50', descKey: 'clientAccount.points.earn.firstReviewDesc', live: true },
  { icon: 'emoji-events', labelKey: 'clientAccount.points.earn.firstBooking', points: '100', descKey: 'clientAccount.points.earn.firstBookingDesc', live: true },
  { icon: 'cake', labelKey: 'clientAccount.points.earn.birthday', points: '50', descKey: 'clientAccount.points.earn.birthdayDesc', live: true },
  { icon: 'person-add', labelKey: 'clientAccount.points.earn.refer', points: '', descKey: 'clientAccount.points.comingSoon', live: false },
];

const REDEEM_WAYS: { icon: string; labelKey: TranslationKey; points: string }[] = [
  { icon: 'local-offer', labelKey: 'clientAccount.points.redeem.fiveOff', points: '500' },
  { icon: 'card-giftcard', labelKey: 'clientAccount.points.redeem.gift', points: '300' },
  { icon: 'loyalty', labelKey: 'clientAccount.points.redeem.trial', points: '1,000' },
];

const REASON_LABEL: Record<ClientPointsReason, TranslationKey> = {
  booking_completed: 'clientAccount.points.reason.bookingCompleted',
  review_left: 'clientAccount.points.reason.reviewLeft',
  first_review: 'clientAccount.points.reason.firstReview',
  first_booking: 'clientAccount.points.reason.firstBooking',
  birthday_bonus: 'clientAccount.points.reason.birthday',
  profile_completed: 'clientAccount.points.reason.profileCompleted',
  returning_client: 'clientAccount.points.reason.returningClient',
};

export default function PointsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
            getClientPointsHistory(5),
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

        <Text style={[styles.title, { color: P.text }]}>{t('clientAccount.points.title')}</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          {t('clientAccount.points.subtitle')}
        </Text>

        {/* Balance card */}
        <View style={[styles.balanceCard, {
          backgroundColor: P.accentDim,
          borderColor: P.border,
        }]}>
          <Text style={[styles.balanceLabel, { color: P.accentText }]}>{t('clientAccount.points.balance').toUpperCase()}</Text>
          {loading ? (
            <ActivityIndicator color={P.accentText} style={{ marginVertical: 14 }} />
          ) : (
            <Text style={[styles.balanceNum, { color: P.text }]}>{balance.toLocaleString()}</Text>
          )}
          {!loading && <Text style={[styles.balancePts, { color: P.accentText }]}>{t('clientAccount.points.pointsUnit')}</Text>}
          <Text style={[styles.balanceHint, { color: P.sub }]}>
            {loadError
              ? t('clientAccount.points.balanceError')
              : !loading && balance === 0
                ? t('clientAccount.points.startEarning')
                : ' '}
          </Text>
        </View>

        {/* How to earn */}
        <Text style={[styles.section, { color: P.accentText }]}>{t('clientAccount.points.howToEarn').toUpperCase()}</Text>
        {EARN_WAYS.map(way => (
          <View
            key={way.labelKey}
            style={[styles.row, { backgroundColor: P.card, borderColor: P.border, opacity: way.live ? 1 : 0.55 }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: P.iconBg }]}>
              <Icon name={way.icon} size={20} color={P.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: P.text }]}>{t(way.labelKey)}</Text>
              <Text style={[styles.rowDesc, { color: P.sub }]}>{t(way.descKey)}</Text>
            </View>
            {way.live && <Text style={[styles.pts, { color: P.accentText }]}>{way.points ? t('clientAccount.points.plusPts', { count: way.points }) : ''}</Text>}
          </View>
        ))}

        {/* Recent activity */}
        <Text style={[styles.section, { color: P.accentText, marginTop: 24 }]}>{t('clientAccount.points.recentActivity').toUpperCase()}</Text>
        {history.length === 0 ? (
          <Text style={[styles.rowDesc, { color: P.sub, marginBottom: 8 }]}>
            {loadError ? t('clientAccount.points.activityError') : t('clientAccount.points.noActivity')}
          </Text>
        ) : (
          history.map(entry => (
            <View key={entry.id} style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: P.text }]}>{t(REASON_LABEL[entry.reason])}</Text>
                <Text style={[styles.rowDesc, { color: P.sub }]}>{timeAgo(entry.created_at)}</Text>
              </View>
              <Text style={[styles.pts, { color: P.accentText }]}>{t('clientAccount.points.plusPts', { count: entry.delta })}</Text>
            </View>
          ))
        )}

        {/* How to redeem */}
        <Text style={[styles.section, { color: P.accentText, marginTop: 24 }]}>{t('clientAccount.points.redeemSoon').toUpperCase()}</Text>
        {REDEEM_WAYS.map(way => (
          <View key={way.labelKey} style={[styles.row, { backgroundColor: P.card, borderColor: P.border, opacity: 0.55 }]}>
            <View style={[styles.iconWrap, { backgroundColor: P.iconBg }]}>
              <Icon name={way.icon} size={20} color={P.accentText} />
            </View>
            <Text style={[styles.rowLabel, { color: P.text, flex: 1 }]}>{t(way.labelKey)}</Text>
            <Text style={[styles.pts, { color: P.sub }]}>{t('clientAccount.points.pts', { count: way.points })}</Text>
          </View>
        ))}

        <Text style={[styles.note, { color: P.sub }]}>
          {t('clientAccount.points.terms')}
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
