// src/contexts/RegistrationContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
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
  serviceInterests: string[];
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
  serviceInterests: [],
};

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RegistrationData>(initialData);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const updateData = (partial: Partial<RegistrationData>) => {
    setData(prev => ({ ...prev, ...partial }));
  };

  const resetData = () => {
    setData(initialData);
    setCurrentStep(1);
  };

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
