import React, { ReactNode } from 'react';
import { ViewStyle } from 'react-native';
import { ThemedBackground } from './ThemedBackground';

interface AppBackgroundProps {
  children: ReactNode;
  style?: ViewStyle;
}

export default function AppBackground({ children, style }: AppBackgroundProps) {
  return <ThemedBackground style={style}>{children}</ThemedBackground>;
}
