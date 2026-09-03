// src/contexts/RegistrationContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountType, useAuth } from './AuthContext';
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
  // Single coarse area — same AreaPicker InfoReg's "Where you're based" uses,
  // staged on users.location_text (see
  // provider_signup_location_staging.sql) until InfoReg's first save carries
  // it into providers.location_text. Distinct from serviceLocations (the
  // multi-city "cities you cover" field), which this no longer collects for
  // providers at signup — that's set post-signup in Business Details.
  location: string;
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
  location: '',
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
  const { isLoggedIn } = useAuth();
  const wasLoggedIn = useRef(isLoggedIn);

  // Rehydrate draft from AsyncStorage on mount so a user can resume
  // a partially completed registration after closing the app.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.REGISTRATION_DRAFT)
      .then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<RegistrationData>;
          // fromClientSwitch/fromProviderSwitch are single-use "this device
          // is mid-way through a logged-in hat-switch right now" signals,
          // never a draft worth resuming across an app restart — the app may
          // no longer even be logged in as the account that started it (see
          // the logout-transition effect below, and the bug this closes: a
          // stale TRUE here sent a brand-new signup through addClientProfile/
          // upgradeToProvider instead of signUpWithEmail, which threw "No
          // logged-in user"). Always land false on rehydrate; a live
          // in-progress switch sets it itself moments after this runs.
          setData(prev => ({
            ...prev,
            ...parsed,
            fromClientSwitch: false,
            fromProviderSwitch: false,
          }));
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

  // A real logout (was logged in, now isn't) must not leave the previous
  // account's sign-up draft sitting around — otherwise the next person to
  // sign up (or the same person signing up again) on this device sees a
  // stranger's name/email/phone/DOB/business details pre-filled. logout()
  // in AuthContext can't clear this itself (RegistrationProvider is nested
  // INSIDE AuthProvider, so it's the only side that can see both), and this
  // must be a login->logout transition specifically, not just "not logged
  // in" — that's also true before someone has signed up at all, which is
  // exactly the case the AsyncStorage rehydration above exists to support
  // (resuming a draft after closing the app mid-signup).
  useEffect(() => {
    if (wasLoggedIn.current && !isLoggedIn) {
      resetData();
    }
    wasLoggedIn.current = isLoggedIn;
  }, [isLoggedIn, resetData]);

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
