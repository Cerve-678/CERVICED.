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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import {
  getMyProviderProfile,
  getUserBusinessInfo,
  updateUserBusinessInfo,
  updateProviderContactDetails,
} from '../services/databaseService';
import { useTheme } from '../contexts/ThemeContext';

const EXTRAS_KEY = '@provider_extras';

// ─── Design tokens ────────────────────────────────────────────────────────────
const CP_DARK = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', ice: '#FFFFFF', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(255,255,255,0.08)', danger: '#FF6868',
};
const CP_LIGHT = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', ice: '#FFFFFF', text: '#1C1A18',
  sub: '#8A8680', border: 'rgba(0,0,0,0.08)', danger: '#FF6868',
};
const CP = CP_DARK; // static fallback for StyleSheet.create

// ─── Static option lists ──────────────────────────────────────────────────────

const SPECIALTIES_MAP: Record<string, string[]> = {
  HAIR:       ['Natural & textured', 'Afro hair', 'Colour & balayage', 'Extensions & weaves', 'Locs & braids', 'Bridal & occasion', "Men's cuts", "Children's hair", 'Relaxers & perms', 'Blow-dries & styling'],
  NAILS:      ['Nail art', 'Acrylic sets', 'Gel manicure', 'Infills', 'Gel extensions', 'Pedicures', 'SNS/dip powder', 'Gel-X'],
  LASHES:     ['Classic lashes', 'Volume', 'Mega volume', 'Hybrid', 'Lash lifts', 'Lash tints'],
  BROWS:      ['Threading', 'Waxing', 'Lamination', 'Microblading', 'Nano brows', 'Henna brows', 'Tinting & shaping'],
  MUA:        ['Bridal', 'Prom & occasion', 'Editorial', 'Airbrush', 'Film & TV', 'SFX', 'All skin tones', 'Deep/dark skin specialist'],
  AESTHETICS: ['Facials', 'Microneedling', 'Chemical peels', 'LED therapy', 'Dermaplaning', 'Injectables', 'Body treatments'],
  OTHER:      ['Massage', 'Body waxing', 'Spray tanning', 'Body sculpting', 'Holistic therapies'],
};

const CLIENTELE_OPTS    = ['Women', 'Men', 'Children', 'Seniors', 'Bridal & wedding parties', 'All welcome'];
const AVAILABILITY_OPTS = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Saturdays', 'Sundays', 'Same-day bookings'];
const LANGUAGE_OPTS     = ['English', 'French', 'Arabic', 'Urdu', 'Punjabi', 'Bengali', 'Gujarati', 'Yoruba', 'Igbo', 'Twi/Akan', 'Somali', 'Polish', 'Portuguese', 'Spanish', 'Mandarin', 'Hindi', 'Tamil', 'Turkish'];
const STYLE_OPTS        = ['Natural & minimal', 'Full glam', 'Edgy & creative', 'Classic & timeless', 'Bohemian', 'Bridal & romantic', 'Editorial & high-fashion'];
const ACCESSIBILITY_OPTS = ['Wheelchair accessible', 'Parking available', 'Ground floor access', 'Home visits for mobility', 'Step-free entrance'];
const CONTACT_OPTS      = ['WhatsApp', 'Phone call', 'Email', 'In-app messages'];

const SETTING_OPTS = [
  { value: 'salon_studio',  label: 'Salon or studio',         sub: 'You work from a professional space' },
  { value: 'home_studio',   label: 'Home studio',              sub: 'A dedicated space at home' },
  { value: 'mobile',        label: 'Mobile — I come to you',  sub: 'You travel to your clients' },
  { value: 'multiple',      label: 'Multiple settings',        sub: 'You work across different locations' },
];

const PRICE_OPTS = [
  { value: '1', label: '£  · Great value' },
  { value: '2', label: '££  · Mid-range' },
  { value: '3', label: '£££  · Premium' },
  { value: '4', label: '££££  · Luxury' },
];

const NEW_CLIENTS_OPTS = [
  { value: 'yes',      label: 'Yes, open to new clients' },
  { value: 'waitlist', label: 'Waitlist only' },
  { value: 'no',       label: 'Not currently taking new clients' },
];

const PATCH_OPTS = [
  { value: 'always',      label: 'Always required' },
  { value: 'new_clients', label: 'New clients only' },
  { value: 'optional',    label: 'Recommended but optional' },
  { value: 'not_needed',  label: 'Not required for my services' },
];

