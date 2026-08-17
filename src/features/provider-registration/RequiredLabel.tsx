import React from 'react';
import { Text } from 'react-native';

interface RequiredLabelProps {
  children: React.ReactNode;
  required?: boolean;
  styles: any;
}

/** Form label with an optional required-field marker. */
export function RequiredLabel({ children, required, styles }: RequiredLabelProps) {
  return (
    <Text style={styles.inputLabel}>
      {children}
      {required && <Text style={styles.requiredStar}> *</Text>}
    </Text>
  );
}
