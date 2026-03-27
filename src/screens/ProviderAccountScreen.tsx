import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';

// ── Reusable row ────────────────────────────────────────────────────────────
interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  theme: any;
  destructive?: boolean;
}

const Row = React.memo(({ icon, title, subtitle, onPress, theme, destructive }: RowProps) => (
  <TouchableOpacity
    style={[styles.row, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.rowLeft}>
      <View style={[styles.iconBox, { backgroundColor: destructive ? '#FF3B3020' : theme.accent + '20' }]}>
        <Ionicons
          name={icon}
          size={22}
          color={destructive ? '#FF3B30' : theme.accent}
        />
      </View>
      <View>
        <Text style={[styles.rowTitle, { color: destructive ? '#FF3B30' : theme.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: theme.secondaryText }]}>{subtitle}</Text>
      </View>
    </View>
    {!destructive && (
      <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
    )}
  </TouchableOpacity>
));

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ProviderAccountScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme, theme } = useTheme();
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setChangingPassword(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    setChangingPassword(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Email Sent',
        `A password reset link has been sent to ${user.email}.`
      );
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="storefront" size={30} color={theme.accent} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {user?.businessName || user?.name || 'My Business'}
            </Text>
            <View style={[styles.badge, { backgroundColor: theme.accent + '20' }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>Provider Account</Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── My Business ── */}
          <Text style={[styles.sectionTitle, { color: theme.accent }]}>My Business</Text>

          <Row
            icon="person-circle-outline"
            title="Edit Profile"
            subtitle="Name, logo, about, services"
            onPress={() => navigation.navigate('EditProfile')}
            theme={theme}
          />
          <Row
            icon="cash-outline"
            title="Earnings & Payouts"
            subtitle="View revenue, set up payouts"
            onPress={() => Alert.alert('Coming Soon', 'Earnings dashboard is coming soon.')}
            theme={theme}
          />
          <Row
            icon="megaphone-outline"
            title="Promotions"
            subtitle="Create discounts for clients"
            onPress={() => Alert.alert('Coming Soon', 'Promotions management is coming soon.')}
            theme={theme}
          />

          {/* ── Account ── */}
          <Text style={[styles.sectionTitle, { color: theme.accent }]}>Account</Text>

          <Row
            icon="mail-outline"
            title="Email & Password"
            subtitle={user?.email ?? 'Update credentials'}
            onPress={handleChangePassword}
            theme={theme}
          />
          <Row
            icon="notifications-outline"
            title="Notifications"
            subtitle="Bookings, messages, reminders"
            onPress={() => navigation.navigate('Notifications')}
            theme={theme}
          />

          {/* Dark mode toggle */}
          <View style={[styles.row, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: theme.accent + '20' }]}>
                <Ionicons name="moon-outline" size={22} color={theme.accent} />
              </View>
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Dark Mode</Text>
                <Text style={[styles.rowSub, { color: theme.secondaryText }]}>Switch appearance</Text>
              </View>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              trackColor={{ false: '#D1D1D6', true: theme.accent }}
              thumbColor="#fff"
            />
          </View>

          {/* ── Support ── */}
          <Text style={[styles.sectionTitle, { color: theme.accent }]}>Support</Text>

          <Row
            icon="help-circle-outline"
            title="Help Center"
            subtitle="FAQs, contact support"
            onPress={() => Alert.alert('Help Center', 'Email us at support@cerviced.com')}
            theme={theme}
          />
          <Row
            icon="information-circle-outline"
            title="About Cerviced"
            subtitle="Version, legal"
            onPress={() => Alert.alert('About', 'Cerviced v1.0 — The beauty services platform.')}
            theme={theme}
          />

          {/* ── Log out ── */}
          <View style={styles.logoutSection}>
            <Row
              icon="log-out-outline"
              title="Log Out"
              subtitle=""
              onPress={handleLogout}
              theme={theme}
              destructive
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 4 },
  name: { fontSize: 18, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  logoutSection: { marginTop: 12 },
});