// ─── Mini components ──────────────────────────────────────────────────────────

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[s.cardTitle, { color: C.text }]}>{title}</Text>
      {sub ? <Text style={[s.cardSub, { color: C.sub }]}>{sub}</Text> : null}
      {children}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, readOnly, note, keyboardType, multiline }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; readOnly?: boolean; note?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad'; multiline?: boolean;
}) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={fSt.wrap}>
      <Text style={[fSt.label, { color: C.sub }]}>{label}</Text>
      <View style={[fSt.box, { backgroundColor: C.card, borderColor: C.border }, readOnly && { backgroundColor: C.surface, opacity: 0.7 }, multiline && fSt.boxMulti]}>
        <TextInput
          style={[fSt.input, { color: C.text }, multiline && fSt.inputMulti]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.sub}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!readOnly}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
        />
        {readOnly && <Ionicons name="lock-closed-outline" size={14} color={C.sub} style={{ marginRight: 12 }} />}
      </View>
      {note ? <Text style={[fSt.note, { color: C.sub }]}>{note}</Text> : null}
    </View>
  );
}

const fSt = StyleSheet.create({
  wrap:       { marginBottom: 18 },
  label:      { fontSize: 11, fontWeight: '600', color: CP.sub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  box:        { flexDirection: 'row', alignItems: 'center', backgroundColor: CP.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  boxLocked:  { backgroundColor: CP.surface, opacity: 0.7 },
  boxMulti:   { alignItems: 'flex-start' },
  input:      { flex: 1, fontSize: 15, color: CP.text, paddingHorizontal: 14, paddingVertical: 13 },
  inputMulti: { paddingTop: 13, textAlignVertical: 'top', minHeight: 80 },
  note:       { fontSize: 11, color: CP.sub, marginTop: 6, lineHeight: 16 },
});

function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={tgSt.row}>
      <View style={{ flex: 1 }}>
        <Text style={[tgSt.label, { color: C.text }]}>{label}</Text>
        {sub ? <Text style={[tgSt.sub, { color: C.sub }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={v => { Haptics.selectionAsync().catch(() => {}); onChange(v); }}
        trackColor={{ false: C.border, true: C.accent }}
        thumbColor={C.ice}
      />
    </View>
  );
}

const tgSt = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: CP.text },
  sub:   { fontSize: 12, color: CP.sub, marginTop: 2, lineHeight: 16 },
});

function RadioGroup({ options, value, onChange }: { options: { value: string; label: string; sub?: string }[]; value: string; onChange: (v: string) => void }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={{ gap: 8, marginBottom: 4 }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[rdSt.row, { backgroundColor: C.card, borderColor: active ? C.accent + '60' : C.border }, active && { backgroundColor: C.accent + '12' }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(opt.value); }}
            activeOpacity={0.75}
          >
            <View style={[rdSt.dot, { borderColor: active ? C.accent : C.sub }]}>
              {active && <View style={[rdSt.dotFill, { backgroundColor: C.accent }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rdSt.label, { color: active ? C.accent : C.text }]}>{opt.label}</Text>
              {opt.sub ? <Text style={[rdSt.sub, { color: C.sub }]}>{opt.sub}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const rdSt = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border, backgroundColor: CP.card },
  rowActive: { borderColor: CP.ice + '60', backgroundColor: 'rgba(183,225,218,0.06)' },
  dot:       { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CP.sub, alignItems: 'center', justifyContent: 'center' },
  dotActive: { borderColor: CP.ice },
  dotFill:   { width: 9, height: 9, borderRadius: 5, backgroundColor: CP.ice },
  label:     { fontSize: 14, fontWeight: '600', color: CP.text },
  sub:       { fontSize: 12, color: CP.sub, marginTop: 2 },
});

function ChipGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={chSt.wrap}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[chSt.chip, { backgroundColor: active ? C.accent : C.card, borderColor: active ? C.accent : C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(opt); }}
            activeOpacity={0.75}
          >
            <Text style={[chSt.label, { color: active ? C.ice : C.sub }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chSt = StyleSheet.create({
  wrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border, backgroundColor: CP.card },
  chipActive:  { borderColor: CP.ice + '80', backgroundColor: 'rgba(183,225,218,0.1)' },
  label:       { fontSize: 13, color: CP.sub },
  labelActive: { color: CP.ice, fontWeight: '600' },
});

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return (
    <View style={[toSt.wrap, { backgroundColor: C.surface, borderColor: type === 'error' ? C.danger + '55' : C.border }]}>
      <Ionicons name={type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={16} color={type === 'success' ? C.accent : C.danger} />
      <Text style={[toSt.txt, { color: type === 'error' ? C.danger : C.text }]}>{message}</Text>
    </View>
  );
}

const toSt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CP.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  err:  { borderColor: CP.danger + '55' },
  txt:  { fontSize: 13, color: CP.ice, flex: 1 },
});

