import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import type { StripeConnectReturn } from '../utils/stripeConnectReturn';
import { PaymentRequestError } from '../utils/paymentRequestError';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Card, useBusinessPalette } from '../features/business-details/BusinessDetailsKit';
import { newRequestId } from '../utils/requestId';
import { toUserMessageAllowingDbGuard } from '../utils/userFacingError';
import { getProviderFinance, type ProviderFinance, getConnectLink, getConnectStatus, refundProviderBooking, getProviderPayouts, getProviderFeeEarnings, getPayoutHoldDays, setPayoutHoldDays, type ConnectStatus, type ProviderPayout, type ProviderFeeEarning } from '../services/providerPaymentService';
import { PAYOUT_HOLD_DAY_OPTIONS, payoutHoldLabel, payoutHoldSentence, type PayoutHoldDays } from '../constants/payoutTiming';
import { useTranslation, tr, localeForLanguage, type TranslationKey } from '../i18n';

const payoutLabels: Record<ProviderPayout['status'], TranslationKey> = {
  held: 'providerBusiness.stripe.payout.held', transferred: 'providerBusiness.stripe.payout.transferred', failed: 'providerBusiness.stripe.payout.failed',
  cancelled: 'providerBusiness.stripe.payout.cancelled', reversed: 'providerBusiness.stripe.payout.reversed',
};

/** One-line summaries of the provider's own payment settings, shown as the
 *  "Your setup" tiles on Overview. PaymentsScreen owns those settings, so it
 *  passes these in rather than this component reading them a second time. */
export interface PaymentSetupSummary { deposit: string; inPerson: string }

