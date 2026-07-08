import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { supabase } from '../lib/supabase';
import { getMyProviderProfile } from '../services/databaseService';
import { useTheme } from '../contexts/ThemeContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CP_DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
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
  accent:  '#AF9197',
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
  in_app:   { icon: 'chatbubble-ellipses-outline', label: 'In-app messaging',  description: 'Clients chat with you directly inside Cerviced' },
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
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');

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
    if (enabled.has('whatsapp') && !whatsappNumber.trim()) {
      flash('Enter your WhatsApp number or disable WhatsApp', 'error');
      return;
    }
    if (enabled.has('email') && !profileEmail) {
      flash('Add a public email in Business Email settings first', 'error');
      return;
    }
    if (enabled.has('phone') && !profilePhone) {
      flash('Add a phone number to your profile first', 'error');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { error } = await supabase.from('providers').update({
        preferred_contact_methods: Array.from(enabled),
        whatsapp_number: whatsappNumber.trim() || null,
      }).eq('id', providerId!);

      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash('Contact preferences saved', 'success');
    } catch (e: any) {
      flash(e.message ?? 'Could not save changes', 'error');
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
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            keyboardShouldPersistTaps="handled"
          >
            {toast && <Toast message={toast.message} type={toast.type} />}

            {/* Info banner */}
            <View style={[s.infoBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="information-circle-outline" size={18} color={C.accent} />
              <Text style={[s.infoText, { color: C.sub }]}>
                On appointment day, clients see a Contact button with these options. Enable at least one channel.
              </Text>
            </View>

            {/* Contact method toggles */}
            <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[s.cardTitle, { color: C.text }]}>Client Contact Channels</Text>
              {ALL_METHODS.map((method, idx) => {
                const meta = METHOD_META[method];
                const isOn = enabled.has(method);
                const isLocked = method === 'in_app';
                const hasWarning =
                  (method === 'email' && isOn && !profileEmail) ||
                  (method === 'phone' && isOn && !profilePhone);

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
                        {hasWarning && (
                          <Text style={s.rowWarn}>
                            {method === 'email' ? 'Set email in Business Email settings' : 'Add phone number to your profile'}
                          </Text>
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

                    {/* WhatsApp number input */}
                    {method === 'whatsapp' && isOn && (
                      <View style={[s.subInput, { borderTopColor: C.border }]}>
                        <Text style={[s.subInputLabel, { color: C.sub }]}>WhatsApp Number</Text>
                        <TextInput
                          style={[s.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                          value={whatsappNumber}
                          onChangeText={setWhatsappNumber}
                          placeholder="+44 7700 900000"
                          placeholderTextColor={C.sub}
                          keyboardType="phone-pad"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Quick link to Business Email */}
            <TouchableOpacity style={[s.linkRow, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => navigation.navigate('BusinessEmail')} activeOpacity={0.7}>
              <Ionicons name="mail-outline" size={16} color={C.accent} />
              <Text style={[s.linkText, { color: C.text }]}>Manage email addresses</Text>
              <Ionicons name="chevron-forward" size={14} color={C.sub} />
            </TouchableOpacity>

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
        </KeyboardAvoidingView>
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

  alwaysOnBadge: { backgroundColor: CP.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  alwaysOnText:  { fontSize: 9, fontWeight: '700', color: CP.ice, letterSpacing: 0.3 },

  subInput:      { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CP.border },
  subInputLabel: { fontSize: 11, fontWeight: '600', color: CP.sub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  input:         { backgroundColor: CP.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: CP.text, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },

  linkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CP.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  linkText: { flex: 1, fontSize: 14, color: CP.ice, fontWeight: '500' },

  saveBtn:    { backgroundColor: CP.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: CP.ice + '30', marginTop: 6 },
  saveBtnDim: { opacity: 0.6 },
  saveTxt:    { fontSize: 15, fontWeight: '700', color: CP.ice },
});
