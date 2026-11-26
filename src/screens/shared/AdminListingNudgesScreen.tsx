import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useAppDialog } from '../../components/AppDialog';
import { getAdminListingNudges, type AdminListingNudge } from '../../services/databaseService';
import { listingCategoryLabel, listingInstagramUrl } from '../../features/providers/directoryListings';
import { formatShortDate } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';

// ── Nudged businesses (admin) ──────────────────────────────────────────────
// "Not on CERVICED yet" listings clients have nudged to join, most people
// first, so the team can message them on Instagram by hand. Read from
// admin_listing_nudges(), which refuses anyone who isn't an admin. A client's
// nudge counts once per business per day.
// Internal tool, so its copy is English only.

type Palette = ReturnType<typeof useTheme>['palette'];

export default function AdminListingNudgesScreen({ navigation }: any) {
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AdminListingNudge[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { showAlert, DialogHost } = useAppDialog();

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setRows(await getAdminListingNudges());
    } catch (err) {
      logger.error('[AdminListingNudges] list failed to load:', err);
      setLoadError(true);
    }
  }, []);

  useEffect(() => navigation.addListener('focus', () => { void load(); }), [navigation, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openInstagram = useCallback((row: AdminListingNudge) => {
    const url = listingInstagramUrl(row.instagram);
    if (!url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(url).catch((err: unknown) => {
      logger.error('[AdminListingNudges] Instagram failed to open:', err);
      showAlert("Couldn't open Instagram", 'Please try again in a moment.', 'center');
    });
  }, [showAlert]);

  const header = (
    <View>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
      </TouchableOpacity>
      <Text style={[styles.title, { color: P.text }]}>NUDGED BUSINESSES</Text>
      <Text style={[styles.subtitle, { color: P.sub }]}>
        Businesses not on CERVICED yet that clients want here, most people first. Clients are told you'll let them know, so message these on Instagram.
      </Text>
    </View>
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FlatList
        data={rows ?? []}
        keyExtractor={item => item.providerId}
        renderItem={({ item }) => <NudgeCard P={P} row={item} onInstagram={openInstagram} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          rows === null && !loadError ? (
            <ActivityIndicator color={P.accent} style={{ marginTop: 24 }} />
          ) : loadError ? (
            <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
              <Text style={[styles.body, { color: P.text }]}>Couldn't load the list.</Text>
              <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[styles.link, { color: P.accentText }]}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.body, { color: P.sub, marginTop: 8 }]}>No nudges yet.</Text>
          )
        }
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={P.accent} />}
      />
      <DialogHost />
    </ThemedBackground>
  );
}

function NudgeCard({ P, row, onInstagram }: {
  P: Palette;
  row: AdminListingNudge;
  onInstagram: (row: AdminListingNudge) => void;
}) {
  const where = [listingCategoryLabel(row.serviceCategory), row.locationText].filter(Boolean).join(' · ');
  const counts = `${row.people} ${row.people === 1 ? 'person' : 'people'} · ${row.nudges} ${row.nudges === 1 ? 'nudge' : 'nudges'}`;
  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.name, { color: P.text, flex: 1 }]} numberOfLines={1}>{row.displayName}</Text>
        <View style={[styles.pill, { borderColor: P.border }]}>
          <Text style={[styles.pillText, { color: P.accentText }]}>{counts.toUpperCase()}</Text>
        </View>
      </View>
      {!!where && <Text style={[styles.body, { color: P.sub }]}>{where}</Text>}
      {!!row.lastNudgedOn && (
        <Text style={[styles.small, { color: P.sub }]}>Last nudged {formatShortDate(row.lastNudgedOn)}</Text>
      )}
      {!!listingInstagramUrl(row.instagram) && (
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: P.border }]}
          onPress={() => onInstagram(row)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Open @${row.instagram} on Instagram`}
        >
          <Text style={[styles.link, { color: P.accentText }]}>OPEN @{row.instagram?.replace(/^@+/, '').toUpperCase()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 16, letterSpacing: 1 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  link: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.5 },
  actionBtn: { borderRadius: 100, borderWidth: 1, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  pill: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.2 },
});
