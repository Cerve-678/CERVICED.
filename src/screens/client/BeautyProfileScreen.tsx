// src/screens/client/BeautyProfileScreen.tsx
//
// Beauty Profile: a landing with two doors (Maintenance, My Profile), each a
// full view swapped in by screen state. The views live in
// src/features/beauty-profile/ and src/features/maintenance/; this file owns
// the state they share — the profile draft and its single SAVE PROFILE
// transaction, and the maintenance data.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import { getUserBeautyProfile, updateUserBeautyProfile, getMaintenanceRebookTarget } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import type { ProfileScreenProps } from '../../navigation/types';
import { navigateNested } from '../../navigation/rootNavigate';
import {
  type BeautyData,
  type CategoryKey,
  type Gender,
  EMPTY_BEAUTY_DATA,
} from '../../types/beautyProfile';
import type { MaintenanceItem } from '../../types/maintenance';
import { computeBeautyProfileStats } from '../../utils/beautyProfileStats';
import { getMaintenanceServiceType } from '../../constants/maintenanceServiceTypes';
import { BeautyLanding } from '../../features/beauty-profile/BeautyLanding';
import { MyProfileView } from '../../features/beauty-profile/MyProfileView';
import { MaintenanceView } from '../../features/maintenance/MaintenanceView';
import { SetupFlow } from '../../features/maintenance/SetupFlow';
import { useMaintenance } from '../../features/maintenance/useMaintenance';
import type { ItemAction } from '../../features/maintenance/MaintenanceItemCard';

type BeautyView = 'landing' | 'maintenance' | 'setup' | 'profile';

// ── Main screen ─────────────────────────────────────────────────────────────

