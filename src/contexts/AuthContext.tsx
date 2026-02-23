// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage, STORAGE_KEYS } from '../utils/storage';

export type AccountType = 'user' | 'provider';

export interface UserData {
  name: string;
  email: string;
  phone: string;
  dob: string;
  accountType: AccountType;
  loginMethod: string;
  businessName?: string;
  businessEmail?: string;
}

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: UserData | null;
  login: (userData?: UserData) => void;
  logout: () => void;
  updateUser: (partial: Partial<UserData>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);

  // Restore session from persistent storage on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedUser = await storage.getItem<UserData>(STORAGE_KEYS.USER_DATA);
        if (storedUser) {
          // Migrate existing users without phone field
          const migrated: UserData = {
            ...storedUser,
            phone: storedUser.phone ?? '',
          };
          setUser(migrated);
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error('Error restoring auth session:', error);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = async (userData?: UserData) => {
    if (userData) {
      setUser(userData);
      await storage.setItem(STORAGE_KEYS.USER_DATA, userData);
    }
    setIsLoggedIn(true);
  };

  const updateUser = async (partial: Partial<UserData>) => {
    if (!user) return;
    const updated = { ...user, ...partial };
    setUser(updated);
    await storage.setItem(STORAGE_KEYS.USER_DATA, updated);
  };

  const logout = async () => {
    setUser(null);
    setIsLoggedIn(false);
    await storage.removeItem(STORAGE_KEYS.USER_DATA);
    await storage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, user, login, logout, updateUser }}>
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