import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { createTextStyles, TextStyles } from '../utils/FontManager';

interface FontContextType {
  customFontsLoaded: boolean;
  textStyles: TextStyles;
}

const FontContext = createContext<FontContextType | undefined>(undefined);

interface FontProviderProps {
  children: ReactNode;
  customFontsLoaded: boolean;
}

export function FontProvider({ children, customFontsLoaded }: FontProviderProps) {
  const textStyles = useMemo(() => createTextStyles(customFontsLoaded), [customFontsLoaded]);
  const value = useMemo(() => ({ customFontsLoaded, textStyles }), [customFontsLoaded, textStyles]);

  return (
    <FontContext.Provider value={value}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont(): FontContextType {
  const context = useContext(FontContext);
  if (context === undefined) {
    throw new Error('useFont must be used within a FontProvider');
  }
  return context;
}