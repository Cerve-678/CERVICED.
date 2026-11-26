// ProviderPayoutSummaryCard.tsx
// The provider's money at a glance on their own My Profile dashboard. With a
// payout schedule it shows "Your paydays": the next three, each with the
// booking payments and tips expected in it (user, 2026-11-18). Without one
// (manual, unreadable, or nothing on its way) it falls back to what's in
// Stripe now, what's processing, and the next transfer to their bank.
// A summary only — PaymentsScreen (ProviderStripePayments) owns the detail,
// onboarding and refunds, so VIEW links there.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  getPayoutSchedule,
  getProviderFinance,
  getProviderPayouts,
  getProviderTipEarnings,
  type ProviderFinance,
  type ProviderPayout,
  type ProviderTipEarning,
} from '../services/providerPaymentService';
import type { PayoutSchedule } from '../constants/payoutSchedule';
import { isDarkColor } from '../constants/providerThemes';
import { paydayLabel, upcomingPaydays } from '../features/payments/paydayForecast';
import { logger } from '../utils/logger';
import { useTranslation, localeForLanguage } from '../i18n';

/** Booking lines shown under the picked payday before "and N more". */
const MAX_PAYDAY_LINES = 5;

export interface ProviderPayoutSummaryCardProps {
  cardBg: string;
  blurIntensity: number;
  blurTint: 'light' | 'dark';
  borderColor: string;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  onOpenPayments: () => void;
}

const money = (pence: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);

/** Sum per currency; a provider is almost always single-currency (GBP). */
const total = (rows: { amount: number; currency: string }[]): string => {
  if (rows.length === 0) return money(0, 'gbp');
  const byCurrency = new Map<string, number>();
  for (const row of rows) byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.amount);
  return Array.from(byCurrency, ([currency, amount]) => money(amount, currency)).join(' + ');
};

const arrival = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString(localeForLanguage(), { weekday: 'short', day: 'numeric', month: 'short' });

