/**
 * Portfolio tab for a link-only provider — their work, which is what shows on
 * their profile and in Explore. At least one photo is a go-live step for them
 * (the server's external branch of check_and_set_provider_live counts
 * portfolio_items), so adding the first one can publish them.
 *
 * Upload and delete follow ProviderMyProfileScreen's portfolio grid exactly:
 * each photo uploads on its own so one failure doesn't drop the rest.
 *
 * It opens with a small preview of their profile as clients see it, which
 * taps through to the real thing (MyPublicProfile).
 *
 * Their specialities live here too. A link-only provider has no Services &
 * Pricing screen, and these are what Search's Speciality filter and the
 * profile hero's chips read, so this is the one place they can see and change
 * how clients find them.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  addPortfolioItem,
  deletePortfolioItem,
  getMyProviderProfile,
  getProviderPortfolio,
  getProviderSpecialties,
  replaceMyProviderSpecialties,
} from '../../services/databaseService';
import { ALL_SERVICE_TYPE_OPTS, SPECIALTIES_MAP } from '../../features/business-details/options';
import { SpecialityMultiSelect } from '../../components/SpecialityMultiSelect';
import type { DbProvider } from '../../types/database';
import type { LinkOnlyPortfolioStackParamList } from '../../navigation/types';
import { uploadToStorage } from '../../services/providerRegistrationService';
import type { DbPortfolioItem } from '../../types/database';
import { toUserMessage } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';

const GAP = 8;

type Nav = NativeStackNavigationProp<LinkOnlyPortfolioStackParamList, 'LinkOnlyPortfolioMain'>;

export default function LinkOnlyPortfolioScreen() {
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const tileSize = (width - 32 - GAP * 2) / 3;

  const [providerId, setProviderId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DbProvider | null>(null);
  const [photos, setPhotos] = useState<DbPortfolioItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  // The set being edited, or null when not editing. Kept apart from the saved
  // set so Cancel is a real undo and a failed save leaves the saved one intact.
  const [draftSpecialties, setDraftSpecialties] = useState<string[] | null>(null);
  const [savingSpecialties, setSavingSpecialties] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profile = await getMyProviderProfile();
          if (!active) return;
          if (!profile) { setProviderId(null); setPhotos([]); return; }
          setProviderId(profile.id);
          setProfile(profile);
          setServiceCategories(profile.service_categories ?? [profile.service_category]);
          const [{ work }, savedSpecialties] = await Promise.all([
            getProviderPortfolio(profile.id),
            getProviderSpecialties(profile.id),
          ]);
          if (active) { setPhotos(work); setSpecialties(savedSpecialties); setFailed(false); }
        } catch (error) {
          logger.error('[LinkOnlyPortfolio] load failed', error);
          if (active) setFailed(true);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  const handleAdd = useCallback(async () => {
    if (!user?.id || !providerId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    await Promise.all(
      result.assets.map(async asset => {
        try {
          const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
          const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
          const item = await addPortfolioItem(providerId, publicUrl, ratio);
          setPhotos(prev => [item, ...(prev ?? [])]);
        } catch (error) {
          logger.error('[LinkOnlyPortfolio] upload failed', error);
          Alert.alert('Upload failed', toUserMessage(error, 'Could not upload one of those photos.', 'LinkOnlyPortfolio.add'));
        }
      }),
    );
    setUploading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [user, providerId]);

  // Every speciality offered for the service types they do, plus any saved one
  // outside that list (sign-up wording carried over) so it can be seen and
  // removed rather than persisting invisibly.
  const specialtyOptions = useMemo(
    () => Array.from(new Set([
      ...serviceCategories.flatMap(category => SPECIALTIES_MAP[category] ?? []),
      ...specialties,
    ])),
    [serviceCategories, specialties],
  );

  const serviceTypeLabel = profile
    ? (profile.service_category === 'OTHER' && profile.custom_service_type
      ? profile.custom_service_type
      : ALL_SERVICE_TYPE_OPTS.find(o => o.value === profile.service_category)?.label ?? '')
    : '';
  const initials = (profile?.display_name ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const handleSaveSpecialties = useCallback(async () => {
    if (!draftSpecialties) return;
    setSavingSpecialties(true);
    try {
      await replaceMyProviderSpecialties(draftSpecialties);
      setSpecialties(draftSpecialties);
      setDraftSpecialties(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      logger.error('[LinkOnlyPortfolio] specialities save failed', error);
      Alert.alert('Could not save', toUserMessage(error, "Your specialities didn't save. Please try again.", 'LinkOnlyPortfolio.specialities'));
    } finally {
      setSavingSpecialties(false);
    }
  }, [draftSpecialties]);

  const handleRemove = useCallback((item: DbPortfolioItem) => {
    const isLast = (photos?.length ?? 0) <= 1;
    Alert.alert(
      'Remove photo?',
      isLast
        ? "It's your only photo — without one you'll stop appearing to clients until you add another."
        : 'Clients will no longer see it on your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setPhotos(prev => (prev ?? []).filter(p => p.id !== item.id));
            try {
              await deletePortfolioItem(item.id);
            } catch (error) {
              setPhotos(prev => [item, ...(prev ?? [])]);
              logger.error('[LinkOnlyPortfolio] delete failed', error);
              Alert.alert('Could not remove', toUserMessage(error, "That didn't save. Please try again.", 'LinkOnlyPortfolio.remove'));
            }
          },
        },
      ],
    );
  }, [photos?.length]);

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio</Text>
          <TouchableOpacity
            style={[styles.addButton, (!providerId || uploading) && styles.disabled]}
            onPress={handleAdd}
            disabled={!providerId || uploading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            {uploading ? <ActivityIndicator color={P.onAccent} /> : (
              <>
                <Ionicons name="add" size={18} color={P.onAccent} />
                <Text style={styles.addText}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + FLOATING_TAB_BAR_CLEARANCE }]}>
          {profile && (
            <>
              <Text style={styles.sectionLabel}>How clients see you</Text>
              <TouchableOpacity
                style={styles.previewCard}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  navigation.navigate('MyPublicProfile', { providerId: profile.slug });
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open your profile as clients see it"
              >
                <View style={styles.previewTop}>
                  {profile.logo_url ? (
                    <Image source={{ uri: profile.logo_url }} style={styles.previewLogo} contentFit="cover" transition={0} />
                  ) : (
                    <View style={[styles.previewLogo, styles.previewLogoEmpty]}>
                      <Text style={styles.previewInitials}>{initials}</Text>
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.previewName} numberOfLines={1}>{profile.display_name}</Text>
                    <Text style={styles.previewMeta} numberOfLines={1}>
                      {[serviceTypeLabel, profile.location_text].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                {specialties.length > 0 && (
                  <View style={styles.chips}>
                    {specialties.slice(0, 3).map(specialty => (
                      <View key={specialty} style={styles.previewChip}>
                        <Text style={styles.previewChipText}>{specialty}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.previewActions}>
                  <View style={styles.previewBook}>
                    <Text style={styles.addText}>Book</Text>
                  </View>
                  {!!profile.instagram && (
                    <View style={styles.previewIcon}>
                      <Ionicons name="logo-instagram" size={18} color={P.accent} />
                    </View>
                  )}
                  <View style={styles.previewIcon}>
                    <Ionicons name="chatbubble-outline" size={17} color={P.accent} />
                  </View>
                </View>
                <View style={styles.previewFooter}>
                  <Text style={styles.cardAction}>Open full preview</Text>
                  <Ionicons name="chevron-forward" size={16} color={P.accent} />
                </View>
              </TouchableOpacity>
            </>
          )}
          <Text style={styles.sub}>Your work shows on your profile and in Explore.</Text>
          {providerId && !failed && photos != null && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Your specialities</Text>
                {draftSpecialties == null ? (
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDraftSpecialties(specialties); }}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cardAction}>{specialties.length ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setDraftSpecialties(null)}
                    disabled={savingSpecialties}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cardActionMuted}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.cardSub}>
                Clients find you by these in Search, and they show on your profile.
              </Text>
              {draftSpecialties == null ? (
                specialties.length ? (
                  <View style={styles.chips}>
                    {specialties.map(specialty => (
                      <View key={specialty} style={[styles.chip, styles.chipOn]}>
                        <Text style={[styles.chipText, styles.chipTextOn]}>{specialty}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.cardSub}>None yet — add a few so clients searching for them find you.</Text>
                )
              ) : (
                <>
                  {/* The same searchable sheet as Search's Speciality filter. */}
                  <SpecialityMultiSelect
                    selected={draftSpecialties}
                    onChange={setDraftSpecialties}
                    options={specialtyOptions}
                    palette={P}
                    placeholder="Search specialities"
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, savingSpecialties && styles.disabled]}
                    onPress={handleSaveSpecialties}
                    disabled={savingSpecialties}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    {savingSpecialties
                      ? <ActivityIndicator color={P.onAccent} />
                      : <Text style={styles.addText}>Save specialities</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          {failed ? (
            <Text style={styles.sub}>Couldn't load your photos. Come back to this tab to try again.</Text>
          ) : photos == null ? (
            <ActivityIndicator color={P.accent} style={styles.loader} />
          ) : !providerId ? (
            <Text style={styles.sub}>Save your profile first (Home → Get started), then add photos here.</Text>
          ) : photos.length === 0 ? (
            <TouchableOpacity style={styles.empty} onPress={handleAdd} activeOpacity={0.85}>
              <Ionicons name="images-outline" size={28} color={P.accent} />
              <Text style={styles.emptyTitle}>Add your best work</Text>
              <Text style={styles.sub}>At least one photo is needed before clients can find you.</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.grid}>
              {photos.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onLongPress={() => handleRemove(item)}
                  delayLongPress={300}
                  activeOpacity={0.9}
                  style={{ width: tileSize, height: tileSize }}
                  accessibilityLabel="Portfolio photo. Long-press to remove."
                >
                  <Image source={{ uri: item.image_url }} style={styles.photo} contentFit="cover" transition={0} />
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() => handleRemove(item)}
                    accessibilityLabel="Remove photo"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedBackground>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, color: P.text },
    addButton: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: P.accent, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 80, justifyContent: 'center' },
    addText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, color: P.onAccent },
    disabled: { opacity: 0.5 },
    content: { paddingHorizontal: 16, gap: 12 },
    sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.sub },
    loader: { marginVertical: 40 },
    empty: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 24, alignItems: 'center', gap: 8 },
    emptyTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    photo: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: P.surface },
    sectionLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 1, color: P.sub },
    previewCard: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 12 },
    previewTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    previewLogo: { width: 52, height: 52, borderRadius: 26, backgroundColor: P.surface },
    previewLogoEmpty: { backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    previewInitials: { fontFamily: 'BakbakOne-Regular', fontSize: 20, color: P.onAccent },
    previewName: { fontFamily: 'BakbakOne-Regular', fontSize: 19, color: P.text },
    previewMeta: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', color: P.sub },
    previewChip: { borderRadius: 100, backgroundColor: P.accentDim, paddingVertical: 5, paddingHorizontal: 10 },
    previewChipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    previewActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    previewBook: { flex: 1, height: 40, borderRadius: 20, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center' },
    previewIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.accentDim, alignItems: 'center', justifyContent: 'center' },
    previewFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.border, paddingTop: 12 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    cardAction: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.accent },
    cardActionMuted: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.sub },
    cardSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18, color: P.sub },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 100, borderWidth: 1, borderColor: P.border, backgroundColor: P.surface, paddingVertical: 8, paddingHorizontal: 12 },
    chipOn: { backgroundColor: P.accent, borderColor: P.accent },
    chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: P.text },
    chipTextOn: { color: P.onAccent },
    saveButton: { height: 44, borderRadius: 22, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    removeBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  });
