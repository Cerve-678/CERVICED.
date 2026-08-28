import React from 'react';
import { Text, View } from 'react-native';

interface RequiredLabelProps {
  children: React.ReactNode;
  required?: boolean;
  /** True only when this field is required AND currently empty. Renders the
   *  amber "Required" flag beside the label so the reason publishing is
   *  blocked is visible at the field itself, not only in the roll-up above the
   *  Publish button. Both read from the same `missingRequired` source, so the
   *  inline flag and the summary can never disagree. */
  missing?: boolean;
  /** Overrides the default `styles.inputLabel`. The service sheet uses its own
   *  smaller uppercase label, so it passes that in rather than every screen
   *  sharing one label size. */
  labelStyle?: any;
  styles: any;
}

/** Form label with an optional required-field marker, plus an inline
 *  still-needed flag for the continuous-document layout (which has no hub to
 *  collect those warnings on). */
export function RequiredLabel({ children, required, missing, labelStyle, styles }: RequiredLabelProps) {
  const label = (
    <Text style={labelStyle ?? styles.inputLabel}>
      {children}
      {required && <Text style={styles.requiredStar}> *</Text>}
    </Text>
  );
  if (!missing) return label;
  return (
    <View style={styles.docFieldRow}>
      {label}
      <Text style={styles.docFieldFlag}>Required</Text>
    </View>
  );
}
