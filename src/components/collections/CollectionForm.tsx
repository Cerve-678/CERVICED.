import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { COLLECTION_PALETTES } from '../../constants/collectionColors';
import { COLLECTION_COLORS, COLLECTION_NAME_MAX, type CollectionColor } from '../../types/collections';
import { CollectionFolder } from './CollectionFolder';

interface CollectionFormProps {
  name: string;
  color: CollectionColor;
  onChangeName: (name: string) => void;
  onChangeColor: (color: CollectionColor) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** Name box plus the three pastel folders to pick a colour from. */
export function CollectionForm({ name, color, onChangeName, onChangeColor, onSubmit, autoFocus }: CollectionFormProps) {
  const { palette: P } = useTheme();
  return (
    <View style={styles.wrap}>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder="Name it, like Nails or Wedding"
        placeholderTextColor={P.sub}
        maxLength={COLLECTION_NAME_MAX}
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        style={[styles.input, { backgroundColor: P.surface, color: P.text, borderColor: P.border }]}
        accessibilityLabel="Collection name"
      />
      <View style={styles.colours}>
        {COLLECTION_COLORS.map(option => {
          const selected = option === color;
          return (
            <Pressable
              key={option}
              onPress={() => onChangeColor(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={COLLECTION_PALETTES[option].label}
              style={[
                styles.colour,
                { borderColor: selected ? P.accent : 'transparent', backgroundColor: selected ? P.accentDim : 'transparent' },
              ]}
            >
              <CollectionFolder name="" count={0} color={option} photos={[]} width={52} hideLabel />
              <Text style={[styles.colourLabel, { color: selected ? P.text : P.sub }]}>
                {COLLECTION_PALETTES[option].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
  },
  colours: { flexDirection: 'row', gap: 10 },
  colour: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  colourLabel: { fontSize: 13, fontFamily: 'JosefinSans-VariableFont_wght', fontWeight: '700' },
});
