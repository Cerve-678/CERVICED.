// src/contexts/RegistrationContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AccountType } from './AuthContext';

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

  const updateData = useCallback((partial: Partial<RegistrationData>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const resetData = useCallback(() => {
    setData(initialData);
    setCurrentStep(1);
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
