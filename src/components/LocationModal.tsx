import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';

interface LocationModalProps {
  visible: boolean;
  onClose: () => void;
  selectedLocation: string;
  selectedRadius: number;
  onLocationChange: (location: string) => void;
  onRadiusChange: (radius: number) => void;
}

/** One selectable pill. Shared by both the city and radius groups — they
 *  differ only in their label, so a single chip keeps the two lists visually
 *  identical rather than drifting apart. */
const Chip = memo<{
  label: string;
  isSelected: boolean;
  palette: AppTheme;
  onPress: () => void;
}>(({ label, isSelected, palette: P, onPress }) => (
  <TouchableOpacity
    style={[
      styles.pill,
      { borderColor: P.border, backgroundColor: P.surface },
      isSelected && { backgroundColor: P.accent, borderColor: P.accent },
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.pillText, { color: isSelected ? P.onAccent : P.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
));
Chip.displayName = 'Chip';

const LOCATIONS = [
  'London, UK',
  'Manchester, UK',
  'Birmingham, UK',
  'Leeds, UK',
  'Glasgow, UK',
  'Liverpool, UK',
  'Bristol, UK',
  'Sheffield, UK',
];

const RADIUS_OPTIONS = [
  { label: '1 mile', value: 1 },
  { label: '5 miles', value: 5 },
  { label: '10 miles', value: 10 },
  { label: '25 miles', value: 25 },
  { label: '50 miles', value: 50 },
];

export default function LocationModal({
  visible,
  onClose,
  selectedLocation,
  selectedRadius,
  onLocationChange,
  onRadiusChange,
}: LocationModalProps) {
  // The hat-aware palette, not useEnterpriseTheme(): this sheet opens over the
  // client Home, and the enterprise tokens are provider-hat only — they'd paint
  // brown/dusty-rose chrome inside the client's plum + blue-grey theme.
  const { palette: P } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: P.text }]}>LOCATION &amp; RADIUS</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>City</Text>
            </View>
            <View style={styles.pillGrid}>
              {LOCATIONS.map(location => (
                <Chip
                  key={location}
                  label={location}
                  palette={P}
                  isSelected={selectedLocation === location}
                  onPress={() => onLocationChange(location)}
                />
              ))}
            </View>

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: P.sub }]}>Search radius</Text>
            </View>
            <View style={[styles.pillGrid, styles.pillGridLast]}>
              {RADIUS_OPTIONS.map(option => (
                <Chip
                  key={option.value}
                  label={option.label}
                  palette={P}
                  isSelected={selectedRadius === option.value}
                  onPress={() => onRadiusChange(option.value)}
                />
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: P.accent }]}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Text style={[styles.applyButtonText, { color: P.onAccent }]}>Apply</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  sectionHead: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillGridLast: {
    marginBottom: 4,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  // Height only — no vertical padding. The previous version set both
  // (paddingVertical 16 + height 44), so the label needed ~51px inside a 44px
  // box and got clipped.
  applyButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
