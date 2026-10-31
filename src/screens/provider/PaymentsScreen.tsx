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
 * Payouts are that sanctioned exception, and they live in
 * ProviderStripePayments (the Overview/Booking payments/Payouts tabs this
 * screen's settings sit under): money moving through Stripe Connect, the real
 * processor. Onboarding and "Manage payout account" are there, once — this
 * screen used to carry a second "Set up payouts" card that did the same job.
 *
 * PERSISTENCE mirrors ProviderAutomationsScreen's dual-write — `user_metadata`
 * (legacy fallback) plus the `providers` row (what clients and cron jobs
 * actually read). A setting written to only one of the two silently misbehaves.
 */
import ProviderStripePayments from '../../components/ProviderStripePayments';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../../components/SafeArea';
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
  Card, ChipGroup, Field, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import { PAYMENT_OPTS, optionText } from '../../features/business-details/options';
import { useTranslation, type TranslationKey } from '../../i18n';
import { resolveEditorDepositMode, type DepositMode } from '../../utils/depositPolicy';
import { toUserMessage } from '../../utils/userFacingError';

// `sub` is the full explanation, read out as each option's accessibility hint;
// the button itself only has room for `label` + `hint`.
const DEPOSIT_MODE_OPTS: { value: DepositMode; label: TranslationKey; hint: TranslationKey; sub: TranslationKey }[] = [
  { value: 'full_only',        label: 'providerBusiness.payments.mode.none',     hint: 'providerBusiness.payments.mode.noneHint',     sub: 'providerBusiness.payments.mode.noneSub' },
  { value: 'client_choice',    label: 'providerBusiness.payments.mode.optional', hint: 'providerBusiness.payments.mode.optionalHint', sub: 'providerBusiness.payments.mode.optionalSub' },
  { value: 'deposit_required', label: 'providerBusiness.payments.mode.required', hint: 'providerBusiness.payments.mode.requiredHint', sub: 'providerBusiness.payments.mode.requiredSub' },
];

// The buttons the client booking sheet shows for each mode — previewed under
// the deposit controls so the provider sees the effect of what they picked.
const CLIENT_SEES: Record<DepositMode, TranslationKey[]> = {
  full_only:        ['providerBusiness.payments.seesFull'],
  client_choice:    ['providerBusiness.payments.seesFull', 'providerBusiness.payments.seesDeposit'],
  deposit_required: ['providerBusiness.payments.seesDeposit'],
};

const paymentLabel = (value: string) => PAYMENT_OPTS.find(o => o.value === value)?.label ?? value;

export default function PaymentsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const { t } = useTranslation();
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

  // Both writes below (booking_policies and automation_settings) are full
  // REPLACEs, and the keys this screen doesn't own are only preserved via the
  // otherPolicies/otherAutomation copies read on load. If that read failed
  // they're empty, so saving would delete PoliciesScreen's cancellation,
  // reschedule and no-show settings outright.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getMyProviderProfile();
        if (!profile) setLoadFailed(true);
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
        setLoadFailed(true);
        flash(t('providerBusiness.payments.loadFailed'), 'error');
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
    if (!providerId) { flash(t('providerBusiness.payments.noProfile'), 'error'); return; }
    // See loadFailed above: writing without a successful read would delete the
    // policy keys this screen carries but doesn't edit.
    if (loadFailed) { flash(t('providerBusiness.payments.loadFailedSave'), 'error'); return; }
    // Without an amount the client booking sheet falls back to a 20% deposit
    // this provider never agreed to, so an empty amount can't be saved.
    if (depositMode !== 'full_only' && !(Number(depositAmount) > 0)) {
      flash(t('providerBusiness.payments.amountRequired'), 'error');
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
      flash(t('providerBusiness.payments.saved'), 'success');
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(toUserMessage(e, t('providerBusiness.payments.saveFailed'), 'PaymentsScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }, [providerId, userId, paymentMethods, depositRequiredNew, otherAutomation, depositMode, depositType, depositAmount, depositNote, otherPolicies, loadFailed, t]);


  const acceptedLabels = paymentMethods.map(paymentLabel);
  // acceptedLabels stay English: ChipGroup matches them against PAYMENT_OPTS.
  const acceptedText = acceptedLabels.map(label => optionText(label, t));
  const depositAmountLabel = depositType === 'percent' ? `${depositAmount}%` : `£${depositAmount}`;
  const setupSummary = loading || loadFailed ? undefined : {
    deposit: depositMode === 'full_only' ? t('providerBusiness.payments.summary.noDeposit')
      : [depositMode === 'client_choice' ? t('providerBusiness.payments.mode.optional') : t('providerBusiness.payments.mode.required'), depositAmount && depositAmountLabel, depositRequiredNew && t('providerBusiness.payments.summary.newClients')]
          .filter(Boolean).join(' · '),
    inPerson: acceptedText.length ? acceptedText.join(', ') : t('providerBusiness.payments.summary.noneSet'),
  };

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <Text style={[s.headerTitle, { color: C.text }]}>{t('providerBusiness.payments.title')}</Text>
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

          <ProviderStripePayments stripeReturn={route?.params?.stripeReturn} setup={setupSummary}>
          {loading ? <ActivityIndicator color={C.accent} size="large" /> : <>
          {loadFailed && <Toast message={t('providerBusiness.payments.loadFailedBanner')} type="error" />}

          <Card title={t('providerBusiness.payments.deposits')} sub={t('providerBusiness.payments.depositsSub')}>
            <View style={st.modeRow}>
              {DEPOSIT_MODE_OPTS.map(o => {
                const on = depositMode === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('providerBusiness.payments.modeA11y', { mode: t(o.label) })}
                    accessibilityHint={t(o.sub)}
                    style={[st.modeBtn, { backgroundColor: on ? C.accent : C.surface, borderColor: on ? C.accent : C.border }]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDepositMode(o.value); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[st.modeLabel, { color: on ? C.bg : C.text }]}>{t(o.label)}</Text>
                    <Text style={[st.modeHint, { color: on ? C.bg : C.sub }]}>{t(o.hint)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {depositMode !== 'full_only' && (
              <>
                <View style={st.amountRow}>
                  <View style={[st.segment, { backgroundColor: C.surface }]}>
                    {([
                      { v: 'percent' as const, l: '%' },
                      { v: 'fixed'   as const, l: '£' },
                    ]).map(({ v, l }) => (
                      <TouchableOpacity
                        key={v}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: depositType === v }}
                        accessibilityLabel={v === 'percent' ? t('providerBusiness.payments.percentA11y') : t('providerBusiness.payments.fixedA11y')}
                        style={[st.segmentBtn, depositType === v && { backgroundColor: C.card }]}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setDepositType(v); }}
                        activeOpacity={0.75}
                      >
                        <Text style={[st.segmentLabel, { color: depositType === v ? C.text : C.sub }]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[st.amountBox, { backgroundColor: C.surface, borderColor: C.border }]}>
                    {depositType === 'fixed' && <Text style={[st.amountAffix, { color: C.sub }]}>£</Text>}
                    <TextInput
                      style={[st.amountInput, { color: C.text }]}
                      accessibilityLabel={t('providerBusiness.payments.amountA11y')}
                      placeholder={depositType === 'percent' ? t('providerBusiness.payments.amountPlaceholderPercent') : t('providerBusiness.payments.amountPlaceholderFixed')}
                      placeholderTextColor={C.sub}
                      value={depositAmount}
                      onChangeText={v => setDepositAmount(v.replace(/[^0-9.]/g, ''))}
                      keyboardType="numeric"
                    />
                    {depositType === 'percent' && <Text style={[st.amountAffix, { color: C.sub }]}>{t('providerBusiness.payments.percentOfPrice')}</Text>}
                  </View>
                </View>

                <ToggleRow
                  label={t('providerBusiness.payments.newOnly')}
                  sub={t('providerBusiness.payments.newOnlySub')}
                  value={depositRequiredNew}
                  onChange={setDepositRequiredNew}
                />

                <Field
                  label={t('providerBusiness.payments.note')}
                  value={depositNote}
                  onChange={setDepositNote}
                  placeholder={t('providerBusiness.payments.notePlaceholder')}
                />
              </>
            )}

            <View style={[st.preview, { borderColor: C.accent }]}>
              <Text style={[st.eyebrow, { color: C.accentText }]}>{t('providerBusiness.payments.clientsSee')}</Text>
              <View style={st.previewRow}>
                {CLIENT_SEES[depositMode].map(labelKey => (
                  <View key={labelKey} style={[st.previewBtn, { backgroundColor: C.bg }]}>
                    <Text style={[st.previewLabel, { color: C.text }]}>{t(labelKey)}</Text>
                  </View>
                ))}
              </View>
              {depositMode === 'deposit_required' && (
                <Text style={[st.footnote, { color: C.sub }]}>{t('providerBusiness.payments.balanceDue')}</Text>
              )}
            </View>
          </Card>

          <Card
            title={t('providerBusiness.payments.howYouTake')}
            sub={t('providerBusiness.payments.howYouTakeSub')}
          >
            <SectionLabel text={t('providerBusiness.payments.preferredTypes')} />
            <ChipGroup
              options={PAYMENT_OPTS.map(o => o.label)}
              selected={acceptedLabels}
              onToggle={label => {
                const opt = PAYMENT_OPTS.find(o => o.label === label);
                if (!opt) return;
                setPaymentMethods(prev =>
                  prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value],
                );
              }}
            />
            <Text style={[st.footnote, { color: C.sub, marginTop: 6 }]}>
              {t('providerBusiness.payments.inPersonNote')}
            </Text>
            <View style={[st.toldPanel, { backgroundColor: C.bg }]}>
              <Text style={[st.eyebrow, { color: C.accentText }]}>{t('providerBusiness.payments.clientsTold')}</Text>
              <Text style={[st.body, { color: C.text }]}>
                {acceptedText.length === 0
                  ? t('providerBusiness.payments.noTypes')
                  : t('providerBusiness.payments.accepts', { list: acceptedText.length === 1 ? acceptedText[0]! : acceptedText.slice(0, -1).join(', ') + t('providerBusiness.payments.and') + acceptedText[acceptedText.length - 1] })}
              </Text>
            </View>
          </Card>

          {/* Refunds are cancellation policy and PoliciesScreen owns the field.
              Read-only signpost — never a second editor. */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={refundPolicyNote ? t('providerBusiness.payments.refundA11y') : t('providerBusiness.payments.refundMissingA11y')}
            style={[st.rowCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Policies'); }}
            activeOpacity={0.7}
          >
            <View style={[st.iconChip, { backgroundColor: C.surface }]}>
              <Ionicons name="document-text-outline" size={18} color={C.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.rowTitle, { color: C.text }]}>{t('providerBusiness.payments.refundPolicy')}</Text>
              <Text numberOfLines={1} style={[st.footnote, { color: C.sub }]}>
                {refundPolicyNote || t('providerBusiness.payments.refundMissing')}
              </Text>
            </View>
            <Text style={[st.rowAction, { color: C.accentText }]}>{refundPolicyNote ? t('providerBusiness.payments.editInPolicies') : t('providerBusiness.payments.writeOne')}</Text>
          </TouchableOpacity>

          <View style={st.gettingPaid}>
            <Ionicons name="shield-checkmark-outline" size={16} color={C.sub} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[st.rowTitle, { color: C.text, fontSize: 13 }]}>{t('providerBusiness.payments.gettingPaid')}</Text>
              <Text style={[st.footnote, { color: C.sub }]}>
                {t('providerBusiness.payments.gettingPaidBody')}
              </Text>
            </View>
          </View>

          {!loadFailed && <SaveButton saving={saving} onPress={handleSave} />}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('providerBusiness.payments.policiesA11y')}
            style={[st.rowCard, { backgroundColor: C.card, borderColor: C.border, marginTop: 16 }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Policies'); }}
            activeOpacity={0.7}
          >
            <View style={[st.iconChip, { backgroundColor: C.surface }]}>
              <Ionicons name="reader-outline" size={18} color={C.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.rowTitle, { color: C.text }]}>{t('providerBusiness.payments.yourPolicies')}</Text>
              <Text numberOfLines={1} style={[st.footnote, { color: C.sub }]}>{t('providerBusiness.payments.yourPoliciesSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.accentText} />
          </TouchableOpacity>
          </>}
          </ProviderStripePayments>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  modeRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeBtn:      { flex: 1, minHeight: 64, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  modeLabel:    { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  modeHint:     { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, marginTop: 3, opacity: 0.85 },
  amountRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  segment:      { flexDirection: 'row', padding: 3, borderRadius: 12 },
  segmentBtn:   { width: 42, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  amountBox:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  amountInput:  { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 17, paddingVertical: 0 },
  amountAffix:  { fontFamily: 'Jura-VariableFont_wght', fontSize: 13 },
  preview:      { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 12, gap: 8, marginTop: 6 },
  previewRow:   { flexDirection: 'row', gap: 8 },
  previewBtn:   { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center' },
  previewLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  eyebrow:      { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.4 },
  body:         { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, marginTop: 4 },
  footnote:     { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17 },
  toldPanel:    { borderRadius: 12, padding: 12, marginTop: 12 },
  rowCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  iconChip:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle:     { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  rowAction:    { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  gettingPaid:  { flexDirection: 'row', gap: 10, paddingHorizontal: 6, marginBottom: 20 },
});
