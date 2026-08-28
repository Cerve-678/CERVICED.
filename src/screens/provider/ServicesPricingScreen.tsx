/**
 * Services & Pricing — the "how you actually work" half of what used to be the
 * single 671-line Business Details screen.
 *
 * Scope: specialties, style & products, and who you work with (clientele,
 * price tier, team size, and — for hair providers only — which hair types
 * they cater to, the provider-level claim the client Search "Hair Type"
 * filter matches on; the narrower per-service version is edited alongside
 * each service in InfoRegScreen).
 *
 * Availability moved to SchedulingScreen and payment preference to
 * PaymentsScreen — both were part of this screen until availability settings
 * were consolidated out of the three places they'd accumulated in.
 *
 * Everything here now persists to `providers` — the fields that used to be
 * device-local AsyncStorage got real columns in
 * supabase/provider_practice_details_columns.sql, so the old "saved on this
 * device only" caveats are gone rather than merely reworded.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyProviderProfile,
  getProviderSpecialties,
  replaceMyProviderSpecialties,
  updateProviderContactDetails,
} from '../../services/databaseService';
import {
  Card, Field, ChipGroup, RadioGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  SPECIALTIES_MAP, CLIENTELE_OPTS, STYLE_OPTS, PRICE_OPTS, TEAM_SIZE_OPTS,
} from '../../features/business-details/options';
import { HAIR_TYPES } from '../../constants/hairTypes';
import { toUserMessage } from '../../utils/userFacingError';

export default function ServicesPricingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [serviceCategory, setServiceCategory] = useState('');

  const [specialties, setSpecialties]       = useState<string[]>([]);
  const [clientele, setClientele]           = useState<string[]>([]);
  const [priceTier, setPriceTier]           = useState('');
  const [teamSize, setTeamSize]             = useState('');
  const [styleAesthetic, setStyleAesthetic] = useState<string[]>([]);
  const [productsUsed, setProductsUsed]     = useState('');
  const [isVegan, setIsVegan]               = useState(false);
  // Provider-level "which hair types do you cater to" — the broad claim the
  // client Search filter matches on. Empty = caters to all, so leaving it
  // untouched is a valid answer. Per-service refinement lives on each
  // service (hairTypesSuitable, edited in InfoRegScreen's service modal).
  const [hairTypesCatered, setHairTypesCatered] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const providerData = await getMyProviderProfile();
        if (providerData) {
          setProviderId(providerData.id ?? null);
          setServiceCategory(providerData.service_category ?? '');
          setPriceTier(providerData.price_tier ?? '');
          setTeamSize(providerData.team_size ?? '');
          setClientele(providerData.clientele ?? []);
          setStyleAesthetic(providerData.style_tags ?? []);
          setProductsUsed(providerData.products_used ?? '');
          setIsVegan(providerData.vegan_cruelty_free ?? false);
          setHairTypesCatered(providerData.hair_types_catered ?? []);

          try {
            setSpecialties(await getProviderSpecialties(providerData.id));
          } catch {
            flash('Could not load specialties', 'error');
          }
        }
      } catch {
        flash('Could not load your practice details', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleChip(list: string[], setList: (v: string[]) => void, val: string) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  async function handleSave() {
    if (!providerId) { flash('No provider profile found', 'error'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await Promise.all([
        updateProviderContactDetails(providerId, {
          // '' would violate the CHECK constraints — clear with null.
          price_tier: (priceTier as 'budget' | 'mid' | 'premium' | 'luxury') || null,
          team_size: (teamSize as 'solo' | 'small_team' | 'large_team') || null,
          clientele,
          // availability_windows / accepts_new_clients / walk_ins_welcome /
          // group_bookings_available are owned by SchedulingScreen now, and
          // preferred_payment_methods by PaymentsScreen. They must stay out of
          // this payload: updateProviderContactDetails writes every key it's
          // given, so re-sending stale local copies would silently clobber
          // whatever those screens had just saved.
          style_tags: styleAesthetic,
          products_used: productsUsed.trim() || null,
          vegan_cruelty_free: isVegan,
          // Only sent for hair providers, since they're the only ones shown
          // the picker — spreading it in unconditionally would write [] over
          // a non-hair provider's stored value they were never given a way
          // to see or set. Empty array clears to null: '[]' and null both
          // mean "caters to all", and null keeps that one representation.
          ...(isHairProvider
            ? { hair_types_catered: hairTypesCatered.length ? hairTypesCatered : null }
            : {}),
        }),
        replaceMyProviderSpecialties(specialties),
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      flash(toUserMessage(e, 'Could not save your changes.', 'ServicesPricingScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const specialtyOptions = SPECIALTIES_MAP[serviceCategory] ?? Object.values(SPECIALTIES_MAP).flat();
  // Hair types only mean something for hair providers — a nail tech has no
  // use for the question, and asking would put noise in their profile.
  const isHairProvider = serviceCategory === 'HAIR';

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
        <KeyboardDismissView style={{ flex: 1 }}>
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>Services & Pricing</Text>
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

            <Card title="Your Specialties" sub="Select everything you're trained and experienced in. This drives search results.">
              <ChipGroup
                options={specialtyOptions}
                selected={specialties}
                onToggle={v => toggleChip(specialties, setSpecialties, v)}
              />
            </Card>

            <Card title="Who You Work With">
              <SectionLabel text="Clientele" />
              <ChipGroup options={CLIENTELE_OPTS} selected={clientele} onToggle={v => toggleChip(clientele, setClientele, v)} />

              {isHairProvider && (
                <>
                  <View style={{ height: 18 }} />
                  <SectionLabel text="Hair types you cater to" />
                  <ChipGroup options={HAIR_TYPES} selected={hairTypesCatered} onToggle={v => toggleChip(hairTypesCatered, setHairTypesCatered, v)} />
                  <Text style={[s.cardSub, { color: C.sub, marginTop: 8, marginBottom: 0 }]}>
                    Clients filter by this in search. Leave all unselected if you cater to every hair type. You can set more specific hair types per service when editing that service.
                  </Text>
                </>
              )}

              <View style={{ height: 18 }} />
              <SectionLabel text="Price range" />
              <RadioGroup options={PRICE_OPTS} value={priceTier} onChange={setPriceTier} />

              <View style={{ height: 18 }} />
              <SectionLabel text="Team size" />
              <RadioGroup options={TEAM_SIZE_OPTS} value={teamSize} onChange={setTeamSize} />
            </Card>

            {/* Preferred payment type moved to PaymentsScreen, and the whole
                Availability card to SchedulingScreen — availability was
                previously split across this screen, Automations and the
                calendar with no single place to reason about it. */}

            <Card title="Your Style & Products" sub="Many clients specifically look for providers using certain products.">
              <SectionLabel text="Style aesthetic" />
              <ChipGroup options={STYLE_OPTS} selected={styleAesthetic} onToggle={v => toggleChip(styleAesthetic, setStyleAesthetic, v)} />
              <View style={{ height: 14 }} />
              <Field label="Products & Brands You Use" value={productsUsed} onChange={setProductsUsed} placeholder="e.g. Olaplex, KÉRASTASE, Mylee, Lash FX..." multiline />
              <ToggleRow label="Vegan & cruelty-free products only" value={isVegan} onChange={setIsVegan} />
            </Card>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}
