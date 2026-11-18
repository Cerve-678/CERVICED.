import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import type { StripeConnectReturn } from '../utils/stripeConnectReturn';
import { PaymentRequestError } from '../utils/paymentRequestError';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useBusinessPalette } from '../features/business-details/BusinessDetailsKit';
import { PayCard, PaySection, ProcessingLabel, StatusChip } from '../features/payments/PaymentsCardKit';
import BookingPaymentTimeline from './BookingPaymentTimeline';
import { onRefundHold, payoutNeedsAttention, payoutStatusLabel, tipPence, tipStatusLabel } from '../features/payments/bookingPaymentTimeline';
import { useAppDialog } from './AppDialog';
import IssueRefundSheet, { type RefundIssued } from './IssueRefundSheet';
import BookingFeeSheet, { type BookingFeeSheetTarget } from './BookingFeeSheet';
import { feeKindLabel, feesToChargeNow } from '../features/bookings/bookingFeeRules';
import { useTheme } from '../contexts/ThemeContext';
import { toUserMessageAllowingDbGuard } from '../utils/userFacingError';
import { getProviderFinance, type ProviderFinance, getConnectLink, getConnectStatus, getProviderPayouts, getProviderFeeEarnings, getFeeChargeCandidates, type FeeChargeCandidate, getProviderTipEarnings, getPayoutSchedule, setPayoutSchedule, type ConnectStatus, type ProviderPayout, type ProviderFeeEarning, type ProviderTipEarning } from '../services/providerPaymentService';
import {
  PAYOUT_INTERVALS, PAYOUT_MONTH_DAYS, PAYOUT_RELEASE_HOURS, PAYOUT_WEEKDAYS, payoutIntervalLabel, payoutMonthDayLabel,
  payoutScheduleSentence, payoutWeekdayLabel, type PayoutInterval, type PayoutMonthDay, type PayoutSchedule,
  type PayoutScheduleChoice, type PayoutWeekday,
} from '../constants/payoutSchedule';
import { groupTipsByBooking } from '../features/payments/tipsByBooking';
import { feeDisputeLabel } from '../features/payments/bankDisputeStatus';
import { providerCancelGroupBooking, providerCancelOwnBooking } from '../services/databaseService';
import { MULTI_SERVICE_BOOKING_ENABLED } from '../constants/featureFlags';

/** One-line summaries of the provider's own payment settings, shown as the
 *  "Your setup" tiles on Overview. PaymentsScreen owns those settings, so it
 *  passes these in rather than this component reading them a second time. */
export interface PaymentSetupSummary { deposit: string; inPerson: string }

