/**
 * Home for a link-only provider (booking_mode 'external') — a professional
 * who takes bookings on their own page (Fresha, Treatwell, Acuity…) and uses
 * CERVICED to be found. There's no booking calendar here, because CERVICED
 * doesn't hold their bookings. Instead:
 *
 *  - the go-live checklist: the four things the server publishes them on
 *    (logo, About, opening hours, a portfolio photo) — see goLiveStatus.ts
 *  - their diary, read from the phone's own calendar (DiaryCard)
 *  - Analytics and Portfolio tiles
 *  - Becca and Announcements (to the clients who saved them)
 *
 * Product rules: docs/vault/Link-Only Providers.md.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProviderProfile } from '../../services/databaseService';
import {
  buildLinkOnlyGoLiveSteps,
  fetchLinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStatus,
  type LinkOnlyGoLiveStepKey,
} from '../../features/providers/goLiveStatus';
import { DiaryCard } from '../../features/providers/DiaryCard';
import { LinkOnlyAnnouncementSheet } from '../../features/providers/LinkOnlyAnnouncementSheet';
import { logger } from '../../utils/logger';
import type { ProviderHomeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProviderHomeStackParamList, 'LinkOnlyHomeMain'>;

export default function LinkOnlyHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { showAlert, DialogHost } = useAppDialog();
  const P = useMemo(
    () => ({
      bg: palette.bg,
      card: palette.card,
      surface: palette.surface,
      text: palette.text,
      sub: palette.sub,
      border: palette.border,
      accent: palette.accent,
      onAccent: palette.onAccent,
      accentDim: palette.accentDim,
    }),
    [palette],
  );
  const styles = useMemo(() => createStyles(P), [P]);

  const [name, setName] = useState<string>(user?.businessName ?? '');
  const [status, setStatus] = useState<LinkOnlyGoLiveStatus | null>(null);
  const [hasRow, setHasRow] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  // Bumped on every open so the sheet remounts empty.
  const [announcementKey, setAnnouncementKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profile = await getMyProviderProfile();
          if (!active) return;
          setHasRow(!!profile);
          if (!profile) return;
          setName(profile.display_name);
          const next = await fetchLinkOnlyGoLiveStatus(profile);
          if (active) { setStatus(next); setLoadFailed(false); }
        } catch (error) {
          logger.error('[LinkOnlyHome] load failed', error);
          if (active) setLoadFailed(true);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  const steps = status ? buildLinkOnlyGoLiveSteps(status) : [];
  const doneCount = steps.filter(step => step.done).length;

  const goToStep = useCallback(
    (key: LinkOnlyGoLiveStepKey) => {
      Haptics.selectionAsync().catch(() => {});
      if (key === 'hours') { navigation.navigate('ProviderSchedule'); return; }
      if (key === 'portfolio') {
        navigation.getParent()?.navigate('LinkOnlyPortfolio', { screen: 'LinkOnlyPortfolioMain' });
        return;
      }
      // Logo and About both live on the profile editor's first pages.
      navigation.navigate('EditProfile');
    },
    [navigation],
  );

  const live = status?.isLive ?? false;

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.welcome}>Welcome,</Text>
              <Text style={styles.name} numberOfLines={1}>{name || 'your business'}</Text>
            </View>
            {status && (
              <View style={styles.livePill}>
                <View style={[styles.liveDot, { backgroundColor: live ? '#3D8B5A' : '#B07A3C' }]} />
                <Text style={styles.liveText}>{live ? 'Live' : 'Not live yet'}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('Notifications'); }}
              style={styles.iconButton}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
            >
              <Ionicons name="notifications-outline" size={18} color={P.sub} />
            </TouchableOpacity>
          </View>

          {hasRow === null && !loadFailed && <ActivityIndicator color={P.accent} style={styles.loader} />}

          {loadFailed && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Couldn't load your profile</Text>
              <Text style={styles.body}>Check your connection and pull back to this screen to try again.</Text>
            </View>
          )}

          {hasRow === false && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Set up your profile</Text>
              <Text style={styles.body}>
                Add your logo, a few lines about you, your booking link and some photos of your work — then clients can find you and book on your page.
              </Text>
              <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.85}>
                <Text style={styles.primaryText}>Get started</Text>
              </TouchableOpacity>
            </View>
          )}

          {status && !live && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Go live in {steps.length} steps</Text>
                <Text style={styles.count}>{doneCount} of {steps.length}</Text>
              </View>
              <View style={styles.progress}>
                {steps.map(step => (
                  <View key={step.key} style={[styles.progressBar, { backgroundColor: step.done ? P.accent : P.accentDim }]} />
                ))}
              </View>
              {steps.map(step => (
                <TouchableOpacity
                  key={step.key}
                  style={styles.stepRow}
                  onPress={() => goToStep(step.key)}
                  disabled={step.done}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ checked: step.done }}
                >
                  <View style={[styles.check, step.done ? { backgroundColor: P.accent, borderColor: P.accent } : null]}>
                    {step.done && <Ionicons name="checkmark" size={14} color={P.onAccent} />}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.stepLabel, step.done && styles.stepDone]}>{step.label}</Text>
                    {!step.done && <Text style={styles.stepHint}>{step.hint}</Text>}
                  </View>
                  {!step.done && <Ionicons name="chevron-forward" size={16} color={P.sub} />}
                </TouchableOpacity>
              ))}
              <Text style={styles.footnote}>You won't appear in Search or Explore until all four are done.</Text>
            </View>
          )}

          <View style={styles.tiles}>
            <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate('LinkOnlyAnalytics')} activeOpacity={0.85}>
              <Ionicons name="stats-chart-outline" size={22} color={P.accent} />
              <Text style={styles.tileTitle}>Analytics</Text>
              <Text style={styles.tileSub}>{live ? 'Book taps, views, saves' : "Starts counting once you're live"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tile} onPress={() => goToStep('portfolio')} activeOpacity={0.85}>
              <Ionicons name="images-outline" size={22} color={P.accent} />
              <Text style={styles.tileTitle}>Portfolio</Text>
              <Text style={styles.tileSub}>
                {status
                  ? `${status.portfolioCount} photo${status.portfolioCount === 1 ? '' : 's'}${status.portfolioCount === 0 ? ' · add your best work' : ''}`
                  : 'Your best work'}
              </Text>
            </TouchableOpacity>
          </View>

          <DiaryCard P={P} />

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.listRow}
              onPress={() => navigation.navigate('BeccaStack', { screen: 'BeccaMain', params: {} })}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles-outline" size={20} color={P.accent} />
              <Text style={styles.listLabel}>Becca, your assistant</Text>
              <Ionicons name="chevron-forward" size={16} color={P.sub} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.listRow}
              onPress={() => {
                if (!live) {
                  showAlert('Go live first', "Announcements go to clients who saved you, and they can only find you once you're live.");
                  return;
                }
                setAnnouncementKey(k => k + 1);
                setAnnouncementOpen(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="megaphone-outline" size={20} color={P.accent} />
              <Text style={styles.listLabel}>Announcements to your clients</Text>
              <Ionicons name="chevron-forward" size={16} color={P.sub} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <LinkOnlyAnnouncementSheet
        key={announcementKey}
        visible={announcementOpen}
        P={P}
        onClose={() => setAnnouncementOpen(false)}
        onSent={count => {
          setAnnouncementOpen(false);
          setTimeout(() => showAlert('Announcement sent', `Sent to ${count} client${count === 1 ? '' : 's'}.`), 400);
        }}
      />
      <DialogHost />
    </ThemedBackground>
  );
}

type HomePalette = {
  bg: string; card: string; surface: string; text: string; sub: string;
  border: string; accent: string; onAccent: string; accentDim: string;
};

const createStyles = (P: HomePalette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    welcome: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600', color: P.sub },
    name: { fontFamily: 'BakbakOne-Regular', fontSize: 26, color: P.text },
    livePill: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: P.accentDim, flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    liveText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    loader: { marginVertical: 24 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 10 },
    cardTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.sub },
    rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    count: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accent },
    progress: { flexDirection: 'row', gap: 4 },
    progressBar: { flex: 1, height: 4, borderRadius: 2 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
    check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: P.border, alignItems: 'center', justifyContent: 'center' },
    stepLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.text },
    stepDone: { color: P.sub, textDecorationLine: 'line-through' },
    stepHint: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: P.sub, marginTop: 1 },
    footnote: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: P.sub },
    primary: { height: 48, borderRadius: 24, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.onAccent },
    tiles: { flexDirection: 'row', gap: 10 },
    tile: { flex: 1, backgroundColor: P.card, borderRadius: 20, borderWidth: 1, borderColor: P.border, padding: 14, gap: 6 },
    tileTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text },
    tileSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16, color: P.sub },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    listLabel: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.text },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: P.border },
  });
