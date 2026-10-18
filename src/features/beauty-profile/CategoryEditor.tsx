// src/features/beauty-profile/CategoryEditor.tsx
//
// The fields of one Beauty Profile category. Moved out of
// BeautyProfileScreen.tsx unchanged in behaviour: it edits the SCREEN's draft
// through `setDraft`, so SAVE PROFILE stays one transaction across all nine
// categories (see the screen's note on selectedCategory).

import React from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../constants/theme';
import { SKIN_TONES } from '../../constants/skinTones';
import { HAIR_TYPES } from '../../constants/hairTypes';
import type { BeautyData, CategoryKey, Gender } from '../../types/beautyProfile';
import {
  ALLERGENS, BROW_CONDITIONS, BROW_STYLES, GENDER_LABELS, HAIR_GOALS, LASH_STATUS, LASH_STYLES,
  MAKEUP_COVERAGE, MAKEUP_EYES, MAKEUP_FINISH, MAKEUP_LIPS, NAIL_LENGTHS, NAIL_SHAPES,
  SCALP_CONDITIONS, SENSITIVE_AREAS, SKIN_CONCERNS, SKIN_TYPES, STYLE_VIBES, TREATMENT_HISTORY,
} from './options';

interface Props {
  category: CategoryKey;
  draft: BeautyData;
  editing: boolean;
  setDraft: React.Dispatch<React.SetStateAction<BeautyData>>;
  P: AppTheme;
}

