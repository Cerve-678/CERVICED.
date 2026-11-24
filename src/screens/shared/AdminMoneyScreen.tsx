import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import {
  adminDeclineRefundRequest, adminRetryPayout, assignBankDispute, getAdminBankDisputes, getAdminMoneyOverview,
  refundProviderBooking,
} from '../../services/databaseService';
import {
  type BankDisputeView, describeBankDispute, describeFailedPayout, describeOwed, describeRefundRequest, formatPence,
  parsePounds,
} from '../../features/admin/moneyPresentation';
import type { AdminBankDispute, AdminMoneyOverview, AdminRefundRequest } from '../../types/adminMoney';
import { newRequestId } from '../../utils/requestId';
import { logger } from '../../utils/logger';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';

// ── Admin Money screen ─────────────────────────────────────────────────────
// Only reachable from the settings row an admin account sees (admin_users),
// and every read and action is refused server-side for anyone else. Four
// lists: payouts to providers that failed, money providers owe, refund
// requests, and bank disputes that need someone to say which booking they're
// about. Internal tool, so its copy is English only.

type Tab = 'failed' | 'owed' | 'refunds' | 'disputes';

export default function AdminMoneyScreen({ navigation }: any) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const [tab, setTab] = useState<Tab>('failed');
  const [data, setData] = useState<AdminMoneyOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<AdminRefundRequest | null>(null);
  const [disputes, setDisputes] = useState<AdminBankDispute[] | null>(null);
  const [disputesError, setDisputesError] = useState(false);
  /** Bookings ticked on each dispute card, by dispute id. */
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setLoadError(false);
    setDisputesError(false);
    // Separate so one list failing doesn't blank the other.
    const [overview, disputeList] = await Promise.allSettled([getAdminMoneyOverview(), getAdminBankDisputes()]);
    if (overview.status === 'fulfilled') setData(overview.value);
    else {
      logger.error('[AdminMoney] overview failed to load:', overview.reason);
      setLoadError(true);
    }
    if (disputeList.status === 'fulfilled') setDisputes(disputeList.value);
    else {
      logger.error('[AdminMoney] disputes failed to load:', disputeList.reason);
      setDisputesError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback((payoutId: string, label: string) => {
    showConfirm('Try this payment again?', `${label} goes out on the next payment run, within 15 minutes.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Try again',
        onPress: async () => {
          setBusyId(payoutId);
          try {
            await adminRetryPayout(payoutId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            // Reloading turns the card's button into the "In the next payment
            // run" panel, read from the server, so it's still there on return.
            await load();
          } catch (err) {
            showAlert("Couldn't retry it", toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', 'AdminMoney.retry'));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }, [load, showAlert, showConfirm]);

  const togglePick = useCallback((disputeId: string, bookingId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked(prev => {
      const current = prev[disputeId] ?? [];
      return {
        ...prev,
        [disputeId]: current.includes(bookingId) ? current.filter(id => id !== bookingId) : [...current, bookingId],
      };
    });
  }, []);

  const assign = useCallback((view: BankDisputeView) => {
    const chosen = pickedFor(view, picked);
    if (chosen.length === 0) return;
    const names = view.bookings.filter(b => chosen.includes(b.key)).map(b => b.title).join('\n');
    const others = view.bookings.length - chosen.length;
    showConfirm(
      view.unfinished ? 'Finish taking it back?' : 'Is the dispute about these?',
      view.unfinished
        ? `${names}\n\nTaking back what these providers were paid didn't finish last time. Nothing is taken twice.`
        : `${names}\n\nWhat these providers were paid for them is taken back now.${others > 0 ? ` The other ${others === 1 ? 'booking is' : `${others} bookings are`} paid as normal.` : ''} You can't change this afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: view.unfinished ? 'Finish it' : 'Yes, these',
          onPress: async () => {
            setBusyId(view.key);
            try {
              await assignBankDispute(view.key, chosen);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setPicked(prev => { const next = { ...prev }; delete next[view.key]; return next; });
              await load();
            } catch (err) {
              showAlert("Couldn't save that", err instanceof Error && err.message ? err.message : 'Please try again in a moment.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }, [picked, load, showAlert, showConfirm]);

  const now = useMemo(() => new Date(), [data]);
  const failed = useMemo(() => (data?.failed ?? []).map(f => describeFailedPayout(f, now)), [data, now]);
  const anyQueued = failed.some(f => f.queued);

  // While a payment is waiting on the run, check every minute so its card
  // goes away (or shows the new reason) without a pull to refresh.
  useEffect(() => {
    if (!anyQueued) return;
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [anyQueued, load]);
  const owed = useMemo(() => (data?.owed ?? []).map(describeOwed), [data]);
  const refunds = useMemo(() => (data?.refunds ?? []).map(r => ({ row: r, view: describeRefundRequest(r, now) })), [data, now]);
  const disputeViews = useMemo(() => (disputes ?? []).map(describeBankDispute), [disputes]);

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'failed', label: 'FAILED', count: data?.failed_count ?? 0 },
    { id: 'owed', label: 'OWED', count: data?.owed_count ?? 0 },
    { id: 'refunds', label: 'REFUNDS', count: data?.refunds_count ?? 0 },
    { id: 'disputes', label: 'DISPUTES', count: disputes?.length ?? 0 },
  ];

  const card = [styles.card, { backgroundColor: P.card, borderColor: P.border }];

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={P.accent} />}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: P.text }]}>MONEY</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>Things that need you. Only admin accounts can see this screen.</Text>

        <View style={styles.tabs}>
          {tabs.map(t => {
            const selected = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setTab(t.id); }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.tab, { backgroundColor: selected ? P.accent : P.card, borderColor: P.border }]}
              >
                <Text style={[styles.tabLabel, { color: selected ? P.onAccent : P.accentText }]} numberOfLines={1} adjustsFontSizeToFit>{t.label} </Text>
                <Text style={[styles.tabCount, { color: selected ? P.onAccent : P.accentText }]}>{t.count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'disputes' ? (
          disputesError ? (
            <View style={card}>
              <Text style={[styles.body, { color: P.text }]}>Couldn't load the disputes.</Text>
              <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} style={{ marginTop: 8 }}>
                <Text style={{ color: P.accentText, fontWeight: '600' }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : !disputes ? (
            <ActivityIndicator color={P.accent} style={{ marginTop: 32 }} />
          ) : (
            <>
              <Text style={[styles.section, { color: P.sub }]}>BANK DISPUTES TO MATCH</Text>
              <Text style={[styles.small, { color: P.sub, marginBottom: 12 }]}>
                The amount didn't match a booking on the payment, so nothing has been taken back and these providers' payouts are on hold. Pick the booking(s) the client is disputing. Answer the dispute itself in Stripe.
              </Text>
              {disputeViews.length === 0 && <Text style={[styles.empty, { color: P.sub }]}>No disputes need matching.</Text>}
              {disputeViews.map(view => {
                const chosen = pickedFor(view, picked);
                const busy = busyId === view.key;
                return (
                  <View key={view.key} style={card}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.name, { color: P.text }]} numberOfLines={1}>{view.reason}</Text>
                      <Text style={[styles.amount, { color: P.text }]}>{view.amount}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: view.lost ? '#FF950022' : P.surface }]}>
                      <Text style={[styles.pillText, { color: view.lost ? (isDarkMode ? '#FFB54D' : '#9A5A00') : P.accentText }]}>{view.status}</Text>
                    </View>
                    {view.bookings.map(b => {
                      const on = chosen.includes(b.key);
                      return (
                        <TouchableOpacity
                          key={b.key}
                          onPress={() => togglePick(view.key, b.key)}
                          // An unfinished one is already decided: only pressing again is possible.
                          disabled={busy || view.unfinished}
                          activeOpacity={0.7}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled: busy || view.unfinished }}
                          style={[styles.pickRow, { borderColor: on ? P.accent : P.border, backgroundColor: on ? P.surface : 'transparent' }]}
                        >
                          <View style={[styles.tick, { borderColor: on ? P.accent : P.border, backgroundColor: on ? P.accent : 'transparent' }]}>
                            {on && <Text style={{ color: P.onAccent, fontSize: 12, fontWeight: '700' }}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.body, { color: P.text, fontWeight: '600' }]} numberOfLines={2}>{b.title}</Text>
                            {!!b.detail && <Text style={[styles.small, { color: P.sub }]}>{b.detail}</Text>}
                            {b.matchesAmount && <Text style={[styles.small, { color: P.accentText }]}>Same amount as the dispute</Text>}
                          </View>
                          <Text style={[styles.body, { color: P.text, fontWeight: '700' }]}>{b.amount}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.cta, { backgroundColor: P.accent, opacity: chosen.length && !busy ? 1 : 0.4 }]}
                      disabled={!chosen.length || busy}
                      onPress={() => assign(view)}
                      activeOpacity={0.8}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color={P.onAccent} />
                        : <Text style={[styles.ctaText, { color: P.onAccent }]}>{view.unfinished ? 'FINISH TAKING IT BACK' : chosen.length ? `IT'S ABOUT ${chosen.length === 1 ? 'THIS ONE' : `THESE ${chosen.length}`}` : 'PICK A BOOKING'}</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )
        ) : loadError ? (
          <View style={card}>
            <Text style={[styles.body, { color: P.text }]}>Couldn't load the money lists.</Text>
            <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} style={{ marginTop: 8 }}>
              <Text style={{ color: P.accentText, fontWeight: '600' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !data ? (
          <ActivityIndicator color={P.accent} style={{ marginTop: 32 }} />
        ) : tab === 'failed' ? (
          <>
            <Text style={[styles.section, { color: P.sub }]}>PAYMENTS TO PROVIDERS THAT FAILED</Text>
            {failed.length === 0 && <Text style={[styles.empty, { color: P.sub }]}>Nothing has failed.</Text>}
            {failed.map(f => (
              <View key={f.key} style={card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.name, { color: P.text }]} numberOfLines={1}>{f.name}</Text>
                  <Text style={[styles.amount, { color: P.text }]}>{f.amount}</Text>
                </View>
                <Text style={[styles.body, { color: P.text }]}><Text style={{ fontWeight: '700' }}>Why: </Text>{f.why}</Text>
                <Text style={[styles.small, { color: P.sub }]}>{f.tries}</Text>
                {f.queued ? (
                  <QueuedPanel note={f.queuedNote} dark={isDarkMode} />
                ) : f.canRetry ? (
                  <TouchableOpacity
                    style={[styles.cta, { backgroundColor: P.accent, opacity: busyId === f.key ? 0.5 : 1 }]}
                    disabled={busyId === f.key}
                    onPress={() => retry(f.key, `${f.amount} to ${f.name}`)}
                    activeOpacity={0.8}
                  >
                    {busyId === f.key
                      ? <ActivityIndicator size="small" color={P.onAccent} />
                      : <Text style={[styles.ctaText, { color: P.onAccent }]}>TRY PAYMENT AGAIN NOW</Text>}
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.waiting, { backgroundColor: P.surface }]}>
                    <Text style={[styles.small, { color: P.text }]}>{f.waitingNote}</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        ) : tab === 'owed' ? (
          <>
            <Text style={[styles.section, { color: P.sub }]}>MONEY PROVIDERS OWE</Text>
            {owed.length === 0 && <Text style={[styles.empty, { color: P.sub }]}>No provider owes anything.</Text>}
            {owed.map(o => (
              <View key={o.key} style={card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.name, { color: P.text }]} numberOfLines={1}>{o.name}</Text>
                  <Text style={[styles.amount, { color: P.text }]}>{o.amount}</Text>
                </View>
                <Text style={[styles.body, { color: P.text }]}>{o.why}</Text>
                <Text style={[styles.small, { color: P.sub }]}>{o.plan}</Text>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.section, { color: P.sub }]}>REFUND REQUESTS</Text>
            {refunds.length === 0 && <Text style={[styles.empty, { color: P.sub }]}>No refund requests are open.</Text>}
            {refunds.map(({ row, view }) => (
              <View key={view.key} style={card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.name, { color: P.text }]} numberOfLines={1}>{view.client}</Text>
                  <Text style={[styles.amount, { color: P.text }]}>{view.amount}</Text>
                </View>
                <Text style={[styles.body, { color: P.text }]}>{view.service}</Text>
                <View style={[styles.pill, { backgroundColor: view.needsYou ? '#FF950022' : P.surface }]}>
                  <Text style={[styles.pillText, { color: view.needsYou ? (isDarkMode ? '#FFB54D' : '#9A5A00') : P.accentText }]}>{view.status}</Text>
                </View>
                {view.needsYou && (
                  <TouchableOpacity
                    style={[styles.cta, { backgroundColor: P.accent }]}
                    onPress={() => setReviewing(row)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ctaText, { color: P.onAccent }]}>REVIEW</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        <Text style={[styles.footnote, { color: P.sub }]}>Every button press is saved with who pressed it and when.</Text>
      </ScrollView>

      {reviewing && (
        <RefundReview
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(title, message) => { setReviewing(null); showAlert(title, message); void load(); }}
        />
      )}
      <DialogHost />
    </ThemedBackground>
  );
}

/** Where the retry button was, once the payment is due: says it's on its way
 *  and when. Pops in so pressing the button visibly did something. */
function QueuedPanel({ note, dark }: { note: string | null; dark: boolean }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [pop]);
  const green = dark ? '#6FD08C' : '#2E7D32';
  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={`In the next payment run. ${note ?? ''}`}
      style={[
        styles.queued,
        { backgroundColor: dark ? '#6FD08C1F' : '#2E7D321A', borderColor: green },
        { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
      ]}
    >
      <View style={[styles.queuedTick, { backgroundColor: green }]}>
        <Text style={{ color: dark ? '#0F1A12' : '#FFFFFF', fontSize: 14, fontWeight: '700' }}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: green }]}>IN THE NEXT PAYMENT RUN</Text>
        {!!note && <Text style={[styles.small, { color: green }]}>{note}</Text>}
      </View>
    </Animated.View>
  );
}

/** The bookings ticked on a dispute card. An unfinished one is already
 *  decided, so its bookings are the answer and stay ticked. */
function pickedFor(view: BankDisputeView, picked: Record<string, string[]>): string[] {
  return view.unfinished ? view.bookings.map(b => b.key) : picked[view.key] ?? [];
}

/** One passed-on refund request: what each side said, then approve or decline.
 *  Mounted only while open, so each opening is a fresh refund attempt (new
 *  request id) and a retry after a failure can never refund twice. */
function RefundReview({ request, onClose, onDone }: {
  request: AdminRefundRequest;
  onClose: () => void;
  onDone: (title: string, message: string) => void;
}) {
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const remainingPence = Math.max(0, request.paid_pence - request.refunded_pence);
  const [amountText, setAmountText] = useState((remainingPence / 100).toFixed(2));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState('');
  const [requestId] = useState(newRequestId);
  const client = request.client_name || 'the client';

  const amountPence = parsePounds(amountText);
  const isFull = amountPence === remainingPence;

  const approve = useCallback(async () => {
    if (!amountPence || busy) return;
    setBusy('approve');
    setError('');
    try {
      const completed = await refundProviderBooking({
        bookingId: request.booking_id,
        reason: `Cerviced approved the client's refund request${note.trim() ? ` — ${note.trim()}` : ''}`,
        // A full refund also returns the platform fee; anything less comes out
        // of the provider's share only (refund-payment / refundPlan.ts).
        ...(isFull ? {} : { amountPence }),
        requestId,
      });
      onDone(
        completed ? 'Refund sent' : 'Refund processing',
        completed
          ? `${formatPence(amountPence)} is on its way back to ${client}. The client and provider have been told.`
          : 'Stripe is still processing it. Pull down to refresh shortly.',
      );
    } catch (err) {
      setError(err instanceof Error && /^(You can|Enter an|There is nothing|This booking has|A refund for)/.test(err.message)
        ? err.message
        : toUserMessageAllowingDbGuard(err, "The refund couldn't be confirmed. Refresh before trying again.", 'AdminMoney.approve'));
    } finally {
      setBusy(null);
    }
  }, [amountPence, busy, request.booking_id, note, isFull, requestId, onDone, client]);

  const decline = useCallback(async () => {
    if (!note.trim() || busy) return;
    setBusy('decline');
    setError('');
    try {
      await adminDeclineRefundRequest(request.request_id, note.trim());
      onDone('Request declined', `${client} has been told, with your note.`);
    } catch (err) {
      setError(toUserMessageAllowingDbGuard(err, "Couldn't decline it. Please try again.", 'AdminMoney.decline'));
    } finally {
      setBusy(null);
    }
  }, [note, busy, request.request_id, onDone, client]);

  const field = [styles.input, { color: P.text, backgroundColor: P.surface, borderColor: P.border }];

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, styles.overlay]} activeOpacity={1} onPress={() => { if (!busy) onClose(); }} />
          <View style={[styles.sheet, { backgroundColor: P.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.handle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)' }]} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
              <Text style={[styles.sheetTitle, { color: P.text }]}>REFUND REQUEST</Text>
              <Text style={[styles.small, { color: P.sub, marginBottom: 14 }]}>
                {request.client_name || 'Client'} · {request.service_name || 'Booking'} · {request.provider_name || 'Unknown provider'}
              </Text>

              <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.rowBetween}><Text style={[styles.small, { color: P.sub }]}>Client paid</Text><Text style={[styles.body, { color: P.text, fontWeight: '700' }]}>{formatPence(request.paid_pence)}</Text></View>
                {request.refunded_pence > 0 && (
                  <View style={styles.rowBetween}><Text style={[styles.small, { color: P.sub }]}>Already refunded</Text><Text style={[styles.body, { color: P.text, fontWeight: '700' }]}>{formatPence(request.refunded_pence)}</Text></View>
                )}
                {!!request.booking_date && (
                  <View style={styles.rowBetween}><Text style={[styles.small, { color: P.sub }]}>Appointment</Text><Text style={[styles.body, { color: P.text, fontWeight: '700' }]}>{request.booking_date}</Text></View>
                )}
              </View>

              <Text style={[styles.section, { color: P.sub }]}>WHAT HAPPENED</Text>
              <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
                <Text style={[styles.label, { color: P.text }]}>CLIENT SAID</Text>
                <Text style={[styles.body, { color: P.text, fontWeight: '600' }]}>{request.reason}</Text>
                {!!request.message && <Text style={[styles.body, { color: P.sub }]}>“{request.message}”</Text>}
                <View style={[styles.sep, { backgroundColor: P.border }]} />
                <Text style={[styles.label, { color: P.text }]}>PROVIDER SAID</Text>
                <Text style={[styles.body, { color: P.text }]}>{request.provider_note || 'No reason given.'}</Text>
              </View>

              <Text style={[styles.section, { color: P.sub }]}>YOUR DECISION</Text>
              <Text style={[styles.small, { color: P.sub, marginBottom: 6 }]}>How much to give back (up to {formatPence(remainingPence)})</Text>
              <TextInput
                style={field}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                editable={!busy}
                accessibilityLabel="How much to give back"
              />
              <Text style={[styles.small, { color: P.sub, marginTop: 4 }]}>
                {isFull ? 'Full refund: the platform fee goes back too.' : "A part refund comes out of the provider's share; Cerviced keeps its fee."}
              </Text>
              <Text style={[styles.small, { color: P.sub, marginTop: 14, marginBottom: 6 }]}>Note to the client (needed to decline)</Text>
              <TextInput
                style={[field, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={1000}
                editable={!busy}
                accessibilityLabel="Note to the client"
              />
              {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            </ScrollView>
            <View style={[styles.foot, { borderTopColor: P.border }]}>
              <TouchableOpacity
                style={[styles.footBtn, { borderColor: P.accent, borderWidth: 1, opacity: note.trim() && !busy ? 1 : 0.4 }]}
                disabled={!note.trim() || !!busy}
                onPress={() => void decline()}
                activeOpacity={0.8}
              >
                {busy === 'decline' ? <ActivityIndicator size="small" color={P.accent} /> : <Text style={[styles.ctaText, { color: P.accentText }]}>DECLINE</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footBtn, { backgroundColor: P.accent, opacity: amountPence && !busy ? 1 : 0.4 }]}
                disabled={!amountPence || !!busy}
                onPress={() => void approve()}
                activeOpacity={0.8}
              >
                {busy === 'approve'
                  ? <ActivityIndicator size="small" color={P.onAccent} />
                  : <Text style={[styles.ctaText, { color: P.onAccent }]}>{amountPence ? `REFUND ${formatPence(amountPence)}` : 'ENTER AN AMOUNT'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 32, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.5 },
  tabCount: { fontSize: 13, fontWeight: '700' },
  section: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 2, marginTop: 6, marginBottom: 10 },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 16, letterSpacing: 1, flex: 1 },
  amount: { fontSize: 18, fontWeight: '700' },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },
  cta: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
  waiting: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  queued: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4 },
  queuedTick: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 12 },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.5 },
  footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, textAlign: 'center', marginTop: 8 },
  overlay: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },
  handle: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginVertical: 10 },
  sheetTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 24, letterSpacing: 1 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Jura-VariableFont_wght' },
  error: { color: '#D93025', fontSize: 13, marginTop: 10 },
  foot: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
