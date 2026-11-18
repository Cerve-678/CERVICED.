/**
 * "Your Sections" on Policies & Info: each section the provider has added is
 * written right here in the card, its box growing to show everything typed.
 * Sections not added yet are "+" chips underneath, like Travel and Emergency.
 * "+ Custom" can be tapped again for another one (up to five), each named by
 * the provider.
 *
 * (A list of rows opening a sheet was tried in #605 and the user preferred
 * editing in the card, 2026-11-18.)
 *
 * Only the draft lives here. Policies & Info owns saving, and the tick at its
 * bottom that a changed section needs (see PoliciesScreen's handleSave).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ATTRIBUTED_SECTION_KINDS, OWN_SECTION_KINDS, OWN_SECTION_LABELS, OWN_SECTION_LIMITS,
  normalizeOwnSections,
  type CustomSection, type FaqItem, type OwnSectionKind, type TextSectionKind,
} from '../providers/ownSections';
import { Card, MinusButton, useBusinessPalette } from './BusinessDetailsKit';

/** The sections as edited: text stays as typed (trimmed only on save), so
 *  the cursor doesn't jump. */
export interface OwnDraft {
  keyInfo: string;
  faq: FaqItem[];
  aftercare: string;
  custom: CustomSection[];
  disclaimer: string;
}

export function toOwnDraft(raw: unknown): OwnDraft {
  const clean = normalizeOwnSections(raw);
  return {
    keyInfo: clean.keyInfo ?? '',
    faq: clean.faq ?? [],
    aftercare: clean.aftercare ?? '',
    custom: clean.custom ?? [],
    disclaimer: clean.disclaimer ?? '',
  };
}

function hasContent(draft: OwnDraft, kind: OwnSectionKind): boolean {
  if (kind === 'faq') return draft.faq.some(item => item.question.trim() || item.answer.trim());
  // Shown from the moment "+ Custom" adds one, so it can be named and written.
  if (kind === 'custom') return draft.custom.length > 0;
  return draft[kind].trim() !== '';
}

/** One block in the card: a section, or one of the Custom sections. */
type Entry = { kind: OwnSectionKind; customIndex?: number };

const PLACEHOLDERS: Record<TextSectionKind, string> = {
  keyInfo: 'e.g. I work from home and have a small dog. Street parking is free.',
  aftercare: 'e.g. Keep your lashes dry for 24 hours and avoid oil-based products.',
  disclaimer: 'e.g. Results vary from person to person.',
};

/** A box that grows with what's typed, so the whole section is always on
 *  screen rather than scrolling inside a small field. */