function SectionLabel({ text }: { text: string }) {
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;
  return <Text style={{ fontSize: 11, fontWeight: '600', color: C.sub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>{text}</Text>;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProviderBusinessEmailScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = isDarkMode ? CP_DARK : CP_LIGHT;

  // ── DB fields ──────────────────────────────────────────────────────────────
  const [userId, setUserId]               = useState<string | null>(null);
  const [providerId, setProviderId]       = useState<string | null>(null);
  const [businessName, setBusinessName]   = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [bookingEmail, setBookingEmail]   = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [preferredContact, setPreferredContact] = useState<string[]>([]);

  // ── Cache-only fields (need DB migration before persisting to Supabase) ────
  const [instagram, setInstagram]         = useState('');
  const [website, setWebsite]             = useState('');
  const [serviceSetting, setServiceSetting] = useState('');
  const [travelRadius, setTravelRadius]   = useState('');
  const [specialties, setSpecialties]     = useState<string[]>([]);
  const [serviceCategory, setServiceCategory] = useState('');
  const [clientele, setClientele]         = useState<string[]>([]);
  const [priceTier, setPriceTier]         = useState('');
  const [availWindows, setAvailWindows]   = useState<string[]>([]);
  const [acceptsNew, setAcceptsNew]       = useState('yes');
  const [walkIns, setWalkIns]             = useState(false);
  const [groupBookings, setGroupBookings] = useState(false);
  const [qualifications, setQualifications] = useState('');
  const [isInsured, setIsInsured]         = useState(false);
  const [dbsChecked, setDbsChecked]       = useState(false);
  const [patchTest, setPatchTest]         = useState('');
  const [onlineConsult, setOnlineConsult] = useState(false);
  const [consultRequired, setConsultRequired] = useState(false);
  const [styleAesthetic, setStyleAesthetic] = useState<string[]>([]);
  const [productsUsed, setProductsUsed]   = useState('');
  const [isVegan, setIsVegan]             = useState(false);
  const [languages, setLanguages]         = useState<string[]>([]);
  const [accessibility, setAccessibility] = useState<string[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const [userBizInfo, providerData] = await Promise.all([
          getUserBusinessInfo(user.id),
          getMyProviderProfile(),
        ]);

        if (userBizInfo) {
          setBusinessName(userBizInfo.business_name ?? '');
          setBusinessEmail(userBizInfo.business_email ?? '');
        }

        if (providerData) {
          setBookingEmail(providerData.email ?? '');
          setProviderId(providerData.id ?? null);
          setWhatsappNumber((providerData as any).whatsapp_number ?? '');
          setPreferredContact((providerData as any).preferred_contact_methods ?? []);
          setServiceCategory((providerData as any).service_category ?? '');
        }

        const stored = await AsyncStorage.getItem(EXTRAS_KEY).catch(() => null);
        if (stored) {
          const ex = JSON.parse(stored);
          setInstagram(ex.instagram ?? '');
          setWebsite(ex.website ?? '');
          setServiceSetting(ex.serviceSetting ?? '');
          setTravelRadius(ex.travelRadius ?? '');
          setSpecialties(ex.specialties ?? []);
          setClientele(ex.clientele ?? []);
          setPriceTier(ex.priceTier ?? '');
          setAvailWindows(ex.availWindows ?? []);
          setAcceptsNew(ex.acceptsNew ?? 'yes');
          setWalkIns(ex.walkIns ?? false);
          setGroupBookings(ex.groupBookings ?? false);
          setQualifications(ex.qualifications ?? '');
          setIsInsured(ex.isInsured ?? false);
          setDbsChecked(ex.dbsChecked ?? false);
          setPatchTest(ex.patchTest ?? '');
          setOnlineConsult(ex.onlineConsult ?? false);
          setConsultRequired(ex.consultRequired ?? false);
          setStyleAesthetic(ex.styleAesthetic ?? []);
          setProductsUsed(ex.productsUsed ?? '');
          setIsVegan(ex.isVegan ?? false);
          setLanguages(ex.languages ?? []);
          setAccessibility(ex.accessibility ?? []);
        }
      } catch {
        flash('Could not load account info', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function isValidEmail(email: string) {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function toggleChip(list: string[], setList: (v: string[]) => void, val: string) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  }

  async function handleSave() {
    if (!isValidEmail(businessEmail)) { flash('Enter a valid business contact email', 'error'); return; }
    if (!isValidEmail(bookingEmail)) { flash('Enter a valid booking notification email', 'error'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const ops: Promise<void>[] = [];

      if (userId) {
        ops.push(updateUserBusinessInfo(
          userId,
          businessName.trim() || null,
          businessEmail.trim() || null,
        ));
      }

      if (providerId) {
        ops.push(updateProviderContactDetails(providerId, {
          email: bookingEmail.trim() || null,
          whatsapp_number: whatsappNumber.trim() || null,
          preferred_contact_methods: preferredContact.length ? preferredContact : null,
        }));
      }

      await Promise.all(ops);

      await AsyncStorage.setItem(EXTRAS_KEY, JSON.stringify({
        instagram, website, serviceSetting, travelRadius, specialties,
        clientele, priceTier, availWindows, acceptsNew, walkIns, groupBookings,
        qualifications, isInsured, dbsChecked, patchTest, onlineConsult,
        consultRequired, styleAesthetic, productsUsed, isVegan, languages, accessibility,
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash('Account info saved', 'success');
    } catch (e: any) {
      flash(e.message ?? 'Could not save changes', 'error');
    } finally {
      setSaving(false);
    }
  }

  const specialtyOptions = SPECIALTIES_MAP[serviceCategory] ?? Object.values(SPECIALTIES_MAP).flat();

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
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>Business Details</Text>
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: C.surface }]} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {toast && <Toast message={toast.message} type={toast.type} />}

            {/* ── Business Details ─────────────────────────────────────── */}
            <Card title="Business Details" sub="Shown on your public profile and used for communications.">
              <Field label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Your business name" />
              <Field label="Instagram Handle" value={instagram} onChange={setInstagram} placeholder="@yourbusiness" note="Shown on your profile. Clients can tap to visit your page." />
              <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourbusiness.com" />
              <Field label="Public Contact Email" value={businessEmail} onChange={setBusinessEmail} placeholder="hello@mybusiness.com" keyboardType="email-address" note="Shown on your profile. Leave blank to hide." />
              <Field label="Booking Notification Email" value={bookingEmail} onChange={setBookingEmail} placeholder="bookings@mybusiness.com" keyboardType="email-address" note="Where we send booking confirmations and alerts." />
            </Card>

            {/* ── Where You Work ───────────────────────────────────────── */}
            <Card title="Where You Work" sub="This is one of the most searched filters — be specific.">
              <RadioGroup options={SETTING_OPTS} value={serviceSetting} onChange={setServiceSetting} />
              {serviceSetting === 'mobile' && (
                <View style={{ marginTop: 14 }}>
                  <Field label="Travel Radius" value={travelRadius} onChange={setTravelRadius} placeholder="e.g. 10 miles" note="How far you're willing to travel to clients." />
                </View>
              )}
            </Card>

            {/* ── Your Specialties ─────────────────────────────────────── */}
            <Card title="Your Specialties" sub="Select everything you're trained and experienced in. This drives search results.">
              <ChipGroup
                options={specialtyOptions}
                selected={specialties}
                onToggle={v => toggleChip(specialties, setSpecialties, v)}
              />
            </Card>

            {/* ── Who You Work With ────────────────────────────────────── */}
            <Card title="Who You Work With">
              <SectionLabel text="Clientele" />
              <ChipGroup options={CLIENTELE_OPTS} selected={clientele} onToggle={v => toggleChip(clientele, setClientele, v)} />

              <View style={{ height: 18 }} />
              <SectionLabel text="Price range" />
              <RadioGroup options={PRICE_OPTS} value={priceTier} onChange={setPriceTier} />
            </Card>

            {/* ── Availability ─────────────────────────────────────────── */}
            <Card title="Availability" sub="Helps clients find you when they need an appointment.">
              <SectionLabel text="When you're typically available" />
              <ChipGroup options={AVAILABILITY_OPTS} selected={availWindows} onToggle={v => toggleChip(availWindows, setAvailWindows, v)} />

              <View style={{ height: 18 }} />
              <SectionLabel text="New clients" />
              <RadioGroup options={NEW_CLIENTS_OPTS} value={acceptsNew} onChange={setAcceptsNew} />

              <View style={{ height: 14 }} />
              <ToggleRow label="Walk-ins welcome" sub="Clients can book without advance notice" value={walkIns} onChange={setWalkIns} />
              <ToggleRow label="Group bookings" sub="Bridal parties, hen dos, group sessions" value={groupBookings} onChange={setGroupBookings} />
            </Card>

            {/* ── Credentials & Policies ───────────────────────────────── */}
            <Card title="Credentials & Policies" sub="Builds trust with clients and helps them book with confidence.">
              <Field label="Qualifications & Training" value={qualifications} onChange={setQualifications} placeholder="e.g. NVQ Level 3, VTCT, City & Guilds..." multiline />
              <ToggleRow label="Professionally insured" sub="You hold valid professional indemnity insurance" value={isInsured} onChange={setIsInsured} />
              <ToggleRow label="DBS checked" sub="Important if you work with children or vulnerable adults" value={dbsChecked} onChange={setDbsChecked} />
              <ToggleRow label="Online consultations available" sub="Clients can book a virtual consultation before their appointment" value={onlineConsult} onChange={setOnlineConsult} />
              <ToggleRow label="Consultation required for new clients" sub="All new clients must complete a consultation first" value={consultRequired} onChange={setConsultRequired} />

              <SectionLabel text="Patch test policy" />
              <RadioGroup options={PATCH_OPTS} value={patchTest} onChange={setPatchTest} />
            </Card>

            {/* ── Your Style ───────────────────────────────────────────── */}
            <Card title="Your Style & Products" sub="Helps clients find a provider whose aesthetic matches theirs.">
              <SectionLabel text="Style aesthetic" />
              <ChipGroup options={STYLE_OPTS} selected={styleAesthetic} onToggle={v => toggleChip(styleAesthetic, setStyleAesthetic, v)} />
              <View style={{ height: 14 }} />
              <Field label="Products & Brands You Use" value={productsUsed} onChange={setProductsUsed} placeholder="e.g. Olaplex, KÉRASTASE, Mylee, Lash FX..." multiline note="Many clients specifically look for providers using certain products." />
              <ToggleRow label="Vegan & cruelty-free products only" value={isVegan} onChange={setIsVegan} />
            </Card>

            {/* ── Languages ────────────────────────────────────────────── */}
            <Card title="Languages Spoken" sub="Clients often search for providers who speak their language.">
              <ChipGroup options={LANGUAGE_OPTS} selected={languages} onToggle={v => toggleChip(languages, setLanguages, v)} />
            </Card>

            {/* ── Accessibility ────────────────────────────────────────── */}
            <Card title="Accessibility" sub="Help clients with access needs find you.">
              <ChipGroup options={ACCESSIBILITY_OPTS} selected={accessibility} onToggle={v => toggleChip(accessibility, setAccessibility, v)} />
            </Card>

            {/* ── Contact Preferences ──────────────────────────────────── */}
            <Card title="Contact Preferences" sub="How clients can best reach you.">
              <SectionLabel text="Preferred contact methods" />
              <ChipGroup options={CONTACT_OPTS} selected={preferredContact} onToggle={v => toggleChip(preferredContact, setPreferredContact, v)} />
              {preferredContact.includes('WhatsApp') && (
                <View style={{ marginTop: 14 }}>
                  <Field label="WhatsApp Number" value={whatsappNumber} onChange={setWhatsappNumber} placeholder="e.g. +44 7700 900000" keyboardType="phone-pad" />
                </View>
              )}
            </Card>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: C.accent }, saving && s.saveBtnDim]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={C.ice} size="small" />
                : <Text style={[s.saveTxt, { color: C.ice }]}>Save Changes</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: CP.bg },
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: CP.text, letterSpacing: -0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: CP.surface, alignItems: 'center', justifyContent: 'center' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  card:      { backgroundColor: CP.surface, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: CP.text, marginBottom: 4 },
  cardSub:   { fontSize: 12, color: CP.sub, lineHeight: 17, marginBottom: 16 },

  saveBtn:    { backgroundColor: CP.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: CP.ice + '30', marginTop: 6, marginBottom: 8 },
  saveBtnDim: { opacity: 0.6 },
  saveTxt:    { fontSize: 15, fontWeight: '700', color: CP.ice },
});
