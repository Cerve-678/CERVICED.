// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';import AsyncStorage from '@react-native-async-storage/async-storage';import { supabase } from '../lib/supabase';
import { registerForPushNotifications, unregisterPushToken } from '../services/pushNotificationService';

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
}

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: UserData | null;
  session: Session | null;
  login: (userData?: UserData) => void;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<UserData>) => Promise<void>;
  switchRole: (role: AccountType) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let loadingResolved = false;
    const resolveLoading = () => {
      if (!loadingResolved) {
        loadingResolved = true;
        setIsLoading(false);
      }
    };

    // ── FAST PATH ──────────────────────────────────────────────────────────
    // Read the raw session straight from AsyncStorage (what Supabase stores).
    // If we find a saved session we immediately show the app — the user never
    // waits for a network token-refresh on startup.
    AsyncStorage.getItem('supabase.auth.token')
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          const cachedSession: Session | null =
            parsed?.currentSession ?? parsed ?? null;
          if (cachedSession?.user?.email_confirmed_at && cachedSession.user.id) {
            console.log('[AuthContext] Fast-path: seeding from cache for', cachedSession.user.id);
            const u = cachedSession.user;
            const meta = u.user_metadata ?? {};
            setUser({
              id: u.id,
              name: meta.name ?? '',
              email: u.email ?? '',
              phone: meta.phone ?? '',
              dob: meta.dob ?? '',
              accountType: (meta.role as AccountType) ?? 'user',
              loginMethod: meta.login_method ?? 'email',
            });
            setIsLoggedIn(true);
            setSession(cachedSession);
            resolveLoading(); // app is visible immediately
          }
        } catch (_) {}
      })
      .catch(() => {});

    // ── SAFETY NET ─────────────────────────────────────────────────────────
    // If neither the cache read nor onAuthStateChange resolves within 10 s,
    // force the loading screen away so the user can at least see login.
    const safetyTimer = setTimeout(() => {
      console.warn('[AuthContext] Safety timeout — forced isLoading to false');
      resolveLoading();
    }, 10000);

    // ── AUTHORITATIVE PATH ─────────────────────────────────────────────────
    // onAuthStateChange fires INITIAL_SESSION (with a fresh token if needed)
    // and keeps running for all future auth events.  It may be slow on first
    // open if the token is expired — but because we already showed the app
    // via the fast path above, the user sees no spinner.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(safetyTimer);
      console.log('[AuthContext] onAuthStateChange event:', event, '| user:', session?.user?.id ?? 'none');

      if (event === 'PASSWORD_RECOVERY') {
        setSession(session);
        resolveLoading();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setIsLoggedIn(false);
        setSession(null);
        resolveLoading();
        return;
      }

      setSession(session);
      if (session?.user) {
        await loadUserProfile(session); // updates user/isLoggedIn, calls resolveLoading inside
      } else {
        setUser(null);
        setIsLoggedIn(false);
        resolveLoading();
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (session: Session) => {
    try {
      console.log('[AuthContext] loadUserProfile for:', session.user.id, '| email_confirmed_at:', session.user.email_confirmed_at ?? 'NOT CONFIRMED');
      // Block unverified users from being logged in
      if (!session.user.email_confirmed_at) {
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }
      // Race the DB fetch against a 6 s timeout — if the network is slow on startup
      // we still let the user in using their session metadata.
      let profile: any = null;
      let profileError: any = null;
      try {
        const result = await Promise.race([
          supabase.from('users').select('*').eq('id', session.user.id).single(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('profile_timeout')), 6000)
          ),
        ]);
        profile = result.data;
        profileError = result.error;
      } catch (fetchErr: any) {
        if (fetchErr?.message === 'profile_timeout') {
          console.warn('[AuthContext] Profile DB fetch timed out — logging in with session data');
          // Let the user in with what we know from the session so the app doesn\'t hang.
          setUser({
            id: session.user.id,
            name: session.user.user_metadata?.name ?? '',
            email: session.user.email ?? '',
            phone: '',
            dob: '',
            accountType: 'user',
            loginMethod: 'email',
          });
          setIsLoggedIn(true);
          return; // finally will still run
        }
        throw fetchErr; // unexpected error — re-throw to outer catch
      }

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = row not found, which is fine for new users
        console.warn('Error fetching profile:', profileError.message);
      }

      if (profile) {
        console.log('[AuthContext] profile found — role:', profile.role);
        const userData: UserData = {
          id: profile.id,
          name: profile.name ?? '',
          email: profile.email ?? session.user.email ?? '',
          phone: profile.phone ?? '',
          dob: profile.dob ?? '',
          accountType: (profile.role as AccountType) ?? 'user',
          loginMethod: profile.login_method ?? 'email',
          businessName: profile.business_name,
          businessEmail: profile.business_email,
          needsEmailVerification: !session.user.email_confirmed_at,
        };
        setUser(userData);
        setIsLoggedIn(true);
        console.log('[AuthContext] setIsLoggedIn(true) — navigating in');
        // Register for push notifications — fire and forget, never block login
        registerForPushNotifications().catch(() => {});
      } else {
        console.log('[AuthContext] no profile row found — signing out');
        // No profile row in DB — user was deleted or never completed registration.
        // Sign out so they are routed to the login screen, not shown a ghost account.
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setIsLoggedIn(false);
    } finally {
      // Always clear the loading spinner — fast-path may have already done this,
      // but calling it again is safe (it's idempotent).
      setIsLoading(false);
    }
  };

  // Kept for compatibility — screens that call login() directly after signUp
  const login = (userData?: UserData) => {
    if (userData) {
      setUser(userData);
      setIsLoggedIn(true);
    }
  };

  const updateUser = async (partial: Partial<UserData>) => {
    if (!user || !session) return;
    const updated = { ...user, ...partial };
    setUser(updated);
    const { error } = await supabase.from('users').update({
      name: updated.name,
      phone: updated.phone,
    }).eq('id', updated.id);
    if (error) console.warn('updateUser DB error:', error.message);
  };

  const switchRole = async (role: AccountType) => {
    if (!user) return;
    const { error } = await supabase.from('users').update({ role }).eq('id', user.id);
    if (error) throw new Error(error.message);
    setUser({ ...user, accountType: role });
  };

  const logout = async () => {
    // Clear state immediately so the navigator switches to auth screens right away
    setUser(null);
    setIsLoggedIn(false);
    setSession(null);
    // Clear all user-specific AsyncStorage keys so they don't bleed into the next account
    await AsyncStorage.multiRemove([
      '@app_notifications',
      '@user_learning_data',
      '@provider_reg_data',
      'bookmarked_videos',
      'saved_portfolio_items',
      'planner_events',
      '@bookings',
      '@bookings_owner',
    ]).catch(() => {});
    // Remove push token so this device stops receiving notifications for this account
    await unregisterPushToken().catch(() => {});
    // Fire Supabase signOut in the background
    supabase.auth.signOut().catch(err => console.warn('signOut error:', err));
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, user, session, login, logout, updateUser, switchRole }}>
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