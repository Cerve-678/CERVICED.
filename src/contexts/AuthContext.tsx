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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on subscribe,
    // so we only use it as the single source of truth — no separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', event, '| user:', session?.user?.id ?? 'none');
      // Don't auto-login during password recovery — let ResetPasswordOTP navigate to NewPassword
      if (event === 'PASSWORD_RECOVERY') {
        setSession(session);
        setIsLoading(false);
        return;
      }
      // Stale/invalid refresh token — sign out silently so the user sees the login screen
      // instead of a console error loop.
      if (event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut().catch(() => {});
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

    return () => subscription.unsubscribe();
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
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

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
    ]).catch(() => {});
    // Remove push token so this device stops receiving notifications for this account
    await unregisterPushToken().catch(() => {});
    // Fire Supabase signOut in the background
    supabase.auth.signOut().catch(err => console.warn('signOut error:', err));
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, user, session, login, logout, updateUser }}>
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