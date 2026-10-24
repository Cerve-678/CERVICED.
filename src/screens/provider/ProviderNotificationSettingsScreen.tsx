import React from 'react';
import NotificationPreferencesView, {
  type AlwaysOnRow,
  type NotificationPreferenceSection,
} from '../../components/NotificationPreferencesView';
import { useAuth } from '../../contexts/AuthContext';
import {
  DEFAULT_PROVIDER_NOTIF_PREFS,
  getProviderNotificationPreferences,
  saveProviderNotificationPreferences,
  type ProviderNotificationPreferences,
} from '../../services/databaseService';

type Section = NotificationPreferenceSection<ProviderNotificationPreferences>;

// Each row's notification types are listed against its key in
// PROVIDER_PREF_KEY_BY_TYPE in send-push-notification — a row here with no
// types there would be a switch that does nothing.
const BOOKINGS: Section = {
  title: 'BOOKINGS',
  rows: [
    { key: 'providerNewBookings', icon: 'calendar-today', title: 'New Bookings', subtitle: 'When a client books with you' },
    { key: 'providerBookingChanges', icon: 'sliders', title: 'Changes & Cancellations', subtitle: 'Cancelled bookings and reschedule outcomes' },
    { key: 'providerReminders', icon: 'notifications', title: 'Appointment Reminders', subtitle: 'The day before, and forms not sent yet' },
    { key: 'providerForms', icon: 'receipt', title: 'Client Forms', subtitle: 'When a client fills in a form' },
  ],
};
const MESSAGES: Section = {
  title: 'MESSAGES',
  rows: [
    { key: 'providerMessages', icon: 'message', title: 'Messages', subtitle: 'New messages and unread reminders' },
  ],
};
const PAYMENTS: Section = {
  title: 'PAYMENTS',
  rows: [
    { key: 'providerPayments', icon: 'payment', title: 'Payment Updates', subtitle: 'Fees paid, refunds settled, dispute outcomes' },
  ],
};
// A count once a day, never names, so who saved you stays private.
const SAVES_ROW: Section['rows'][number] = {
  key: 'providerSaves', icon: 'bookmark', title: 'Saves', subtitle: 'A daily count of people who saved you',
};
const YOUR_BUSINESS: Section = {
  title: 'YOUR BUSINESS',
  rows: [
    SAVES_ROW,
    { key: 'providerReviews', icon: 'star', title: 'Reviews', subtitle: 'When a client leaves a review' },
    { key: 'providerDailyRecap', icon: 'stack', title: 'Today’s Schedule', subtitle: 'A morning recap of the day ahead' },
    { key: 'providerFullyBooked', icon: 'bar-chart', title: 'Fully Booked', subtitle: 'When your calendar has no openings left' },
  ],
};

const LINK_ONLY_PROFILE: Section = {
  title: 'YOUR PROFILE',
  rows: [SAVES_ROW],
};

// These ask the provider to do something before a deadline, so muting them
// would let a request lapse unseen. They are absent from the edge function's
// map, which is what keeps them sending.
const ALWAYS_ON: AlwaysOnRow[] = [
  { icon: 'bell', title: 'Booking Requests', subtitle: 'Bookings waiting for you to accept' },
  { icon: 'swap-horiz', title: 'Reschedule Requests', subtitle: 'A client asking to move their appointment' },
  { icon: 'gavel', title: 'Refund Requests & Disputes', subtitle: 'A client asking for money back or disputing a fee' },
];

export default function ProviderNotificationSettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  // Link-only providers take bookings outside the app, so only messages and
  // the daily saves count reach them.
  const { myBookingMode } = useAuth();
  const isLinkOnly = myBookingMode === 'external';

  return (
    <NotificationPreferencesView
      navigation={navigation}
      initial={DEFAULT_PROVIDER_NOTIF_PREFS}
      load={getProviderNotificationPreferences}
      save={saveProviderNotificationPreferences}
      sections={isLinkOnly ? [MESSAGES, LINK_ONLY_PROFILE] : [BOOKINGS, MESSAGES, PAYMENTS, YOUR_BUSINESS]}
      alwaysOn={isLinkOnly ? undefined : {
        title: 'NEEDS YOUR ANSWER',
        note: 'These always send, so nothing waiting on you runs out unseen. Everything you switch off below still shows in your notifications list.',
        rows: ALWAYS_ON,
      }}
      logTag="[ProviderNotificationSettings]"
    />
  );
}
