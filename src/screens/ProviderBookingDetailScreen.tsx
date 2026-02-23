import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useBooking, BookingStatus, ConfirmedBooking } from '../contexts/BookingContext';
import AppBackground from '../components/AppBackground';
import { ProviderHomeScreenProps } from '../navigation/types';

type Props = ProviderHomeScreenProps<'BookingDetail'>;

const STATUS_COLORS: Record<string, string> = {
  [BookingStatus.UPCOMING]: '#007AFF',
  [BookingStatus.IN_PROGRESS]: '#34C759',
  [BookingStatus.COMPLETED]: '#8E8E93',
  [BookingStatus.CANCELLED]: '#FF3B30',
  [BookingStatus.NO_SHOW]: '#FF9500',
};

const STATUS_LABELS: Record<string, string> = {
  [BookingStatus.UPCOMING]: 'Upcoming',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No Show',
};

export default function ProviderBookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const { theme, isDarkMode } = useTheme();
  const { getBookingById, updateBookingStatus, cancelBooking } = useBooking();

  const booking = useMemo(() => getBookingById(bookingId), [bookingId, getBookingById]);

  const handleStatusChange = useCallback(
    async (newStatus: BookingStatus) => {
      if (!booking) return;
      const label = STATUS_LABELS[newStatus] || newStatus;
      Alert.alert(
        `Mark as ${label}?`,
        `This will update the booking status to ${label}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              await updateBookingStatus(booking.id, newStatus);
            },
          },
        ]
      );
    },
    [booking, updateBookingStatus]
  );

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      'Cancel Booking?',
      'This action cannot be undone. The client will be notified.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            await cancelBooking(booking.id);
            navigation.goBack();
          },
        },
      ]
    );
  }, [booking, cancelBooking, navigation]);

  const handleCallClient = useCallback(() => {
    if (!booking?.customerPhone) return;
    Linking.openURL(`tel:${booking.customerPhone}`);
  }, [booking]);

  const handleEmailClient = useCallback(() => {
    if (!booking?.customerEmail) return;
    Linking.openURL(`mailto:${booking.customerEmail}`);
  }, [booking]);

  if (!booking) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.text }]}>Booking not found</Text>
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  const statusColor = STATUS_COLORS[booking.status] || '#007AFF';
  const isActive = booking.status === BookingStatus.UPCOMING || booking.status === BookingStatus.IN_PROGRESS;
  const isPending = booking.isPendingReschedule;

  return (
    <AppBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusColor + '18' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[booking.status]}
            {isPending && ' - Reschedule Requested'}
          </Text>
        </View>

        {/* Service Info Card */}
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1C1C1E' : '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Service</Text>
          <Text style={[styles.serviceName, { color: theme.text }]}>{booking.serviceName}</Text>
          <Text style={[styles.serviceDetail, { color: theme.text + '88' }]}>
            {booking.duration} - {'\u00A3'}{booking.price.toFixed(2)}
          </Text>
          {booking.addOns && booking.addOns.length > 0 && (
            <View style={styles.addOnsSection}>
              <Text style={[styles.addOnsLabel, { color: theme.text + '88' }]}>Add-ons:</Text>
              {booking.addOns.map((addon, i) => (
                <Text key={i} style={[styles.addOnItem, { color: theme.text + 'AA' }]}>
                  {addon.name} - {'\u00A3'}{addon.price.toFixed(2)}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Appointment Card */}
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1C1C1E' : '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Appointment</Text>
          <DetailRow label="Date" value={booking.bookingDate} theme={theme} />
          <DetailRow label="Time" value={`${booking.bookingTime} - ${booking.endTime}`} theme={theme} />
          <DetailRow label="Address" value={booking.address} theme={theme} />
        </View>

        {/* Client Card */}
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1C1C1E' : '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Client</Text>
          <DetailRow label="Name" value={booking.customerName || 'N/A'} theme={theme} />
          <DetailRow label="Email" value={booking.customerEmail || 'N/A'} theme={theme} />
          <DetailRow label="Phone" value={booking.customerPhone || 'N/A'} theme={theme} />
          <View style={styles.contactButtons}>
            {booking.customerPhone ? (
              <TouchableOpacity
                style={[styles.contactButton, { backgroundColor: '#34C759' }]}
                onPress={handleCallClient}
              >
                <Text style={styles.contactButtonText}>Call</Text>
              </TouchableOpacity>
            ) : null}
            {booking.customerEmail ? (
              <TouchableOpacity
                style={[styles.contactButton, { backgroundColor: '#007AFF' }]}
                onPress={handleEmailClient}
              >
                <Text style={styles.contactButtonText}>Email</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Payment Card */}
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1C1C1E' : '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Payment</Text>
          <DetailRow
            label="Type"
            value={booking.paymentType === 'deposit' ? 'Deposit' : 'Full Payment'}
            theme={theme}
          />
          <DetailRow label="Paid" value={`\u00A3${booking.amountPaid.toFixed(2)}`} theme={theme} />
          {booking.remainingBalance > 0 && (
            <DetailRow
              label="Balance Due"
              value={`\u00A3${booking.remainingBalance.toFixed(2)}`}
              theme={theme}
              valueColor="#FF9500"
            />
          )}
        </View>

        {/* Reschedule Info */}
        {isPending && booking.rescheduleRequest && (
          <View style={[styles.card, { backgroundColor: '#FF9500' + '18', borderColor: '#FF9500', borderWidth: 1 }]}>
            <Text style={[styles.cardTitle, { color: '#FF9500' }]}>Reschedule Request</Text>
            {booking.rescheduleRequest.requestedDates?.map((date, i) => (
              <Text key={i} style={[styles.rescheduleDate, { color: theme.text }]}>
                Preferred: {date}
              </Text>
            ))}
            <Text style={[styles.rescheduleInfo, { color: theme.text + '88' }]}>
              Requested: {booking.rescheduleRequest.requestedAt
                ? new Date(booking.rescheduleRequest.requestedAt).toLocaleDateString()
                : 'N/A'}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {isActive && (
          <View style={styles.actions}>
            {booking.status === BookingStatus.UPCOMING && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#34C759' }]}
                onPress={() => handleStatusChange(BookingStatus.IN_PROGRESS)}
              >
                <Text style={styles.actionButtonText}>Start Appointment</Text>
              </TouchableOpacity>
            )}
            {booking.status === BookingStatus.IN_PROGRESS && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#007AFF' }]}
                onPress={() => handleStatusChange(BookingStatus.COMPLETED)}
              >
                <Text style={styles.actionButtonText}>Mark Complete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF3B30' }]}
              onPress={handleCancel}
            >
              <Text style={styles.actionButtonText}>Cancel Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF9500' }]}
              onPress={() => handleStatusChange(BookingStatus.NO_SHOW)}
            >
              <Text style={styles.actionButtonText}>Mark No Show</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppBackground>
  );
}

function DetailRow({
  label,
  value,
  theme,
  valueColor,
}: {
  label: string;
  value: string;
  theme: { text: string };
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.text + '88' }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor || theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    opacity: 0.6,
  },
  serviceName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  serviceDetail: {
    fontSize: 14,
  },
  addOnsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  addOnsLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  addOnItem: {
    fontSize: 13,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '60%',
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  contactButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  contactButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  rescheduleDate: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  rescheduleInfo: {
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
