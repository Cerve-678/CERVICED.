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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation, tr } from '../../i18n';
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
  SPECIALTIES_MAP, CLIENTELE_OPTS, PRICE_OPTS, TEAM_SIZE_OPTS,
  ALL_SERVICE_TYPE_OPTS, styleAestheticOptions, productsPlaceholder, optionText,
} from '../../features/business-details/options';
import { HAIR_TYPES } from '../../constants/hairTypes';
import { toUserMessage } from '../../utils/userFacingError';

export default function ServicesPricingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const { t } = useTranslation();
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
            flash(tr('providerProfile.services.loadSpecialtiesFailed'), 'error');
          }
        }
      } catch {
        flash(tr('providerProfile.services.loadFailed'), 'error');
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
    if (!providerId) { flash(tr('providerProfile.common2.noProfile'), 'error'); return; }

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
      flash(toUserMessage(e, tr('providerProfile.common2.saveFailed'), 'ServicesPricingScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }

  // Unioned with what's already saved: specialities carried over from sign-up
  // use sign-up's own wording, which isn't always in this list. Without the
  // union they'd be invisible chips that still persist on every save.
  const specialtyOptions = Array.from(new Set([
    ...(SPECIALTIES_MAP[serviceCategory] ?? Object.values(SPECIALTIES_MAP).flat()),
    ...specialties,
  ]));
  // Named on screen, because this whole card is scoped by it. The specialty
  // list below is SPECIALTIES_MAP[serviceCategory] and the hair-types question
  // only appears for HAIR — so a provider reading this card was being shown a
  // filtered list with nothing to say what filtered it, and no way to find out
  // from here. The value is edited in Business Info (one editor, under a
  // 90-day cooldown); this is a pointer to it, not a second one.
  const serviceTypeLabel =
    optionText(ALL_SERVICE_TYPE_OPTS.find(o => o.value === serviceCategory)?.label ?? serviceCategory ?? '', t);
  // Hair types only mean something for hair providers — a nail tech has no
  // use for the question, and asking would put noise in their profile.
  const isHairProvider = serviceCategory === 'HAIR';

  // Style aesthetic is scoped to the provider's trade (a lash artist sees
  // "wispy / doll / cat-eye", not "Bohemian"). Any value already stored under
  // the old generic list is unioned in so it still renders and can be
  // deselected — otherwise a legacy tag would be an invisible chip that
  // silently persists on save. Same pattern AboutYouScreen uses for languages.
  const styleOptions = Array.from(
    new Set([...styleAestheticOptions(serviceCategory), ...styleAesthetic]),
  );

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
            <Text style={[s.headerTitle, { color: C.text }]}>{t('providerProfile.businessDetails.services.title')}</Text>
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

            <Card title={t('providerProfile.services.specialties.title')} sub={t('providerProfile.services.specialties.sub')}>
              {serviceCategory ? (
                <TouchableOpacity
                  style={[s.lockedChip, { backgroundColor: C.surface, borderColor: C.border, marginBottom: 12 }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    navigation.navigate('BusinessInfo');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pricetag-outline" size={12} color={C.sub} />
                  <Text style={[s.lockedChipText, { color: C.text }]}>{serviceTypeLabel}</Text>
                  <Text style={[s.cardSub, { color: C.sub, marginBottom: 0 }]}>{t('providerProfile.services.change')}</Text>
                </TouchableOpacity>
              ) : null}
              <ChipGroup
                options={specialtyOptions}
                selected={specialties}
                onToggle={v => toggleChip(specialties, setSpecialties, v)}
              />
              <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>
                {t('providerProfile.services.specialtiesNote', { type: serviceTypeLabel })}
              </Text>
            </Card>

            <Card title={t('providerProfile.services.who.title')}>
              <SectionLabel text={t('providerProfile.services.clientele')} />
              <ChipGroup options={CLIENTELE_OPTS} selected={clientele} onToggle={v => toggleChip(clientele, setClientele, v)} />

              {isHairProvider && (
                <>
                  <View style={{ height: 18 }} />
                  <SectionLabel text={t('providerProfile.services.hairTypes')} />
                  <ChipGroup options={HAIR_TYPES} selected={hairTypesCatered} onToggle={v => toggleChip(hairTypesCatered, setHairTypesCatered, v)} />
                  <Text style={[s.cardSub, { color: C.sub, marginTop: 8, marginBottom: 0 }]}>
                    {t('providerProfile.services.hairTypesHint')}
                  </Text>
                </>
              )}

              <View style={{ height: 18 }} />
              <SectionLabel text={t('providerProfile.services.priceRange')} />
              <RadioGroup options={PRICE_OPTS} value={priceTier} onChange={setPriceTier} />

              <View style={{ height: 18 }} />
              <SectionLabel text={t('providerProfile.services.teamSize')} />
              <RadioGroup options={TEAM_SIZE_OPTS} value={teamSize} onChange={setTeamSize} />
            </Card>

            {/* Preferred payment type moved to PaymentsScreen, and the whole
                Availability card to SchedulingScreen — availability was
                previously split across this screen, Automations and the
                calendar with no single place to reason about it. */}

            <Card title={t('providerProfile.services.style.title')} sub={t('providerProfile.services.style.sub')}>
              <SectionLabel text={t('providerProfile.services.styleAesthetic')} />
              <ChipGroup options={styleOptions} selected={styleAesthetic} onToggle={v => toggleChip(styleAesthetic, setStyleAesthetic, v)} />
              <View style={{ height: 14 }} />
              <Field label={t('providerProfile.services.products')} value={productsUsed} onChange={setProductsUsed} placeholder={productsPlaceholder(serviceCategory)} multiline />
              <ToggleRow label={t('providerProfile.services.vegan')} value={isVegan} onChange={setIsVegan} />
            </Card>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}
