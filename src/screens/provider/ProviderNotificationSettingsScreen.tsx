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
import { tr } from '../../i18n';

type Section = NotificationPreferenceSection<ProviderNotificationPreferences>;

// Each row's notification types are listed against its key in
// PROVIDER_PREF_KEY_BY_TYPE in send-push-notification — a row here with no
// types there would be a switch that does nothing.
const BOOKINGS: Section = {
  get title() { return tr('achievements.group.bookings'); },
  rows: [
    { key: 'providerNewBookings', icon: 'calendar-today', get title() { return tr('providerBusiness.newp.newBookings'); }, get subtitle() { return tr('providerBusiness.newp.whenAClientBooksWithYou'); } },
    { key: 'providerBookingChanges', icon: 'sliders', get title() { return tr('providerBusiness.newp.changesCancellations'); }, get subtitle() { return tr('providerBusiness.newp.cancelledBookingsAndRescheduleOutcomes'); } },
    { key: 'providerReminders', icon: 'notifications', get title() { return tr('providerBusiness.newp.appointmentReminders'); }, get subtitle() { return tr('providerBusiness.newp.theDayBeforeAndFormsNot'); } },
    { key: 'providerForms', icon: 'receipt', get title() { return tr('providerBusiness.newp.clientForms'); }, get subtitle() { return tr('providerBusiness.newp.whenAClientFillsInA'); } },
    { key: 'providerWaitlist', icon: 'people', get title() { return tr('providerBusiness.newp.waitlist'); }, get subtitle() { return tr('providerBusiness.newp.whenSomeoneJoinsYourWaitlist'); } },
  ],
};
const MESSAGES: Section = {
  title: 'MESSAGES',
  rows: [
    { key: 'providerMessages', icon: 'message', get title() { return tr('providerBusiness.inbox.filter.messages'); }, get subtitle() { return tr('providerBusiness.newp.newMessagesAndUnreadReminders'); } },
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
  key: 'providerSaves', icon: 'bookmark', get title() { return tr('providerBusiness.newp.saves'); }, get subtitle() { return tr('providerBusiness.newp.aDailyCountOfPeopleWho'); },
};
const YOUR_BUSINESS: Section = {
  get title() { return tr('providerAccount.section.yourBusiness'); },
  rows: [
    SAVES_ROW,
    { key: 'providerReviews', icon: 'star', get title() { return tr('providerBusiness.newp.reviews'); }, get subtitle() { return tr('providerBusiness.newp.whenAClientLeavesAReview'); } },
    { key: 'providerDailyRecap', icon: 'stack', get title() { return tr('providerBusiness.newp.todaySSchedule'); }, get subtitle() { return tr('providerBusiness.newp.aMorningRecapOfTheDay'); } },
    { key: 'providerFullyBooked', icon: 'bar-chart', get title() { return tr('achievements.name.fullyBookedFirst'); }, get subtitle() { return tr('providerBusiness.newp.whenEverySlotYouVeOpened'); } },
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
  { icon: 'bell', get title() { return tr('providerBusiness.newp.bookingRequests'); }, get subtitle() { return tr('providerBusiness.newp.bookingsWaitingForYouToAccept'); } },
  { icon: 'swap-horiz', get title() { return tr('providerBusiness.newp.rescheduleRequests'); }, get subtitle() { return tr('providerBusiness.newp.aClientAskingToMoveTheir'); } },
  { icon: 'gavel', get title() { return tr('providerBusiness.newp.refundRequestsDisputes'); }, get subtitle() { return tr('providerBusiness.newp.aClientAskingForMoneyBack'); } },
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
