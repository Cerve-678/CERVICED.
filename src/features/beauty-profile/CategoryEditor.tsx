// src/features/beauty-profile/CategoryEditor.tsx
//
// The fields of one Beauty Profile category. Moved out of
// BeautyProfileScreen.tsx unchanged in behaviour: it edits the SCREEN's draft
// through `setDraft`, so SAVE PROFILE stays one transaction across all nine
// categories (see the screen's note on selectedCategory).

import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../constants/theme';
import { SKIN_TONES } from '../../constants/skinTones';
import { HAIR_TYPES } from '../../constants/hairTypes';
import type { BeautyData, CategoryKey, Gender } from '../../types/beautyProfile';
import {
  ALLERGENS, BLUSH_STYLES, BROW_CONDITIONS, BROW_STYLES, EYE_COLOURS, EYE_SHAPES, FACE_SHAPES, LASH_MAP_PRESETS, GENDER_LABELS, HAIR_GOALS, HAIR_POROSITY, HAIR_THICKNESS,
  LASH_CURLS, LASH_STATUS, LASH_STYLES, SKIN_UNDERTONES,
  MAKEUP_COVERAGE, MAKEUP_EYES, MAKEUP_FINISH, MAKEUP_LIPS, NAIL_COLOURS, NAIL_CONDITIONS, NAIL_LENGTHS,
  NAIL_SERVICES, NAIL_SHAPES, NAIL_STYLES, STYLE_AESTHETICS, STYLE_OCCASIONS, STYLE_ROUTINES, AESTHETICS_BY_VIBE,
  type DescribedOption,
  SCALP_CONDITIONS, SENSITIVE_AREAS, SKIN_CONCERNS, SKIN_TYPES, STYLE_VIBES, TREATMENT_HISTORY, hairTreatmentHistory,
} from './options';
import { tailoredOptions, type TailoredQuestion } from './tailoredOptions';
import { LashMapBuilder } from './LashMapBuilder';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface Props {
  category: CategoryKey;
  draft: BeautyData;
  editing: boolean;
  setDraft: React.Dispatch<React.SetStateAction<BeautyData>>;
  P: AppTheme;
}

