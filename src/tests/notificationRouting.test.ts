import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const read = (...p: string[]): string =>
  fs.readFileSync(path.join(root, ...p), 'utf8');

const notificationsScreen = () =>
  read('src', 'screens', 'shared', 'NotificationsScreen.tsx');
const tapHandler = () => read('src', 'services', 'notificationTapHandler.ts');
const edgeFunction = () =>
  read('supabase', 'functions', 'send-push-notification', 'index.ts');
const pushService = () => read('src', 'services', 'pushNotificationService.ts');
const databaseService = () => read('src', 'services', 'databaseService.ts');
const providerProfileLink = () =>
  read('src', 'navigation', 'openProviderProfileLink.ts');

/**
 * These are source contracts rather than behavioural tests because the code
 * under test is either a Deno edge function or navigation glue that only means
 * anything against a live navigator. Each assertion below corresponds to a bug
 * that actually shipped — the point is to make the specific regression loud.
 */

describe('notification routing — post-dismiss navigation', () => {
  // THE BUG: NotificationsScreen dismissed itself, then scheduled the onward
  // navigation on a timer it owned. Its own unmount cleanup cleared that timer,
  // so the navigation never fired. Symptom: "Open Chat" / "Open Inbox" / every
  // provider booking deep-link did nothing at all, in both hats.
  it('schedules onward navigation outside the dismissing screen lifecycle', () => {
    const source = notificationsScreen();
    const fn = source.slice(
      source.indexOf('const dismissThenNavigate'),
      source.indexOf('const dismissOnly'),
    );

    expect(fn).toContain('navigateAfterDismiss(navigateFn, 500)');
    // defer() is this screen's own timer store — cancelled by the very dismiss
    // the navigation is waiting on.
    expect(fn).not.toContain('defer(navigateFn');
  });

  it('never navigates through the screen navigation prop after dismissing', () => {
    // `navigation` is dead once the screen unmounts, so every deferred
    // destination must go through navigationRef via navigateNested().
    expect(notificationsScreen()).not.toContain('CommonActions.navigate(');
  });

  it('routes every client deep-link through the Home tab explicitly', () => {
    // Notifications is registered in EVERY tab's stack, so StackActions.replace()
    // landed the destination in whichever tab Notifications was opened from —
    // open it from Cart and the client's bookings appeared in the Cart stack.
    // The provider side already targeted ProviderHome for this exact reason.
    const source = notificationsScreen();

    expect(source).not.toContain('StackActions');
    expect(source).toContain("navigateNested('Home', 'Bookings'");
    expect(source).toContain("navigateNested('Home', 'ProviderProfile'");
    expect(source).toContain("navigateNested('ProviderHome', screen, params)");
  });

  it('keeps one shared copy of the nested-navigate helper', () => {
    // Both entry points (push tap, in-app tap) route the same notification
    // types; two private copies of this helper is how they drifted apart.
    // Assert the shared module is the source, not the exact named-import list —
    // that list grows, and a test that breaks on growth teaches nothing.
    expect(tapHandler()).toContain("from '../navigation/rootNavigate'");
    expect(tapHandler()).toContain('navigateNested');
    expect(tapHandler()).not.toContain('function navigateNested');
    expect(notificationsScreen()).toContain(
      "from '../../navigation/rootNavigate'",
    );
  });

  it('gives providers a direct booking action for new and cancelled bookings', () => {
    const source = notificationsScreen();

    expect(source).toContain('PROVIDER_INLINE_BOOKING_ACTION_TYPES');
    expect(source).toContain("'booking_pending'");
    expect(source).toContain("'booking_cancelled'");
    expect(source).toContain("return isProvider ? 'View Booking' : 'View Past Bookings'");
    expect(source).toContain('PROVIDER_INLINE_BOOKING_ACTION_TYPES.has(item.type)');
    expect(source).toContain("navigateProviderHome('BookingDetail'");
  });
});

