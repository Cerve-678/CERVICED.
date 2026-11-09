/**
 * About You — the "can clients trust you, and can they physically reach you"
 * third of what used to be the single 671-line Business Details screen.
 *
 * Scope: a mobile provider's "Areas you cover", who you work with
 * (clientele, skin tones, and — for hair providers — hair types), credentials
 * & policies (qualifications, insurance, DBS, patch test, online
 * consultations), languages, and accessibility.
 *
 * "I Work With" is the only editor of clientele, skin_tones_catered and
 * hair_types_catered (it moved here from Services & Pricing). Clients see it
 * in Additional Information on the profile. hair_types_catered is
 * also what the client Search "Hair Type" filter matches on.
 *
 * "Areas you cover" writes providers.service_locations, which Search's City
 * filter matches alongside location_text (src/utils/providerCity.ts). This is
 * its only editor for an existing provider: Edit Profile (InfoRegScreen) no
 * longer shows or saves it, so the two screens can't overwrite each other.
 * "Where you're based" (location_text) stays in Edit Profile; it's read here
 * only to suggest a first town. How far a mobile provider travels is said
 * once, in Policies → Travel; travel_radius is no longer read or written by
 * the app.
 *
 * Two things worth knowing before editing:
 *
 * 1. patch_test_policy is health-adjacent — clients need it BEFORE booking a
 *    colour/lash/brow service, which is why it earned a real DB column rather
 *    than staying device-local.
 * 2. Insurance and DBS are provider SELF-ATTESTATIONS. Cerviced verifies
 *    neither. The column names (`*_self_declared`) and the on-screen copy both
 *    say so deliberately — never re-word these to imply platform verification.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
  updateProviderContactDetails,
} from '../../services/databaseService';
import {
  Card, Field, ChipGroup, RadioGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  LANGUAGE_OPTS, ACCESSIBILITY_OPTS, PATCH_OPTS, CLIENTELE_OPTS, providerTravelsToClient,
} from '../../features/business-details/options';
import { SKIN_TONES } from '../../constants/skinTones';
import { HAIR_TYPES } from '../../constants/hairTypes';
import AreasYouCoverPicker from '../../components/AreasYouCoverPicker';
import { recognizeLanguage } from '../../data/languages';
import { toUserMessage } from '../../utils/userFacingError';

export default function AboutYouScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);

  // Areas you cover — mobile providers only (they travel, so where they're
  // based isn't where they work). Other types never see it and never write it.
  const [travels, setTravels]                 = useState(false);
  const [basedIn, setBasedIn]                 = useState('');
  const [serviceLocations, setServiceLocations] = useState<string[]>([]);

  // I Work With. Empty skin tones / hair types = not stated, saved as NULL.
  const [clientele, setClientele]           = useState<string[]>([]);
  const [skinTones, setSkinTones]           = useState<string[]>([]);
  const [hairTypesCatered, setHairTypesCatered] = useState<string[]>([]);
  // Hair types only mean something to a hair provider, so only they are
  // asked, and only they write the column — anyone else would save [] over a
  // value they were never shown.
  const [isHairProvider, setIsHairProvider] = useState(false);

  const [qualifications, setQualifications] = useState('');
  const [isInsured, setIsInsured]           = useState(false);
  const [dbsChecked, setDbsChecked]         = useState(false);
  const [onlineConsult, setOnlineConsult]   = useState(false);
  const [patchTest, setPatchTest]           = useState('');

  const [languages, setLanguages]           = useState<string[]>([]);
  const [languagesOther, setLanguagesOther] = useState('');
  const [accessibility, setAccessibility]   = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // LANGUAGE_OPTS plus anything already saved that it doesn't cover — a
  // language typed into signup's "Other" free-text input would otherwise have
  // no chip here, leaving it invisible but still selected. The literal 'Other'
  // is excluded from that middle set — selecting it adds 'Other' to `languages`,
  // and it's the intentional trailing entry, so without the guard it renders
  // twice. 'Other' always trails the list and reveals a free-text box, same as
  // signup.
  const languageOptions = useMemo(
    () => [
      ...LANGUAGE_OPTS,
      ...languages.filter(l => l !== 'Other' && !LANGUAGE_OPTS.includes(l)),
      'Other',
    ],
    [languages],
  );
  const showLanguagesOther = languages.includes('Other');

  useEffect(() => {
    (async () => {
      try {
        const providerData = await getMyProviderProfile();
        if (providerData) {
          setProviderId(providerData.id ?? null);
          setTravels(providerTravelsToClient(providerData.business_type ?? null));
          setBasedIn(providerData.location_text ?? '');
          setServiceLocations(providerData.service_locations ?? []);
          setClientele(providerData.clientele ?? []);
          setSkinTones(providerData.skin_tones_catered ?? []);
          setHairTypesCatered(providerData.hair_types_catered ?? []);
          setIsHairProvider(
            providerData.service_category === 'HAIR'
              || (providerData.service_categories ?? []).includes('HAIR'),
          );
          setQualifications(providerData.qualifications ?? '');
          setIsInsured(providerData.is_insured_self_declared ?? false);
          setDbsChecked(providerData.dbs_checked_self_declared ?? false);
          setOnlineConsult(providerData.online_consultations_available ?? false);
          setPatchTest(providerData.patch_test_policy ?? '');
          setLanguages(providerData.languages_spoken ?? []);
          // accessibility_notes is a single TEXT column, so the chip list is
          // joined/split with '|' at the save/load boundary rather than
          // changing the column to an array.
          setAccessibility(
            providerData.accessibility_notes
              ? providerData.accessibility_notes.split('|').filter(Boolean)
              : [],
          );
        }
      } catch {
        flash('Could not load trust & access details', 'error');
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
      // 'Other' plus its free-text value folds into one flat list to store,
      // normalised via recognizeLanguage so casing/aliases match the
      // canonical name (e.g. "french" -> "French") — never the literal
      // string 'Other' itself. Mirrors SignUpStep5Screen's finalLanguages.
      const finalLanguages = languages.includes('Other') && languagesOther.trim()
        ? [...languages.filter(l => l !== 'Other'), recognizeLanguage(languagesOther)]
        : languages.filter(l => l !== 'Other');

      await updateProviderContactDetails(providerId, {
        clientele,
        skin_tones_catered: skinTones.length ? skinTones : null,
        ...(isHairProvider
          ? { hair_types_catered: hairTypesCatered.length ? hairTypesCatered : null }
          : {}),
        qualifications: qualifications.trim() || null,
        is_insured_self_declared: isInsured,
        dbs_checked_self_declared: dbsChecked,
        online_consultations_available: onlineConsult,
        // '' would violate providers_patch_test_policy_check — clear with null.
        patch_test_policy: (patchTest as 'always' | 'new_clients' | 'optional' | 'not_needed') || null,
        languages_spoken: finalLanguages,
        accessibility_notes: accessibility.length ? accessibility.join('|') : null,
        // Removing every chip saves an empty list on purpose.
        ...(travels ? { service_locations: serviceLocations } : {}),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      flash(toUserMessage(e, 'Could not save your changes.', 'AboutYouScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }

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
            <Text style={[s.headerTitle, { color: C.text }]}>About You</Text>
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

            {travels && (
              <Card title="Areas You Cover" sub="The towns and areas you travel to. Clients who filter Search by these places will find you.">
                <AreasYouCoverPicker
                  value={serviceLocations}
                  onChange={setServiceLocations}
                  basedIn={basedIn}
                  accentColor={C.accent}
                  palette={C}
                />
              </Card>
            )}

            <Card title="I Work With" sub="Shown in Additional Information on your profile, so clients can see you work with people like them.">
              <SectionLabel text="Clients" />
              <ChipGroup options={CLIENTELE_OPTS} selected={clientele} onToggle={v => toggleChip(clientele, setClientele, v)} />

              <View style={{ height: 18 }} />
              <SectionLabel text="Skin tones" />
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSkinTones(skinTones.length === SKIN_TONES.length ? [] : [...SKIN_TONES]);
                }}
                activeOpacity={0.7}
                style={{ alignSelf: 'flex-start', marginTop: -4, marginBottom: 10 }}
              >
                <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', color: C.accent }}>
                  {skinTones.length === SKIN_TONES.length ? 'Clear all' : 'I work with all skin tones'}
                </Text>
              </TouchableOpacity>
              <ChipGroup options={SKIN_TONES} selected={skinTones} onToggle={v => toggleChip(skinTones, setSkinTones, v)} />

              {isHairProvider && (
                <>
                  <View style={{ height: 18 }} />
                  <SectionLabel text="Hair types" />
                  <ChipGroup options={HAIR_TYPES} selected={hairTypesCatered} onToggle={v => toggleChip(hairTypesCatered, setHairTypesCatered, v)} />
                  <Text style={[s.cardSub, { color: C.sub, marginTop: 8, marginBottom: 0 }]}>
                    Clients filter by this in search. Leave all unselected if you cater to every hair type. You can set more specific hair types per service when editing that service.
                  </Text>
                </>
              )}
            </Card>

            <Card title="Credentials & Policies" sub="Builds trust with clients and helps them book with confidence.">
              <Field label="Qualifications & Training" value={qualifications} onChange={setQualifications} placeholder="e.g. NVQ Level 3, VTCT, City & Guilds..." multiline />
              <ToggleRow label="Professionally insured" sub="You hold valid professional indemnity insurance. Shown as your own declaration — Cerviced doesn't verify insurance." value={isInsured} onChange={setIsInsured} />
              <ToggleRow label="DBS checked" sub="Important if you work with children or vulnerable adults. Shown as your own declaration — Cerviced doesn't verify DBS status." value={dbsChecked} onChange={setDbsChecked} />
              <ToggleRow label="Online consultations available" sub="Clients can book a virtual consultation before their appointment" value={onlineConsult} onChange={setOnlineConsult} />

              <SectionLabel text="Patch test policy" />
              <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 11, color: C.sub, marginBottom: 8, marginTop: -6 }}>
                Shown to clients before they book, so they know if a patch test is needed in advance.
              </Text>
              <RadioGroup options={PATCH_OPTS} value={patchTest} onChange={setPatchTest} />
            </Card>

            <Card title="Languages Spoken" sub="Clients often search for providers who speak their language.">
              {/* Signup's "Other" chip lets a provider type a language that
                  isn't in LANGUAGE_OPTS. Appending any already-saved value
                  that the list doesn't cover keeps it visible and de-selectable
                  here — rendering LANGUAGE_OPTS alone would hide it while it
                  stayed in `languages`, so the chips would disagree with what
                  actually saves. 'Other' itself is never written to
                  `languages` directly — selecting it just reveals the free-text
                  field below, same as signup. */}
              <ChipGroup
                options={languageOptions}
                selected={languages}
                onToggle={v => toggleChip(languages, setLanguages, v)}
              />
              {showLanguagesOther && (
                <Field
                  label="Other language"
                  value={languagesOther}
                  onChange={setLanguagesOther}
                  placeholder="Type a language..."
                />
              )}
            </Card>

            <Card title="Accessibility" sub="Help clients with access needs find you.">
              <ChipGroup options={ACCESSIBILITY_OPTS} selected={accessibility} onToggle={v => toggleChip(accessibility, setAccessibility, v)} />
            </Card>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}
