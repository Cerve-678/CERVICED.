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
import { tr } from '../../i18n';

const SECTIONS: NotificationPreferenceSection<NotificationPreferences>[] = [
  {
    get title() { return tr('achievements.group.bookings'); },
    rows: [
      { key: 'bookingConfirm', icon: 'calendar-today', get title() { return tr('clientAccount.notifications.bookingConfirm'); }, get subtitle() { return tr('clientAccount.notifications.bookingConfirmSub'); } },
      { key: 'bookingReminder', icon: 'notifications', get title() { return tr('clientAccount.notifications.reminders'); }, get subtitle() { return tr('clientAccount.notifications.remindersSub'); } },
      { key: 'bookingUpdates', icon: 'sliders', get title() { return tr('clientAccount.notifications.updates'); }, get subtitle() { return tr('clientAccount.notifications.updatesSub'); } },
    ],
  },
  {
    // Its own switch, separate from Appointment Reminders: maintenance
    // reminders are opt-in (off until the client turns them on here or in
    // Maintenance setup). The 24h prep line rides on Appointment Reminders.
    title: 'BEAUTY MAINTENANCE',
    rows: [
      { key: 'maintenanceReminders', icon: 'heart', get title() { return tr('clientAccount.notifications.maintenance'); }, get subtitle() { return tr('clientAccount.notifications.maintenanceSub'); } },
    ],
  },
  {
    title: 'DISCOVER',
    rows: [
      { key: 'promotions', icon: 'local-offer', get title() { return tr('clientAccount.notifications.promotions'); }, get subtitle() { return tr('clientAccount.notifications.promotionsSub'); } },
      { key: 'newProviders', icon: 'people', get title() { return tr('clientAccount.notifications.newProviders'); }, get subtitle() { return tr('clientAccount.notifications.newProvidersSub'); } },
      { key: 'weeklySummary', icon: 'bar-chart', get title() { return tr('clientAccount.notifications.weekly'); }, get subtitle() { return tr('clientAccount.notifications.weeklySub'); } },
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
