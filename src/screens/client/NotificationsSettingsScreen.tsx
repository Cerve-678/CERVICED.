import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
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
import { toUserMessage } from '../../utils/userFacingError';
import { reportError } from '../../utils/logger';

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

  // These preferences are read live by the send-push-notification edge
  // function, so the screen lying in either direction has real consequences:
  // showing the hardcoded defaults after a failed load tells someone their
  // choices are something they aren't, and saying "saved" after a failed write
  // tells them they've opted out of a notification they're still going to get.
  // Both paths therefore have to be able to say "we don't know" / "that didn't
  // save" rather than falling through to the happy-path copy.
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    bookingConfirm: true,
    bookingReminder: true,
    bookingUpdates: true,
    promotions: false,
    newProviders: true,
    weeklySummary: false,
  });
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Debounce: save 800ms after the last toggle
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefs = useRef<NotificationPreferences | null>(null);
  const mounted = useRef(true);

  const load = useCallback(() => {
    setLoadState('loading');
    setLoadError(null);
    getNotificationPreferences()
      .then(value => {
        if (!mounted.current) return;
        if (!pendingPrefs.current) setPrefs(value);
        setLoadState('ready');
      })
      .catch(err => {
        if (!mounted.current) return;
        setLoadError(
          toUserMessage(
            err,
            "We couldn't load your notification settings.",
            '[NotificationsSettings] load failed',
          ),
        );
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // A quick back gesture should not discard the user's last toggle. There's
      // no UI left to tell about a failure here, so at minimum it's logged.
      if (pendingPrefs.current) {
        void saveNotificationPreferences(pendingPrefs.current).catch(err =>
          reportError(err, '[NotificationsSettings] flush-on-unmount save failed'),
        );
      }
    };
  }, [load]);

  const persist = useCallback((next: NotificationPreferences) => {
    setSaving(true);
    setSaveError(null);
    saveNotificationPreferences(next)
      .then(() => {
        if (pendingPrefs.current === next) pendingPrefs.current = null;
        if (mounted.current) setSaveError(null);
      })
      .catch(err => {
        // The toggle keeps the user's intended position — retrying is what
        // reconciles it — but the footer must stop claiming it's saved.
        if (!mounted.current) {
          reportError(err, '[NotificationsSettings] save failed');
          return;
        }
        setSaveError(
          toUserMessage(
            err,
            "We couldn't save that change.",
            '[NotificationsSettings] save failed',
          ),
        );
      })
      .finally(() => { if (mounted.current) setSaving(false); });
  }, []);

  const toggle = useCallback((key: keyof NotificationPreferences) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      pendingPrefs.current = next;
      // Debounced save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 800);
      return next;
    });
  }, [persist]);

  const retrySave = useCallback(() => {
    const next = pendingPrefs.current ?? prefs;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persist(next);
  }, [persist, prefs]);

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

        {loadState === 'loading' && (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={P.accent} />
          </View>
        )}

        {/* A failed load must never fall through to the toggles: the switch
            positions would be this screen's hardcoded defaults, and the user
            would read them as their own saved choices. */}
        {loadState === 'error' && (
          <View style={[styles.stateBlock, styles.errorBlock, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.errorTitle, { color: P.text }]}>Settings unavailable</Text>
            <Text style={[styles.errorBody, { color: P.sub }]}>
              {loadError} We haven't changed anything — your existing preferences are still in place.
            </Text>
            <TouchableOpacity
              onPress={load}
              activeOpacity={0.7}
              style={[styles.retryBtn, { borderColor: P.border }]}
            >
              <Text style={[styles.retryBtnText, { color: P.accentText }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'ready' && (
          <>
            <Text style={[styles.section, { color: P.accentText }]}>BOOKINGS</Text>
            <ToggleRow icon="event-available" title="Booking Confirmed"   subtitle="Instant confirmation alerts"    value={prefs.bookingConfirm}  onToggle={() => toggle('bookingConfirm')}  palette={P} />
            <ToggleRow icon="alarm"           title="Appointment Reminders" subtitle="24h and 1h before"            value={prefs.bookingReminder} onToggle={() => toggle('bookingReminder')} palette={P} />
            <ToggleRow icon="update"          title="Booking Updates"     subtitle="Changes, cancellations"          value={prefs.bookingUpdates}  onToggle={() => toggle('bookingUpdates')}  palette={P} />

            <Text style={[styles.section, { color: P.accentText }]}>DISCOVER</Text>
            <ToggleRow icon="local-offer"  title="Offers & Promotions" subtitle="Deals from your saved providers" value={prefs.promotions}    onToggle={() => toggle('promotions')}    palette={P} />
            <ToggleRow icon="person-add"   title="New Providers"       subtitle="Professionals near you"          value={prefs.newProviders}  onToggle={() => toggle('newProviders')}  palette={P} />
            <ToggleRow icon="bar-chart"    title="Weekly Summary"      subtitle="Your beauty activity recap"      value={prefs.weeklySummary} onToggle={() => toggle('weeklySummary')} palette={P} />

            {saveError ? (
              <View style={styles.saveFailed}>
                <Text style={[styles.saveFailedText, { color: P.text }]}>
                  {saveError} Your last change hasn't been applied yet.
                </Text>
                <TouchableOpacity onPress={retrySave} activeOpacity={0.7}>
                  <Text style={[styles.saveRetryText, { color: P.accentText }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[styles.note, { color: P.sub }]}>
                {saving ? 'Saving…' : 'Preferences saved automatically.'}
              </Text>
            )}
          </>
        )}
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
  stateBlock: { marginTop: 24, alignItems: 'center' },
  errorBlock: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 18,
  },
  errorTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  errorBody: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600' },
  saveFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 24,
  },
  saveFailedText: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  saveRetryText: { fontSize: 13, fontWeight: '700' },
});
