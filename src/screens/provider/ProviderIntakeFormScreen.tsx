import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView, WindowControlsInsetProvider } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import {
  getIntakeFormByBooking,
  getMyProviderProfile,
  getMyProviderServices,
  getProviderFormLibrary,
  getProviderBookings,
  saveFormToLibrary,
  updateLibraryForm,
  deleteLibraryForm,
  sendLibraryFormToBookings,
  getBookingIdsWithLibraryForm,
  IntakeFormQuestion,
  IntakeForm,
  LibraryForm,
} from '../../services/databaseService';
import type { BookingWithAddOns } from '../../types/database';
import { ProviderHomeScreenProps } from '../../navigation/types';
import { useAppDialog } from '../../components/AppDialog';
import { buildPolicyDisplayRows, PolicyDisplayRow } from '../../utils/policyDisplay';
import {
  FormTemplate,
  declaredCategories,
  detectTemplate,
  getRelevantTemplates,
} from '../../features/intake-forms/formTemplates';
import { FormsWelcome } from '../../features/intake-forms/FormsWelcome';
import { DEADLINE_OPTIONS, deadlineLabel, dueByLabel } from '../../features/intake-forms/formDeadline';
import { appointmentLabel, formProblem, sentFormsMessage, upcomingForForms } from '../../features/intake-forms/sendForms';
import { recordTourSeen, resolveTourForUser } from '../../services/tourService';
import { TOUR_KEYS } from '../../utils/coachMarkTours';
import { useHowItWorks } from '../../components/HowItWorksSheet';
import { logger } from '../../utils/logger';
import { tr, trp, useTranslation } from '../../i18n';

type Props = ProviderHomeScreenProps<'ProviderIntakeForm'>;

const DARK  = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', onAccent: '#1A1815', ice: '#FFFFFF', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)', sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)' };
const LIGHT = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#5C4033', onAccent: '#FFFFFF', ice: '#FFFFFF', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)', sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(92,64,51,0.12)' };
// AdaptiveTabBar: position absolute, bottom: 34, minHeight: 80
const TAB_BAR_CLEARANCE = 80;

function makeId() { return Math.random().toString(36).slice(2, 9); }

// ── Templates ────────────────────────────────────────────────────────────────
// The category-driven template set lives in features/intake-forms/formTemplates.ts.
// Only the two per-provider one-offs stay here: they're generated from the
// provider's own policies, or are an empty shell for them to write into.

/** Builds the one-off "Policy Agreement" template from the provider's own,
 *  live booking_policies — unlike the templates in formTemplates.ts (static,
 *  hardcoded question text), this one's content is per-provider and has to
 *  be generated at request time. Not part of the shared template set in
 *  formTemplates.ts — callers splice this in alongside the category templates. Returns null when the provider
 *  hasn't set any policy yet — nothing to build a form from. */
function buildPolicyTemplate(policyRows: PolicyDisplayRow[]): FormTemplate | null {
  if (policyRows.length === 0) return null;
  const body = policyRows.map(r => [`${r.label}: ${r.value}`, ...(r.notes ?? [])].join('\n')).join('\n');
  return {
    id: 'policy-agreement',
    category: null,
    kind: 'policy',
    label: tr('providerBookings.forms.template.policy.label'),
    subtitle: tr('providerBookings.forms.template.policy.subtitle'),
    keywords: [],
    questions: [
      {
        type: 'policy',
        label: 'Cancellation & Booking Policy',
        body,
        required: true,
      },
    ],
  };
}

/** The provider's own Terms & Conditions.
 *
 *  Static, unlike buildPolicyTemplate: booking_policies can generate a policy
 *  summary because those are structured fields, but terms are prose only the
 *  provider can write. So this is a starting shell with an empty body and the
 *  headings most providers need, not generated content — nothing here is
 *  legal wording put into a provider's mouth.
 *
 *  Kept out of the category templates so it gets its own section rather than
 *  competing for a slot in the consultation grid; every provider is offered
 *  it regardless of what they do.
 */
const TERMS_TEMPLATE: FormTemplate = {
  id: 'terms-and-conditions',
  category: null,
  kind: 'terms',
  label: 'Terms & Conditions',
  subtitle: 'Your own terms, shown to clients when they book',
  keywords: [],
  questions: [
    {
      type: 'policy',
      label: 'Terms & Conditions',
      body: '',
      required: true,
    },
  ],
};

// ── Question type config ─────────────────────────────────────────────────────
const Q_TYPES: { type: IntakeFormQuestion['type']; label: string; icon: string }[] = [
  { type: 'text',   get label() { return tr('providerBookings.forms.qType.text'); },     icon: 'create-outline' },
  { type: 'yesno',  get label() { return tr('providerBookings.forms.qType.yesNo'); }, icon: 'checkmark-circle-outline' },
  { type: 'choice', get label() { return tr('providerBookings.forms.qType.choice'); },   icon: 'list-outline' },
  { type: 'policy', get label() { return tr('providerBookings.forms.qType.policy'); },   icon: 'document-text-outline' },
];

// ── Screen ───────────────────────────────────────────────────────────────────

type Mode = 'picker' | 'builder' | 'readonly';

/** The appointment list opened from the builder's Save & Send: the form
 *  being written, saved only when Save & send is pressed. */
const DRAFT_FORM = '__draft__';
type PickerTab = 'myForms' | 'templates';