export function CategoryEditor({ category, draft, editing, setDraft, P }: Props) {
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

  const chipStyle = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? P.accentDim : P.surface, borderColor: on ? P.accent : P.border },
  ];
  const chipTextStyle = (on: boolean) => [styles.chipText, { color: on ? P.text : P.sub }];

  const renderChips = (options: string[], isOn: (opt: string) => boolean, onPress: (opt: string) => void) => (
    <View style={styles.chips}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={chipStyle(isOn(opt))}
          onPress={() => onPress(opt)}
          activeOpacity={editing ? 0.5 : 1}
          accessibilityRole="button"
          accessibilityState={{ selected: isOn(opt), disabled: !editing }}
        >
          <Text style={chipTextStyle(isOn(opt))}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const sectionHead = (
    label: string,
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

  const sub = (text: string) => <Text style={[styles.sectionSub, { color: P.sub }]}>{text}</Text>;

  switch (category) {
    case 'health':
      return (
        <>
          {sectionHead('ALLERGIES', { selected: draft.allergies.length, total: ALLERGENS.length }, { warning: true })}
          {sub('Known allergies or sensitivities — always shared with providers')}
          {renderChips(ALLERGENS, o => draft.allergies.includes(o), toggleAllergen)}

          {sectionHead('MEDICAL NOTES', undefined, { warning: true })}
          {sub('Pregnancy, medications, health conditions that affect treatments')}
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
          {sectionHead('SKIN TYPE', { selected: draft.skinType ? 1 : 0, total: 1 })}
          {sub('Your skin type')}
          {renderChips(SKIN_TYPES, o => draft.skinType === o, o => setSingle('skinType', o))}

          {sectionHead('SKIN TONE', { selected: draft.skinTone ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your complexion')}
          {renderChips(SKIN_TONES, o => draft.skinTone === o, o => setSingle('skinTone', o))}

          {sectionHead('SKIN CONCERNS', { selected: draft.skinConcerns.length, total: SKIN_CONCERNS.length }, { optional: true })}
          {sub('Select all that apply')}
          {renderChips(SKIN_CONCERNS, o => draft.skinConcerns.includes(o), o => toggleMulti('skinConcerns', o))}

          {sectionHead('SENSITIVE AREAS', { selected: draft.sensitiveAreas.length, total: SENSITIVE_AREAS.length }, { optional: true })}
          {sub('Areas of sensitivity for treatments like waxing or facial work')}
          {renderChips(SENSITIVE_AREAS, o => draft.sensitiveAreas.includes(o), o => toggleMulti('sensitiveAreas', o))}
        </>
      );

    case 'hair':
      return (
        <>
          {sectionHead('HAIR TYPE', { selected: draft.hairType ? 1 : 0, total: 1 })}
          {sub('Your hair texture')}
          {renderChips(HAIR_TYPES, o => draft.hairType === o, o => setSingle('hairType', o))}

          {sectionHead('SCALP CONDITION', { selected: draft.scalpCondition ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your scalp health')}
          {renderChips(SCALP_CONDITIONS, o => draft.scalpCondition === o, o => setSingle('scalpCondition', o))}

          {sectionHead('COLOUR & TREATMENT HISTORY', { selected: draft.treatmentHistory.length, total: TREATMENT_HISTORY.length }, { optional: true })}
          {sub('Previous professional treatments')}
          {renderChips(TREATMENT_HISTORY, o => draft.treatmentHistory.includes(o), o => toggleMulti('treatmentHistory', o))}

          {sectionHead('HAIR GOALS', { selected: draft.hairGoals.length, total: HAIR_GOALS.length }, { optional: true })}
          {sub("What you're looking to achieve")}
          {renderChips(HAIR_GOALS, o => draft.hairGoals.includes(o), o => toggleMulti('hairGoals', o))}
        </>
      );

    case 'nails':
      return (
        <>
          {sectionHead('PREFERRED LENGTH', { selected: draft.nailLength ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How long do you like your nails?')}
          {renderChips(NAIL_LENGTHS, o => draft.nailLength === o, o => setSingle('nailLength', o))}

          {sectionHead('PREFERRED SHAPE', { selected: draft.nailShape ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your go-to nail shape')}
          {renderChips(NAIL_SHAPES, o => draft.nailShape === o, o => setSingle('nailShape', o))}
        </>
      );

    case 'lashesBrows':
      return (
        <>
          {sectionHead('LASH STYLE', { selected: draft.lashStyle ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your preferred lash look')}
          {renderChips(LASH_STYLES, o => draft.lashStyle === o, o => setSingle('lashStyle', o))}

          {sectionHead('LASH STATUS', { selected: draft.lashStatus ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Current situation')}
          {renderChips(LASH_STATUS, o => draft.lashStatus === o, o => setSingle('lashStatus', o))}

          {sectionHead('BROW STYLE', { selected: draft.browStyle ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your preferred brow look')}
          {renderChips(BROW_STYLES, o => draft.browStyle === o, o => setSingle('browStyle', o))}

          {sectionHead('BROW CONDITION', { selected: draft.browCondition ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your natural brows')}
          {renderChips(BROW_CONDITIONS, o => draft.browCondition === o, o => setSingle('browCondition', o))}
        </>
      );

    case 'makeup':
      return (
        <>
          {sectionHead('COVERAGE', { selected: draft.makeupCoverage ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How much coverage do you prefer?')}
          {renderChips(MAKEUP_COVERAGE, o => draft.makeupCoverage === o, o => setSingle('makeupCoverage', o))}

          {sectionHead('FINISH', { selected: draft.makeupFinish ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your preferred skin finish')}
          {renderChips(MAKEUP_FINISH, o => draft.makeupFinish === o, o => setSingle('makeupFinish', o))}

          {sectionHead('EYE STYLE', { selected: draft.makeupEyes ? 1 : 0, total: 1 }, { optional: true })}
          {sub('What eye look do you go for?')}
          {renderChips(MAKEUP_EYES, o => draft.makeupEyes === o, o => setSingle('makeupEyes', o))}

          {sectionHead('LIP PREFERENCE', { selected: draft.makeupLips ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your go-to lip look')}
          {renderChips(MAKEUP_LIPS, o => draft.makeupLips === o, o => setSingle('makeupLips', o))}
        </>
      );

    case 'general':
      return (
        <>
          {sectionHead('STYLE VIBE', { selected: draft.styleVibe ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How would you describe your overall look?')}
          {renderChips(STYLE_VIBES, o => draft.styleVibe === o, o => setSingle('styleVibe', o))}
        </>
      );

    case 'personalisation':
      return (
        <>
          {sectionHead('GENDER', { selected: draft.gender ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Helps us personalise your home feed')}
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
                accessibilityRole="button"
                accessibilityState={{ selected: draft.gender === g, disabled: !editing }}
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
}

const styles = StyleSheet.create({
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
});
