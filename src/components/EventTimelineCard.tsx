import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { PlanTask } from '../stores/usePlannerStore';
import { getPortfolioItemById } from '../data/portfolioFeed';
import { getProviderForItem } from '../data/portfolioFeed';
import TabIcon from './TabIcon';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';

interface EventTimelineCardProps {
  task: PlanTask;
  isLast: boolean;
  onBookNow: (task: PlanTask) => void;
  onSetDate: (task: PlanTask) => void;
  onRemove: (task: PlanTask) => void;
}

const STATUS_CONFIG = {
  planned: { color: '#999999', label: 'Planned', icon: 'star' as const },
  scheduled: { color: '#007AFF', label: 'Scheduled', icon: 'bell' as const },
  booked: { color: '#a342c3ff', label: 'Booked', icon: 'basket-shopping' as const },
  completed: { color: '#4CAF50', label: 'Completed', icon: 'star' as const },
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const EventTimelineCard = ({
  task,
  isLast,
  onBookNow,
  onSetDate,
  onRemove,
}: EventTimelineCardProps) => {
  const { theme, isDarkMode } = useTheme();
  const portfolioItem = getPortfolioItemById(task.portfolioItemId);
  const provider = portfolioItem ? getProviderForItem(portfolioItem) : undefined;
  const statusConfig = STATUS_CONFIG[task.status];

  return (
    <View style={styles.container}>
      {/* Timeline connector */}
      <View style={styles.timelineColumn}>
        <View style={[styles.dot, { backgroundColor: statusConfig.color }]} />
        {!isLast && (
          <View
            style={[
              styles.connector,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E0E0E0' },
            ]}
          />
        )}
      </View>

      {/* Card content */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.cardRow}>
          {/* Inspo thumbnail */}
          {portfolioItem && (
            <Image
              source={portfolioItem.image}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          )}

          {/* Task info */}
          <View style={styles.info}>
            <Text style={[styles.serviceName, { color: theme.text }]} numberOfLines={2}>
              {task.serviceName}
            </Text>

            {task.providerName && (
              <Text style={[styles.providerName, { color: theme.secondaryText }]} numberOfLines={1}>
                {task.providerName}
              </Text>
            )}

            {/* Status badge */}
            <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          {/* Remove button */}
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemove(task)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.removeText, { color: theme.secondaryText }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Date row */}
        <View style={styles.dateRow}>
          {task.scheduledDate ? (
            <TouchableOpacity style={styles.dateButton} onPress={() => onSetDate(task)}>
              <TabIcon name="bell" size={12} color="#a342c3ff" />
              <Text style={styles.dateText}>{formatDisplayDate(task.scheduledDate)}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.setDateButton, { borderColor: theme.border }]}
              onPress={() => onSetDate(task)}
            >
              <TabIcon name="bell" size={12} color={theme.secondaryText} />
              <Text style={[styles.setDateText, { color: theme.secondaryText }]}>Set Date</Text>
            </TouchableOpacity>
          )}

          {/* Book Now (if not yet booked) */}
          {task.status !== 'booked' && task.status !== 'completed' && task.providerName && (
            <TouchableOpacity
              style={styles.miniBookButton}
              onPress={() => onBookNow(task)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#a342c3ff', '#8a2fb8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.miniBookGradient}
              >
                <Text style={styles.miniBookText}>Book</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  timelineColumn: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 16,
  },
  connector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    borderRadius: 1,
  },
  card: {
    flex: 1,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  serviceName: {
    fontSize: fonts.body.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    lineHeight: 18,
  },
  providerName: {
    fontSize: fonts.body.small,
    fontFamily: 'Jura-VariableFont_wght',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  removeButton: {
    padding: 4,
    marginLeft: 4,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '400',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a342c3ff',
    fontFamily: 'Jura-VariableFont_wght',
  },
  setDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  setDateText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Jura-VariableFont_wght',
  },
  miniBookButton: {
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 'auto',
  },
  miniBookGradient: {
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  miniBookText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
});
