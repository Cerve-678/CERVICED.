import React, { useState, useCallback, useMemo } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Icon from '../../components/IconLibrary';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useAuth } from '../../contexts/AuthContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricLabel,
  enableBiometric,
  disableBiometric,
  authenticateWithBiometrics,
} from '../../services/biometricService';
import { getUnreadNotificationCount } from '../../services/databaseService';
import { OFFERS_ENABLED } from '../../constants/featureFlags';

// ─── Brand palette (unchanged — provider hat's real theme.ts values) ─────────
const LIGHT = {
  bg:        '#F5F1EC',
  surface:   '#EDE8E2',
  card:      '#FFFFFF',
  accent:    '#5C4033',
  ice:       '#FFFFFF',
  text:      '#000000',
  sub:       '#7E6667',
  border:    'rgba(126,102,103,0.14)',
  sep:       'rgba(126,102,103,0.08)',
  iconBg:    'rgba(92,64,51,0.12)',
  shadow:    'rgba(92,64,51,0.16)',
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
  shadow:    'rgba(0,0,0,0.30)',
};

// ── Simple settings row (My Business dropped — see MyBusinessCarousel below;
//    used by Account / Accessibility & Support / App Info & Legal) ──────────

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
    style={styles.row}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={styles.rowLeft}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={17} color={danger ? P.accent : P.sub} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? P.accent : P.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: P.sub }]}>{subtitle}</Text>
      </View>
    </View>
    <Icon name="chevron-right" size={14} color={P.sub} style={{ opacity: 0.4 }} />
  </TouchableOpacity>
));
SettingsOption.displayName = 'SettingsOption';

// ── My Business carousel card ───────────────────────────────────────────────

interface CarouselCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  P: typeof LIGHT;
}

