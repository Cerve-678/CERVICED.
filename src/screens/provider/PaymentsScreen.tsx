/**
 * Payments — how a provider takes payment, in one place.
 *
 * SOURCE OF TRUTH for `providers.preferred_payment_methods` — moved off
 * ServicesPricingScreen, which no longer edits it.
 *
 * ALSO SOURCE OF TRUTH for the whole deposit setup — moved here from
 * PoliciesScreen on 2026-08-20. A deposit is a payment question, so both
 * halves of it now live in one place rather than split across two screens:
 *   • booking_policies.depositMode/Type/Amount/Note — whether a deposit
 *     applies at all, and how much.
 *   • automation_settings.depositRequiredNew         — whether it applies to
 *     first-time clients only.
 * PoliciesScreen no longer edits any deposit field; it only carries the keys
 * through its own full-replace save. Do not reintroduce a deposit control
 * there — one editor per setting.
 *
 * depositMode is a THREE-way choice, and it has to be. The client booking
 * sheet has always been able to show "Pay Full Amount" and "Pay Deposit" side
 * by side, but no provider control could ever produce that state deliberately:
 * the old single "Require deposit" toggle wrote depositRequired and
 * depositOnly in lockstep, so a provider could only ever pick full-only or
 * deposit-only. Both buttons appeared solely for providers who had never
 * opened Policies at all, falling through to the fabricated 20% default in
 * getProviderDepositPoliciesByDisplayNames. The three modes below make each of
 * the three client-facing states something a provider actually chose.
 *
 * SCOPE BOUNDARY — read before adding anything here. These are *preferences
 * shown to clients*, not money movement. Cerviced deliberately never collects,
 * stores, verifies or attests to an in-person payment between a client and a
 * provider (a deposit's remaining balance included). If it isn't money moving
 * through the app's own payment processor, this screen has no business
 * tracking its status — that's a liability boundary the product drew on
 * purpose, and a "mark balance collected" feature was removed once already.
 *
 * So: no balance-collected toggles, no amount-received fields, no
 * payout/earnings surface here without that going through the real processor.
 *
 * PERSISTENCE mirrors ProviderAutomationsScreen's dual-write — `user_metadata`
 * (legacy fallback) plus the `providers` row (what clients and cron jobs
 * actually read). A setting written to only one of the two silently misbehaves.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyProviderProfile,
  updateProviderContactDetails,
  updateProviderAutomationSettings,
} from '../../services/databaseService';
import {
  saveProviderPolicies,
  loadProviderPolicies,
} from '../../services/providerRegistrationService';
import {
  Card, ChipGroup, Field, RadioGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import { PAYMENT_OPTS } from '../../features/business-details/options';
import { resolveEditorDepositMode, type DepositMode } from '../../utils/depositPolicy';
import { toUserMessage } from '../../utils/userFacingError';

const DEPOSIT_MODE_OPTS: { value: DepositMode; label: string; sub: string }[] = [
  { value: 'full_only',        label: 'No deposit',        sub: 'Clients pay the full price when they book.' },
  { value: 'client_choice',    label: 'Deposit optional',  sub: 'Clients choose: pay a deposit now, or pay in full now.' },
  { value: 'deposit_required', label: 'Deposit required',  sub: 'Clients must pay the deposit to book \u2014 paying in full isn\u2019t offered.' },
];

export default function PaymentsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [depositRequiredNew, setDepositRequiredNew] = useState(false);

  const [depositMode, setDepositMode]     = useState<DepositMode>('full_only');
  const [depositType, setDepositType]     = useState<'percent' | 'fixed'>('percent');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote]     = useState('');
  // saveProviderPolicies REPLACES the whole booking_policies blob rather than
  // merging, exactly like PoliciesScreen — every cancellation/reschedule/
  // no-show key this screen doesn't edit has to be carried back through the
  // save or it's silently wiped.
  const [otherPolicies, setOtherPolicies] = useState<Record<string, unknown>>({});
  // Read-only here — PoliciesScreen owns the write. Held only so the card
  // below can show what clients are currently told about refunds.
  const [refundPolicyNote, setRefundPolicyNote] = useState('');
  // updateProviderAutomationSettings REPLACES the whole automation_settings
  // blob rather than merging, so every key this screen doesn't edit has to be
  // carried back through the save or it's silently deleted.
  const [otherAutomation, setOtherAutomation] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getMyProviderProfile();
        if (profile) {
          setProviderId(profile.id ?? null);
          setUserId(profile.user_id ?? null);
          setPaymentMethods(profile.preferred_payment_methods ?? []);
          const a = ((profile as any).automation_settings ?? {}) as Record<string, unknown>;
          setDepositRequiredNew(Boolean(a['depositRequiredNew'] ?? false));
          const { depositRequiredNew: _owned, ...rest } = a;
          setOtherAutomation(rest);

          const saved = (profile.user_id ? await loadProviderPolicies(profile.user_id) : null)
            ?? ((profile as any).booking_policies as Record<string, unknown> | null)
            ?? {};
          const {
            depositMode: savedMode,
            depositRequired: legacyRequired,
            depositOnly: legacyOnly,
            depositType: savedType,
            depositAmount: savedAmount,
            depositNote: savedNote,
            ...restPolicies
          } = saved as Record<string, unknown>;
          setOtherPolicies(restPolicies);
          const mode = resolveEditorDepositMode({ depositMode: savedMode, depositRequired: legacyRequired, depositOnly: legacyOnly });
          setDepositMode(mode);
          setDepositType(savedType === 'fixed' ? 'fixed' : 'percent');
          const amount = typeof savedAmount === 'string' ? savedAmount : savedAmount == null ? '' : String(savedAmount);
          // A provider who never set a deposit still has 20% quoted to their
          // clients — that's the fallback in
          // getProviderDepositPoliciesByDisplayNames. Prefilling it makes the
          // number visible and editable instead of invisible, and stops the
          // save validation below trapping someone who only came here to tick
          // a payment type.
          setDepositAmount(amount || (mode === 'full_only' ? '' : '20'));
          setDepositNote(typeof savedNote === 'string' ? savedNote : '');
          const refund = restPolicies['refundPolicyNote'];
          setRefundPolicyNote(typeof refund === 'string' ? refund : '');
        }
      } catch {
        flash('Could not load your payment settings', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  const handleSave = useCallback(async () => {
    if (!providerId) { flash('No provider profile found', 'error'); return; }
    // Without an amount the client booking sheet falls back to a 20% deposit
    // this provider never agreed to, so an empty amount can't be saved.
    if (depositMode !== 'full_only' && !(Number(depositAmount) > 0)) {
      flash('Enter how much the deposit is', 'error');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await Promise.all([
        updateProviderContactDetails(providerId, {
          preferred_payment_methods: paymentMethods,
        }),
        updateProviderAutomationSettings(providerId, {
          ...otherAutomation,
          depositRequiredNew,
        } as Parameters<typeof updateProviderAutomationSettings>[1]),
        // depositRequired/depositOnly are written alongside depositMode, not
        // instead of it: getProviderDepositPoliciesByDisplayNames still reads
        // the legacy pair as its fallback, and so does any client build that
        // predates depositMode. Keeping all three in sync on every write is
        // what makes the new mode safe to roll out mid-flight.
        userId
          ? saveProviderPolicies(userId, {
              ...otherPolicies,
              depositMode,
              depositRequired: depositMode !== 'full_only',
              depositOnly:     depositMode === 'deposit_required',
              depositType,
              depositAmount:   depositMode === 'full_only' ? '' : depositAmount,
              depositNote:     depositMode === 'full_only' ? '' : depositNote,
            })
          : Promise.resolve(),
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(toUserMessage(e, 'Could not save your changes.', 'PaymentsScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }, [providerId, userId, paymentMethods, depositRequiredNew, otherAutomation, depositMode, depositType, depositAmount, depositNote, otherPolicies, navigation]);

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <Text style={[s.headerTitle, { color: C.text }]}>Payments</Text>
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: C.surface }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.5}
          >
            <Ionicons name="close" size={22} color={C.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {toast && <Toast message={toast.message} type={toast.type} />}

          <Card
            title="How You Take Payment"
            sub="Shown on your profile so clients know what to expect."
          >
            <SectionLabel text="Preferred payment types" />
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 11, color: C.sub, marginBottom: 8 }}>
              Cerviced doesn't process payments you take in person — these are shown to clients as a heads-up, nothing more.
            </Text>
            <ChipGroup
              options={PAYMENT_OPTS.map(o => o.label)}
              selected={paymentMethods.map(v => PAYMENT_OPTS.find(o => o.value === v)?.label ?? v)}
              onToggle={label => {
                const opt = PAYMENT_OPTS.find(o => o.label === label);
                if (!opt) return;
                setPaymentMethods(prev =>
                  prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value],
                );
              }}
            />
          </Card>

          <Card
            title="What Clients Are Told"
            sub="A preview of the payment line shown on your public profile."
          >
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: C.text, lineHeight: 19 }}>
              {paymentMethods.length === 0
                ? 'No payment types selected yet — clients won’t see any payment guidance on your profile.'
                : `Accepts ${paymentMethods
                    .map(v => PAYMENT_OPTS.find(o => o.value === v)?.label ?? v)
                    .join(', ')
                    .replace(/, ([^,]*)$/, ' and $1')}.`}
            </Text>
          </Card>

          {/* The whole deposit setup, in one card. Previously split: the
              amount/requirement lived on PoliciesScreen and only "new clients
              only" lived here, which meant a provider had to visit two screens
              to answer one question. */}
          <Card title="Deposits" sub="Whether clients pay something up front to hold their slot.">
            <RadioGroup
              options={DEPOSIT_MODE_OPTS}
              value={depositMode}
              onChange={v => setDepositMode(v as DepositMode)}
            />

            {depositMode !== 'full_only' && (
              <>
                <SectionLabel text="Amount" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  {([
                    { v: 'percent' as const, l: '%' },
                    { v: 'fixed'   as const, l: '£' },
                  ]).map(({ v, l }) => (
                    <TouchableOpacity
                      key={v}
                      style={{
                        paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20,
                        borderWidth: StyleSheet.hairlineWidth,
                        backgroundColor: depositType === v ? C.accent : C.surface,
                        borderColor: depositType === v ? C.accent : C.border,
                      }}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setDepositType(v); }}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 13, color: depositType === v ? C.ice : C.sub }}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={{
                      flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 9,
                      fontFamily: 'Jura-VariableFont_wght', fontSize: 14, color: C.text, backgroundColor: C.surface,
                    }}
                    placeholder={depositType === 'percent' ? 'e.g. 20' : 'e.g. 25'}
                    placeholderTextColor={C.sub}
                    value={depositAmount}
                    onChangeText={v => setDepositAmount(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>

                <ToggleRow
                  label="New clients only"
                  sub="Only first-time clients pay your deposit. Returning clients book as normal."
                  value={depositRequiredNew}
                  onChange={setDepositRequiredNew}
                />

                <Field
                  label="Note (optional)"
                  value={depositNote}
                  onChange={setDepositNote}
                  placeholder='e.g. "Deposit comes off your final bill"'
                />
              </>
            )}

            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 11, color: C.sub, lineHeight: 17, marginTop: 4 }}>
              {depositMode === 'full_only'
                ? 'Clients will only see a "Pay Full Amount" option when they book.'
                : depositMode === 'client_choice'
                  ? 'Clients will see both "Pay Full Amount" and "Pay Deposit" when they book, and pick one.'
                  : 'Clients will only see a "Pay Deposit" option when they book, with the balance due at their appointment.'}
            </Text>
          </Card>

          {/* Refunds are a money question a client asks here first, but they're
              cancellation policy and PoliciesScreen owns the field. Read-only
              signpost, same pattern as BusinessInfoScreen's Contact
              Preferences row — never a second editor. */}
          <Card title="Refunds">
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: refundPolicyNote ? C.text : C.sub, lineHeight: 19, marginBottom: 12 }}>
              {refundPolicyNote || 'You haven\u2019t written a refund policy yet — clients booking with you won\u2019t see one.'}
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.surface,
              }}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Policies'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color={C.accent} />
              <Text style={{ flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.3, color: C.text }}>
                {refundPolicyNote ? 'Edit in Policies' : 'Write one in Policies'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={C.sub} style={{ opacity: 0.5 }} />
            </TouchableOpacity>
          </Card>

          <Card title="Getting Paid">
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: C.sub, lineHeight: 19 }}>
              Anything a client pays in person — the balance after a deposit included — is between you and them. Cerviced doesn’t collect, hold, verify or record those payments, so keep your own receipts.
            </Text>
          </Card>

          <SaveButton saving={saving} onPress={handleSave} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
