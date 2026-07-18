// src/screens/BeautyProfileScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';

// ── Option lists ────────────────────────────────────────────────────────────

const HAIR_TYPES       = ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'];
const SCALP_CONDITIONS = ['Healthy', 'Dry', 'Oily', 'Sensitive', 'Flaky'];
const HAIR_GOALS       = ['Length retention', 'Volume', 'Colour / highlights', 'Moisture', 'Definition', 'Protective styling'];
const SKIN_TYPES       = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'];
const SKIN_TONES       = ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Rich'];
const SKIN_CONCERNS    = [
  'Acne prone', 'Hyperpigmentation', 'Rosacea', 'Eczema',
  'Psoriasis', 'Fine lines', 'Dark circles', 'Dry patches', 'Oiliness',
];
const SENSITIVE_AREAS  = ['Face', 'Arms', 'Legs', 'Back', 'Chest', 'Bikini / Brazilian', 'None'];
const ALLERGENS        = [
  'Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel',
  'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten', 'None known',
];
const NAIL_LENGTHS     = ['Short', 'Medium', 'Long', 'Extra long'];
const NAIL_SHAPES      = ['Round', 'Square', 'Oval', 'Coffin', 'Almond', 'Stiletto'];
const LASH_STYLES      = ['Natural', 'Wispy', 'Dramatic', 'Mega volume'];
const LASH_STATUS      = ['Currently have extensions', 'Growing out', 'No extensions'];
const BROW_STYLES      = ['Natural', 'Defined', 'Laminated', 'Fluffy', 'Feathered'];
const BROW_CONDITIONS  = ['Full', 'Sparse', 'Uneven', 'Overplucked'];
const MAKEUP_COVERAGE  = ['Sheer / natural', 'Medium coverage', 'Full glam'];
const MAKEUP_FINISH    = ['Matte', 'Dewy', 'Satin'];
const MAKEUP_EYES      = ['Subtle', 'Defined', 'Bold / dramatic'];
const MAKEUP_LIPS      = ['Nude', 'Berry / wine', 'Coral / peach', 'Classic red', 'Bold colour'];
const STYLE_VIBES      = ['Natural', 'Glam', 'Bold', 'Classic', 'Editorial', 'Low-maintenance', 'Experimental'];
const TREATMENT_HISTORY = [
  'Virgin hair', 'Coloured', 'Bleached / lightened', 'Relaxed / permed',
  'Hair extensions', 'Lash extensions', 'Microblading', 'Fillers / Botox', 'Chemical peels',
];
const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];

// ── Data shape ──────────────────────────────────────────────────────────────

interface BeautyData {
  // Hair
  hairType:           string;
  scalpCondition:     string;
  hairGoals:          string[];
  treatmentHistory:   string[];
  // Skin
  skinType:           string;
  skinTone:           string;
  skinConcerns:       string[];
  sensitiveAreas:     string[];
  // Nails
  nailLength:         string;
  nailShape:          string;
  // Lashes & Brows
  lashStyle:          string;
  lashStatus:         string;
  browStyle:          string;
  browCondition:      string;
  // Makeup
  makeupCoverage:     string;
  makeupFinish:       string;
  makeupEyes:         string;
  makeupLips:         string;
  // General
  styleVibe:          string;
  serviceInterests:   string[];
  // Personalisation
  gender:             'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null;
  has_kids:           boolean;
  // Health & Consent
  allergies:          string[];
  medicalNotes:       string;
  photographyConsent: boolean;
}

const EMPTY: BeautyData = {
  hairType: '', scalpCondition: '', hairGoals: [], treatmentHistory: [],
  skinType: '', skinTone: '', skinConcerns: [], sensitiveAreas: [],
  nailLength: '', nailShape: '',
  lashStyle: '', lashStatus: '', browStyle: '', browCondition: '',
  makeupCoverage: '', makeupFinish: '', makeupEyes: '', makeupLips: '',
  styleVibe: '', serviceInterests: [],
  gender: null, has_kids: false,
  allergies: [], medicalNotes: '', photographyConsent: true,
};

