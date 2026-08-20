// src/screens/client/BeautyProfileScreen.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabase';
import { upsertUserBeautyProfile } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import {
  type BeautyData,
  type CategoryKey,
  type Gender,
  EMPTY_BEAUTY_DATA,
} from '../../types/beautyProfile';
import {
  computeBeautyProfileStats,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type CategoryStats,
} from '../../utils/beautyProfileStats';
import { HAIR_TYPES } from '../../constants/hairTypes';

// ── Option lists ────────────────────────────────────────────────────────────

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

const GENDER_LABELS: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  'non-binary': 'Non-binary',
  'prefer-not-to-say': 'Prefer not to say',
};

// ── Main screen ─────────────────────────────────────────────────────────────

export default function BeautyProfileScreen({ navigation }: any) {
  const { user } = useAuth();
  const { theme, isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, DialogHost } = useAppDialog();

  const [fetching, setFetching] = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [saved,    setSaved]    = useState<BeautyData>(EMPTY_BEAUTY_DATA);
  const [draft,    setDraft]    = useState<BeautyData>(EMPTY_BEAUTY_DATA);

  // The grid ⇄ focused-category swap. This is screen state, not navigation:
  // SAVE PROFILE is one transaction across all nine categories, so the draft
  // has to stay screen-level regardless of which category is on screen. A route
  // push per category would put nine entries on the stack all sharing one
  // pending save.
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);

  const openCategory = (key: CategoryKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCategory(key);
  };

  const closeCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCategory(null);
  };

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
        gender:             (m['gender'] as Gender | null) ?? null,
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

    const { error: authError } = await supabase.auth.updateUser({
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
    // Uses upsert in case the users row doesn't exist yet. Awaited (not
    // fire-and-forget) since this is the copy providers actually query —
    // a silent failure here would desync health-adjacent data (allergies,
    // medical notes) from what the client believes was saved.
    let syncError: unknown = null;
    if (user?.id) {
      try {
        await upsertUserBeautyProfile(user.id, {
          hair_type:           draft.hairType            || null,
          scalp_condition:     draft.scalpCondition      || null,
          hair_goals:          draft.hairGoals,
          skin_type:           draft.skinType            || null,
          skin_tone:           draft.skinTone            || null,
          skin_concerns:       draft.skinConcerns,
          sensitive_areas:     draft.sensitiveAreas,
          nail_length:         draft.nailLength          || null,
          nail_shape:          draft.nailShape           || null,
          lash_style:          draft.lashStyle           || null,
          lash_status:         draft.lashStatus          || null,
          brow_style:          draft.browStyle           || null,
          brow_condition:      draft.browCondition       || null,
          makeup_coverage:     draft.makeupCoverage      || null,
          makeup_finish:       draft.makeupFinish        || null,
          makeup_eyes:         draft.makeupEyes          || null,
          makeup_lips:         draft.makeupLips          || null,
          allergies:           draft.allergies,
          style_vibe:          draft.styleVibe           || null,
          medical_notes:       draft.medicalNotes        || null,
          photography_consent: draft.photographyConsent,
          treatment_history:   draft.treatmentHistory,
          service_interests:   draft.serviceInterests,
          gender:              draft.gender              || null,
          has_kids:            draft.has_kids,
        });
      } catch (err) {
        syncError = err;
        logger.error('upsertUserBeautyProfile failed:', err);
      }
    }

    setSaving(false);
    if (authError || syncError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert('Error', 'Couldn\'t save your profile. Please try again.');
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

  // ── Derived stats ─────────────────────────────────────────────────────────
  // Every number on this screen comes from here. Recomputed only when the draft
  // changes, since the whole grid reads from it on each render.

  const stats = useMemo(() => computeBeautyProfileStats(draft), [draft]);

  // ── Palette ───────────────────────────────────────────────────────────────


  const chipStyle = (on: boolean) => [
    styles.chip,
    {
      backgroundColor: on ? P.accentDim : P.surface,
      borderColor: on ? P.accent : P.border,
    },
  ];
  const chipTextStyle = (on: boolean) => [
    styles.chipText,
    { color: on ? P.text : P.sub },
  ];

  // ── Loading ───────────────────────────────────────────────────────────────

  if (fetching) {
    return (
      <ThemedBackground style={styles.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={P.accent} size="large" />
        </View>
      </ThemedBackground>
    );
  }

  // ── Chip group ────────────────────────────────────────────────────────────

  const renderChips = (
    options: string[],
    isOn: (opt: string) => boolean,
    onPress: (opt: string) => void,
  ) => (
    <View style={styles.chips}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={chipStyle(isOn(opt))}
          onPress={() => onPress(opt)}
          activeOpacity={editing ? 0.5 : 1}
        >
          <Text style={chipTextStyle(isOn(opt))}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const sectionHead = (
    label: string,
    sub: string,
    count?: { selected: number; total: number },
    opts?: { warning?: boolean; optional?: boolean },
  ) => (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionLabel, { color: P.text }]}>{label}</Text>
      {opts?.warning && <Text style={styles.warnIcon}>⚠</Text>}
      {opts?.optional && <Text style={[styles.optionalBadge, { color: P.sub }]}>optional</Text>}
      {count && (
        <Text style={[styles.sectionCount, { color: P.sub }]}>
          {count.selected}/{count.total}
        </Text>
      )}
    </View>
  );

  // ── Focused single-category body ──────────────────────────────────────────

  const renderCategoryBody = (key: CategoryKey) => {
    switch (key) {
      case 'health':
        return (
          <>
            {sectionHead('ALLERGIES', '', { selected: draft.allergies.length, total: ALLERGENS.length }, { warning: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Known allergies or sensitivities — always shared with providers
            </Text>
            {renderChips(ALLERGENS, o => draft.allergies.includes(o), toggleAllergen)}

            {sectionHead('MEDICAL NOTES', '', undefined, { warning: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Pregnancy, medications, health conditions that affect treatments
            </Text>
            <TextInput
              style={[styles.medicalInput, {
                color: P.text,
                backgroundColor: P.surface,
                borderColor: P.border,
                opacity: editing ? 1 : 0.7,
              }]}
              value={draft.medicalNotes}
              onChangeText={text => editing && setDraft(prev => ({ ...prev, medicalNotes: text }))}
              placeholder={editing ? 'e.g. currently pregnant, on blood thinners, photosensitive medication...' : (draft.medicalNotes ? '' : 'None noted')}
              placeholderTextColor={P.sub}
              multiline numberOfLines={3} textAlignVertical="top" editable={editing}
            />
          </>
        );

      case 'skin':
        return (
          <>
            {sectionHead('SKIN TYPE', '', { selected: draft.skinType ? 1 : 0, total: 1 })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your skin type</Text>
            {renderChips(SKIN_TYPES, o => draft.skinType === o, o => setSingle('skinType', o))}

            {sectionHead('SKIN TONE', '', { selected: draft.skinTone ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your complexion</Text>
            {renderChips(SKIN_TONES, o => draft.skinTone === o, o => setSingle('skinTone', o))}

            {sectionHead('SKIN CONCERNS', '', { selected: draft.skinConcerns.length, total: SKIN_CONCERNS.length }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Select all that apply</Text>
            {renderChips(SKIN_CONCERNS, o => draft.skinConcerns.includes(o), o => toggleMulti('skinConcerns', o))}

            {sectionHead('SENSITIVE AREAS', '', { selected: draft.sensitiveAreas.length, total: SENSITIVE_AREAS.length }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>
              Areas of sensitivity for treatments like waxing or facial work
            </Text>
            {renderChips(SENSITIVE_AREAS, o => draft.sensitiveAreas.includes(o), o => toggleMulti('sensitiveAreas', o))}
          </>
        );

      case 'hair':
        return (
          <>
            {sectionHead('HAIR TYPE', '', { selected: draft.hairType ? 1 : 0, total: 1 })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your hair texture</Text>
            {renderChips(HAIR_TYPES, o => draft.hairType === o, o => setSingle('hairType', o))}

            {sectionHead('SCALP CONDITION', '', { selected: draft.scalpCondition ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your scalp health</Text>
            {renderChips(SCALP_CONDITIONS, o => draft.scalpCondition === o, o => setSingle('scalpCondition', o))}

            {sectionHead('COLOUR & TREATMENT HISTORY', '', { selected: draft.treatmentHistory.length, total: TREATMENT_HISTORY.length }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Previous professional treatments</Text>
            {renderChips(TREATMENT_HISTORY, o => draft.treatmentHistory.includes(o), o => toggleMulti('treatmentHistory', o))}

            {sectionHead('HAIR GOALS', '', { selected: draft.hairGoals.length, total: HAIR_GOALS.length }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>What you're looking to achieve</Text>
            {renderChips(HAIR_GOALS, o => draft.hairGoals.includes(o), o => toggleMulti('hairGoals', o))}
          </>
        );

      case 'nails':
        return (
          <>
            {sectionHead('PREFERRED LENGTH', '', { selected: draft.nailLength ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>How long do you like your nails?</Text>
            {renderChips(NAIL_LENGTHS, o => draft.nailLength === o, o => setSingle('nailLength', o))}

            {sectionHead('PREFERRED SHAPE', '', { selected: draft.nailShape ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your go-to nail shape</Text>
            {renderChips(NAIL_SHAPES, o => draft.nailShape === o, o => setSingle('nailShape', o))}
          </>
        );

      case 'lashesBrows':
        return (
          <>
            {sectionHead('LASH STYLE', '', { selected: draft.lashStyle ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your preferred lash look</Text>
            {renderChips(LASH_STYLES, o => draft.lashStyle === o, o => setSingle('lashStyle', o))}

            {sectionHead('LASH STATUS', '', { selected: draft.lashStatus ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Current situation</Text>
            {renderChips(LASH_STATUS, o => draft.lashStatus === o, o => setSingle('lashStatus', o))}

            {sectionHead('BROW STYLE', '', { selected: draft.browStyle ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your preferred brow look</Text>
            {renderChips(BROW_STYLES, o => draft.browStyle === o, o => setSingle('browStyle', o))}

            {sectionHead('BROW CONDITION', '', { selected: draft.browCondition ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your natural brows</Text>
            {renderChips(BROW_CONDITIONS, o => draft.browCondition === o, o => setSingle('browCondition', o))}
          </>
        );

      case 'makeup':
        return (
          <>
            {sectionHead('COVERAGE', '', { selected: draft.makeupCoverage ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>How much coverage do you prefer?</Text>
            {renderChips(MAKEUP_COVERAGE, o => draft.makeupCoverage === o, o => setSingle('makeupCoverage', o))}

            {sectionHead('FINISH', '', { selected: draft.makeupFinish ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your preferred skin finish</Text>
            {renderChips(MAKEUP_FINISH, o => draft.makeupFinish === o, o => setSingle('makeupFinish', o))}

            {sectionHead('EYE STYLE', '', { selected: draft.makeupEyes ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>What eye look do you go for?</Text>
            {renderChips(MAKEUP_EYES, o => draft.makeupEyes === o, o => setSingle('makeupEyes', o))}

            {sectionHead('LIP PREFERENCE', '', { selected: draft.makeupLips ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Your go-to lip look</Text>
            {renderChips(MAKEUP_LIPS, o => draft.makeupLips === o, o => setSingle('makeupLips', o))}
          </>
        );

      case 'general':
        return (
          <>
            {sectionHead('STYLE VIBE', '', { selected: draft.styleVibe ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>How would you describe your overall look?</Text>
            {renderChips(STYLE_VIBES, o => draft.styleVibe === o, o => setSingle('styleVibe', o))}

            {sectionHead("SERVICES I'M INTO", '', { selected: draft.serviceInterests.length, total: SERVICE_CATEGORIES.length }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>What you typically book</Text>
            {renderChips(SERVICE_CATEGORIES, o => draft.serviceInterests.includes(o), o => toggleMulti('serviceInterests', o))}
          </>
        );

      case 'personalisation':
        return (
          <>
            {sectionHead('GENDER', '', { selected: draft.gender ? 1 : 0, total: 1 }, { optional: true })}
            <Text style={[styles.sectionSub, { color: P.sub }]}>Helps us personalise your home feed</Text>
            <View style={styles.chips}>
              {(Object.keys(GENDER_LABELS) as Gender[]).map(g => (
                <TouchableOpacity
                  key={g}
                  style={chipStyle(draft.gender === g)}
                  onPress={() => {
                    if (!editing) return;
                    Haptics.selectionAsync().catch(() => {});
                    setDraft(prev => ({ ...prev, gender: prev.gender === g ? null : g }));
                  }}
                  activeOpacity={editing ? 0.5 : 1}
                >
                  <Text style={chipTextStyle(draft.gender === g)}>{GENDER_LABELS[g]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.consentRow, { backgroundColor: P.surface, borderColor: P.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.consentLabel, { color: P.text }]}>Kids beauty services</Text>
                <Text style={[styles.consentSub, { color: P.sub }]}>Show me kids' beauty services in the home feed</Text>
              </View>
              <Switch
                value={draft.has_kids}
                onValueChange={v => { if (!editing) return; Haptics.selectionAsync().catch(() => {}); setDraft(prev => ({ ...prev, has_kids: v })); }}
                trackColor={{ false: '#D1D1D6', true: P.accent }}
                thumbColor={draft.has_kids ? '#fff' : '#f4f3f4'}
                disabled={!editing}
              />
            </View>
          </>
        );

      case 'consent':
        return (
          <View style={[styles.consentRow, { backgroundColor: P.surface, borderColor: P.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.consentLabel, { color: P.text }]}>Photography consent</Text>
              <Text style={[styles.consentSub, { color: P.sub }]}>
                Allow your provider to share before/after photos on their social media
              </Text>
            </View>
            <Switch
              value={draft.photographyConsent}
              onValueChange={v => { if (!editing) return; Haptics.selectionAsync().catch(() => {}); setDraft(prev => ({ ...prev, photographyConsent: v })); }}
              trackColor={{ false: '#D1D1D6', true: P.accent }}
              thumbColor={draft.photographyConsent ? '#fff' : '#f4f3f4'}
              disabled={!editing}
            />
          </View>
        );
    }
  };

  // ── Focused view ──────────────────────────────────────────────────────────

  if (selectedCategory) {
    const cat = stats.byCategory[selectedCategory];
    const isHealth = selectedCategory === 'health';

    return (
      <ThemedBackground style={styles.bg}>
        <StatusBar barStyle={theme.statusBar} translucent />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={closeCategory} activeOpacity={0.5}>
              <Text style={[styles.focusBack, { color: P.accentText }]}>← ALL CATEGORIES</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => editing ? handleCancel() : (Haptics.selectionAsync().catch(() => {}), setEditing(true))}
              activeOpacity={0.5}
            >
              <Text style={[styles.editToggle, { color: P.accentText }]}>{editing ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.focusTitleRow}>
            <Text style={[styles.focusTitle, { color: P.text }]}>{CATEGORY_LABELS[selectedCategory]}</Text>
            <Text style={[styles.focusPct, { color: P.accentText }]}>
              {cat.complete ? '✓' : `${cat.percent}%`}
            </Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: P.sep }]}>
            <View style={[
              styles.progressFill,
              { width: `${cat.percent}%`, backgroundColor: cat.complete ? '#34C759' : P.accent },
            ]} />
          </View>

          <Text style={[styles.focusFieldsCount, { color: P.sub }]}>
            {isHealth
              ? `${draft.allergies.length} of ${ALLERGENS.length} allergens flagged · ${draft.medicalNotes ? 'medical notes on file' : 'no medical notes'} · always shared`
              : cat.fieldsTotal > 0
                ? `${cat.fieldsSet} of ${cat.fieldsTotal} fields set · ${cat.selections} selection${cat.selections === 1 ? '' : 's'}`
                : 'Always shared with your provider'}
          </Text>

          {renderCategoryBody(selectedCategory)}

          {editing && (
            <TouchableOpacity
              style={[styles.saveBtn, {
                backgroundColor: P.accent,
                borderColor: P.accent,
              }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.75}
            >
              {saving
                ? <ActivityIndicator color={P.onAccent} />
                : <Text style={[styles.saveBtnText, { color: P.onAccent }]}>SAVE PROFILE</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
        {/* Rendered last so dialogs layer above the scroll content. */}
        <DialogHost />
      </ThemedBackground>
    );
  }

  // ── Grid view ─────────────────────────────────────────────────────────────

  const health = stats.byCategory.health;
  const healthOnFile = health.started;

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.5}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => editing ? handleCancel() : (Haptics.selectionAsync().catch(() => {}), setEditing(true))}
            activeOpacity={0.5}
          >
            <Text style={[styles.editToggle, { color: P.accentText }]}>{editing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: P.accentText }]}>PROFILE ANALYSIS</Text>
            {stats.isEmpty ? (
              <Text style={[styles.heroNumeralEmpty, { color: P.text }]}>NEW</Text>
            ) : (
              <View style={styles.heroNumeralRow}>
                <Text style={[styles.heroNumeral, { color: P.text }]}>{stats.overallPercent}</Text>
                <Text style={[styles.heroDenominator, { color: P.sub }]}>/100</Text>
              </View>
            )}
            <Text style={[styles.heroQualifier, { color: P.accentText }]}>
              {stats.isEmpty
                ? "LET'S BEGIN"
                : stats.overallPercent >= 80 ? 'LOOKING GREAT'
                : stats.overallPercent >= 40 ? 'GOOD START'
                : 'JUST STARTED'}
            </Text>
            <Text style={[styles.heroSub, { color: P.sub }]}>
              {stats.isEmpty
                ? 'Nothing shared with providers yet — allergies take 20 seconds.'
                : `${healthOnFile ? 'Health & Safety is on file.' : 'Health & Safety not set yet.'} ${stats.untouchedCount} categor${stats.untouchedCount === 1 ? 'y' : 'ies'} still untouched.`}
            </Text>
          </View>

          <View style={styles.heroSideStats}>
            <View style={styles.heroSideStat}>
              <View style={styles.heroSideNumRow}>
                <Text style={[styles.heroSideNum, { color: P.text }]}>{stats.categoriesStarted}</Text>
                <Text style={[styles.heroSideDenom, { color: P.sub }]}>/{stats.categoriesTotal}</Text>
              </View>
              <Text style={[styles.heroSideLabel, { color: P.sub }]}>STARTED</Text>
            </View>
            <View style={styles.heroSideStat}>
              <Text style={[styles.heroSideNum, { color: P.text }]}>{stats.totalSelections}</Text>
              <Text style={[styles.heroSideLabel, { color: P.sub }]}>SELECTIONS</Text>
            </View>
          </View>
        </View>

        {/* leader-line annotation */}
        <View style={styles.leaderRow}>
          <Text style={[styles.leaderLabel, { color: P.sub }]}>BEAUTY PROFILE</Text>
          <View style={[styles.leaderLine, { backgroundColor: P.border }]} />
          <Text style={[styles.leaderLabel, { color: P.sub }]}>SHARED W/ PROVIDERS</Text>
        </View>

        {/* ══ ASYMMETRIC STAT ROW ═══════════════════════════════════════════ */}
        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statCardWide, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.eyebrowSmall, { color: P.sub }]}>
              {stats.isEmpty ? 'RECOMMENDED FIRST STEP' : 'MOST COMPLETE'}
            </Text>
            {stats.isEmpty ? (
              <>
                <Text style={[styles.statBignumWord, { color: P.text }]}>Health & Safety</Text>
                <Text style={[styles.statCaption, { color: P.sub }]}>
                  The one thing every provider needs before they treat you
                </Text>
              </>
            ) : (
              <>
                <View style={styles.statBignumRow}>
                  <Text style={[styles.statBignumWord, { color: P.text }]}>
                    {stats.mostComplete ? CATEGORY_LABELS[stats.mostComplete.key] : '—'}
                  </Text>
                  <Text style={[styles.statBignumSmall, { color: P.sub }]}>
                    {stats.mostComplete ? `${stats.mostComplete.percent}%` : ''}
                  </Text>
                </View>
                <Text style={[styles.statCaption, { color: P.sub }]}>
                  {stats.mostComplete
                    ? `${stats.mostComplete.fieldsSet} of ${stats.mostComplete.fieldsTotal} fields set`
                    : 'Nothing set yet'}
                </Text>
              </>
            )}
          </View>

          <View style={[styles.statCard, styles.statCardNarrow, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.eyebrowSmall, { color: P.sub }]}>UNTOUCHED</Text>
            <View style={styles.statBignumRow}>
              <Text style={[styles.statBignum, { color: P.text }]}>{stats.untouchedCount}</Text>
              <Text style={[styles.statBignumSmall, { color: P.sub }]}>/{stats.categoriesTotal}</Text>
            </View>
            <Text style={[styles.statCaption, { color: P.sub }]}>categories</Text>
          </View>
        </View>

        {/* ══ HEALTH & SAFETY BANNER ════════════════════════════════════════ */}
        <TouchableOpacity
          style={[styles.hsBanner, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={() => openCategory('health')}
          activeOpacity={0.5}
        >
          <Text style={styles.hsIcon}>{healthOnFile ? '✓' : '⚠'}</Text>
          <View style={styles.hsNumBlock}>
            <Text style={[styles.hsNum, { color: P.text }]}>{draft.allergies.length}</Text>
            <Text style={[styles.hsNumDenom, { color: P.sub }]}>/{ALLERGENS.length}</Text>
          </View>
          <View style={styles.hsText}>
            <Text style={[styles.hsLabel, { color: P.text }]}>HEALTH & SAFETY</Text>
            <Text style={[styles.hsSub, { color: P.sub }]} numberOfLines={1}>
              {healthOnFile
                ? `${draft.allergies.length} allergen${draft.allergies.length === 1 ? '' : 's'} flagged${draft.medicalNotes ? ' · notes on file' : ''}`
                : "Not started — the one section we'd fill in first"}
            </Text>
          </View>
          <View style={[styles.hsStatus, {
            backgroundColor: healthOnFile ? 'rgba(52,199,89,0.16)' : 'rgba(255,214,10,0.2)',
          }]}>
            <Text style={[styles.hsStatusText, {
              color: healthOnFile ? (isDarkMode ? '#4FD67A' : '#1F8A3D') : (isDarkMode ? '#FFD60A' : '#8A6D00'),
            }]}>
              {healthOnFile ? 'ON FILE' : 'ADD NOW'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ══ CATEGORY GRID ═════════════════════════════════════════════════ */}
        <View style={styles.gridEyebrowRow}>
          <Text style={[styles.eyebrow, { color: P.sub }]}>ALL CATEGORIES</Text>
          <Text style={[styles.gridCount, { color: P.text }]}>
            {stats.categoriesStarted}/{stats.categoriesTotal} STARTED
          </Text>
        </View>

        <View style={styles.catGrid}>
          {CATEGORY_ORDER.filter(k => k !== 'health').map(key => {
            const cat: CategoryStats = stats.byCategory[key];
            const isConsent = key === 'consent';
            return (
              <TouchableOpacity
                key={key}
                style={[styles.catTile, { backgroundColor: P.card, borderColor: P.border }]}
                onPress={() => openCategory(key)}
                activeOpacity={0.5}
              >
                {cat.started && <View style={styles.catTileDot} />}
                {isConsent ? (
                  <Text style={[styles.catTilePct, { color: '#34C759' }]}>✓</Text>
                ) : (
                  <View style={styles.catTilePctRow}>
                    <Text style={[styles.catTilePct, { color: cat.complete ? '#34C759' : cat.started ? P.text : P.sub }]}>
                      {cat.percent}
                    </Text>
                    <Text style={[styles.catTilePctSign, { color: cat.complete ? '#34C759' : cat.started ? P.text : P.sub }]}>%</Text>
                  </View>
                )}
                <Text style={[styles.catTileLabel, { color: P.accentText }]} numberOfLines={2}>
                  {CATEGORY_LABELS[key]}
                </Text>
                {!isConsent && (
                  <View style={[styles.catTileBar, { backgroundColor: P.sep }]}>
                    <View style={[styles.catTileBarFill, {
                      width: `${cat.percent}%`,
                      backgroundColor: cat.complete ? '#34C759' : P.accent,
                    }]} />
                  </View>
                )}
                <Text style={[styles.catTileDetail, { color: P.sub }]} numberOfLines={1}>
                  {isConsent
                    ? `Photos: ${draft.photographyConsent ? 'ON' : 'OFF'}`
                    : cat.started
                      ? `${cat.fieldsSet}/${cat.fieldsTotal} fields`
                      : 'Not set'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selections ranking — only meaningful once something is filled in. */}
        {!stats.isEmpty && (
          <View style={[styles.rankCard, { backgroundColor: P.surface }]}>
            <Text style={[styles.rankEyebrow, { color: P.sub }]}>SELECTIONS BY CATEGORY</Text>
            <Text style={[styles.rankValue, { color: P.text }]}>
              {stats.ordered
                .filter(c => c.selections > 0)
                .sort((a, b) => b.selections - a.selections)
                .slice(0, 3)
                .map(c => `${CATEGORY_LABELS[c.key]} ${c.selections}`)
                .join('  ·  ') || 'None yet'}
            </Text>
          </View>
        )}
      </ScrollView>
      {/* Rendered last so dialogs layer above the scroll content. */}
      <DialogHost />
    </ThemedBackground>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg:          { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:      { paddingHorizontal: 18 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  backBtn:   { padding: 4 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  editToggle:{ fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.5 },
  focusBack: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.5 },

  // Eyebrows — wide-tracked micro-caps, the screen's telemetry voice.
  // Floored at 9.5px: BakbakOne is a blocky display face that loses character
  // distinction faster than a humanist sans as size drops, and anything smaller
  // fails at default OS text-scaling on smaller phones. letterSpacing stays at
  // or under 2 to match DESIGN_SYSTEM.md's stated caps-label range.
  eyebrow:      { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 2 },
  eyebrowSmall: { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.4 },

  // Hero
  heroTopRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroNumeralRow:   { flexDirection: 'row', alignItems: 'flex-end' },
  heroNumeral:      { fontFamily: 'BakbakOne-Regular', fontSize: 88, letterSpacing: -3, lineHeight: 92 },
  heroNumeralEmpty: { fontFamily: 'BakbakOne-Regular', fontSize: 56, letterSpacing: -1, lineHeight: 66 },
  heroDenominator:  { fontFamily: 'BakbakOne-Regular', fontSize: 22, letterSpacing: -0.5, paddingBottom: 12 },
  heroQualifier:    { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 2, marginTop: 6 },
  heroSub:          { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18, marginTop: 6 },

  heroSideStats:  { alignItems: 'flex-end', gap: 12, paddingTop: 4 },
  heroSideStat:   { alignItems: 'flex-end' },
  heroSideNumRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroSideNum:    { fontFamily: 'BakbakOne-Regular', fontSize: 22, lineHeight: 24 },
  heroSideDenom:  { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  heroSideLabel:  { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.4, marginTop: 2 },

  leaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 14 },
  leaderLine:  { flex: 1, height: 1 },
  leaderLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 2 },

  // Asymmetric stat row
  statRow:         { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard:        { borderRadius: 16, borderWidth: 1, padding: 13 },
  statCardWide:    { flex: 1.65 },
  statCardNarrow:  { flex: 1, justifyContent: 'space-between' },
  statBignumRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6, marginBottom: 4 },
  statBignum:      { fontFamily: 'BakbakOne-Regular', fontSize: 30, letterSpacing: -1, lineHeight: 32 },
  statBignumWord:  { fontFamily: 'BakbakOne-Regular', fontSize: 17, letterSpacing: 0.3, marginTop: 6, marginBottom: 4 },
  statBignumSmall: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  statCaption:     { fontFamily: 'Jura-VariableFont_wght', fontSize: 10.5, lineHeight: 14 },

  // Health & Safety banner
  hsBanner:  {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 16, borderWidth: 1, borderLeftWidth: 3, borderLeftColor: '#FFD60A',
    padding: 13, marginBottom: 14,
  },
  hsIcon:      { fontSize: 15 },
  hsNumBlock:  { flexDirection: 'row', alignItems: 'baseline' },
  hsNum:       { fontFamily: 'BakbakOne-Regular', fontSize: 24, lineHeight: 26 },
  hsNumDenom:  { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  hsText:      { flex: 1, minWidth: 0 },
  hsLabel:     { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.4, marginBottom: 2 },
  hsSub:       { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, lineHeight: 14 },
  hsStatus:    { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 5 },
  hsStatusText:{ fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 0.5 },

  // Category grid
  gridEyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  gridCount:      { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1 },

  catGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catTile:    {
    width: '31.5%', minHeight: 94, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 8, paddingTop: 10, paddingBottom: 9, gap: 5,
  },
  catTilePctRow:  { flexDirection: 'row', alignItems: 'baseline' },
  catTilePct:     { fontFamily: 'BakbakOne-Regular', fontSize: 20, letterSpacing: -0.5, lineHeight: 22 },
  catTilePctSign: { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  catTileLabel:   { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 0.9 },
  catTileBar:     { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 'auto' },
  catTileBarFill: { height: '100%', borderRadius: 2 },
  catTileDetail:  { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, lineHeight: 13 },
  catTileDot:     { position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' },

  rankCard:    { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 8 },
  rankEyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.2, marginBottom: 3 },
  rankValue:   { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 0.3 },

  // Focused view
  focusTitleRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10, marginBottom: 6 },
  focusTitle:       { fontFamily: 'BakbakOne-Regular', fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  focusPct:         { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  progressTrack:    { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill:     { height: '100%', borderRadius: 2 },
  focusFieldsCount: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, lineHeight: 16, marginBottom: 20 },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionLabel:    { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 2 },
  sectionCount:    { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 0.5, marginLeft: 'auto' },
  sectionSub:      { fontFamily: 'Jura-VariableFont_wght', fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  warnIcon:        { fontSize: 12, color: '#FFD60A' },
  optionalBadge:   { fontFamily: 'Jura-VariableFont_wght', fontSize: 10, letterSpacing: 0.3, fontStyle: 'italic' },

  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 24 },
  chip:     { borderRadius: 100, borderWidth: 1.5, paddingVertical: 9, paddingHorizontal: 15 },
  chipText: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 0.7 },

  medicalInput: {
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 20,
    minHeight: 80, marginBottom: 24,
  },

  consentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 24,
  },
  consentLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.4, marginBottom: 3 },
  consentSub:   { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, lineHeight: 16 },

  saveBtn:     { borderRadius: 100, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, marginTop: 4 },
  saveBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
});