export default function ProviderIntakeFormScreen({ route, navigation }: Props) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  // Opened two ways: from a booking (all params set — builder pre-fills the
  // service, sending goes straight to that client) or from Quick Access with
  // no params at all (pure library — sending opens a booking picker below).
  // The route is a union — booking context, or the terms deep-link, or
  // nothing — so read it as one loose bag rather than destructuring a shape
  // only one of the three arms actually has.
  const params = (route.params ?? {}) as Partial<{
    bookingId: string;
    clientUserId: string;
    serviceName: string;
    formId: string;
    openTerms: boolean;
  }>;
  const { bookingId, clientUserId, formId: existingFormId, openTerms } = params;
  const serviceName = params.serviceName ?? '';
  const hasBookingContext = !!bookingId && !!clientUserId;
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { showToast, DialogHost } = useAppDialog();
  const { user } = useAuth();

  // ── Global state ──────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<Mode>('picker');
  const [pickerTab, setPickerTab] = useState<PickerTab>('myForms');
  const [loading, setLoading]     = useState(true);

  // ── Picker state ──────────────────────────────────────────────────────────
  const [libraryForms, setLibraryForms]         = useState<LibraryForm[]>([]);
  const [relevantTemplates, setRelevantTemplates] = useState<FormTemplate[]>([]);
  const [providerServiceNames, setProviderServiceNames] = useState<string[]>([]);
  // Built fresh from the provider's live booking_policies on every screen
  // load (not cached in TEMPLATES, which is a shared module-level const) —
  // null until the provider has set a policy with at least one field filled in.
  const [policyTemplate, setPolicyTemplate] = useState<FormTemplate | null>(null);

  // ── Builder state ─────────────────────────────────────────────────────────
  const [editingId, setEditingId]           = useState<string | null>(null); // library form being edited
  const [title, setTitle]                   = useState(`${serviceName} – Consultation Form`);
  const [questions, setQuestions]           = useState<IntakeFormQuestion[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [isTerms, setIsTerms] = useState(false);
  // Every service linked, not merely "as many as exist" — a provider with no
  // services at all shouldn't read as fully selected (the picker is hidden in
  // that case anyway, but the label would be wrong if it ever weren't).
  const allServicesSelected =
    providerServiceNames.length > 0 &&
    providerServiceNames.every(name => selectedServices.includes(name));
  const [autoSend, setAutoSend]             = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [deadlineHours, setDeadlineHours]   = useState<number | null>(null);
  const [saving, setSaving]                 = useState(false);
  // One save or send at a time. `saving` only disables the buttons after the
  // next render, so a quick second tap used to start a second save and add
  // the same form to My Forms twice.
  const busyRef = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // ── Readonly state ────────────────────────────────────────────────────────
  const [existingForm, setExistingForm] = useState<IntakeForm | null>(null);

  // ── Preview modal ─────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);

  // ── Booking picker (opened from Quick Access — no booking context yet) ────
  const [pickingBookingFor, setPickingBookingFor] = useState<string | null>(null); // library form id
  const [pickableBookings, setPickableBookings] = useState<BookingWithAddOns[]>([]);
  const [pickedBookingIds, setPickedBookingIds] = useState<string[]>([]);
  // Appointments that already have this form: shown, but can't be picked.
  const [alreadySentIds, setAlreadySentIds] = useState<string[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // ── How Forms work (first visit, then the ⓘ) ──────────────────────────────
  const welcome = useHowItWorks();
  const welcomeCheckedRef = useRef(false);

  const autoTemplate = detectTemplate(serviceName, relevantTemplates);

  // ── Disable native swipe-back in builder mode (beforeRemove not supported in native-stack) ──
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: mode !== 'builder' });
  }, [navigation, mode]);

  // The floating provider tab bar is only relevant while the keyboard is
  // closed. Keeping its clearance in the footer while typing made the action
  // buttons float well above the keyboard and hid lower question inputs.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
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
    setDeadlineHours(null);
    setMode('builder');
  }, [serviceName]);

  const openBuilderFromTemplate = useCallback((tpl: FormTemplate) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(null);
    setTitle(tpl.label);
    setQuestions(tpl.questions.map(q => ({ ...q, id: makeId() })));
    setSelectedServices([]);
    setAutoSend(false);
    setRequiresSignature(false);
    setDeadlineHours(null);
    // Carried through the save so get_provider_terms can find this one row
    // among a library that also holds medical-history and patch-test forms.
    setIsTerms(tpl.kind === 'terms');
    setMode('builder');
  }, []);

  const openBuilderFromLibrary = useCallback((form: LibraryForm) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingId(form.id);
    setTitle(form.title);
    setQuestions(form.questions.map(q => ({ ...q, id: makeId() })));
    setSelectedServices([...new Set(form.serviceNames)]);
    setAutoSend(form.autoSend);
    setRequiresSignature(form.requiresSignature);
    setIsTerms(form.isTerms);
    setDeadlineHours(form.deadlineHours);
    setMode('builder');
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [forms, profile, services, existing] = await Promise.all([
          getProviderFormLibrary(),
          getMyProviderProfile(),
          getMyProviderServices(),
          existingFormId && bookingId ? getIntakeFormByBooking(bookingId) : Promise.resolve(null),
        ]);

        setLibraryForms(forms);
        // Forms link to services by name, so two services with the same name
        // (e.g. "Skin Consultation" in two categories) are one choice here.
        // Listed twice, they also gave two chips the same key.
        const svcNames = [...new Set(services.map(s => s.name))];
        setProviderServiceNames(svcNames);
        setRelevantTemplates(getRelevantTemplates(
          declaredCategories(
            profile?.service_category,
            // service_categories is the full set a provider declared; the
            // single service_category is only its headline entry.
            (profile as { service_categories?: string[] | null } | null)?.service_categories,
          ),
          svcNames,
        ));
        setPolicyTemplate(
          buildPolicyTemplate(buildPolicyDisplayRows((profile as any)?.booking_policies ?? null)),
        );

        if (existing) {
          setExistingForm(existing);
          setTitle(existing.title);
          setQuestions(existing.questions);
          setRequiresSignature(existing.requiresSignature);
          setMode('readonly');
        } else if (openTerms) {
          // Straight into writing/editing the terms. Reuses the same two
          // paths the Forms card does — the saved form if there is one, the
          // empty template if not — rather than duplicating that choice.
          const saved = forms.find(f => f.isTerms);
          if (saved) openBuilderFromLibrary(saved);
          else openBuilderFromTemplate(TERMS_TEMPLATE);
        } else {
          setPickerTab(forms.length > 0 ? 'myForms' : 'templates');
          setMode('picker');
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [bookingId, existingFormId, openTerms, openBuilderFromLibrary, openBuilderFromTemplate]);

  // First visit to the library: the welcome, once per account
  // (users.seen_tours). Only when the screen lands on the library itself —
  // opening straight into a client's answers or the terms editor is the
  // wrong moment, and the welcome waits for the next library visit.
  useEffect(() => {
    if (loading || !user?.id || welcomeCheckedRef.current) return;
    welcomeCheckedRef.current = true;
    if (mode !== 'picker') return;
    let alive = true;
    resolveTourForUser(TOUR_KEYS.PROVIDER_FORMS, [{ key: 'welcome' }], user.id)
      .then(decision => {
        if (!alive || !decision.show) return;
        welcome.showOnArrival();
        void recordTourSeen(TOUR_KEYS.PROVIDER_FORMS, user.id);
      })
      .catch(error => logger.error('[Forms] welcome check failed:', error));
    return () => { alive = false; };
  }, [loading, mode, user?.id, welcome.showOnArrival]);


  const toggleService = useCallback((name: string) => {
    setSelectedServices(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }, []);

  // ── Question CRUD ─────────────────────────────────────────────────────────
  const addQuestion = useCallback((type: IntakeFormQuestion['type']) => {
    Haptics.selectionAsync().catch(() => {});
    setQuestions(prev => [...prev, {
      id: makeId(),
      type,
      label: type === 'policy' ? 'Policy Agreement' : '',
      required: type === 'policy' ? true : false,
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
    const problem = formProblem(questions);
    if (problem) { showToast(problem, 'warning'); return null; }
    if (busyRef.current) return null;
    busyRef.current = true;
    setSaving(true);
    try {
      const fields = {
        title: title.trim() || 'Consultation Form',
        questions,
        serviceNames: selectedServices,
        autoSend,
        requiresSignature,
        isTerms,
        deadlineHours: isTerms ? null : deadlineHours,
      };
      let saved: LibraryForm;
      if (editingId) {
        await updateLibraryForm(editingId, fields);
        saved = { id: editingId, providerId: '', ...fields, sentCount: 0, createdAt: '' };
      } else {
        saved = await saveFormToLibrary(fields);
        // From here on this builder edits the form it just made. Without
        // this, Save & Send followed by closing the client list (or a second
        // Save) added another copy to My Forms every time.
        setEditingId(saved.id);
      }
      // Refresh library
      const updated = await getProviderFormLibrary();
      setLibraryForms(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return saved;
    } catch {
      showToast(tr('providerBookings.forms.toast.saveFailed'), 'error');
      return null;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }, [editingId, title, questions, selectedServices, autoSend, requiresSignature, isTerms, deadlineHours, showToast]);

  // ── Send to client ────────────────────────────────────────────────────────
  // Opened from a booking: send straight to that client. Opened from Quick
  // Access (library only): pick the appointments first. Save & Send from the
  // builder opens the same list for the form being written (DRAFT_FORM) and
  // saves it only when "Save & send" is pressed with people picked.
  const openBookingPicker = useCallback(async (formId: string) => {
    setLoadingBookings(true);
    setPickedBookingIds([]);
    setAlreadySentIds([]);
    setPickingBookingFor(formId);
    try {
      const upcoming = upcomingForForms(await getProviderBookings(0), Date.now());
      const savedId = formId === DRAFT_FORM ? editingId : formId;
      const already = savedId ? await getBookingIdsWithLibraryForm(savedId, upcoming.map(b => b.id)) : [];
      setPickableBookings(upcoming);
      setAlreadySentIds(already);
    } catch {
      showToast(tr('providerBookings.forms.toast.loadBookingsFailed'), 'error');
      setPickingBookingFor(null);
    } finally {
      setLoadingBookings(false);
    }
  }, [editingId, showToast]);

  const sendToBookings = useCallback(async (libraryFormId: string, targets: { bookingId: string; clientUserId: string }[]) => {
    if (busyRef.current || targets.length === 0) return;
    busyRef.current = true;
    setSaving(true);
    try {
      // sendLibraryFormToBookings looks up the provider profile itself and
      // already notifies each client (intake_form_received / "Form to
      // Complete") — a second insert here used to double-send the push.
      const sent = await sendLibraryFormToBookings(libraryFormId, targets);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(sentFormsMessage(sent.length, targets.length), 'success');
      setPickingBookingFor(null);
      setPickedBookingIds([]);
      if (hasBookingContext) navigation.goBack();
      else setMode('picker');
    } catch {
      showToast(tr('providerBookings.forms.toast.sendFailed'), 'error');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }, [hasBookingContext, navigation, showToast]);

  // From a library card. A form saved before the empty-form check can still
  // be empty, so it's checked here too.
  const handleSendToClient = useCallback((form: Pick<LibraryForm, 'id' | 'questions'>) => {
    const problem = formProblem(form.questions);
    if (problem) { showToast(tr('providerBookings.forms.editFirst', { problem }), 'warning'); return; }
    if (bookingId && clientUserId) {
      void sendToBookings(form.id, [{ bookingId, clientUserId }]);
    } else {
      void openBookingPicker(form.id);
    }
  }, [bookingId, clientUserId, openBookingPicker, sendToBookings, showToast]);

  const togglePickedBooking = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPickedBookingIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  const sendToPickedBookings = useCallback(async () => {
    if (!pickingBookingFor) return;
    const targets = pickableBookings
      .filter(b => pickedBookingIds.includes(b.id) && !alreadySentIds.includes(b.id) && !!b.user_id)
      .map(b => ({ bookingId: b.id, clientUserId: b.user_id }));
    if (targets.length === 0) return;
    let formId = pickingBookingFor;
    if (formId === DRAFT_FORM) {
      const saved = await handleSaveToLibrary();
      if (!saved) return;
      formId = saved.id;
    }
    await sendToBookings(formId, targets);
  }, [pickingBookingFor, pickableBookings, pickedBookingIds, alreadySentIds, handleSaveToLibrary, sendToBookings]);

  const handleSaveAndSend = useCallback(async () => {
    const problem = formProblem(questions);
    if (problem) { showToast(problem, 'warning'); return; }
    if (bookingId && clientUserId) {
      // From a booking: the client is already known, so save and send.
      const saved = await handleSaveToLibrary();
      if (saved) await sendToBookings(saved.id, [{ bookingId, clientUserId }]);
      return;
    }
    // Pick who first; nothing is saved until Save & send.
    Haptics.selectionAsync().catch(() => {});
    void openBookingPicker(DRAFT_FORM);
  }, [questions, bookingId, clientUserId, handleSaveToLibrary, sendToBookings, openBookingPicker, showToast]);

  const handleDeleteLibraryForm = useCallback(async (id: string) => {
    try {
      await deleteLibraryForm(id);
      setLibraryForms(prev => prev.filter(f => f.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      showToast(tr('providerBookings.forms.toast.deleteFailed'), 'error');
    }
  }, [showToast]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: P.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={P.accent} size="large" />
      </View>
    );
  }

  const canSave = formProblem(questions) === null;
  // The welcome's example is this provider's own best template, if any.
  const welcomeExample = autoTemplate ?? relevantTemplates[0];

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
              {mode === 'readonly' ? tr('providerBookings.forms.title.responses')
                : mode === 'builder' ? (editingId ? 'Edit Form' : 'Create Form')
                : 'Forms'}
            </Text>
            {mode === 'picker' && (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); welcome.show(); }}
                hitSlop={10}
                activeOpacity={0.7}
                style={[styles.infoBtn, { backgroundColor: P.iconBg }]}
                accessibilityLabel={tr('providerBookings.forms.howA11y')}
              >
                <Ionicons name="information" size={13} color={P.text} />
              </TouchableOpacity>
            )}
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
              <Ionicons name="add" size={20} color={P.onAccent} />
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

      <KeyboardDismissView style={{ flex: 1 }}>

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
                      ? `${tr('providerBookings.forms.myForms')}${libraryForms.length > 0 ? ` (${libraryForms.length})` : ''}`
                      : tr('providerBookings.forms.tab.templates')}
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
                    <Text style={[styles.emptyTitle, { color: P.text }]}>{tr('providerBookings.forms.empty.title')}</Text>
                    <Text style={[styles.emptySub, { color: P.sub }]}>
                      {tr('providerBookings.forms.emptyLine1')}{'\n'}{tr('providerBookings.forms.emptyLine2')}
                    </Text>
                  </View>
                ) : (
                  libraryForms.map((f, i) => (
                    <LibraryFormCard
                      key={f.id}
                      form={f}
                      index={i}
                      P={P}
                      onSend={() => handleSendToClient(f)}
                      onEdit={() => openBuilderFromLibrary(f)}
                      onDelete={() => handleDeleteLibraryForm(f.id)}
                    />
                  ))
                )
              )}

              {/* ── Templates ── */}
              {pickerTab === 'templates' && (
                <>
                  {autoTemplate && (
                    <>
                      <Text style={[styles.sectionHeading, { color: P.sub }]}>{tr('providerBookings.forms.section.suggested')}</Text>
                      <TouchableOpacity
                        style={[styles.formRow, styles.formRowAccent, { backgroundColor: P.card, borderColor: P.accent + '55' }]}
                        onPress={() => openBuilderFromTemplate(autoTemplate)}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.formRowTop}>
                            <Text style={[styles.formRowTitle, { color: P.text }]}>{autoTemplate.label}</Text>
                            <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
                              <Text style={[styles.badgeText, { color: P.accent }]}>{tr('providerBookings.forms.bestMatch')}</Text>
                            </View>
                          </View>
                          <Text style={[styles.formRowSub, { color: P.sub }]}>
                            {autoTemplate.subtitle}  ·  {autoTemplate.questions.length} questions
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={P.accent} />
                      </TouchableOpacity>
                      {relevantTemplates.filter(t => t.id !== autoTemplate.id).length > 0 && (
                        <Text style={[styles.sectionHeading, { color: P.sub, marginTop: 24 }]}>{tr('providerBookings.forms.section.otherTemplates')}</Text>
                      )}
                    </>
                  )}

                  {!autoTemplate && (
                    <Text style={[styles.sectionHeading, { color: P.sub }]}>{tr('providerBookings.forms.section.templates')}</Text>
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

                  {/* The provider's own T&Cs. Its own section, like the
                      policy one below and for the same reason: every provider
                      needs it regardless of what they do, so it isn't scored
                      against service keywords like the grid above.
                      Distinct from Policy Agreement — that's a generated
                      summary of structured booking_policies (cancellation
                      window, deposit, no-show); this is prose the provider
                      writes, and it's the one form clients can read from the
                      booking sheet before they book. */}
                  <Text style={[styles.sectionHeading, { color: P.sub, marginTop: 24 }]}>{tr('providerBookings.forms.section.terms')}</Text>
                  <View style={styles.templateGrid}>
                    <TouchableOpacity
                      style={[styles.templateCard, { backgroundColor: P.card, borderColor: P.border }]}
                      onPress={() => {
                        const existing = libraryForms.find(f => f.isTerms);
                        if (existing) openBuilderFromLibrary(existing);
                        else openBuilderFromTemplate(TERMS_TEMPLATE);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.templateCardLabel, { color: P.text }]}>{TERMS_TEMPLATE.label}</Text>
                      <Text style={[styles.templateCardSub, { color: P.sub }]}>{TERMS_TEMPLATE.subtitle}</Text>
                      <View style={styles.templateCardFoot}>
                        <Text style={[styles.templateCardCount, { color: P.sub }]}>
                          {libraryForms.some(f => f.isTerms) ? tr('providerBookings.forms.terms.written') : tr('providerBookings.forms.terms.notWritten')}
                        </Text>
                        <Ionicons name="arrow-forward" size={13} color={P.sub} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Every provider has a policy (or can set one in Public
                      Profile), so this isn't scored/filtered by service
                      category like the templates above — always offered,
                      built fresh from live booking_policies each time. */}
                  {policyTemplate && (
                    <>
                      <Text style={[styles.sectionHeading, { color: P.sub, marginTop: 24 }]}>{tr('providerBookings.forms.section.policies')}</Text>
                      <View style={styles.templateGrid}>
                        <TouchableOpacity
                          style={[styles.templateCard, { backgroundColor: P.card, borderColor: P.border }]}
                          onPress={() => openBuilderFromTemplate(policyTemplate)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.templateCardLabel, { color: P.text }]}>{policyTemplate.label}</Text>
                          <Text style={[styles.templateCardSub, { color: P.sub }]}>{policyTemplate.subtitle}</Text>
                          <View style={styles.templateCardFoot}>
                            <Text style={[styles.templateCardCount, { color: P.sub }]}>{tr('providerBookings.forms.policy.prefilled')}</Text>
                            <Ionicons name="arrow-forward" size={13} color={P.sub} />
                          </View>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
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
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text style={[styles.fieldLabel, { color: P.sub }]}>{tr('providerBookings.forms.field.title')}</Text>
            <TextInput
              style={[styles.titleInput, { color: P.text, backgroundColor: P.card, borderColor: P.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder={tr('providerBookings.forms.field.titlePlaceholder')}
              placeholderTextColor={P.sub}
            />

            {/* Service association */}
            {providerServiceNames.length > 0 && (
              <>
                {/* A terms/policy form usually applies to everything a
                    provider offers, which meant tapping every chip one at a
                    time. Doubles as Clear, so the same control undoes it. */}
                <View style={styles.serviceLinkHeader}>
                  <Text style={[styles.fieldLabel, { color: P.sub, marginBottom: 0 }]}>{tr('providerBookings.forms.field.links')}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedServices(allServicesSelected ? [] : [...providerServiceNames]);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.serviceLinkAction, { color: P.accent }]}>
                      {allServicesSelected ? tr('providerBookings.forms.field.clearAll') : tr('providerBookings.forms.field.selectAll')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.fieldHint, { color: P.sub }]}>
                  {tr('providerBookings.forms.field.linksHint')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serviceChipsScroll} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                  {providerServiceNames.map((name) => {
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
                      <Text style={[styles.autoSendLabel, { color: P.text }]}>{tr('providerBookings.forms.autoSend.label')}</Text>
                      <Text style={[styles.autoSendSub, { color: P.sub }]}>{tr('providerBookings.forms.autoSend.sub')}</Text>
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
                <Text style={[styles.builderEmptyText, { color: P.sub }]}>{tr('providerBookings.forms.builder.empty')}</Text>
              </View>
            )}

            {/* Add question */}
            <Text style={[styles.fieldLabel, { color: P.sub, marginTop: 8 }]}>{tr('providerBookings.forms.builder.addQuestion')}</Text>
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

            {/* Deadline — not on Terms, which a client reads before booking */}
            {!isTerms && (
              <>
                <Text style={[styles.fieldLabel, { color: P.sub, marginTop: 8 }]}>DEADLINE</Text>
                <Text style={[styles.fieldHint, { color: P.sub }]}>
                  {tr('providerBookings.forms.dueHint')}
                </Text>
                <View style={styles.deadlineRow}>
                  {DEADLINE_OPTIONS.map(o => {
                    const on = deadlineHours === o.hours;
                    return (
                      <TouchableOpacity
                        key={o.label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.serviceChip, { borderColor: on ? P.accent : P.border, backgroundColor: on ? P.accent + '18' : P.card }]}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setDeadlineHours(o.hours); }}
                        activeOpacity={0.7}
                      >
                        {on && <Ionicons name="checkmark" size={12} color={P.accent} />}
                        <Text style={[styles.serviceChipText, { color: on ? P.accent : P.sub }]}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Signature toggle */}
            <View style={[styles.autoSendRow, { borderColor: P.border, marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.autoSendLabel, { color: P.text }]}>{tr('providerBookings.forms.signature.label')}</Text>
                <Text style={[styles.autoSendSub, { color: P.sub }]}>{tr('providerBookings.forms.signature.sub')}</Text>
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
                <Text style={[styles.badgeText, { color: P.accent }]}>{tr('providerBookings.forms.signature.required')}</Text>
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
                <Text style={[styles.fieldLabel, { color: P.sub, marginBottom: 6 }]}>{tr('providerBookings.forms.signature.client')}</Text>
                <Text style={[styles.signatureText, { color: P.text }]}>{existingForm.clientSignature}</Text>
              </View>
            )}
            {existingForm?.status === 'pending' && (
              <View style={[styles.pendingBanner, { backgroundColor: P.card, borderColor: P.border }]}>
                <Ionicons name="time-outline" size={16} color={P.sub} />
                <Text style={[styles.pendingText, { color: P.sub }]}>
                  {existingForm.dueAt ? tr('providerBookings.forms.awaitingDue', { due: dueByLabel(existingForm.dueAt) ?? '' }) : tr('providerBookings.forms.awaitingResponse')}
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Builder footer ── */}
        {mode === 'builder' && (
          <View style={[styles.footer, {
            backgroundColor: P.bg, borderTopColor: P.border,
            paddingBottom: keyboardVisible ? 12 : insets.bottom + TAB_BAR_CLEARANCE + 12,
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
                  : <Text style={[styles.saveBtnText, { color: canSave ? P.accent : P.sub }]}>{tr('providerBookings.forms.footer.save')}</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: canSave ? P.accent : P.surface }]}
                onPress={handleSaveAndSend}
                disabled={saving || !canSave}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color={P.onAccent} size="small" />
                  : <Text style={[styles.sendBtnText, { color: canSave ? P.onAccent : P.sub }]}>{tr('providerBookings.forms.footer.saveSend')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardDismissView>

      {/* ── Form Preview Modal ── */}
      <Modal visible={showPreview} animationType="none" presentationStyle="pageSheet" onRequestClose={() => setShowPreview(false)}>
        {/* Own provider: a Modal is its own native surface, so the app root's provider can't measure it and SafeAreaView in here would get zero insets. */}
        <SafeAreaProvider>
        <WindowControlsInsetProvider>
        <SafeAreaView style={[styles.previewRoot, { backgroundColor: P.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.previewHeader, { borderBottomColor: P.border }]}>
            <View style={{ width: 36 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.previewTitle, { color: P.text }]}>{tr('providerBookings.forms.preview.title')}</Text>
              <Text style={[styles.previewSub, { color: P.sub }]}>{tr('providerBookings.forms.preview.sub')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowPreview(false)} style={[styles.iconBtn, { backgroundColor: P.surface }]}>
              <Ionicons name="close" size={18} color={P.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.previewFormTitle, { color: P.text }]}>{title || 'Consultation Form'}</Text>
            <Text style={[styles.previewFormSub, { color: P.sub }]}>{trp('providerBookings.forms.questions', questions.length)}{requiresSignature ? `  ·  ${tr('providerBookings.forms.signatureRequired')}` : ''}</Text>
            {!isTerms && deadlineHours != null && (
              <Text style={[styles.previewFormSub, { color: P.accent, marginTop: -4 }]}>
                {tr('providerBookings.forms.fillInBy', { deadline: deadlineLabel(deadlineHours).toLowerCase() })}
              </Text>
            )}
            <View style={[styles.divider, { backgroundColor: P.border, marginBottom: 20 }]} />
            {questions.length === 0 ? (
              <View style={[styles.builderEmpty, { borderColor: P.border }]}>
                <Text style={[styles.builderEmptyText, { color: P.sub }]}>{tr('providerBookings.forms.preview.noQuestions')}</Text>
              </View>
            ) : questions.map((q, idx) => (
              <View key={q.id} style={[styles.previewQ, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.previewQTop}>
                  <Text style={[styles.previewQNum, { color: P.sub }]}>{idx + 1}</Text>
                  {q.required && <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}><Text style={[styles.badgeText, { color: P.accent }]}>{tr('common.required')}</Text></View>}
                </View>
                <Text style={[styles.previewQLabel, { color: P.text }]}>{q.label || '(no question text)'}</Text>
                {q.type === 'text' && (
                  <View style={[styles.previewInput, { borderColor: P.border, backgroundColor: P.bg }]}>
                    <Text style={[{ color: P.sub, fontSize: 14, fontStyle: 'italic' }]}>{tr('providerBookings.forms.preview.typeAnswer')}</Text>
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
                {q.type === 'policy' && (
                  <>
                    <View style={[styles.previewInput, { borderColor: P.border, backgroundColor: P.bg, height: 'auto' }]}>
                      <Text style={{ color: P.text, fontSize: 13, lineHeight: 19 }}>{q.body || '(no policy text)'}</Text>
                    </View>
                    {/* What the client taps to agree, as on their form. */}
                    <View style={[styles.previewYesNoBtn, styles.previewAckBtn, { borderColor: P.border, backgroundColor: P.bg }]}>
                      <Text style={{ color: P.sub, fontSize: 14, fontWeight: '600' }}>I acknowledge this policy</Text>
                    </View>
                  </>
                )}
              </View>
            ))}
            {requiresSignature && (
              <View style={[styles.previewQ, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={styles.previewQTop}>
                  <Text style={[styles.previewQNum, { color: P.sub }]}>{questions.length + 1}</Text>
                  <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
                    <Ionicons name="pencil-outline" size={10} color={P.accent} />
                    <Text style={[styles.badgeText, { color: P.accent }]}>{tr('providerBookings.forms.signature.badge')}</Text>
                  </View>
                </View>
                <Text style={[styles.previewQLabel, { color: P.text }]}>{tr('providerBookings.forms.preview.fullNameSignature')}</Text>
                <View style={[styles.previewInput, { borderColor: P.border, backgroundColor: P.bg }]}>
                  <Text style={[{ color: P.sub, fontSize: 14, fontStyle: 'italic' }]}>{tr('providerBookings.forms.preview.typeFullName')}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
        </WindowControlsInsetProvider>
        </SafeAreaProvider>
      </Modal>

      {/* ── Appointment picker — shown when "Send to clients" is tapped from
            the library with no booking already in context (opened from Quick
            Access rather than from a specific booking). Pick as many
            upcoming appointments as you like, then send once. ── */}
      <Modal
        visible={!!pickingBookingFor}
        animationType="fade"
        transparent
        onRequestClose={() => setPickingBookingFor(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickingBookingFor(null)} />
          <View style={{ maxHeight: '80%', backgroundColor: P.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 14, paddingBottom: insets.bottom + 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: P.border, marginBottom: 14 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: P.text, textAlign: 'center', marginBottom: 4 }}>{tr('providerBookings.forms.whoTitle')}</Text>
            <Text style={{ fontSize: 12, lineHeight: 17, color: P.sub, textAlign: 'center', marginBottom: 10, paddingHorizontal: 24 }}>
              {pickingBookingFor === DRAFT_FORM
                ? tr('providerBookings.forms.whoDraft')
                : tr('providerBookings.forms.who')}
            </Text>
            {loadingBookings ? (
              <ActivityIndicator color={P.accent} style={{ marginVertical: 30 }} />
            ) : pickableBookings.length === 0 ? (
              <Text style={{ fontSize: 13, color: P.sub, textAlign: 'center', paddingVertical: 30, paddingHorizontal: 24 }}>
                {tr('providerBookings.forms.noUpcoming')}
              </Text>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.pickAllRow}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    const open = pickableBookings.filter(b => !alreadySentIds.includes(b.id)).map(b => b.id);
                    setPickedBookingIds(prev => (prev.length === open.length ? [] : open));
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.serviceLinkAction, { color: P.accent }]}>
                    {pickedBookingIds.length > 0 && pickedBookingIds.length === pickableBookings.filter(b => !alreadySentIds.includes(b.id)).length ? tr('providerBookings.forms.field.clearAll') : tr('providerBookings.forms.field.selectAll')}
                  </Text>
                </TouchableOpacity>
                <ScrollView style={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                  {pickableBookings.map(b => {
                    const has = alreadySentIds.includes(b.id);
                    const on = !has && pickedBookingIds.includes(b.id);
                    return (
                      <TouchableOpacity
                        key={b.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: has }}
                        disabled={has}
                        style={[styles.formRow, { backgroundColor: P.card, borderColor: on ? P.accent : P.border, opacity: has ? 0.5 : 1 }]}
                        activeOpacity={0.75}
                        onPress={() => togglePickedBooking(b.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.formRowTitle, { color: P.text }]}>{b.customer_name ?? 'Client'}</Text>
                          <Text style={[styles.formRowSub, { color: P.sub }]}>
                            {b.service_name_snapshot} · {appointmentLabel(b)}
                          </Text>
                          {has && <Text style={[styles.formRowSub, { color: P.sub }]}>{tr('providerBookings.forms.alreadyHas')}</Text>}
                        </View>
                        <Ionicons name={has ? 'checkmark-done' : on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? P.accent : P.sub} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 0, backgroundColor: pickedBookingIds.length > 0 ? P.accent : P.surface }]}
                    onPress={() => { void sendToPickedBookings(); }}
                    disabled={saving || pickedBookingIds.length === 0}
                    activeOpacity={0.8}
                  >
                    {saving
                      ? <ActivityIndicator color={P.onAccent} size="small" />
                      : <Text style={[styles.sendBtnText, { color: pickedBookingIds.length > 0 ? P.onAccent : P.sub }]}>
                          {pickedBookingIds.length === 0
                            ? tr('providerBookings.forms.pickWho')
                            : trp(pickingBookingFor === DRAFT_FORM ? 'providerBookings.forms.saveSendTo' : 'providerBookings.forms.sendTo', pickedBookingIds.length)}
                        </Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <FormsWelcome
        visible={welcome.open}
        P={P}
        exampleTitle={welcomeExample?.label ?? 'Consultation Form'}
        exampleQuestions={welcomeExample ? welcomeExample.questions.filter(q => q.type !== 'policy' && q.label.trim()) : []}
        serviceChips={providerServiceNames}
        onStart={() => { welcome.hide(); setPickerTab('templates'); }}
        onClose={welcome.hide}
      />

      <DialogHost />
    </View>
  );
}

// ── LibraryFormCard ──────────────────────────────────────────────────────────

function LibraryFormCard({ form, index, P, onSend, onEdit, onDelete }: {
  form:     LibraryForm;
  index:    number;
  P:        typeof DARK;
  onSend:   () => void;
  onEdit:   () => void;
  onDelete: () => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  // Eases in on mount, a short stagger down the list — same motion as the
  // Info Packs cards.
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    const delay = Math.min(index * 50, 250);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, delay, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, [fade, index, lift]);
  // Each linked service once: a name can be saved twice from before services
  // were listed once each.
  const linkedServices = useMemo(() => [...new Set(form.serviceNames)], [form.serviceNames]);

  return (
    <Animated.View style={[styles.libraryCard, { backgroundColor: P.card, borderColor: P.border, opacity: fade, transform: [{ translateY: lift }] }]}>
      {/* Top row */}
      <View style={styles.libraryCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.libraryCardTitle, { color: P.text }]}>{form.title}</Text>
          <Text style={[styles.libraryCardMeta, { color: P.sub }]}>
            {form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
            {form.sentCount > 0 ? `  ·  ${tr('providerBookings.forms.sentTimes', { count: form.sentCount })}` : ''}
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
            <Text style={[styles.badgeText, { color: P.sub }]}>{tr('providerBookings.forms.signature.badge')}</Text>
          </View>
        )}
        {form.autoSend && (
          <View style={[styles.badge, { backgroundColor: P.accent + '18', borderColor: P.accent + '44' }]}>
            <Ionicons name="flash-outline" size={10} color={P.accent} />
            <Text style={[styles.badgeText, { color: P.accent }]}>{tr('providerBookings.forms.autoSend.badge')}</Text>
          </View>
        )}
        {form.deadlineHours != null && (
          <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Ionicons name="time-outline" size={10} color={P.sub} />
            <Text style={[styles.badgeText, { color: P.sub }]}>{tr('providerBookings.forms.due', { deadline: deadlineLabel(form.deadlineHours).toLowerCase() })}</Text>
          </View>
        )}
        {linkedServices.slice(0, 3).map(name => (
          <View key={name} style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Text style={[styles.badgeText, { color: P.sub }]}>{name}</Text>
          </View>
        ))}
        {linkedServices.length > 3 && (
          <View style={[styles.badge, { backgroundColor: P.surface, borderColor: P.border }]}>
            <Text style={[styles.badgeText, { color: P.sub }]}>+{linkedServices.length - 3} more</Text>
          </View>
        )}
      </View>

      {/* Send button */}
      <TouchableOpacity style={[styles.librarySendBtn, { borderColor: P.accent + '55', backgroundColor: P.accent + '10' }]} onPress={onSend} activeOpacity={0.75}>
        <Ionicons name="send-outline" size={14} color={P.accent} />
        <Text style={[styles.librarySendBtnText, { color: P.accent }]}>{tr('providerBookings.forms.sendToClients')}</Text>
      </TouchableOpacity>
    </Animated.View>
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
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const TYPE_ICON: Record<string, string>  = { text: 'create-outline', yesno: 'checkmark-circle-outline', choice: 'list-outline', policy: 'document-text-outline' };
  const TYPE_LABEL: Record<string, string> = { text: tr('providerBookings.forms.qType.text'), yesno: 'Yes / No', choice: 'Choice', policy: 'Policy' };

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
            placeholder={tr('providerBookings.forms.questionPlaceholder')} placeholderTextColor={P.sub} multiline
          />
      }

      {!isReadOnly && (
        <TouchableOpacity style={styles.requiredRow} onPress={() => onUpdateQuestion(question.id, { required: !question.required })} activeOpacity={0.7}>
          <View style={[styles.requiredDot, { backgroundColor: question.required ? P.accent : 'transparent', borderColor: question.required ? P.accent : P.sub }]} />
          <Text style={[styles.requiredLabel, { color: question.required ? P.accent : P.sub }]}>{tr('common.required')}</Text>
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
                placeholder={tr('providerBookings.forms.optionN', { n: oi + 1 })} placeholderTextColor={P.sub}
              />
              {(question.options ?? []).length > 2 && (
                <TouchableOpacity onPress={() => onRemoveOption(question.id, oi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={P.sub} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={() => onAddOption(question.id)} style={styles.addOptionBtn}>
            <Text style={[styles.addOptionText, { color: P.accent }]}>{tr('providerBookings.forms.addOption')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {question.type === 'policy' && !isReadOnly && (
        <TextInput
          style={[styles.qLabelInput, { color: P.text, borderColor: P.border, backgroundColor: P.bg, marginTop: 10, minHeight: 90 }]}
          value={question.body ?? ''}
          onChangeText={v => onUpdateQuestion(question.id, { body: v })}
          placeholder={tr('providerBookings.forms.policyPlaceholder')}
          placeholderTextColor={P.sub}
          multiline
          textAlignVertical="top"
        />
      )}
      {question.type === 'policy' && isReadOnly && (
        <Text style={[styles.qLabelText, { color: P.sub, fontSize: 13, marginTop: 6 }]}>{question.body}</Text>
      )}

      {isReadOnly && existingAnswer !== null && (
        <View style={[styles.answerBox, { backgroundColor: P.surface, borderColor: P.border }]}>
          <Text style={[styles.answerLabel, { color: P.sub }]}>{tr('providerBookings.forms.clientAnswer')}</Text>
          <Text style={[styles.answerText, { color: P.text }]}>{existingAnswer}</Text>
        </View>
      )}
      {isReadOnly && existingAnswer === null && (
        <Text style={[styles.noAnswer, { color: P.sub }]}>{tr('providerBookings.forms.noAnswer')}</Text>
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
  infoBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
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
  serviceLinkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  serviceLinkAction: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 0.6 },
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
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  previewAckBtn: { flex: 0, alignSelf: 'flex-start', paddingHorizontal: 16, marginTop: 8 },
  pickAllRow: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 6 },
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
