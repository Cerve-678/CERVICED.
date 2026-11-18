/**
 * "Your Sections" on Policies & Info, as designed on the canvas (round 3):
 * one row per section the provider has written (its name, a one-line summary
 * and ›), then a dashed "+ Add a section". Tapping a row, or picking a new
 * section, opens it in a sheet to write or remove.
 *
 * Only the draft lives here. Policies & Info owns saving, and the tick at its
 * bottom that a changed section needs (see PoliciesScreen's handleSave).
 */
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  OWN_SECTION_KINDS, OWN_SECTION_LABELS, OWN_SECTION_LIMITS,
  normalizeOwnSections, ownSectionSummary,
  type FaqItem, type OwnSectionKind, type TextSectionKind,
} from '../providers/ownSections';
import { Card, Field, MINUS_ON_FIELD, MinusButton, useBusinessPalette } from './BusinessDetailsKit';

/** The sections as edited: text stays as typed (trimmed only on save), so
 *  the cursor doesn't jump. */
export interface OwnDraft {
  keyInfo: string;
  faq: FaqItem[];
  aftercare: string;
  houseRules: string;
  disclaimer: string;
}

export function toOwnDraft(raw: unknown): OwnDraft {
  const clean = normalizeOwnSections(raw);
  return {
    keyInfo: clean.keyInfo ?? '',
    faq: clean.faq ?? [],
    aftercare: clean.aftercare ?? '',
    houseRules: clean.houseRules ?? '',
    disclaimer: clean.disclaimer ?? '',
  };
}

function hasContent(draft: OwnDraft, kind: OwnSectionKind): boolean {
  return kind === 'faq'
    ? draft.faq.some(item => item.question.trim() || item.answer.trim())
    : draft[kind].trim() !== '';
}

const PLACEHOLDERS: Record<TextSectionKind, string> = {
  keyInfo: 'e.g. I work from home and have a small dog. Street parking is free.',
  aftercare: 'e.g. Keep your lashes dry for 24 hours and avoid oil-based products.',
  houseRules: 'e.g. Please come on your own. Arrive with clean, product-free hair.',
  disclaimer: 'e.g. Results vary from person to person.',
};

