import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { usePlannerStore } from '../stores/usePlannerStore';
import { PortfolioItem } from '../data/providerProfiles';
import TabIcon from './TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CreateEventModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (eventId: string) => void;
  initialPortfolioItem?: PortfolioItem;
}

// Quick date option generation
function getQuickDates(): { label: string; date: string }[] {
  const today = new Date();
  const options: { label: string; date: string }[] = [];

  // Next weekend
  const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
  const nextSat = new Date(today);
  nextSat.setDate(today.getDate() + daysUntilSat);
  options.push({ label: 'This Weekend', date: formatDate(nextSat) });

  // Next week
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  options.push({ label: 'Next Week', date: formatDate(nextWeek) });

  // 2 weeks
  const twoWeeks = new Date(today);
  twoWeeks.setDate(today.getDate() + 14);
  options.push({ label: 'In 2 Weeks', date: formatDate(twoWeeks) });

  // Next month
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  options.push({ label: 'Next Month', date: formatDate(nextMonth) });

  // 2 months
  const twoMonths = new Date(today);
  twoMonths.setMonth(today.getMonth() + 2);
  options.push({ label: 'In 2 Months', date: formatDate(twoMonths) });

  return options;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const CreateEventModal = ({
  visible,
  onClose,
  onCreated,
  initialPortfolioItem,
}: CreateEventModalProps) => {
  const { theme, isDarkMode } = useTheme();
  const { createEvent } = usePlannerStore();
  const [name, setName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const quickDates = getQuickDates();
  const canCreate = name.trim().length > 0 && selectedDate.length > 0;

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      const event = await createEvent(
        name.trim(),
        selectedDate,
        initialPortfolioItem?.id
      );
      setName('');
      setSelectedDate('');
      onCreated(event.id);
    } catch (error) {
      console.error('Failed to create event:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedDate('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={handleClose} activeOpacity={1} />

        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Create a Plan</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.cancelText, { color: theme.secondaryText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Event name */}
            <Text style={[styles.label, { color: theme.secondaryText }]}>What's the occasion?</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.cardBackground,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="e.g. Birthday Trip, Wedding, Girls Night..."
              placeholderTextColor={theme.secondaryText}
              value={name}
              onChangeText={setName}
              maxLength={50}
              autoFocus
            />

            {/* Date selection */}
            <Text style={[styles.label, { color: theme.secondaryText, marginTop: spacing.lg }]}>
              When is it?
            </Text>

            {/* Quick date chips */}
            <View style={styles.dateChips}>
              {quickDates.map(option => (
                <TouchableOpacity
                  key={option.date}
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: selectedDate === option.date ? '#a342c3ff' : theme.cardBackground,
                      borderColor: selectedDate === option.date ? '#a342c3ff' : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedDate(option.date)}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      {
                        color: selectedDate === option.date ? '#FFFFFF' : theme.secondaryText,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.dateChipSub,
                      {
                        color: selectedDate === option.date ? 'rgba(255,255,255,0.8)' : theme.secondaryText,
                      },
                    ]}
                  >
                    {formatDisplayDate(option.date)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected date display */}
            {selectedDate && (
              <View style={[styles.selectedDateBox, { backgroundColor: isDarkMode ? 'rgba(163,66,195,0.1)' : '#F5E6FA' }]}>
                <TabIcon name="star" size={14} color="#a342c3ff" />
                <Text style={styles.selectedDateText}>
                  {formatDisplayDate(selectedDate)}
                </Text>
              </View>
            )}

            {/* Context hint */}
            {initialPortfolioItem && (
              <View style={[styles.contextHint, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <TabIcon name="bookmark" size={14} color="#a342c3ff" />
                <Text style={[styles.contextHintText, { color: theme.secondaryText }]}>
                  Your inspo will be added as the first task
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Create button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.createButton, !canCreate && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={!canCreate || isCreating}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={canCreate ? ['#a342c3ff', '#8a2fb8'] : ['#cccccc', '#aaaaaa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createGradient}
              >
                <Text style={styles.createText}>
                  {isCreating ? 'Creating...' : 'Create Plan'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fonts.title.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  cancelText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  label: {
    fontSize: fonts.body.small,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: dimensions.card.smallBorderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'android' ? spacing.md : spacing.lg,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },
  dateChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    minWidth: (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3,
  },
  dateChipText: {
    fontSize: fonts.body.small,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  dateChipSub: {
    fontSize: 10,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 2,
  },
  selectedDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: dimensions.card.smallBorderRadius,
    marginTop: spacing.md,
  },
  selectedDateText: {
    fontSize: fonts.body.medium,
    fontWeight: '700',
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
  },
  contextHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  contextHintText: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: spacing.sm,
  },
  createButton: {
    borderRadius: dimensions.card.smallBorderRadius,
    overflow: 'hidden',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  createText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
});