const CarouselCard = React.memo(({ icon, title, subtitle, onPress, P }: CarouselCardProps) => (
  <TouchableOpacity
    style={[styles.carouselCard, { backgroundColor: P.card, borderColor: P.border }]}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    activeOpacity={0.7}
  >
    <View style={[styles.ccIcon, { backgroundColor: P.iconBg }]}>
      <Icon name={icon} size={16} color={P.accent} />
    </View>
    <Text style={[styles.ccTitle, { color: P.text }]} numberOfLines={1}>{title}</Text>
    <Text style={[styles.ccSub, { color: P.sub }]} numberOfLines={2}>{subtitle}</Text>
  </TouchableOpacity>
));
CarouselCard.displayName = 'CarouselCard';

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderAccountScreen({ navigation }: any) {
  const { user, logout, switchMode } = useAuth();
  const { resetData, updateData } = useRegistration();
  const { isDarkMode, toggleTheme } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');
  const [providerDisplayName, setProviderDisplayName] = useState<string | null>(null);
  // Unread notifications waiting in the *other* (client) hat, surfaced on the
  // switch control so a dual-role user never misses them while in provider mode.
  const [clientUnread, setClientUnread] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!user?.hasClientProfile) { setClientUnread(0); return; }
    getUnreadNotificationCount('client').then(setClientUnread).catch(() => {});
  }, [user?.hasClientProfile]));

  // useFocusEffect (not a mount-only useEffect) — this is a persistent tab
  // screen that never unmounts, so a one-time check could get permanently
  // stuck reporting "unavailable" if it happened to run before Face ID was
  // enrolled/ready. Re-checking on every focus makes it self-heal.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBiometricAvailable(available);
      if (!available) return;
      const [enabled, label] = await Promise.all([isBiometricEnabled(), getBiometricLabel()]);
      if (cancelled) return;
      setBiometricEnabled(enabled);
      setBiometricLabel(label);
    })();
    return () => { cancelled = true; };
  }, []));

  // Re-fetch the live public-profile name every time Settings is focused, so
  // edits made in Edit Profile (which write providers.display_name, not
  // users.business_name) show up here instead of the stale sign-up name.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let cancelled = false;
      supabase
        .from('providers')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setProviderDisplayName(data?.display_name ?? null);
        });
      return () => { cancelled = true; };
    }, [user?.id])
  );

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
    if (user?.hasClientProfile) {
      switchMode();
    } else {
      setShowClientModal(true);
    }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    logout();
  };

  const displayName = providerDisplayName || user?.businessName || user?.name || 'My Business';
  const initials = useMemo(
    () =>
      displayName
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    [displayName]
  );

  // Ring badge geometry — mirrors the mockup's SVG exactly: 40x40 viewBox,
  // r=16, strokeWidth=5, circumference 2*pi*16 ≈ 100.5, dashoffset 30 (~70%
  // arc). Kept per explicit user confirmation ("keep it") after the D/F/G
  // dominant-ring family was otherwise rejected — this is deliberately the
  // small demoted badge, not a hero element.
  const RING_SIZE = 40;
  const RING_RADIUS = 16;
  const RING_STROKE = 5;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  return (
    <View style={[styles.background, { backgroundColor: P.bg }]}>
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Hero card — the very FIRST thing seen (Concept E: Preview
              First). Leads with business identity rather than the client
              version's stat strip, since an invented "analysis" panel
              wouldn't correspond to anything real for a provider. A contained
              rounded card resting on the background (rounded bottom corners +
              side insets + lifted shadow) so it reads clearly as a hero, not
              a colour strip. Follows the active theme (dark card in dark mode,
              light card in light mode). Top stays square and bleeds up under
              the status bar (SafeAreaView excludes 'top'; panel adds
              insets.top) so it tucks under the notch cleanly. ───────────── */}
          <View style={[styles.previewShadow, { shadowColor: P.shadow }]}>
            <View
              style={[
                styles.previewPanel,
                {
                  paddingTop: insets.top + 22,
                  backgroundColor: isDarkMode ? '#16130F' : P.surface,
                },
              ]}
            >
            <View style={[styles.previewGlow1, { backgroundColor: P.accent, opacity: isDarkMode ? 0.16 : 0.10 }]} />
            <View style={[styles.previewGlow2, { backgroundColor: P.accent, opacity: isDarkMode ? 0.08 : 0.06 }]} />
            <View style={styles.previewTop}>
              <View style={[styles.previewBadge, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : P.iconBg }]}>
                <Text style={[styles.previewBadgeText, { color: isDarkMode ? '#FFFFFF' : P.accent }]}>PROVIDER</Text>
              </View>
              <View style={[styles.previewAvatar, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : P.iconBg }]}>
                <Text style={[styles.previewAvatarText, { color: isDarkMode ? '#FFFFFF' : P.accent }]}>{initials}</Text>
              </View>
            </View>
            <Text
              style={[styles.previewTitle, { color: P.text }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {displayName}
            </Text>
            <Text style={[styles.previewSub, { color: P.sub }]}>
              Your business, bookings and how Cerviced looks &amp; feels — all in one place.
            </Text>
            <View style={styles.previewStats}>
              <TouchableOpacity
                style={[styles.previewStat, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : P.card }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Analytics'); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.previewStatNum, { color: P.text }]}>Analytics</Text>
                <Text style={[styles.previewStatLbl, { color: P.sub }]}>Revenue &amp; Stats</Text>
              </TouchableOpacity>
              {OFFERS_ENABLED && (
                <TouchableOpacity
                  style={[styles.previewStat, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : P.card }]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Promotions'); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.previewStatNum, { color: P.text }]}>Promotions</Text>
                  <Text style={[styles.previewStatLbl, { color: P.sub }]}>Offers &amp; Deals</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.previewStat, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.07)' : P.card }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Clientele'); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.previewStatNum, { color: P.text }]}>Clientele</Text>
                <Text style={[styles.previewStatLbl, { color: P.sub }]}>Loyal Clients</Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>

          <View style={styles.body}>

            {/* ── Small persistent ring badge — demoted, NOT a hero. Kept per
                explicit confirmation; sized/positioned to match the mockup. ── */}
            <TouchableOpacity
              style={[styles.ringInline, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('BusinessProfile'); }}
              activeOpacity={0.7}
            >
              <View style={styles.ringBadge}>
                <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                  <SvgCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={P.iconBg}
                    strokeWidth={RING_STROKE}
                  />
                  <SvgCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={P.accent}
                    strokeWidth={RING_STROKE}
                    strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                    strokeDashoffset={RING_CIRC * 0.3}
                    strokeLinecap="round"
                    rotation={-90}
                    originX={RING_SIZE / 2}
                    originY={RING_SIZE / 2}
                  />
                </Svg>
                <Text style={[styles.ringBadgeText, { color: P.accent }]}>{initials}</Text>
              </View>
              <View style={styles.ringInlineText}>
                <Text style={[styles.ringInlineTitle, { color: P.text }]}>Business Profile</Text>
                <Text style={[styles.ringInlineSub, { color: P.sub }]}>Profile, details &amp; communications</Text>
              </View>
              <Icon name="chevron-right" size={14} color={P.sub} style={{ opacity: 0.35 }} />
            </TouchableOpacity>

            {/* ── My Business: horizontal card carousel, replacing a vertical
                list — matches Concept E's mechanism exactly. ────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: P.sub }]}>MY BUSINESS</Text>
              <View style={styles.carousel}>
                <CarouselCard key="schedule" icon="calendar-today" title="Schedule" subtitle="Set your hours & block dates" onPress={() => navigation.navigate('ProviderSchedule')} P={P} />
                <CarouselCard key="inbox" icon="email" title="Inbox" subtitle="Messages with your clients" onPress={() => navigation.navigate('ProviderInbox')} P={P} />
                <CarouselCard key="booking-history" icon="stack" title="Booking History" subtitle="View past bookings" onPress={() => navigation.navigate('BookingHistory')} P={P} />
              </View>
            </View>

            {/* ── Account: twin toggle cards + plain rows ────────────────── */}
            <View style={styles.twinRow}>
              <View style={[styles.twinCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}>
                <View style={styles.twinLeft}>
                  <View style={[styles.twinIcon, { backgroundColor: P.iconBg }]}>
                    <Icon name="brightness-6" size={14} color={P.accent} />
                  </View>
                  <Text style={[styles.twinTitle, { color: P.text }]}>Dark Mode</Text>
                </View>
                <Switch
                  value={isDarkMode}
                  onValueChange={() => { Haptics.selectionAsync().catch(() => {}); toggleTheme(); }}
                  trackColor={{ false: '#D1D1D6', true: P.accent }}
                  thumbColor={isDarkMode ? '#fff' : '#f4f3f4'}
                />
              </View>
              <View style={[styles.twinCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}>
                <View style={styles.twinLeft}>
                  <View style={[styles.twinIcon, { backgroundColor: P.iconBg }]}>
                    <Icon name="shield-check" size={14} color={P.accent} />
                  </View>
                  <Text style={[styles.twinTitle, { color: P.text }]}>{biometricLabel}</Text>
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

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: P.sub }]}>ACCOUNT</Text>
              <SettingsOption icon="lock" title="Change Password" subtitle="Update credentials" onPress={() => navigation.navigate('ChangePassword')} P={P} />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption icon="badge" title="Account Info" subtitle="Name, phone, DOB & login email" onPress={() => navigation.navigate('AccountInfo')} P={P} />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption icon="notifications" title="Notifications" subtitle="Bookings, messages, reminders" onPress={() => navigation.navigate('Notifications')} P={P} />
            </View>

            {/* ── Accessibility & Support ─────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: P.sub }]}>ACCESSIBILITY & SUPPORT</Text>
              <SettingsOption
                icon="format-size"
                title="Text Size & Font"
                subtitle="Open phone display settings"
                onPress={() => Linking.openURL('App-prefs:root=ACCESSIBILITY')}
                P={P}
              />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption
                icon="language"
                title="Language & Region"
                subtitle="Open phone language settings"
                onPress={() => Linking.openURL('App-prefs:root=General&path=LANGUAGE_AND_REGION')}
                P={P}
              />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption icon="help" title="Help Centre" subtitle="FAQs, contact support" onPress={() => navigation.navigate('HelpCentre')} P={P} />
            </View>

            {/* ── For Clients: contained accent-filled card, in its usual
                position — not merged into the opening panel. ───────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: P.sub }]}>FOR CLIENTS</Text>
              <TouchableOpacity
                style={[styles.providerCard, { backgroundColor: P.accent, shadowColor: P.shadow }]}
                onPress={handleSwitchToClient}
                activeOpacity={0.85}
              >
                <View style={styles.providerCardIcon}>
                  <Icon name="swap-horiz" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerCardTitle}>
                    {user?.hasClientProfile ? 'Switch to Client Mode' : 'Create Client Account'}
                  </Text>
                  <Text style={styles.providerCardSub}>
                    {user?.hasClientProfile ? 'Browse Cerviced as a client' : 'Set up your client profile to browse'}
                  </Text>
                </View>
                {clientUnread > 0 && (
                  <View style={styles.providerCardBadge}>
                    <Text style={styles.providerCardBadgeText}>{clientUnread > 99 ? '99+' : clientUnread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ── App Info & Legal ────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: P.sub }]}>APP INFO & LEGAL</Text>
              <SettingsOption icon="info" title="About Cerviced" subtitle="Mission, version" onPress={() => navigation.navigate('About')} P={P} />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption icon="gavel" title="Terms & Conditions" subtitle="Legal info" onPress={() => navigation.navigate('Terms')} P={P} />
              <View style={[styles.sep, { backgroundColor: P.sep }]} />
              <SettingsOption icon="bug-report" title="Report a Problem" subtitle="Bugs, feedback" onPress={() => navigation.navigate('ReportProblem')} P={P} />
            </View>

            <TouchableOpacity
              style={[styles.logoutBtn, { borderColor: P.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setShowLogoutModal(true); }}
              activeOpacity={0.7}
            >
              <Icon name="logout" size={14} color={P.text} />
              <Text style={[styles.logoutText, { color: P.text }]}>Log Out</Text>
            </TouchableOpacity>

            <Text style={[styles.footerText, { color: P.sub }]}>Cerviced v1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Create Client Account modal (unchanged) ─────────────────────── */}
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

      {/* ── Log out confirmation modal (unchanged) ──────────────────────── */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <BlurView intensity={60} tint={isDarkMode ? 'dark' : 'light'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: P.card, borderColor: P.border }]}>
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

    </View>
  );
}

