import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

interface HairType {
  id: string;
  name: string;
  description: string;
  curlPattern: 'straight' | '2a' | '2b' | '2c' | '3a' | '3b' | '3c' | '4a' | '4b' | '4c';
}

const hairTypes: HairType[] = [
  { id: 'straight', name: 'Type 1', description: 'Straight', curlPattern: 'straight' },
  { id: '2a', name: 'Type 2A', description: 'Wavy - Loose', curlPattern: '2a' },
  { id: '2b', name: 'Type 2B', description: 'Wavy - Medium', curlPattern: '2b' },
  { id: '2c', name: 'Type 2C', description: 'Wavy - Defined', curlPattern: '2c' },
  { id: '3a', name: 'Type 3A', description: 'Curly - Loose', curlPattern: '3a' },
  { id: '3b', name: 'Type 3B', description: 'Curly - Tight', curlPattern: '3b' },
  { id: '3c', name: 'Type 3C', description: 'Curly - Corkscrew', curlPattern: '3c' },
  { id: '4a', name: 'Type 4A', description: 'Coily - S Pattern', curlPattern: '4a' },
  { id: '4b', name: 'Type 4B', description: 'Coily - Z Pattern', curlPattern: '4b' },
  { id: '4c', name: 'Type 4C', description: 'Coily - Tight Zigzag', curlPattern: '4c' },
];

interface HairTypeSelectorProps {
  onSelect: (hairType: HairType) => void;
  onBack: () => void;
}

export const HairTypeSelector: React.FC<HairTypeSelectorProps> = ({ onSelect, onBack }) => {
  const { theme, isDarkMode } = useTheme();
  const [selectedType, setSelectedType] = React.useState<string | null>(null);

  return (
    <View style={styles.filterChipsRow}>
      {hairTypes.map((hairType) => {
        const isActive = selectedType === hairType.id;
        return (
          <TouchableOpacity
            key={hairType.id}
            style={[
              styles.filterChip,
              {
                backgroundColor: isActive
                  ? (isDarkMode ? 'rgba(229, 128, 232, 0.3)' : 'rgba(218, 112, 214, 0.2)')
                  : (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.5)'),
                borderTopColor: isActive
                  ? (isDarkMode ? 'rgba(229, 128, 232, 0.6)' : 'rgba(163, 66, 195, 0.6)')
                  : (isDarkMode ? theme.border : 'rgba(255, 255, 255, 0.7)'),
              }
            ]}
            onPress={() => {
              setSelectedType(hairType.id);
              onSelect(hairType);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color: isActive ? theme.accent : theme.text,
                  fontWeight: isActive ? '700' : '500'
                }
              ]}
            >
              {hairType.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'Jura-VariableFont_wght',
  },
});
