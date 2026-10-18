/**
 * Portfolio tab for a link-only provider — their work, which is what shows on
 * their profile and in Explore. At least one photo is a go-live step for them
 * (the server's external branch of check_and_set_provider_live counts
 * portfolio_items), so adding the first one can publish them.
 *
 * Upload and delete follow ProviderMyProfileScreen's portfolio grid exactly:
 * each photo uploads on its own so one failure doesn't drop the rest.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
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
} from '../../services/databaseService';
import { uploadToStorage } from '../../services/providerRegistrationService';
import type { DbPortfolioItem } from '../../types/database';
import { toUserMessage } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';

const GAP = 8;

export default function LinkOnlyPortfolioScreen() {
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const tileSize = (width - 32 - GAP * 2) / 3;

  const [providerId, setProviderId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DbPortfolioItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const profile = await getMyProviderProfile();
          if (!active) return;
          if (!profile) { setProviderId(null); setPhotos([]); return; }
          setProviderId(profile.id);
          const { work } = await getProviderPortfolio(profile.id);
          if (active) { setPhotos(work); setFailed(false); }
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
          <Text style={styles.sub}>Your work shows on your profile and in Explore.</Text>
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
    removeBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  });
