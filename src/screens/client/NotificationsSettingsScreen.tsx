import React from 'react';
import NotificationPreferencesView, {
  type AlwaysOnRow,
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

// Not built yet, so no switch and no preference key. When Wrapped ships it
// moves into DISCOVER as a real toggle.
const COMING_UP: { title: string; rows: AlwaysOnRow[] } = {
  title: 'COMING UP',
  rows: [
    { icon: 'auto-awesome', title: 'CERVICED Wrapped', subtitle: 'Your year in beauty, all in one recap' },
  ],
};

export default function NotificationsSettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <NotificationPreferencesView
      navigation={navigation}
      initial={DEFAULT_NOTIF_PREFS}
      load={getNotificationPreferences}
      save={saveNotificationPreferences}
      sections={SECTIONS}
      comingUp={COMING_UP}
      logTag="[NotificationsSettings]"
    />
  );
}
