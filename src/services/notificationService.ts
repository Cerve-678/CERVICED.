// src/services/notificationService.ts - NEW FILE
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppNotification {
  id: string;
  type: 'booking_confirmed' | 'booking_reminder' | 'payment_success' | 'booking_cancelled' |
        'new_provider' | 'reschedule_request' | 'reschedule_provider_response' |
        'reschedule_confirmed' | 'promotion' | 'review_request';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
  provider: string;
  service: string;
  providerImage?: any;
  bookingId?: string;
  status?: string;
  providerId?: string; // For new_provider notifications
}

const NOTIFICATIONS_KEY = '@app_notifications';

export class NotificationService {
  /**
   * Add booking confirmation notification
   */
 static async addRescheduleRequest(
    provider: string,
    service: string,
    providerImage: any,
    bookingId: string,
    status: 'upcoming' | 'completed' | 'cancelled' | 'reschedule_pending'
  ) {
    try {
      if (__DEV__) console.log('Creating reschedule request notification for bookingId:', bookingId);

      const notification = {
        id: Date.now().toString(),
        type: 'reschedule_request' as const,
        title: 'Reschedule Request Sent',
        message: `Your reschedule request for ${service} with ${provider} has been sent. They'll respond with available times soon.`,
        timestamp: new Date().toISOString(),
        read: false,
        priority: 'medium' as const,
        actionable: true,
        provider,
        service,
        providerImage,
        bookingId,
        status,
      };

      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      let notifications: AppNotification[] = [];
      try {
        notifications = stored ? JSON.parse(stored) : [];
      } catch (parseError) {
        console.error('Failed to parse stored notifications, resetting:', parseError);
      }
      notifications.unshift(notification);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));

