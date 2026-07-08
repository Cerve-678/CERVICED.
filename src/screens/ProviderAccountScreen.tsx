import React, { useState, useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Linking,
  Modal,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Icon from '../components/IconLibrary';
import { useAuth } from '../contexts/AuthContext';
import { useRegistration } from '../contexts/RegistrationContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricLabel,
  enableBiometric,
  disableBiometric,
  authenticateWithBiometrics,
} from '../services/biometricService';
import { ThemedBackground } from '../components/ThemedBackground';

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:        '#F5F1EC',
  surface:   '#EDE8E2',
  card:      '#FFFFFF',
  accent:    '#AF9197',
  ice:       '#FFFFFF',
  text:      '#000000',
  sub:       '#7E6667',
  border:    'rgba(126,102,103,0.14)',
  sep:       'rgba(126,102,103,0.08)',
  iconBg:    'rgba(175,145,151,0.12)',
};
const DARK = {
  bg:        '#1A1815',
  surface:   '#201D1A',
  card:      '#252220',
  accent:    '#AF9197',
  ice:       '#FFFFFF',
  text:      '#F0ECE7',
  sub:       '#7E6667',
  border:    'rgba(126,102,103,0.18)',
  sep:       'rgba(126,102,103,0.10)',
  iconBg:    'rgba(175,145,151,0.10)',
};

// ── Settings row (identical to client) ──────────────────────────────────────

interface SettingsOptionProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  P: typeof LIGHT;
  danger?: boolean;
}

