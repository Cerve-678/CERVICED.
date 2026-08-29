// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications, unregisterPushToken, startExpoGoNotificationBridge } from '../services/pushNotificationService';
import { updateBiometricToken } from '../services/biometricService';
import { registerModeSetter, resolveModeChange } from '../navigation/modeController';
import {
  getUserProfileById,
  upgradeUserToProvider,
  updateUserContactDetails,
  updateClientProfileFields,
  cancelAccountDeletionRequest,
  deleteClientAccountProfile,
  deleteProviderAccountProfile,
  clearUserStorageFolder,
  setAuthAutoRefresh,
  signOutCurrentSession,
  subscribeToAuthStateChanges,
} from '../services/databaseService';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { logger } from '../utils/logger';
import { accountHats, resolveRestoredMode } from '../utils/accountHats';
import type { AccountType } from '../utils/accountHats';

// Defined alongside the hat-ownership rules in src/utils/accountHats.ts and
// re-exported here, which is where the rest of the app already imports it from.
export type { AccountType } from '../utils/accountHats';

export interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  accountType: AccountType;
  loginMethod: string;
  businessName?: string;
  businessEmail?: string;
  // Saved default address for mobile bookings, prefilled at checkout. Client
  // side only — a provider's own address lives on their provider record.
  clientAddress?: string | null;
  // The coarse half of the same answer: the area the client says they're in
  // ("Camden, London"), shown to a mobile provider before they accept while
  // clientAddress stays gated. Chosen, not derived — see migration
  // 20260827162000.
  clientArea?: string | null;
  needsEmailVerification?: boolean;
  hasClientProfile?: boolean;
  gender?: 'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null;
  has_kids?: boolean | null;
  birth_year?: number | null;
  service_interests?: string[] | null;
}

export interface ClientProfileData {
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  hairType: string;
  skinType: string;
  skinConcerns: string[];
  styleVibe: string;
  allergies: string[];
  treatmentHistory: string[];
  medicalNotes: string;
  photographyConsent: boolean;
  serviceInterests: string[];
  serviceLocations: string[];
  maintenanceFrequency: string;
  referralSource: string;
  gender?: 'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null;
  has_kids?: boolean | null;
}

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  isSwitching: boolean;
  switchingTo: 'provider' | 'client';
  user: UserData | null;
  session: Session | null;
  activeMode: 'provider' | 'client';
  switchMode: () => Promise<void>;
  upgradeToProvider: (businessName: string, businessEmail: string, extras?: {
    businessPhone?: string; instagram?: string; tiktok?: string; website?: string; businessType?: string;
    dobDay?: string; dobMonth?: string; dobYear?: string;
    serviceInterests?: string[]; serviceLocations?: string[];
    priceRange?: string; teamSize?: string; preferredContactMethods?: string[];
    accessibilityNotes?: string; languagesSpoken?: string[]; specialties?: string[];
    preferredPaymentMethods?: string[];
    referralSource?: string;
  }) => Promise<void>;
  addClientProfile: (profileData: ClientProfileData) => Promise<void>;
  login: (userData?: UserData) => void;
  logout: () => Promise<void>;
  deleteClientProfile: () => Promise<void>;
  deleteProviderProfile: () => Promise<void>;
  updateUser: (partial: Partial<UserData>) => Promise<void>;
  /** Set (to the ISO deletion_requested_at) when this login belongs to an
   *  account mid-30-day grace period — RootNavigation shows ReactivateAccountScreen
   *  instead of the normal app while this is non-null. */
  pendingReactivation: string | null;
  isReactivating: boolean;
  reactivateAccount: () => Promise<void>;
  declineReactivation: () => Promise<void>;
}

/** Turns a failed delete_client_profile/delete_provider_profile RPC result
 *  into a message worth showing the user (as opposed to a raw error code). */
function accountDeletionError(data: any): Error {
  if (data?.error === 'upcoming_bookings') {
    const count = data?.count ?? 0;
    return new Error(
      `You have ${count} upcoming appointment${count === 1 ? '' : 's'}. Please cancel or complete ${count === 1 ? 'it' : 'them'} first.`
    );
  }
  return new Error(data?.error || 'Could not delete your account.');
}