export default function ProviderStripePayments({ stripeReturn, setup, openFeeFor, children }: {
  stripeReturn?: StripeConnectReturn;
  setup?: PaymentSetupSummary | undefined;
  /** Opened from a booking's "Late & no-show fees" line: show that booking's fee. */
  openFeeFor?: string | undefined;
  children?: React.ReactNode;
}) {
  const C = useBusinessPalette();
  const { isDarkMode } = useTheme();
  const [section, setSection] = useState<'overview' | 'bookings' | 'payouts' | 'settings'>('overview');
  const [finance, setFinance] = useState<ProviderFinance | null>(null);
  const [financeError, setFinanceError] = useState('');
  const [moreLoading, setMoreLoading] = useState(false);
  const [account, setAccount] = useState<ConnectStatus | null>(null);
  const [payouts, setPayouts] = useState<ProviderPayout[]>([]);
  const [feeEarnings, setFeeEarnings] = useState<ProviderFeeEarning[]>([]);
  const [tipEarnings, setTipEarnings] = useState<ProviderTipEarning[]>([]);
  // Late, no-show and late-cancel fees the provider can still charge, and the
  // one whose fee sheet is open.
  const [feeCandidates, setFeeCandidates] = useState<FeeChargeCandidate[]>([]);
  const [feeSheet, setFeeSheet] = useState<BookingFeeSheetTarget | null>(null);
  // A tip shows inside its booking's payment card, so the two read as one.
  const tipGroups = useMemo(() => groupTipsByBooking(payouts.map(row => row.booking_id), tipEarnings), [payouts, tipEarnings]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payoutError, setPayoutError] = useState('');
  // How often Stripe pays their bank, read from Stripe. null with
  // scheduleLoaded = no Stripe account yet, so there's nothing to choose.
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
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
      getPayoutSchedule().then(current => {
        if (sequence !== loadSequence.current) return;
        setSchedule(current); setScheduleLoaded(true); setScheduleError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setScheduleError('Your payout schedule could not load. Refresh to try again.');
      }),
      // Fees are a secondary list: a failed read leaves it empty rather than
      // replacing the booking payments error above.
      getProviderFeeEarnings().then(rows => {
        if (sequence === loadSequence.current) setFeeEarnings(rows);
      }).catch(() => {}),
      getFeeChargeCandidates().then(rows => {
        if (sequence === loadSequence.current) setFeeCandidates(rows);
      }).catch(() => {}),
      // Tips too: secondary, so a failed read just leaves the list hidden.
      getProviderTipEarnings().then(rows => {
        if (sequence === loadSequence.current) setTipEarnings(rows);
      }).catch(() => {}),
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
  const chooseSchedule = async (choice: PayoutScheduleChoice) => {
    if (scheduleSaving) return;
    void Haptics.selectionAsync().catch(() => {});
    setScheduleSaving(true); setScheduleError('');
    try {
      setSchedule(await setPayoutSchedule(choice));
    } catch (err) {
      setScheduleError(err instanceof PaymentRequestError
        ? err.message
        : toUserMessageAllowingDbGuard(err, 'Your payout schedule was not changed. Please try again.', 'setPayoutSchedule'));
    } finally {
      setScheduleSaving(false);
    }
  };
  // Switching to weekly or monthly keeps a day Stripe already has, if it's one
  // the app offers; otherwise Monday, or the 1st.
  const chooseInterval = (interval: PayoutInterval) => {
    if (interval === schedule?.interval) return;
    if (interval === 'daily') return void chooseSchedule({ interval });
    if (interval === 'weekly') {
      const day = schedule?.weeklyDays.find((d): d is PayoutWeekday => (PAYOUT_WEEKDAYS as readonly string[]).includes(d)) ?? 'monday';
      return void chooseSchedule({ interval, weeklyDay: day });
    }
    const day = schedule?.monthlyDays.find((d): d is PayoutMonthDay => (PAYOUT_MONTH_DAYS as readonly number[]).includes(d)) ?? 1;
    void chooseSchedule({ interval, monthlyDay: day });
  };

  // Same full-or-partial refund sheet as the booking detail screen; the
  // confirmation goes through the in-app dialog, never a native alert.
  const [refundRow, setRefundRow] = useState<ProviderPayout | null>(null);
  const { showAlert, DialogHost } = useAppDialog();
  // The same "Cancel appointment too" the booking detail offers, for a booking
  // that's still upcoming or pending, and it cancels what the detail would:
  // just this service while multi-service booking is off (each service of an
  // older group booking is managed on its own), the whole group once it's on.
  const cancelRefundBooking = useMemo(() => {
    const row = refundRow;
    const booking = row?.booking;
    if (!row || !booking || (booking.status !== 'confirmed' && booking.status !== 'pending')) return undefined;
    const groupId = MULTI_SERVICE_BOOKING_ENABLED ? booking.group_booking_id : null;
    return async () => {
      if (groupId) await providerCancelGroupBooking(groupId);
      else await providerCancelOwnBooking(row.booking_id);
    };
  }, [refundRow]);
  const handleRefunded = useCallback(({ title, message }: RefundIssued) => {
    setRefundRow(null);
    void load();
    showAlert(title, message);
  }, [load, showAlert]);
  const feesToCharge = useMemo(() => feesToChargeNow(feeCandidates, Date.now()), [feeCandidates]);
  const openFeeSheet = (target: BookingFeeSheetTarget) => { void Haptics.selectionAsync().catch(() => {}); setFeeSheet(target); };
  const closeFeeSheet = () => { setFeeSheet(null); void load(); };
  // From a booking page: straight to that booking's fee, once.
  const openedFeeFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!openFeeFor || openedFeeFor.current === openFeeFor) return;
    openedFeeFor.current = openFeeFor;
    setSection('bookings');
    const known = feeCandidates.find(c => c.bookingId === openFeeFor) ?? feeEarnings.find(f => f.bookingId === openFeeFor);
    setFeeSheet({
      bookingId: openFeeFor,
      customerName: known?.customerName ?? null,
      serviceName: known?.serviceName ?? null,
      bookingDate: known && 'terms' in known ? known.terms.bookingDate : null,
    });
  }, [openFeeFor, feeCandidates, feeEarnings]);
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'payouts', label: 'Payouts' },
    { key: 'settings', label: 'Settings' },
  ] as const;
  // Tapping a booking payment opens its timeline.
  const [timelineRow, setTimelineRow] = useState<ProviderPayout | null>(null);
  const refundable = (row: ProviderPayout) => ['held', 'transferred', 'failed'].includes(row.status);
  // Until Stripe setup is finished there is nothing to show: no balance, no
  // booking payments, no payouts. The provider sees only the connect card,
  // plus Settings, which doesn't depend on Stripe.
  const needsConnect = !!account && !account.detailsSubmitted;
  const dashboardReady = !!account && !needsConnect;
  const visibleTabs = dashboardReady ? tabs : tabs.filter(tab => tab.key === 'overview' || tab.key === 'settings');
  const shownSection = dashboardReady || section === 'settings' ? section : 'overview';
  const setupReady = account?.payoutsEnabled;
  const manageAccount = !!account && (!!setupReady || (account.detailsSubmitted && !account.requirementsDue));
  const accountTitle = !account ? 'Checking your payout account' : setupReady ? 'Your payout account is connected'
    : account.detailsSubmitted && !account.requirementsDue ? 'Your details are submitted' : 'Set up your payout account';
  const nextPayout = finance?.payouts.filter(p => p.status === 'pending' || p.status === 'in_transit')
    .sort((a, b) => a.arrivalDate - b.arrivalDate)[0];
  // Still in its 24 hours (or not yet at its appointment), from the latest 50
  // booking payments. A payment on hold for a refund request isn't counted.
  const processingPence = payouts.filter(row => row.status === 'held' && !onRefundHold(row) && row.currency === 'gbp')
    .reduce((sum, row) => sum + row.payout_amount, 0);
  const scheduleText = payoutScheduleSentence(schedule);
  const pick = (key: typeof tabs[number]['key']) => { void Haptics.selectionAsync().catch(() => {}); setSection(key); };
  const openTimeline = (row: ProviderPayout) => { void Haptics.selectionAsync().catch(() => {}); setTimelineRow(row); };

  return <>
    <View style={styles.intro}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color: C.accentText }]}>YOUR BUSINESS, IN BALANCE</Text>
        <Text style={[styles.description, { color: C.text, marginTop: 4 }]}>A little clarity for every payment.</Text>
      </View>
      {finance && !finance.livemode && finance.connected && <Text style={[styles.testBadge, { color: C.accentText, backgroundColor: C.surface }]}>Test mode · no real money moves</Text>}
    </View>

    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: C.surface }]}>
        {visibleTabs.map(tab => {
          const selected = shownSection === tab.key;
          return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }}
            onPress={() => pick(tab.key)} activeOpacity={0.75}
            style={[styles.tab, { backgroundColor: selected ? C.accent : 'transparent' }]}>
            <Text numberOfLines={1} style={[styles.tabLabel, { color: selected ? C.bg : C.sub }]}>{tab.label}</Text>
          </TouchableOpacity>;
        })}
      </View>
      {!needsConnect && <View style={styles.refreshRow}>
        <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: C.sub }]}>{loading ? 'Updating your payments…' : 'Your payment information'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh all payment information" disabled={loading || busy}
          onPress={() => { setLoading(true); void load(); }} style={styles.refresh}>
          {loading ? <ActivityIndicator size="small" color={C.accentText} /> : <Text style={[styles.link, { color: C.accentText }]}>Refresh</Text>}
        </TouchableOpacity>
      </View>}
      {!!error && <Notice text={error} />}

      {shownSection === 'overview' && !account && !error && <ActivityIndicator color={C.accentText} style={{ marginVertical: 40 }} />}

      {shownSection === 'overview' && needsConnect && <View style={styles.connect}>
        <Text style={[styles.connectTitle, { color: C.text }]}>Set up how you get paid</Text>
        <Text style={[styles.description, { color: C.sub, textAlign: 'center' }]}>Connect your bank through Stripe. Your money, booking payments and paydays show up here once it's done.</Text>
        <View style={{ alignSelf: 'stretch' }}>
          {busy ? <ActivityIndicator color={C.accentText} style={{ marginTop: 16 }} />
            : <PaymentAction disabled={busy} label={account.connected ? 'Continue with Stripe' : 'Connect with Stripe'} onPress={() => void openStripe('onboard')} />}
        </View>
      </View>}

      {shownSection === 'overview' && dashboardReady && <>
        {!!financeError && <Notice text={financeError} />}
        <View style={[styles.hero, { backgroundColor: C.accent }]}>
          <Text style={[styles.heroLabel, { color: C.bg }]}>READY FOR PAYDAY</Text>
          <Text style={[styles.heroAmount, { color: C.bg }]}>{finance?.connected ? balances(finance.available) : '—'}</Text>
          <Text style={[styles.heroNote, { color: C.bg }]}>{finance?.connected ? 'Goes to your bank on your next payday.' : !finance ? (loading ? 'Checking your balance…' : 'Balance unavailable. Refresh to try again.') : 'Connect your payout account to see your balance.'}</Text>
          <View style={styles.heroTiles}>
            <View style={[styles.heroTile, { backgroundColor: `${C.bg}29` }]}>
              <Text style={[styles.heroTileLabel, { color: C.bg }]}>Clearing</Text>
              <Text style={[styles.heroTileAmount, { color: C.bg }]}>{finance?.connected ? balances(finance.pending) : '—'}</Text>
            </View>
            <View style={[styles.heroTile, { backgroundColor: `${C.bg}29` }]}>
              <ProcessingLabel color={C.bg} />
              <Text style={[styles.heroTileAmount, { color: C.bg }]}>{payoutError ? '—' : money(processingPence, 'gbp')}</Text>
            </View>
          </View>
        </View>
        {feesToCharge.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => pick('bookings')} activeOpacity={0.75} style={styles.plainRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: C.text }]}>{feesToCharge.length === 1 ? '1 fee you can charge' : `${feesToCharge.length} fees you can charge`}</Text>
            <Text style={[styles.caption, { color: C.sub }]}>Late, no-show or late cancellation. Charge within 24 hours of the appointment.</Text>
          </View>
          <Text style={[styles.link, { color: C.accentText }]}>Fees</Text>
        </TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" onPress={() => pick('payouts')} activeOpacity={0.75} style={styles.plainRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: C.text }]}>{nextPayout ? `Next payday · ${money(nextPayout.amount, nextPayout.currency)}` : 'Next payday'}</Text>
            <Text style={[styles.caption, { color: C.sub }]}>{nextPayout ? `Expected ${date(nextPayout.arrivalDate * 1000)}`
              : financeError ? 'Payout information is unavailable. Refresh to try again.' : loading ? 'Checking scheduled payouts…' : 'Nothing scheduled yet.'}</Text>
          </View>
          <Text style={[styles.link, { color: C.accentText }]}>Payouts</Text>
        </TouchableOpacity>


        <PaySection>
          <View style={styles.headRow}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Recent booking payments</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="See all booking payments" onPress={() => pick('bookings')} hitSlop={12}>
              <Text style={[styles.link, { color: C.accentText }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {!!payoutError && <Notice text={payoutError} />}
          {!loading && !payoutError && payouts.length === 0 && <EmptyState title="Your first payment starts here" detail="When a client pays online, their booking payment will appear here." />}
          {payouts.slice(0, 3).map((row, i) => <PaymentRow key={row.id} row={row} first={i === 0} tips={tipGroups.byBooking.get(row.booking_id)} onPress={() => openTimeline(row)} />)}
        </PaySection>

        {setup && <PaySection>
          <Text style={[styles.eyebrow, { color: C.accentText, marginBottom: 6 }]}>YOUR SETUP</Text>
          <View style={styles.setupGrid}>
            {([['Deposits', setup.deposit], ['In person', setup.inPerson]] as const).map(([label, value]) =>
              <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Open payment settings`}
                onPress={() => pick('settings')} activeOpacity={0.75}
                style={[styles.setupTile, { backgroundColor: C.bg, borderColor: C.border }]}>
                <Text style={[styles.caption, { color: C.sub }]}>{label}</Text>
                <Text style={[styles.label, { color: C.text }]}>{value}</Text>
              </TouchableOpacity>)}
          </View>
        </PaySection>}
      </>}

      {shownSection === 'bookings' && <>
        <PaySection first title="Booking payments" sub="Your latest 50 online payments. Tap one to follow it from booking to bank.">
          {!!payoutError && <Notice text={payoutError} />}
          {!loading && !payoutError && payouts.length === 0 && <EmptyState title="No booking payments yet" detail="Online payments will appear here. Payments taken in person stay between you and your client." />}
          {payouts.map((row, i) => <PaymentRow key={row.id} row={row} first={i === 0} tips={tipGroups.byBooking.get(row.booking_id)} onPress={() => openTimeline(row)} />)}
        </PaySection>
        {(feesToCharge.length > 0 || feeEarnings.length > 0) && <PaySection title="Late & no-show fees"
          sub="Charge a late, no-show or late cancellation fee within 24 hours of the appointment. Tap a fee to refund it or answer a dispute.">
          {feesToCharge.map((fee, i) => <TouchableOpacity key={`charge-${fee.bookingId}`} accessibilityRole="button"
            accessibilityLabel={`Charge ${fee.customerName || 'client'}, ${fee.serviceName ?? 'booking'}`}
            onPress={() => openFeeSheet(fee)} activeOpacity={0.75}
            style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: C.text }]}>{[fee.customerName || 'Client', fee.serviceName].filter(Boolean).join(' · ')}</Text>
              <Text style={[styles.caption, { color: C.sub }]}>{`Can charge a ${fee.kinds.map(feeKindLabel).join(' or ')} until ${fee.closesAtLabel}`}</Text>
            </View>
            <Text style={[styles.link, { color: C.accentText }]}>Charge</Text>
          </TouchableOpacity>)}
          {feeEarnings.map((fee, i) => <TouchableOpacity key={fee.id} accessibilityRole="button"
            onPress={() => openFeeSheet({ bookingId: fee.bookingId, customerName: fee.customerName, serviceName: fee.serviceName })} activeOpacity={0.75}
            style={[styles.listRow, (i > 0 || feesToCharge.length > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: C.text }]}>{fee.kind === 'late' ? 'Late arrival fee' : fee.kind === 'no_show' ? 'No-show fee' : 'Late cancellation fee'}{fee.serviceName ? ` · ${fee.serviceName}` : ''}</Text>
              <Text style={[styles.caption, { color: C.sub }]}>{[fee.customerName || 'Client', fee.chargedAt && `Charged ${date(new Date(fee.chargedAt).getTime())}`].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.amountSmall, { color: C.text }]}>{fee.payoutPence != null ? money(fee.payoutPence, 'gbp') : money(fee.amountPence, 'gbp')}</Text>
              <StatusChip label={feeStatusLabel(fee)} attention={fee.openDispute || fee.payoutStatus === 'failed'} />
            </View>
          </TouchableOpacity>)}
        </PaySection>}
        {/* Only tips whose booking payment isn't in the list above; the rest are on their booking. */}
        {tipGroups.unmatched.length > 0 && <PaySection title={tipGroups.byBooking.size > 0 ? 'Earlier tips' : 'Tips'}
          sub="What clients tipped you after their appointment. It's all yours: CERVICED covers the card fee. Tips can't be refunded.">
          {tipGroups.unmatched.map((tip, i) => <View key={tip.id} style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: C.text }]}>Tip{tip.serviceName ? ` · ${tip.serviceName}` : ''}</Text>
              <Text style={[styles.caption, { color: C.sub }]}>{[tip.customerName || 'Client', tip.paidAt && `Tipped ${date(new Date(tip.paidAt).getTime())}`].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.amountSmall, { color: C.text }]}>{money(tipPence(tip), 'gbp')}</Text>
              <StatusChip label={tipStatusLabel(tip)} attention={tip.payoutStatus === 'failed'} />
            </View>
          </View>)}
        </PaySection>}
      </>}

      {shownSection === 'payouts' && <>
        <PaySection first title="From booking to bank">
          {([
            ['1', 'Appointment done', `Processing for ${PAYOUT_RELEASE_HOURS} hours after the appointment ends.`],
            ['2', 'Clearing', 'It clears into your balance, usually about 3 working days after the client paid.'],
            ['3', 'Paid to your bank', `${scheduleText} Change this in Settings.`],
          ] as const).map(([step, title, detail]) => <View key={step} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: C.accent }]}><Text style={[styles.label, { color: C.bg }]}>{step}</Text></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: C.text }]}>{title}</Text><Text style={[styles.caption, { color: C.sub }]}>{detail}</Text></View>
          </View>)}
        </PaySection>
        <PaySection title="Bank payouts" sub="What's been sent to your bank. Arrival dates are estimates.">
          {!!financeError && <Notice text={financeError} />}
          {!loading && !financeError && !finance?.payouts.length && <EmptyState title="No bank payouts yet" detail="Once Stripe schedules your first payout, you can follow its progress here." />}
          {finance?.payouts.map((p, i) => <View key={p.id} style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.amountSmall, { color: C.text }]}>{money(p.amount, p.currency)}</Text>
              <Text style={[styles.description, { color: C.text }]}>{p.status === 'paid' ? 'Arrived' : 'Expected'} {date(p.arrivalDate * 1000)}</Text>
              <Text style={[styles.caption, { color: C.sub }]}>{p.automatic ? 'Scheduled payout' : 'Manual payout'} · Created {date(p.created * 1000)}</Text>
              {p.status === 'failed' && <Text style={[styles.caption, { color: C.text }]}>Check your bank details in Manage payout account.</Text>}
            </View>
            <StatusChip label={bankLabels[p.status] ?? 'Status unavailable'} attention={p.status === 'failed'} />
          </View>)}
          {finance?.hasMore && <PaymentAction secondary disabled={moreLoading || loading} label={moreLoading ? 'Loading…' : 'Load earlier payouts'} onPress={() => void loadMore()} />}
          {account?.connected && <PaymentAction disabled={busy} label="Manage payout account" onPress={() => void openStripe('dashboard')} />}
        </PaySection>
      </>}

      {shownSection === 'settings' && <>
        {/* Each part of Settings is its own card; the rest come from PaymentsScreen. */}
        <PayCard title="When you get paid" sub={`Each payment is processing for ${PAYOUT_RELEASE_HOURS} hours after its appointment. Stripe then pays it into your bank on the schedule you choose here.`}>
          {!!scheduleError && <Notice text={scheduleError} />}
          {scheduleLoaded && !schedule
            ? <Notice text="Set up your Stripe account to choose when you get paid." />
            : <>
              <View style={styles.scheduleOptions}>
                {PAYOUT_INTERVALS.map(interval => <ScheduleOption key={interval} label={payoutIntervalLabel(interval)}
                  selected={schedule?.interval === interval} disabled={scheduleSaving || !schedule}
                  onPress={() => chooseInterval(interval)} colors={C} />)}
              </View>
              {schedule?.interval === 'weekly' && <>
                <Text style={[styles.caption, { color: C.sub, marginTop: 12 }]}>Paid every</Text>
                <View style={styles.scheduleOptions}>
                  {PAYOUT_WEEKDAYS.map(day => <ScheduleOption key={day} label={payoutWeekdayLabel(day)}
                    selected={schedule.weeklyDays.includes(day)} disabled={scheduleSaving}
                    onPress={() => { if (schedule.weeklyDays.length !== 1 || schedule.weeklyDays[0] !== day) void chooseSchedule({ interval: 'weekly', weeklyDay: day }); }} colors={C} />)}
                </View>
              </>}
              {schedule?.interval === 'monthly' && <>
                <Text style={[styles.caption, { color: C.sub, marginTop: 12 }]}>Paid on</Text>
                <View style={styles.scheduleOptions}>
                  {PAYOUT_MONTH_DAYS.map(day => <ScheduleOption key={day} label={payoutMonthDayLabel(day)}
                    selected={schedule.monthlyDays.includes(day)} disabled={scheduleSaving}
                    onPress={() => { if (schedule.monthlyDays.length !== 1 || schedule.monthlyDays[0] !== day) void chooseSchedule({ interval: 'monthly', monthlyDay: day }); }} colors={C} />)}
                </View>
              </>}
              {!!schedule && <Text style={[styles.caption, { color: C.sub, marginTop: 10 }]}>{payoutScheduleSentence(schedule)} Stripe can only send money once it has cleared, usually about 3 working days after the client pays.</Text>}
            </>}
        </PayCard>
        {children}
      </>}
    </View>

    {/* The payout account: its own card, outside the tabbed card and only
        with Overview (user, 2026-11-18: "on a single card, not together"). */}
    {shownSection === 'overview' && dashboardReady && account && <View style={[styles.card, styles.accountCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${accountTitle}. ${manageAccount ? 'Manage payout account' : 'Continue with Stripe'}`}
            disabled={busy} onPress={() => void openStripe(manageAccount ? 'dashboard' : 'onboard')} activeOpacity={0.75} style={styles.plainRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: C.text }]}>{accountTitle}</Text>
              <Text style={[styles.caption, { color: C.sub }]}>{!setupReady ? 'Finish with Stripe to receive online booking payments'
                : account.bankAccount ? `Paid to ${account.bankAccount.bankName ?? 'your bank'} ••${account.bankAccount.last4}. Tap Manage to change it.`
                : 'Bank details managed securely by Stripe'}</Text>
            </View>
            {busy ? <ActivityIndicator size="small" color={C.accentText} />
              : <Text style={[styles.link, { color: C.accentText }]}>{manageAccount ? 'Manage' : 'Continue'}</Text>}
          </TouchableOpacity>
          {!!account.requirementsDue && <PaymentAction disabled={busy} label="Update required details" onPress={() => void openStripe('onboard')} secondary />}
    </View>}

    {timelineRow && <BookingPaymentTimeline
      row={timelineRow}
      tips={tipGroups.byBooking.get(timelineRow.booking_id) ?? []}
      scheduleSentence={scheduleText}
      onClose={() => setTimelineRow(null)}
      onRefund={refundable(timelineRow) ? () => {
        const row = timelineRow;
        setTimelineRow(null);
        // iOS can't present the refund sheet while the timeline is still
        // sliding away, so open it once that has finished.
        setTimeout(() => setRefundRow(row), 450);
      } : undefined}
    />}
    {feeSheet && <BookingFeeSheet target={feeSheet} onClose={closeFeeSheet} />}
    {refundRow && <IssueRefundSheet
      booking={{ id: refundRow.booking_id, customerName: refundRow.booking?.customer_name, serviceName: refundRow.booking?.service_name_snapshot }}
      palette={{ ...C, iconBg: `${C.accent}1F` }}
      isDarkMode={isDarkMode}
      onClose={() => setRefundRow(null)}
      onRefunded={handleRefunded}
      onCancelAppointment={cancelRefundBooking}
    />}
    <DialogHost />
  </>;
}

