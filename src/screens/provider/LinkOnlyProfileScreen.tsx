/**
 * Profile tab for a link-only provider: their public profile, and where they
 * edit it. The preview card opens their real profile exactly as clients see
 * it (MyPublicProfile → ProviderProfileScreen, which already knows it's the
 * owner looking). The rows below are the parts of a profile a link-only
 * provider has — no services, payments, automations or client-care tools.
 * Account settings (password, notifications, switching hat, signing out) are
 * one row down, on the shared Provider Settings screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyProviderProfile } from '../../services/databaseService';
import type { DbProvider } from '../../types/database';
import { bookingSiteName } from '../../features/bookings/externalBookings';
import { logger } from '../../utils/logger';
import type { ProviderAccountStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProviderAccountStackParamList, 'LinkOnlyProfileMain'>;

export default function LinkOnlyProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const [profile, setProfile] = useState<DbProvider | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyProviderProfile()
        .then(row => { if (active) setProfile(row); })
        .catch((error: unknown) => logger.error('[LinkOnlyProfile] load failed', error));
      return () => { active = false; };
    }, []),
  );

  const go = (screen: keyof ProviderAccountStackParamList) => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate(screen as never);
  };

  const rows: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }[] = [
    { icon: 'create-outline', title: 'Edit profile', sub: 'Logo, About, portfolio, contact, booking link', onPress: () => go('EditProfile') },
    { icon: 'time-outline', title: 'Opening hours', sub: 'Shown on your profile', onPress: () => go('ProviderSchedule') },
    { icon: 'briefcase-outline', title: 'Business info', sub: 'Name, service type, socials, booking link', onPress: () => go('BusinessInfo') },
    { icon: 'color-palette-outline', title: 'Branding', sub: 'Theme, colours and font on your profile', onPress: () => go('Branding') },
    { icon: 'document-text-outline', title: 'Policies', sub: 'Optional — shown in the Policies tab', onPress: () => go('Policies') },
  ];

  const initials = (profile?.display_name ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE }]}>
          <Text style={styles.title}>Profile</Text>

          <TouchableOpacity
            style={styles.previewCard}
            disabled={!profile}
            onPress={() => {
              if (!profile) return;
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate('MyPublicProfile', { providerId: profile.slug });
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="See your public profile"
          >
            {profile?.logo_url ? (
              <Image source={{ uri: profile.logo_url }} style={styles.logo} contentFit="cover" transition={0} />
            ) : (
              <View style={[styles.logo, { backgroundColor: P.accent }]}>
                <Text style={[styles.initials, { color: P.onAccent }]}>{initials || '?'}</Text>
              </View>
            )}
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>{profile?.display_name ?? 'Your profile'}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {profile
                  ? `${profile.has_gone_live ? 'Live' : 'Not live yet'} · Books on ${bookingSiteName(profile.external_booking_url)}`
                  : 'Save your profile to see it here'}
              </Text>
              {profile && <Text style={styles.link}>See your public profile</Text>}
            </View>
            {profile && <Ionicons name="chevron-forward" size={16} color={P.sub} />}
          </TouchableOpacity>

          <View style={styles.card}>
            {rows.map((row, index) => (
              <View key={row.title}>
                {index > 0 && <View style={styles.divider} />}
                <TouchableOpacity style={styles.row} onPress={row.onPress} activeOpacity={0.7}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={row.icon} size={18} color={P.accent} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.sub}>{row.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={P.sub} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => go('ProviderAccountMain')} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Ionicons name="settings-outline" size={18} color={P.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Settings</Text>
                <Text style={styles.sub}>Account, notifications, help, sign out</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={P.sub} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, color: P.text, marginBottom: 4 },
    previewCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16 },
    logo: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    initials: { fontFamily: 'BakbakOne-Regular', fontSize: 22 },
    name: { fontFamily: 'BakbakOne-Regular', fontSize: 18, color: P.text },
    sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: P.sub, marginTop: 2 },
    link: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.accentText, marginTop: 6 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, paddingHorizontal: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
    rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.text },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: P.border, marginLeft: 46 },
  });