/** Best-effort cleanup of a user's own <uid>/ folder in a storage bucket —
 *  deleting the DB rows that referenced these files doesn't remove the
 *  actual objects, which would otherwise stay publicly reachable forever.
 *  Failures must never block account deletion, but they also must never
 *  vanish silently — log them so an orphaned file is at least debuggable. */
async function clearStorageFolder(bucket: string, uid: string): Promise<void> {
  try {
    await clearUserStorageFolder(bucket, uid);
  } catch (err: any) {
    logger.warn(`[AuthContext] storage cleanup threw (${bucket}/${uid}):`, err?.message ?? err);
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [activeMode, setActiveMode] = useState<'provider' | 'client'>('client');
  // Mirrors activeMode for applyMode's noop check without pulling activeMode
  // into that callback's deps (which would otherwise force it to be
  // re-created — and re-registered via registerModeSetter — on every switch).
  const activeModeRef = useRef(activeMode);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<'provider' | 'client'>('client');
  const [pendingReactivation, setPendingReactivation] = useState<string | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);
  // Tracks user-initiated logouts so SIGNED_OUT doesn't show a spurious alert
  const intentionalLogoutRef = useRef(false);
  // The auth subscription is intentionally installed once. Keep the latest
  // profile loader in a ref so it does not close over stale role-resolution
  // logic without repeatedly tearing down the Supabase subscription.
  const loadUserProfileRef = useRef<(activeSession: Session) => Promise<void>>(async () => {});

  // Expo Go can't receive remote push (dropped in SDK 53) — mirror notification
  // rows as local notifications instead so content is still visible while
  // testing there. No-op on real builds. Re-subscribes whenever the logged-in
  // user changes, tears down on logout.
  useEffect(() => {
    if (!user?.id) return;
    const stopBridge = startExpoGoNotificationBridge(user.id);
    return stopBridge;
  }, [user?.id]);

  useEffect(() => {
    // Stop auto-refresh while backgrounded; restart when foregrounded.
    // Without this, the access token can expire while the app is in the background
    // and the first API call on foreground will get a 401 before the refresh completes.
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setAuthAutoRefresh(true);
        // Keep the push token fresh on every resume, not just on cold launch / login.
        // This self-heals tokens after an APNs-key rotation or EAS project migration
        // without requiring the user to sign out and back in. Safe no-op when logged out.
        registerForPushNotifications().catch((err) => console.warn('[Push] foreground refresh failed:', err));
      } else {
        setAuthAutoRefresh(false);
      }
    });

    // onAuthStateChange fires INITIAL_SESSION immediately on subscribe,
    // so we only use it as the single source of truth — no separate getSession() call.
    const unsubscribeAuth = subscribeToAuthStateChanges(async (event, session) => {
      logger.log('[AuthContext] onAuthStateChange event:', event, '| user:', session?.user?.id ?? 'none');
      // Don't auto-login during password recovery — let ResetPasswordOTP navigate to NewPassword
      if (event === 'PASSWORD_RECOVERY') {
        setSession(session);
        setIsLoading(false);
        return;
      }
      // TOKEN_REFRESHED: session is already updated. Don't re-run loadUserProfile —
      // a concurrent second call races with INITIAL_SESSION and whichever finishes
      // last would overwrite activeMode non-deterministically.
      if (event === 'TOKEN_REFRESHED') {
        if (!session) {
          intentionalLogoutRef.current = true;
          await signOutCurrentSession().catch(() => {});
          setUser(null);
          setIsLoggedIn(false);
          setSession(null);
          setIsLoading(false);
        } else if (session.refresh_token) {
          updateBiometricToken(session.refresh_token).catch(() => {});
        }
        return;
      }
      // USER_UPDATED fires when auth metadata changes (e.g. beauty profile save).
      // Session already has updated metadata — no need to reload from DB.
      if (event === 'USER_UPDATED') {
        setSession(session);
        return;
      }
      // SIGNED_OUT can be user-initiated (via logout()) or server-side (password changed
      // on another device, admin revocation, refresh token expired). Show an alert only
      // for the latter so the user isn't confused why they're on the login screen.
      if (event === 'SIGNED_OUT') {
        if (!intentionalLogoutRef.current) {
          Alert.alert('Signed out', "You've been signed out. Please sign in again.");
        }
        intentionalLogoutRef.current = false;
        setUser(null);
        setIsLoggedIn(false);
        setSession(null);
        setPendingReactivation(null);
        setIsLoading(false);
        return;
      }
      setSession(session);
      if (session?.user) {
        await loadUserProfileRef.current(session);
      } else {
        setUser(null);
        setIsLoggedIn(false);
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      appStateSub.remove();
    };
  }, []);

  const loadUserProfile = useCallback(async (session: Session) => {
    try {
      logger.log('[AuthContext] loadUserProfile for:', session.user.id, '| email_confirmed_at:', session.user.email_confirmed_at ?? 'NOT CONFIRMED');

      // The ONLY hard block: unverified email. Every other failure (DB errors,
      // missing rows, RLS, expired token mid-refresh) must NOT kick a signed-in
      // user back to the auth screen — that's a logout they didn't ask for.
      if (!session.user.email_confirmed_at) {
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }

      const meta = session.user.user_metadata as Record<string, any>;

      let profile = null;
      let profileError: Error | null = null;
      try {
        profile = await getUserProfileById(session.user.id);
      } catch (err: any) {
        profileError = err;
      }

      if (profileError) {
        // Transient failure — network, 401 from expired token before auto-refresh
        // completes, RLS policy, etc. Session is valid; keep the user logged in
        // using whatever is known from session metadata.
        logger.warn('[AuthContext] profile fetch error — staying logged in via metadata:', profileError.message);
        const role = (meta?.['role'] as AccountType) ?? 'user';
        const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
        // null, not false: see resolveRestoredMode. This branch has no profile
        // row to read the client hat from, so it must not assert its absence.
        setActiveMode(resolveRestoredMode(savedMode, role, null));
        setUser({
          id: session.user.id,
          name: meta?.['name'] ?? session.user.email?.split('@')[0] ?? '',
          email: session.user.email ?? '',
          phone: meta?.['phone'] ?? '',
          dob: meta?.['dob'] ?? '',
          accountType: role,
          loginMethod: 'email',
          businessName: meta?.['business_name'],
          businessEmail: meta?.['business_email'],
          // hasClientProfile is deliberately absent: session metadata doesn't
          // carry it, and this branch only runs when the profile row couldn't be
          // read. Leaving it falsy means a provider briefly sees no client hat
          // rather than one the database hasn't confirmed — don't "fix" this by
          // guessing from role or dob, which is the inference the column replaced.
        });
        setIsLoggedIn(true);
        registerForPushNotifications().catch((err) => logger.warn('[Push] registration failed:', err));
        return;
      }

      if (profile) {
        logger.log('[AuthContext] profile found — role:', profile.role);

        // Account is mid-30-day grace period (see supabase/account_deletion_grace_period.sql)
        // — hold at ReactivateAccountScreen instead of logging in normally.
        // A real session exists (needed to call cancel_account_deletion/sign out),
        // but isLoggedIn stays false so RootNavigation never shows the main app.
        if (profile.deletion_requested_at) {
          logger.log('[AuthContext] account pending deletion — holding for reactivation prompt');
          setUser({
            id: profile.id,
            name: profile.name ?? '',
            email: profile.email ?? session.user.email ?? '',
            phone: profile.phone ?? '',
            dob: profile.dob ?? '',
            accountType: (profile.role as AccountType) ?? 'user',
            loginMethod: profile.login_method ?? 'email',
          });
          setPendingReactivation(profile.deletion_requested_at);
          setIsLoggedIn(false);
          return;
        }

        const role = (profile.role as AccountType) ?? 'user';
        const userData: UserData = {
          id: profile.id,
          name: profile.name ?? '',
          email: profile.email ?? session.user.email ?? '',
          phone: profile.phone ?? '',
          dob: profile.dob ?? '',
          accountType: role,
          loginMethod: profile.login_method ?? 'email',
          ...(profile.business_name != null ? { businessName: profile.business_name } : {}),
          ...(profile.business_email != null ? { businessEmail: profile.business_email } : {}),
          needsEmailVerification: !session.user.email_confirmed_at,
          // Read straight from the column that owns this (migration
          // 20260823105742). It used to be inferred as `role !== 'provider' ||
          // dob != null`, which made a provider's date of birth double as their
          // client-hat marker — so the client->provider upgrade, which never
          // asked for a DOB, dropped the hat on the next launch. Never infer it
          // again; a non-provider row is still true by backfill, not by rule.
          hasClientProfile: profile.has_client_profile === true,
          gender: (profile as any).gender ?? null,
          has_kids: (profile as any).has_kids ?? null,
          birth_year: (profile as any).birth_year ?? null,
          service_interests: profile.service_interests ?? null,
          clientAddress: profile.client_address ?? null,
          clientArea: profile.client_area ?? null,
        };
        const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
        const restoredMode = resolveRestoredMode(savedMode, role, userData.hasClientProfile ?? false);
        setActiveMode(restoredMode);
        // Persist the corrected hat so the stale value can't win a later restore
        // (e.g. if the next launch hits the metadata-fallback path instead).
        if (restoredMode !== savedMode) {
          await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, restoredMode).catch(() => {});
        }
        setUser(userData);
        setIsLoggedIn(true);
        logger.log('[AuthContext] setIsLoggedIn(true) — navigating in');
        registerForPushNotifications().catch((err) => logger.warn('[Push] registration failed:', err));
      } else {
        // PGRST116: no profile row yet.
        // (a) New signup race — upsert in EmailVerificationScreen hasn't completed.
        //     user_metadata carries name/role from signUp call.
        // (b) Missing row for an existing account.
        // In both cases: session is valid, keep the user logged in.
        if (meta?.['name']) {
          logger.log('[AuthContext] no profile row — signup race, using metadata fallback');
          const role = (meta['role'] as AccountType) ?? 'user';
          setUser({
            id: session.user.id,
            name: meta['name'] ?? '',
            email: session.user.email ?? '',
            phone: meta['phone'] ?? '',
            dob: meta['dob'] ?? '',
            accountType: role,
            loginMethod: 'email',
            businessName: meta['business_name'] ?? undefined,
            businessEmail: meta['business_email'] ?? undefined,
          });
          setActiveMode(role === 'provider' ? 'provider' : 'client');
          setIsLoggedIn(true);
          registerForPushNotifications().catch((err) => console.warn('[Push] registration failed:', err));
        } else {
          // No profile row and no metadata — use email-derived name as minimal data.
          // User stays logged in; profile will populate once the DB row is created.
          logger.log('[AuthContext] no profile row and no metadata — logging in with minimal session data');
          setUser({
            id: session.user.id,
            name: session.user.email?.split('@')[0] ?? '',
            email: session.user.email ?? '',
            phone: '',
            dob: '',
            accountType: 'user',
            loginMethod: 'email',
          });
          // accountType is 'user' here, so a stale stored 'provider' must not
          // survive into this branch — it was the only loadUserProfile path
          // that set a user without settling activeMode at all.
          setActiveMode('client');
          setIsLoggedIn(true);
        }
      }
    } catch (error) {
      // Unexpected JS error. Don't sign the user out — the session is still valid.
      // Fall back to session metadata so they stay in the app.
      logger.error('[AuthContext] unexpected error in loadUserProfile:', error);
      try {
        const meta = session.user.user_metadata as Record<string, any>;
        setUser({
          id: session.user.id,
          name: meta?.['name'] ?? session.user.email?.split('@')[0] ?? '',
          email: session.user.email ?? '',
          phone: '',
          dob: '',
          accountType: (meta?.['role'] as AccountType) ?? 'user',
          loginMethod: 'email',
        });
        setIsLoggedIn(true);
      } catch {
        setIsLoggedIn(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  loadUserProfileRef.current = loadUserProfile;

  // Directly set the mode (used by notification taps / deep-links that must land
  // in a specific hat). Exposed to non-React code via the mode controller so the
  // push tap handler can switch hats before deep-linking.
  //
  // This is the one chokepoint every mode-change path (switchMode, and
  // requestMode from outside React) funnels through, so it's the only place
  // that needs to enforce hat ownership. Without this check, a client-only
  // account could be driven into the provider navigator (or vice versa) by
  // anything that can call requestMode/switchMode — e.g. a forged/stray
  // notification payload — even though nothing ever granted that hat.
  // Falls back to whichever hat the account actually holds rather than a
  // silent no-op, so a rejected switch still lands somewhere real.
  const applyMode = useCallback(async (mode: 'provider' | 'client') => {
    const { ownsProvider, ownsClient } = accountHats(user?.accountType, user?.hasClientProfile);
    const allowed = mode === 'provider' ? ownsProvider : ownsClient;
    const resolved = allowed ? mode : (ownsProvider ? 'provider' : 'client');
    if (!allowed) {
      logger.warn(`[AuthContext] applyMode('${mode}') rejected — account does not hold that hat; staying on '${resolved}'`);
    }
    // If this doesn't actually change activeMode (already in `resolved`, or
    // rejected back to the hat we're already in), React bails out of
    // re-rendering — RootNavigation's activeMode effect never re-fires, so
    // resolveModeChange() must be called directly here or requestMode()
    // callers would hang waiting for a re-render that never happens.
    const isNoop = resolved === activeModeRef.current;
    setActiveMode(resolved);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, resolved).catch(() => {});
    if (isNoop) resolveModeChange(resolved);
  }, [user?.accountType, user?.hasClientProfile]);

  useEffect(() => {
    registerModeSetter((mode) => { applyMode(mode).catch(() => {}); });
  }, [applyMode]);

  const switchMode = useCallback(async () => {
    const next = activeMode === 'provider' ? 'client' : 'provider';
    const { ownsProvider, ownsClient } = accountHats(user?.accountType, user?.hasClientProfile);
    const allowed = next === 'provider' ? ownsProvider : ownsClient;
    if (!allowed) {
      logger.warn(`[AuthContext] switchMode() to '${next}' rejected — account does not hold that hat`);
      return;
    }
    setSwitchingTo(next);
    setIsSwitching(true);
    // Brief pause so the overlay renders before the navigator swaps
    await new Promise(resolve => setTimeout(resolve, 300));
    setActiveMode(next);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, next).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 600));
    setIsSwitching(false);
  }, [activeMode, user?.accountType, user?.hasClientProfile]);

  // Upgrades an existing client account to provider in-place — no new auth user created.
  // Updates the DB role, local state, and activeMode all in one call.
  const upgradeToProvider = useCallback(async (
    businessName: string,
    businessEmail: string,
    extras?: {
      businessPhone?: string; instagram?: string; tiktok?: string; website?: string; businessType?: string;
      dobDay?: string; dobMonth?: string; dobYear?: string;
      serviceInterests?: string[]; serviceLocations?: string[];
      priceRange?: string; teamSize?: string; preferredContactMethods?: string[];
      accessibilityNotes?: string; languagesSpoken?: string[]; specialties?: string[];
      preferredPaymentMethods?: string[];
      referralSource?: string;
    }
  ) => {
    if (!user) throw new Error('No logged-in user');
    await upgradeUserToProvider(user.id, businessName, businessEmail, extras);
    const upgraded: UserData = {
      ...user,
      accountType: 'provider',
      businessName,
      businessEmail,
    };
    setUser(upgraded);
    setActiveMode('provider');
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, 'provider').catch(() => {});
  }, [user]);

  // Adds a client profile to an existing provider account in-place.
  // Saves beauty profile + preferences to DB, then switches activeMode to client.
  const addClientProfile = useCallback(async (profileData: ClientProfileData) => {
    if (!user) throw new Error('No logged-in user');
    // Only build a DOB when all three parts are present — an empty part yields a
    // malformed date string like "-00-00" that the DATE column rejects, which
    // surfaced as a generic "something went wrong". When absent, omit it from the
    // update (don't overwrite an existing value with null).
    const dob = profileData.dobYear && profileData.dobMonth && profileData.dobDay
      ? `${profileData.dobYear}-${profileData.dobMonth.padStart(2, '0')}-${profileData.dobDay.padStart(2, '0')}`
      : null;
    try {
      await updateClientProfileFields(user.id, {
      ...(dob ? { dob } : {}),
      hair_type: profileData.hairType || null,
      skin_type: profileData.skinType || null,
      skin_concerns: profileData.skinConcerns,
      style_vibe: profileData.styleVibe || null,
      allergies: profileData.allergies,
      treatment_history: profileData.treatmentHistory,
      medical_notes: profileData.medicalNotes || null,
      photography_consent: profileData.photographyConsent,
      service_interests: profileData.serviceInterests,
      service_locations: profileData.serviceLocations,
      maintenance_frequency: profileData.maintenanceFrequency || null,
      referral_source: profileData.referralSource || null,
      ...(profileData.gender != null ? { gender: profileData.gender } : {}),
      ...(profileData.has_kids != null ? { has_kids: profileData.has_kids } : {}),
      // The hat itself, not a side effect of some other field being filled in.
      has_client_profile: true,
      });
    // Keep the user-facing copy friendly, but record the real Postgres reason
    // (Metro/console only) so any future failure here is diagnosable at a glance.
    } catch (error) { logger.error('addClientProfile failed:', error); throw error; }
    setUser({ ...user, ...(dob ? { dob } : {}), hasClientProfile: true });
    setActiveMode('client');
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, 'client').catch(() => {});
  }, [user]);

  // No-op: only called from AuthScreen which is not in the navigation stack.
  // All real auth goes through onAuthStateChange → loadUserProfile.
  const login = useCallback((_userData?: UserData) => {}, []);

  const updateUser = useCallback(async (partial: Partial<UserData>) => {
    if (!user || !session) return;
    const updated = { ...user, ...partial };
    await updateUserContactDetails(updated.id, {
      name: updated.name,
      phone: updated.phone ?? '',
      // Only written when this call is actually changing it, so an unrelated
      // updateUser({ name }) can't wipe a saved address.
      ...(partial.clientAddress !== undefined ? { clientAddress: partial.clientAddress } : {}),
      ...(partial.clientArea !== undefined ? { clientArea: partial.clientArea } : {}),
    });
    setUser(updated);
  }, [user, session]);

  const logout = useCallback(async () => {
    // Mark as intentional so the SIGNED_OUT event handler suppresses the alert
    intentionalLogoutRef.current = true;
    const loggedOutUserId = user?.id;
    // Clear local state immediately — navigator switches to auth screens right away
    setUser(null);
    setIsLoggedIn(false);
    setSession(null);
    setActiveMode('client');
    // Clear all user-specific AsyncStorage keys so they don't bleed into the next account
    await AsyncStorage.multiRemove([
      '@app_notifications',
      '@user_learning_data',
      ...(loggedOutUserId ? [`@provider_reg_data_${loggedOutUserId}`] : []),
      'bookmarked_videos',
      'saved_portfolio_items',
      'planner_events',
      STORAGE_KEYS.BOOKINGS,
      // Zustand-backed legacy bookings key — BookingContext keeps it in sync,
      // so leaving it behind would bleed this account's bookings into the
      // next account that logs in on this device.
      STORAGE_KEYS.BOOKINGS_STORE_LEGACY,
      STORAGE_KEYS.ACTIVE_MODE,
    ]).catch(() => {});
    await unregisterPushToken().catch(() => {});
    // Biometric enrollment intentionally survives logout — the entire point
    // of enabling Face ID is to skip password re-entry on the NEXT sign-in,
    // and Face ID itself (not this flag) is the actual security gate. Wiping
    // it here would erase it before that next sign-in ever happens. It's
    // still cleared explicitly via the Settings toggle, and self-heals in
    // handleBiometricLogin if the stored token ever turns out to be invalid.
    // Await signOut so the session is fully cleared in AsyncStorage before the
    // function returns. If the app is killed immediately after logout, the session
    // won't linger and re-log the user in on next launch.
    await signOutCurrentSession().catch(err => logger.warn('signOut error:', err));
  }, [user]);

  // Called from ReactivateAccountScreen when someone mid-grace-period logs
  // back in and confirms they want to keep their account. Nothing was ever
  // deleted during the grace window, so clearing the flag is the entire
  // operation — loadUserProfile then re-runs and logs them in normally.
  const reactivateAccount = useCallback(async () => {
    if (!session) throw new Error('No session');
    setIsReactivating(true);
    try {
      const data = await cancelAccountDeletionRequest();
      if (data.ok === false) {
        throw new Error(data.error || 'Could not reactivate your account.');
      }
      setPendingReactivation(null);
      await loadUserProfile(session);
    } finally {
      setIsReactivating(false);
    }
  }, [session, loadUserProfile]);

  // "Not now" on the reactivation prompt — the account stays flagged and the
  // scheduled cron job (process_scheduled_account_deletions) will still purge
  // it once the 30 days are up. Just end this session the same way logout() would.
  const declineReactivation = useCallback(async () => {
    intentionalLogoutRef.current = true;
    setPendingReactivation(null);
    setUser(null);
    setSession(null);
    setIsLoggedIn(false);
    await signOutCurrentSession().catch(err => logger.warn('signOut error:', err));
  }, []);

  // Deletes only the CLIENT side of the account via a SECURITY DEFINER RPC
  // (RLS has no DELETE policy on bookings/notifications, and only that RPC
  // knows whether this is the user's only hat). If there's no provider
  // profile, this removes the whole account, auth.users included, since
  // there'd be nothing left to keep it around for. See supabase/delete_account.sql.
  const deleteClientProfile = useCallback(async () => {
    if (!user) throw new Error('No logged-in user');
    const data = await deleteClientAccountProfile();
    if (data.ok === false) throw accountDeletionError(data);

    await clearStorageFolder('avatars', user.id);

    if ((data as any).full_account_deleted) {
      await logout();
      return;
    }
    // Provider hat kept — drop out of client mode and resync role/profile
    // state from the DB so nothing stale (e.g. hasClientProfile) lingers.
    if (activeMode === 'client') await applyMode('provider');
    if (session) await loadUserProfile(session);
  }, [user, activeMode, session, logout, applyMode, loadUserProfile]);

  // Deletes only the PROVIDER side of the account — mirror of
  // deleteClientProfile above. If there's no client profile, this removes
  // the whole account. See supabase/delete_account.sql.
  const deleteProviderProfile = useCallback(async () => {
    if (!user) throw new Error('No logged-in user');
    const data = await deleteProviderAccountProfile();
    if (data.ok === false) throw accountDeletionError(data);

    await Promise.all([
      clearStorageFolder('provider-logos', user.id),
      clearStorageFolder('service-images', user.id),
      clearStorageFolder('provider-backgrounds', user.id),
      clearStorageFolder('portfolio', user.id),
    ]);

    if ((data as any).full_account_deleted) {
      await logout();
      return;
    }
    // Client hat kept — drop out of provider mode and resync role/profile
    // state from the DB (role is reset to 'user' server-side).
    if (activeMode === 'provider') await applyMode('client');
    if (session) await loadUserProfile(session);
  }, [user, activeMode, session, logout, applyMode, loadUserProfile]);

  const value = useMemo<AuthContextType>(() => ({
    isLoggedIn, isLoading, isSwitching, switchingTo, user, session, activeMode,
    switchMode, upgradeToProvider, addClientProfile, login, logout,
    deleteClientProfile, deleteProviderProfile, updateUser,
    pendingReactivation, isReactivating, reactivateAccount, declineReactivation,
  }), [
    isLoggedIn, isLoading, isSwitching, switchingTo, user, session, activeMode,
    switchMode, upgradeToProvider, addClientProfile, login, logout,
    deleteClientProfile, deleteProviderProfile, updateUser,
    pendingReactivation, isReactivating, reactivateAccount, declineReactivation,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