// ── Styles — translated directly from Concept E-Provider's mockup CSS ───────
// (see settings_redesign_v2.html, .ep-* classes). Values below are the
// mockup's px/opacity/radius numbers as-is, with CSS box-shadow converted to
// RN shadowColor/shadowOffset/shadowOpacity/shadowRadius+elevation.

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1 },
  content: { flex: 1 },
  // 40 of base padding + clearance for the floating IslandPillTabBar pill,
  // which overlays screen content rather than docking/reserving space for
  // itself — without this, the logout button/footer text sit behind it at
  // the bottom of the scroll.
  scrollContent: { paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE },

  // ---- Hero card (.ep-preview-panel) ----
  // Full-width hero with rounded bottom corners + a heavy lifted shadow so it
  // reads as a distinct hero, not a colour strip. The top bleeds up under the
  // status bar (square top corners + inline paddingTop of insets.top) so it
  // tucks under the notch cleanly rather than floating a rounded top edge into
  // the safe area.
  //
  // Two layers on purpose: previewShadow carries the shadow (can't be clipped
  // or it wouldn't render), previewPanel carries overflow:hidden so the
  // accent glows are clipped to the rounded corners.
  previewShadow: {
    marginBottom: 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 12,
  },
  previewPanel: {
    position: 'relative',
    minHeight: 250,
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 18,
    paddingBottom: 24,
    display: 'flex',
    flexDirection: 'column',
  },
  // .ep-preview-glow1: top -60px left -40px, 220x220, radius 110, accent radial @ 0.4 opacity.
  // RN has no radial-gradient primitive without an extra dependency (expo-linear-gradient
  // only does linear) — approximated as a large soft-edged translucent circle instead of a
  // true radial falloff. Flagged explicitly below in the report as the one place the mockup's
  // CSS didn't translate 1:1. Color/opacity now supplied inline per-theme.
  previewGlow1: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  previewGlow2: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // .ep-preview-badge: padding 5px 12px, radius 100, bg rgba(255,255,255,0.10).
  previewBadge: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  // .ep-preview-avatar: 32x32, radius 12, bg rgba(255,255,255,0.12).
  previewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarText: { fontSize: 10, fontWeight: '800' },
  // .ep-preview-title: font-size 26, line-height 1.08*26≈28, margin 20px 0 6px.
  previewTitle: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 28,
    marginTop: 20,
    marginBottom: 6,
  },
  // .ep-preview-sub: font-size 12.5, max-width 260, line-height 1.4*12.5≈18.
  previewSub: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 18,
    maxWidth: 260,
  },
  previewStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 'auto',
  },
  // .ep-preview-stat: flex 1, bg rgba(255,255,255,0.07), radius 14, padding 10px 8px, center.
  previewStat: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  previewStatNum: { fontSize: 15, fontWeight: '800', lineHeight: 17 },
  previewStatLbl: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 3,
    textAlign: 'center',
  },

  // ---- Body (.ep-body: padding 20px 16px 0) ----
  body: { paddingTop: 20, paddingHorizontal: 16 },

  section: { marginBottom: 20 },
  // .ep-section-label: font-size 11, letter-spacing 1.2, opacity 0.75.
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.75,
    marginBottom: 10,
    marginLeft: 2,
  },

  // ---- Horizontal card carousel (.ep-carousel / .ep-carousel-card) ----
  // CSS carousel: gap 10px, margin 0 -16px, padding-left/right 16px (bleeds to
  // the screen edge). card: width 130, radius 18, border 0.5px, padding 14,
  // shadow 0 8px 20px var(--pv-shadow).
  carousel: {
    flexDirection: 'row',
    gap: 10,
  },
  carouselCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 0.5,
    padding: 14,
    gap: 8,
  },
  // .ep-cc-icon: 32x32, radius 11.
  ccIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ccTitle: { fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
  ccSub: { fontSize: 10, lineHeight: 13 },

  // ---- Small persistent ring badge (.ep-ring-inline / .ep-ring-badge) ----
  // CSS: padding 10px 14px, radius 16, border 0.5px, shadow 0 6px 16px, margin-bottom 20.
  ringInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 3,
  },
  // .ep-ring-badge: 40x40, initials text centered on top of the SVG ring.
  ringBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBadgeText: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '800',
  },
  ringInlineText: { flex: 1, minWidth: 0 },
  ringInlineTitle: { fontSize: 12.5, fontWeight: '700' },
  ringInlineSub: { fontSize: 10.5, marginTop: 1 },

  // ---- Twin toggle cards (.ep-twinrow / .ep-twincard) ----
  // CSS: gap 10, margin-bottom 20; card: flex 1, radius 16, padding 12, border 0.5px, shadow 0 6px 16px.
  twinRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  twinCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 3,
  },
  twinLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1, minWidth: 0 },
  // .ep-twin-icon: 28x28, radius 10.
  twinIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twinTitle: { fontSize: 11.5, fontWeight: '700' },

  // ---- Plain quiet rows (.ep-row) ----
  // CSS: padding 11px 4px.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  rowIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSub: { fontSize: 10.5, marginTop: 1 },
  sep: { height: 1 },

  // ---- For Clients contained accent card (.ep-provider-card) ----
  // CSS: radius 20, padding 16, shadow 0 10px 24px.
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
  },
  // .ep-provider-card .ep-row-icon: bg rgba(255,255,255,0.16), 34x34, radius 12.
  providerCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCardTitle: { fontSize: 13.5, fontWeight: '600', color: '#FFFFFF' },
  providerCardSub: { fontSize: 10.5, marginTop: 1, color: 'rgba(255,255,255,0.72)' },
  // .ep-provider-badge: 22x22 min, radius 11, bg #FF1744.
  providerCardBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF1744',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  providerCardBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  // ---- Logout (.ep-logout) ----
  // CSS: padding 10px 22px, radius 100, border 1.5px.
  logoutBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 12.5, fontWeight: '600' },
  footerText: { fontSize: 10, fontWeight: '400', textAlign: 'center', marginTop: 14, opacity: 0.6 },

  // ---- Modal (unchanged) ----
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