      if (__DEV__) console.log('Reschedule request notification added with bookingId:', notification.bookingId);
    } catch (error) {
      console.error('Failed to add reschedule request notification:', error);
    }
  }

  static async addRescheduleProviderResponse(
    provider: string,
    service: string,
    providerImage: any,
    bookingId: string,
    status: 'upcoming' | 'completed' | 'cancelled' | 'reschedule_pending'
  ) {
    try {
      if (__DEV__) console.log('Creating provider response notification for bookingId:', bookingId);

      const notification = {
        id: Date.now().toString(),
        type: 'reschedule_provider_response' as const,
        title: `${provider} Responded!`,
        message: `${provider} has provided available times for your ${service} appointment. Tap to choose your preferred time.`,
        timestamp: new Date().toISOString(),
        read: false,
        priority: 'high' as const,
        actionable: true,
        provider,
        service,
        providerImage,
        bookingId,
        status,
      };

      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      let notifications: AppNotification[] = [];
      try {
        notifications = stored ? JSON.parse(stored) : [];
      } catch (parseError) {
        console.error('Failed to parse stored notifications, resetting:', parseError);
      }
      notifications.unshift(notification);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));

      if (__DEV__) console.log('Provider response notification added with bookingId:', notification.bookingId);
    } catch (error) {
      console.error('Failed to add provider response notification:', error);
    }
  }

  static async addRescheduleConfirmed(
    provider: string,
    service: string,
    providerImage: any,
    bookingId: string,
    newDate: string,
    newTime: string,
    status: 'upcoming' | 'completed' | 'cancelled' | 'reschedule_pending'
  ) {
    try {
      if (__DEV__) console.log('Creating reschedule confirmed notification for bookingId:', bookingId);

      const notification = {
        id: Date.now().toString(),
        type: 'reschedule_confirmed' as const,
        title: 'Appointment Rescheduled',
        message: `Your ${service} appointment with ${provider} has been rescheduled to ${newDate} at ${newTime}.`,
        timestamp: new Date().toISOString(),
        read: false,
        priority: 'high' as const,
        actionable: true,
        provider,
        service,
        providerImage,
        bookingId,
        status,
      };

      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      let notifications: AppNotification[] = [];
      try {
        notifications = stored ? JSON.parse(stored) : [];
      } catch (parseError) {
        console.error('Failed to parse stored notifications, resetting:', parseError);
      }
      notifications.unshift(notification);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));

      if (__DEV__) console.log('Reschedule confirmed notification added with bookingId:', notification.bookingId);
    } catch (error) {
      console.error('Failed to add reschedule confirmed notification:', error);
    }
  }
  
  static async addBookingConfirmation(
    bookingId: string,
    providerName: string,
    serviceName: string,
    bookingDate: string,
    bookingTime: string,
    providerImage?: any
  ): Promise<void> {
    if (__DEV__) console.log('Creating booking confirmation notification:', {
      bookingId,
      providerName,
      serviceName,
    });

    const notification: AppNotification = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'booking_confirmed',
      title: 'Booking Confirmed!',
      message: `Your appointment with ${providerName} for ${serviceName} has been confirmed for ${new Date(bookingDate).toLocaleDateString()} at ${bookingTime}.`,
      timestamp: new Date().toISOString(),
      read: false,
      priority: 'high',
      actionable: true,
      provider: providerName,
      service: serviceName,
      providerImage,
      bookingId,
    };

    if (__DEV__) console.log('Notification object created with bookingId:', notification.bookingId);
    await this.saveNotification(notification);
    if (__DEV__) console.log('Booking confirmation notification saved');
  }

  // ✅ ADD THIS METHOD to notificationService.ts
  static async addBookingCancelled(
  bookingId: string,
  provider: string,
  service: string,
  date: string,
  time: string,
  providerImage?: any
): Promise<void> {
  const notification: AppNotification = {
    id: `notif_${Date.now()}_${Math.random()}`,
    type: 'booking_cancelled',
    title: 'Booking Cancelled',
    message: `Your ${service} appointment with ${provider} on ${new Date(date).toLocaleDateString()} at ${time} has been cancelled.`,
    timestamp: new Date().toISOString(),
    read: false,
    priority: 'high',
    actionable: true,
    provider,
    service,
    providerImage,
    bookingId,
  };

  await this.saveNotification(notification);
}

  /**
   * Add payment success notification
   */
  static async addPaymentSuccess(
    amount: number,
    providerName: string,
    serviceName: string,
    providerImage?: any
  ): Promise<void> {
    const notification: AppNotification = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Payment of £${amount.toFixed(2)} has been processed for your upcoming appointment with ${providerName}.`,
      timestamp: new Date().toISOString(),
      read: false,
      priority: 'medium',
      actionable: false,
      provider: providerName,
      service: serviceName,
      providerImage,
    };

    await this.saveNotification(notification);
  }

  /**
   * Add appointment reminder (call 24hrs before)
   */
  static async addAppointmentReminder(
    bookingId: string,
    providerName: string,
    serviceName: string,
    bookingDate: string,
    bookingTime: string,
    providerImage?: any
  ): Promise<void> {
    const notification: AppNotification = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'booking_reminder',
      title: 'Appointment Reminder',
      message: `Your ${serviceName} appointment with ${providerName} is tomorrow at ${bookingTime}. Please arrive 10 minutes early.`,
      timestamp: new Date().toISOString(),
      read: false,
      priority: 'medium',
      actionable: true,
      provider: providerName,
      service: serviceName,
      providerImage,
      bookingId,
    };

    await this.saveNotification(notification);
  }

  /**
   * Save notification to storage
   */
  private static async saveNotification(notification: AppNotification): Promise<void> {
    try {
      const existing = await this.getAllNotifications();
      const updated = [notification, ...existing];
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save notification:', error);
    }
  }

  /**
   * Get all notifications
   */
  static async getAllNotifications(): Promise<AppNotification[]> {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      if (!stored) return [];
      try {
        return JSON.parse(stored);
      } catch (parseError) {
        console.error('Corrupted notification data, resetting:', parseError);
        await AsyncStorage.removeItem(NOTIFICATIONS_KEY);
        return [];
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getAllNotifications();
      const updated = notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getAllNotifications();
      const updated = notifications.filter(n => n.id !== notificationId);
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  /**
   * Add new provider notification
   */
  static async addNewProviderNotification(
    providerId: string,
    providerName: string,
    providerService: string,
    providerImage?: any
  ): Promise<void> {
    if (__DEV__) console.log('Creating new provider notification:', {
      providerId,
      providerName,
      providerService,
    });

    const notification: AppNotification = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type: 'new_provider',
      title: 'New Provider Available!',
      message: `${providerName} specializing in ${providerService} just joined our platform! Check out their profile and book your appointment today.`,
      timestamp: new Date().toISOString(),
      read: false,
      priority: 'medium',
      actionable: true,
      provider: providerName,
      service: providerService,
      providerImage,
      providerId,
    };

    if (__DEV__) console.log('New provider notification created with providerId:', notification.providerId);
    await this.saveNotification(notification);
    if (__DEV__) console.log('New provider notification saved');
  }
}