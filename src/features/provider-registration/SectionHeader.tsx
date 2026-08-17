import React from 'react';
import { Text, View } from 'react-native';

interface SectionHeaderProps {
  index: number;
  title: string;
  accentColor: string;
  styles: any;
  withAlpha: (color: string, alpha: number) => string;
}

/** Consistent numbered heading for provider-registration editor sections. */
export function SectionHeader({ index, title, accentColor, styles, withAlpha }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionHeaderChip, { backgroundColor: withAlpha(accentColor, 0.14), borderColor: withAlpha(accentColor, 0.30) }]}>
        <Text style={[styles.sectionHeaderChipText, { color: accentColor }]}>{index}</Text>
      </View>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
    </View>
  );
}