function ScheduleOption({ label, selected, disabled, onPress, colors }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
  colors: { accent: string; bg: string; surface: string; border: string; text: string };
}) {
  return <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} activeOpacity={0.75}
    style={[styles.scheduleOption, { backgroundColor: selected ? colors.accent : colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.label, { color: selected ? colors.bg : colors.text }]}>{label}</Text>
  </TouchableOpacity>;
}

/** One booking payment in a list. Tapping it opens its timeline. */
function PaymentRow({ row, tips, first, onPress }: { row: ProviderPayout; tips?: ProviderTipEarning[] | undefined; first: boolean; onPress: () => void }) {
  const C = useBusinessPalette();
  const tipTotal = (tips ?? []).reduce((sum, tip) => sum + tipPence(tip), 0);
  const service = row.booking?.service_name_snapshot || 'Booking payment';
  const status = payoutStatusLabel(row);
  const when = row.booking?.booking_date ? date(new Date(`${row.booking.booking_date.slice(0, 10)}T12:00:00`).getTime()) : null;
  return <TouchableOpacity accessibilityRole="button" accessibilityHint="Opens this payment's timeline"
    accessibilityLabel={`${service}, ${row.booking?.customer_name || 'Client'}, ${money(row.payout_amount, row.currency)}${tipTotal ? ` plus ${money(tipTotal, 'gbp')} tip` : ''}, ${status}`}
    onPress={onPress} activeOpacity={0.7}
    style={[styles.listRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: C.text }]}>{service}</Text>
      <Text style={[styles.caption, { color: C.sub }]}>{[row.booking?.customer_name || 'Client', when].filter(Boolean).join(' · ')}</Text>
    </View>
    <View style={styles.rowRight}>
      <Text style={[styles.amountSmall, { color: C.text }]}>{money(row.payout_amount, row.currency)}</Text>
      {tipTotal > 0 && <Text style={[styles.caption, { color: C.sub }]}>+ {money(tipTotal, 'gbp')} tip</Text>}
      <StatusChip label={status} attention={payoutNeedsAttention(row)} />
    </View>
  </TouchableOpacity>;
}

