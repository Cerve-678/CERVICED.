import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import type { StripeConnectReturn } from '../utils/stripeConnectReturn';
import { PaymentRequestError } from '../utils/paymentRequestError';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Card, useBusinessPalette } from '../features/business-details/BusinessDetailsKit';
import { getProviderFinance, type ProviderFinance, getConnectLink, getConnectStatus, refundProviderBooking, getProviderPayouts, type ConnectStatus, type ProviderPayout } from '../services/providerPaymentService';

const payoutLabels: Record<ProviderPayout['status'], string> = {
  held: 'Awaiting release', transferred: 'Released to Stripe', failed: 'Needs attention',
  cancelled: 'Cancelled', reversed: 'Returned',
};

export default function ProviderStripePayments({ stripeReturn, children }: { stripeReturn?: StripeConnectReturn; children?: React.ReactNode }) {
  const C = useBusinessPalette();
  const [section, setSection] = useState<'overview' | 'bookings' | 'payouts' | 'settings'>('overview');
  const [finance, setFinance] = useState<ProviderFinance | null>(null);
  const [financeError, setFinanceError] = useState('');
  const [moreLoading, setMoreLoading] = useState(false);
  const [account, setAccount] = useState<ConnectStatus | null>(null);
  const [payouts, setPayouts] = useState<ProviderPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const opening = useRef(false);
  const handledReturn = useRef<StripeConnectReturn | undefined>(undefined);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    await Promise.allSettled([
      getProviderFinance().then(data => {
        if (sequence !== loadSequence.current) return;
        setFinance(data); setFinanceError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setFinanceError('Balances and bank payouts could not load. Refresh to try again.');
      }),
      getConnectStatus().then(status => {
        if (sequence !== loadSequence.current) return;
        setAccount(status); setError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setError('We could not check your Stripe account. Refresh to try again.');
      }),
      getProviderPayouts().then(rows => {
        if (sequence !== loadSequence.current) return;
        setPayouts(rows); setPayoutError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setPayoutError('Booking payments could not load. Refresh to try again.');
      }),
    ]);
    if (sequence === loadSequence.current) setLoading(false);
  }, []);
  const loadMore = async () => {
    if (moreLoading || loading || !finance?.hasMore) return;
    const cursor = finance.payouts[finance.payouts.length - 1]?.id;
    if (!cursor) return;
    const sequence = loadSequence.current;
    setMoreLoading(true);
    try {
      const next = await getProviderFinance(cursor);
      if (sequence === loadSequence.current) {
        setFinance(current => current ? { ...next, payouts: [...current.payouts, ...next.payouts.filter(p => !current.payouts.some(existing => existing.id === p.id))] } : next);
        setFinanceError('');
      }
    } catch { if (sequence === loadSequence.current) setFinanceError('Earlier payouts could not load. Please try again.'); }
    finally { setMoreLoading(false); }
  };
  const openStripe = useCallback(async (action: 'onboard' | 'dashboard') => {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError('');
    try {
      const url = await getConnectLink(action);
      if (action === 'dashboard') {
        // System browser sheet supports Stripe authentication without a custom WebView.
        await WebBrowser.openBrowserAsync(url, {
          dismissButtonStyle: 'done',
          toolbarColor: C.bg,
          controlsColor: C.accent,
          showTitle: true,
        });
        await load();
      } else {
        await Linking.openURL(url);
      }
    }
    catch (error) { setError(error instanceof PaymentRequestError ? error.message : 'Stripe could not open. Please try again.'); }
    finally { opening.current = false; setBusy(false); }
  }, [C.bg, C.accent, load]);
  useEffect(() => {
    // Initial async server fetch; loading is already true on the first render.
    void load();
    const app = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { app.remove(); };
  }, [load]);
  useEffect(() => {
    if (!stripeReturn || handledReturn.current === stripeReturn) return;
    handledReturn.current = stripeReturn;
    // Fetch authoritative status; a browser return alone does not mean approval.
    void load();
    // An expired hosted link must be replaced when Stripe redirects back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stripeReturn.result === 'refresh') void openStripe('onboard');
  }, [stripeReturn, load, openStripe]);
  const requestRefund = (row: ProviderPayout) => {
    const share = new Intl.NumberFormat('en-GB', { style: 'currency', currency: row.currency }).format(row.payout_amount / 100);
    Alert.alert('Refund this payment?', `This refunds ${row.booking?.customer_name || 'the client'} in full for ${row.booking?.service_name_snapshot || 'this booking'} and reverses your ${share} share. It does not cancel their appointment.`, [
      { text: 'Keep payment', style: 'cancel' },
      { text: 'Refund payment', style: 'destructive', onPress: async () => {
        if (opening.current) return;
        opening.current = true;
        setBusy(true);
        try {
          const completed = await refundProviderBooking(row.booking_id);
          await load();
          Alert.alert(completed ? 'Refund issued' : 'Refund processing', completed
            ? 'The refund has been issued. Their bank may take a few days to show it.'
            : 'Stripe is processing the refund. Please check again later.');
        } catch {
          setError('We could not confirm the refund. Refresh payment status before trying again.');
        } finally { opening.current = false; setBusy(false); }
      } },
    ]);
  };
  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'bookings', label: 'Booking payments', icon: 'receipt-outline' },
    { key: 'payouts', label: 'Payouts', icon: 'wallet-outline' },
    { key: 'settings', label: 'Payment settings', icon: 'options-outline' },
  ] as const;
  const setupReady = account?.payoutsEnabled;
  const accountTitle = !account ? 'Checking your payout account' : setupReady ? 'Your payout account is connected'
    : account.detailsSubmitted && !account.requirementsDue ? 'Your details are submitted' : 'Set up your payout account';
  const nextPayout = finance?.payouts.filter(p => p.status === 'pending' || p.status === 'in_transit')
    .sort((a, b) => a.arrivalDate - b.arrivalDate)[0];
  return <>
    <View style={styles.intro}>
      <Text style={[styles.eyebrow, { color: C.accentText }]}>YOUR BUSINESS, IN BALANCE</Text>
      <Text style={[styles.description, { color: C.text }]}>A little clarity for every payment.</Text>
      {finance && !finance.livemode && finance.connected && <Text style={[styles.testBadge, { color: C.accentText, backgroundColor: C.surface }]}>Test mode · no real money moves</Text>}
    </View>
    <View style={styles.tabs}>
      {tabs.map(tab => <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: section === tab.key }}
        onPress={() => { void Haptics.selectionAsync().catch(() => {}); setSection(tab.key); }} activeOpacity={0.75}
        style={[styles.tab, { backgroundColor: section === tab.key ? C.accent : C.card, borderColor: C.border }]}>
        <Ionicons name={tab.icon} size={18} color={section === tab.key ? C.bg : C.accentText} />
        <Text style={[styles.tabLabel, { color: section === tab.key ? C.bg : C.text }]}>{tab.label}</Text>
      </TouchableOpacity>)}
    </View>
    <View style={styles.refreshRow}>
      <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: C.sub }]}>{loading ? 'Updating your payments…' : 'Your payment information'}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh all payment information" disabled={loading || busy}
        onPress={() => { setLoading(true); void load(); }} style={styles.refresh}>
        {loading ? <ActivityIndicator size="small" color={C.accentText} /> : <Ionicons name="refresh-outline" size={20} color={C.accentText} />}
      </TouchableOpacity>
    </View>
    {!!error && <Notice text={error} />}
    {(section === 'overview' || section === 'settings') && account && (!setupReady || !!account.requirementsDue || section === 'settings') &&
      <Card title={accountTitle} sub={setupReady ? 'Bank details and verification are managed securely by Stripe.' : 'Finish your details with Stripe so you can receive online booking payments.'}>
        <PaymentAction disabled={busy} label={busy ? 'Opening Stripe…' : setupReady || (account.detailsSubmitted && !account.requirementsDue) ? 'Manage payout account' : 'Continue with Stripe'}
          onPress={() => void openStripe(setupReady || (account.detailsSubmitted && !account.requirementsDue) ? 'dashboard' : 'onboard')} />
        {!!account.requirementsDue && <PaymentAction disabled={busy} label="Update required details" onPress={() => void openStripe('onboard')} secondary />}
      </Card>}

    {section === 'overview' && <>
      {!!financeError && <Notice text={financeError} />}
      <View style={[styles.hero, { backgroundColor: C.accent }]}>
        <View style={styles.row}>
          <Text style={[styles.heroLabel, { color: C.bg }]}>Available in Stripe</Text>
          <Ionicons name="wallet-outline" size={26} color={C.bg} />
        </View>
        <Text style={[styles.heroAmount, { color: C.bg }]}>{finance?.connected ? balances(finance.available) : '—'}</Text>
        <Text style={[styles.heroNote, { color: C.bg }]}>{finance?.connected ? 'Ready for your Stripe payout schedule.' : !finance ? (loading ? 'Checking your Stripe balance…' : 'Balance unavailable. Refresh to try again.') : 'Connect your payout account to see your balance.'}</Text>
        <View style={[styles.heroDivider, { borderColor: C.bg }]} />
        <Text style={[styles.heroLabel, { color: C.bg }]}>Clearing in Stripe</Text>
        <Text style={[styles.heroPending, { color: C.bg }]}>{finance?.connected ? balances(finance.pending) : '—'}</Text>
      </View>
      <Card title="On its way to your bank" sub="An estimated arrival, once Stripe has scheduled a payout.">
        {nextPayout ? <>
          <Text style={[styles.amount, { color: C.text }]}>{money(nextPayout.amount, nextPayout.currency)}</Text>
          <Text style={[styles.description, { color: C.text }]}>Expected {date(nextPayout.arrivalDate * 1000)}</Text>
        </> : <Text style={[styles.description, { color: C.text }]}>{financeError ? 'Payout information is unavailable. Refresh to try again.' : loading ? 'Checking scheduled payouts…' : 'No upcoming payout in your recent Stripe activity.'}</Text>}
        <PaymentAction secondary label="View payouts" disabled={false} onPress={() => setSection('payouts')} />
      </Card>
      <Card title="Recent booking activity" sub="Your latest online booking payments.">
        {!!payoutError && <Notice text={payoutError} />}
        {!loading && !payoutError && payouts.length === 0 && <EmptyState icon="receipt-outline" title="Your first payment starts here" detail="When a client pays online, their booking payment will appear here." />}
        {payouts.slice(0, 3).map(row => <View key={row.id} style={[styles.activity, { borderColor: C.border }]}>
          <View style={{ flex: 1 }}><Text style={[styles.label, { color: C.text }]}>{row.booking?.service_name_snapshot || 'Booking payment'}</Text>
            <Text style={[styles.caption, { color: C.sub }]}>{row.booking?.customer_name || 'Client'} · {payoutLabels[row.status]}</Text></View>
          <Text style={[styles.label, { color: C.text }]}>{money(row.payout_amount, row.currency)}</Text>
        </View>)}
        <PaymentAction secondary label="View booking payments" disabled={false} onPress={() => setSection('bookings')} />
      </Card>
    </>}

    {section === 'bookings' && <>
      <Text style={[styles.sectionTitle, { color: C.text }]}>Booking payments</Text>
      <Text style={[styles.sectionNote, { color: C.sub }]}>Latest 50 online payments. Open a booking payment to see your share and release status.</Text>
      {!!payoutError && <Notice text={payoutError} />}
      {!loading && !payoutError && payouts.length === 0 && <EmptyState icon="receipt-outline" title="No booking payments yet" detail="Online payments will appear here. Payments taken in person stay between you and your client." />}
      {payouts.map(row => <BookingPayment key={row.id} row={row} busy={busy} onRefund={() => requestRefund(row)} />)}
    </>}

    {section === 'payouts' && <>
      <Text style={[styles.sectionTitle, { color: C.text }]}>From booking to bank</Text>
      <View style={[styles.journey, { backgroundColor: C.surface }]}>
        {[
          ['1', 'Booking completed', 'Funds normally become eligible 24 hours after the appointment ends.'],
          ['2', 'Released to Stripe', 'Your share moves to Stripe and clears into your available balance.'],
          ['3', 'Paid to your bank', 'Stripe sends a payout according to your payout schedule.'],
        ].map(([step, title, detail]) => <View key={step} style={styles.step}>
          <View style={[styles.stepNumber, { backgroundColor: C.card }]}><Text style={[styles.label, { color: C.accentText }]}>{step}</Text></View>
          <View style={{ flex: 1 }}><Text style={[styles.label, { color: C.text }]}>{title}</Text><Text style={[styles.caption, { color: C.text }]}>{detail}</Text></View>
        </View>)}
      </View>
      <Card title="Bank payouts" sub="Actual payouts from Stripe to your bank. Arrival dates are estimates.">
        {!!financeError && <Notice text={financeError} />}
        {!loading && !financeError && !finance?.payouts.length && <EmptyState icon="wallet-outline" title="No bank payouts yet" detail="Once Stripe schedules your first payout, you can follow its progress here." />}
        {finance?.payouts.map(p => <View key={p.id} style={[styles.bankRow, { borderColor: C.border }]}>
          <View style={styles.row}><Text style={[styles.amountSmall, { color: C.text }]}>{money(p.amount, p.currency)}</Text>
            <StatusBadge label={bankLabels[p.status] ?? 'Status unavailable'} attention={p.status === 'failed'} /></View>
          <Text style={[styles.description, { color: C.text }]}>{p.status === 'paid' ? 'Arrival date' : 'Expected arrival'} · {date(p.arrivalDate * 1000)}</Text>
          <Text style={[styles.caption, { color: C.sub }]}>{p.automatic ? 'Scheduled payout' : 'Manual payout'} · Created {date(p.created * 1000)}</Text>
          {p.status === 'failed' && <Text style={[styles.description, { color: C.text }]}>Check your bank details in Manage payout account.</Text>}
        </View>)}
        {finance?.hasMore && <PaymentAction secondary disabled={moreLoading || loading} label={moreLoading ? 'Loading…' : 'Load earlier payouts'} onPress={() => void loadMore()} />}
        {account?.connected && <PaymentAction disabled={busy} label="Manage payout account" onPress={() => void openStripe('dashboard')} />}
      </Card>
    </>}
    {section === 'settings' && children}
  </>;
}

