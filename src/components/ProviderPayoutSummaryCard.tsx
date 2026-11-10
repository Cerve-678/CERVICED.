// ProviderPayoutSummaryCard.tsx
// The provider's money at a glance on their own My Profile dashboard: what's
// in Stripe now, what's held until appointments pass, and the next transfer
// to their bank. A summary only — PaymentsScreen (ProviderStripePayments)
// owns the detail, onboarding and refunds, so the whole card links there.
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  getProviderFinance,
  getProviderPayouts,
  type ProviderFinance,
  type ProviderPayout,
} from '../services/providerPaymentService';
import { logger } from '../utils/logger';

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
  new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

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
      void Promise.allSettled([getProviderFinance(), getProviderPayouts()]).then(([f, p]) => {
        if (current !== sequence.current) return;
        if (f.status === 'fulfilled') setFinance(f.value);
        else logger.error('[PayoutSummary] finance load failed:', f.reason);
        if (p.status === 'fulfilled') setPayouts(p.value);
        else logger.error('[PayoutSummary] payouts load failed:', p.reason);
        setFailed(f.status === 'rejected' && p.status === 'rejected');
        setLoaded(true);
      });
    }, []),
  );

  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onOpenPayments();
  }, [onOpenPayments]);

  const connected = finance?.connected ?? null;
  const held = (payouts ?? []).filter(p => p.status === 'held');
  const heldTotal = total(held.map(p => ({ amount: p.payout_amount, currency: p.currency })));
  const nextPayout = finance?.payouts
    .filter(p => p.status === 'pending' || p.status === 'in_transit')
    .sort((a, b) => a.arrivalDate - b.arrivalDate)[0];

  let body: React.ReactNode;
  if (!loaded) {
    body = <Text style={[styles.note, { color: subTextColor }]}>Checking your payouts…</Text>;
  } else if (failed) {
    body = <Text style={[styles.note, { color: subTextColor }]}>Payouts couldn't load. Tap to open Payments.</Text>;
  } else if (connected === false) {
    body = (
      <>
        <Text style={[styles.headline, { color: textColor }]}>Set up payouts</Text>
        <Text style={[styles.note, { color: subTextColor }]}>
          Connect a bank account through Stripe to get paid for online bookings.
        </Text>
      </>
    );
  } else {
    body = (
      <>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: subTextColor }]}>IN STRIPE</Text>
            <Text style={[styles.statValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {finance ? total(finance.available) : '—'}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: subTextColor }]}>HELD</Text>
            <Text style={[styles.statValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {payouts ? heldTotal : '—'}
            </Text>
          </View>
        </View>
        <Text style={[styles.note, { color: subTextColor }]}>
          {nextPayout
            ? `Next to your bank: ${money(nextPayout.amount, nextPayout.currency)}, expected ${arrival(nextPayout.arrivalDate)}`
            : held.length > 0
              ? `${held.length} booking payment${held.length === 1 ? '' : 's'} release after the appointment.`
              : 'No payout on its way right now.'}
        </Text>
        {finance && !finance.livemode && (
          <Text style={[styles.testMode, { color: subTextColor }]}>Test mode · no real money moves</Text>
        )}
      </>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Payouts. Open Payments."
    >
      <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="wallet-outline" size={15} color={accentColor} />
            <Text style={[styles.title, { color: textColor }]}>Payouts</Text>
          </View>
          <View style={[styles.chip, { borderColor }]}>
            <Text style={[styles.chipText, { color: accentColor }]}>VIEW</Text>
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
