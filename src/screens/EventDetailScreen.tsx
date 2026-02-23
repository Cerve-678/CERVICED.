import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { usePlannerStore, suggestChecklistItems, PlanTask, ChecklistItem } from '../stores/usePlannerStore';
import { getPortfolioItemById } from '../data/portfolioFeed';
import { EventTimelineCard } from '../components/EventTimelineCard';
import { ThemedBackground } from '../components/ThemedBackground';
import TabIcon from '../components/TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

type EventDetailParams = {
  EventDetail: { eventId: string };
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const EventDetailScreen = () => {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<EventDetailParams, 'EventDetail'>>();
  const { eventId } = route.params;

  const {
    events,
    updateTask,
    removeTask,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    deleteEvent,
  } = usePlannerStore();

  const event = events.find(e => e.id === eventId);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const daysUntil = event ? getDaysUntil(event.date) : 0;
  const goalImage = event?.goalImageId ? getPortfolioItemById(event.goalImageId) : null;

  const sortedTasks = useMemo(() => {
    if (!event) return [];
    return [...event.tasks].sort((a, b) => {
      if (!a.scheduledDate && !b.scheduledDate) return 0;
      if (!a.scheduledDate) return 1;
      if (!b.scheduledDate) return -1;
      return a.scheduledDate.localeCompare(b.scheduledDate);
    });
  }, [event?.tasks]);

  const suggestions = useMemo(() => {
    if (!event) return [];
    return suggestChecklistItems(event);
  }, [event?.tasks, event?.checklist]);

  const completedChecklist = event?.checklist.filter(c => c.completed).length || 0;
  const totalChecklist = event?.checklist.length || 0;

  const completedTasks = event?.tasks.filter(t => t.status === 'completed').length || 0;
  const totalTasks = event?.tasks.length || 0;

  const handleBookNow = useCallback((task: PlanTask) => {
    if (task.providerId) {
      const portfolioItem = getPortfolioItemById(task.portfolioItemId);
      const provider = portfolioItem ? require('../data/portfolioFeed').getProviderForItem(portfolioItem) : null;
      if (provider) {
        navigation.navigate('ProviderProfile', {
          providerLogo: provider.logo,
          providerName: provider.name,
          providerService: provider.service,
        });
      }
    }
  }, [navigation]);

  const handleSetDate = useCallback((task: PlanTask) => {
    // Quick date picker using quick options
    const quickDates = [
      { label: 'Tomorrow', days: 1 },
      { label: 'This Weekend', days: (6 - new Date().getDay() + 7) % 7 || 7 },
      { label: 'Next Week', days: 7 },
      { label: 'In 2 Weeks', days: 14 },
    ];

    const buttons = quickDates.map(opt => ({
      text: opt.label,
      onPress: () => {
        const d = new Date();
        d.setDate(d.getDate() + opt.days);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        updateTask(eventId, task.id, { scheduledDate: dateStr, status: 'scheduled' });
      },
    }));

    Alert.alert('Schedule Service', `When do you want "${task.serviceName}"?`, [
      ...buttons,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [eventId, updateTask]);

  const handleRemoveTask = useCallback((task: PlanTask) => {
    Alert.alert('Remove', 'Remove this from your plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeTask(eventId, task.id),
      },
    ]);
  }, [eventId, removeTask]);

  const handleAddChecklist = useCallback(() => {
    const text = newChecklistText.trim();
    if (text) {
      addChecklistItem(eventId, text);
      setNewChecklistText('');
    }
  }, [eventId, newChecklistText, addChecklistItem]);

  const handleAddSuggestion = useCallback((suggestion: ChecklistItem) => {
    addChecklistItem(eventId, suggestion.text, suggestion.category);
  }, [eventId, addChecklistItem]);

  const handleDeleteEvent = useCallback(() => {
    Alert.alert('Delete Plan', `Delete "${event?.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEvent(eventId);
          navigation.goBack();
        },
      },
    ]);
  }, [eventId, event?.name, deleteEvent, navigation]);

  if (!event) {
    return (
      <ThemedBackground style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>Event not found</Text>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero section */}
        <View style={styles.heroSection}>
          {goalImage && (
            <Image
              source={goalImage.image}
              style={styles.goalImage}
              resizeMode="cover"
            />
          )}

          <View style={[styles.heroOverlay, !goalImage && { paddingTop: spacing.lg }]}>
            <Text style={[styles.eventName, { color: goalImage ? '#FFFFFF' : theme.text }]}>
              {event.name}
            </Text>
            <Text style={[styles.eventDate, { color: goalImage ? 'rgba(255,255,255,0.85)' : theme.secondaryText }]}>
              {formatEventDate(event.date)}
            </Text>
          </View>
        </View>

        {/* Countdown */}
        <View style={[styles.countdownCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.countdownContent}>
            <Text style={[styles.countdownNumber, { color: daysUntil <= 7 ? '#FF6B6B' : '#a342c3ff' }]}>
              {daysUntil > 0 ? daysUntil : 0}
            </Text>
            <Text style={[styles.countdownLabel, { color: theme.secondaryText }]}>
              {daysUntil === 1 ? 'day to go' : daysUntil > 0 ? 'days to go' : daysUntil === 0 ? "It's today!" : 'days ago'}
            </Text>
          </View>

          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.secondaryText }]}>
                Services: {completedTasks}/{totalTasks}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#F0F0F0' }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : '0%',
                      backgroundColor: '#a342c3ff',
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.secondaryText }]}>
                Prep: {completedChecklist}/{totalChecklist}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#F0F0F0' }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: totalChecklist > 0 ? `${(completedChecklist / totalChecklist) * 100}%` : '0%',
                      backgroundColor: '#4CAF50',
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Service Timeline */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Service Timeline</Text>

          {sortedTasks.length === 0 ? (
            <View style={[styles.emptySection, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <TabIcon name="bookmark" size={28} color={theme.secondaryText} />
              <Text style={[styles.emptySectionText, { color: theme.secondaryText }]}>
                No services planned yet
              </Text>
              <Text style={[styles.emptySectionSub, { color: theme.secondaryText }]}>
                Go to Discover and tap "Plan This" on inspo you love
              </Text>
            </View>
          ) : (
            sortedTasks.map((task, index) => (
              <EventTimelineCard
                key={task.id}
                task={task}
                isLast={index === sortedTasks.length - 1}
                onBookNow={handleBookNow}
                onSetDate={handleSetDate}
                onRemove={handleRemoveTask}
              />
            ))
          )}
        </View>

        {/* Prep Checklist */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Prep Checklist</Text>
            {totalChecklist > 0 && (
              <Text style={[styles.checklistCount, { color: theme.secondaryText }]}>
                {completedChecklist}/{totalChecklist}
              </Text>
            )}
          </View>

          {/* Existing items */}
          {event.checklist.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.checklistItem, { borderColor: theme.border }]}
              onPress={() => toggleChecklistItem(eventId, item.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: item.completed ? '#4CAF50' : theme.border,
                    backgroundColor: item.completed ? '#4CAF50' : 'transparent',
                  },
                ]}
              >
                {item.completed && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text
                style={[
                  styles.checklistText,
                  { color: item.completed ? theme.secondaryText : theme.text },
                  item.completed && styles.checklistTextCompleted,
                ]}
              >
                {item.text}
              </Text>
              <TouchableOpacity
                onPress={() => removeChecklistItem(eventId, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.removeItemText, { color: theme.secondaryText }]}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {/* Add new item */}
          <View style={[styles.addItemRow, { borderColor: theme.border }]}>
            <TextInput
              style={[styles.addItemInput, { color: theme.text }]}
              placeholder="Add item..."
              placeholderTextColor={theme.secondaryText}
              value={newChecklistText}
              onChangeText={setNewChecklistText}
              onSubmitEditing={handleAddChecklist}
              returnKeyType="done"
            />
            {newChecklistText.trim().length > 0 && (
              <TouchableOpacity onPress={handleAddChecklist}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionsSection}>
              <View style={styles.suggestionsHeader}>
                <Text style={[styles.suggestionsTitle, { color: theme.secondaryText }]}>
                  Suggested items
                </Text>
                <TouchableOpacity onPress={() => setShowSuggestions(false)}>
                  <Text style={[styles.dismissText, { color: theme.secondaryText }]}>Dismiss</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.suggestionsGrid}>
                {suggestions.slice(0, 8).map(suggestion => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={[
                      styles.suggestionChip,
                      {
                        backgroundColor: isDarkMode ? 'rgba(163,66,195,0.1)' : '#F5E6FA',
                        borderColor: isDarkMode ? 'rgba(163,66,195,0.2)' : '#E8D0F0',
                      },
                    ]}
                    onPress={() => handleAddSuggestion(suggestion)}
                  >
                    <Text style={styles.suggestionText}>+ {suggestion.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Delete event */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteEvent}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteText}>Delete Plan</Text>
        </TouchableOpacity>
      </ScrollView>
    </ThemedBackground>
  );
};

export default EventDetailScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Hero
  heroSection: {
    position: 'relative',
    minHeight: 120,
  },
  goalImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#F0F0F0',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: 60,
    backgroundColor: 'transparent',
  },
  eventName: {
    fontSize: fonts.title.large,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  eventDate: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Countdown
  countdownCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: dimensions.card.borderRadius,
    borderWidth: 1,
  },
  countdownContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: spacing.md,
  },
  countdownNumber: {
    fontSize: 42,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  countdownLabel: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },
  progressSection: {
    gap: spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    width: 90,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fonts.title.small,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.md,
  },
  checklistCount: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
    marginBottom: spacing.md,
  },

  // Empty state
  emptySection: {
    alignItems: 'center',
    padding: spacing.xl || 24,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptySectionText: {
    fontSize: fonts.body.medium,
    fontWeight: '600',
    fontFamily: 'BakbakOne-Regular',
    marginTop: spacing.sm,
  },
  emptySectionSub: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Checklist
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    gap: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  checklistText: {
    flex: 1,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
  },
  checklistTextCompleted: {
    textDecorationLine: 'line-through',
  },
  removeItemText: {
    fontSize: 14,
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  addItemInput: {
    flex: 1,
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    color: '#a342c3ff',
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: fonts.body.medium,
  },

  // Suggestions
  suggestionsSection: {
    marginTop: spacing.md,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  suggestionsTitle: {
    fontSize: fonts.body.small,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  dismissText: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 11,
    color: '#a342c3ff',
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },

  // Delete
  deleteButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: fonts.body.small,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
});
