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
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';
import { ThemedBackground } from './ThemedBackground';
import Icon from './IconLibrary';
import { toUserMessage } from '../utils/userFacingError';
import { reportError } from '../utils/logger';

export interface NotificationPreferenceRow<T> {
  key: keyof T & string;
  icon: string;
  title: string;
  subtitle: string;
}

export interface NotificationPreferenceSection<T> {
  title: string;
  rows: NotificationPreferenceRow<T>[];
}

/** A row shown with no switch, for notifications that always send. */
export interface AlwaysOnRow {
  icon: string;
  title: string;
  subtitle: string;
}

interface Props<T extends { [K in keyof T]: boolean }> {
  navigation: { goBack: () => void };
  /** Where this screen's switch positions start before the load resolves.
   *  Never shown: the rows wait for a successful load. */
  initial: T;
  load: () => Promise<T>;
  save: (prefs: T) => Promise<void>;
  sections: NotificationPreferenceSection<T>[];
  alwaysOn?: { title: string; note: string; rows: AlwaysOnRow[] } | undefined;
  /** Prefix for dev logs, e.g. '[NotificationsSettings]'. */
  logTag: string;
}

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
      <View style={{ flex: 1 }}>
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

/**
 * The notification-settings screen body shared by both hats. Each hat passes
 * its own rows and its own load/save, since each writes only its own keys.
 */
export default function NotificationPreferencesView<T extends { [K in keyof T]: boolean }>({
  navigation, initial, load: loadPrefs, save, sections, alwaysOn, logTag,
}: Props<T>) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();

  // These preferences are read live by the send-push-notification edge
  // function, so the screen lying in either direction has real consequences:
  // showing the hardcoded defaults after a failed load tells someone their
  // choices are something they aren't, and saying "saved" after a failed write
  // tells them they've opted out of a notification they're still going to get.
  // Both paths therefore have to be able to say "we don't know" / "that didn't
  // save" rather than falling through to the happy-path copy.
  const [prefs, setPrefs] = useState<T>(initial);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Debounce: save 800ms after the last toggle
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefs = useRef<T | null>(null);
  const mounted = useRef(true);

  const load = useCallback(() => {
    setLoadState('loading');
    setLoadError(null);
    loadPrefs()
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
            `${logTag} load failed`,
          ),
        );
        setLoadState('error');
      });
  }, [loadPrefs, logTag]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // A quick back gesture should not discard the user's last toggle. There's
      // no UI left to tell about a failure here, so at minimum it's logged.
      if (pendingPrefs.current) {
        void save(pendingPrefs.current).catch(err =>
          reportError(err, `${logTag} flush-on-unmount save failed`),
        );
      }
    };
  }, [load, save, logTag]);

  const persist = useCallback((next: T) => {
    setSaving(true);
    setSaveError(null);
    save(next)
      .then(() => {
        if (pendingPrefs.current === next) pendingPrefs.current = null;
        if (mounted.current) setSaveError(null);
      })
      .catch(err => {
        // The toggle keeps the user's intended position — retrying is what
        // reconciles it — but the footer must stop claiming it's saved.
        if (!mounted.current) {
          reportError(err, `${logTag} save failed`);
          return;
        }
        setSaveError(
          toUserMessage(
            err,
            "We couldn't save that change.",
            `${logTag} save failed`,
          ),
        );
      })
      .finally(() => { if (mounted.current) setSaving(false); });
  }, [save, logTag]);

  const toggle = useCallback((key: keyof T) => {
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
      <StatusBar barStyle={theme.statusBar} />
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
            {alwaysOn && (
              <>
                <Text style={[styles.section, { color: P.accentText }]}>{alwaysOn.title}</Text>
                {alwaysOn.rows.map(row => (
                  <View key={row.title} style={[styles.row, { backgroundColor: P.card, borderColor: P.border }]}>
                    <View style={styles.rowLeft}>
                      <Icon name={row.icon} size={20} color={P.accentText} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: P.text }]}>{row.title}</Text>
                        <Text style={[styles.rowSub, { color: P.sub }]}>{row.subtitle}</Text>
                      </View>
                    </View>
                    <Text style={[styles.alwaysOn, { color: P.sub }]}>Always on</Text>
                  </View>
                ))}
                <Text style={[styles.sectionNote, { color: P.sub }]}>{alwaysOn.note}</Text>
              </>
            )}

            {sections.map(section => (
              <React.Fragment key={section.title}>
                <Text style={[styles.section, { color: P.accentText }]}>{section.title}</Text>
                {section.rows.map(row => (
                  <ToggleRow
                    key={row.key}
                    icon={row.icon}
                    title={row.title}
                    subtitle={row.subtitle}
                    value={prefs[row.key]}
                    onToggle={() => toggle(row.key)}
                    palette={P}
                  />
                ))}
              </React.Fragment>
            ))}

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
  sectionNote: { fontSize: 11, lineHeight: 16, marginTop: -2, marginBottom: 18, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 2 },
  alwaysOn: { fontSize: 11, fontWeight: '600' },
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