export function CategoryEditor({ category, draft, editing, setDraft, P }: Props) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  // Which tailored questions have "More options" open.
  const [showAll, setShowAll] = useState<Partial<Record<TailoredQuestion, boolean>>>({});
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

  // A saved answer that isn't in today's chip list (sign-up offered a few
  // style vibes this list doesn't) still shows, so it can be seen and
  // un-picked rather than riding along invisibly in a multi-pick list.
  const withSaved = (options: string[], saved: string[]) =>
    [...options, ...saved.filter(v => !options.includes(v))];

  // A "none" answer can't sit alongside real ones: picking it clears the rest,
  // and picking anything else clears it.
  const toggleExclusive = (field: 'allergies' | 'skinConcerns' | 'treatmentHistory', none: string, item: string) => {
    if (!editing) return;
    Haptics.selectionAsync().catch(() => {});
    setDraft(prev => {
      const current = prev[field];
      if (item === none) return { ...prev, [field]: current.includes(none) ? [] : [none] };
      const without = current.filter(v => v !== none);
      return { ...prev, [field]: without.includes(item) ? without.filter(v => v !== item) : [...without, item] };
    });
  };
  const toggleAllergen = (item: string) => toggleExclusive('allergies', 'None known', item);

  // Picking a lash style while no map is set builds that style's map, so the
  // lash map below fills itself in (owner, 2026-11-27).
  const toggleLashStyle = (style: string) => {
    if (!editing) return;
    Haptics.selectionAsync().catch(() => {});
    setDraft(prev => {
      const adding = !prev.lashStyle.includes(style);
      const lashStyle = adding ? [...prev.lashStyle, style] : prev.lashStyle.filter(v => v !== style);
      const preset = LASH_MAP_PRESETS.find(p => p.name === style);
      const lashMap = adding && preset && prev.lashMap.length === 0 ? [...preset.map] : prev.lashMap;
      return { ...prev, lashStyle, lashMap };
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

  // A question that follows an earlier answer shows only the options that
  // suit it, under "Suited to your 4C hair" (owner, 2026-11-17: the options
  // should change, not just the label). Everything else folds under "More
  // options", and anything already picked always shows.
  const renderTailored = (
    question: TailoredQuestion,
    picked: string[],
    isOn: (opt: string) => boolean,
    onPress: (opt: string) => void,
  ) => {
    const { suited, rest, because } = tailoredOptions(question, draft);
    if (!because) return renderChips(withSaved(rest, picked), isOn, onPress);
    const shown = withSaved(suited, picked);
    const folded = rest.filter(o => !shown.includes(o));
    const open = !!showAll[question];
    return (
      <>
        <Text style={[styles.suitedLabel, { color: P.accentText }]}>{`Suited to ${because}`.toUpperCase()}</Text>
        <View style={[styles.chips, styles.chipsTight]}>
          {shown.map(opt => (
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
        {folded.length > 0 ? (
          <TouchableOpacity
            style={styles.moreToggle}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowAll(prev => ({ ...prev, [question]: !open })); }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? tr('clientAccount.editor.fewerOptions') : tr('clientAccount.editor.moreOptionsA11y', { count: folded.length })}
          >
            <Text style={[styles.suitedLabel, styles.moreText, { color: P.sub }]}>
              {open ? `${tr('clientAccount.editor.fewerOptions').toUpperCase()} ▴` : `${tr('clientAccount.editor.moreOptions', { count: folded.length }).toUpperCase()} ▾`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {open && folded.length > 0 ? renderChips(folded, isOn, onPress) : <View style={styles.tailoredGap} />}
      </>
    );
  };

  // Options picked as cards: the name, and a line saying what it looks like.
  const renderCards = (
    options: readonly DescribedOption[],
    isOn: (name: string) => boolean,
    onPress: (name: string) => void,
    columns: 2 | 1,
  ) => (
    <View style={[styles.cards, columns === 1 && styles.cardsOne]}>
      {options.map(({ name, line }) => {
        const on = isOn(name);
        return (
          <TouchableOpacity
            key={name}
            style={[
              styles.card,
              columns === 2 ? styles.cardHalf : styles.cardFull,
              { backgroundColor: on ? P.accentDim : P.surface, borderColor: on ? P.accent : P.border },
            ]}
            onPress={() => onPress(name)}
            activeOpacity={editing ? 0.6 : 1}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: !editing }}
            accessibilityLabel={`${name}. ${line}`}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.cardName, { color: P.text }]} numberOfLines={1}>{name}</Text>
              <View style={[styles.cardTick, { borderColor: on ? P.accent : P.border, backgroundColor: on ? P.accent : 'transparent' }]}>
                {on ? <Text style={[styles.cardTickMark, { color: P.onAccent }]}>✓</Text> : null}
              </View>
            </View>
            <Text style={[styles.cardLine, { color: P.sub }]} numberOfLines={2}>{line}</Text>
          </TouchableOpacity>
        );
      })}
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
      {opts?.optional && <Text style={[styles.optionalBadge, { color: P.sub }]}>{tr('clientAccount.editor.optional')}</Text>}
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
          {sectionHead('SKIN TYPE', { selected: draft.skinType.length, total: SKIN_TYPES.length })}
          {sub('Pick all that describe your skin')}
          {renderChips(withSaved(SKIN_TYPES, draft.skinType), o => draft.skinType.includes(o), o => toggleMulti('skinType', o))}

          {sectionHead('SKIN TONE', { selected: draft.skinTone ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Your complexion')}
          {renderChips(SKIN_TONES, o => draft.skinTone === o, o => setSingle('skinTone', o))}

          {sectionHead('UNDERTONE', { selected: draft.skinUndertone ? 1 : 0, total: 1 }, { optional: true })}
          {sub('The shade under your skin tone. It helps with makeup shades and hair colour.')}
          {renderChips(SKIN_UNDERTONES, o => draft.skinUndertone === o, o => setSingle('skinUndertone', o))}

          {sectionHead('SKIN CONCERNS', { selected: draft.skinConcerns.length, total: SKIN_CONCERNS.length })}
          {sub('Select all that apply')}
          {renderTailored('skinConcerns', draft.skinConcerns, o => draft.skinConcerns.includes(o), o => toggleExclusive('skinConcerns', 'None', o))}

          {sectionHead('SENSITIVE AREAS', { selected: draft.sensitiveAreas.length, total: SENSITIVE_AREAS.length }, { optional: true })}
          {sub('Areas of sensitivity for treatments like waxing or facial work')}
          {renderChips(SENSITIVE_AREAS, o => draft.sensitiveAreas.includes(o), o => toggleMulti('sensitiveAreas', o))}
        </>
      );

    case 'hair':
      return (
        <>
          {sectionHead('HAIR TYPE', { selected: draft.hairType.length, total: HAIR_TYPES.length })}
          {sub('Your hair texture. Pick more than one if it varies, like 4B and 4C.')}
          {renderChips(withSaved(HAIR_TYPES, draft.hairType), o => draft.hairType.includes(o), o => toggleMulti('hairType', o))}

          {sectionHead('POROSITY', { selected: draft.hairPorosity ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How your hair takes in moisture. Not sure? Your stylist can check.')}
          {renderChips(HAIR_POROSITY, o => draft.hairPorosity === o, o => setSingle('hairPorosity', o))}

          {sectionHead('HAIR THICKNESS', { selected: draft.hairThickness ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How your hair feels, from fine to thick.')}
          {renderChips(HAIR_THICKNESS, o => draft.hairThickness === o, o => setSingle('hairThickness', o))}

          {sectionHead('SCALP CONDITION', { selected: draft.scalpCondition.length, total: SCALP_CONDITIONS.length }, { optional: true })}
          {sub('Your scalp. Pick all that apply.')}
          {renderTailored('scalpCondition', draft.scalpCondition, o => draft.scalpCondition.includes(o), o => toggleMulti('scalpCondition', o))}

          {sectionHead('COLOUR & TREATMENT HISTORY', { selected: draft.treatmentHistory.length, total: TREATMENT_HISTORY.length })}
          {sub('Previous professional treatments')}
          {/* Hair skips a stored 'Lash extensions' (see hairTreatmentHistory). */}
          {renderTailored('treatmentHistory', hairTreatmentHistory(draft.treatmentHistory), o => draft.treatmentHistory.includes(o), o => toggleExclusive('treatmentHistory', 'None', o))}

          {sectionHead('HAIR GOALS', { selected: draft.hairGoals.length, total: HAIR_GOALS.length }, { optional: true })}
          {sub("What you're looking to achieve. Pick as many as you like.")}
          {renderTailored('hairGoals', draft.hairGoals, o => draft.hairGoals.includes(o), o => toggleMulti('hairGoals', o))}
        </>
      );

    case 'nails':
      // Their own nails first: they decide what suits them, which decides length, then shape.
      return (
        <>
          {sectionHead('YOUR NATURAL NAILS', { selected: draft.nailCondition.length, total: NAIL_CONDITIONS.length }, { optional: true })}
          {sub('What your own nails are like. Pick all that apply.')}
          {renderChips(withSaved(NAIL_CONDITIONS, draft.nailCondition), o => draft.nailCondition.includes(o), o => toggleMulti('nailCondition', o))}

          {sectionHead('WHAT YOU USUALLY GET', { selected: draft.nailService.length, total: NAIL_SERVICES.length }, { optional: true })}
          {sub('The nail services you book. Pick all you have.')}
          {renderTailored('nailService', draft.nailService, o => draft.nailService.includes(o), o => toggleMulti('nailService', o))}

          {sectionHead('PREFERRED LENGTH', { selected: draft.nailLength.length, total: NAIL_LENGTHS.length }, { optional: true })}
          {sub('How long you like your nails. Pick all you wear.')}
          {renderTailored('nailLength', draft.nailLength, o => draft.nailLength.includes(o), o => toggleMulti('nailLength', o))}

          {sectionHead('PREFERRED SHAPE', { selected: draft.nailShape.length, total: NAIL_SHAPES.length }, { optional: true })}
          {sub('Nail shapes you like. Pick as many as you want.')}
          {renderTailored('nailShape', draft.nailShape, o => draft.nailShape.includes(o), o => toggleMulti('nailShape', o))}

          {sectionHead('LOOKS YOU LIKE', { selected: draft.nailStyle.length, total: NAIL_STYLES.length }, { optional: true })}
          {sub('French, chrome, art… pick as many as you like.')}
          {renderChips(withSaved(NAIL_STYLES, draft.nailStyle), o => draft.nailStyle.includes(o), o => toggleMulti('nailStyle', o))}

          {sectionHead('COLOURS YOU GO FOR', { selected: draft.nailColours.length, total: NAIL_COLOURS.length }, { optional: true })}
          {sub('Pick all you wear.')}
          {renderTailored('nailColours', draft.nailColours, o => draft.nailColours.includes(o), o => toggleMulti('nailColours', o))}
        </>
      );

    case 'lashesBrows':
      // What they have now comes first: it decides which styles suit them.
      return (
        <>
          {sectionHead('EYE SHAPE', { selected: draft.eyeShape.length, total: EYE_SHAPES.length }, { optional: true })}
          {sub('Your lash tech maps your set to this. Pick all that fit, like hooded and almond.')}
          {renderChips(withSaved(EYE_SHAPES, draft.eyeShape), o => draft.eyeShape.includes(o), o => toggleMulti('eyeShape', o))}

          {sectionHead('LASH STATUS', { selected: draft.lashStatus ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Current situation')}
          {renderChips(LASH_STATUS, o => draft.lashStatus === o, o => setSingle('lashStatus', o))}

          {sectionHead('LASH STYLE', { selected: draft.lashStyle.length, total: LASH_STYLES.length }, { optional: true })}
          {sub('Lash looks you like. Pick as many as you want.')}
          {renderTailored('lashStyle', draft.lashStyle, o => draft.lashStyle.includes(o), toggleLashStyle)}

          {sectionHead('LASH CURL', { selected: draft.lashCurl ? 1 : 0, total: 1 }, { optional: true })}
          {sub('How curled you like your extensions or lift.')}
          {renderChips(LASH_CURLS, o => draft.lashCurl === o, o => setSingle('lashCurl', o))}

          {sectionHead('LASH MAP', { selected: draft.lashMap.length ? 1 : 0, total: 1 }, { optional: true })}
          {sub('The length of each zone in mm, inner corner to outer. Want 16 at the end? Tap + on Outer.')}
          <LashMapBuilder
            map={draft.lashMap}
            curl={draft.lashCurl}
            editing={editing}
            onChange={lashMap => setDraft(prev => ({ ...prev, lashMap }))}
            P={P}
          />

          {sectionHead('BROW CONDITION', { selected: draft.browCondition.length, total: BROW_CONDITIONS.length }, { optional: true })}
          {sub('Your natural brows. Pick all that apply.')}
          {renderChips(withSaved(BROW_CONDITIONS, draft.browCondition), o => draft.browCondition.includes(o), o => toggleMulti('browCondition', o))}

          {sectionHead('BROW STYLE', { selected: draft.browStyle.length, total: BROW_STYLES.length }, { optional: true })}
          {sub('Brow looks you like. Pick as many as you want.')}
          {renderTailored('browStyle', draft.browStyle, o => draft.browStyle.includes(o), o => toggleMulti('browStyle', o))}
        </>
      );

    case 'makeup':
      return (
        <>
          {sectionHead('FACE SHAPE', { selected: draft.faceShape ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Helps with blush, contour, brow shape and haircuts.')}
          {renderChips(FACE_SHAPES, o => draft.faceShape === o, o => setSingle('faceShape', o))}

          {sectionHead('EYE COLOUR', { selected: draft.eyeColour ? 1 : 0, total: 1 }, { optional: true })}
          {sub('Helps your artist pick eyeshadow shades.')}
          {renderChips(EYE_COLOURS, o => draft.eyeColour === o, o => setSingle('eyeColour', o))}

          {sectionHead('COVERAGE', { selected: draft.makeupCoverage.length, total: MAKEUP_COVERAGE.length }, { optional: true })}
          {sub('How much coverage you like. Pick all you wear.')}
          {renderChips(withSaved(MAKEUP_COVERAGE, draft.makeupCoverage), o => draft.makeupCoverage.includes(o), o => toggleMulti('makeupCoverage', o))}

          {sectionHead('FINISH', { selected: draft.makeupFinish.length, total: MAKEUP_FINISH.length }, { optional: true })}
          {sub('Skin finishes you like. Pick all you wear.')}
          {renderTailored('makeupFinish', draft.makeupFinish, o => draft.makeupFinish.includes(o), o => toggleMulti('makeupFinish', o))}

          {sectionHead('EYE STYLE', { selected: draft.makeupEyes.length, total: MAKEUP_EYES.length }, { optional: true })}
          {sub('Eye looks you go for. Pick as many as you want.')}
          {renderTailored('makeupEyes', draft.makeupEyes, o => draft.makeupEyes.includes(o), o => toggleMulti('makeupEyes', o))}

          {sectionHead('BLUSH', { selected: draft.blushStyle.length, total: BLUSH_STYLES.length }, { optional: true })}
          {sub('Where you like your blush. Pick all you wear.')}
          {renderChips(withSaved(BLUSH_STYLES, draft.blushStyle), o => draft.blushStyle.includes(o), o => toggleMulti('blushStyle', o))}

          {sectionHead('LIP PREFERENCE', { selected: draft.makeupLips.length, total: MAKEUP_LIPS.length }, { optional: true })}
          {sub('Lip looks you go for. Pick as many as you want.')}
          {renderTailored('makeupLips', draft.makeupLips, o => draft.makeupLips.includes(o), o => toggleMulti('makeupLips', o))}
        </>
      );

    case 'general': {
      // The aesthetics that go with their vibe come first; none are hidden.
      const suitedAesthetics = new Set(draft.styleVibe.flatMap(v => AESTHETICS_BY_VIBE[v] ?? []));
      const aesthetics = [
        ...STYLE_AESTHETICS.filter(a => suitedAesthetics.has(a.name)),
        ...STYLE_AESTHETICS.filter(a => !suitedAesthetics.has(a.name)),
      ];
      return (
        <>
          {sectionHead('STYLE VIBE', { selected: draft.styleVibe.length, total: STYLE_VIBES.length })}
          {sub('How would you describe your overall look? Pick as many as fit.')}
          {renderChips(withSaved(STYLE_VIBES, draft.styleVibe), o => draft.styleVibe.includes(o), o => toggleMulti('styleVibe', o))}

          {sectionHead('AESTHETICS YOU LOVE', { selected: draft.styleAesthetics.length, total: STYLE_AESTHETICS.length }, { optional: true })}
          {sub(suitedAesthetics.size > 0 ? 'The ones that go with your vibe are first. Pick any you love.' : 'Pick any you love.')}
          {renderCards(aesthetics, o => draft.styleAesthetics.includes(o), o => toggleMulti('styleAesthetics', o), 2)}

          {sectionHead('OCCASIONS YOU BOOK FOR', { selected: draft.styleOccasions.length, total: STYLE_OCCASIONS.length }, { optional: true })}
          {sub('When do you usually get your hair, nails or makeup done? Pick all that apply.')}
          {renderChips(withSaved(STYLE_OCCASIONS, draft.styleOccasions), o => draft.styleOccasions.includes(o), o => toggleMulti('styleOccasions', o))}

          {sectionHead('TIME SPENT GETTING READY', { selected: draft.styleRoutine ? 1 : 0, total: 1 }, { optional: true })}
          {sub('On a normal day, how long do your hair and makeup take? It helps providers suggest looks you can keep up.')}
          {renderCards(STYLE_ROUTINES, o => draft.styleRoutine === o, o => setSingle('styleRoutine', o), 1)}
        </>
      );
    }

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
              <Text style={[styles.consentLabel, { color: P.text }]}>{tr('clientAccount.editor.kids')}</Text>
              <Text style={[styles.consentSub, { color: P.sub }]}>{tr('clientAccount.editor.kidsSub')}</Text>
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
            <Text style={[styles.consentLabel, { color: P.text }]}>{tr('clientAccount.editor.photoConsent')}</Text>
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
  cards:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  cardsOne: { flexDirection: 'column' },
  card:     { borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 6 },
  cardHalf: { width: '48%', minHeight: 92 },
  cardFull: { width: '100%' },
  cardTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardName: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.6, flexShrink: 1 },
  cardTick: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cardTickMark: { fontSize: 11, fontWeight: '700' },
  cardLine: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16 },
  // The suited chips sit close above "More".
  chipsTight: { marginBottom: 12 },
  suitedLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.4, marginBottom: 8 },
  moreToggle: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  moreText: { marginBottom: 0 },
  tailoredGap: { height: 12 },
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