// ── Main screen ─────────────────────────────────────────────────────────────

export default function BeautyProfileScreen({ navigation }: any) {
  const { user } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [fetching,  setFetching]  = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [saved,     setSaved]     = useState<BeautyData>(EMPTY);
  const [draft,     setDraft]     = useState<BeautyData>(EMPTY);

  // single ref holding all section Y positions — avoids unused-var hints
  const sectionY = useRef({ skin: 0, allergy: 0, concerns: 0, vibe: 0, services: 0, history: 0, medical: 0, photo: 0, nails: 0, lashes: 0, makeup: 0 });

  const scrollTo = (key: keyof typeof sectionY.current) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current[key] - 24), animated: true });

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    setFetching(true);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const m = authUser?.user?.user_metadata ?? {};
      const profile: BeautyData = {
        hairType:           m['hair_type']           ?? '',
        scalpCondition:     m['scalp_condition']     ?? '',
        hairGoals:          m['hair_goals']          ?? [],
        treatmentHistory:   m['treatment_history']   ?? [],
        skinType:           m['skin_type']           ?? '',
        skinTone:           m['skin_tone']           ?? '',
        skinConcerns:       m['skin_concerns']       ?? [],
        sensitiveAreas:     m['sensitive_areas']     ?? [],
        nailLength:         m['nail_length']         ?? '',
        nailShape:          m['nail_shape']          ?? '',
        lashStyle:          m['lash_style']          ?? '',
        lashStatus:         m['lash_status']         ?? '',
        browStyle:          m['brow_style']          ?? '',
        browCondition:      m['brow_condition']      ?? '',
        makeupCoverage:     m['makeup_coverage']     ?? '',
        makeupFinish:       m['makeup_finish']       ?? '',
        makeupEyes:         m['makeup_eyes']         ?? '',
        makeupLips:         m['makeup_lips']         ?? '',
        styleVibe:          m['style_vibe']          ?? '',
        serviceInterests:   m['service_interests']   ?? [],
        gender:             (m['gender'] as 'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null) ?? null,
        has_kids:           m['has_kids']            ?? false,
        allergies:          m['allergies']           ?? [],
        medicalNotes:       m['medical_notes']       ?? '',
        photographyConsent: m['photography_consent'] ?? true,
      };
      setSaved(profile);
      setDraft(profile);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const { error } = await supabase.auth.updateUser({
      data: {
        hair_type:           draft.hairType          || null,
        scalp_condition:     draft.scalpCondition    || null,
        hair_goals:          draft.hairGoals,
        treatment_history:   draft.treatmentHistory,
        skin_type:           draft.skinType          || null,
        skin_tone:           draft.skinTone          || null,
        skin_concerns:       draft.skinConcerns,
        sensitive_areas:     draft.sensitiveAreas,
        nail_length:         draft.nailLength        || null,
        nail_shape:          draft.nailShape         || null,
        lash_style:          draft.lashStyle         || null,
        lash_status:         draft.lashStatus        || null,
        brow_style:          draft.browStyle         || null,
        brow_condition:      draft.browCondition     || null,
        makeup_coverage:     draft.makeupCoverage    || null,
        makeup_finish:       draft.makeupFinish      || null,
        makeup_eyes:         draft.makeupEyes        || null,
        makeup_lips:         draft.makeupLips        || null,
        style_vibe:          draft.styleVibe         || null,
        service_interests:   draft.serviceInterests,
        gender:              draft.gender            || null,
        has_kids:            draft.has_kids,
        allergies:           draft.allergies,
        medical_notes:       draft.medicalNotes      || null,
        photography_consent: draft.photographyConsent,
      },
    });

    // Sync all beauty profile fields to users table so providers can read them.
    // Uses upsert in case the users row doesn't exist yet.
    if (user?.id) {
      supabase.from('users').upsert({
        id:                  user.id,
        hair_type:           draft.hairType            || null,
        skin_type:           draft.skinType            || null,
        allergies:           draft.allergies,
        skin_concerns:       draft.skinConcerns,
        style_vibe:          draft.styleVibe           || null,
        medical_notes:       draft.medicalNotes        || null,
        photography_consent: draft.photographyConsent,
        treatment_history:   draft.treatmentHistory,
        gender:              draft.gender              || null,
        has_kids:            draft.has_kids,
      }, { onConflict: 'id' }).then(() => {});
    }

    setSaving(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Error', 'Couldn\'t save your profile. Please try again.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSaved(draft);
      setEditing(false);
    }
  };

  const handleCancel = () => {
    Haptics.selectionAsync().catch(() => {});
    setDraft(saved);
    setEditing(false);
  };

  // ── Draft helpers ─────────────────────────────────────────────────────────

  const setSingle = (field: keyof BeautyData, value: string) => {
    if (!editing) return;
    Haptics.selectionAsync().catch(() => {});
    setDraft(prev => ({ ...prev, [field]: (prev[field] as string) === value ? '' : value }));
  };

  const toggleMulti = (field: keyof BeautyData, value: string) => {
    if (!editing) return;
    Haptics.selectionAsync().catch(() => {});
    setDraft(prev => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const toggleAllergen = (item: string) => {
    if (!editing) return;
    Haptics.selectionAsync().catch(() => {});
    setDraft(prev => {
      if (item === 'None known') return { ...prev, allergies: prev.allergies.includes('None known') ? [] : ['None known'] };
      const without = prev.allergies.filter(a => a !== 'None known');
      return { ...prev, allergies: without.includes(item) ? without.filter(a => a !== item) : [...without, item] };
    });
  };

  // ── Chip styling ──────────────────────────────────────────────────────────

  const glassStyle = (active?: boolean) => ({
    backgroundColor: active
      ? (isDarkMode ? 'rgba(175,145,151,0.35)' : 'rgba(175,145,151,0.2)')
      : (isDarkMode ? 'rgba(58,58,60,0.6)'     : 'rgba(255,255,255,0.12)'),
    borderTopColor:    isDarkMode ? (active ? 'rgba(175,145,151,0.7)' : theme.border) : (active ? 'rgba(175,145,151,0.8)' : 'rgba(255,255,255,0.7)'),
    borderLeftColor:   isDarkMode ? (active ? 'rgba(175,145,151,0.5)' : theme.border) : (active ? 'rgba(175,145,151,0.6)' : 'rgba(255,255,255,0.5)'),
    borderRightColor:  isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const chip  = (on: boolean) => [styles.chip, glassStyle(on)];
  const cText = (on: boolean) => [styles.chipText, { color: on ? (isDarkMode ? '#fff' : theme.text) : theme.secondaryText }];

  const allergyChip = (item: string) => {
    const on    = draft.allergies.includes(item);
    const isNone = item === 'None known';
    return [
      styles.chip,
      glassStyle(on),
      on && isNone && { backgroundColor: isDarkMode ? 'rgba(52,199,89,0.3)' : 'rgba(52,199,89,0.2)' },
    ];
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (fetching) {
    return (
      <ThemedBackground style={styles.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      </ThemedBackground>
    );
  }

  const hasAnyData = draft.hairType || draft.skinType || draft.allergies.length ||
    draft.skinConcerns.length || draft.styleVibe || draft.treatmentHistory.length ||
    draft.medicalNotes || draft.serviceInterests.length || draft.nailLength ||
    draft.lashStyle || draft.browStyle || draft.makeupCoverage;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: theme.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => editing ? handleCancel() : (Haptics.selectionAsync().catch(() => {}), setEditing(true))} activeOpacity={0.7}>
            <Text style={[styles.editToggle, { color: theme.accent }]}>{editing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Beauty Profile</Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          {editing
            ? 'Tap to select — this is shared with your providers'
            : hasAnyData
              ? 'Your saved profile — providers see this before each appointment'
              : 'No profile set yet — tap Edit to get started'}
        </Text>

        {/* ══ HEALTH & SAFETY (always fill) ══════════════════════════════ */}
        <CatDivider label="HEALTH & SAFETY" theme={theme} />

        {/* Allergies */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.allergy = e.nativeEvent.layout.y; }}>
          <SectionHead label="ALLERGIES" sub="Known allergies or sensitivities — always shared with providers" filled={draft.allergies.length > 0} editing={editing} theme={theme} warning />
          <View style={styles.chips}>
            {ALLERGENS.map(item => (
              <TouchableOpacity key={item} style={allergyChip(item)} onPress={() => toggleAllergen(item)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.allergies.includes(item))}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Medical notes */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.medical = e.nativeEvent.layout.y; }}>
          <SectionHead label="MEDICAL NOTES" sub="Pregnancy, medications, health conditions that affect treatments" filled={!!draft.medicalNotes} editing={editing} theme={theme} warning />
          <TextInput
            style={[styles.medicalInput, { color: theme.text, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', opacity: editing ? 1 : 0.7 }]}
            value={draft.medicalNotes}
            onChangeText={text => editing && setDraft(prev => ({ ...prev, medicalNotes: text }))}
            placeholder={editing ? 'e.g. currently pregnant, on blood thinners, photosensitive medication...' : (draft.medicalNotes ? '' : 'None noted')}
            placeholderTextColor={theme.secondaryText}
            multiline numberOfLines={3} textAlignVertical="top" editable={editing}
          />
        </View>

        {/* ══ SKIN ══════════════════════════════════════════════════════════ */}
        <CatDivider label="SKIN" theme={theme} />

        {/* Skin type */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.skin = e.nativeEvent.layout.y; }}>
          <SectionHead label="SKIN TYPE" sub="Your skin type" filled={!!draft.skinType} editing={editing} theme={theme} />
          <View style={styles.chips}>
            {SKIN_TYPES.map(t => (
              <TouchableOpacity key={t} style={chip(draft.skinType === t)} onPress={() => setSingle('skinType', t)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.skinType === t)}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Skin tone */}
        <SectionHead label="SKIN TONE" sub="Your complexion" filled={!!draft.skinTone} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {SKIN_TONES.map(t => (
            <TouchableOpacity key={t} style={chip(draft.skinTone === t)} onPress={() => setSingle('skinTone', t)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.skinTone === t)}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Skin concerns */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.concerns = e.nativeEvent.layout.y; }}>
          <SectionHead label="SKIN CONCERNS" sub="Select all that apply" filled={draft.skinConcerns.length > 0} editing={editing} theme={theme} optional />
          <View style={styles.chips}>
            {SKIN_CONCERNS.map(c => (
              <TouchableOpacity key={c} style={chip(draft.skinConcerns.includes(c))} onPress={() => toggleMulti('skinConcerns', c)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.skinConcerns.includes(c))}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sensitive areas */}
        <SectionHead label="SENSITIVE AREAS" sub="Areas of sensitivity for treatments like waxing or facial work" filled={draft.sensitiveAreas.length > 0} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {SENSITIVE_AREAS.map(a => (
            <TouchableOpacity key={a} style={chip(draft.sensitiveAreas.includes(a))} onPress={() => toggleMulti('sensitiveAreas', a)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.sensitiveAreas.includes(a))}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══ HAIR ══════════════════════════════════════════════════════════ */}
        <CatDivider label="HAIR" theme={theme} />

        {/* Hair type */}
        <SectionHead label="HAIR TYPE" sub="Your hair texture" filled={!!draft.hairType} editing={editing} theme={theme} />
        <View style={styles.chips}>
          {HAIR_TYPES.map(t => (
            <TouchableOpacity key={t} style={chip(draft.hairType === t)} onPress={() => setSingle('hairType', t)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.hairType === t)}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Scalp condition */}
        <SectionHead label="SCALP CONDITION" sub="Your scalp health" filled={!!draft.scalpCondition} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {SCALP_CONDITIONS.map(c => (
            <TouchableOpacity key={c} style={chip(draft.scalpCondition === c)} onPress={() => setSingle('scalpCondition', c)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.scalpCondition === c)}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Treatment history */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.history = e.nativeEvent.layout.y; }}>
          <SectionHead label="COLOUR & TREATMENT HISTORY" sub="Previous professional treatments" filled={draft.treatmentHistory.length > 0} editing={editing} theme={theme} optional />
          <View style={styles.chips}>
            {TREATMENT_HISTORY.map(h => (
              <TouchableOpacity key={h} style={chip(draft.treatmentHistory.includes(h))} onPress={() => toggleMulti('treatmentHistory', h)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.treatmentHistory.includes(h))}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Hair goals */}
        <SectionHead label="HAIR GOALS" sub="What you're looking to achieve" filled={draft.hairGoals.length > 0} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {HAIR_GOALS.map(g => (
            <TouchableOpacity key={g} style={chip(draft.hairGoals.includes(g))} onPress={() => toggleMulti('hairGoals', g)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.hairGoals.includes(g))}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══ NAILS ═════════════════════════════════════════════════════════ */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.nails = e.nativeEvent.layout.y; }}>
          <CatDivider label="NAILS" theme={theme} />
        </View>

        <SectionHead label="PREFERRED LENGTH" sub="How long do you like your nails?" filled={!!draft.nailLength} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {NAIL_LENGTHS.map(l => (
            <TouchableOpacity key={l} style={chip(draft.nailLength === l)} onPress={() => setSingle('nailLength', l)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.nailLength === l)}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="PREFERRED SHAPE" sub="Your go-to nail shape" filled={!!draft.nailShape} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {NAIL_SHAPES.map(s => (
            <TouchableOpacity key={s} style={chip(draft.nailShape === s)} onPress={() => setSingle('nailShape', s)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.nailShape === s)}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══ LASHES & BROWS ════════════════════════════════════════════════ */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.lashes = e.nativeEvent.layout.y; }}>
          <CatDivider label="LASHES & BROWS" theme={theme} />
        </View>

        <SectionHead label="LASH STYLE" sub="Your preferred lash look" filled={!!draft.lashStyle} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {LASH_STYLES.map(s => (
            <TouchableOpacity key={s} style={chip(draft.lashStyle === s)} onPress={() => setSingle('lashStyle', s)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.lashStyle === s)}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="LASH STATUS" sub="Current situation" filled={!!draft.lashStatus} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {LASH_STATUS.map(s => (
            <TouchableOpacity key={s} style={chip(draft.lashStatus === s)} onPress={() => setSingle('lashStatus', s)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.lashStatus === s)}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="BROW STYLE" sub="Your preferred brow look" filled={!!draft.browStyle} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {BROW_STYLES.map(s => (
            <TouchableOpacity key={s} style={chip(draft.browStyle === s)} onPress={() => setSingle('browStyle', s)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.browStyle === s)}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="BROW CONDITION" sub="Your natural brows" filled={!!draft.browCondition} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {BROW_CONDITIONS.map(c => (
            <TouchableOpacity key={c} style={chip(draft.browCondition === c)} onPress={() => setSingle('browCondition', c)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.browCondition === c)}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══ MAKEUP ════════════════════════════════════════════════════════ */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.makeup = e.nativeEvent.layout.y; }}>
          <CatDivider label="MAKEUP" theme={theme} />
        </View>

        <SectionHead label="COVERAGE" sub="How much coverage do you prefer?" filled={!!draft.makeupCoverage} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {MAKEUP_COVERAGE.map(c => (
            <TouchableOpacity key={c} style={chip(draft.makeupCoverage === c)} onPress={() => setSingle('makeupCoverage', c)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.makeupCoverage === c)}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="FINISH" sub="Your preferred skin finish" filled={!!draft.makeupFinish} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {MAKEUP_FINISH.map(f => (
            <TouchableOpacity key={f} style={chip(draft.makeupFinish === f)} onPress={() => setSingle('makeupFinish', f)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.makeupFinish === f)}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="EYE STYLE" sub="What eye look do you go for?" filled={!!draft.makeupEyes} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {MAKEUP_EYES.map(e => (
            <TouchableOpacity key={e} style={chip(draft.makeupEyes === e)} onPress={() => setSingle('makeupEyes', e)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.makeupEyes === e)}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHead label="LIP PREFERENCE" sub="Your go-to lip look" filled={!!draft.makeupLips} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {MAKEUP_LIPS.map(l => (
            <TouchableOpacity key={l} style={chip(draft.makeupLips === l)} onPress={() => setSingle('makeupLips', l)} activeOpacity={editing ? 0.6 : 1}>
              <Text style={cText(draft.makeupLips === l)}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══ GENERAL ═══════════════════════════════════════════════════════ */}
        <CatDivider label="GENERAL" theme={theme} />

        {/* Style vibe */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.vibe = e.nativeEvent.layout.y; }}>
          <SectionHead label="STYLE VIBE" sub="How would you describe your overall look?" filled={!!draft.styleVibe} editing={editing} theme={theme} optional />
          <View style={styles.chips}>
            {STYLE_VIBES.map(v => (
              <TouchableOpacity key={v} style={chip(draft.styleVibe === v)} onPress={() => setSingle('styleVibe', v)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.styleVibe === v)}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Services */}
        <View onLayout={(e: LayoutChangeEvent) => { sectionY.current.services = e.nativeEvent.layout.y; }}>
          <SectionHead label="SERVICES I'M INTO" sub="What you typically book" filled={draft.serviceInterests.length > 0} editing={editing} theme={theme} optional />
          <View style={styles.chips}>
            {SERVICE_CATEGORIES.map(s => (
              <TouchableOpacity key={s} style={chip(draft.serviceInterests.includes(s))} onPress={() => toggleMulti('serviceInterests', s)} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.serviceInterests.includes(s))}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ══ PERSONALISATION ════════════════════════════════════════════════ */}
        <CatDivider label="PERSONALISATION" theme={theme} />

        {/* Gender */}
        <SectionHead label="GENDER" sub="Helps us personalise your home feed" filled={!!draft.gender} editing={editing} theme={theme} optional />
        <View style={styles.chips}>
          {(['female', 'male', 'non-binary', 'prefer-not-to-say'] as const).map(g => {
            const label: Record<string, string> = { female: 'Female', male: 'Male', 'non-binary': 'Non-binary', 'prefer-not-to-say': 'Prefer not to say' };
            return (
              <TouchableOpacity key={g} style={chip(draft.gender === g)} onPress={() => { if (!editing) return; Haptics.selectionAsync().catch(() => {}); setDraft(prev => ({ ...prev, gender: prev.gender === g ? null : g })); }} activeOpacity={editing ? 0.6 : 1}>
                <Text style={cText(draft.gender === g)}>{label[g]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Kids services */}
        <View style={[styles.consentRow, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 32 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.consentLabel, { color: theme.text }]}>Kids beauty services</Text>
            <Text style={[styles.consentSub, { color: theme.secondaryText }]}>Show me kids' beauty services in the home feed</Text>
          </View>
          <Switch
            value={draft.has_kids}
            onValueChange={v => { if (!editing) return; Haptics.selectionAsync().catch(() => {}); setDraft(prev => ({ ...prev, has_kids: v })); }}
            trackColor={{ false: '#D1D1D6', true: theme.accent }}
            thumbColor={draft.has_kids ? '#fff' : '#f4f3f4'}
            disabled={!editing}
          />
        </View>

        {/* ══ CONSENT ════════════════════════════════════════════════════════ */}
        <CatDivider label="CONSENT" theme={theme} />

        {/* Photography consent */}
        <View
          onLayout={(e: LayoutChangeEvent) => { sectionY.current.photo = e.nativeEvent.layout.y; }}
          style={[styles.consentRow, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.consentLabel, { color: theme.text }]}>Photography consent</Text>
            <Text style={[styles.consentSub, { color: theme.secondaryText }]}>
              Allow your provider to share before/after photos on their social media
            </Text>
          </View>
          <Switch
            value={draft.photographyConsent}
            onValueChange={v => { if (!editing) return; Haptics.selectionAsync().catch(() => {}); setDraft(prev => ({ ...prev, photographyConsent: v })); }}
            trackColor={{ false: '#D1D1D6', true: theme.accent }}
            thumbColor={draft.photographyConsent ? '#fff' : '#f4f3f4'}
            disabled={!editing}
          />
        </View>

        {/* ── SAVE ── */}
        {editing && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(175,145,151,0.25)', borderColor: 'rgba(175,145,151,0.4)' }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={isDarkMode ? '#fff' : theme.text} />
              : <Text style={[styles.saveBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>SAVE PROFILE</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

// ── Category divider ─────────────────────────────────────────────────────────

function CatDivider({ label, theme }: { label: string; theme: any }) {
  return (
    <View style={styles.catDividerWrap}>
      <View style={[styles.catDividerLine, { backgroundColor: theme.border ?? 'rgba(0,0,0,0.08)' }]} />
      <Text style={[styles.catDividerLabel, { color: theme.accent }]}>{label}</Text>
      <View style={[styles.catDividerLine, { backgroundColor: theme.border ?? 'rgba(0,0,0,0.08)' }]} />
    </View>
  );
}

// ── Section header component ─────────────────────────────────────────────────

interface SectionHeadProps {
  label: string;
  sub: string;
  filled: boolean;
  editing: boolean;
  theme: any;
  warning?: boolean;
  optional?: boolean;
}

function SectionHead({ label, sub, filled, editing, theme, warning, optional }: SectionHeadProps) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionLabel, { color: theme.text }]}>{label}</Text>
        {!editing && filled && <View style={styles.filledDot} />}
        {warning && <Text style={styles.warnIcon}>⚠</Text>}
        {optional && (
          <Text style={[styles.optionalBadge, { color: theme.secondaryText }]}>optional</Text>
        )}
      </View>
      <Text style={[styles.sectionSub, { color: theme.secondaryText }]}>{sub}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg:          { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:      { paddingHorizontal: 24 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn:   { padding: 4 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  editToggle:{ fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.5 },

  title:    { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 20, marginBottom: 36 },

  sectionWrap:     { marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionLabel:    { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 2 },
  filledDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759' },
  warnIcon:        { fontSize: 12, color: '#FFD60A' },
  sectionSub:      { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  chip:  { borderRadius: 100, borderWidth: 1.5, paddingVertical: 11, paddingHorizontal: 18 },
  chipText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.8 },

  medicalInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    lineHeight: 22,
    minHeight: 90,
    marginBottom: 32,
  },

  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 32,
  },
  consentLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.5, marginBottom: 4 },
  consentSub:   { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18 },

  saveBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, marginTop: 4 },
  saveBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1 },

  catDividerWrap:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22, marginTop: 8 },
  catDividerLine:  { flex: 1, height: 1 },
  catDividerLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 2.5 },
  optionalBadge:   { fontSize: 10, letterSpacing: 0.3, fontStyle: 'italic', marginLeft: 2 },
});
