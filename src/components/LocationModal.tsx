import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useEnterpriseTheme } from '../contexts/ThemeContext';
import TabIcon from './TabIcon';

interface LocationModalProps {
  visible: boolean;
  onClose: () => void;
  selectedLocation: string;
  selectedRadius: number;
  onLocationChange: (location: string) => void;
  onRadiusChange: (radius: number) => void;
}

const LocationChip = memo<{
  label: string;
  isSelected: boolean;
  onPress: () => void;
}>(({ label, isSelected, onPress }) => {
  const { theme } = useEnterpriseTheme();

  const chipStyles = useMemo(() => ({
    container: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm + 2,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      backgroundColor: isSelected
        ? theme.colors.brand.primary
        : theme.colors.background.elevated,
      borderColor: isSelected
        ? theme.colors.brand.primary
        : theme.colors.border.primary,
    },
    text: {
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.semibold,
      fontFamily: theme.typography.fontFamily.body,
      color: isSelected ? theme.colors.text.inverse : theme.colors.text.secondary,
    },
  }), [theme, isSelected]);

  return (
    <TouchableOpacity
      style={chipStyles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={chipStyles.text}>{label}</Text>
    </TouchableOpacity>
  );
});
LocationChip.displayName = 'LocationChip';

const RadiusChip = memo<{
  label: string;
  value: number;
  isSelected: boolean;
  onPress: () => void;
}>(({ label, value, isSelected, onPress }) => {
  const { theme } = useEnterpriseTheme();

  const chipStyles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: theme.spacing.xs + 2,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      backgroundColor: isSelected
        ? theme.colors.text.primary
        : theme.colors.background.elevated,
      borderColor: isSelected
        ? theme.colors.text.primary
        : theme.colors.border.primary,
    },
    text: {
      fontSize: theme.typography.fontSize.sm,
      fontWeight: theme.typography.fontWeight.semibold,
      fontFamily: theme.typography.fontFamily.body,
      color: isSelected ? theme.colors.text.inverse : theme.colors.text.secondary,
    },
  }), [theme, isSelected]);

  return (
    <TouchableOpacity
      style={chipStyles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TabIcon
        name="earth"
        size={14}
        color={isSelected ? theme.colors.text.inverse : theme.colors.text.secondary}
      />
      <Text style={chipStyles.text}>{label}</Text>
    </TouchableOpacity>
  );
});
RadiusChip.displayName = 'RadiusChip';

export default function LocationModal({
  visible,
  onClose,
  selectedLocation,
  selectedRadius,
  onLocationChange,
  onRadiusChange,
}: LocationModalProps) {
  const { theme } = useEnterpriseTheme();

  const locations = [
    'London, UK',
    'Manchester, UK',
    'Birmingham, UK',
    'Leeds, UK',
    'Glasgow, UK',
    'Liverpool, UK',
    'Bristol, UK',
    'Sheffield, UK',
  ];

  const radiusOptions = [
    { label: '1 mile', value: 1 },
    { label: '5 miles', value: 5 },
    { label: '10 miles', value: 10 },
    { label: '25 miles', value: 25 },
    { label: '50 miles', value: 50 },
  ];

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
        <Animated.View style={styles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        <View style={styles.modalContainer}>
          <BlurView
            intensity={theme.blur.intensity.medium}
            tint={theme.blur.tint}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                Location & Radius
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <TabIcon name="x" size={24} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Location Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Select City
                </Text>
                <View style={styles.chipContainer}>
                  {locations.map((location) => (
                    <LocationChip
                      key={location}
                      label={location}
                      isSelected={selectedLocation === location}
                      onPress={() => onLocationChange(location)}
                    />
                  ))}
                </View>
              </View>

              {/* Radius Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Search Radius
                </Text>
                <View style={styles.chipContainer}>
                  {radiusOptions.map((option) => (
                    <RadiusChip
                      key={option.value}
                      label={option.label}
                      value={option.value}
                      isSelected={selectedRadius === option.value}
                      onPress={() => onRadiusChange(option.value)}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Apply Button */}
            <TouchableOpacity
              style={styles.applyButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.applyButtonText}>Apply Location</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useEnterpriseTheme>['theme']) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background.overlay,
  },
  modalContainer: {
    maxHeight: `${theme.components.modal.maxHeightPercent}%`,
    borderTopLeftRadius: theme.components.modal.borderRadius,
    borderTopRightRadius: theme.components.modal.borderRadius,
    overflow: 'hidden',
    paddingBottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: theme.components.modal.borderRadius,
    borderTopRightRadius: theme.components.modal.borderRadius,
    paddingBottom: 34,
    backgroundColor: theme.colors.background.elevated,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.secondary,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    fontFamily: theme.typography.fontFamily.heading,
    color: theme.colors.text.primary,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body,
    color: theme.colors.text.primary,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  applyButton: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.brand.primary,
    paddingVertical: theme.spacing.base,
    borderRadius: theme.components.button.borderRadius,
    alignItems: 'center',
    height: theme.components.button.height.md,
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    fontFamily: theme.typography.fontFamily.heading,
  },
});
