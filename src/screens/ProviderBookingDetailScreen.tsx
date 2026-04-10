import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useBooking, BookingStatus, ConfirmedBooking } from '../contexts/BookingContext';
import AppBackground from '../components/AppBackground';
import { ProviderHomeScreenProps } from '../navigation/types';
import { supabase } from '../lib/supabase';
import {
  insertUserBookingNotification,
  updateBookingStatus as dbUpdateBookingStatus,
  getPendingRescheduleRequest,
  providerRespondReschedule,
  providerDeclineReschedule,
  insertUserRescheduleNotification,
} from '../services/databaseService';

type Props = ProviderHomeScreenProps<'BookingDetail'>;

/** Map raw Supabase status strings → BookingStatus enum values used in the UI */
const DB_STATUS_MAP: Record<string, BookingStatus> = {
  pending:     BookingStatus.PENDING,
  confirmed:   BookingStatus.UPCOMING,
  in_progress: BookingStatus.IN_PROGRESS,
  completed:   BookingStatus.COMPLETED,
  cancelled:   BookingStatus.CANCELLED,
  no_show:     BookingStatus.NO_SHOW,
};

const STATUS_COLORS: Record<string, string> = {
  [BookingStatus.PENDING]: '#FF9500',
  [BookingStatus.UPCOMING]: '#007AFF',
  [BookingStatus.IN_PROGRESS]: '#34C759',
  [BookingStatus.COMPLETED]: '#8E8E93',
  [BookingStatus.CANCELLED]: '#FF3B30',
  [BookingStatus.NO_SHOW]: '#FF9500',
};

const STATUS_LABELS: Record<string, string> = {
  [BookingStatus.PENDING]: 'Pending Confirmation',
  [BookingStatus.UPCOMING]: 'Upcoming',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No Show',
};