const SettingsOption = React.memo(({ icon, title, subtitle, onPress, P, danger }: SettingsOptionProps) => (
  <TouchableOpacity
    style={[styles.option, { backgroundColor: P.card, borderColor: P.border }]}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={styles.optionLeft}>
      <Icon name={icon} size={20} color={danger ? P.accent : P.sub} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionText, { color: danger ? P.accent : P.text }]}>{title}</Text>
        <Text style={[styles.optionSubText, { color: P.sub }]}>{subtitle}</Text>
      </View>
    </View>
    <Icon name="chevron-right" size={18} color={P.sub} style={{ opacity: 0.4 }} />
  </TouchableOpacity>
));

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderAccountScreen({ navigation }: any) {
  const { user, logout, switchMode } = useAuth();
  const { resetData, updateData } = useRegistration();
  const { isDarkMode, toggleTheme } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const [showClientModal, setShowClientModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      if (!available) return;
      const [enabled, label] = await Promise.all([isBiometricEnabled(), getBiometricLabel()]);
      setBiometricAvailable(true);
      setBiometricEnabled(enabled);
      setBiometricLabel(label);
    })();
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (value) {
      const authenticated = await authenticateWithBiometrics(biometricLabel);
      if (!authenticated) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.refresh_token;
      if (!token) {
        Alert.alert('Error', 'Could not enable Face ID. Please try again.');
        return;
      }
      await enableBiometric(token);
      setBiometricEnabled(true);
    } else {
      await disableBiometric();
      setBiometricEnabled(false);
    }
  };

  const handleSwitchToClient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    switchMode();
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    logout();
  };

  const displayName = user?.businessName || user?.name || 'My Business';
  const firstName = displayName.split(' ')[0];
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.background, { backgroundColor: P.bg }]}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero */}
          <View style={styles.heroSection}>
            <View style={styles.heroLeft}>
              <View style={styles.heroTextBlock}>
                <Text style={[styles.heroSub, { color: P.sub }]}>Hello,</Text>
                <Text style={[styles.heroName, { color: P.text }]}>{firstName}.</Text>
                <View style={[styles.badge, { backgroundColor: P.iconBg }]}>
                  <Text style={[styles.badgeText, { color: P.accent }]}>Provider</Text>
                </View>
              </View>
              <View style={[styles.avatar, {
                backgroundColor: P.iconBg,
                borderColor: P.border,
              }]}>
                <Text style={[styles.avatarText, { color: P.accent }]}>{initials}</Text>
              </View>
            </View>
          </View>

          {/* Quick cards */}
          <View style={[styles.quickRow, { backgroundColor: P.surface, borderColor: P.border }]}>
            {[
              { icon: 'bar-chart',   label: 'Analytics',  sub: 'Revenue & Stats', onPress: () => navigation.navigate('Analytics') },
              { icon: 'local-offer', label: 'Promotions', sub: 'Offers & Deals',  onPress: () => navigation.navigate('Promotions') },
              { icon: 'people',      label: 'Clientele',  sub: 'Loyal Clients',   onPress: () => navigation.navigate('Clientele') },
            ].map(({ icon, label, sub, onPress }) => (
              <TouchableOpacity
                key={label}
                style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
                activeOpacity={0.7}
              >
                <Icon name={icon} size={24} color={P.accent} />
                <Text style={[styles.cardTitle, { color: P.text }]}>{label}</Text>
                <Text style={[styles.cardSub, { color: P.sub }]}>{sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* My Business */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>My Business</Text>
            <SettingsOption
              icon="storefront"
              title="Business Profile"
              subtitle="Profile, details & communications"
              onPress={() => navigation.navigate('BusinessProfile')}
              P={P}
            />
            <SettingsOption
              icon="bar-chart"
              title="Analytics"
              subtitle="Revenue, trends & insights"
              onPress={() => navigation.navigate('Analytics')}
              P={P}
            />
            <SettingsOption
              icon="local-offer"
              title="Promotions"
              subtitle="Offers & deals for clients"
              onPress={() => navigation.navigate('Promotions')}
              P={P}
            />
            <SettingsOption
              icon="people"
              title="My Clientele"
              subtitle="Repeat bookers & loyal clients"
              onPress={() => navigation.navigate('Clientele')}
              P={P}
            />
            <SettingsOption
              icon="calendar-today"
              title="Booking History"
              subtitle="View all past bookings"
              onPress={() => navigation.navigate('BookingHistory')}
              P={P}
            />
          </View>

          {/* Account */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Account</Text>
            <SettingsOption
              icon="lock"
              title="Change Password"
              subtitle="Update credentials"
              onPress={() => navigation.navigate('ChangePassword')}
              P={P}
            />
            <SettingsOption
              icon="badge"
              title="Account Info"
              subtitle="Name, phone, DOB & login email"
              onPress={() => navigation.navigate('AccountInfo')}
              P={P}
            />
            <SettingsOption
              icon="notifications"
              title="Notifications"
              subtitle="Bookings, messages, reminders"
              onPress={() => navigation.navigate('Notifications')}
              P={P}
            />
            {/* Dark mode toggle */}
            <View style={[styles.option, { backgroundColor: P.card, borderColor: P.border }]}>
              <View style={styles.optionLeft}>
                <Icon name="brightness-6" size={20} color={P.sub} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: P.text }]}>Dark Mode</Text>
                  <Text style={[styles.optionSubText, { color: P.sub }]}>Appearance</Text>
                </View>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={() => { Haptics.selectionAsync().catch(() => {}); toggleTheme(); }}
                trackColor={{ false: '#D1D1D6', true: P.accent }}
                thumbColor={isDarkMode ? '#fff' : '#f4f3f4'}
              />
            </View>
            {/* Face ID / Touch ID toggle */}
            <View style={[styles.option, { backgroundColor: P.card, borderColor: P.border }]}>
              <View style={styles.optionLeft}>
                <Icon name="shield-check" size={20} color={P.sub} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: P.text }]}>{biometricLabel}</Text>
                  <Text style={[styles.optionSubText, { color: P.sub }]}>
                    {biometricAvailable ? 'Quick sign-in' : 'Not available on this device'}
                  </Text>
                </View>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                disabled={!biometricAvailable}
                trackColor={{ false: '#D1D1D6', true: P.accent }}
                thumbColor={biometricEnabled ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Accessibility & Support */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>Accessibility & Support</Text>
            <SettingsOption
              icon="format-size"
              title="Text Size & Font"
              subtitle="Open phone display settings"
              onPress={() => Linking.openURL('App-prefs:root=ACCESSIBILITY')}
              P={P}
            />
            <SettingsOption
              icon="language"
              title="Language & Region"
              subtitle="Open phone language settings"
              onPress={() => Linking.openURL('App-prefs:root=General&path=LANGUAGE_AND_REGION')}
              P={P}
            />
            <SettingsOption
              icon="help"
              title="Help Centre"
              subtitle="FAQs, contact support"
              onPress={() => navigation.navigate('HelpCentre')}
              P={P}
            />
          </View>

          {/* For Clients */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>For Clients</Text>
            <TouchableOpacity
              style={[styles.modeBtn, {
                backgroundColor: P.iconBg,
                borderColor: P.accent,
              }]}
              onPress={handleSwitchToClient}
              activeOpacity={0.8}
            >
              <Icon name="swap-horiz" size={22} color={P.text} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.modeBtnTitle, { color: P.text }]}>
                  {user?.hasClientProfile ? 'Switch to Client Mode' : 'Create Client Account'}
                </Text>
                <Text style={[styles.modeBtnSub, { color: P.sub }]}>
                  {user?.hasClientProfile ? 'Browse Cerviced as a client' : 'Set up your client profile to browse'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* App Info & Legal */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.text }]}>App Info & Legal</Text>
            <SettingsOption
              icon="info"
              title="About Cerviced"
              subtitle="Mission, version"
              onPress={() => navigation.navigate('About')}
              P={P}
            />
            <SettingsOption
              icon="gavel"
              title="Terms & Conditions"
              subtitle="Legal info"
              onPress={() => navigation.navigate('Terms')}
              P={P}
            />
            <SettingsOption
              icon="bug-report"
              title="Report a Problem"
              subtitle="Bugs, feedback"
              onPress={() => navigation.navigate('ReportProblem')}
              P={P}
            />
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Icon name="logout" size={16} color="#fff" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>

          <Text style={[styles.footerText, { color: P.sub }]}>Cerviced v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>

      {/* ── Create Client Account modal ─────────────────────────────────── */}
      <Modal visible={showClientModal} transparent animationType="fade" onRequestClose={() => setShowClientModal(false)}>
        <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.modalTitle, { color: P.text }]}>Create Client Account</Text>
            <Text style={[styles.modalBody, { color: P.sub }]}>
              Would you like to use your existing details (name, email, phone)?{'\n\n'}
              Your client profile will be completely separate from your provider business.
            </Text>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: P.accent }]}
              onPress={() => {
                setShowClientModal(false);
                resetData();
                updateData({
                  accountType: 'user',
                  fromClientSwitch: true,
                  name: user?.name || '',
                  email: user?.email || '',
                  phone: user?.phone || '',
                });
                navigation.navigate('SignUpStep2');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Yes, use my details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBtnOutline, { borderColor: P.border }]}
              onPress={() => {
                setShowClientModal(false);
                resetData();
                navigation.navigate('SignUpStep1');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalBtnOutlineText, { color: P.text }]}>Create new account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowClientModal(false)} activeOpacity={0.6}>
              <Text style={[styles.modalCancelText, { color: P.sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>

    </View>
  );
}

// ── Styles (mirrors UserProfileScreen exactly) ───────────────────────────────

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  content: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Hero
  heroSection: {
    marginBottom: 20,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  heroTextBlock: { flex: 1, gap: 4 },
  heroSub: { fontSize: 14, fontWeight: '500', letterSpacing: 0.2 },
  heroName: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  // Quick cards
  quickRow: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 10,
    marginBottom: 20,
    borderWidth: 0.5,
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 0.5,
    gap: 4,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cardSub: { fontSize: 10, fontWeight: '400', textAlign: 'center' },

  // Section
  section: {
    marginBottom: 18,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 2,
    textTransform: 'uppercase',
    opacity: 0.55,
  },

  // Option row
  option: {
    padding: 13,
    borderRadius: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 0.5,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  optionText: { fontSize: 15, fontWeight: '600' },
  optionSubText: { fontSize: 12, fontWeight: '400', marginTop: 1 },

  // Mode switcher button
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  modeBtnTitle: { fontSize: 15, fontWeight: '700' },
  modeBtnSub: { fontSize: 12, fontWeight: '400' },

  // Logout
  logoutBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 100,
    backgroundColor: '#3A3A3C',
    gap: 8,
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  footerText: { fontSize: 11, fontWeight: '400', textAlign: 'center', marginTop: 24 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: {
    borderRadius: 24,
    borderWidth: 0.5,
    padding: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginBottom: 2 },
  modalBody: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  modalBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalBtnOutline: { borderRadius: 100, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  modalBtnOutlineText: { fontSize: 15, fontWeight: '600' },
  modalCancel: { paddingVertical: 10, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '500' },
});