export default function BeautyProfileScreen({ navigation, route }: ProfileScreenProps<'BeautyProfile'>) {
  const { user } = useAuth();
  const { palette: P } = useTheme();
  const { t } = useTranslation();
  const { showAlert, showConfirm, DialogHost } = useAppDialog();

  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [saved,    setSaved]    = useState<BeautyData>(EMPTY_BEAUTY_DATA);
  const [draft,    setDraft]    = useState<BeautyData>(EMPTY_BEAUTY_DATA);
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const savingRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;

  // The grid ⇄ focused-category swap. This is screen state, not navigation:
  // SAVE PROFILE is one transaction across all nine categories, so the draft
  // has to stay screen-level regardless of which category is on screen. A route
  // push per category would put nine entries on the stack all sharing one
  // pending save.
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);

  // Which door is open. Same reasoning as selectedCategory: screen state, so
  // the profile draft survives a trip into Maintenance and back.
  const [view, setView] = useState<BeautyView>(route.params?.openMaintenance ? 'maintenance' : 'landing');
  const focusItemId = route.params?.focusItemId;
  const maintenance = useMaintenance(user?.id ?? null);
  const [rebookingId, setRebookingId] = useState<string | null>(null);

  // A notification tap while this screen is already mounted re-sends params.
  useEffect(() => {
    if (route.params?.openMaintenance) {
      setView('maintenance');
      void maintenance.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is stable per user
  }, [route.params?.openMaintenance, route.params?.focusItemId]);

  const openCategory = (key: CategoryKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCategory(key);
  };

  const closeCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCategory(null);
  };

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const userId = user?.id ?? null;
    setFetching(true);
    setLoadError(false);
    setEditing(false);
    setSelectedCategory(null);
    setSaved(EMPTY_BEAUTY_DATA);
    setDraft(EMPTY_BEAUTY_DATA);
    if (!userId) {
      setProfileOwnerId(null);
      setFetching(false);
      return;
    }
    try {
      const m = await getUserBeautyProfile(userId);
      if (requestId !== loadRequestRef.current || activeUserIdRef.current !== userId) return;
      const profile: BeautyData = {
        hairType: m?.hair_type ?? '', scalpCondition: m?.scalp_condition ?? '',
        hairGoals: m?.hair_goals ?? [], treatmentHistory: m?.treatment_history ?? [],
        skinType: m?.skin_type ?? '', skinTone: m?.skin_tone ?? '',
        skinConcerns: m?.skin_concerns ?? [], sensitiveAreas: m?.sensitive_areas ?? [],
        nailLength: m?.nail_length ?? '', nailShape: m?.nail_shape ?? '',
        lashStyle: m?.lash_style ?? '', lashStatus: m?.lash_status ?? '',
        browStyle: m?.brow_style ?? '', browCondition: m?.brow_condition ?? '',
        makeupCoverage: m?.makeup_coverage ?? '', makeupFinish: m?.makeup_finish ?? '',
        makeupEyes: m?.makeup_eyes ?? '', makeupLips: m?.makeup_lips ?? '',
        styleVibe: m?.style_vibe ?? '', serviceInterests: m?.service_interests ?? [],
        gender: (m?.gender as Gender | null) ?? null, has_kids: m?.has_kids ?? false,
        allergies: m?.allergies ?? [], medicalNotes: m?.medical_notes ?? '',
        photographyConsent: m?.photography_consent ?? true,
      };
      setProfileOwnerId(userId);
      setSaved(profile);
      setDraft(profile);
    } catch (error) {
      if (requestId !== loadRequestRef.current || activeUserIdRef.current !== userId) return;
      logger.error('getUserBeautyProfile failed:', error);
      setProfileOwnerId(userId);
      setLoadError(true);
    } finally {
      if (requestId === loadRequestRef.current && activeUserIdRef.current === userId) {
        setFetching(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    saveRequestRef.current += 1;
    savingRef.current = false;
    setSaving(false);
    void loadProfile();
    return () => {
      loadRequestRef.current += 1;
      saveRequestRef.current += 1;
      savingRef.current = false;
    };
  }, [loadProfile]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const requestId = ++saveRequestRef.current;
    const userId = user?.id ?? null;
    const draftSnapshot = draft;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Sync all beauty profile fields to users table so providers can read them.
    // Uses upsert in case the users row doesn't exist yet. Awaited (not
    // fire-and-forget) since this is the copy providers actually query —
    // a silent failure here would desync health-adjacent data (allergies,
    // medical notes) from what the client believes was saved.
    let syncError: unknown = null;
    if (!userId) {
      syncError = new Error('Not authenticated');
    } else {
      try {
        await updateUserBeautyProfile(userId, {
          hair_type:           draftSnapshot.hairType            || null,
          scalp_condition:     draftSnapshot.scalpCondition      || null,
          hair_goals:          draftSnapshot.hairGoals,
          skin_type:           draftSnapshot.skinType            || null,
          skin_tone:           draftSnapshot.skinTone            || null,
          skin_concerns:       draftSnapshot.skinConcerns,
          sensitive_areas:     draftSnapshot.sensitiveAreas,
          nail_length:         draftSnapshot.nailLength          || null,
          nail_shape:          draftSnapshot.nailShape           || null,
          lash_style:          draftSnapshot.lashStyle           || null,
          lash_status:         draftSnapshot.lashStatus          || null,
          brow_style:          draftSnapshot.browStyle           || null,
          brow_condition:      draftSnapshot.browCondition       || null,
          makeup_coverage:     draftSnapshot.makeupCoverage      || null,
          makeup_finish:       draftSnapshot.makeupFinish        || null,
          makeup_eyes:         draftSnapshot.makeupEyes          || null,
          makeup_lips:         draftSnapshot.makeupLips          || null,
          allergies:           draftSnapshot.allergies,
          style_vibe:          draftSnapshot.styleVibe           || null,
          medical_notes:       draftSnapshot.medicalNotes        || null,
          photography_consent: draftSnapshot.photographyConsent,
          treatment_history:   draftSnapshot.treatmentHistory,
          service_interests:   draftSnapshot.serviceInterests,
          gender:              draftSnapshot.gender              || null,
          has_kids:            draftSnapshot.has_kids,
        });
      } catch (err) {
        syncError = err;
        logger.error('updateUserBeautyProfile failed:', err);
      }
    }

    if (requestId !== saveRequestRef.current || activeUserIdRef.current !== userId) return;
    savingRef.current = false;
    setSaving(false);
    if (syncError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert('Error', 'Couldn\'t save your profile. Please try again.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSaved(draftSnapshot);
      setEditing(false);
    }
  };

  const handleCancel = () => {
    Haptics.selectionAsync().catch(() => {});
    setDraft(saved);
    setEditing(false);
  };

  const toggleEdit = () => {
    if (editing) { handleCancel(); return; }
    Haptics.selectionAsync().catch(() => {});
    setEditing(true);
  };

  // Every number on My Profile comes from here; recomputed only when the
  // draft changes.
  const stats = useMemo(() => computeBeautyProfileStats(draft), [draft]);

  // ── Maintenance actions ───────────────────────────────────────────────────

  const findProvider = useCallback((item: MaintenanceItem) => {
    const category = item.kind === 'takedown'
      ? 'HAIR'
      : getMaintenanceServiceType(item.typeKey)?.searchCategory;
    navigateNested('Home', 'Search', category ? { category } : {});
  }, []);

  const handleItemAction = useCallback(async (item: MaintenanceItem, action: ItemAction) => {
    if (action === 'resume') {
      try {
        await maintenance.updateItem(item.id, { paused: false });
      } catch (err) {
        logger.error('[Maintenance] resume failed:', err);
        showAlert(t('maintenance.error.title'), t('maintenance.error.save'));
      }
      return;
    }
    if (action === 'find' || !item.providerId) { findProvider(item); return; }
    // Rebook: same provider and service, only while the provider is live.
    setRebookingId(item.id);
    try {
      const target = await getMaintenanceRebookTarget(item.providerId, item.serviceId);
      if (!target) {
        showConfirm(
          t('maintenance.rebook.unavailableTitle'),
          t('maintenance.rebook.unavailableBody', { provider: item.providerName ?? t('maintenance.rebook.yourProvider') }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('maintenance.action.find'), onPress: () => findProvider(item) },
          ],
        );
        return;
      }
      navigation.navigate('ProviderProfile', {
        providerId: target.providerSlug,
        source: 'maintenance',
        ...(target.serviceId ? { openServiceId: target.serviceId } : {}),
      });
    } catch (err) {
      logger.error('[Maintenance] rebook lookup failed:', err);
      showAlert(t('maintenance.error.title'), t('maintenance.error.rebook'));
    } finally {
      setRebookingId(null);
    }
  }, [maintenance, findProvider, navigation, showAlert, showConfirm, t]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (fetching || profileOwnerId !== (user?.id ?? null)) {
    return (
      <ThemedBackground style={styles.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={P.accent} size="large" />
        </View>
      </ThemedBackground>
    );
  }

  if (loadError) {
    return (
      <ThemedBackground style={styles.bg}>
        <View style={styles.loadingWrap}>
          <Text style={{ color: P.text, marginBottom: 16 }}>
            We couldn't load your beauty profile.
          </Text>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: P.accent, borderColor: P.accent }]}
            onPress={() => { void loadProfile(); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.saveBtnText, { color: P.onAccent }]}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      </ThemedBackground>
    );
  }

  let content: React.ReactNode;
  switch (view) {
    case 'profile':
      content = (
        <MyProfileView
          draft={draft}
          setDraft={setDraft}
          stats={stats}
          editing={editing}
          saving={saving}
          selectedCategory={selectedCategory}
          onBack={() => { if (editing) handleCancel(); setView('landing'); }}
          onOpenCategory={openCategory}
          onCloseCategory={closeCategory}
          onToggleEdit={toggleEdit}
          onSave={handleSave}
        />
      );
      break;
    case 'maintenance':
      content = (
        <MaintenanceView
          state={maintenance}
          focusItemId={focusItemId}
          busyItemId={rebookingId}
          onBack={() => setView('landing')}
          onItemAction={(item, action) => { void handleItemAction(item, action); }}
          onOpenSetup={() => setView('setup')}
          onMessageProviders={() => navigation.navigate('Messages')}
          onViewBooking={bookingId => navigation.navigate('Bookings', { openBookingId: bookingId, highlightBookingId: bookingId })}
        />
      );
      break;
    case 'setup':
      content = (
        <SetupFlow
          profile={saved}
          state={maintenance}
          onClose={() => setView(maintenance.items.length > 0 ? 'maintenance' : 'landing')}
          onDone={() => setView('maintenance')}
        />
      );
      break;
    default:
      content = (
        <BeautyLanding
          profile={draft}
          stats={stats}
          maintenance={maintenance}
          onBack={() => navigation.goBack()}
          onOpenMaintenance={() => setView('maintenance')}
          onOpenSetup={() => setView('setup')}
          onOpenProfile={() => { setSelectedCategory(null); setView('profile'); }}
          onOpenHealth={() => { setView('profile'); setSelectedCategory('health'); }}
        />
      );
  }

  return (
    <>
      {content}
      {/* Rendered last so dialogs layer above every view. */}
      <DialogHost />
    </>
  );
}

const styles = StyleSheet.create({
  bg:          { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  saveBtn:     { borderRadius: 100, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', borderWidth: 1.5 },
  saveBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
});