export default function ProviderStripePayments({ stripeReturn, setup, children }: { stripeReturn?: StripeConnectReturn; setup?: PaymentSetupSummary | undefined; children?: React.ReactNode }) {
  const C = useBusinessPalette();
  const { t } = useTranslation();
  const [section, setSection] = useState<'overview' | 'bookings' | 'payouts' | 'settings'>('overview');
  const [finance, setFinance] = useState<ProviderFinance | null>(null);
  const [financeError, setFinanceError] = useState('');
  const [moreLoading, setMoreLoading] = useState(false);
  const [account, setAccount] = useState<ConnectStatus | null>(null);
  const [payouts, setPayouts] = useState<ProviderPayout[]>([]);
  const [feeEarnings, setFeeEarnings] = useState<ProviderFeeEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [holdDays, setHoldDays] = useState<PayoutHoldDays | null>(null);
  const [holdSaving, setHoldSaving] = useState(false);
  const [holdError, setHoldError] = useState('');
  // No professional profile yet: there's no payout to time, so no picker.
  const [holdUnavailable, setHoldUnavailable] = useState(false);
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
        if (sequence === loadSequence.current) setFinanceError(tr('providerBusiness.stripe.err.finance'));
      }),
      getConnectStatus().then(status => {
        if (sequence !== loadSequence.current) return;
        setAccount(status); setError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setError(tr('providerBusiness.stripe.err.account'));
      }),
      getProviderPayouts().then(rows => {
        if (sequence !== loadSequence.current) return;
        setPayouts(rows); setPayoutError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setPayoutError(tr('providerBusiness.stripe.err.payouts'));
      }),
      getPayoutHoldDays().then(days => {
        if (sequence !== loadSequence.current) return;
        setHoldDays(days); setHoldUnavailable(days === null); setHoldError('');
      }).catch(() => {
        if (sequence === loadSequence.current) setHoldError(tr('providerBusiness.stripe.err.holdLoad'));
      }),
      // Fees are a secondary list: a failed read leaves it empty rather than
      // replacing the booking payments error above.
      getProviderFeeEarnings().then(rows => {
        if (sequence === loadSequence.current) setFeeEarnings(rows);
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
    } catch { if (sequence === loadSequence.current) setFinanceError(tr('providerBusiness.stripe.err.more')); }
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
    catch (error) { setError(error instanceof PaymentRequestError ? error.message : tr('providerBusiness.stripe.err.open')); }
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
  const chooseHoldDays = async (days: PayoutHoldDays) => {
    if (days === holdDays || holdSaving) return;
    void Haptics.selectionAsync().catch(() => {});
    setHoldSaving(true); setHoldError('');
    try {
      setHoldDays(await setPayoutHoldDays(days));
      // Held rows were re-timed server-side; reread them so "Eligible for release from" matches.
      void load();
    } catch (err) {
      // The server's own guard wording ("Choose 24 hours, 3, 7, 14 or 30
      // days.") says what to do; anything else gets the generic retry line.
      setHoldError(toUserMessageAllowingDbGuard(err, tr('providerBusiness.stripe.err.holdSave'), 'setPayoutHoldDays'));
    } finally {
      setHoldSaving(false);
    }
  };

  const requestRefund = (row: ProviderPayout) => {
    const share = new Intl.NumberFormat('en-GB', { style: 'currency', currency: row.currency }).format(row.payout_amount / 100);
    Alert.alert(tr('providerBusiness.stripe.refund.title'), tr('providerBusiness.stripe.refund.body', { name: row.booking?.customer_name || tr('providerBusiness.stripe.refund.theClient'), service: row.booking?.service_name_snapshot || tr('providerBusiness.stripe.refund.thisBooking'), share }), [
      { text: tr('providerBusiness.stripe.refund.keep'), style: 'cancel' },
      { text: tr('providerBusiness.stripe.refund.confirm'), style: 'destructive', onPress: async () => {
        if (opening.current) return;
        opening.current = true;
        setBusy(true);
        try {
          const completed = await refundProviderBooking({ bookingId: row.booking_id, reason: 'Refunded from Payments', requestId: newRequestId() });
          await load();
          Alert.alert(completed ? tr('providerBusiness.stripe.refund.issued') : tr('providerBusiness.stripe.refund.processing'), completed
            ? tr('providerBusiness.stripe.refund.issuedBody')
            : tr('providerBusiness.stripe.refund.processingBody'));
        } catch {
          setError(tr('providerBusiness.stripe.refund.unconfirmed'));
        } finally { opening.current = false; setBusy(false); }
      } },
    ]);
  };
  const tabs = [
    { key: 'overview', label: t('providerBusiness.stripe.tab.overview'), icon: 'grid-outline' },
    { key: 'bookings', label: t('providerBusiness.stripe.tab.bookings'), icon: 'receipt-outline' },
    { key: 'payouts', label: t('providerBusiness.stripe.tab.payouts'), icon: 'wallet-outline' },
    { key: 'settings', label: t('providerBusiness.stripe.tab.settings'), icon: 'options-outline' },
  ] as const;
  const setupReady = account?.payoutsEnabled;
  const manageAccount = !!account && (!!setupReady || (account.detailsSubmitted && !account.requirementsDue));
  const accountTitle = !account ? t('providerBusiness.stripe.account.checking') : setupReady ? t('providerBusiness.stripe.account.connected')
    : account.detailsSubmitted && !account.requirementsDue ? t('providerBusiness.stripe.account.submitted') : t('providerBusiness.stripe.account.setUp');
  const nextPayout = finance?.payouts.filter(p => p.status === 'pending' || p.status === 'in_transit')
    .sort((a, b) => a.arrivalDate - b.arrivalDate)[0];
  return <>
    <View style={styles.intro}>
      <Text style={[styles.eyebrow, { color: C.accentText }]}>{t('providerBusiness.stripe.intro.eyebrow')}</Text>
      <Text style={[styles.description, { color: C.text }]}>{t('providerBusiness.stripe.intro.body')}</Text>
      {finance && !finance.livemode && finance.connected && <Text style={[styles.testBadge, { color: C.accentText, backgroundColor: C.surface }]}>{t('providerBusiness.stripe.testMode')}</Text>}
    </View>
    <View style={styles.tabs}>
      {tabs.map(tab => {
        const selected = section === tab.key;
        return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }}
          onPress={() => { void Haptics.selectionAsync().catch(() => {}); setSection(tab.key); }} activeOpacity={0.75}
          style={[styles.tab, { backgroundColor: selected ? C.accent : C.card, borderColor: selected ? C.accent : C.border }]}>
          <View style={[styles.iconChip, styles.tabIcon, { backgroundColor: selected ? `${C.bg}29` : C.surface }]}>
            <Ionicons name={tab.icon} size={16} color={selected ? C.bg : C.accentText} />
          </View>
          <Text style={[styles.tabLabel, { color: selected ? C.bg : C.text }]}>{tab.label}</Text>
        </TouchableOpacity>;
      })}
    </View>
    <View style={styles.refreshRow}>
      <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: C.sub }]}>{loading ? t('providerBusiness.stripe.updating') : t('providerBusiness.stripe.info')}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('providerBusiness.stripe.refreshA11y')} disabled={loading || busy}
        onPress={() => { setLoading(true); void load(); }} style={styles.refresh}>
        {loading ? <ActivityIndicator size="small" color={C.accentText} /> : <Ionicons name="refresh-outline" size={20} color={C.accentText} />}
      </TouchableOpacity>
    </View>
    {!!error && <Notice text={error} />}

    {section === 'overview' && <>
      {!!financeError && <Notice text={financeError} />}
      <View style={[styles.hero, { backgroundColor: C.accent }]}>
        <Text style={[styles.heroLabel, { color: C.bg }]}>{t('providerBusiness.stripe.hero.available')}</Text>
        <Text style={[styles.heroAmount, { color: C.bg }]}>{finance?.connected ? balances(finance.available) : '—'}</Text>
        <Text style={[styles.heroNote, { color: C.bg }]}>{finance?.connected ? t('providerBusiness.stripe.hero.ready') : !finance ? (loading ? t('providerBusiness.stripe.hero.checking') : t('providerBusiness.stripe.hero.unavailable')) : t('providerBusiness.stripe.hero.connect')}</Text>
        <View style={[styles.heroDivider, { borderColor: C.bg }]} />
        <View style={styles.heroRow}>
          <Text style={[styles.heroNote, { color: C.bg }]}>{t('providerBusiness.stripe.hero.clearing')}</Text>
          <Text style={[styles.heroPending, { color: C.bg }]}>{finance?.connected ? balances(finance.pending) : '—'}</Text>
        </View>
      </View>

      {account && <>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${accountTitle}. ${manageAccount ? t('providerBusiness.stripe.manageAccount') : t('providerBusiness.stripe.continueStripe')}`}
          disabled={busy} onPress={() => void openStripe(manageAccount ? 'dashboard' : 'onboard')} activeOpacity={0.75}
          style={[styles.rowCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={[styles.iconChip, { backgroundColor: C.surface }]}><Ionicons name="business-outline" size={18} color={C.accentText} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: C.text }]}>{accountTitle}</Text>
            <Text style={[styles.caption, { color: C.sub }]}>{!setupReady ? t('providerBusiness.stripe.account.finish')
              : account.bankAccount ? t('providerBusiness.stripe.account.paidTo', { bank: account.bankAccount.bankName ?? t('providerBusiness.stripe.account.yourBank'), last4: account.bankAccount.last4 })
              : t('providerBusiness.stripe.account.managedByStripe')}</Text>
          </View>
          {busy ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[styles.rowAction, { color: C.accentText }]}>{manageAccount ? t('providerBusiness.stripe.manage') : t('common.continue')}</Text>}
        </TouchableOpacity>
        {!!account.requirementsDue && <PaymentAction disabled={busy} label={t('providerBusiness.stripe.updateDetails')} onPress={() => void openStripe('onboard')} secondary />}
      </>}

      <IconCard icon="calendar-outline" title={t('providerBusiness.stripe.next.title')} sub={t('providerBusiness.stripe.next.sub')}>
        {nextPayout ? <View style={[styles.amountPanel, { backgroundColor: C.bg }]}>
          <Text style={[styles.amount, { color: C.text }]}>{money(nextPayout.amount, nextPayout.currency)}</Text>
          <Text style={[styles.caption, { color: C.text }]}>{t('providerBusiness.stripe.next.expected', { date: date(nextPayout.arrivalDate * 1000) })}</Text>
        </View> : <Text style={[styles.description, { color: C.text }]}>{financeError ? t('providerBusiness.stripe.next.unavailable') : loading ? t('providerBusiness.stripe.next.checking') : t('providerBusiness.stripe.next.none')}</Text>}
        <PaymentAction secondary label={t('providerBusiness.stripe.viewPayouts')} disabled={false} onPress={() => setSection('payouts')} />
      </IconCard>
      <IconCard icon="receipt-outline" title={t('providerBusiness.stripe.recent.title')} sub={t('providerBusiness.stripe.recent.sub')}>
        {!!payoutError && <Notice text={payoutError} />}
        {!loading && !payoutError && payouts.length === 0 && <EmptyState icon="receipt-outline" title={t('providerBusiness.stripe.recent.emptyTitle')} detail={t('providerBusiness.stripe.recent.emptyBody')} />}
        {payouts.slice(0, 3).map(row => <View key={row.id} style={[styles.activity, { borderColor: C.border }]}>
          <View style={{ flex: 1 }}><Text style={[styles.label, { color: C.text }]}>{row.booking?.service_name_snapshot || t('providerBusiness.stripe.bookingPayment')}</Text>
            <Text style={[styles.caption, { color: C.sub }]}>{row.booking?.customer_name || t('providerBusiness.stripe.client')} · {t(payoutLabels[row.status])}</Text></View>
          <Text style={[styles.label, { color: C.text }]}>{money(row.payout_amount, row.currency)}</Text>
        </View>)}
        <PaymentAction secondary label={t('providerBusiness.stripe.viewBookings')} disabled={false} onPress={() => setSection('bookings')} />
      </IconCard>

      {setup && <>
        <Text style={[styles.groupTitle, { color: C.text }]}>{t('providerBusiness.stripe.setup.title')}</Text>
        <View style={styles.setupGrid}>
          {([[t('providerBusiness.stripe.setup.deposits'), setup.deposit], [t('providerBusiness.stripe.setup.inPerson'), setup.inPerson]] as const).map(([label, value]) =>
            <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={t('providerBusiness.stripe.setup.a11y', { label, value })}
              onPress={() => { void Haptics.selectionAsync().catch(() => {}); setSection('settings'); }} activeOpacity={0.75}
              style={[styles.setupTile, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.caption, { color: C.sub }]}>{label}</Text>
              <Text style={[styles.label, { color: C.text }]}>{value}</Text>
            </TouchableOpacity>)}
        </View>
      </>}
    </>}

    {section === 'bookings' && <>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{t('providerBusiness.stripe.tab.bookings')}</Text>
      <Text style={[styles.sectionNote, { color: C.sub }]}>{t('providerBusiness.stripe.bookings.note')}</Text>
      {!!payoutError && <Notice text={payoutError} />}
      {!loading && !payoutError && payouts.length === 0 && <EmptyState icon="receipt-outline" title={t('providerBusiness.stripe.bookings.emptyTitle')} detail={t('providerBusiness.stripe.bookings.emptyBody')} />}
      {payouts.map(row => <BookingPayment key={row.id} row={row} busy={busy} onRefund={() => requestRefund(row)} />)}
      {feeEarnings.length > 0 && <>
        <Text style={[styles.sectionTitle, { color: C.text }]}>{t('providerBusiness.stripe.fees.title')}</Text>
        <Text style={[styles.sectionNote, { color: C.sub }]}>{t('providerBusiness.stripe.fees.note')}</Text>
        {feeEarnings.map(fee => <View key={fee.id} style={[styles.booking, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.bookingHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: C.text }]}>{fee.kind === 'late' ? t('providerBusiness.stripe.fees.late') : t('providerBusiness.stripe.fees.noShow')}{fee.serviceName ? ` · ${fee.serviceName}` : ''}</Text>
              <Text style={[styles.description, { color: C.text }]}>{fee.customerName || t('providerBusiness.stripe.client')}</Text>
              {!!fee.chargedAt && <Text style={[styles.caption, { color: C.sub }]}>{t('providerBusiness.stripe.fees.charged', { date: date(new Date(fee.chargedAt).getTime()) })}</Text>}
            </View>
            <Text style={[styles.amountSmall, { color: C.text }]}>{fee.payoutPence != null ? money(fee.payoutPence, 'gbp') : money(fee.amountPence, 'gbp')}</Text>
          </View>
          <StatusBadge label={feeStatusLabel(fee)} attention={fee.openDispute || fee.payoutStatus === 'failed'} />
        </View>)}
      </>}
    </>}

    {section === 'payouts' && <>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{t('providerBusiness.stripe.journey.title')}</Text>
      <View style={[styles.journey, { backgroundColor: C.surface }]}>
        {[
          ['1', t('providerBusiness.stripe.journey.step1'), `${holdDays ? payoutHoldSentence(holdDays) : t('providerBusiness.stripe.journey.step1Default')} ${t('providerBusiness.stripe.journey.step1Change')}`],
          ['2', t('providerBusiness.stripe.payout.transferred'), t('providerBusiness.stripe.journey.step2Body')],
          ['3', t('providerBusiness.stripe.journey.step3'), t('providerBusiness.stripe.journey.step3Body')],
        ].map(([step, title, detail]) => <View key={step} style={styles.step}>
          <View style={[styles.stepNumber, { backgroundColor: C.card }]}><Text style={[styles.label, { color: C.accentText }]}>{step}</Text></View>
          <View style={{ flex: 1 }}><Text style={[styles.label, { color: C.text }]}>{title}</Text><Text style={[styles.caption, { color: C.text }]}>{detail}</Text></View>
        </View>)}
      </View>
      <Card title={t('providerBusiness.stripe.bank.title')} sub={t('providerBusiness.stripe.bank.sub')}>
        {!!financeError && <Notice text={financeError} />}
        {!loading && !financeError && !finance?.payouts.length && <EmptyState icon="wallet-outline" title={t('providerBusiness.stripe.bank.emptyTitle')} detail={t('providerBusiness.stripe.bank.emptyBody')} />}
        {finance?.payouts.map(p => <View key={p.id} style={[styles.bankRow, { borderColor: C.border }]}>
          <View style={styles.row}><Text style={[styles.amountSmall, { color: C.text }]}>{money(p.amount, p.currency)}</Text>
            <StatusBadge label={bankLabels[p.status] ? t(bankLabels[p.status]!) : t('providerBusiness.stripe.bank.unknown')} attention={p.status === 'failed'} /></View>
          <Text style={[styles.description, { color: C.text }]}>{p.status === 'paid' ? t('providerBusiness.stripe.bank.arrival') : t('providerBusiness.stripe.bank.expected')} · {date(p.arrivalDate * 1000)}</Text>
          <Text style={[styles.caption, { color: C.sub }]}>{p.automatic ? t('providerBusiness.stripe.bank.scheduled') : t('providerBusiness.stripe.bank.manual')} · {t('providerBusiness.stripe.bank.created', { date: date(p.created * 1000) })}</Text>
          {p.status === 'failed' && <Text style={[styles.description, { color: C.text }]}>{t('providerBusiness.stripe.bank.failedHint')}</Text>}
        </View>)}
        {finance?.hasMore && <PaymentAction secondary disabled={moreLoading || loading} label={moreLoading ? t('providerBusiness.stripe.loading') : t('providerBusiness.stripe.loadEarlier')} onPress={() => void loadMore()} />}
        {account?.connected && <PaymentAction disabled={busy} label={t('providerBusiness.stripe.manageAccount')} onPress={() => void openStripe('dashboard')} />}
      </Card>
    </>}
    {section === 'settings' && <>
      <Card title={t('providerBusiness.stripe.hold.title')} sub={t('providerBusiness.stripe.hold.sub')}>
        {!!holdError && <Notice text={holdError} />}
        {holdUnavailable
          ? <Notice text={t('providerBusiness.stripe.hold.unavailable')} />
          : <>
            <View style={styles.holdOptions}>
              {PAYOUT_HOLD_DAY_OPTIONS.map(days => {
                const selected = days === holdDays;
                return <TouchableOpacity key={days} accessibilityRole="radio" accessibilityState={{ selected, disabled: holdSaving || !holdDays }}
                  disabled={holdSaving || !holdDays} onPress={() => void chooseHoldDays(days)} activeOpacity={0.75}
                  style={[styles.holdOption, { backgroundColor: selected ? C.accent : C.surface, borderColor: C.border }]}>
                  <Text style={[styles.label, { color: selected ? C.bg : C.text }]}>{payoutHoldLabel(days)}</Text>
                </TouchableOpacity>;
              })}
            </View>
            <Text style={[styles.caption, { color: C.sub, marginTop: 10 }]}>{t('providerBusiness.stripe.hold.note')}</Text>
          </>}
      </Card>
      {children}
    </>}
  </>;
}

function feeStatusLabel(fee: ProviderFeeEarning): string {
  if (fee.status === 'refunded') return tr('providerBusiness.stripe.fee.refunded');
  if (fee.openDispute) return tr('providerBusiness.stripe.fee.disputed');
  switch (fee.payoutStatus) {
    case 'held': return fee.releaseAfter ? tr('providerBusiness.stripe.fee.releasedFrom', { date: date(new Date(fee.releaseAfter).getTime()) }) : tr('providerBusiness.stripe.fee.held');
    case 'transferred': return tr('providerBusiness.stripe.payout.transferred');
    case 'reversed': return tr('providerBusiness.stripe.fee.reversed');
    case 'failed': return tr('providerBusiness.stripe.payout.failed');
    case 'cancelled': return tr('providerBusiness.stripe.payout.cancelled');
    default: return tr('providerBusiness.stripe.fee.processing');
  }
}
const bankLabels: Partial<Record<string, TranslationKey>> = { pending: 'providerBusiness.stripe.bank.status.pending', in_transit: 'providerBusiness.stripe.bank.status.inTransit', paid: 'providerBusiness.stripe.bank.status.paid', failed: 'providerBusiness.stripe.payout.failed', canceled: 'providerBusiness.stripe.payout.cancelled' };
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
const balances = (rows: { amount: number; currency: string }[]) => rows.length ? rows.map(row => money(row.amount, row.currency)).join('\n') : '£0.00';
const date = (value: number) => new Date(value).toLocaleDateString(localeForLanguage(), { day: 'numeric', month: 'short', year: 'numeric' });

function BookingPayment({ row, busy, onRefund }: { row: ProviderPayout; busy: boolean; onRefund: () => void }) {
  const C = useBusinessPalette();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.booking, { backgroundColor: C.card, borderColor: C.border }]}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.bookingHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: C.text }]}>{row.booking?.service_name_snapshot || t('providerBusiness.stripe.bookingPayment')}</Text>
        <Text style={[styles.description, { color: C.text }]}>{row.booking?.customer_name || t('providerBusiness.stripe.client')}</Text>
        <Text style={[styles.caption, { color: C.sub }]}>{t('providerBusiness.stripe.recorded', { date: date(new Date(row.created_at).getTime()) })}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={[styles.amountSmall, { color: C.text }]}>{money(row.payout_amount, row.currency)}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.accentText} /></View>
    </TouchableOpacity>
    <StatusBadge label={t(payoutLabels[row.status])} attention={row.status === 'failed'} />
    {expanded && <View style={[styles.breakdown, { borderColor: C.border }]}>
      {[[t('providerBusiness.stripe.shareBeforeRefunds'), row.payout_amount]].map(([label, amount]) => <View key={label} style={styles.row}>
        <Text style={[styles.description, { color: C.text }]}>{label}</Text><Text style={[styles.label, { color: C.text }]}>{money(Number(amount), row.currency)}</Text>
      </View>)}
      <Text style={[styles.caption, { color: C.text, marginTop: 12 }]}>{row.status === 'held' ? t('providerBusiness.stripe.detail.held', { date: date(new Date(row.release_after).getTime()) }) : row.status === 'transferred' ? t('providerBusiness.stripe.detail.transferred') : row.status === 'failed' ? t('providerBusiness.stripe.detail.failed') : t('providerBusiness.stripe.detail.cancelled')}</Text>
      {['held', 'transferred', 'failed'].includes(row.status) && <PaymentAction secondary disabled={busy} label={t('providerBusiness.stripe.refundClient')} onPress={onRefund} />}
    </View>}
  </View>;
}
function IconCard({ icon, title, sub, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; children: React.ReactNode }) {
  const C = useBusinessPalette();
  return <View style={[styles.iconCard, { backgroundColor: C.card, borderColor: C.border }]}>
    <View style={styles.iconCardHead}>
      <View style={[styles.iconChip, { backgroundColor: C.surface }]}><Ionicons name={icon} size={18} color={C.accentText} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: C.text, fontSize: 15 }]}>{title}</Text>
        <Text style={[styles.caption, { color: C.sub }]}>{sub}</Text>
      </View>
    </View>
    {children}
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
  tab: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 56, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  iconChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { width: 32, height: 32 },
  tabLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, flexShrink: 1 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  refresh: { padding: 12, minWidth: 44, minHeight: 44 },
  hero: { padding: 20, borderRadius: 22, marginBottom: 12 },
  heroLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.4, opacity: 0.85 },
  heroAmount: { fontFamily: 'BakbakOne-Regular', fontSize: 38, marginTop: 8, marginBottom: 6 },
  heroNote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 20 },
  heroDivider: { borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.3, marginTop: 16, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  heroPending: { fontFamily: 'BakbakOne-Regular', fontSize: 17, textAlign: 'right' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  rowAction: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  iconCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  iconCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  amountPanel: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 12, marginTop: 8 },
  groupTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 16, marginTop: 10, marginBottom: 10, marginHorizontal: 4 },
  setupGrid: { flexDirection: 'row', gap: 10 },
  setupTile: { flex: 1, minHeight: 84, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  amount: { fontFamily: 'BakbakOne-Regular', fontSize: 22 },
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
  holdOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  holdOption: { paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  action: { padding: 14, minHeight: 48, borderRadius: 14, marginTop: 12 },
});