export default function ProviderBookingDetailScreen({ route, navigation }: Props) {
  const { bookingId, booking: passedBooking } = route.params;
  const { theme, isDarkMode } = useTheme();
  const { cancelBooking } = useBooking();

  // Always fetch fresh from Supabase so status is never stale from route params
  const [booking, setBooking] = useState<ConfirmedBooking | null>(passedBooking ?? null);
  const [fetching, setFetching] = useState(true);

  // Reschedule request state
  const [rescheduleReqId, setRescheduleReqId] = useState<string | null>(null);
  const [rescheduleReqDates, setRescheduleReqDates] = useState<string[]>([]);
  const [showProposeSlotsModal, setShowProposeSlotsModal] = useState(false);
  const [proposedSlots, setProposedSlots] = useState<{ date: string; time: string }[]>([
    { date: '', time: '' },
    { date: '', time: '' },
    { date: '', time: '' },
  ]);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) { setFetching(false); return; }
    const { data, error } = await supabase
      .from('bookings')
      .select('*, add_ons: booking_add_ons(*)')
      .eq('id', bookingId)
      .single();
    if (error || !data) { setFetching(false); return; }
    const d = data as any;

    // Check for a pending reschedule request
    let pendingReschedule = false;
    try {
      const req = await getPendingRescheduleRequest(bookingId);
      if (req && (req.status === 'pending' || req.status === 'provider_responded')) {
        pendingReschedule = true;
        setRescheduleReqId(req.id);
        setRescheduleReqDates(req.requested_dates ?? []);
        // Pre-fill proposed slots with dates the client requested
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const day2 = new Date(); day2.setDate(day2.getDate() + 2);
        const day3 = new Date(); day3.setDate(day3.getDate() + 3);
        setProposedSlots([
          { date: (req.requested_dates?.[0] ?? tomorrow.toISOString().slice(0, 10)), time: '10:00' },
          { date: (req.requested_dates?.[1] ?? day2.toISOString().slice(0, 10)), time: '14:00' },
          { date: (req.requested_dates?.[2] ?? day3.toISOString().slice(0, 10)), time: '16:00' },
        ]);
      }
    } catch (_) {}

    setBooking({
      id: d.id,
      providerId: d.provider_id,
      providerName: d.provider_name_snapshot ?? '',
      providerImage: d.provider_logo_snapshot ?? '',
      serviceName: d.service_name_snapshot ?? '',
      providerService: d.service_name_snapshot ?? '',
      duration: '',
      price: d.base_price ?? 0,
      bookingDate: d.booking_date ?? '',
      bookingTime: d.booking_time ? d.booking_time.slice(0, 5) : '',
      endTime: d.end_time ? d.end_time.slice(0, 5) : '',
      address: d.provider_address_snapshot ?? '',
      status: (DB_STATUS_MAP[d.status] ?? d.status) as BookingStatus,
      paymentType: d.payment_type ?? 'full',
      amountPaid: d.amount_paid ?? 0,
      depositAmount: d.deposit_amount ?? 0,
      remainingBalance: d.remaining_balance ?? 0,
      serviceCharge: d.service_charge ?? 0,
      customerName: d.customer_name ?? '',
      customerEmail: d.customer_email ?? '',
      customerPhone: d.customer_phone ?? '',
      isPendingReschedule: pendingReschedule,
      addOns: (d.add_ons ?? []).map((a: any) => ({ name: a.name_snapshot, price: a.price_snapshot })),
      groupBookingId: d.group_booking_id ?? undefined,
      notes: d.notes ?? undefined,
    });
    setFetching(false);
  }, [bookingId]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

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
              const dbStatusMap: Record<string, string> = {
                [BookingStatus.PENDING]:     'pending',
                [BookingStatus.UPCOMING]:    'confirmed',
                [BookingStatus.IN_PROGRESS]: 'in_progress',
                [BookingStatus.COMPLETED]:   'completed',
                [BookingStatus.CANCELLED]:   'cancelled',
                [BookingStatus.NO_SHOW]:     'no_show',
              };
              // Optimistic update immediately
              setBooking(prev => prev ? { ...prev, status: newStatus } : prev);
              await dbUpdateBookingStatus(booking.id, dbStatusMap[newStatus] as any).catch(() => {});
              navigation.goBack();
            },
          },
        ]
      );
    },
    [booking, navigation]
  );

  const handleConfirm = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      'Confirm Booking?',
      'The client will be notified that their booking is confirmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            // Optimistic update — stay on page so provider can see Start Appointment button
            setBooking(prev => prev ? { ...prev, status: BookingStatus.UPCOMING } : prev);
            await dbUpdateBookingStatus(booking.id, 'confirmed').catch(() => {});
          },
        },
      ]
    );
  }, [booking, navigation]);

  const handleDecline = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      'Decline Booking?',
      'The client will be notified. This action cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setBooking(prev => prev ? { ...prev, status: BookingStatus.CANCELLED } : prev);
            await dbUpdateBookingStatus(booking.id, 'cancelled').catch(() => {});
            insertUserBookingNotification({ bookingId: booking.id, type: 'booking_declined' }).catch(() => {});
            navigation.goBack();
          },
        },
      ]
    );
  }, [booking, navigation]);

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
            setBooking(prev => prev ? { ...prev, status: BookingStatus.CANCELLED } : prev);
            await dbUpdateBookingStatus(booking.id, 'cancelled').catch(() => {});
            insertUserBookingNotification({ bookingId: booking.id, type: 'booking_cancelled' }).catch(() => {});
            navigation.goBack();
          },
        },
      ]
    );
  }, [booking, navigation]);

  const handleProposeSlots = useCallback(() => {
    setShowProposeSlotsModal(true);
  }, []);

  const handleDeclineReschedule = useCallback(async () => {
    if (!rescheduleReqId || !booking) return;
    Alert.alert(
      'Decline Reschedule?',
      "The client will be notified that you can't reschedule.",
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await providerDeclineReschedule(rescheduleReqId);
              insertUserRescheduleNotification({
                bookingId: booking.id,
                type: 'reschedule_response',
                title: 'Reschedule Declined',
                message: `${booking.providerName} is unable to reschedule your ${booking.serviceName} appointment. Your original date stands.`,
              }).catch(() => {});
              setBooking(prev => prev ? { ...prev, isPendingReschedule: false } : prev);
              setRescheduleReqId(null);
              Alert.alert('Done', 'The reschedule request has been declined.');
            } catch {
              Alert.alert('Error', 'Failed to decline reschedule. Please try again.');
            }
          },
        },
      ]
    );
  }, [rescheduleReqId, booking]);

  const handleSubmitSlots = useCallback(async () => {
    if (!rescheduleReqId || !booking) return;
    const validSlots = proposedSlots.filter(s => s.date.length === 10 && s.time.length >= 4);
    if (validSlots.length === 0) {
      Alert.alert('No Slots', 'Add at least one available slot (YYYY-MM-DD and HH:MM).');
      return;
    }
    try {
      const slots = validSlots.map(s => ({ date: s.date, times: [s.time] }));
      await providerRespondReschedule(rescheduleReqId, slots);
      insertUserRescheduleNotification({
        bookingId: booking.id,
        type: 'reschedule_response',
        title: 'Provider Responded',
        message: `${booking.providerName} has proposed new times for your ${booking.serviceName} appointment. Tap to choose a slot.`,
      }).catch(() => {});
      setShowProposeSlotsModal(false);
      setBooking(prev => prev ? { ...prev, isPendingReschedule: false } : prev);
      setRescheduleReqId(null);
      Alert.alert('Sent!', 'Available times have been sent to the client.');
    } catch {
      Alert.alert('Error', 'Failed to send available times. Please try again.');
    }
  }, [rescheduleReqId, booking, proposedSlots]);

  const handleCallClient = useCallback(() => {
    if (!booking?.customerPhone) return;
    Linking.openURL(`tel:${booking.customerPhone}`);
  }, [booking]);

  const handleEmailClient = useCallback(() => {
    if (!booking?.customerEmail) return;
    Linking.openURL(`mailto:${booking.customerEmail}`);
  }, [booking]);

  if (fetching) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#a342c3" />
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

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
  const isPendingConfirmation = booking.status === BookingStatus.PENDING;
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
        {isPending && (
          <View style={[styles.card, { backgroundColor: '#FF9500' + '18', borderColor: '#FF9500', borderWidth: 1 }]}>
            <Text style={[styles.cardTitle, { color: '#FF9500' }]}>Reschedule Request</Text>
            {rescheduleReqDates.length > 0
              ? rescheduleReqDates.map((date, i) => (
                  <Text key={i} style={[styles.rescheduleDate, { color: theme.text }]}>
                    Preferred: {date}
                  </Text>
                ))
              : <Text style={[styles.rescheduleInfo, { color: theme.text + '88' }]}>Client wants to reschedule</Text>
            }
            <View style={[styles.actions, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#34C759' }]}
                onPress={handleProposeSlots}
              >
                <Text style={styles.actionButtonText}>Accept — Propose Times</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FF3B30' }]}
                onPress={handleDeclineReschedule}
              >
                <Text style={styles.actionButtonText}>Decline Reschedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        {isPendingConfirmation && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#34C759' }]}
              onPress={handleConfirm}
            >
              <Text style={styles.actionButtonText}>Confirm Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF3B30' }]}
              onPress={handleDecline}
            >
              <Text style={styles.actionButtonText}>Decline Booking</Text>
            </TouchableOpacity>
          </View>
        )}
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

        {/* Message Client — always visible when booking is active or completed */}
        {(isActive || booking.status === BookingStatus.COMPLETED) && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#5856D6' }]}
              onPress={() => {
                if (!booking.id) return;
                navigation.navigate('BookingChat', {
                  bookingId: booking.id,
                  senderRole: 'provider',
                  otherPartyName: booking.customerName || 'Client',
                });
              }}
            >
              <Text style={styles.actionButtonText}>Message Client</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Propose Available Slots Modal */}
      <Modal
        visible={showProposeSlotsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProposeSlotsModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.slotsModal, { backgroundColor: isDarkMode ? '#1C1C1E' : '#fff' }]}>
            <Text style={[styles.slotsModalTitle, { color: theme.text }]}>Propose Available Times</Text>
            <Text style={[styles.slotsModalSubtitle, { color: theme.text + '88' }]}>
              Enter up to 3 dates (YYYY-MM-DD) and times (HH:MM) you're available.
            </Text>
            {proposedSlots.map((slot, i) => (
              <View key={i} style={styles.slotRow}>
                <TextInput
                  style={[styles.slotInput, { color: theme.text, borderColor: '#a342c3' + '55', backgroundColor: isDarkMode ? '#2C2C2E' : '#F2F2F7' }]}
                  value={slot.date}
                  onChangeText={val => {
                    const updated = [...proposedSlots];
                    updated[i] = { ...updated[i], date: val };
                    setProposedSlots(updated);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.text + '44'}
                  keyboardType="numeric"
                  maxLength={10}
                />
                <TextInput
                  style={[styles.slotInput, styles.slotTimeInput, { color: theme.text, borderColor: '#a342c3' + '55', backgroundColor: isDarkMode ? '#2C2C2E' : '#F2F2F7' }]}
                  value={slot.time}
                  onChangeText={val => {
                    const updated = [...proposedSlots];
                    updated[i] = { ...updated[i], time: val };
                    setProposedSlots(updated);
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.text + '44'}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#a342c3', marginTop: 16 }]}
              onPress={handleSubmitSlots}
            >
              <Text style={styles.actionButtonText}>Send to Client</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: isDarkMode ? '#3A3A3C' : '#E5E5EA', marginTop: 8 }]}
              onPress={() => setShowProposeSlotsModal(false)}
            >
              <Text style={[styles.actionButtonText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  slotsModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  slotsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  slotsModalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  slotRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  slotInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  slotTimeInput: {
    flex: 0,
    width: 80,
  },
});
