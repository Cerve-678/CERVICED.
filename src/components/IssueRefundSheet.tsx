import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProviderRefundState, refundProviderBooking, type ProviderRefundState } from '../services/providerPaymentService';
import { getRefundRequestsForBooking } from '../services/databaseService';
import { describeRefundRequestTimeline, isRefundRequestOpen } from '../features/bookings/refundRequestTimeline';
import type { RefundRequest } from '../types/booking';
import RefundRequestTimeline from './RefundRequestTimeline';
import { describeSettlementTiming } from '../features/bookings/paymentPresentation';
import { newRequestId } from '../utils/requestId';
import { logger } from '../utils/logger';
import { toUserMessage } from '../utils/userFacingError';

// ── Issue Refund sheet ──────────────────────────────────────────────────────
// The provider's one refund surface, opened from a booking's detail screen and
// from Payments → Booking payments. Amounts are the provider's own share — the
// platform fee is never shown (it isn't theirs). When the client's late
// cancellation was already settled by the provider's policy, that is shown as
// done and the only choice is refunding MORE on top: never "apply the policy"
// again. A reason is required before money moves. Issuing a refund does NOT
// cancel the appointment; that's the separate Cancel action. When the client
// has an open refund request, it sits at the top with its timeline, so the
// provider can see what they're answering while they choose the amount.

// Why a refund is being issued. A refund isn't one thing — it can settle a
// cancellation, a client dispute, or something that went wrong with a service
// that already happened — so the provider picks the reason before any money
// moves, and it's recorded on the refund for later reference.
const REFUND_REASONS = [
  'Appointment cancelled',
  'Client complaint',
  'Issue with the service',
  'Goodwill gesture',
  'Other',
] as const;

// What goes back to the client vs what the provider keeps. Exported so the
// booking detail's payment summary colours refunds the same way.
export const REFUND_GREEN = { light: '#2F7D55', dark: '#6CC79A' };
export const REFUND_KEEP = { light: '#A0603A', dark: '#D9A27E' };
const formatPence = (p: number) => `£${(p / 100).toFixed(2)}`;
/** 'full' = everything back (fee included); 'custom' = an amount out of the
 *  provider's share — the only option once their policy has settled a
 *  client's cancellation. */
type RefundMode = 'full' | 'custom';

export interface RefundSheetPalette {
  bg: string; surface: string; card: string; accent: string;
  text: string; sub: string; border: string; iconBg: string;
}

export interface RefundSheetBooking {
  id: string;
  customerName?: string | null | undefined;
  serviceName?: string | null | undefined;
}

/** What happened, plus the confirmation copy both callers show. */
export interface RefundIssued {
  completed: boolean;
  isFull: boolean;
  title: string;
  message: string;
}

/** Mount only while open: each mount is a fresh refund attempt (new request
 *  id, reloaded state), so a retry after a failure can never refund twice. */
