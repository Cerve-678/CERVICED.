import React, { createContext, useContext, ReactNode } from 'react';
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
  const textStyles = createTextStyles(customFontsLoaded);

  return (
    <FontContext.Provider value={{ customFontsLoaded, textStyles }}>
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