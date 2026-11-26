import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation, tr } from '../i18n';

interface HairType {
  id: string;
  name: string;
  description: string;
  curlPattern: 'straight' | '2a' | '2b' | '2c' | '3a' | '3b' | '3c' | '4a' | '4b' | '4c';
}

const hairTypes: HairType[] = [
  { id: 'straight', name: 'Type 1', get description() { return tr('clientAccount.hairType.straight'); }, curlPattern: 'straight' },
  { id: '2a', name: 'Type 2A', get description() { return `${tr('clientAccount.hairType.wavy')} - ${tr('clientAccount.hairType.loose')}`; }, curlPattern: '2a' },
  { id: '2b', name: 'Type 2B', get description() { return `${tr('clientAccount.hairType.wavy')} - ${tr('clientAccount.hairType.medium')}`; }, curlPattern: '2b' },
  { id: '2c', name: 'Type 2C', get description() { return `${tr('clientAccount.hairType.wavy')} - ${tr('clientAccount.hairType.defined')}`; }, curlPattern: '2c' },
  { id: '3a', name: 'Type 3A', get description() { return `${tr('clientAccount.hairType.curly')} - ${tr('clientAccount.hairType.loose')}`; }, curlPattern: '3a' },
  { id: '3b', name: 'Type 3B', get description() { return `${tr('clientAccount.hairType.curly')} - ${tr('clientAccount.hairType.tight')}`; }, curlPattern: '3b' },
  { id: '3c', name: 'Type 3C', get description() { return `${tr('clientAccount.hairType.curly')} - ${tr('clientAccount.hairType.corkscrew')}`; }, curlPattern: '3c' },
  { id: '4a', name: 'Type 4A', get description() { return `${tr('clientAccount.hairType.coily')} - ${tr('clientAccount.hairType.sPattern')}`; }, curlPattern: '4a' },
  { id: '4b', name: 'Type 4B', get description() { return `${tr('clientAccount.hairType.coily')} - ${tr('clientAccount.hairType.zPattern')}`; }, curlPattern: '4b' },
  { id: '4c', name: 'Type 4C', get description() { return `${tr('clientAccount.hairType.coily')} - ${tr('clientAccount.hairType.tightZigzag')}`; }, curlPattern: '4c' },
];

interface HairTypeSelectorProps {
  onSelect: (hairType: HairType) => void;
  onBack: () => void;
}

export const HairTypeSelector: React.FC<HairTypeSelectorProps> = ({ onSelect, onBack }) => {
  const { theme, isDarkMode } = useTheme();
  const { t } = useTranslation();
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
              {/* `name` is "Type 2A"; only the word "Type" is translated. */}
              {t('clientAccount.hairTypeSelector.type', { code: hairType.name.replace(/^Type /, '') })}
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
