/**
 * Services & Pricing — the "how you actually work" half of what used to be the
 * single 671-line Business Details screen.
 *
 * Scope: specialties, price range and team size, style aesthetic, and the
 * products the provider works with (brand chips by service category — see
 * features/business-details/productBrands.ts).
 *
 * "Who you work with" (clientele, skin tones, hair types) moved to About You,
 * which is now its only editor. It must stay out of this screen's save:
 * updateProviderContactDetails writes every key it's given, so a copy here
 * would overwrite whatever About You had just saved.
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
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../../components/SafeArea';
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
  SPECIALTIES_MAP, TEAM_SIZE_OPTS,
  ALL_SERVICE_TYPE_OPTS, styleAestheticOptions,
} from '../../features/business-details/options';
import {
  productBrandSections, splitProductsUsed, joinProductsUsed,
} from '../../features/business-details/productBrands';
import { PRICE_BANDS, tierForBands } from '../../constants/priceBands';
import { toUserMessage } from '../../utils/userFacingError';

export default function ServicesPricingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [serviceCategory, setServiceCategory] = useState('');
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);

  const [specialties, setSpecialties]       = useState<string[]>([]);
  const [priceBands, setPriceBands]         = useState<string[]>([]);
  const [teamSize, setTeamSize]             = useState('');
  const [styleAesthetic, setStyleAesthetic] = useState<string[]>([]);
  // Every brand in providers.products_used, chips and typed ones alike. The
  // chips show the ones in this provider's categories; the rest are shown in
  // the "anything else" box (otherProducts) so nothing saved is hidden.
  const [products, setProducts]             = useState<string[]>([]);
  const [otherProducts, setOtherProducts]   = useState('');
  const [isVegan, setIsVegan]               = useState(false);

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
          const categories = providerData.service_categories?.length
            ? providerData.service_categories
            : providerData.service_category ? [providerData.service_category] : [];
          setServiceCategories(categories);
          const offered = new Set(productBrandSections(categories).flatMap(section => section.brands));
          const saved = splitProductsUsed(providerData.products_used);
          setProducts(saved.filter(name => offered.has(name)));
          setOtherProducts(saved.filter(name => !offered.has(name)).join(', '));
          setPriceBands(providerData.price_bands ?? []);
          setTeamSize(providerData.team_size ?? '');
          setStyleAesthetic(providerData.style_tags ?? []);
          setIsVegan(providerData.vegan_cruelty_free ?? false);

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
          price_bands: priceBands,
          price_tier: tierForBands(priceBands) || null,
          team_size: (teamSize as 'solo' | 'small_team' | 'large_team') || null,
          // availability_windows / accepts_new_clients / walk_ins_welcome /
          // group_bookings_available are owned by SchedulingScreen now, and
          // preferred_payment_methods by PaymentsScreen. They must stay out of
          // this payload: updateProviderContactDetails writes every key it's
          // given, so re-sending stale local copies would silently clobber
          // whatever those screens had just saved.
          style_tags: styleAesthetic,
          products_used: joinProductsUsed([...products, otherProducts]),
          vegan_cruelty_free: isVegan,
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
    ALL_SERVICE_TYPE_OPTS.find(o => o.value === serviceCategory)?.label ?? serviceCategory;
  // One section of brand chips per category the provider works in.
  const brandSections = productBrandSections(serviceCategories);

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
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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
                  <Text style={[s.cardSub, { color: C.sub, marginBottom: 0 }]}>· Change</Text>
                </TouchableOpacity>
              ) : null}
              <ChipGroup
                options={specialtyOptions}
                selected={specialties}
                onToggle={v => toggleChip(specialties, setSpecialties, v)}
              />
              <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>
                These are the {serviceTypeLabel} specialties. Your service type is set in Business Info — changing it clears this list.
              </Text>
            </Card>

            <Card title="Pricing & Team">
              <SectionLabel text="Price range" />
              <ChipGroup
                options={PRICE_BANDS.map(band => band.label)}
                selected={PRICE_BANDS.filter(band => priceBands.includes(band.value)).map(band => band.label)}
                onToggle={label => {
                  const band = PRICE_BANDS.find(b => b.label === label);
                  if (band) toggleChip(priceBands, setPriceBands, band.value);
                }}
              />

              <View style={{ height: 18 }} />
              <SectionLabel text="Team size" />
              <RadioGroup options={TEAM_SIZE_OPTS} value={teamSize} onChange={setTeamSize} />
            </Card>

            {/* Preferred payment type moved to PaymentsScreen, and the whole
                Availability card to SchedulingScreen — availability was
                previously split across this screen, Automations and the
                calendar with no single place to reason about it. */}

            <Card title="Your Style">
              <ChipGroup options={styleOptions} selected={styleAesthetic} onToggle={v => toggleChip(styleAesthetic, setStyleAesthetic, v)} />
            </Card>

            {/* Its own card, and its own section on the client's profile
                (Additional Information → Products), rather than sharing a box
                with style: a client looking for "uses Olaplex" is asking a
                different question from "does soft glam". */}
            <Card title="Products I Work With" sub="Many clients look for providers who use certain brands. Pick the ones you use.">
              {brandSections.map((section, index) => (
                <View key={section.category} style={index > 0 ? { marginTop: 18 } : undefined}>
                  <SectionLabel text={section.label} />
                  <ChipGroup options={section.brands} selected={products} onToggle={v => toggleChip(products, setProducts, v)} />
                </View>
              ))}
              <View style={{ height: 14 }} />
              <Field
                label="Anything else you use"
                value={otherProducts}
                onChange={setOtherProducts}
                placeholder="Brands that aren't listed, separated by commas"
                multiline
              />
              <ToggleRow label="Vegan & cruelty-free products only" value={isVegan} onChange={setIsVegan} />
            </Card>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}
