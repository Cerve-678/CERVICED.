import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import { ThemedBackground } from '../../components/ThemedBackground';
import Icon from '../../components/IconLibrary';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../../services/databaseService';

interface ToggleRowProps {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  palette: AppTheme;
}

const ToggleRow = ({ icon, title, subtitle, value, onToggle, palette: P }: ToggleRowProps) => (
  <View style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
    <View style={styles.rowLeft}>
      <Icon name={icon} size={20} color={P.accentText} style={{ marginRight: 12 }} />
      <View>
        <Text style={[styles.rowTitle, { color: P.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: P.sub }]}>{subtitle}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={() => { Haptics.selectionAsync().catch(() => {}); onToggle(); }}
      trackColor={{ false: '#D1D1D6', true: P.accent }}
      thumbColor={value ? '#fff' : '#f4f3f4'}
    />
  </View>
);

export default function NotificationsSettingsScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<NotificationPreferences>({
    bookingConfirm: true,
    bookingReminder: true,
    bookingUpdates: true,
    promotions: false,
    newProviders: true,
    weeklySummary: false,
  });
  const [saving, setSaving] = useState(false);
  // Debounce: save 800ms after the last toggle
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefs = useRef<NotificationPreferences | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getNotificationPreferences()
      .then(value => {
        if (mounted.current && !pendingPrefs.current) setPrefs(value);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // A quick back gesture should not discard the user's last toggle.
      if (pendingPrefs.current) {
        void saveNotificationPreferences(pendingPrefs.current).catch(() => {});
      }
    };
  }, []);

  const toggle = useCallback((key: keyof NotificationPreferences) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      pendingPrefs.current = next;
      // Debounced save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaving(true);
        saveNotificationPreferences(next)
          .then(() => {
            if (pendingPrefs.current === next) pendingPrefs.current = null;
          })
          .catch(() => {})
          .finally(() => { if (mounted.current) setSaving(false); });
      }, 800);
      return next;
    });
  }, []);

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>Notifications</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          Choose what you hear from us
        </Text>

        <Text style={[styles.section, { color: P.accentText }]}>BOOKINGS</Text>
        <ToggleRow icon="event-available" title="Booking Confirmed"   subtitle="Instant confirmation alerts"    value={prefs.bookingConfirm}  onToggle={() => toggle('bookingConfirm')}  palette={P} />
        <ToggleRow icon="alarm"           title="Appointment Reminders" subtitle="24h and 1h before"            value={prefs.bookingReminder} onToggle={() => toggle('bookingReminder')} palette={P} />
        <ToggleRow icon="update"          title="Booking Updates"     subtitle="Changes, cancellations"          value={prefs.bookingUpdates}  onToggle={() => toggle('bookingUpdates')}  palette={P} />

        <Text style={[styles.section, { color: P.accentText }]}>DISCOVER</Text>
        <ToggleRow icon="local-offer"  title="Offers & Promotions" subtitle="Deals from your saved providers" value={prefs.promotions}    onToggle={() => toggle('promotions')}    palette={P} />
        <ToggleRow icon="person-add"   title="New Providers"       subtitle="Professionals near you"          value={prefs.newProviders}  onToggle={() => toggle('newProviders')}  palette={P} />
        <ToggleRow icon="bar-chart"    title="Weekly Summary"      subtitle="Your beauty activity recap"      value={prefs.weeklySummary} onToggle={() => toggle('weeklySummary')} palette={P} />

        <Text style={[styles.note, { color: P.sub }]}>
          {saving ? 'Saving…' : 'Preferences saved automatically.'}
        </Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  section: { fontSize: 12, letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 2 },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    textAlign: 'center',
  },
});