function GrowingBox({ value, onChange, placeholder, maxLength, label, minHeight = 96, count = true }: {
  value: string; onChange: (v: string) => void; placeholder: string; maxLength: number;
  label: string; minHeight?: number; count?: boolean;
}) {
  const C = useBusinessPalette();
  return (
    <View>
      <TextInput
        style={[st.box, { backgroundColor: C.surface, borderColor: C.border, color: C.text, minHeight }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.sub}
        maxLength={maxLength}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        accessibilityLabel={label}
      />
      {count && value.length > maxLength * 0.8 && (
        <Text style={[st.count, { color: C.sub }]}>{value.length} / {maxLength}</Text>
      )}
    </View>
  );
}

export function OwnSectionsCard({ draft, onChange }: {
  draft: OwnDraft;
  onChange: (update: (prev: OwnDraft) => OwnDraft) => void;
}) {
  const C = useBusinessPalette();
  // Added this visit but nothing typed yet: still shown, so it can be written.
  const [added, setAdded] = useState<Partial<Record<OwnSectionKind, boolean>>>({});
  const shows = (kind: OwnSectionKind) => !!added[kind] || hasContent(draft, kind);
  const shown = OWN_SECTION_KINDS.filter(shows);
  const entries: Entry[] = shown.flatMap((kind): Entry[] =>
    kind === 'custom' ? draft.custom.map((_, customIndex) => ({ kind, customIndex })) : [{ kind }]);
  const addable = OWN_SECTION_KINDS.filter(kind =>
    kind === 'custom' ? draft.custom.length < OWN_SECTION_LIMITS.customItems : !shows(kind));

  const add = useCallback((kind: OwnSectionKind) => {
    Haptics.selectionAsync().catch(() => {});
    if (kind === 'custom') {
      onChange(prev => prev.custom.length >= OWN_SECTION_LIMITS.customItems
        ? prev : { ...prev, custom: [...prev.custom, { title: '', body: '' }] });
      return;
    }
    setAdded(prev => ({ ...prev, [kind]: true }));
    if (kind === 'faq') onChange(prev => prev.faq.length > 0 ? prev : { ...prev, faq: [{ question: '', answer: '' }] });
  }, [onChange]);

  const remove = useCallback((kind: OwnSectionKind) => {
    setAdded(prev => ({ ...prev, [kind]: false }));
    onChange(prev => kind === 'faq' ? { ...prev, faq: [] }
      : kind === 'custom' ? { ...prev, custom: [] }
        : { ...prev, [kind]: '' });
  }, [onChange]);

  const setCustom = (index: number, field: keyof CustomSection, value: string) => {
    onChange(prev => ({ ...prev, custom: prev.custom.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  };

  const setFaq = (index: number, field: keyof FaqItem, value: string) => {
    onChange(prev => ({ ...prev, faq: prev.faq.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  };

  return (
    <Card title="Your Sections" sub="Your own sections, each shown on your profile under Additional Information. Add only what you need.">
      {entries.map(({ kind, customIndex }, position) => customIndex !== undefined ? (
        <View
          key={`custom-${customIndex}`}
          style={[st.section, position > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}
        >
          <View style={st.head}>
            <TextInput
              style={[st.box, st.nameBox, { backgroundColor: C.surface, borderColor: C.border, color: C.text }]}
              value={draft.custom[customIndex]!.title}
              onChangeText={v => setCustom(customIndex, 'title', v)}
              placeholder="Name it, e.g. Parking"
              placeholderTextColor={C.sub}
              maxLength={OWN_SECTION_LIMITS.customTitle}
              returnKeyType="done"
              accessibilityLabel={`Custom section ${customIndex + 1} name`}
            />
            <MinusButton
              label={`Remove ${draft.custom[customIndex]!.title.trim() || `custom section ${customIndex + 1}`}`}
              onPress={() => onChange(prev => ({ ...prev, custom: prev.custom.filter((_, i) => i !== customIndex) }))}
            />
          </View>
          <GrowingBox
            label={`${draft.custom[customIndex]!.title.trim() || `Custom section ${customIndex + 1}`} text`}
            value={draft.custom[customIndex]!.body}
            onChange={v => setCustom(customIndex, 'body', v)}
            placeholder="What clients should know"
            maxLength={OWN_SECTION_LIMITS.text}
          />
        </View>
      ) : kind === 'custom' ? null : (
        <View key={kind} style={[st.section, position > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={st.head}>
            <Text style={[st.title, { color: C.text }]}>{OWN_SECTION_LABELS[kind]}</Text>
            <MinusButton label={`Remove ${OWN_SECTION_LABELS[kind]}`} onPress={() => remove(kind)} />
          </View>
          {ATTRIBUTED_SECTION_KINDS.includes(kind) && (
            <Text style={[st.note, { color: C.sub }]}>Shows "Written by" with your name on your profile.</Text>
          )}

          {kind === 'faq' ? (
            <>
              {draft.faq.map((item, index) => (
                <View key={index} style={[st.qa, { borderColor: C.border }]}>
                  <View style={st.qaHead}>
                    <Text style={[st.qaLabel, { color: C.sub }]}>QUESTION {index + 1}</Text>
                    {draft.faq.length > 1 && (
                      <MinusButton
                        label={`Remove question ${index + 1}`}
                        onPress={() => onChange(prev => ({ ...prev, faq: prev.faq.filter((_, i) => i !== index) }))}
                      />
                    )}
                  </View>
                  <GrowingBox
                    label={`Question ${index + 1}`}
                    value={item.question}
                    onChange={v => setFaq(index, 'question', v)}
                    placeholder={index === 0 ? 'e.g. Do you do children\'s hair?' : 'The question'}
                    maxLength={OWN_SECTION_LIMITS.question}
                    minHeight={48}
                    count={false}
                  />
                  <View style={{ height: 8 }} />
                  <GrowingBox
                    label={`Answer ${index + 1}`}
                    value={item.answer}
                    onChange={v => setFaq(index, 'answer', v)}
                    placeholder={index === 0 ? 'e.g. Yes, from age 8 with a parent there.' : 'Your answer'}
                    maxLength={OWN_SECTION_LIMITS.answer}
                    minHeight={72}
                  />
                </View>
              ))}
              {draft.faq.length < OWN_SECTION_LIMITS.faqItems && (
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(prev => ({ ...prev, faq: [...prev.faq, { question: '', answer: '' }] })); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={st.addQuestion}
                >
                  <Text style={[st.addText, { color: C.accentText }]}>+ Add a question</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <GrowingBox
              label={OWN_SECTION_LABELS[kind]}
              value={draft[kind]}
              onChange={v => onChange(prev => ({ ...prev, [kind]: v }))}
              placeholder={PLACEHOLDERS[kind]}
              maxLength={OWN_SECTION_LIMITS.text}
            />
          )}
        </View>
      ))}

      {addable.length > 0 && (
        <View style={[st.addRow, shown.length > 0 && st.addRowAfter]}>
          {addable.map(kind => (
            <TouchableOpacity
              key={kind}
              style={[st.chip, { borderColor: C.border }]}
              onPress={() => add(kind)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Add ${OWN_SECTION_LABELS[kind]}`}
            >
              <Text style={[st.addText, { color: C.accentText }]}>+ {OWN_SECTION_LABELS[kind]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  section:     { paddingTop: 14, paddingBottom: 6 },
  head:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  title:       { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  nameBox:     { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 14, fontWeight: '400', paddingTop: 10, paddingBottom: 10 },
  note:        { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: -4, marginBottom: 10 },
  box:         { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '600', lineHeight: 21, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  count:       { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, textAlign: 'right', marginTop: 4 },
  qa:          { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, marginBottom: 10 },
  qaHead:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26, marginBottom: 8 },
  qaLabel:     { fontFamily: 'BakbakOne-Regular', fontSize: 10.5, letterSpacing: 0.8 },
  addQuestion: { paddingVertical: 4 },
  addRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  addRowAfter: { marginTop: 14 },
  chip:        { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  addText:     { fontFamily: 'BakbakOne-Regular', fontSize: 12.5 },
});
