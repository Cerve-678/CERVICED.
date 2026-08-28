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
  const prefKeys = ['bookingConfirm', 'bookingReminder', 'bookingUpdates', 'promotions', 'newProviders', 'weeklySummary'];

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

  it('gates only clients, only known types, and fails open', () => {
    const source = edgeFunction();
    const fn = source.slice(
      source.indexOf('function pushAllowedByPrefs'),
      source.indexOf('serve(async (req)'),
    );

    // A provider's operational alerts are not governed by a client screen.
    expect(fn).toContain("if (recipientRole !== 'client') return true");
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
      databaseService().indexOf('/** Load the user\'s notification preferences'),
    );
    const edgeDefaults = edgeFunction().slice(
      edgeFunction().indexOf('const DEFAULT_PREFS'),
      edgeFunction().indexOf('/** True when this notification may be pushed'),
    );

    for (const key of prefKeys) {
      const app = new RegExp(`${key}:\\s*(true|false)`).exec(appDefaults)?.[1];
      const edge = new RegExp(`${key}:\\s*(true|false)`).exec(edgeDefaults)?.[1];
      expect(app).toBeDefined();
      expect(edge).toBe(app);
    }
  });

  it('maps every gated type to a real preference key', () => {
    const source = edgeFunction();
    const map = source.slice(
      source.indexOf('const PREF_KEY_BY_TYPE'),
      source.indexOf('const DEFAULT_PREFS'),
    );
    const mapped = [...map.matchAll(/^\s*(\w+): '(\w+)',$/gm)];

    expect(mapped.length).toBeGreaterThan(0);
    for (const [, , key] of mapped) {
      expect(prefKeys).toContain(key);
    }
  });
});