describe('notification routing — deep-link payload', () => {
  it('sends provider_id in the push payload', () => {
    // Without provider_id, every provider-destination notification (chat,
    // profiles, broadcasts) could only dump the user on the notification list.
    expect(edgeFunction()).toContain('provider_id: payload.record.provider_id');
  });

  it('mirrors the same payload fields in the Expo Go bridge', () => {
    // A field present in production push but missing here fails only in dev,
    // which is the most expensive place to lose an hour.
    const bridge = pushService();
    for (const field of ['booking_id', 'provider_id', 'notification_id', 'type', 'recipient_role']) {
      expect(bridge).toContain(`${field}: row.${field === 'notification_id' ? 'id' : field}`);
    }
  });

  it('deep-links a client chat push straight into the chat', () => {
    const source = tapHandler();
    expect(source).toContain("navigateNested('Home', 'ProviderChat'");
    expect(source).toContain('getProviderBasicById(provider_id)');
  });

  it('opens slug QR links directly and keeps a UUID fallback for printed legacy QR codes', () => {
    const source = providerProfileLink();
    expect(source).toContain('isProviderProfileUuid(providerKey)');
    expect(source).toContain('getProviderBasicById(providerKey)');
    expect(source).toContain("params: { providerId: providerSlug, source: 'profile_qr' }");
  });

  it('routes review_request to the rating form, not just the booking', () => {
    // "Rate Now" landed on BookingDetail, leaving the client to find the
    // rating control themselves.
    expect(tapHandler()).toContain("openReview: type === 'review_request'");
    expect(notificationsScreen()).toContain(
      "const openReview = notification.type === 'review_request'",
    );
    expect(read('src', 'screens', 'client', 'BookingsScreen.tsx')).toContain(
      'setShowRatingModal(true)',
    );
  });

  it('sends a fully booked provider to their profile, where the certificate shows', () => {
    const tap = tapHandler();
    expect(tap).toContain("if (type === 'schedule_fully_booked')");
    const screen = notificationsScreen();
    const branch = screen.slice(screen.indexOf("notification.type === 'schedule_fully_booked'"));
    expect(branch.slice(0, 400)).toContain("navigateTab('MyServices')");
  });

  it('sends a received review to the provider profile, not the booking', () => {
    // "View Review" landed on BookingDetail, which shows no review at all. The
    // Reviews card lives on the provider's own profile — the root of the
    // MyServices tab, so it needs navigateTab, not navigateNested.
    const tap = tapHandler();
    expect(tap).toContain("if (type === 'review_received')");
    expect(tap).toContain("navigateTab('MyServices')");
    // Must no longer be treated as a booking deep-link by either entry point.
    const bookingTypes = tap.slice(tap.indexOf('const BOOKING_TYPES'), tap.indexOf(']);'));
    expect(bookingTypes).not.toContain('review_received');

    const screen = notificationsScreen();
    expect(screen).toContain("} else if (notification.type === 'review_received') {");
    expect(screen).toContain("navigateTab('MyServices')");
  });

  it('opens the Rewards screen from a points_earned notification, in both entry points', () => {
    // THE BUG: points_earned was routed by neither handler, so tapping the
    // "You earned points" notification (in-app action button OR push tap) just
    // dumped the client on the notifications list. Points lives at 'Points' in
    // the client Profile tab's stack.
    const tap = tapHandler();
    expect(tap).toContain("if (type === 'points_earned')");
    expect(tap).toContain("navigateNested('Profile', 'Points')");

    const screen = notificationsScreen();
    expect(screen).toContain("} else if (notification.type === 'points_earned') {");
    expect(screen).toContain("navigateNested('Profile', 'Points')");
    // Client-only, so a provider tap must not leak into the client navigator.
    const clientOnly = screen.slice(
      screen.indexOf('const CLIENT_ONLY_TYPES'),
      screen.indexOf(']);', screen.indexOf('const CLIENT_ONLY_TYPES')),
    );
    expect(clientOnly).toContain('points_earned');
  });

  it('marks a notification read when its push is tapped', () => {
    // The in-app list marked on tap; a push deep-linked past the list, so those
    // stayed unread forever and the badge kept counting them.
    const source = tapHandler();
    expect(source).toContain('markNotificationRead(notification_id)');
    // Must never block or fail the navigation that follows it.
    expect(source).toContain('.catch(err =>');
  });
});

