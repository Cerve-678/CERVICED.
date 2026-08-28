import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getMyProviderProfile,
  getMyProviderMessageTemplates,
  replaceMyProviderMessageTemplates,
  updateProviderContactDetails,
  ProviderMessageTemplate,
} from '../../services/databaseService';
import { useTheme } from '../../contexts/ThemeContext';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { toUserMessage } from '../../utils/userFacingError';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CP_DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  // Lighter than `accent` for standalone text (e.g. the "Add" template
  // label) — the muted dusty rose reads as faint at small sizes against
  // near-black cards.
  accentText: '#D9AEB6',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(255,255,255,0.08)',
  danger:  '#FF6868',
  green:   '#30D158',
};
const CP_LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033',
  accentText: '#5C4033',
  ice:     '#FFFFFF',
  text:    '#1C1A18',
  sub:     '#8A8680',
  border:  'rgba(0,0,0,0.08)',
  danger:  '#FF6868',
  green:   '#30D158',
};
const CP = CP_DARK; // static fallback for StyleSheet.create

type ContactMethod = 'in_app' | 'email' | 'whatsapp' | 'phone';

const METHOD_META: Record<ContactMethod, { icon: string; label: string; description: string }> = {
  in_app:   { icon: 'chatbubble-ellipses-outline', label: 'In-app messaging',  description: 'Booked clients chat with you inside Cerviced. Anyone browsing your profile can also start a general enquiry via Get In Touch' },
  email:    { icon: 'mail-outline',                label: 'Email',              description: 'Clients can email you via your public contact email' },
  whatsapp: { icon: 'logo-whatsapp',               label: 'WhatsApp',           description: 'Clients open a WhatsApp chat with your number' },
  phone:    { icon: 'call-outline',                label: 'Phone call',         description: 'Clients can call your profile phone number' },
};

const ALL_METHODS: ContactMethod[] = ['in_app', 'email', 'whatsapp', 'phone'];

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={[tSt.wrap, { backgroundColor: C.surface, borderColor: type === 'error' ? C.danger + '55' : C.border }]}>
      <Ionicons
        name={type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
        size={16}
        color={type === 'success' ? C.accent : C.danger}
      />
      <Text style={[tSt.text, { color: type === 'error' ? C.danger : C.text }]}>{message}</Text>
    </View>
  );
}

