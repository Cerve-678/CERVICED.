import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { getIntakeFormById, submitIntakeFormAnswers, IntakeForm, IntakeFormQuestion } from '../services/databaseService';
import { HomeScreenProps } from '../navigation/types';

type Props = HomeScreenProps<'ClientIntakeForm'>;

const DARK  = { bg: '#1A1815', card: '#252220', tile: '#2E2B27', text: '#F0ECE7', sub: '#8A8580', border: 'rgba(255,255,255,0.12)' };
const LIGHT = { bg: '#F5F1EC', card: '#FFFFFF', tile: '#E3DDD7', text: '#1C1A18', sub: '#8A8680', border: 'rgba(0,0,0,0.10)' };

const ACCENT = '#AF9197';

export default function ClientIntakeFormScreen({ route, navigation }: Props) {
  const { formId, serviceName } = route.params;
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;

  const [form, setForm]         = useState<IntakeForm | null>(null);
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [signature, setSignature] = useState('');
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  useEffect(() => {
    getIntakeFormById(formId).then(f => {
      if (f) {
        setForm(f);
        if (f.status === 'completed' && f.answers) setAnswers(f.answers);
        if (f.status === 'completed') setSubmitted(true);
      }
      setLoading(false);
    });
  }, [formId]);

  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form) return;

    // Validate required fields
    const missing = form.questions.filter(q => q.required && !(answers[q.id]?.trim()));
    if (missing.length > 0) {
      Alert.alert('Required fields', `Please answer: "${missing[0]?.label ?? 'the required question'}"`);
      return;
    }
    if (form.requiresSignature && !signature.trim()) {
      Alert.alert('Signature required', 'Please type your full name to sign off on this form.');
      return;
    }

    setSubmitting(true);
    try {
      await submitIntakeFormAnswers(formId, answers, signature.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSubmitted(true);
    } catch {
      Alert.alert('Error', 'Could not submit your form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, formId, answers]);

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  if (!form) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: P.text, fontSize: 16 }}>Form not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: P.bg }}>
        <View style={[styles.header, { borderBottomColor: P.border }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.iconBtn, { backgroundColor: P.tile }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: P.text }]}>Form</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {submitted ? (
        /* ── Submitted success state ── */
        <View style={styles.successState}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={[styles.successTitle, { color: P.text }]}>All done!</Text>
          <Text style={[styles.successSub, { color: P.sub }]}>
            Your provider has received your responses and is all set for your appointment.
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: ACCENT }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>Back to Booking</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Form intro — leads with WHICH service this form is for */}
            <View style={[styles.introCard, { backgroundColor: ACCENT + '14', borderColor: ACCENT + '35' }]}>
              {!!serviceName && (
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ACCENT, marginBottom: 6 }}>
                  FOR: {serviceName.toUpperCase()}
                </Text>
              )}
              <Text style={[styles.introTitle, { color: P.text }]}>{form.title}</Text>
              <Text style={[styles.introSub, { color: P.sub }]}>
                Your provider needs this info before your appointment to give you the best possible service.
              </Text>
            </View>

            {/* Questions */}
            {form.questions.map((q, idx) => (
              <QuestionInput
                key={q.id}
                question={q}
                index={idx}
                value={answers[q.id] ?? ''}
                onChange={v => setAnswer(q.id, v)}
                P={P}
              />
            ))}

            {/* Signature / initials */}
            {form.requiresSignature && (
              <View style={[styles.qCard, { backgroundColor: P.card, borderColor: ACCENT + '55' }]}>
                <View style={styles.qLabelRow}>
                  <Text style={[styles.qNumber, { color: P.sub }]}>{form.questions.length + 1}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.qLabel, { color: P.text }]}>
                      Full name as signature <Text style={{ color: '#FF3B30' }}>*</Text>
                    </Text>
                    <Text style={[{ fontSize: 12, color: P.sub, marginTop: 2 }]}>
                      By typing your name you confirm you have read and understood this form
                    </Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.textAnswer, { color: P.text, backgroundColor: P.bg, borderColor: signature.trim() ? ACCENT : P.border, minHeight: 48 }]}
                  value={signature}
                  onChangeText={setSignature}
                  placeholder="Type your full name…"
                  placeholderTextColor={P.sub}
                  autoCapitalize="words"
                />
              </View>
            )}
          </ScrollView>

          {/* Submit button */}
          <View style={[styles.footer, { backgroundColor: P.bg, borderTopColor: P.border }]}>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: ACCENT }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>Submit Form</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Question input component ─────────────────────────────────────────────────

