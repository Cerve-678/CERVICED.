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
  Modal,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import {
  createIntakeForm,
  getIntakeFormByBooking,
  getMyProviderProfile,
  getMyProviderServices,
  getProviderFormLibrary,
  saveFormToLibrary,
  updateLibraryForm,
  deleteLibraryForm,
  sendLibraryFormToClient,
  insertBookingUserNotification,
  IntakeFormQuestion,
  IntakeForm,
  LibraryForm,
} from '../services/databaseService';
import { ProviderHomeScreenProps } from '../navigation/types';
import { useProviderDialog } from '../components/ProviderDialog';

type Props = ProviderHomeScreenProps<'ProviderIntakeForm'>;

const DARK  = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', ice: '#FFFFFF', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)', sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)' };
const LIGHT = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197', ice: '#FFFFFF', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)', sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(175,145,151,0.12)' };
// AdaptiveTabBar: position absolute, bottom: 34, minHeight: 80
const TAB_BAR_CLEARANCE = 80;

function makeId() { return Math.random().toString(36).slice(2, 9); }

// ── Templates ────────────────────────────────────────────────────────────────

interface Template {
  id:        string;
  label:     string;
  subtitle:  string;
  keywords:  string[];
  questions: Omit<IntakeFormQuestion, 'id'>[];
}