export default function IssueRefundSheet({ booking, palette: P, isDarkMode, onClose, onRefunded }: {
  booking: RefundSheetBooking;
  palette: RefundSheetPalette;
  isDarkMode: boolean;
  onClose: () => void;
  onRefunded: (result: RefundIssued) => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const requestId = useRef<string>(newRequestId());
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // What the sheet shows comes from the server (getProviderRefundState); the
  // refund-payment function re-derives every figure when the refund is made.
  const [state, setState] = useState<ProviderRefundState | null>(null);
  const [stateError, setStateError] = useState(false);
  const [mode, setMode] = useState<RefundMode>('full');
  // After a policy settlement the sheet is a summary first; a partial refund
  // is opt-in from there.
  const [partialOpen, setPartialOpen] = useState(false);
  const [amountText, setAmountText] = useState('');

  const loadState = useCallback(async () => {
    setState(null);
    setStateError(false);
    try {
      const next = await getProviderRefundState(booking.id);
      setState(next);
      setMode(next.policySettlement || next.anyRefunded ? 'custom' : 'full');
    } catch (err) {
      logger.error('[IssueRefundSheet] refund state failed to load:', err);
      setStateError(true);
    }
  }, [booking.id]);

  useEffect(() => { void loadState(); }, [loadState]);

  // The client's open refund request, if any. Loaded here rather than passed
  // in so both callers (booking detail, Payments) show it.
  const [clientRequest, setClientRequest] = useState<RefundRequest | null>(null);
  useEffect(() => {
    let active = true;
    getRefundRequestsForBooking(booking.id)
      .then(rows => { if (active) setClientRequest(rows.find(isRefundRequestOpen) ?? null); })
      // Without the card the refund itself still works; the request is on the booking.
      .catch(err => logger.error('[IssueRefundSheet] refund request failed to load:', err));
    return () => { active = false; };
  }, [booking.id]);
  const requestSteps = useMemo(
    () => (clientRequest ? describeRefundRequestTimeline(clientRequest, null, 'provider') : null),
    [clientRequest],
  );

  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);

  // The amount this refund would move, in pence, plus any reason it can't go.
  // Mirrors supabase/functions/_shared/refundPlan.ts for display only.
  const preview = useMemo(() => {
    if (!state) return { refundPence: 0, keepPence: 0, error: null as string | null };
    const held = state.heldPence;
    if (mode === 'full') return { refundPence: held, keepPence: 0, error: null };
    const typed = amountText.trim();
    const pence = Math.round(Number(typed) * 100);
    if (!typed) return { refundPence: 0, keepPence: held, error: null };
    if (!Number.isFinite(pence) || pence <= 0) return { refundPence: 0, keepPence: held, error: 'Enter an amount above £0.00.' };
    if (pence > held) return { refundPence: 0, keepPence: held, error: `You can refund at most ${formatPence(held)}.` };
    return { refundPence: pence, keepPence: held - pence, error: null };
  }, [state, mode, amountText]);

  const submit = useCallback(async () => {
    if (!reason || busy || !state) return;
    if (preview.error || preview.refundPence <= 0) return;
    setBusy(true);
    setSubmitError('');
    try {
      const trimmed = note.trim();
      const isFull = mode === 'full';
      // Throws on failure (see refundProviderBooking).
      const completed = await refundProviderBooking({
        bookingId: booking.id,
        reason: trimmed ? `${reason} — ${trimmed}` : reason,
        ...(isFull ? {} : { amountPence: preview.refundPence }),
        requestId: requestId.current,
      });
      const who = booking.customerName?.split(' ')[0] || 'your client';
      onRefunded({
        completed,
        isFull,
        title: completed ? 'Refund issued' : 'Refund processing',
        message: completed
          ? `${isFull ? `${who} is being refunded in full` : `${formatPence(preview.refundPence)} is on its way back to ${who}`}. Their bank may take a few days to show it.`
          : 'Stripe is still processing the refund. Check again shortly.',
      });
    } catch (err) {
      // refund-payment's 409 messages are written for the provider ("You can
      // refund at most £20.00."); anything else falls back to the generic copy.
      setSubmitError(err instanceof Error && /^(You can|Enter an|There is nothing|This booking has|A refund for)/.test(err.message)
        ? err.message
        : toUserMessage(err, 'The refund could not be confirmed. Refresh before trying again.', 'IssueRefundSheet.refund'));
    } finally {
      setBusy(false);
    }
  }, [booking, reason, note, busy, state, preview, mode, onRefunded]);

  const first = booking.customerName?.split(' ')[0];
  const canSubmit = !!state && state.heldPence > 0 && !!reason
    && !(reason === 'Other' && !note.trim())
    && !preview.error && preview.refundPence > 0;
  const ctaLabel = mode === 'full' ? `Refund ${first || 'client'} in full` : `Refund ${formatPence(preview.refundPence)} to ${first || 'client'}`;
  // Nothing to submit until they opt into a partial refund (or there's
  // nothing left to refund): the sheet is just the summary.
  const summaryOnly = !!state && (state.heldPence <= 0 || (!!state.policySettlement && !partialOpen));

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={close}>
      {/* Keep the form above the keyboard and scroll focused fields into view. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={[styles.overlay, StyleSheet.absoluteFill]} activeOpacity={1} onPress={close} />
          <View style={[styles.sheet, { backgroundColor: P.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.handle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)' }]} />
            <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}>
              <View style={styles.head}>
                <View style={[styles.headIcon, { backgroundColor: P.iconBg }]}>
                  <Ionicons name="arrow-undo-outline" size={20} color={P.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: P.text }]}>Issue a refund</Text>
                  <Text style={{ color: P.sub, fontSize: 13 }} numberOfLines={1}>
                    {booking.customerName || 'Client'} · {booking.serviceName || 'Booking'}
                  </Text>
                </View>
              </View>

              {clientRequest && requestSteps && (
                <View style={[styles.card, { backgroundColor: P.card, gap: 8, marginBottom: 12 }]}>
                  <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }}>
                    {first ? `${first}'s refund request` : 'Refund request'}
                  </Text>
                  {!!clientRequest.message && (
                    <Text style={{ color: P.sub, fontSize: 13, lineHeight: 18 }}>“{clientRequest.message}”</Text>
                  )}
                  <RefundRequestTimeline steps={requestSteps} colors={P} />
                </View>
              )}

              {stateError ? (
                <View style={[styles.card, { backgroundColor: P.card }]}>
                  <Text style={{ color: P.text, fontSize: 14 }}>Couldn't load this booking's payment.</Text>
                  <TouchableOpacity onPress={() => void loadState()} activeOpacity={0.7} style={{ marginTop: 8 }}>
                    <Text style={{ color: P.accent, fontWeight: '600' }}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : !state ? (
                <ActivityIndicator color={P.accent} style={{ marginVertical: 32 }} />
              ) : (() => {
                const green = isDarkMode ? REFUND_GREEN.dark : REFUND_GREEN.light;
                const keep = isDarkMode ? REFUND_KEEP.dark : REFUND_KEEP.light;
                const name = first || 'the client';
                const held = state.heldPence;
                const settled = state.policySettlement;
                const modes: RefundMode[] = state.anyRefunded ? ['custom', 'full'] : ['full', 'custom'];
                const timing = settled ? describeSettlementTiming(settled.hoursBefore, settled.noticeHours, settled.movedLate) : null;
                const optionCopy: Record<RefundMode, { title: string; sub: string; value: string }> = {
                  full: {
                    title: 'Full refund',
                    sub: state.paidAs === 'deposit'
                      ? `The deposit ${name} paid in app, less anything already refunded`
                      : `Everything ${name} paid that hasn't come back yet`,
                    value: formatPence(held),
                  },
                  custom: { title: 'Partial refund', sub: 'Choose an amount', value: '' },
                };
                const total = Math.max(held, 1);
                return (
                  <>
                    <View style={[styles.card, { backgroundColor: P.card }]}>
                      <View style={styles.rowBetween}>
                        <Text style={{ color: P.text, fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>{booking.serviceName || 'Booking'}</Text>
                        <Text style={[styles.amount, { color: P.text }]}>{formatPence(state.sharePence)}</Text>
                      </View>
                      <Text style={{ color: P.sub, fontSize: 12, marginTop: 2 }}>
                        {state.paidAs === 'deposit'
                          ? `Deposit paid in app · booking price ${formatPence(state.bookingPricePence)}`
                          : 'Paid in full in app'}
                      </Text>
                      {state.paidAs === 'deposit' && (
                        <Text style={{ color: P.sub, fontSize: 12, marginTop: 4 }}>
                          Only the deposit went through CERVICED, so only the deposit can be refunded here.
                        </Text>
                      )}
                      {settled && (
                        <View style={[styles.settled, { backgroundColor: green + '1A' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="shield-checkmark-outline" size={15} color={green} />
                            <Text style={{ color: green, fontWeight: '700', fontSize: 13 }}>Your policy was applied automatically</Text>
                          </View>
                          {!!timing && <Text style={{ color: P.text, fontSize: 13 }}>{timing}</Text>}
                          {settled.refundedToClientPence > 0 && (
                            <View style={styles.rowBetween}>
                              <Text style={{ color: P.text, fontSize: 13 }}>Refunded to {name}</Text>
                              <Text style={{ color: P.text, fontSize: 13 }}>{formatPence(settled.refundedToClientPence)}</Text>
                            </View>
                          )}
                          <View style={styles.rowBetween}>
                            <Text style={{ color: P.text, fontSize: 13 }}>You kept{settled.keptIsDeposit ? ' (deposit)' : ''}</Text>
                            <Text style={{ color: P.text, fontSize: 13, fontWeight: '700' }}>{formatPence(settled.providerKeptPence)}</Text>
                          </View>
                        </View>
                      )}
                    </View>

                    {held <= 0 ? (
                      <Text style={{ color: P.sub, fontSize: 14, marginTop: 16 }}>There's nothing left of your share to refund on this booking.</Text>
                    ) : (
                      <>
                        {settled ? (
                          partialOpen ? (
                            <Text style={[styles.heading, { color: P.sub, marginTop: 18 }]}>PARTIAL REFUND</Text>
                          ) : (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => { setMode('custom'); setPartialOpen(true); }}
                              style={[styles.optionRow, { backgroundColor: P.card, borderColor: P.border, marginTop: 16 }]}
                            >
                              <Ionicons name="add-circle-outline" size={18} color={P.accent} />
                              <View style={styles.optionText}>
                                <Text style={[styles.optionLabel, { color: P.text }]}>Give a partial refund</Text>
                                <Text style={[styles.optionSub, { color: P.sub }]}>Optional · up to {formatPence(held)}</Text>
                              </View>
                              <Ionicons name="chevron-forward" size={14} color={P.text + '44'} />
                            </TouchableOpacity>
                          )
                        ) : (
                          <>
                            <Text style={[styles.heading, { color: P.sub, marginTop: 18 }]}>HOW MUCH TO REFUND</Text>
                            {modes.map(m => {
                              const selected = mode === m;
                              return (
                                <TouchableOpacity
                                  key={m}
                                  activeOpacity={0.7}
                                  disabled={busy}
                                  onPress={() => setMode(m)}
                                  accessibilityRole="radio"
                                  accessibilityState={{ selected }}
                                  style={[styles.optionRow, { backgroundColor: P.card, borderColor: selected ? P.accent : P.border }]}
                                >
                                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? P.accent : P.text + '55'} />
                                  <View style={styles.optionText}>
                                    <Text style={[styles.optionLabel, { color: P.text }]}>{optionCopy[m].title}</Text>
                                    <Text style={[styles.optionSub, { color: P.sub }]}>{optionCopy[m].sub}</Text>
                                  </View>
                                  {!!optionCopy[m].value && <Text style={{ color: P.text, fontWeight: '700', fontSize: 14 }}>{optionCopy[m].value}</Text>}
                                </TouchableOpacity>
                              );
                            })}
                          </>
                        )}
                        {(!settled || partialOpen) && (
                          <>
                            {mode === 'custom' && (
                              <>
                                <View style={[styles.amountInputRow, { backgroundColor: P.card, borderColor: P.accent }]}>
                                  <Text style={[styles.amount, { color: P.sub }]}>£</Text>
                                  <TextInput
                                    style={[styles.amountInput, { color: P.text }]}
                                    value={amountText}
                                    onChangeText={t => setAmountText(t.replace(/[^0-9.]/g, ''))}
                                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                    placeholderTextColor={P.text + '44'}
                                    editable={!busy}
                                    autoFocus
                                  />
                                  <Text style={{ color: P.sub, fontSize: 12 }}>max {formatPence(held)}</Text>
                                </View>
                                {!!preview.error && <Text style={styles.error}>{preview.error}</Text>}
                              </>
                            )}

                            <View style={[styles.split, { backgroundColor: P.card, borderColor: P.border }]}>
                              <View style={[styles.bar, { backgroundColor: P.surface }]}>
                                <View style={{ flex: preview.refundPence / total, backgroundColor: green }} />
                                <View style={{ flex: preview.keepPence / total, backgroundColor: keep }} />
                              </View>
                              <View style={{ padding: 12, gap: 6 }}>
                                <View style={styles.rowBetween}>
                                  <Text style={{ color: P.text, fontSize: 13 }}><Text style={{ color: green }}>■ </Text>Back to {name}</Text>
                                  <Text style={{ color: P.text, fontSize: 13, fontWeight: '700' }}>{formatPence(preview.refundPence)}</Text>
                                </View>
                                <View style={styles.rowBetween}>
                                  <Text style={{ color: P.text, fontSize: 13 }}><Text style={{ color: keep }}>■ </Text>You keep</Text>
                                  <Text style={{ color: P.text, fontSize: 13 }}>{formatPence(preview.keepPence)}</Text>
                                </View>
                              </View>
                            </View>

                            <Text style={[styles.heading, { color: P.sub, marginTop: 18 }]}>REASON</Text>
                            <View style={styles.chips}>
                              {REFUND_REASONS.map(r => {
                                const selected = reason === r;
                                return (
                                  <TouchableOpacity
                                    key={r}
                                    activeOpacity={0.7}
                                    disabled={busy}
                                    onPress={() => setReason(r)}
                                    style={[styles.chip, { backgroundColor: selected ? P.iconBg : P.card, borderColor: selected ? P.accent : P.border }]}
                                  >
                                    <Text style={{ color: P.text, fontSize: 13, fontWeight: selected ? '600' : '400' }}>{r}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <TextInput
                              style={[styles.noteInput, { color: P.text, backgroundColor: P.card, borderColor: P.border }]}
                              placeholder={reason === 'Other' ? 'Add a note (required)' : 'Add a note (optional)'}
                              placeholderTextColor={P.text + '44'}
                              value={note}
                              onChangeText={setNote}
                              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
                              multiline
                              maxLength={500}
                              editable={!busy}
                            />
                            <Text style={{ color: P.sub, fontSize: 12 }}>This doesn't cancel the appointment. Banks usually take 5–10 working days to show a refund.</Text>
                          </>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </ScrollView>
            <View style={[styles.foot, { borderTopColor: P.border }]}>
              {summaryOnly ? (
                <TouchableOpacity style={[styles.cta, { backgroundColor: P.accent }]} activeOpacity={0.8} onPress={onClose}>
                  <Text style={styles.ctaText}>Done</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {!!submitError && <Text accessibilityLiveRegion="polite" style={[styles.error, { marginBottom: 8 }]}>{submitError}</Text>}
                  <TouchableOpacity
                    style={[styles.cta, { backgroundColor: P.accent, opacity: canSubmit ? 1 : 0.4 }]}
                    activeOpacity={0.8}
                    disabled={!canSubmit || busy}
                    onPress={() => void submit()}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={styles.ctaText}>{state && state.heldPence > 0 && !reason ? 'Choose a reason' : ctaLabel}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={{ alignItems: 'center', padding: 8 }} disabled={busy} onPress={onClose} activeOpacity={0.7}>
                    <Text style={{ color: P.sub, fontSize: 14 }}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 14 },
  headIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 21 },
  card: { borderRadius: 16, padding: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  amount: { fontFamily: 'BakbakOne-Regular', fontSize: 20 },
  settled: { marginTop: 10, borderRadius: 12, padding: 10, gap: 4 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  amountInput: { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 22, paddingVertical: 2 },
  error: { color: '#E5484D', fontSize: 12, marginBottom: 4, marginLeft: 2 },
  split: { marginTop: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  bar: { flexDirection: 'row', height: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  noteInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 56, textAlignVertical: 'top', marginTop: 10, marginBottom: 10 },
  foot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  cta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 4, marginBottom: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionSub: { fontSize: 12, marginTop: 1 },
});
