// src/screens/client/BeautyProfileScreen.tsx
//
// Beauty Profile: the "Map of you" landing (body map, Maintenance's big card,
// Health & Safety / Maintenance / Circle strips), plus full views swapped in
// by screen state: one category's editor, every category, Maintenance and its
// setup. The views live in src/features/beauty-profile/ and
// src/features/maintenance/; this file owns the state they share — the
// profile draft and its single SAVE PROFILE transaction, and the maintenance
// data.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, usePreventRemove, type NavigationAction } from '@react-navigation/native';
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
  EMPTY_BEAUTY_DATA,
} from '../../types/beautyProfile';
import type { MaintenanceItem } from '../../types/maintenance';
import { computeBeautyProfileStats } from '../../utils/beautyProfileStats';
import { beautyProfileTodo, TODO_FIELD_CATEGORY, type BeautyTodoField } from '../../utils/beautyProfileTodo';
import { beautyDataFromRow } from '../../features/beauty-profile/profileRow';
import { getMaintenanceServiceType } from '../../constants/maintenanceServiceTypes';
import { BeautyMapLanding } from '../../features/beauty-profile/BeautyMapLanding';
import { useFigurePrefs } from '../../features/beauty-profile/useFigurePrefs';
import { doneOutcome, snoozedDueOn } from '../../features/maintenance/presentation';
import { dateToYMD } from '../../utils/dateUtils';
import { MyProfileView } from '../../features/beauty-profile/MyProfileView';
import { MaintenanceView } from '../../features/maintenance/MaintenanceView';
import { SetupFlow, type Step } from '../../features/maintenance/SetupFlow';
import { buildMaintenanceSuggestions, EMPTY_SETUP_ANSWERS } from '../../utils/maintenanceSuggestions';
import { useMaintenance } from '../../features/maintenance/useMaintenance';
import type { ItemAction } from '../../features/maintenance/MaintenanceItemCard';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { toPickColumn } from '../../features/beauty-profile/pickList';

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

  // Follow requests waiting, for the Your circle strip. Refetched on each
  // return so a request answered in Your circle clears the dot. A failure only
  // loses the hint, so it's logged rather than shown.
  const circleRequests = useSocialSettingsStore(s =>
    s.ownerId === user?.id && s.settings ? s.settings.requests : 0,
  );
  const circleIsPrivate = useSocialSettingsStore(s =>
    s.ownerId === user?.id && s.settings ? s.settings.isPrivate : null,
  );
  const circle = useMemo(() => ({ requests: circleRequests, isPrivate: circleIsPrivate }), [circleRequests, circleIsPrivate]);
  const [figurePrefs, setFigurePrefs] = useFigurePrefs(user?.id ?? null);
  // A category opened from the body map goes back to the map, not the tiles.
  const [fromMap, setFromMap] = useState(false);
  const [cardBusyId, setCardBusyId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      useSocialSettingsStore.getState().load(user.id, true).catch((err: unknown) => {
        logger.warn('[beauty-profile] could not load circle settings', err);
      });
    }, [user?.id]),
  );
  const [rebookingId, setRebookingId] = useState<string | null>(null);
  // Setup opens on step 1, or straight on the suggestions from "Picked for you".
  const [setupStart, setSetupStart] = useState<Step>(1);
  const openSetup = (start: Step) => { setSetupStart(start); setView('setup'); };
  const pickedCount = useMemo(
    () => buildMaintenanceSuggestions(saved, EMPTY_SETUP_ANSWERS, maintenance.items, new Date()).length,
    [saved, maintenance.items],
  );

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
    if (fromMap) {
      // Same as leaving My Profile: unsaved edits are dropped, not kept for later.
      if (editing) { setDraft(saved); setEditing(false); }
      setFromMap(false);
      setView('landing');
    }
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
      const profile = beautyDataFromRow(m);
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
          skin_type:           toPickColumn(draftSnapshot.skinType),
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
          style_vibe:          toPickColumn(draftSnapshot.styleVibe),
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

  // What's still to do, from what is actually SAVED (not the draft) — the same
  // rule as the red "!" on the Settings row, so the two always agree.
  const todo = useMemo(
    () => beautyProfileTodo(saved, { dob: user?.dob, hasClientProfile: user?.hasClientProfile }),
    [saved, user?.dob, user?.hasClientProfile],
  );
  // Opens ready to answer — the card promises a fix, not a read-only view.
  const openTodoField = (field: BeautyTodoField) => {
    openCategoryFromMap(TODO_FIELD_CATEGORY[field]);
  };

  // From the map (or a to-do card): straight into that category, ready to answer.
  const openCategoryFromMap = (key: CategoryKey) => {
    setDraft(saved);
    setEditing(true);
    setFromMap(true);
    setView('profile');
    setSelectedCategory(key);
  };

  // The big card on the landing: Done it and Snooze +7 days.
  const runCardAction = useCallback(async (item: MaintenanceItem, kind: 'done' | 'snooze') => {
    const today = dateToYMD(new Date());
    setCardBusyId(item.id);
    try {
      if (kind === 'snooze') {
        await maintenance.updateItem(item.id, { dueOn: snoozedDueOn(item, today) });
      } else {
        const outcome = doneOutcome(item, today);
        if (outcome.kind === 'update') await maintenance.updateItem(item.id, outcome.patch);
        else await maintenance.deleteItem(item.id);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      logger.error(`[Maintenance] ${kind} from the landing failed:`, err);
      showAlert(t('maintenance.error.title'), t('maintenance.error.save'));
    } finally {
      setCardBusyId(null);
    }
  }, [maintenance, showAlert, t]);

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

  // ── Back inside the screen ───────────────────────────────────────────────
  // The body map, All profile, a category, Maintenance and setup are views of
  // this one screen, so a back-swipe (or Android back) would leave Beauty
  // Profile altogether. While one is open, back goes one step instead, the
  // same step as that view's own back button. usePreventRemove, not a
  // beforeRemove listener: it's the one that holds native-stack's swipe.
  const setupBackRef = useRef<(() => void) | null>(null);
  const innerOpen = view !== 'landing' || selectedCategory !== null;
  // Anything that isn't a plain back (a tab re-tap, sign-out, a hat switch)
  // still leaves: close the views, then let it through once that has landed.
  const [leaving, setLeaving] = useState<NavigationAction | null>(null);
  const stepBack = () => {
    if (view === 'setup') { setupBackRef.current?.(); return; }
    if (selectedCategory !== null) { closeCategory(); return; }
    if (view === 'profile' && editing) handleCancel();
    setFromMap(false);
    setView('landing');
  };
  usePreventRemove(innerOpen && leaving === null, ({ data }) => {
    const { type } = data.action;
    if (type === 'GO_BACK' || type === 'POP') { stepBack(); return; }
    setLeaving(data.action);
  });
  useEffect(() => {
    if (!leaving) return;
    // A frame later, so the prevention above has been switched off first.
    const id = setTimeout(() => {
      navigation.dispatch(leaving);
      setLeaving(null);
    }, 0);
    return () => clearTimeout(id);
  }, [leaving, navigation]);

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
          onBack={() => { if (editing) handleCancel(); setFromMap(false); setView('landing'); }}
          onOpenCategory={openCategory}
          onCloseCategory={closeCategory}
          onToggleEdit={toggleEdit}
          onSave={handleSave}
          categoryBackLabel={fromMap ? t('profile.forYou.beauty.title') : undefined}
        />
      );
      break;
    case 'maintenance':
      content = (
        <MaintenanceView
          userId={user?.id ?? null}
          state={maintenance}
          focusItemId={focusItemId}
          busyItemId={rebookingId}
          onBack={() => setView('landing')}
          onItemAction={(item, action) => { void handleItemAction(item, action); }}
          onOpenSetup={() => openSetup(1)}
          pickedCount={pickedCount}
          onOpenPicked={() => openSetup(3)}
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
          startStep={setupStart}
          backRef={setupBackRef}
        />
      );
      break;
    default:
      content = (
        <BeautyMapLanding
          profile={draft}
          stats={stats}
          maintenance={maintenance}
          figurePrefs={figurePrefs}
          onFigurePrefsChange={setFigurePrefs}
          circle={circle}
          onBack={() => navigation.goBack()}
          onEditCategory={openCategoryFromMap}
          onOpenHealth={() => openCategoryFromMap('health')}
          onOpenAllProfile={() => { setFromMap(false); setSelectedCategory(null); setView('profile'); }}
          onOpenMaintenance={() => setView('maintenance')}
          onOpenSetup={() => openSetup(1)}
          onOpenCircle={() => navigation.navigate('Circle')}
          onBook={item => { void handleItemAction(item, item.kind === 'service' && item.providerId ? 'rebook' : 'find'); }}
          onDone={item => { void runCardAction(item, 'done'); }}
          onSnooze={item => { void runCardAction(item, 'snooze'); }}
          busyItemId={cardBusyId ?? rebookingId}
          todo={todo}
          onOpenTodoField={openTodoField}
          onOpenAccountDetails={() => navigation.navigate('ProfileInfo')}
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
