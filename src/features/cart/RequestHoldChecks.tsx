import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyRequestCardHolds, requestCardHoldStep, type RequestCardHold } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { holdCheckPrompt, holdNeedsCheck, holdResultLine } from './requestHolds';
import { tr } from '../../i18n';

// Loaded lazily, as in CartScreen: the native module is missing in Expo Go.
const StripeRN: typeof import('@stripe/stripe-react-native') = require('@stripe/stripe-react-native');
const { useStripe } = StripeRN;

// Right after checkout each request's card hold is placed by the server. A
// bank sometimes wants an extra check (a code, or a tap in its app) before it
// allows one; this lists those on the success screen so the client can
// confirm them there. A request isn't sent to its provider until it's held;
// unconfirmed after 30 minutes, it's cancelled and nothing is held.

/** Holds are placed while the payment settles; a few short reads catch any
 *  still being placed when the success screen opens. */
const PLACING_RETRIES = 3;
const PLACING_RETRY_MS = 2000;

interface Props {
  checkoutBatchId: string;
}

export function RequestHoldChecks({ checkoutBatchId }: Props) {
  const { palette: P } = useTheme();
  const { handleNextAction } = useStripe();
  const [holds, setHolds] = useState<RequestCardHold[]>([]);
  // Holds this screen asked the bank about, so their result line shows.
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt <= PLACING_RETRIES; attempt++) {
        try {
          const rows = await getMyRequestCardHolds(checkoutBatchId);
          if (cancelled) return;
          setHolds(rows);
          if (!rows.some(row => row.state === 'planned')) return;
        } catch (err) {
          logger.error('[checkout] could not read request holds', err);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, PLACING_RETRY_MS));
        if (cancelled) return;
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutBatchId]);

  const updateHold = useCallback((holdId: string, state: RequestCardHold['state']) => {
    setHolds(current => current.map(row => (row.holdId === holdId ? { ...row, state } : row)));
    setAsked(current => new Set(current).add(holdId));
  }, []);

  const confirm = useCallback(async (hold: RequestCardHold) => {
    if (busyId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusyId(hold.holdId);
    setError(null);
    try {
      const started = await requestCardHoldStep(hold.holdId, 'start');
      if (started.state !== 'needs_action' || !started.clientSecret) {
        updateHold(hold.holdId, started.state);
        return;
      }
      const { error: actionError } = await handleNextAction(started.clientSecret);
      if (actionError && actionError.code !== 'Canceled') {
        logger.error('[checkout] bank check for a request hold failed', actionError);
      }
      // Whatever the bank said, the server records it from Stripe itself.
      const checked = await requestCardHoldStep(hold.holdId, 'check');
      if (mounted.current) updateHold(hold.holdId, checked.state);
    } catch (err) {
      logger.error('[checkout] could not confirm a request hold', err);
      if (mounted.current) setError(err instanceof Error ? err.message : tr('common.pleaseTryAgain'));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }, [busyId, handleNextAction, updateHold]);

  const now = new Date();
  const waiting = holds.filter(hold => holdNeedsCheck(hold, now));
  const results = holds.filter(hold => (hold.state === 'dropped' || asked.has(hold.holdId)) && holdResultLine(hold));
  if (waiting.length === 0 && results.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {waiting.map(hold => {
        const prompt = holdCheckPrompt(hold);
        const busy = busyId === hold.holdId;
        return (
          <View key={hold.holdId} style={[styles.card, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Text style={[styles.title, { color: P.text }]}>{prompt.title}</Text>
            <Text style={[styles.detail, { color: P.sub }]}>{prompt.detail}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={tr('cart.hold.confirmA11y', { service: hold.serviceName })}
              disabled={!!busyId}
              activeOpacity={0.85}
              onPress={() => { confirm(hold); }}
              style={[styles.button, { backgroundColor: busyId ? P.accentDim : P.accent }]}
            >
              {busy
                ? <ActivityIndicator color={P.onAccent} size="small" />
                : <Text style={[styles.buttonText, { color: P.onAccent }]}>{tr('cart.hold.confirm')}</Text>}
            </TouchableOpacity>
          </View>
        );
      })}
      {results.map(hold => (
        <Text key={hold.holdId} style={[styles.detail, styles.result, { color: P.sub }]}>{holdResultLine(hold)}</Text>
      ))}
      {error && <Text accessibilityRole="alert" style={[styles.detail, styles.error]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 10, marginBottom: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  detail: { fontSize: 13, lineHeight: 18 },
  result: { textAlign: 'center' },
  error: { color: '#FF3B30', textAlign: 'center' },
  button: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