const TEMPLATES: Template[] = [
  {
    id: 'hair', label: 'Hair', subtitle: 'Colour, cuts, treatments',
    keywords: ['hair', 'colour', 'color', 'cut', 'blowout', 'blow dry', 'highlight', 'balayage', 'keratin', 'relaxer', 'perm', 'toner', 'gloss', 'trim', 'extension', 'weave', 'loc', 'braids'],
    questions: [
      { type: 'choice', label: 'What is your hair type?', required: true, options: ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'] },
      { type: 'choice', label: 'Hair history', required: true, options: ['Virgin / untreated', 'Coloured', 'Bleached / lightened', 'Relaxed / permed', 'Extensions'] },
      { type: 'text',   label: 'What look are you going for today?', required: true },
      { type: 'yesno',  label: 'Any known allergies to hair products?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Any scalp conditions (dandruff, psoriasis, etc.)?', required: false },
      { type: 'yesno',  label: 'Currently pregnant or breastfeeding?', required: true },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'nails', label: 'Nails', subtitle: 'Gel, acrylic, nail art',
    keywords: ['nail', 'gel', 'acrylic', 'manicure', 'pedicure', 'infill', 'removal', 'shellac', 'sns', 'dip'],
    questions: [
      { type: 'choice', label: 'Service booked', required: true, options: ['Gel manicure', 'Acrylic set', 'Nail art', 'Pedicure', 'Infill', 'Removal'] },
      { type: 'yesno',  label: 'Any nail damage or thin nails?', required: true },
      { type: 'yesno',  label: 'Any known allergies (acrylics, gels)?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'choice', label: 'Preferred nail length', required: false, options: ['Short', 'Medium', 'Long', 'Extra long'] },
      { type: 'text',   label: 'Any inspiration or references?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'lashes', label: 'Lashes', subtitle: 'Extensions, lifts, tints',
    keywords: ['lash', 'extension', 'lash lift', 'tint', 'classic set', 'hybrid', 'volume', 'mega volume'],
    questions: [
      { type: 'choice', label: 'Type of lash service', required: true, options: ['Classic set', 'Hybrid set', 'Volume set', 'Infill', 'Removal', 'Lash lift & tint'] },
      { type: 'yesno',  label: 'Had lash extensions before?', required: true },
      { type: 'yesno',  label: 'Any known allergies (latex, formaldehyde, cyanoacrylate)?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Do you wear contact lenses?', required: true },
      { type: 'choice', label: 'Desired look', required: false, options: ['Natural', 'Wispy', 'Cat eye', 'Doll eye', 'Bold / dramatic'] },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'brows', label: 'Brows', subtitle: 'Wax, thread, lamination',
    keywords: ['brow', 'eyebrow', 'thread', 'threading', 'lamination', 'microblading', 'powder brow', 'henna'],
    questions: [
      { type: 'choice', label: 'Brow service booked', required: true, options: ['Wax & tint', 'Thread & tint', 'Lamination', 'Microblading', 'Powder brows', 'Combo brows'] },
      { type: 'yesno',  label: 'Any previous brow treatments (microblading/tattoo)?', required: true },
      { type: 'yesno',  label: 'Any known skin allergies or sensitivities?', required: true },
      { type: 'text',   label: 'Please describe any skin conditions', required: false },
      { type: 'yesno',  label: 'On Roaccutane or blood-thinning medication?', required: true },
      { type: 'choice', label: 'Preferred brow style', required: false, options: ['Natural', 'Defined', 'Arched', 'Straight / Korean', 'Fluffy'] },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'skin', label: 'Skin', subtitle: 'Facials, peels, aesthetics',
    keywords: ['skin', 'facial', 'peel', 'derma', 'aesthetic', 'hydra', 'microneedle', 'botox', 'filler', 'glow', 'led', 'microdermabrasion', 'hifu'],
    questions: [
      { type: 'choice', label: 'Skin type', required: true, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
      { type: 'choice', label: 'Main skin concern', required: true, options: ['Acne', 'Hyperpigmentation', 'Ageing / fine lines', 'Dehydration', 'Redness / rosacea', 'General glow'] },
      { type: 'yesno',  label: 'Any known allergies or sensitivities?', required: true },
      { type: 'text',   label: 'Please describe any allergies', required: false },
      { type: 'yesno',  label: 'Any active skin conditions (eczema, psoriasis, cold sores)?', required: true },
      { type: 'yesno',  label: 'Currently pregnant or breastfeeding?', required: true },
      { type: 'yesno',  label: 'On photosensitive medication (antibiotics, retinoids)?', required: true },
      { type: 'text',   label: 'Last professional treatment and when?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
  {
    id: 'mua', label: 'Makeup', subtitle: 'Glam, bridal, editorial',
    keywords: ['makeup', 'make-up', 'mua', 'bridal', 'glam', 'foundation', 'airbrush', 'makeover'],
    questions: [
      { type: 'choice', label: 'Skin type', required: true, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
      { type: 'text',   label: 'What is the occasion?', required: true },
      { type: 'choice', label: 'Desired look', required: true, options: ['Natural / no-makeup', 'Soft glam', 'Full glam', 'Editorial', 'Bridal'] },
      { type: 'yesno',  label: 'Any known allergies to makeup products?', required: true },
      { type: 'text',   label: 'If yes, please describe', required: false },
      { type: 'yesno',  label: 'Do you wear contact lenses?', required: false },
      { type: 'text',   label: 'Any products you do not want used?', required: false },
      { type: 'yesno',  label: 'Happy with before/after photos on social media?', required: false },
    ],
  },
];

function detectTemplate(serviceName: string): Template | null {
  const lower = serviceName.toLowerCase();
  let best: Template | null = null, bestScore = 0;
  for (const tpl of TEMPLATES) {
    const score = tpl.keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = tpl; }
  }
  return bestScore > 0 ? best : null;
}

function getRelevantTemplates(serviceCategory: string, serviceNames: string[]): Template[] {
  const pool = [serviceCategory, ...serviceNames].join(' ').toLowerCase();
  const scored = TEMPLATES.map(tpl => ({
    tpl,
    score: tpl.keywords.filter(k => pool.includes(k)).length,
  })).filter(({ score }) => score > 0);
  if (scored.length === 0) return TEMPLATES;
  return scored.sort((a, b) => b.score - a.score).map(({ tpl }) => tpl);
}

// ── Question type config ─────────────────────────────────────────────────────
const Q_TYPES: { type: IntakeFormQuestion['type']; label: string; icon: string }[] = [
  { type: 'text',   label: 'Text',     icon: 'create-outline' },
  { type: 'yesno',  label: 'Yes / No', icon: 'checkmark-circle-outline' },
  { type: 'choice', label: 'Choice',   icon: 'list-outline' },
];

// ── Screen ───────────────────────────────────────────────────────────────────

type Mode = 'picker' | 'builder' | 'readonly';
type PickerTab = 'myForms' | 'templates';

export default function ProviderIntakeFormScreen({ route, navigation }: Props) {
  const { bookingId, clientUserId, serviceName, formId: existingFormId } = route.params;
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { showToast, DialogHost } = useProviderDialog();

  // ── Global state ──────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<Mode>('picker');
  const [pickerTab, setPickerTab] = useState<PickerTab>('myForms');
  const [loading, setLoading]     = useState(true);

  // ── Picker state ──────────────────────────────────────────────────────────
  const [libraryForms, setLibraryForms]         = useState<LibraryForm[]>([]);
  const [relevantTemplates, setRelevantTemplates] = useState<Template[]>(TEMPLATES);
  const [providerServiceNames, setProviderServiceNames] = useState<string[]>([]);

  // ── Builder state ─────────────────────────────────────────────────────────
  const [editingId, setEditingId]           = useState<string | null>(null); // library form being edited
  const [title, setTitle]                   = useState(`${serviceName} – Consultation Form`);
  const [questions, setQuestions]           = useState<IntakeFormQuestion[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [autoSend, setAutoSend]             = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [saving, setSaving]                 = useState(false);

  // ── Readonly state ────────────────────────────────────────────────────────
  const [existingForm, setExistingForm] = useState<IntakeForm | null>(null);

  // ── Preview modal ─────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);

  const autoTemplate = detectTemplate(serviceName);

  // ── Disable native swipe-back in builder mode (beforeRemove not supported in native-stack) ──
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: mode !== 'builder' });
  }, [navigation, mode]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [forms, profile, services, existing] = await Promise.all([
          getProviderFormLibrary(),
          getMyProviderProfile(),
          getMyProviderServices(),
          existingFormId ? getIntakeFormByBooking(bookingId) : Promise.resolve(null),
        ]);

        setLibraryForms(forms);
        const svcNames = services.map(s => s.name);
        setProviderServiceNames(svcNames);
        setRelevantTemplates(getRelevantTemplates(profile?.service_category ?? '', svcNames));

        if (existing) {
          setExistingForm(existing);
          setTitle(existing.title);
          setQuestions(existing.questions);
          setRequiresSignature(existing.requiresSignature);
          setMode('readonly');
        } else {
          setPickerTab(forms.length > 0 ? 'myForms' : 'templates');
          setMode('picker');
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Builder helpers ───────────────────────────────────────────────────────
  const openBuilderBlank = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(null);
    setTitle(`${serviceName} – Consultation Form`);
    setQuestions([]);
    setSelectedServices([]);
    setAutoSend(false);
    setRequiresSignature(false);
    setMode('builder');
  }, [serviceName]);

  const openBuilderFromTemplate = useCallback((tpl: Template) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(null);
    setTitle(`${tpl.label} Consultation Form`);
    setQuestions(tpl.questions.map(q => ({ ...q, id: makeId() })));
    setSelectedServices([]);
    setAutoSend(false);
    setRequiresSignature(false);
    setMode('builder');
  }, []);

  const openBuilderFromLibrary = useCallback((form: LibraryForm) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(form.id);
    setTitle(form.title);
    setQuestions(form.questions.map(q => ({ ...q, id: makeId() })));
    setSelectedServices(form.serviceNames);
    setAutoSend(form.autoSend);
    setRequiresSignature(form.requiresSignature);
    setMode('builder');
  }, []);

  const toggleService = useCallback((name: string) => {
    setSelectedServices(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }, []);

  // ── Question CRUD ─────────────────────────────────────────────────────────
  const addQuestion = useCallback((type: IntakeFormQuestion['type']) => {
    Haptics.selectionAsync().catch(() => {});
    setQuestions(prev => [...prev, {
      id: makeId(), type, label: '', required: false,
      ...(type === 'choice' ? { options: ['', ''] } : {}),
    }]);
  }, []);

  const updateQuestion = useCallback((id: string, patch: Partial<IntakeFormQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  }, []);

  const removeQuestion = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setQuestions(prev => prev.filter(q => q.id !== id));
  }, []);

  const addOption = useCallback((qId: string) => {
    setQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, options: [...(q.options ?? []), ''] } : q
    ));
  }, []);

  const updateOption = useCallback((qId: string, idx: number, value: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const opts = [...(q.options ?? [])]; opts[idx] = value;
      return { ...q, options: opts };
    }));
  }, []);

  const removeOption = useCallback((qId: string, idx: number) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const opts = [...(q.options ?? [])]; opts.splice(idx, 1);
      return { ...q, options: opts };
    }));
  }, []);

  // ── Save to library ───────────────────────────────────────────────────────
  const handleSaveToLibrary = useCallback(async (): Promise<LibraryForm | null> => {
    if (questions.length === 0) { showToast('Add at least one question.', 'warning'); return null; }
    if (questions.some(q => !q.label.trim())) { showToast('All questions must have a label.', 'warning'); return null; }
    setSaving(true);
    try {
      let saved: LibraryForm;
      if (editingId) {
        await updateLibraryForm(editingId, {
          title: title.trim() || 'Consultation Form',
          questions,
          serviceNames: selectedServices,
          autoSend,
          requiresSignature,
        });
        saved = { id: editingId, providerId: '', title, questions, serviceNames: selectedServices, autoSend, requiresSignature, sentCount: 0, createdAt: '' };
      } else {
        saved = await saveFormToLibrary({
          title: title.trim() || 'Consultation Form',
          questions,
          serviceNames: selectedServices,
          autoSend,
          requiresSignature,
        });
      }
      // Refresh library
      const updated = await getProviderFormLibrary();
      setLibraryForms(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return saved;
    } catch {
      showToast('Could not save the form. Please try again.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  }, [editingId, title, questions, selectedServices, autoSend, requiresSignature]);

  // ── Send to client ────────────────────────────────────────────────────────
  const handleSendToClient = useCallback(async (libraryFormId: string) => {
    setSaving(true);
    try {
      const provider = await getMyProviderProfile();
      if (!provider) throw new Error();
      const form = await sendLibraryFormToClient(libraryFormId, bookingId, clientUserId);
      await insertBookingUserNotification({
        booking_id: bookingId,
        type: 'booking_confirmed',
        title: `${provider.display_name} sent you a form`,
        message: `Please fill out: "${form.title}" before your appointment.`,
        priority: 'high',
        is_actionable: true,
        provider_id: provider.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast('Form sent to client.', 'success');
      navigation.goBack();
    } catch {
      showToast('Could not send the form. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [bookingId, clientUserId, navigation]);

  const handleSaveAndSend = useCallback(async () => {
    const saved = await handleSaveToLibrary();
    if (saved) await handleSendToClient(saved.id);
  }, [handleSaveToLibrary, handleSendToClient]);

  const handleDeleteLibraryForm = useCallback(async (id: string) => {
    try {
      await deleteLibraryForm(id);
      setLibraryForms(prev => prev.filter(f => f.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      showToast('Could not delete form.', 'error');
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={P.accent} size="large" />
      </View>
    );
  }

  const canSave = questions.length > 0 && questions.every(q => q.label.trim());

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: P.bg }}>
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: P.border }]}>
          <TouchableOpacity
            onPress={() => mode === 'builder' ? setMode('picker') : navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.iconBtn, { backgroundColor: P.surface }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: P.text }]}>
              {mode === 'readonly' ? 'Form Responses'
                : mode === 'builder' ? (editingId ? 'Edit Form' : 'Create Form')
                : 'Intake Forms'}
            </Text>
            {mode === 'builder' && questions.length > 0 && (
              <View style={[styles.qPill, { backgroundColor: P.surface, borderColor: P.border }]}>
                <Text style={[styles.qPillText, { color: P.sub }]}>{questions.length}q</Text>
              </View>
            )}
          </View>

          {mode === 'picker' && (
            <TouchableOpacity
              onPress={openBuilderBlank}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.iconBtn, { backgroundColor: P.accent }]}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {mode === 'builder' && (
            <TouchableOpacity
              onPress={() => setShowPreview(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.iconBtn, { backgroundColor: P.surface }]}
            >
              <Ionicons name="eye-outline" size={18} color={P.text} />
            </TouchableOpacity>
          )}
          {mode === 'readonly' && <View style={{ width: 36 }} />}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ══════════════ PICKER ══════════════ */}
        {mode === 'picker' && (
          <>
            <View style={[styles.tabBar, { borderBottomColor: P.border }]}>
              {(['myForms', 'templates'] as PickerTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabItem, pickerTab === tab && { borderBottomColor: P.accent }]}
                  onPress={() => setPickerTab(tab)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLabel, { color: pickerTab === tab ? P.accent : P.sub }]}>
                    {tab === 'myForms'
                      ? `My Forms${libraryForms.length > 0 ? ` (${libraryForms.length})` : ''}`
                      : 'Templates'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.pickerContent, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 24 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* ── My Forms ── */}
              {pickerTab === 'myForms' && (
                libraryForms.length === 0 ? (
                  <View style={[styles.emptyState, { borderColor: P.border }]}>
                    <Ionicons name="document-text-outline" size={40} color={P.sub} style={{ marginBottom: 12 }} />
                    <Text style={[styles.emptyTitle, { color: P.text }]}>No forms yet</Text>
                    <Text style={[styles.emptySub, { color: P.sub }]}>
                      Tap + to create a form and save it here.{'\n'}You can then send it to any client.
                    </Text>
                  </View>
                ) : (
                  libraryForms.map(f => (
                    <LibraryFormCard
                      key={f.id}
                      form={f}
                      P={P}
                      onSend={() => handleSendToClient(f.id)}
                      onEdit={() => openBuilderFromLibrary(f)}
                      onDelete={() => handleDeleteLibraryForm(f.id)}
                    />
                  ))
                )
              )}

              {/* ── Templates ── */}
              {pickerTab === 'templates' && (
                <>
                  {autoTemplate && relevantTemplates.some(t => t.id === autoTemplate.id) && (
                    <>
                      <Text style={[styles.sectionHeading, { color: P.sub }]}>SUGGESTED FOR THIS BOOKING</Text>
                      <TouchableOpacity
                        style={[styles.formRow, styles.formRowAccent, { backgroundColor: P.card, borderColor: P.accent + '55' }]}
                        onPress={() => openBuilderFromTemplate(autoTemplate)}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.formRowTop}>
                            <Text style={[styles.formRowTitle, { color: P.text }]}>{autoTemplate.label}</Text>
                            <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
                              <Text style={[styles.badgeText, { color: P.accent }]}>Best match</Text>
                            </View>
                          </View>
                          <Text style={[styles.formRowSub, { color: P.sub }]}>
                            {autoTemplate.subtitle}  ·  {autoTemplate.questions.length} questions
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={P.accent} />
                      </TouchableOpacity>
                      {relevantTemplates.filter(t => t.id !== autoTemplate.id).length > 0 && (
                        <Text style={[styles.sectionHeading, { color: P.sub, marginTop: 24 }]}>OTHER TEMPLATES FOR YOUR SERVICES</Text>
                      )}
                    </>
                  )}

                  {!autoTemplate && (
                    <Text style={[styles.sectionHeading, { color: P.sub }]}>TEMPLATES FOR YOUR SERVICES</Text>
                  )}

                  <View style={styles.templateGrid}>
                    {relevantTemplates.filter(t => t.id !== autoTemplate?.id).map(tpl => (
                      <TouchableOpacity
                        key={tpl.id}
                        style={[styles.templateCard, { backgroundColor: P.card, borderColor: P.border }]}
                        onPress={() => openBuilderFromTemplate(tpl)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.templateCardLabel, { color: P.text }]}>{tpl.label}</Text>
                        <Text style={[styles.templateCardSub, { color: P.sub }]}>{tpl.subtitle}</Text>
                        <View style={styles.templateCardFoot}>
                          <Text style={[styles.templateCardCount, { color: P.sub }]}>{tpl.questions.length} questions</Text>
                          <Ionicons name="arrow-forward" size={13} color={P.sub} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          </>
        )}

        {/* ══════════════ BUILDER ══════════════ */}
        {mode === 'builder' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.builderContent, { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 120 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text style={[styles.fieldLabel, { color: P.sub }]}>FORM TITLE</Text>
            <TextInput
              style={[styles.titleInput, { color: P.text, backgroundColor: P.card, borderColor: P.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Form title"
              placeholderTextColor={P.sub}
            />

            {/* Service association */}
            {providerServiceNames.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { color: P.sub }]}>LINKS TO YOUR SERVICES</Text>
                <Text style={[styles.fieldHint, { color: P.sub }]}>
                  Select which services this form applies to. Toggle Auto-send to send it automatically when the service is booked.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serviceChipsScroll} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                  {providerServiceNames.map(name => {
                    const selected = selectedServices.includes(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.serviceChip,
                          { borderColor: selected ? P.accent : P.border,
                            backgroundColor: selected ? P.accent + '18' : P.card }]}
                        onPress={() => toggleService(name)}
                        activeOpacity={0.7}
                      >
                        {selected && <Ionicons name="checkmark" size={12} color={P.accent} />}
                        <Text style={[styles.serviceChipText, { color: selected ? P.accent : P.sub }]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {selectedServices.length > 0 && (
                  <View style={[styles.autoSendRow, { borderColor: P.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.autoSendLabel, { color: P.text }]}>Auto-send when service is booked</Text>
                      <Text style={[styles.autoSendSub, { color: P.sub }]}>Client receives this form automatically on booking confirmation</Text>
                    </View>
                    <Switch
                      value={autoSend}
                      onValueChange={setAutoSend}
                      trackColor={{ false: P.accent, true: P.accent + '88' }}
                      thumbColor={autoSend ? P.accent : P.surface}
                      ios_backgroundColor={P.accent}
                    />
                  </View>
                )}
              </>
            )}

            <View style={[styles.divider, { backgroundColor: P.border }]} />

            {/* Questions */}
            {questions.map((q, idx) => (
              <QuestionCard
                key={q.id}
                question={q} index={idx}
                isReadOnly={false} existingAnswer={null}
                P={P}
                onUpdateQuestion={updateQuestion}
                onRemoveQuestion={removeQuestion}
                onAddOption={addOption}
                onUpdateOption={updateOption}
                onRemoveOption={removeOption}
              />
            ))}

            {questions.length === 0 && (
              <View style={[styles.builderEmpty, { borderColor: P.border }]}>
                <Text style={[styles.builderEmptyText, { color: P.sub }]}>No questions yet. Add one below.</Text>
              </View>
            )}

            {/* Add question */}
            <Text style={[styles.fieldLabel, { color: P.sub, marginTop: 8 }]}>ADD QUESTION</Text>
            <View style={styles.addRow}>
              {Q_TYPES.map(({ type, label, icon }) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.addBtn, { backgroundColor: P.card, borderColor: P.border }]}
                  onPress={() => addQuestion(type)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={icon as any} size={18} color={P.text} />
                  <Text style={[styles.addBtnText, { color: P.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Signature toggle */}
            <View style={[styles.autoSendRow, { borderColor: P.border, marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.autoSendLabel, { color: P.text }]}>Require client signature / initials</Text>
                <Text style={[styles.autoSendSub, { color: P.sub }]}>Client must sign off before submitting</Text>
              </View>
              <Switch
                value={requiresSignature}
                onValueChange={setRequiresSignature}
                trackColor={{ false: P.accent, true: P.accent + '88' }}
                thumbColor={requiresSignature ? P.accent : P.surface}
                ios_backgroundColor={P.accent}
              />
            </View>
          </ScrollView>
        )}

        {/* ══════════════ READONLY ══════════════ */}
        {mode === 'readonly' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.builderContent, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.roTitle, { color: P.text }]}>{title}</Text>
            {existingForm?.requiresSignature && (
              <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44', alignSelf: 'flex-start', marginBottom: 16 }]}>
                <Ionicons name="pencil-outline" size={11} color={P.accent} />
                <Text style={[styles.badgeText, { color: P.accent }]}>Signature required</Text>
              </View>
            )}
            <View style={[styles.divider, { backgroundColor: P.border }]} />
            {questions.map((q, idx) => (
              <QuestionCard
                key={q.id} question={q} index={idx}
                isReadOnly existingAnswer={existingForm?.answers?.[q.id] ?? null}
                P={P}
                onUpdateQuestion={updateQuestion}
                onRemoveQuestion={removeQuestion}
                onAddOption={addOption}
                onUpdateOption={updateOption}
                onRemoveOption={removeOption}
              />
            ))}
            {existingForm?.clientSignature && (
              <View style={[styles.signatureBox, { backgroundColor: P.card, borderColor: P.border }]}>
                <Text style={[styles.fieldLabel, { color: P.sub, marginBottom: 6 }]}>CLIENT SIGNATURE</Text>
                <Text style={[styles.signatureText, { color: P.text }]}>{existingForm.clientSignature}</Text>
              </View>
            )}
            {existingForm?.status === 'pending' && (
              <View style={[styles.pendingBanner, { backgroundColor: P.card, borderColor: P.border }]}>
                <Ionicons name="time-outline" size={16} color={P.sub} />
                <Text style={[styles.pendingText, { color: P.sub }]}>Awaiting client response</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Builder footer ── */}
        {mode === 'builder' && (
          <View style={[styles.footer, {
            backgroundColor: P.bg, borderTopColor: P.border,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 12,
          }]}>
            <View style={styles.footerRow}>
              <TouchableOpacity
                style={[styles.saveBtn, { borderColor: canSave ? P.accent : P.border, backgroundColor: P.card }]}
                onPress={async () => { const s = await handleSaveToLibrary(); if (s) setMode('picker'); }}
                disabled={saving || !canSave}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color={P.accent} size="small" />
                  : <Text style={[styles.saveBtnText, { color: canSave ? P.accent : P.sub }]}>Save to My Forms</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: canSave ? P.accent : P.surface }]}
                onPress={handleSaveAndSend}
                disabled={saving || !canSave}
                activeOpacity={0.8}
              >
                <Text style={[styles.sendBtnText, { color: canSave ? '#fff' : P.sub }]}>Save & Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Form Preview Modal ── */}
      <Modal visible={showPreview} animationType="none" presentationStyle="pageSheet" onRequestClose={() => setShowPreview(false)}>
        <SafeAreaView style={[styles.previewRoot, { backgroundColor: P.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.previewHeader, { borderBottomColor: P.border }]}>
            <View style={{ width: 36 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.previewTitle, { color: P.text }]}>Preview</Text>
              <Text style={[styles.previewSub, { color: P.sub }]}>Client view</Text>
            </View>
            <TouchableOpacity onPress={() => setShowPreview(false)} style={[styles.iconBtn, { backgroundColor: P.surface }]}>
              <Ionicons name="close" size={18} color={P.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.previewFormTitle, { color: P.text }]}>{title || 'Consultation Form'}</Text>
            <Text style={[styles.previewFormSub, { color: P.sub }]}>{questions.length} question{questions.length !== 1 ? 's' : ''}{requiresSignature ? '  ·  Signature required' : ''}</Text>
            <View style={[styles.divider, { backgroundColor: P.border, marginBottom: 20 }]} />
            {questions.length === 0 ? (
              <View style={[styles.builderEmpty, { borderColor: P.border }]}>
                <Text style={[styles.builderEmptyText, { color: P.sub }]}>No questions added yet</Text>
              </View>
            ) : questions.map((q, idx) => (
              <View key={q.id} style={[styles.previewQ, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.previewQTop}>
                  <Text style={[styles.previewQNum, { color: P.sub }]}>{idx + 1}</Text>
                  {q.required && <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}><Text style={[styles.badgeText, { color: P.accent }]}>Required</Text></View>}
                </View>
                <Text style={[styles.previewQLabel, { color: P.text }]}>{q.label || '(no question text)'}</Text>
                {q.type === 'text' && (
                  <View style={[styles.previewInput, { borderColor: P.border, backgroundColor: P.bg }]}>
                    <Text style={[{ color: P.sub, fontSize: 14, fontStyle: 'italic' }]}>Type your answer…</Text>
                  </View>
                )}
                {q.type === 'yesno' && (
                  <View style={styles.previewYesNo}>
                    {['Yes', 'No'].map(v => (
                      <View key={v} style={[styles.previewYesNoBtn, { borderColor: P.border, backgroundColor: P.bg }]}>
                        <Text style={[{ color: P.sub, fontSize: 14, fontWeight: '600' }]}>{v}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {q.type === 'choice' && (
                  <View style={{ gap: 7 }}>
                    {(q.options ?? []).map((opt, oi) => (
                      <View key={oi} style={[styles.previewChoice, { borderColor: P.border, backgroundColor: P.bg }]}>
                        <View style={[styles.previewRadio, { borderColor: P.sub }]} />
                        <Text style={[{ color: opt ? P.text : P.sub, fontSize: 14 }]}>{opt || `Option ${oi + 1}`}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {requiresSignature && (
              <View style={[styles.previewQ, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.previewQTop}>
                  <Text style={[styles.previewQNum, { color: P.sub }]}>{questions.length + 1}</Text>
                  <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
                    <Ionicons name="pencil-outline" size={10} color={P.accent} />
                    <Text style={[styles.badgeText, { color: P.accent }]}>Signature</Text>
                  </View>
                </View>
                <Text style={[styles.previewQLabel, { color: P.text }]}>Full name as signature</Text>
                <View style={[styles.previewInput, { borderColor: P.border, backgroundColor: P.bg }]}>
                  <Text style={[{ color: P.sub, fontSize: 14, fontStyle: 'italic' }]}>Type your full name…</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <DialogHost />
    </View>
  );
}

// ── LibraryFormCard ──────────────────────────────────────────────────────────

function LibraryFormCard({ form, P, onSend, onEdit, onDelete }: {
  form:     LibraryForm;
  P:        typeof DARK;
  onSend:   () => void;
  onEdit:   () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.libraryCard, { backgroundColor: P.card, borderColor: P.border }]}>
      {/* Top row */}
      <View style={styles.libraryCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.libraryCardTitle, { color: P.text }]}>{form.title}</Text>
          <Text style={[styles.libraryCardMeta, { color: P.sub }]}>
            {form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
            {form.sentCount > 0 ? `  ·  Sent ${form.sentCount}×` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <Ionicons name="pencil-outline" size={16} color={P.sub} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 12 }}>
          <Ionicons name="trash-outline" size={16} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      {/* Badges row */}
      <View style={styles.libraryCardBadges}>
        {form.requiresSignature && (
          <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Ionicons name="pencil-outline" size={10} color={P.sub} />
            <Text style={[styles.badgeText, { color: P.sub }]}>Signature</Text>
          </View>
        )}
        {form.autoSend && (
          <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
            <Ionicons name="flash-outline" size={10} color={P.accent} />
            <Text style={[styles.badgeText, { color: P.accent }]}>Auto-send</Text>
          </View>
        )}
        {form.serviceNames.slice(0, 3).map(name => (
          <View key={name} style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Text style={[styles.badgeText, { color: P.sub }]}>{name}</Text>
          </View>
        ))}
        {form.serviceNames.length > 3 && (
          <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Text style={[styles.badgeText, { color: P.sub }]}>+{form.serviceNames.length - 3} more</Text>
          </View>
        )}
      </View>

      {/* Send button */}
      <TouchableOpacity style={[styles.librarySendBtn, { borderColor: P.accent + '55', backgroundColor: P.accent + '10' }]} onPress={onSend} activeOpacity={0.75}>
        <Ionicons name="send-outline" size={14} color={P.accent} />
        <Text style={[styles.librarySendBtnText, { color: P.accent }]}>Send to Client</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({ question, index, isReadOnly, existingAnswer, P, onUpdateQuestion, onRemoveQuestion, onAddOption, onUpdateOption, onRemoveOption }: {
  question: IntakeFormQuestion; index: number; isReadOnly: boolean; existingAnswer: string | null; P: typeof DARK;
  onUpdateQuestion: (id: string, patch: Partial<IntakeFormQuestion>) => void;
  onRemoveQuestion: (id: string) => void;
  onAddOption:      (qId: string) => void;
  onUpdateOption:   (qId: string, idx: number, value: string) => void;
  onRemoveOption:   (qId: string, idx: number) => void;
}) {
  const TYPE_ICON: Record<string, string>  = { text: 'create-outline', yesno: 'checkmark-circle-outline', choice: 'list-outline' };
  const TYPE_LABEL: Record<string, string> = { text: 'Text', yesno: 'Yes / No', choice: 'Choice' };

  return (
    <View style={[styles.qCard, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.qCardHeader}>
        <View style={[styles.qTypeTag, { backgroundColor: P.surface, borderColor: P.border }]}>
          <Ionicons name={TYPE_ICON[question.type] as any} size={12} color={P.sub} />
          <Text style={[styles.qTypeTagText, { color: P.sub }]}>{TYPE_LABEL[question.type]}</Text>
        </View>
        <Text style={[styles.qNum, { color: P.sub }]}>Q{index + 1}</Text>
        {!isReadOnly && (
          <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => onRemoveQuestion(question.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {isReadOnly
        ? <Text style={[styles.qLabelText, { color: P.text }]}>{question.label}</Text>
        : <TextInput
            style={[styles.qLabelInput, { color: P.text, borderColor: P.border, backgroundColor: P.bg }]}
            value={question.label}
            onChangeText={v => onUpdateQuestion(question.id, { label: v })}
            placeholder="Question" placeholderTextColor={P.sub} multiline
          />
      }

      {!isReadOnly && (
        <TouchableOpacity style={styles.requiredRow} onPress={() => onUpdateQuestion(question.id, { required: !question.required })} activeOpacity={0.7}>
          <View style={[styles.requiredDot, { backgroundColor: question.required ? P.accent : 'transparent', borderColor: question.required ? P.accent : P.sub }]} />
          <Text style={[styles.requiredLabel, { color: question.required ? P.accent : P.sub }]}>Required</Text>
        </TouchableOpacity>
      )}

      {question.type === 'choice' && !isReadOnly && (
        <View style={[styles.optionsWrap, { borderTopColor: P.border }]}>
          {(question.options ?? []).map((opt, oi) => (
            <View key={oi} style={styles.optionRow}>
              <View style={[styles.optionDot, { borderColor: P.sub }]} />
              <TextInput
                style={[styles.optionInput, { color: P.text, borderColor: P.border, backgroundColor: P.bg }]}
                value={opt} onChangeText={v => onUpdateOption(question.id, oi, v)}
                placeholder={`Option ${oi + 1}`} placeholderTextColor={P.sub}
              />
              {(question.options ?? []).length > 2 && (
                <TouchableOpacity onPress={() => onRemoveOption(question.id, oi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={P.sub} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={() => onAddOption(question.id)} style={styles.addOptionBtn}>
            <Text style={[styles.addOptionText, { color: P.accent }]}>+ Add option</Text>
          </TouchableOpacity>
        </View>
      )}

      {isReadOnly && existingAnswer !== null && (
        <View style={[styles.answerBox, { backgroundColor: P.surface, borderColor: P.border }]}>
          <Text style={[styles.answerLabel, { color: P.sub }]}>CLIENT ANSWER</Text>
          <Text style={[styles.answerText, { color: P.text }]}>{existingAnswer}</Text>
        </View>
      )}
      {isReadOnly && existingAnswer === null && (
        <Text style={[styles.noAnswer, { color: P.sub }]}>No answer yet</Text>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  headerTitle:  { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  qPill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  qPillText: { fontSize: 11, fontWeight: '600' },

  tabBar:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 14, fontWeight: '600' },

  pickerContent: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },

  // Library form card
  libraryCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  libraryCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  libraryCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  libraryCardMeta:  { fontSize: 12 },
  libraryCardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  librarySendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 11 },
  librarySendBtnText: { fontSize: 14, fontWeight: '700' },

  // Shared badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Template grid
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  templateCard: { width: '47.5%', borderWidth: 1, borderRadius: 14, padding: 14 },
  templateCardLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  templateCardSub:   { fontSize: 12, lineHeight: 17 },
  templateCardFoot:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  templateCardCount: { fontSize: 11, fontWeight: '600' },

  // Suggested row
  formRow:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10 },
  formRowAccent: { borderWidth: 1.5 },
  formRowTop:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  formRowTitle:  { fontSize: 15, fontWeight: '700' },
  formRowSub:    { fontSize: 12 },

  emptyState: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, borderStyle: 'dashed', paddingVertical: 48, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Builder
  builderContent: { paddingHorizontal: 16, paddingTop: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  fieldHint:  { fontSize: 12, lineHeight: 18, marginBottom: 10, marginTop: -4 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '600', marginBottom: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },

  serviceChipsScroll: { marginBottom: 14 },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  serviceChipText: { fontSize: 13, fontWeight: '600' },

  autoSendRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16, gap: 12 },
  autoSendLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  autoSendSub:   { fontSize: 12, lineHeight: 17 },

  builderEmpty: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, borderStyle: 'dashed', paddingVertical: 28, alignItems: 'center', marginBottom: 16 },
  builderEmptyText: { fontSize: 14 },

  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  addBtnText: { fontSize: 13, fontWeight: '600' },

  // Readonly
  roTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
  signatureBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 16 },
  signatureText: { fontSize: 16, fontStyle: 'italic' },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 8 },
  pendingText:   { fontSize: 14, fontWeight: '500' },

  // Question card
  qCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  qCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  qTypeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  qTypeTagText: { fontSize: 11, fontWeight: '600' },
  qNum:         { fontSize: 12, fontWeight: '700' },
  qLabelText:   { fontSize: 15, fontWeight: '500', lineHeight: 22, marginBottom: 6 },
  qLabelInput:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8, minHeight: 44 },
  requiredRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  requiredDot:  { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  requiredLabel: { fontSize: 12, fontWeight: '600' },
  optionsWrap:  { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  optionRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  optionDot:    { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  optionInput:  { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14 },
  addOptionBtn: { paddingVertical: 4, marginTop: 2 },
  addOptionText: { fontSize: 13, fontWeight: '700' },
  answerBox:   { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  answerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  answerText:  { fontSize: 15, lineHeight: 22 },
  noAnswer:    { fontSize: 13, marginTop: 8, fontStyle: 'italic' },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
  sendBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  sendBtnText: { fontSize: 15, fontWeight: '700' },

  // Preview modal
  previewRoot:    { flex: 1 },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  previewTitle:   { fontSize: 16, fontWeight: '700' },
  previewSub:     { fontSize: 12 },
  previewContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },
  previewFormTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  previewFormSub:   { fontSize: 13, marginBottom: 16 },
  previewQ:         { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  previewQTop:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  previewQNum:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  previewQLabel:    { fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 12 },
  previewInput:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 14 },
  previewYesNo:     { flexDirection: 'row', gap: 10 },
  previewYesNoBtn:  { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  previewChoice:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  previewRadio:     { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