const tSt = StyleSheet.create({
  wrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CP.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  wrapError: { borderColor: CP.danger + '55' },
  text:      { fontSize: 13, color: CP.ice, flex: 1 },
  textError: { color: CP.danger },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProviderCommunicationsScreen({ navigation }: any) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [providerId, setProviderId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<ContactMethod>>(new Set(['in_app']));
  // Read-only here — displayed under the WhatsApp toggle so the provider can
  // see what's actually published. Edited in Business Profile → Contact.
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [messageTemplates, setMessageTemplates] = useState<Pick<ProviderMessageTemplate, 'label' | 'content'>[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const provider = await getMyProviderProfile();
        if (!provider) return;
        setProviderId(provider.id);
        setProfileEmail(provider.email ?? '');
        setProfilePhone(provider.phone ?? '');

        const methods: ContactMethod[] = (provider as any).preferred_contact_methods ?? ['in_app'];
        setEnabled(new Set(methods));
        setWhatsappNumber((provider as any).whatsapp_number ?? '');
        const templates = await getMyProviderMessageTemplates();
        setMessageTemplates(templates.map(({ label, content }) => ({ label, content })));
      } catch {
        flash('Could not load contact preferences', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function toggleMethod(method: ContactMethod) {
    if (method === 'in_app') return; // always on
    Haptics.selectionAsync().catch(() => {});
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(method)) {
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  }

  async function handleSave() {
    // Toggles only — the values themselves are owned by Business Info and
    // Business Profile → Contact. All this can validate is that you haven't
    // switched on a channel that has nothing behind it.
    const missing = ([...enabled] as ContactMethod[]).filter(m =>
      (m === 'whatsapp' && !whatsappNumber.trim()) ||
      (m === 'email' && !profileEmail) ||
      (m === 'phone' && !profilePhone)
    );
    const firstMissing = missing[0];
    if (firstMissing) {
      flash(`Add your ${METHOD_META[firstMissing].label.toLowerCase()} details before switching it on`, 'error');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await updateProviderContactDetails(providerId!, {
        preferred_contact_methods: Array.from(enabled),
      });
      await replaceMyProviderMessageTemplates(messageTemplates);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      flash(toUserMessage(e, 'Could not save your changes.', 'ProviderCommunicationsScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateTemplate(index: number, field: 'label' | 'content', value: string) {
    setMessageTemplates(previous => previous.map((template, currentIndex) =>
      currentIndex === index ? { ...template, [field]: value } : template
    ));
  }

  function addTemplate() {
    if (messageTemplates.length >= 12) return;
    setMessageTemplates(previous => [...previous, { label: '', content: '' }]);
  }

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardDismissView>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>Contact Preferences</Text>
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: C.surface }]} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
          >
            {toast && <Toast message={toast.message} type={toast.type} />}

            {/* Info banner */}
            <View style={[s.infoBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="information-circle-outline" size={18} color={C.accent} />
              <Text style={[s.infoText, { color: C.sub }]}>
                These are for clients who already have a booking with you — on
                appointment day they see a Contact button in Booking Details with
                these options. Enable at least one channel.
              </Text>
            </View>

            {/* The other audience. Without this, "contact methods" reads like one
                global setting and providers assume unticking a channel here also
                hides it from their public profile — it doesn't, and hasn't since
                the two surfaces were split. */}
            <View style={[s.infoBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="globe-outline" size={18} color={C.accent} />
              <Text style={[s.infoText, { color: C.sub }]}>
                Not the same as your public contact details. Anyone browsing your
                profile uses Get In Touch, which shows the phone, email, Instagram
                and website you set in Business Profile → Contact — for general
                enquiries, not booking admin.
              </Text>
            </View>

            {/* Contact method toggles */}
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[s.cardTitle, { color: C.text }]}>Booked-Client Contact Channels</Text>
              {ALL_METHODS.map((method, idx) => {
                const meta = METHOD_META[method];
                const isOn = enabled.has(method);
                const isLocked = method === 'in_app';
                // The value itself, not a signpost to where it's typed. These
                // are set in Business Profile → Contact (and Business Info);
                // this screen only decides which of them booked clients get.
                const value =
                  method === 'email'    ? profileEmail :
                  method === 'phone'    ? profilePhone :
                  method === 'whatsapp' ? whatsappNumber :
                  '';
                return (
                  <View key={method}>
                    {idx > 0 && <View style={[s.divider, { backgroundColor: C.border }]} />}
                    <View style={s.row}>
                      <View style={[s.iconWrap, { backgroundColor: isOn ? C.accent : C.card }]}>
                        <Ionicons
                          name={meta.icon as any}
                          size={18}
                          color={isOn ? C.ice : C.sub}
                        />
                      </View>
                      <View style={s.rowText}>
                        <View style={s.rowLabelRow}>
                          <Text style={[s.rowLabel, { color: C.text }]}>{meta.label}</Text>
                          {isLocked && (
                            <View style={[s.alwaysOnBadge, { backgroundColor: C.accent }]}>
                              <Text style={[s.alwaysOnText, { color: C.ice }]}>Always on</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[s.rowDesc, { color: C.sub }]} numberOfLines={2}>{meta.description}</Text>
                        {method !== 'in_app' && (
                          value
                            ? <Text style={[s.rowValue, { color: C.text }]} numberOfLines={1}>{value}</Text>
                            : <Text style={s.rowWarn}>Not added yet</Text>
                        )}
                      </View>
                      <Switch
                        value={isOn}
                        onValueChange={() => toggleMethod(method)}
                        disabled={isLocked}
                        trackColor={{ false: C.surface, true: C.accent }}
                        thumbColor={C.ice}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* One footer link, not a per-row "go set this elsewhere" nag. The
                rows above show the real values; this is only for changing them. */}
            <TouchableOpacity style={[s.linkRow, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => navigation.navigate('BusinessInfo')} activeOpacity={0.7}>
              <Ionicons name="create-outline" size={16} color={C.accent} />
              <Text style={[s.linkText, { color: C.text }]}>Edit these contact details</Text>
              <Ionicons name="chevron-forward" size={14} color={C.sub} />
            </TouchableOpacity>

            {/* Saved by the provider and used only to fill the in-app chat composer. */}
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={s.templateHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: C.text, marginBottom: 3 }]}>In-app Messaging Templates</Text>
                  <Text style={[s.rowDesc, { color: C.sub }]}>Private to you. A template fills the in-app message box; you can always edit it before sending.</Text>
                </View>
                <TouchableOpacity style={[s.addTemplateBtn, { borderColor: C.accent }]} onPress={addTemplate} disabled={messageTemplates.length >= 12}>
                  <Ionicons name="add" size={16} color={C.accent} />
                  <Text style={[s.addTemplateText, { color: C.accentText }]}>Add</Text>
                </TouchableOpacity>
              </View>
              {messageTemplates.length === 0 ? (
                <Text style={[s.templateEmpty, { color: C.sub }]}>Create reusable replies for confirming an address, availability, or booking details.</Text>
              ) : messageTemplates.map((template, index) => (
                <View key={index} style={[s.templateItem, { borderTopColor: C.border }]}>
                  <View style={s.templateLabelRow}>
                    <TextInput
                      style={[s.templateLabelInput, { color: C.text, borderColor: C.border, backgroundColor: C.card }]}
                      value={template.label}
                      onChangeText={value => updateTemplate(index, 'label', value)}
                      placeholder="Template name"
                      placeholderTextColor={C.sub}
                      maxLength={60}
                    />
                    <TouchableOpacity onPress={() => setMessageTemplates(previous => previous.filter((_, currentIndex) => currentIndex !== index))} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[s.templateContentInput, { color: C.text, borderColor: C.border, backgroundColor: C.card }]}
                    value={template.content}
                    onChangeText={value => updateTemplate(index, 'content', value)}
                    placeholder="Message text"
                    placeholderTextColor={C.sub}
                    maxLength={1000}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: C.accent }, saving && s.saveBtnDim]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={C.ice} size="small" />
                : <Text style={[s.saveTxt, { color: C.ice }]}>Save Preferences</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CP.bg },
  safe:        { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: CP.text, letterSpacing: -0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: CP.surface, alignItems: 'center', justifyContent: 'center' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: CP.surface, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  infoText:   { flex: 1, fontSize: 13, color: CP.sub, lineHeight: 18 },

  card:      { backgroundColor: CP.surface, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: CP.text, marginBottom: 16 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: CP.border, marginVertical: 12 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText:  { flex: 1 },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: CP.text },
  rowDesc:  { fontSize: 12, color: CP.sub, marginTop: 2, lineHeight: 16 },
  rowWarn:  { fontSize: 11, color: '#FF9F0A', marginTop: 3 },
  rowValue: { fontSize: 12, color: CP.text, marginTop: 3, fontWeight: '600' },

  alwaysOnBadge: { backgroundColor: CP.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  alwaysOnText:  { fontSize: 9, fontWeight: '700', color: CP.ice, letterSpacing: 0.3 },

  templateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  addTemplateBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  addTemplateText: { fontSize: 13, fontWeight: '700' },
  templateEmpty: { fontSize: 12, lineHeight: 17, marginTop: 14 },
  templateItem: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 14 },
  templateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateLabelInput: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, fontWeight: '600' },
  templateContentInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, marginTop: 8, minHeight: 68, fontSize: 13, textAlignVertical: 'top' },

  linkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CP.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  linkText: { flex: 1, fontSize: 14, color: CP.ice, fontWeight: '500' },

  saveBtn:    { backgroundColor: CP.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: CP.ice + '30', marginTop: 6 },
  saveBtnDim: { opacity: 0.6 },
  saveTxt:    { fontSize: 15, fontWeight: '700', color: CP.ice },
});