describe('notification preferences gate the push', () => {
  const prefKeys = ['bookingConfirm', 'bookingReminder', 'bookingUpdates', 'promotions', 'newProviders', 'weeklySummary', 'maintenanceReminders'];
  const providerPrefKeys = [
    'providerNewBookings', 'providerBookingChanges', 'providerReminders', 'providerForms',
    'providerMessages', 'providerPayments', 'providerReviews', 'providerDailyRecap', 'providerFullyBooked', 'providerSaves',
  ];

  it('reads preferences on the send path', () => {
    // Every toggle on NotificationsSettingsScreen was decorative: the column
    // was written by the app and read by nothing that sends.
    const source = edgeFunction();
    expect(source).toContain("select('push_token, notification_preferences')");
    expect(source).toContain('pushAllowedByPrefs(');
    expect(source).toContain("reason: 'preference_off'");
  });

  it('reads preferences in the same round trip as the token', () => {
    const source = edgeFunction();
    const userQueries = source.match(/\.from\('users'\)\s*\n\s*\.select\(/g) ?? [];
    expect(userQueries.length).toBe(1);
  });

  it('gates each hat by its own map, only known types, and fails open', () => {
    const source = edgeFunction();
    const fn = source.slice(
      source.indexOf('function pushAllowedByPrefs'),
      source.indexOf('serve(async (req)'),
    );

    // A client switch never mutes a provider alert, and the reverse.
    expect(fn).toContain("recipientRole === 'client' ? CLIENT_PREF_KEY_BY_TYPE");
    expect(fn).toContain("recipientRole === 'provider' ? PROVIDER_PREF_KEY_BY_TYPE");
    expect(fn).toContain('if (!map) return true');
    // An unmapped type means "no toggle covers this", never "suppress it".
    expect(fn).toContain('if (!key) return true');
    // Only an explicit false suppresses — a malformed/partial prefs object
    // falls back to the defaults rather than blocking delivery.
    expect(fn).toContain('!== false');
  });

  it('keeps the edge function defaults in step with the app defaults', () => {
    // Two copies of the same defaults, one in TS and one in Deno. If they
    // diverge, a user sees one thing on the settings screen and gets another.
    const appDefaults = databaseService().slice(
      databaseService().indexOf('const DEFAULT_NOTIF_PREFS'),
      databaseService().indexOf('/** The signed-in user\'s whole stored preferences object'),
    );
    const edgeDefaults = edgeFunction().slice(
      edgeFunction().indexOf('const DEFAULT_PREFS'),
      edgeFunction().indexOf('/** True when this notification may be pushed'),
    );

    for (const key of [...prefKeys, ...providerPrefKeys]) {
      const app = new RegExp(`${key}:\\s*(true|false)`).exec(appDefaults)?.[1];
      const edge = new RegExp(`${key}:\\s*(true|false)`).exec(edgeDefaults)?.[1];
      expect(app).toBeDefined();
      expect(edge).toBe(app);
    }
  });

  const mapEntries = (name: string, end: string) => {
    const source = edgeFunction();
    const map = source.slice(source.indexOf(`const ${name}`), source.indexOf(end));
    return [...map.matchAll(/^\s*(\w+): '(\w+)',$/gm)].map(([, type, key]) => ({ type, key }));
  };
  const clientMap = () => mapEntries('CLIENT_PREF_KEY_BY_TYPE', 'const PROVIDER_PREF_KEY_BY_TYPE');
  const providerMap = () => mapEntries('PROVIDER_PREF_KEY_BY_TYPE', 'const DEFAULT_PREFS');

  it('maps every gated type to a real preference key of its own hat', () => {
    expect(clientMap().length).toBeGreaterThan(0);
    for (const { key } of clientMap()) expect(prefKeys).toContain(key);
    expect(providerMap().length).toBeGreaterThan(0);
    for (const { key } of providerMap()) expect(providerPrefKeys).toContain(key);
  });

  it('gives every provider switch at least one notification it mutes', () => {
    // A row with nothing mapped to it would be a switch that does nothing.
    const screen = read('src', 'screens', 'provider', 'ProviderNotificationSettingsScreen.tsx');
    const mappedKeys = new Set(providerMap().map(entry => entry.key));
    for (const key of providerPrefKeys) {
      expect(screen).toContain(`key: '${key}'`);
      expect(mappedKeys).toContain(key);
    }
  });

  it('never lets a provider mute what needs their answer', () => {
    const muted = new Set(providerMap().map(entry => entry.type));
    for (const type of ['booking_pending', 'pending_booking_reminder', 'reschedule_request', 'refund_requested', 'fee_disputed', 'no_show_disputed', 'payout_failed']) {
      expect(muted).not.toContain(type);
    }
  });

  it('never lets a provider mute money they owe or money taken to pay it', () => {
    // Muting "Payment Updates" must not hide a debt or a deduction from payouts.
    const muted = new Set(providerMap().map(entry => entry.type));
    for (const type of ['payout_debt_recorded', 'payout_debt_recovered']) {
      expect(muted).not.toContain(type);
      // Written by DB triggers, so the CHECK constraint must allow them or every
      // insert fails while tsc and jest stay green.
      expect(read('supabase', 'migrations', '20261029120000_provider_debt_notices_and_fee_recovery.sql')).toContain(`'${type}'`);
      expect(tapHandler()).toContain(`'${type}'`);
    }
  });

  it('always delivers a Terms change and opens the Terms', () => {
    const muted = new Set([...clientMap(), ...providerMap()].map(entry => entry.type));
    expect(muted).not.toContain('terms_updated');
    expect(read('supabase', 'migrations', '20261101130200_terms_updated_notice.sql')).toContain("ARRAY['terms_updated']");
    expect(tapHandler()).toMatch(/type === 'terms_updated'\) \{\s+navigateNested\('Profile', 'Terms'\)/);
  });

  it('saves each hat without overwriting the other hat\'s keys', () => {
    const service = databaseService();
    const section = service.slice(
      service.indexOf('async function mergeNotificationPreferences'),
      service.indexOf('/** Turn Beauty Maintenance pushes on or off'),
    );
    expect(section).toContain('notification_preferences: { ...stored, ...patch }');
    expect(section).toContain('mergeNotificationPreferences(pickPreferences(DEFAULT_NOTIF_PREFS');
    expect(section).toContain('mergeNotificationPreferences(pickPreferences(DEFAULT_PROVIDER_NOTIF_PREFS');
  });

  it('opens the provider settings from the Account tab, not the list', () => {
    const account = read('src', 'screens', 'provider', 'ProviderAccountScreen.tsx');
    expect(account).toContain("navigation.navigate('NotificationSettings')");
    expect(account).not.toContain("navigation.navigate('Notifications')");
  });
});

describe('notification routing — Beauty Maintenance', () => {
  const migration = () =>
    read('supabase', 'migrations', '20261018180000_beauty_maintenance.sql');
  const types = ['maintenance_due', 'aftercare_available'];

  it('declares both types everywhere a notification type has to exist', () => {
    // Memory: new-notification-type-is-four-places. tsc and jest were green
    // while the DB CHECK rejected every insert of a type missing from it.
    const union = read('src', 'types', 'database.ts');
    const check = migration().slice(migration().indexOf('ADD CONSTRAINT notifications_type_check'));
    for (const type of types) {
      expect(union).toContain(`| "${type}"`);
      expect(notificationsScreen()).toContain(`'${type}'`);
      expect(tapHandler()).toContain(`'${type}'`);
      expect(check).toContain(`'${type}'::text`);
    }
  });

  it('opens the Maintenance view from both entry points, never a booking', () => {
    const route = "navigateNested('Profile', 'BeautyProfile', { openMaintenance: true, focusItemId })";
    expect(tapHandler()).toContain(route);
    expect(notificationsScreen()).toContain(route);
    const bookingTypes = tapHandler().slice(
      tapHandler().indexOf('const BOOKING_TYPES'),
      tapHandler().indexOf(']);', tapHandler().indexOf('const BOOKING_TYPES')),
    );
    for (const type of types) expect(bookingTypes).not.toContain(`'${type}'`);
  });

  it('keeps both types client-only in the in-app list', () => {
    const source = notificationsScreen();
    const clientOnly = source.slice(
      source.indexOf('const CLIENT_ONLY_TYPES'),
      source.indexOf(']);', source.indexOf('const CLIENT_ONLY_TYPES')),
    );
    for (const type of types) expect(clientOnly).toContain(`'${type}'`);
  });

  it('carries the item id, not item detail, in the push payload', () => {
    expect(edgeFunction()).toContain("payload.record.metadata?.['maintenance_item_id']");
    expect(pushService()).toContain("row.metadata?.['maintenance_item_id']");
  });

  it('gates both pushes behind the opt-in maintenance toggle, off by default', () => {
    expect(edgeFunction()).toContain("maintenance_due: 'maintenanceReminders'");
    expect(edgeFunction()).toContain("aftercare_available: 'maintenanceReminders'");
    expect(databaseService()).toMatch(/maintenanceReminders: false,\n};/);
  });
});

