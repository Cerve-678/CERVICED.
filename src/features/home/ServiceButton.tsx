import React, { memo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface ServiceButtonProps {
  service: string;
  isSelected: boolean;
  onPress: () => void;
  onBack?: () => void;
  showBackArrow?: boolean;
}

/** Home discovery service filter control. */
export const ServiceButton = memo<ServiceButtonProps>(({ service, isSelected, onPress }) => {
  const { palette: P } = useTheme();
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.card, { backgroundColor: isSelected ? P.accent : P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[styles.text, { color: isSelected ? P.onAccent : P.text }]}>{service}</Text>
      </View>
    </TouchableOpacity>
  );
});
ServiceButton.displayName = 'ServiceButton';

const styles = StyleSheet.create({
  button: { marginRight: 10 },
  card: { borderRadius: 14, paddingHorizontal: Platform.OS === 'android' ? 18 : 22, height: Platform.OS === 'android' ? 30 : 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
});
