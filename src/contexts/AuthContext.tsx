// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications, unregisterPushToken, startExpoGoNotificationBridge } from '../services/pushNotificationService';
import { updateBiometricToken, disableBiometric } from '../services/biometricService';
import { registerModeSetter } from '../navigation/modeController';
import {
  getUserProfileById,
  upgradeUserToProvider,
  updateClientProfileData,
  updateUserNamePhone,
} from '../services/databaseService';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { logger } from '../utils/logger';

export type AccountType = 'user' | 'provider';

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
  upgradeToProvider: (businessName: string, businessEmail: string, extras?: { businessPhone?: string; instagram?: string; tiktok?: string; website?: string }) => Promise<void>;
  addClientProfile: (profileData: ClientProfileData) => Promise<void>;
  login: (userData?: UserData) => void;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<UserData>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [activeMode, setActiveMode] = useState<'provider' | 'client'>('client');
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<'provider' | 'client'>('client');
  // Tracks user-initiated logouts so SIGNED_OUT doesn't show a spurious alert
  const intentionalLogoutRef = useRef(false);

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
        supabase.auth.startAutoRefresh();
        // Keep the push token fresh on every resume, not just on cold launch / login.
        // This self-heals tokens after an APNs-key rotation or EAS project migration
        // without requiring the user to sign out and back in. Safe no-op when logged out.
        registerForPushNotifications().catch((err) => console.warn('[Push] foreground refresh failed:', err));
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    // onAuthStateChange fires INITIAL_SESSION immediately on subscribe,
    // so we only use it as the single source of truth — no separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
          await supabase.auth.signOut().catch(() => {});
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
        setIsLoading(false);
        return;
      }
      setSession(session);
      if (session?.user) {
        await loadUserProfile(session);
      } else {
        setUser(null);
        setIsLoggedIn(false);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const loadUserProfile = async (session: Session) => {
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
        setActiveMode(
          savedMode === 'provider' || savedMode === 'client'
            ? savedMode
            : role === 'provider' ? 'provider' : 'client'
        );
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
        });
        setIsLoggedIn(true);
        registerForPushNotifications().catch((err) => console.warn('[Push] registration failed:', err));
        return;
      }

      if (profile) {
        logger.log('[AuthContext] profile found — role:', profile.role);
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
          hasClientProfile: !!profile.dob,
          gender: (profile as any).gender ?? null,
          has_kids: (profile as any).has_kids ?? null,
          birth_year: (profile as any).birth_year ?? null,
          service_interests: profile.service_interests ?? null,
        };
        const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
        setActiveMode(
          savedMode === 'provider' || savedMode === 'client'
            ? savedMode
            : role === 'provider' ? 'provider' : 'client'
        );
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
  };

  // Directly set the mode (used by notification taps / deep-links that must land
  // in a specific hat). Exposed to non-React code via the mode controller so the
  // push tap handler can switch hats before deep-linking.
  const applyMode = useCallback(async (mode: 'provider' | 'client') => {
    setActiveMode(mode);
    await AsyncStorage.setItem('@active_mode', mode).catch(() => {});
  }, []);

  useEffect(() => {
    registerModeSetter((mode) => { applyMode(mode).catch(() => {}); });
  }, [applyMode]);

  const switchMode = async () => {
    const next = activeMode === 'provider' ? 'client' : 'provider';
    setSwitchingTo(next);
    setIsSwitching(true);
    // Brief pause so the overlay renders before the navigator swaps
    await new Promise(resolve => setTimeout(resolve, 300));
    setActiveMode(next);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, next).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 600));
    setIsSwitching(false);
  };

  // Upgrades an existing client account to provider in-place — no new auth user created.
  // Updates the DB role, local state, and activeMode all in one call.
  const upgradeToProvider = async (
    businessName: string,
    businessEmail: string,
    extras?: { businessPhone?: string; instagram?: string; tiktok?: string; website?: string }
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
  };

  // Adds a client profile to an existing provider account in-place.
  // Saves beauty profile + preferences to DB, then switches activeMode to client.
  const addClientProfile = async (profileData: ClientProfileData) => {
    if (!user) throw new Error('No logged-in user');
    const dob = `${profileData.dobYear}-${profileData.dobMonth.padStart(2, '0')}-${profileData.dobDay.padStart(2, '0')}`;
    const { error } = await supabase.from('users').update({
      dob,
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
    }).eq('id', user.id);
    if (error) throw error;
    setUser({ ...user, dob, hasClientProfile: true });
    setActiveMode('client');
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, 'client').catch(() => {});
  };

  // No-op: only called from AuthScreen which is not in the navigation stack.
  // All real auth goes through onAuthStateChange → loadUserProfile.
  const login = (_userData?: UserData) => {};

  const updateUser = async (partial: Partial<UserData>) => {
    if (!user || !session) return;
    const updated = { ...user, ...partial };
    setUser(updated);
    try {
      await updateUserNamePhone(updated.id, updated.name, updated.phone ?? '');
    } catch (err: any) {
      logger.warn('updateUser DB error:', err.message);
    }
  };

  const logout = async () => {
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
      '@bookings',
      STORAGE_KEYS.ACTIVE_MODE,
    ]).catch(() => {});
    await unregisterPushToken().catch(() => {});
    disableBiometric().catch(() => {});
    // Await signOut so the session is fully cleared in AsyncStorage before the
    // function returns. If the app is killed immediately after logout, the session
    // won't linger and re-log the user in on next launch.
    await supabase.auth.signOut().catch(err => logger.warn('signOut error:', err));
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, isSwitching, switchingTo, user, session, activeMode, switchMode, upgradeToProvider, addClientProfile, login, logout, updateUser }}>
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