function feeStatusLabel(fee: ProviderFeeEarning): string {
  if (fee.status === 'refunded') return 'Refunded to client';
  const bankDispute = feeDisputeLabel(fee.bankDispute ?? undefined, fee.payoutStatus);
  if (bankDispute) return bankDispute;
  if (fee.openDispute) return 'Disputed — waiting on your answer';
  switch (fee.payoutStatus) {
    case 'held': return 'Processing';
    case 'transferred': return 'Sent for payday';
    case 'reversed': return 'Taken back after a bank dispute';
    case 'failed': return 'Needs attention';
    case 'cancelled': return 'Cancelled';
    default: return 'Processing';
  }
}
const bankLabels: Record<string, string> = { pending: 'Scheduled', in_transit: 'On the way', paid: 'Paid', failed: 'Needs attention', canceled: 'Cancelled' };
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
const balances = (rows: { amount: number; currency: string }[]) => rows.length ? rows.map(row => money(row.amount, row.currency)).join('\n') : '£0.00';
const date = (value: number) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Notice({ text }: { text: string }) {
  const C = useBusinessPalette();
  return <View style={[styles.notice, { backgroundColor: C.surface }]}><Text accessibilityRole="alert" style={[styles.description, { color: C.text }]}>{text}</Text></View>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  const C = useBusinessPalette();
  return <View style={styles.empty}><Text style={[styles.label, { color: C.text, textAlign: 'center' }]}>{title}</Text><Text style={[styles.description, { color: C.sub, textAlign: 'center' }]}>{detail}</Text></View>;
}
function PaymentAction({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  const C = useBusinessPalette();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} activeOpacity={0.75}
    style={[styles.action, { backgroundColor: secondary ? C.surface : C.accent, opacity: disabled ? 0.5 : 1 }]}>
    <Text style={[styles.label, { color: secondary ? C.accentText : C.bg, textAlign: 'center' }]}>{label}</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8, paddingBottom: 14 },
  card: { borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  accountCard: { marginTop: 14, paddingTop: 4, paddingBottom: 4 },
  tabs: { flexDirection: 'row', gap: 4, borderRadius: 20, padding: 4, marginHorizontal: -8 },
  tab: { flex: 1, minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  connect: { alignItems: 'center', gap: 10, paddingTop: 24, paddingBottom: 8 },
  connectTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20, textAlign: 'center' },
  eyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.6 },
  description: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  link: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  testBadge: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 100, overflow: 'hidden', maxWidth: 140 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  refresh: { paddingVertical: 12, paddingLeft: 12, minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hero: { padding: 18, borderRadius: 22, marginTop: 4 },
  heroLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.4, opacity: 0.85 },
  heroAmount: { fontFamily: 'BakbakOne-Regular', fontSize: 38, marginTop: 8, marginBottom: 6 },
  heroNote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroTile: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  heroTileLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12 },
  heroTileAmount: { fontFamily: 'BakbakOne-Regular', fontSize: 17 },
  plainRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  rowRight: { alignItems: 'flex-end' },
  setupGrid: { flexDirection: 'row', gap: 8 },
  setupTile: { flex: 1, minHeight: 76, padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between', gap: 6 },
  amountSmall: { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
  step: { flexDirection: 'row', gap: 12, marginTop: 12 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notice: { padding: 14, borderRadius: 14, marginVertical: 8 },
  empty: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 10, gap: 8 },
  scheduleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  scheduleOption: { paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  action: { padding: 14, minHeight: 48, borderRadius: 14, marginTop: 12 },
});
