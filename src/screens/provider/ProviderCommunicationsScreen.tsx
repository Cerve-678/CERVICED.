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
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getMyProviderProfile,
  getMyBookedClientContact,
  setMyBookedClientContact,
  updateProviderContactDetails,
} from '../../services/databaseService';
import { useTheme } from '../../contexts/ThemeContext';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
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
  email:    { icon: 'mail-outline',                label: 'Email',              description: 'Booked clients can email you' },
  whatsapp: { icon: 'logo-whatsapp',               label: 'WhatsApp',           description: 'Booked clients open a WhatsApp chat with you' },
  phone:    { icon: 'call-outline',                label: 'Phone call',         description: 'Booked clients can call you' },
};

const ALL_METHODS: ContactMethod[] = ['in_app', 'email', 'whatsapp', 'phone'];

type ValueMethod = Exclude<ContactMethod, 'in_app'>;
type ContactValues = Record<ValueMethod, string>;
const EMPTY_VALUES: ContactValues = { email: '', phone: '', whatsapp: '' };

const INPUT_META: Record<ValueMethod, { placeholder: string; keyboardType: 'email-address' | 'phone-pad' }> = {
  email:    { placeholder: 'Email for booked clients', keyboardType: 'email-address' },
  phone:    { placeholder: 'Number for booked clients', keyboardType: 'phone-pad' },
  whatsapp: { placeholder: 'WhatsApp number for booked clients', keyboardType: 'phone-pad' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Two sets of values. `booked` is what this screen edits
  // (provider_booked_contact) — only ever shown to clients with a booking.
  // `publicValues` is the providers row Get In Touch shows to everyone; it's
  // read-only here and is what a blank booked field falls back to, server-side
  // in get_booked_client_contact.
  const [booked, setBooked] = useState<ContactValues>(EMPTY_VALUES);
  const [publicValues, setPublicValues] = useState<ContactValues>(EMPTY_VALUES);

  useEffect(() => {
    (async () => {
      try {
        const provider = await getMyProviderProfile();
        if (!provider) return;
        setProviderId(provider.id);
        setPublicValues({
          email: provider.email ?? '',
          phone: provider.phone ?? '',
          whatsapp: (provider as any).whatsapp_number ?? '',
        });
        const methods: ContactMethod[] = (provider as any).preferred_contact_methods ?? ['in_app'];
        setEnabled(new Set(methods));

        const mine = await getMyBookedClientContact(provider.id);
        setBooked({
          email: mine.email ?? '',
          phone: mine.phone ?? '',
          whatsapp: mine.whatsapp_number ?? '',
        });
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

  // What a booked client actually gets for a channel: the booked-client value
  // if there is one, else the public one (same rule as the server).
  const effective = (m: ValueMethod) => booked[m].trim() || publicValues[m].trim();

  async function handleSave() {
    // A switched-on channel needs something behind it, from either set.
    const firstMissing = ([...enabled].filter(m => m !== 'in_app') as ValueMethod[])
      .find(m => !effective(m));
    if (firstMissing) {
      flash(`Add your ${METHOD_META[firstMissing].label.toLowerCase()} details before switching it on`, 'error');
      return;
    }
    if (booked.email.trim() && !EMAIL_RE.test(booked.email.trim())) {
      flash("That email address doesn't look right", 'error');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await Promise.all([
        updateProviderContactDetails(providerId!, {
          preferred_contact_methods: Array.from(enabled),
        }),
        // Blank saves as null = "use my public detail".
        setMyBookedClientContact(providerId!, {
          email: booked.email.trim() || null,
          phone: booked.phone.trim() || null,
          whatsapp_number: booked.whatsapp.trim() || null,
        }),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      flash(toUserMessage(e, 'Could not save your changes.', 'ProviderCommunicationsScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
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
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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
                For clients who already have a booking with you. They see a
                Contact button on their booking with the channels you switch on
                here, using the details you type below.
              </Text>
            </View>

            {/* The other audience. Without this, "contact methods" reads like one
                global setting and providers assume unticking a channel here also
                hides it from their public profile — it doesn't, and hasn't since
                the two surfaces were split. */}
            <View style={[s.infoBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="globe-outline" size={18} color={C.accent} />
              <Text style={[s.infoText, { color: C.sub }]}>
                Only booked clients see these. Your public contact details (Get In
                Touch on your profile) are set in Business Profile → Contact. Leave
                a field blank here to give booked clients your public one.
              </Text>
            </View>

            {/* Contact method toggles */}
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[s.cardTitle, { color: C.text }]}>Booked-Client Contact Channels</Text>
              {ALL_METHODS.map((method, idx) => {
                const meta = METHOD_META[method];
                const isOn = enabled.has(method);
                const isLocked = method === 'in_app';
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
                      </View>
                      <Switch
                        value={isOn}
                        onValueChange={() => toggleMethod(method)}
                        disabled={isLocked}
                        trackColor={{ false: C.surface, true: C.accent }}
                        thumbColor={C.ice}
                      />
                    </View>
                    {/* Editable only while the channel is on — a value for a
                        switched-off channel never reaches a client anyway. */}
                    {method !== 'in_app' && isOn && (() => {
                      const publicValue = publicValues[method].trim();
                      return (
                        <View style={s.inputWrap}>
                          <TextInput
                            style={[s.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                            value={booked[method]}
                            onChangeText={v => setBooked(prev => ({ ...prev, [method]: v }))}
                            placeholder={publicValue || INPUT_META[method].placeholder}
                            placeholderTextColor={C.sub}
                            keyboardType={INPUT_META[method].keyboardType}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                          {!booked[method].trim() && (
                            publicValue
                              ? <Text style={[s.inputHint, { color: C.sub }]}>Using your public {method === 'email' ? 'email' : 'number'}. Type here to give booked clients a different one.</Text>
                              : <Text style={s.rowWarn}>Not added yet</Text>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                );
              })}
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
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE },

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
  inputWrap: { marginTop: 10, marginLeft: 48 },
  input:     { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inputHint: { fontSize: 11, marginTop: 4, lineHeight: 15 },

  alwaysOnBadge: { backgroundColor: CP.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  alwaysOnText:  { fontSize: 9, fontWeight: '700', color: CP.ice, letterSpacing: 0.3 },


  saveBtn:    { backgroundColor: CP.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: CP.ice + '30', marginTop: 6 },
  saveBtnDim: { opacity: 0.6 },
  saveTxt:    { fontSize: 15, fontWeight: '700', color: CP.ice },
});
