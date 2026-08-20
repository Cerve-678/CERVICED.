/**
 * Payments — how a provider takes payment, in one place.
 *
 * SOURCE OF TRUTH for `providers.preferred_payment_methods` — moved off
 * ServicesPricingScreen, which no longer edits it.
 *
 * Deposits are split on purpose, along a WHO/WHETHER line:
 *   • this screen  — automation_settings.depositRequiredNew, i.e. whether the
 *     deposit applies to new clients only. It is the ONLY editor for that key.
 *   • PoliciesScreen — booking_policies.depositRequired/Type/Amount/Note, i.e.
 *     whether there's a deposit at all and how much.
 * Different columns, different questions. Do not add a second "require a
 * deposit" toggle here; duplicating that control across two screens is the
 * exact split this hub reorganisation exists to remove.
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
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  Card, ChipGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import { PAYMENT_OPTS } from '../../features/business-details/options';

export default function PaymentsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [depositRequiredNew, setDepositRequiredNew] = useState(false);
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
          setPaymentMethods(profile.preferred_payment_methods ?? []);
          const a = ((profile as any).automation_settings ?? {}) as Record<string, unknown>;
          setDepositRequiredNew(Boolean(a['depositRequiredNew'] ?? false));
          const { depositRequiredNew: _owned, ...rest } = a;
          setOtherAutomation(rest);
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
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(e?.message ?? 'Could not save changes', 'error');
    } finally {
      setSaving(false);
    }
  }, [providerId, paymentMethods, depositRequiredNew, otherAutomation, navigation]);

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

          {/* Deposits are POLICY, and the whole deposit policy (required,
              amount, type, note, new-clients-only) lives on PoliciesScreen.
              This is a signpost, deliberately not a second editor — two
              screens with their own "require a deposit" toggle is exactly the
              split this hub reorganisation set out to remove. */}
          <Card title="Deposits">
            {/* Only the WHO lives here. Whether a deposit is required at all,
                and how much, is booking policy — owned by PoliciesScreen and
                stored in booking_policies, not automation_settings. Two
                screens with their own "require a deposit" toggle is the exact
                duplication this hub reorganisation removed. */}
            <ToggleRow
              label="New clients only"
              sub="Only first-time clients pay your deposit. Returning clients book as normal."
              value={depositRequiredNew}
              onChange={setDepositRequiredNew}
            />
            <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: C.sub, lineHeight: 19, marginTop: 12, marginBottom: 12 }}>
              Whether a deposit is required at all, and how much it is, are set with your booking policies.
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
                Open Policies
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
