import React, { useState, useEffect } from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Icon from '../components/IconLibrary';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useRegistration } from '../contexts/RegistrationContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricLabel,
  enableBiometric,
  disableBiometric,
  authenticateWithBiometrics,
} from '../services/biometricService';

// ── Settings row ────────────────────────────────────────────────────────────

interface SettingsOptionProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  palette: { card: string; border: string; accent: string; sub: string; text: string };
  danger?: boolean;
}

const SettingsOption = React.memo(({ icon, title, subtitle, onPress, palette: P, danger }: SettingsOptionProps) => (
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

// ── Main screen ─────────────────────────────────────────────────────────────

export default function UserProfileScreen({ navigation }: any) {
  const { isLoggedIn, logout, user, switchMode } = useAuth();
  const { isDarkMode, toggleTheme, theme: t, palette: P } = useTheme();
  const { resetData, updateData } = useRegistration();
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
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

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    logout();
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <ThemedBackground style={styles.background}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={t.statusBar} translucent />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Hero */}
          <View style={styles.heroSection}>
            <View style={styles.heroLeft}>
              <View style={styles.heroTextBlock}>
                <Text style={[styles.heroSub, { color: P.sub }]}>Hello,</Text>
                <Text style={[styles.heroName, { color: P.text }]}>{firstName || 'You'}.</Text>
              </View>
              <View style={[styles.avatar, { backgroundColor: P.iconBg, borderColor: P.border }]}>
                <Text style={[styles.avatarText, { color: P.accent }]}>{initials}</Text>
              </View>
            </View>
          </View>

          {/* Quick cards */}
          <View style={[styles.quickRow, { backgroundColor: P.surface, borderColor: P.border }]}>
            {[
              { icon: 'bookmark', label: 'Saved', sub: 'Your Favourites', onPress: () => navigation.navigate('BookmarkedProviders') },
              { icon: 'calendar-today', label: 'Bookings', sub: 'Appointments', onPress: () => navigation.navigate('Bookings') },
              { icon: 'star', label: 'Points', sub: 'Your Rewards', onPress: () => navigation.navigate('Points') },
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

          {/* Account Management */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.sub }]}>Account Management</Text>
            <SettingsOption icon="chat" title="Messages" subtitle="Chats with your providers" onPress={() => navigation.navigate('Messages')} palette={P} />
            <SettingsOption icon="user" title="Profile Info" subtitle="Name, phone" onPress={() => navigation.navigate('ProfileInfo')} palette={P} />
            <SettingsOption icon="heart" title="Beauty Profile" subtitle="Hair, skin, interests" onPress={() => navigation.navigate('BeautyProfile')} palette={P} />
            <SettingsOption icon="lock" title="Change Password" subtitle="Update credentials" onPress={() => navigation.navigate('ChangePassword')} palette={P} />
            <SettingsOption icon="payment" title="Payment Methods" subtitle="Cards, Apple Pay" onPress={() => navigation.navigate('PaymentMethods')} palette={P} />
            <SettingsOption icon="receipt" title="Subscription & Billing" subtitle="Plans, invoices" onPress={() => navigation.navigate('Subscription')} palette={P} />
          </View>

          {/* Notifications & Preferences */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.sub }]}>Preferences</Text>
            <SettingsOption icon="notifications" title="Notifications" subtitle="Bookings, reminders, marketing" onPress={() => navigation.navigate('NotificationsSettings')} palette={P} />
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
            <Text style={[styles.sectionTitle, { color: P.sub }]}>Accessibility & Support</Text>
            <SettingsOption
              icon="format-size"
              title="Text Size & Font"
              subtitle="Open phone display settings"
              onPress={() => Linking.openURL('App-prefs:root=ACCESSIBILITY')}
              palette={P}
            />
            <SettingsOption
              icon="language"
              title="Language & Region"
              subtitle="Open phone language settings"
              onPress={() => Linking.openURL('App-prefs:root=General&path=LANGUAGE_AND_REGION')}
              palette={P}
            />
            <SettingsOption icon="help" title="Help Centre" subtitle="FAQs, contact support" onPress={() => navigation.navigate('HelpCentre')} palette={P} />
          </View>

          {/* For Professionals */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.sub }]}>For Professionals</Text>
            {user?.accountType === 'provider' ? (
              <TouchableOpacity
                style={[styles.providerBtn, {
                  backgroundColor: P.iconBg,
                  borderColor: P.border,
                }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); switchMode(); }}
                activeOpacity={0.8}
              >
                <Icon name="swap-horiz" size={22} color={P.text} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.providerBtnTitle, { color: P.text }]}>Switch to Provider Mode</Text>
                  <Text style={[styles.providerBtnSub, { color: P.sub }]}>Go to your provider dashboard</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.providerBtn, {
                  backgroundColor: P.iconBg,
                  borderColor: P.border,
                }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  switchMode();
                }}
                activeOpacity={0.8}
              >
                <Icon name="storefront" size={22} color={P.text} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.providerBtnTitle, { color: P.text }]}>Become a Provider</Text>
                  <Text style={[styles.providerBtnSub, { color: P.sub }]}>List your services on Cerviced</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* App Info & Legal */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: P.sub }]}>App Info & Legal</Text>
            <SettingsOption icon="info" title="About Cerviced" subtitle="Mission, version" onPress={() => navigation.navigate('About')} palette={P} />
            <SettingsOption icon="gavel" title="Terms & Conditions" subtitle="Legal info" onPress={() => navigation.navigate('Terms')} palette={P} />
            <SettingsOption icon="bug-report" title="Report a Problem" subtitle="Bugs, feedback" onPress={() => navigation.navigate('ReportProblem')} palette={P} />
          </View>

          {isLoggedIn && (
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setShowLogoutModal(true); }}
              activeOpacity={0.7}
            >
              <Icon name="logout" size={16} color="#fff" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.footerText, { color: P.sub }]}>Cerviced v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>

      {/* ── Become a Provider modal ─────────────────────────────────────── */}
      <Modal visible={showProviderModal} transparent animationType="fade" onRequestClose={() => setShowProviderModal(false)}>
        <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={styles.modalOverlayCenter}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#252220' : '#FFFFFF', borderColor: P.border }]}>
            <Text style={[styles.modalTitle, { color: P.text }]}>Become a Provider</Text>
            <Text style={[styles.modalBody, { color: P.sub }]}>
              Would you like to use your existing account details (name, email, phone)?
            </Text>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: P.accent }]}
              onPress={() => {
                setShowProviderModal(false);
                resetData();
                updateData({ accountType: 'provider', fromProviderSwitch: true, name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
                navigation.navigate('SignUpStep3' as any);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Yes, use my details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBtnOutline, { borderColor: P.border }]}
              onPress={() => {
                setShowProviderModal(false);
                resetData();
                (navigation as any).getParent()?.getParent()?.navigate('SignUpStep1');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalBtnOutlineText, { color: P.text }]}>Create new account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowProviderModal(false)} activeOpacity={0.6}>
              <Text style={[styles.modalCancelText, { color: P.sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>

      {/* ── Log out confirmation modal ──────────────────────────────────── */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#252220' : '#FFFFFF', borderColor: P.border }]}>
            <Text style={[styles.modalTitle, { color: P.text }]}>Log Out</Text>
            <Text style={[styles.modalBody, { color: P.sub }]}>
              Are you sure you want to log out?
            </Text>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#c0392b' }]}
              onPress={() => { setShowLogoutModal(false); handleLogout(); }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Yes, log out</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowLogoutModal(false)} activeOpacity={0.6}>
              <Text style={[styles.modalCancelText, { color: P.sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Modal>
    </ThemedBackground>
  );
}

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
  heroTextBlock: { flex: 1 },
  heroSub: { fontSize: 14, fontWeight: '500', letterSpacing: 0.2, marginBottom: 2 },
  heroName: { fontSize: 40, fontFamily: 'BakbakOne-Regular', letterSpacing: -0.5 },

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
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'BakbakOne-Regular',
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

  // Provider button
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  providerBtnTitle: { fontSize: 15, fontWeight: '700' },
  providerBtnSub: { fontSize: 12, fontWeight: '400' },

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

  // Modals
  modalOverlayCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', padding: 16, paddingBottom: 32 },
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
  modalBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalBtnOutline: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalBtnOutlineText: { fontSize: 15, fontWeight: '600' },
  modalCancel: { paddingVertical: 10, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '500' },
});