const ProviderPayoutSummaryCard: React.FC<ProviderPayoutSummaryCardProps> = ({
  cardBg,
  blurIntensity,
  blurTint,
  borderColor,
  textColor,
  subTextColor,
  accentColor,
  onOpenPayments,
}) => {
  const [finance, setFinance] = useState<ProviderFinance | null>(null);
  const [payouts, setPayouts] = useState<ProviderPayout[] | null>(null);
  const [tips, setTips] = useState<ProviderTipEarning[]>([]);
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const { t, tp } = useTranslation();

  // Refreshed on every focus, but behind what's already shown — the
  // placeholder is for the very first load only, so returning to My Profile
  // never blanks the card.
  // getProviderFinance is a Stripe round trip through an edge function, so
  // tabbing in and out doesn't re-ask more than once a minute.
  const lastLoadedAt = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAt.current < 60_000) return;
      lastLoadedAt.current = Date.now();
      const current = ++sequence.current;
      void Promise.allSettled([
        getProviderFinance(), getProviderPayouts(), getProviderTipEarnings(), getPayoutSchedule(),
      ]).then(([f, p, t, s]) => {
        if (current !== sequence.current) return;
        if (f.status === 'fulfilled') setFinance(f.value);
        else logger.error('[PayoutSummary] finance load failed:', f.reason);
        if (p.status === 'fulfilled') setPayouts(p.value);
        else logger.error('[PayoutSummary] payouts load failed:', p.reason);
        // Tips and the schedule only add the paydays view; without them the
        // card falls back to the totals.
        if (t.status === 'fulfilled') setTips(t.value);
        else logger.error('[PayoutSummary] tips load failed:', t.reason);
        if (s.status === 'fulfilled') setSchedule(s.value);
        else logger.error('[PayoutSummary] schedule load failed:', s.reason);
        setFailed(f.status === 'rejected' && p.status === 'rejected');
        setLoaded(true);
      });
    }, []),
  );

  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onOpenPayments();
  }, [onOpenPayments]);

  const paydays = useMemo(
    () => (schedule && payouts ? upcomingPaydays({ payouts, tips, schedule, now: new Date() }) : []),
    [schedule, payouts, tips],
  );
  const picked = paydays.find(day => day.key === pickedDay) ?? paydays[0] ?? null;
  const onAccent = isDarkColor(accentColor) ? '#FFFFFF' : '#1A1815';

  const connected = finance?.connected ?? null;
  const held = (payouts ?? []).filter(p => p.status === 'held');
  const heldTotal = total(held.map(p => ({ amount: p.payout_amount, currency: p.currency })));
  const nextPayout = finance?.payouts
    .filter(p => p.status === 'pending' || p.status === 'in_transit')
    .sort((a, b) => a.arrivalDate - b.arrivalDate)[0];

  if (loaded && connected !== false && picked) {
    const lines = picked.items.slice(0, MAX_PAYDAY_LINES);
    const more = picked.items.length - lines.length;
    return (
      <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Your paydays. Open Payments."
          style={styles.headerRow}
        >
          <View style={styles.titleWrap}>
            <Ionicons name="wallet-outline" size={15} color={accentColor} />
            <Text style={[styles.title, { color: textColor }]}>Your paydays</Text>
          </View>
          <View style={[styles.chip, { borderColor }]}>
            <Text style={[styles.chipText, { color: accentColor }]}>{t('providerBusiness.payoutCard.view')}</Text>
            <Ionicons name="chevron-forward" size={11} color={accentColor} />
          </View>
        </TouchableOpacity>

        <View style={styles.days}>
          {paydays.map(day => {
            const on = day.key === picked.key;
            const count = day.items.length;
            const label = paydayLabel(day.date);
            return (
              <TouchableOpacity
                key={day.key}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setPickedDay(day.key); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label}, ${money(day.totalPence, 'gbp')}, ${count} payment${count === 1 ? '' : 's'}`}
                style={[styles.day, on ? { backgroundColor: accentColor, borderColor: accentColor } : { borderColor }]}
              >
                <Text style={[styles.dayLabel, { color: on ? onAccent : subTextColor }]} numberOfLines={1}>{label.toUpperCase()}</Text>
                <Text style={[styles.dayAmount, { color: on ? onAccent : textColor }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(day.totalPence, 'gbp')}
                </Text>
                <Text style={[styles.dayCount, { color: on ? onAccent : subTextColor }]}>{count} payment{count === 1 ? '' : 's'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.statLabel, { color: subTextColor, marginTop: 10, marginBottom: 0 }]}>
          {`IN YOUR ${paydayLabel(picked.date).toUpperCase()} PAYDAY`}
        </Text>
        {lines.map(item => (
          <View key={item.key} style={[styles.line, { borderTopColor: borderColor }]}>
            <Text style={[styles.lineTitle, { color: textColor }]} numberOfLines={1}>
              {item.title}
              {!!item.detail && <Text style={{ color: subTextColor }}>{` · ${item.detail}`}</Text>}
            </Text>
            <Text style={[styles.lineAmount, { color: textColor }]}>{money(item.pence, 'gbp')}</Text>
          </View>
        ))}
        {more > 0 && (
          <Text style={[styles.note, { color: subTextColor, marginTop: 6 }]}>and {more} more</Text>
        )}
        {finance && !finance.livemode && (
          <Text style={[styles.testMode, { color: subTextColor }]}>{t('providerBusiness.payoutCard.testMode')}</Text>
        )}
      </BlurView>
    );
  }

  let body: React.ReactNode;
  if (!loaded) {
    body = <Text style={[styles.note, { color: subTextColor }]}>{t('providerBusiness.payoutCard.checking')}</Text>;
  } else if (failed) {
    body = <Text style={[styles.note, { color: subTextColor }]}>{t('providerBusiness.payoutCard.loadFailed')}</Text>;
  } else if (connected === false) {
    body = (
      <>
        <Text style={[styles.headline, { color: textColor }]}>{t('providerBusiness.payoutCard.setUp')}</Text>
        <Text style={[styles.note, { color: subTextColor }]}>
          {t('providerBusiness.payoutCard.setUpBody')}
        </Text>
      </>
    );
  } else {
    body = (
      <>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: subTextColor }]}>READY FOR PAYDAY</Text>
            <Text style={[styles.statValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {finance ? total(finance.available) : '—'}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: subTextColor }]}>PROCESSING</Text>
            <Text style={[styles.statValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {payouts ? heldTotal : '—'}
            </Text>
          </View>
        </View>
        <Text style={[styles.note, { color: subTextColor }]}>
          {nextPayout
            ? t('providerBusiness.payoutCard.next', { amount: money(nextPayout.amount, nextPayout.currency), date: arrival(nextPayout.arrivalDate) })
            : held.length > 0
              ? `${held.length} booking payment${held.length === 1 ? '' : 's'} processing.`
              : 'No payout on its way right now.'}
        </Text>
        {finance && !finance.livemode && (
          <Text style={[styles.testMode, { color: subTextColor }]}>{t('providerBusiness.payoutCard.testMode')}</Text>
        )}
      </>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('providerBusiness.payoutCard.a11y')}
    >
      <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="wallet-outline" size={15} color={accentColor} />
            <Text style={[styles.title, { color: textColor }]}>{t('providerBusiness.payoutCard.title')}</Text>
          </View>
          <View style={[styles.chip, { borderColor }]}>
            <Text style={[styles.chipText, { color: accentColor }]}>{t('providerBusiness.payoutCard.view')}</Text>
            <Ionicons name="chevron-forward" size={11} color={accentColor} />
          </View>
        </View>
        {body}
      </BlurView>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  headline: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stat: {
    flex: 1,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 14,
  },
  statLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 20,
  },
  note: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  days: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  day: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  dayLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  dayAmount: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    marginTop: 2,
  },
  dayCount: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 1,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 8,
  },
  lineTitle: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
  },
  lineAmount: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 13,
  },
  testMode: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});

export default ProviderPayoutSummaryCard;
