// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        await loadUserProfile(session);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
      // Block unverified users from being logged in
      if (!session.user.email_confirmed_at) {
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profile) {
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
      } else {
        // Profile row doesn't exist yet (created by DB trigger shortly after signUp)
        // Build minimal profile from session data
        const meta = session.user.user_metadata;
        const userData: UserData = {
          id: session.user.id,
          name: meta?.name ?? '',
          email: session.user.email ?? '',
          phone: meta?.phone ?? '',
          dob: meta?.dob ?? '',
          accountType: (meta?.role as AccountType) ?? 'user',
          loginMethod: 'email',
          businessName: meta?.business_name,
          businessEmail: meta?.business_email,
          needsEmailVerification: !session.user.email_confirmed_at,
        };
        setUser(userData);
        setIsLoggedIn(true);
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
    if (!user) return;
    const updated = { ...user, ...partial };
    setUser(updated);
    // Sync changes to DB
    await supabase.from('users').update({
      name: updated.name,
      phone: updated.phone,
    }).eq('id', updated.id);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsLoggedIn(false);
    setSession(null);
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