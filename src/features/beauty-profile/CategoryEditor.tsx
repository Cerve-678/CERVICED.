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
  beautyOptionLabel,
} from './options';
import { useTranslation } from '../../i18n';

interface Props {
  category: CategoryKey;
  draft: BeautyData;
  editing: boolean;
  setDraft: React.Dispatch<React.SetStateAction<BeautyData>>;
  P: AppTheme;
}

export function CategoryEditor({ category, draft, editing, setDraft, P }: Props) {
  const { t } = useTranslation();
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
          {/* `opt` is the stored value; only its label is translated. */}
          <Text style={chipTextStyle(isOn(opt))}>{beautyOptionLabel(opt, t)}</Text>
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
      {opts?.optional && <Text style={[styles.optionalBadge, { color: P.sub }]}>{t('clientAccount.editor.optional')}</Text>}
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
          {sectionHead(t('clientAccount.editor.allergies').toUpperCase(), { selected: draft.allergies.length, total: ALLERGENS.length }, { warning: true })}
          {sub(t('clientAccount.editor.allergiesSub'))}
          {renderChips(ALLERGENS, o => draft.allergies.includes(o), toggleAllergen)}

          {sectionHead(t('clientAccount.editor.medicalNotes').toUpperCase(), undefined, { warning: true })}
          {sub(t('clientAccount.editor.medicalNotesSub'))}
          <TextInput
            style={[styles.medicalInput, {
              color: P.text,
              backgroundColor: P.surface,
              borderColor: P.border,
              opacity: editing ? 1 : 0.7,
            }]}
            value={draft.medicalNotes}
            onChangeText={text => editing && setDraft(prev => ({ ...prev, medicalNotes: text }))}
            placeholder={editing ? t('clientAccount.editor.medicalNotesPlaceholder') : (draft.medicalNotes ? '' : t('clientAccount.editor.noneNoted'))}
            placeholderTextColor={P.sub}
            multiline numberOfLines={3} textAlignVertical="top" editable={editing}
          />
        </>
      );

    case 'skin':
      return (
        <>
          {sectionHead(t('clientAccount.editor.skinType').toUpperCase(), { selected: draft.skinType ? 1 : 0, total: 1 })}
          {sub(t('clientAccount.editor.skinTypeSub'))}
          {renderChips(SKIN_TYPES, o => draft.skinType === o, o => setSingle('skinType', o))}

          {sectionHead(t('clientAccount.editor.skinTone').toUpperCase(), { selected: draft.skinTone ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.skinToneSub'))}
          {renderChips(SKIN_TONES, o => draft.skinTone === o, o => setSingle('skinTone', o))}

          {sectionHead(t('clientAccount.editor.skinConcerns').toUpperCase(), { selected: draft.skinConcerns.length, total: SKIN_CONCERNS.length }, { optional: true })}
          {sub(t('clientAccount.editor.selectAll'))}
          {renderChips(SKIN_CONCERNS, o => draft.skinConcerns.includes(o), o => toggleMulti('skinConcerns', o))}

          {sectionHead(t('clientAccount.editor.sensitiveAreas').toUpperCase(), { selected: draft.sensitiveAreas.length, total: SENSITIVE_AREAS.length }, { optional: true })}
          {sub(t('clientAccount.editor.sensitiveAreasSub'))}
          {renderChips(SENSITIVE_AREAS, o => draft.sensitiveAreas.includes(o), o => toggleMulti('sensitiveAreas', o))}
        </>
      );

    case 'hair':
      return (
        <>
          {sectionHead(t('clientAccount.editor.hairType').toUpperCase(), { selected: draft.hairType ? 1 : 0, total: 1 })}
          {sub(t('clientAccount.editor.hairTypeSub'))}
          {renderChips(HAIR_TYPES, o => draft.hairType === o, o => setSingle('hairType', o))}

          {sectionHead(t('clientAccount.editor.scalpCondition').toUpperCase(), { selected: draft.scalpCondition ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.scalpSub'))}
          {renderChips(SCALP_CONDITIONS, o => draft.scalpCondition === o, o => setSingle('scalpCondition', o))}

          {sectionHead(t('clientAccount.editor.treatmentHistory').toUpperCase(), { selected: draft.treatmentHistory.length, total: TREATMENT_HISTORY.length }, { optional: true })}
          {sub(t('clientAccount.editor.treatmentSub'))}
          {renderChips(TREATMENT_HISTORY, o => draft.treatmentHistory.includes(o), o => toggleMulti('treatmentHistory', o))}

          {sectionHead(t('clientAccount.editor.hairGoals').toUpperCase(), { selected: draft.hairGoals.length, total: HAIR_GOALS.length }, { optional: true })}
          {sub(t('clientAccount.editor.hairGoalsSub'))}
          {renderChips(HAIR_GOALS, o => draft.hairGoals.includes(o), o => toggleMulti('hairGoals', o))}
        </>
      );

    case 'nails':
      return (
        <>
          {sectionHead(t('clientAccount.editor.nailLength').toUpperCase(), { selected: draft.nailLength ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.nailLengthSub'))}
          {renderChips(NAIL_LENGTHS, o => draft.nailLength === o, o => setSingle('nailLength', o))}

          {sectionHead(t('clientAccount.editor.nailShape').toUpperCase(), { selected: draft.nailShape ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.nailShapeSub'))}
          {renderChips(NAIL_SHAPES, o => draft.nailShape === o, o => setSingle('nailShape', o))}
        </>
      );

    case 'lashesBrows':
      return (
        <>
          {sectionHead(t('clientAccount.editor.lashStyle').toUpperCase(), { selected: draft.lashStyle ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.lashStyleSub'))}
          {renderChips(LASH_STYLES, o => draft.lashStyle === o, o => setSingle('lashStyle', o))}

          {sectionHead(t('clientAccount.editor.lashStatus').toUpperCase(), { selected: draft.lashStatus ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.lashStatusSub'))}
          {renderChips(LASH_STATUS, o => draft.lashStatus === o, o => setSingle('lashStatus', o))}

          {sectionHead(t('clientAccount.editor.browStyle').toUpperCase(), { selected: draft.browStyle ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.browStyleSub'))}
          {renderChips(BROW_STYLES, o => draft.browStyle === o, o => setSingle('browStyle', o))}

          {sectionHead(t('clientAccount.editor.browCondition').toUpperCase(), { selected: draft.browCondition ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.browConditionSub'))}
          {renderChips(BROW_CONDITIONS, o => draft.browCondition === o, o => setSingle('browCondition', o))}
        </>
      );

    case 'makeup':
      return (
        <>
          {sectionHead(t('clientAccount.editor.coverage').toUpperCase(), { selected: draft.makeupCoverage ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.coverageSub'))}
          {renderChips(MAKEUP_COVERAGE, o => draft.makeupCoverage === o, o => setSingle('makeupCoverage', o))}

          {sectionHead(t('clientAccount.editor.finish').toUpperCase(), { selected: draft.makeupFinish ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.finishSub'))}
          {renderChips(MAKEUP_FINISH, o => draft.makeupFinish === o, o => setSingle('makeupFinish', o))}

          {sectionHead(t('clientAccount.editor.eyeStyle').toUpperCase(), { selected: draft.makeupEyes ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.eyeStyleSub'))}
          {renderChips(MAKEUP_EYES, o => draft.makeupEyes === o, o => setSingle('makeupEyes', o))}

          {sectionHead(t('clientAccount.editor.lips').toUpperCase(), { selected: draft.makeupLips ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.lipsSub'))}
          {renderChips(MAKEUP_LIPS, o => draft.makeupLips === o, o => setSingle('makeupLips', o))}
        </>
      );

    case 'general':
      return (
        <>
          {sectionHead(t('clientAccount.editor.styleVibe').toUpperCase(), { selected: draft.styleVibe ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.styleVibeSub'))}
          {renderChips(STYLE_VIBES, o => draft.styleVibe === o, o => setSingle('styleVibe', o))}
        </>
      );

    case 'personalisation':
      return (
        <>
          {sectionHead(t('clientAccount.editor.gender').toUpperCase(), { selected: draft.gender ? 1 : 0, total: 1 }, { optional: true })}
          {sub(t('clientAccount.editor.genderSub'))}
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
                <Text style={chipTextStyle(draft.gender === g)}>{beautyOptionLabel(GENDER_LABELS[g], t)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.consentRow, { backgroundColor: P.surface, borderColor: P.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.consentLabel, { color: P.text }]}>{t('clientAccount.editor.kids')}</Text>
              <Text style={[styles.consentSub, { color: P.sub }]}>{t('clientAccount.editor.kidsSub')}</Text>
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
            <Text style={[styles.consentLabel, { color: P.text }]}>{t('clientAccount.editor.photoConsent')}</Text>
            <Text style={[styles.consentSub, { color: P.sub }]}>
              {t('clientAccount.editor.photoConsentSub')}
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