export function OwnSectionsCard({ draft, onChange }: {
  draft: OwnDraft;
  onChange: (update: (prev: OwnDraft) => OwnDraft) => void;
}) {
  const C = useBusinessPalette();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<OwnSectionKind | null>(null);
  const [picking, setPicking] = useState(false);

  const listed = OWN_SECTION_KINDS.filter(kind => hasContent(draft, kind));
  const addable = OWN_SECTION_KINDS.filter(kind => !hasContent(draft, kind));

  const openSection = useCallback((kind: OwnSectionKind) => {
    Haptics.selectionAsync().catch(() => {});
    setPicking(false);
    if (kind === 'faq') onChange(prev => prev.faq.length > 0 ? prev : { ...prev, faq: [{ question: '', answer: '' }] });
    setEditing(kind);
  }, [onChange]);

  // Blank questions are dropped on the way out. A half-written one stays, so
  // Save can ask for its answer rather than losing it.
  const close = useCallback(() => {
    onChange(prev => ({ ...prev, faq: prev.faq.filter(item => item.question.trim() || item.answer.trim()) }));
    setEditing(null);
  }, [onChange]);

  const remove = useCallback((kind: OwnSectionKind) => {
    onChange(prev => kind === 'faq' ? { ...prev, faq: [] } : { ...prev, [kind]: '' });
    setEditing(null);
  }, [onChange]);

  const setFaq = (index: number, field: keyof FaqItem, value: string) => {
    onChange(prev => ({ ...prev, faq: prev.faq.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  };

  return (
    <>
      <Card title="Your Sections" sub="Your own sections, shown on your profile under Additional Information.">
        <View style={st.list}>
          {listed.map(kind => (
            <TouchableOpacity
              key={kind}
              style={[st.row, { backgroundColor: C.surface }]}
              onPress={() => openSection(kind)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${OWN_SECTION_LABELS[kind]}. ${ownSectionSummary(kind, draft)}. Edit`}
            >
              <View style={st.rowText}>
                <Text style={[st.rowTitle, { color: C.text }]}>{OWN_SECTION_LABELS[kind]}</Text>
                <Text numberOfLines={1} style={[st.rowSub, { color: C.sub }]}>{ownSectionSummary(kind, draft)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.sub} />
            </TouchableOpacity>
          ))}
          {addable.length > 0 && (
            <TouchableOpacity
              style={[st.add, { borderColor: C.border }]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPicking(prev => !prev); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: picking }}
            >
              <Ionicons name="add" size={15} color={C.accentText} />
              <Text style={[st.addText, { color: C.accentText }]}>Add a section</Text>
            </TouchableOpacity>
          )}
          {picking && addable.length > 0 && (
            <View style={st.pick}>
              {addable.map(kind => (
                <TouchableOpacity
                  key={kind}
                  style={[st.pickChip, { borderColor: C.border, backgroundColor: C.surface }]}
                  onPress={() => openSection(kind)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${OWN_SECTION_LABELS[kind]}`}
                >
                  <Text style={[st.pickText, { color: C.text }]}>{OWN_SECTION_LABELS[kind]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Card>

      {/* pageSheet needs no top inset on iOS; Android shows it full screen. */}
      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={[st.sheet, { backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
          <View style={[st.sheetHead, { borderBottomColor: C.border }]}>
            <Text style={[st.sheetTitle, { color: C.text }]}>{editing ? OWN_SECTION_LABELS[editing] : ''}</Text>
            <TouchableOpacity onPress={close} hitSlop={12} accessibilityRole="button" style={st.doneBtn}>
              <Text style={[st.done, { color: C.accentText }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.flex}>
            <ScrollView
              contentContainerStyle={[st.sheetBody, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[st.hint, { color: C.sub }]}>Shown on your profile, in your own words. Save on Policies & Info when you're done.</Text>
              {editing === 'faq' && (
                <>
                  {draft.faq.map((item, index) => (
                    <View key={index} style={[st.faq, index > 0 && { borderTopColor: C.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 }]}>
                      {draft.faq.length > 1 && (
                        <MinusButton
                          label={`Remove question ${index + 1}`}
                          onPress={() => onChange(prev => ({ ...prev, faq: prev.faq.filter((_, i) => i !== index) }))}
                          style={[MINUS_ON_FIELD, index > 0 && { top: 8 }]}
                        />
                      )}
                      <Field
                        label={`Question ${index + 1}`}
                        value={item.question}
                        onChange={v => setFaq(index, 'question', v)}
                        placeholder={index === 0 ? 'e.g. Do you do children\'s hair?' : ''}
                        maxLength={OWN_SECTION_LIMITS.question}
                      />
                      <Field
                        label="Answer"
                        value={item.answer}
                        onChange={v => setFaq(index, 'answer', v)}
                        placeholder={index === 0 ? 'e.g. Yes, from age 8 with a parent there.' : ''}
                        maxLength={OWN_SECTION_LIMITS.answer}
                        multiline
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
              )}
              {editing && editing !== 'faq' && (
                <Field
                  label={OWN_SECTION_LABELS[editing]}
                  value={draft[editing]}
                  onChange={v => onChange(prev => ({ ...prev, [editing]: v }))}
                  placeholder={PLACEHOLDERS[editing]}
                  maxLength={OWN_SECTION_LIMITS.text}
                  multiline
                />
              )}
              {editing && (
                <View style={[st.removeRow, { borderTopColor: C.border }]}>
                  <MinusButton label={`Remove ${OWN_SECTION_LABELS[editing]}`} onPress={() => remove(editing)} />
                  <Text style={[st.removeText, { color: C.sub }]} onPress={() => remove(editing)}>Remove this section</Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  flex:       { flex: 1 },
  list:       { marginTop: 8, gap: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  rowText:    { flex: 1, minWidth: 0 },
  rowTitle:   { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  rowSub:     { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', marginTop: 1 },
  add:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 12 },
  addText:    { fontFamily: 'BakbakOne-Regular', fontSize: 13.5 },
  pick:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickChip:   { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  pickText:   { fontFamily: 'BakbakOne-Regular', fontSize: 12.5 },
  sheet:      { flex: 1 },
  sheetHead:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 20, letterSpacing: 0.4 },
  doneBtn:    { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  done:       { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
  sheetBody:  { padding: 16 },
  hint:       { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', lineHeight: 17, marginBottom: 14 },
  faq:        { marginBottom: 6 },
  addQuestion:{ paddingVertical: 6, marginTop: 4 },
  removeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  removeText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
});