const bankLabels: Record<string, string> = { pending: 'Scheduled', in_transit: 'On the way', paid: 'Paid', failed: 'Needs attention', canceled: 'Cancelled' };
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
const balances = (rows: { amount: number; currency: string }[]) => rows.length ? rows.map(row => money(row.amount, row.currency)).join('\n') : '£0.00';
const date = (value: number) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function BookingPayment({ row, busy, onRefund }: { row: ProviderPayout; busy: boolean; onRefund: () => void }) {
  const C = useBusinessPalette();
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.booking, { backgroundColor: C.card, borderColor: C.border }]}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.bookingHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: C.text }]}>{row.booking?.service_name_snapshot || 'Booking payment'}</Text>
        <Text style={[styles.description, { color: C.text }]}>{row.booking?.customer_name || 'Client'}</Text>
        <Text style={[styles.caption, { color: C.sub }]}>Payment recorded {date(new Date(row.created_at).getTime())}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={[styles.amountSmall, { color: C.text }]}>{money(row.payout_amount, row.currency)}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.accentText} /></View>
    </TouchableOpacity>
    <StatusBadge label={payoutLabels[row.status]} attention={row.status === 'failed'} />
    {expanded && <View style={[styles.breakdown, { borderColor: C.border }]}>
      {[['Your share before refunds', row.payout_amount]].map(([label, amount]) => <View key={label} style={styles.row}>
        <Text style={[styles.description, { color: C.text }]}>{label}</Text><Text style={[styles.label, { color: C.text }]}>{money(Number(amount), row.currency)}</Text>
      </View>)}
      <Text style={[styles.caption, { color: C.text, marginTop: 12 }]}>{row.status === 'held' ? `Eligible for release from ${date(new Date(row.release_after).getTime())}. This is not a bank arrival date.` : row.status === 'transferred' ? 'Your share has been released to Stripe. See Payouts for bank transfers.' : row.status === 'failed' ? 'Your share needs attention before it can be released. Contact support if this continues.' : 'This booking’s payout has been cancelled or returned.'}</Text>
      {['held', 'transferred', 'failed'].includes(row.status) && <PaymentAction secondary disabled={busy} label="Refund client" onPress={onRefund} />}
    </View>}
  </View>;
}
function StatusBadge({ label, attention = false }: { label: string; attention?: boolean }) {
  const C = useBusinessPalette();
  return <View style={[styles.badge, { backgroundColor: C.surface }]}>
    <Ionicons name={attention ? 'alert-circle-outline' : 'ellipse'} size={attention ? 14 : 6} color={C.accentText} />
    <Text style={[styles.caption, { color: C.text }]}>{label}</Text>
  </View>;
}
function Notice({ text }: { text: string }) {
  const C = useBusinessPalette();
  return <View style={[styles.notice, { backgroundColor: C.surface }]}><Ionicons name="information-circle-outline" size={20} color={C.accentText} /><Text accessibilityRole="alert" style={[styles.description, { color: C.text, flex: 1 }]}>{text}</Text></View>;
}
function EmptyState({ icon, title, detail }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string }) {
  const C = useBusinessPalette();
  return <View style={styles.empty}><Ionicons name={icon} size={30} color={C.accentText} /><Text style={[styles.label, { color: C.text, textAlign: 'center' }]}>{title}</Text><Text style={[styles.description, { color: C.text, textAlign: 'center' }]}>{detail}</Text></View>;
}
function PaymentAction({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  const C = useBusinessPalette();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} activeOpacity={0.75}
    style={[styles.action, { backgroundColor: secondary ? C.surface : C.accent, opacity: disabled ? 0.5 : 1 }]}>
    <Text style={[styles.label, { color: secondary ? C.accentText : C.bg, textAlign: 'center' }]}>{label}</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  intro: { paddingTop: 8, paddingBottom: 22, gap: 8 },
  eyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.6 },
  description: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  testBadge: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, padding: 9, borderRadius: 8, alignSelf: 'flex-start' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, minHeight: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  tabLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, flexShrink: 1 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  refresh: { padding: 12, minWidth: 44, minHeight: 44 },
  hero: { padding: 24, borderRadius: 24, marginBottom: 18 },
  heroLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  heroAmount: { fontFamily: 'BakbakOne-Regular', fontSize: 38, marginVertical: 12 },
  heroNote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 20 },
  heroDivider: { borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.3, marginVertical: 20 },
  heroPending: { fontFamily: 'BakbakOne-Regular', fontSize: 22, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  amount: { fontFamily: 'BakbakOne-Regular', fontSize: 28, marginBottom: 6 },
  amountSmall: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 22, marginBottom: 8 },
  sectionNote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  journey: { borderRadius: 20, padding: 18, gap: 20, marginBottom: 18 },
  step: { flexDirection: 'row', gap: 12 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bankRow: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  booking: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 18, marginBottom: 12 },
  bookingHead: { flexDirection: 'row', gap: 12, paddingBottom: 12 },
  breakdown: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12, gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginBottom: 14 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 10, gap: 12 },
  action: { padding: 14, minHeight: 48, borderRadius: 14, marginTop: 12 },
});
