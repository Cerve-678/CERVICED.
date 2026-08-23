/**
 * About You — the "can clients trust you, and can they physically reach you"
 * third of what used to be the single 671-line Business Details screen.
 *
 * Scope: credentials & policies (qualifications, insurance, DBS, patch test,
 * online consultations), where you're based (cities covered + travel radius),
 * languages, and accessibility.
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
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import { CityMultiSelect } from '../../components/CityMultiSelect';
import {
  getMyProviderProfile,
  updateProviderContactDetails,
} from '../../services/databaseService';
import {
  Card, Field, ChipGroup, RadioGroup, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  LANGUAGE_OPTS, ACCESSIBILITY_OPTS, PATCH_OPTS,
} from '../../features/business-details/options';
import { recognizeLanguage } from '../../data/languages';
import { toUserMessage } from '../../utils/userFacingError';

export default function AboutYouScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [providerId, setProviderId] = useState<string | null>(null);

  const [qualifications, setQualifications] = useState('');
  const [isInsured, setIsInsured]           = useState(false);
  const [dbsChecked, setDbsChecked]         = useState(false);
  const [onlineConsult, setOnlineConsult]   = useState(false);
  const [patchTest, setPatchTest]           = useState('');

  const [citiesCovered, setCitiesCovered]   = useState<string[]>([]);
  const [travelRadius, setTravelRadius]     = useState('');
  const [languages, setLanguages]           = useState<string[]>([]);
  const [languagesOther, setLanguagesOther] = useState('');
  const [accessibility, setAccessibility]   = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // LANGUAGE_OPTS plus anything already saved that it doesn't cover — a
  // language typed into signup's "Other" free-text input would otherwise have
  // no chip here, leaving it invisible but still selected. 'Other' itself
  // always trails the list and reveals a free-text box, same as signup.
  const languageOptions = useMemo(
    () => [...LANGUAGE_OPTS, ...languages.filter(l => !LANGUAGE_OPTS.includes(l)), 'Other'],
    [languages],
  );
  const showLanguagesOther = languages.includes('Other');

  useEffect(() => {
    (async () => {
      try {
        const providerData = await getMyProviderProfile();
        if (providerData) {
          setProviderId(providerData.id ?? null);
          setQualifications(providerData.qualifications ?? '');
          setIsInsured(providerData.is_insured_self_declared ?? false);
          setDbsChecked(providerData.dbs_checked_self_declared ?? false);
          setOnlineConsult(providerData.online_consultations_available ?? false);
          setPatchTest(providerData.patch_test_policy ?? '');
          setCitiesCovered(providerData.service_locations ?? []);
          setTravelRadius(providerData.travel_radius ?? '');
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
        qualifications: qualifications.trim() || null,
        is_insured_self_declared: isInsured,
        dbs_checked_self_declared: dbsChecked,
        online_consultations_available: onlineConsult,
        // '' would violate providers_patch_test_policy_check — clear with null.
        patch_test_policy: (patchTest as 'always' | 'new_clients' | 'optional' | 'not_needed') || null,
        service_locations: citiesCovered,
        travel_radius: travelRadius.trim() || null,
        languages_spoken: finalLanguages,
        accessibility_notes: accessibility.length ? accessibility.join('|') : null,
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
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
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

            {/* Cities covered, not a single base location — this writes
                service_locations, the same list the client Search "City"
                filter reads, so every city selected here is one a client can
                actually filter by. */}
            <Card title="Where You're Based" sub="Select every city you cover. Clients filter search by these, so add anywhere you'll travel to.">
              {/* The shared searchable city finder — same component signup
                  (Step 4), InfoRegScreen and the client Search "City" filter
                  all use, so a city always means the same thing on both
                  sides. A flat 60-chip grid was the wrong shape for a list
                  this long. */}
              <CityMultiSelect
                selected={citiesCovered}
                onChange={setCitiesCovered}
                palette={C}
                placeholder="Select the cities you cover"
              />
              <View style={{ height: 18 }} />
              <Field label="Travel Radius" value={travelRadius} onChange={setTravelRadius} placeholder="e.g. 10 miles" note="Optional — how far you're willing to travel within those areas." />
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
