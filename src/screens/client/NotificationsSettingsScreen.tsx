import React from 'react';
import NotificationPreferencesView, {
  type NotificationPreferenceSection,
} from '../../components/NotificationPreferencesView';
import {
  DEFAULT_NOTIF_PREFS,
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../../services/databaseService';

const SECTIONS: NotificationPreferenceSection<NotificationPreferences>[] = [
  {
    title: 'BOOKINGS',
    rows: [
      { key: 'bookingConfirm', icon: 'calendar-today', title: 'Booking Confirmed', subtitle: 'Instant confirmation alerts' },
      { key: 'bookingReminder', icon: 'notifications', title: 'Appointment Reminders', subtitle: 'Before your confirmed appointments' },
      { key: 'bookingUpdates', icon: 'sliders', title: 'Booking Updates', subtitle: 'Changes, cancellations' },
    ],
  },
  {
    // Its own switch, separate from Appointment Reminders: maintenance
    // reminders are opt-in (off until the client turns them on here or in
    // Maintenance setup). The 24h prep line rides on Appointment Reminders.
    title: 'BEAUTY MAINTENANCE',
    rows: [
      { key: 'maintenanceReminders', icon: 'heart', title: 'Maintenance Reminders', subtitle: 'When something you track is due, and aftercare notes' },
    ],
  },
  {
    title: 'DISCOVER',
    rows: [
      { key: 'promotions', icon: 'local-offer', title: 'Offers & Promotions', subtitle: 'Deals from providers you\'ve booked. Providers you\'ve turned the bell on for always come through' },
      { key: 'newProviders', icon: 'people', title: 'New Providers', subtitle: 'Professionals near you' },
      { key: 'weeklySummary', icon: 'bar-chart', title: 'Weekly Summary', subtitle: 'Your beauty activity recap' },
    ],
  },
];

export default function NotificationsSettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <NotificationPreferencesView
      navigation={navigation}
      initial={DEFAULT_NOTIF_PREFS}
      load={getNotificationPreferences}
      save={saveNotificationPreferences}
      sections={SECTIONS}
      logTag="[NotificationsSettings]"
    />
  );
}
