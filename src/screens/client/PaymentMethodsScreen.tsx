import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import { useAppDialog } from '../../components/AppDialog';
import { createSavedCardSetup, listSavedCards, removeSavedCard } from '../../services/databaseService';
import {
  SavedCard,
  savedCardBadge,
  savedCardBrandName,
  savedCardExpiryLabel,
  savedCardExpiryState,
} from '../../features/payments/savedCards';
import { buildPaymentSheetAppearance } from '../../features/payments/paymentSheetAppearance';
import { PaymentRequestError } from '../../utils/paymentRequestError';
import { env } from '../../utils/env';
import { logger } from '../../utils/logger';

// StripeProvider is mounted app-wide in App.tsx. Required (not imported) the
// same way CartScreen does it.
const useStripe: typeof import('@stripe/stripe-react-native').useStripe =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@stripe/stripe-react-native').useStripe;

// Wallet name for this device. Wallets need a development build (not Expo Go),
// and they're offered by the checkout sheet itself — there is nothing to save.
const WALLET_NAME = Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay';

const haptic = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

export default function PaymentMethodsScreen({ navigation }: any) {
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
          onPress={() => { haptic(); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityLabel="Back"
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Payment Methods</Text>

        {/* Saved cards only exist on the real Stripe checkout path; while
            it's switched off, checkout can't use them, so don't offer them. */}
        {env.stripePaymentsEnabled ? <SavedCardsSection /> : <CheckoutExplainer />}
      </ScrollView>
    </ThemedBackground>
  );
}

function CheckoutExplainer() {
  const { palette: P } = useTheme();
  return (
    <>
      <Text style={[styles.subtitle, { color: P.sub }]}>Pay securely when you book</Text>
      <View style={[styles.explainer, { backgroundColor: P.accentDim }]}>
        <Icon name="payment" size={40} color={P.accentText} />
        <Text style={[styles.explainerTitle, { color: P.text }]}>Secure checkout</Text>
        <Text style={[styles.explainerSub, { color: P.sub }]}>
          Choose your services and appointment time, then enter your card details at checkout. Supported wallet options appear automatically on your device.
        </Text>
      </View>
      <StripeNote />
    </>
  );
}

function StripeNote() {
  const { palette: P } = useTheme();
  return (
    <View style={[styles.infoRow, { backgroundColor: P.card, borderColor: P.border }]}>
      <Icon name="lock" size={18} color={P.accentText} />
      <Text style={[styles.infoText, { color: P.sub }]}>
        Stripe holds your card details. Cerviced only sees the card type, last four digits and expiry date.
      </Text>
    </View>
  );
}

function SavedCardsSection() {
  const { theme, palette: P } = useTheme();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showToast, showConfirm, DialogHost } = useAppDialog();
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setCards(await listSavedCards());
    } catch (error) {
      logger.error('[PaymentMethods] could not list saved cards', error);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCard = useCallback(async () => {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    haptic();
    try {
      const setup = await createSavedCardSetup();
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Cerviced',
        returnURL: 'cerviced://stripe-redirect',
        customerId: setup.customerId,
        customerEphemeralKeySecret: setup.ephemeralKeySecret,
        setupIntentClientSecret: setup.setupIntentClientSecret,
        appearance: buildPaymentSheetAppearance(P, theme.text),
      });
      if (initError) throw new Error(initError.message || 'Could not open card setup.');
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return;
        throw new Error(presentError.message || 'Could not save that card.');
      }
      showToast('Card saved', 'success');
      await load();
    } catch (error) {
      logger.error('[PaymentMethods] could not add a card', error);
      showToast(
        error instanceof PaymentRequestError ? error.message : 'Could not save that card. Please try again.',
        'error',
      );
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }, [initPaymentSheet, presentPaymentSheet, P, theme.text, showToast, load]);

  const remove = useCallback(async (card: SavedCard) => {
    try {
      await removeSavedCard(card.id);
      setCards(prev => prev?.filter(c => c.id !== card.id) ?? prev);
      showToast('Card removed', 'success');
    } catch (error) {
      logger.error('[PaymentMethods] could not remove a card', error);
      showToast(
        error instanceof PaymentRequestError ? error.message : 'Could not remove that card. Please try again.',
        'error',
      );
      load();
    }
  }, [showToast, load]);

  const openCard = useCallback((card: SavedCard) => {
    haptic();
    const needsReplacing = savedCardExpiryState(card) !== 'ok';
    showConfirm(
      `${savedCardBrandName(card.brand)} •••• ${card.last4}`,
      needsReplacing
        ? `${savedCardExpiryLabel(card)}. Got a new card from your bank? Add it, then remove this one. Bookings you've already paid for won't change.`
        : `${savedCardExpiryLabel(card)}. Removing it doesn't change any bookings you've already paid for.`,
      [
        ...(needsReplacing ? [{ text: 'Add a new card', onPress: () => { addCard(); } }] : []),
        { text: 'Remove card', style: 'destructive' as const, onPress: () => { remove(card); } },
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [showConfirm, addCard, remove]);

  return (
    <>
      <Text style={[styles.subtitle, { color: P.sub }]}>
        {cards?.length
          ? 'Your saved cards appear in the payment sheet at checkout.'
          : 'Save a card once and checkout becomes one tap.'}
      </Text>

      <Text style={[styles.sectionLabel, { color: P.sub }]}>
        {cards?.length ? 'SAVED CARDS' : 'CARDS'}
      </Text>
      <View style={[styles.group, { backgroundColor: P.card, borderColor: P.border }]}>
        {cards === null && !loadFailed && (
          <View style={styles.stateRow}>
            <ActivityIndicator color={P.accentText} />
          </View>
        )}

        {loadFailed && (
          <View style={styles.stateRow}>
            <Text style={[styles.rowSub, { color: P.sub, flex: 1 }]}>Couldn't load your saved cards.</Text>
            <TouchableOpacity onPress={() => { haptic(); load(); }} activeOpacity={0.7} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: P.accentText }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {cards?.length === 0 && (
          <View style={styles.stateRow}>
            <Text style={[styles.rowSub, { color: P.sub, flex: 1 }]}>
              No saved cards yet. You can also tick "Save this card" when you pay at checkout.
            </Text>
          </View>
        )}

        {cards?.map(card => {
          const expiry = savedCardExpiryState(card);
          return (
            <TouchableOpacity
              key={card.id}
              style={[styles.row, { borderBottomColor: P.sep }]}
              onPress={() => openCard(card)}
              activeOpacity={0.7}
              accessibilityLabel={`${savedCardBrandName(card.brand)} ending ${card.last4}, ${savedCardExpiryLabel(card)}`}
            >
              <View style={[styles.badge, { backgroundColor: P.iconBg }]}>
                <Text style={[styles.badgeText, { color: P.accentText }]}>{savedCardBadge(card.brand)}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: P.text }]}>
                  {savedCardBrandName(card.brand)} •••• {card.last4}
                </Text>
                <Text style={[styles.rowSub, { color: expiry === 'ok' ? P.sub : P.text, fontWeight: expiry === 'ok' ? '500' : '700' }]}>
                  {savedCardExpiryLabel(card)}{expiry === 'ok' ? '' : ' — update it'}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={P.sub} />
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.row}
          onPress={addCard}
          disabled={adding}
          activeOpacity={0.7}
          accessibilityLabel="Add a card"
        >
          <View style={[styles.badge, styles.addBadge, { borderColor: P.border }]}>
            {adding
              ? <ActivityIndicator size="small" color={P.accentText} />
              : <Text style={[styles.plus, { color: P.accentText }]}>+</Text>}
          </View>
          <Text style={[styles.rowTitle, { color: P.accentText }]}>Add a card</Text>
        </TouchableOpacity>
      </View>

      {!env.isExpoGo && (
        <>
          <Text style={[styles.sectionLabel, { color: P.sub }]}>ALSO AT CHECKOUT</Text>
          <View style={[styles.group, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: P.iconBg }]}>
                <Icon name="devices" size={20} color={P.accentText} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: P.text }]}>{WALLET_NAME}</Text>
                <Text style={[styles.rowSub, { color: P.sub }]}>Offered when your phone is set up for it</Text>
              </View>
            </View>
          </View>
        </>
      )}

      <StripeNote />
      <DialogHost />
    </>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  explainer: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  explainerTitle: { fontSize: 22, letterSpacing: 1 },
  explainerSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: 'hidden',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 68,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: { borderWidth: 1.5, borderStyle: 'dashed' },
  badgeText: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 0.5 },
  plus: { fontSize: 22, fontWeight: '600', marginTop: -2 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  retryBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
  },
  infoText: { fontSize: 12, flex: 1, lineHeight: 18 },
});
