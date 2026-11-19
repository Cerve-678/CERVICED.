import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getPageStyle } from '../constants/pageStyles';
import { PROVIDER_THEMES, type ProviderThemePreset } from '../constants/providerThemes';
import { PROVIDER_BRAND_TEMPLATES, type ProviderBrandTemplate } from '../constants/providerBrandTemplates';
import { MiniProfile } from './PageStylePicker';

interface Props {
  selectedKey: string | null;
  onChoose: (template: ProviderBrandTemplate) => void;
  locked: boolean;
  onLockedPress: () => void;
  textColor: string;
  subColor: string;
  borderColor: string;
}

export default function ProviderBrandTemplatePicker({
  selectedKey, onChoose, locked, onLockedPress, textColor, subColor, borderColor,
}: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {PROVIDER_BRAND_TEMPLATES.map(template => {
        const theme = PROVIDER_THEMES.find(p => p.key === template.theme) as ProviderThemePreset;
        const selected = selectedKey === template.key;
        const colours = [theme.tokens.hero, theme.tokens.card, theme.tokens.accent];
        return (
          <TouchableOpacity
            key={template.key}
            style={[styles.tile, { borderColor: selected ? textColor : borderColor }, selected && styles.selected, locked && styles.locked]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (locked) onLockedPress();
              else onChoose(template);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: locked }}
            accessibilityLabel={`${template.name}. ${template.description}${locked ? ' Locked' : ''}`}
          >
            <View style={styles.preview} pointerEvents="none">
              <MiniProfile
                style={getPageStyle(template.pageStyle)}
                gradient={theme.tokens.gradient}
                accent={theme.tokens.accent}
                sheet={template.sheet}
                cardColour={theme.tokens.card}
                backgroundImage={null}
              />
              {locked ? <View style={styles.lock}><Ionicons name="lock-closed" size={14} color="#FFFFFF" /></View> : null}
            </View>
            <View style={styles.details}>
              <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>{template.name}</Text>
              <Text style={[styles.description, { color: subColor }]} numberOfLines={2}>{template.description}</Text>
              <View style={styles.footer}>
                <View style={styles.swatches}>
                  {colours.map((colour, index) => <View key={index} style={[styles.swatch, { backgroundColor: colour, borderColor }]} />)}
                </View>
                <Text style={[styles.action, { color: textColor }]}>{selected ? 'Selected' : 'Use look'}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 12, paddingVertical: 4, paddingRight: 4 },
  tile: { width: 174, borderWidth: 1.5, borderRadius: 16, overflow: 'hidden' },
  selected: { borderWidth: 2.5 },
  locked: { opacity: 0.6 },
  preview: { height: 180, overflow: 'hidden' },
  lock: { position: 'absolute', top: 9, right: 9, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  details: { padding: 12, minHeight: 112 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
  description: { fontSize: 12, lineHeight: 16, marginTop: 3, minHeight: 32 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  swatches: { flexDirection: 'row', gap: 4 },
  swatch: { width: 13, height: 13, borderRadius: 7, borderWidth: 0.5 },
  action: { fontFamily: 'Manrope-Bold', fontSize: 11 },
});
