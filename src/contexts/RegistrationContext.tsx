// src/contexts/RegistrationContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountType } from './AuthContext';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { logger } from '../utils/logger';

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
  // A BusinessType value (or '' before the picker is answered) — asked once
  // here instead of only in the post-login provider profile screen, since it
  // also decides whether a private address needs to be collected there. Kept
  // as `string` because this context is the raw draft the form writes into;
  // InfoRegScreen narrows it through the canonical union on save.
  businessType: string;
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
  // Provider "About your business" (Step 4) — location/pricing/team/contact
  // logistics needed for booking + the business profile. Mirrors columns
  // added in supabase/provider_signup_business_fields.sql.
  priceRange: 'budget' | 'mid' | 'premium' | 'luxury' | '';
  teamSize: 'solo' | 'small_team' | 'large_team' | '';
  preferredContactMethods: string[];
  preferredPaymentMethods: string[];
  // Provider "Tell me more" (Step 5) — accessibility/language/specialty
  // detail, more descriptive than operational.
  accessibilityNotes: string;
  languagesSpoken: string[];
  languagesOther: string;
  specialties: string[];
  specialtiesOther: string;
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
  businessType: '',
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
  // Provider "About your business"
  priceRange: '',
  teamSize: '',
  preferredContactMethods: [],
  preferredPaymentMethods: [],
  // Provider "Tell me more"
  accessibilityNotes: '',
  languagesSpoken: [],
  languagesOther: '',
  specialties: [],
  specialtiesOther: '',
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
      // Never block registration on a storage failure — but it must not vanish:
      // a draft that won't load is why someone reappears at step 1.
      .catch((err) => logger.error('[Registration] draft restore failed:', err));
  }, []);

  const updateData = useCallback((partial: Partial<RegistrationData>) => {
    setData(prev => {
      const next = { ...prev, ...partial };
      // Persist draft excluding password (sensitive — never stored on device)

      const { password: _pw, ...safeData } = next;
      AsyncStorage.setItem(
        STORAGE_KEYS.REGISTRATION_DRAFT,
        JSON.stringify(safeData)
      ).catch((err) => logger.error('[Registration] draft save failed:', err));
      return next;
    });
  }, []);

  const resetData = useCallback(() => {
    setData(initialData);
    setCurrentStep(1);
    AsyncStorage.removeItem(STORAGE_KEYS.REGISTRATION_DRAFT).catch((err) => logger.error('[Registration] draft clear failed:', err));
  }, []);

  const value = useMemo(
    () => ({ data, updateData, resetData, currentStep, setCurrentStep, totalSteps }),
    [data, updateData, resetData, currentStep]
  );

  return (
    <RegistrationContext.Provider value={value}>
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
