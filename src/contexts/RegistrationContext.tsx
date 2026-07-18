// src/contexts/RegistrationContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountType } from './AuthContext';
import { STORAGE_KEYS } from '../utils/storageKeys';

export interface RegistrationData {
  accountType: AccountType;
  name: string;
  email: string;
  phone: string;
  password: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  instagram: string;
  tiktok: string;
  website: string;
  // Beauty profile — shown to providers
  hairType: string;
  skinType: string;
  allergies: string[];
  skinConcerns: string[];
  styleVibe: string;
  treatmentHistory: string[];
  medicalNotes: string;
  photographyConsent: boolean;
  // Preferences — for matching / discovery only
  serviceInterests: string[];
  serviceLocations: string[];
  maintenanceFrequency: string;
  referralSource: string;
  // Personalisation — affects home feed gating
  gender: 'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null;
  has_kids: boolean | null;
  // Set when a logged-in client starts the provider upgrade flow
  fromProviderSwitch: boolean;
  // Set when a logged-in provider starts the client registration flow
  fromClientSwitch: boolean;
}

interface RegistrationContextType {
  data: RegistrationData;
  updateData: (partial: Partial<RegistrationData>) => void;
  resetData: () => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  totalSteps: number;
}

const initialData: RegistrationData = {
  accountType: 'user',
  name: '',
  email: '',
  phone: '',
  password: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  businessName: '',
  businessEmail: '',
  businessPhone: '',
  instagram: '',
  tiktok: '',
  website: '',
  // Beauty profile
  hairType: '',
  skinType: '',
  allergies: [],
  skinConcerns: [],
  styleVibe: '',
  treatmentHistory: [],
  medicalNotes: '',
  photographyConsent: true,
  // Preferences
  serviceInterests: [],
  serviceLocations: [],
  maintenanceFrequency: '',
  referralSource: '',
  // Personalisation
  gender: null,
  has_kids: null,
  fromProviderSwitch: false,
  fromClientSwitch: false,
};

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RegistrationData>(initialData);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  // Rehydrate draft from AsyncStorage on mount so a user can resume
  // a partially completed registration after closing the app.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.REGISTRATION_DRAFT)
      .then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<RegistrationData>;
          setData(prev => ({ ...prev, ...parsed }));
        }
      })
      .catch(() => {}); // silent — don't block registration if storage fails
  }, []);

  const updateData = useCallback((partial: Partial<RegistrationData>) => {
    setData(prev => {
      const next = { ...prev, ...partial };
      // Persist draft excluding password (sensitive — never stored on device)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _pw, ...safeData } = next;
      AsyncStorage.setItem(
        STORAGE_KEYS.REGISTRATION_DRAFT,
        JSON.stringify(safeData)
      ).catch(() => {});
      return next;
    });
  }, []);

  const resetData = useCallback(() => {
    setData(initialData);
    setCurrentStep(1);
    AsyncStorage.removeItem(STORAGE_KEYS.REGISTRATION_DRAFT).catch(() => {});
  }, []);

  return (
    <RegistrationContext.Provider
      value={{ data, updateData, resetData, currentStep, setCurrentStep, totalSteps }}
    >
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration() {
  const context = useContext(RegistrationContext);
  if (context === undefined) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
}