describe('notification routing — daily saves count', () => {
  // A new type is four places, and only the DB CHECK rejects a miss: tsc and
  // jest stay green while every insert fails (memory: new-notification-type-
  // is-four-places).
  it('declares provider_saved in the DB check, both type unions and the push map', () => {
    const migration = read('supabase', 'migrations', '20261020150000_provider_saved_digest.sql');
    expect(migration).toMatch(/notifications_type_check[\s\S]*'provider_saved'/);
    expect(read('src', 'types', 'database.ts')).toContain('| "provider_saved"');
    expect(read('src', 'screens', 'shared', 'NotificationsScreen.tsx')).toContain("| 'provider_saved'");
    expect(edgeFunction()).toContain("provider_saved: 'providerSaves'");
  });

  it('never names who saved the provider', () => {
    const migration = read('supabase', 'migrations', '20261020150000_provider_saved_digest.sql');
    const insert = migration.slice(migration.indexOf('insert into public.notifications'));
    expect(insert).not.toMatch(/users\b|\.name\b|display_name/);
  });

  it('sends a link-only pro to their own analytics', () => {
    const source = read('src', 'screens', 'shared', 'NotificationsScreen.tsx');
    expect(source).toContain("navigateProviderHome('LinkOnlyAnalytics')");
  });
});