function QuestionInput({
  question, index, value, onChange, P,
}: {
  question: IntakeFormQuestion;
  index:    number;
  value:    string;
  onChange: (v: string) => void;
  P:        typeof DARK;
}) {
  return (
    <View style={[styles.qCard, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.qLabelRow}>
        <Text style={[styles.qNumber, { color: P.sub }]}>{index + 1}.</Text>
        <Text style={[styles.qLabel, { color: P.text }]}>
          {question.label}
          {question.required && <Text style={{ color: '#FF3B30' }}> *</Text>}
        </Text>
      </View>

      {question.type === 'text' && (
        <TextInput
          style={[styles.textAnswer, { color: P.text, backgroundColor: P.bg, borderColor: P.border }]}
          value={value}
          onChangeText={onChange}
          placeholder="Your answer…"
          placeholderTextColor={P.sub}
          multiline
          textAlignVertical="top"
        />
      )}

      {question.type === 'yesno' && (
        <View style={styles.yesnoRow}>
          {(['Yes', 'No'] as const).map(opt => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.yesnoBtn,
                {
                  backgroundColor: value === opt
                    ? (opt === 'Yes' ? '#34C759' : '#FF3B30') + '22'
                    : P.tile,
                  borderColor: value === opt
                    ? (opt === 'Yes' ? '#34C759' : '#FF3B30')
                    : P.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(opt); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.yesnoText,
                { color: value === opt ? (opt === 'Yes' ? '#34C759' : '#FF3B30') : P.sub },
              ]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {question.type === 'choice' && (
        <View style={styles.optionsList}>
          {(question.options ?? []).filter(o => o.trim()).map((opt, oi) => (
            <TouchableOpacity
              key={oi}
              style={[
                styles.choiceOption,
                {
                  backgroundColor: value === opt ? ACCENT + '20' : P.tile,
                  borderColor:     value === opt ? ACCENT : P.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(opt); }}
              activeOpacity={0.7}
            >
              <View style={[
                styles.choiceRadio,
                { borderColor: value === opt ? ACCENT : P.sub },
              ]}>
                {value === opt && <View style={[styles.choiceRadioFill, { backgroundColor: ACCENT }]} />}
              </View>
              <Text style={[styles.choiceLabel, { color: value === opt ? ACCENT : P.text }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 16 },

  introCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 20 },
  introTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  introSub:   { fontSize: 14, lineHeight: 20 },

  qCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  qLabelRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  qNumber:   { fontSize: 15, fontWeight: '700', minWidth: 22 },
  qLabel:    { fontSize: 15, fontWeight: '500', flex: 1, lineHeight: 22 },

  textAnswer: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, minHeight: 80,
  },

  yesnoRow: { flexDirection: 'row', gap: 12 },
  yesnoBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  yesnoText: { fontSize: 15, fontWeight: '700' },

  optionsList: { gap: 8 },
  choiceOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  choiceRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceRadioFill: { width: 8, height: 8, borderRadius: 4 },
  choiceLabel: { fontSize: 15, flex: 1 },

  successState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successIcon:  { fontSize: 56, color: '#34C759', marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  successSub:   { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn: {
    borderRadius: 14, paddingHorizontal: 40, paddingVertical: 16,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 36, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