describe('notification routing — tip received', () => {
  const migration = () => read('supabase', 'migrations', '20261025145000_tip_received_notification.sql');

  it('declares tip_received in the DB check, both type unions, the tap handler and the push map', () => {
    expect(migration()).toMatch(/notifications_type_check[\s\S]*'tip_received'/);
    expect(read('src', 'types', 'database.ts')).toContain('| "tip_received"');
    expect(read('src', 'screens', 'shared', 'NotificationsScreen.tsx')).toContain("| 'tip_received'");
    expect(read('src', 'services', 'notificationTapHandler.ts')).toContain("'tip_received'");
    expect(edgeFunction()).toContain("tip_received: 'providerPayments'");
  });

  it('keeps every type the previous check allowed', () => {
    const list = (sql: string) => {
      const check = sql.slice(sql.indexOf('ADD CONSTRAINT notifications_type_check'));
      return new Set([...check.slice(0, check.indexOf(']));')).matchAll(/'(\w+)'/g)].map(m => m[1]));
    };
    const before = list(read('supabase', 'migrations', '20261020150000_provider_saved_digest.sql'));
    const after = list(migration());
    for (const type of before) expect(after).toContain(type);
  });

  it('never lets a failed notification undo recording the tip', () => {
    expect(migration()).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });

  it('fires once, when the tip is paid, and tells the provider it is all theirs', () => {
    expect(migration()).toMatch(/AFTER UPDATE OF status[\s\S]*NEW\.status = 'succeeded' AND OLD\.status IS DISTINCT FROM 'succeeded'/);
    expect(migration()).toContain("'It''s all yours. '");
    const insert = migration().slice(migration().indexOf('INSERT INTO public.notifications'));
    expect(insert.slice(0, insert.indexOf('EXCEPTION'))).not.toMatch(/fee/i);
  });

  it('never names Stripe to the provider', () => {
    const insert = migration().slice(migration().indexOf('INSERT INTO public.notifications'));
    expect(insert.slice(0, insert.indexOf('EXCEPTION'))).not.toMatch(/stripe/i);
  });
});
