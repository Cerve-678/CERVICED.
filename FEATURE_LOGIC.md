# Feature & Logic Implementation Guide

How to implement any feature in CERVICED end-to-end — from database to screen — so it works completely the first time without needing follow-up fixes.

---

## The Core Rule

**A feature is not done until every endpoint talks to every other endpoint.**

A screen that shows data but can't save it is half done.
A screen that saves data but doesn't notify the other party is half done.
A screen that works but breaks when you navigate away and come back is half done.

Before writing a single line of code, trace the full path of the feature from start to finish.

---

## The App's Layers

Every feature in CERVICED passes through these layers in order. All of them must be accounted for.

```
Supabase DB
    ↕
src/types/database.ts        ← TypeScript types for every table row
    ↕
src/services/databaseService.ts   ← All Supabase queries live here
    ↕
src/contexts/                ← Global state (Auth, Booking, Cart, Registration)
    ↕
src/screens/                 ← UI and user interaction
    ↕
src/navigation/              ← How screens connect to each other
```

A feature that skips a layer creates a gap. Find the gap before shipping.

---

## End-to-End Checklist

Run through every item before considering a feature complete.

### 1. Database
- [ ] Does the table exist?
- [ ] Do all required columns exist with the right types?
- [ ] Are foreign keys set with `ON DELETE CASCADE` where needed?
- [ ] Is RLS enabled?
- [ ] Are there policies for every role that touches this table (client, provider, public)?
- [ ] If the code uses `upsert` with `onConflict` — does the unique constraint exist?
- [ ] If there are file uploads — does the storage bucket exist with correct policies?

### 2. Types (`src/types/database.ts`)
- [ ] Is there a TypeScript interface for every new table row?
- [ ] Are all new columns added to the existing interfaces?
- [ ] Are new composite types defined (e.g. `extends` interfaces, joined result types)?

### 3. Data Service (`src/services/databaseService.ts`)
- [ ] Is there a function to **read** the data?
- [ ] Is there a function to **write/create** the data?
- [ ] Is there a function to **update** the data?
- [ ] Is there a function to **delete** the data (if applicable)?
- [ ] Do all functions handle errors with `if (error) throw error`?
- [ ] Do all functions return the correct type?
- [ ] Do functions that write data also trigger notifications where needed?

### 4. Notifications
- [ ] When the client does something — does the provider get notified?
- [ ] When the provider does something — does the client get notified?
- [ ] Is the correct `NotificationType` used? (Check the enum in `database.ts`)
- [ ] Is the notification inserted via `insertProviderNotification()` or directly into `notifications`?
- [ ] Is `is_actionable: true` set when the notification should deep-link somewhere?
- [ ] Is `booking_id` attached when the notification relates to a booking?

### 5. Screen — Data Loading
- [ ] Does the screen fetch data on mount?
- [ ] Does it use `useFocusEffect` so data refreshes when navigating back to the screen?
- [ ] Is there a loading state (`isLoading`) that shows a spinner or skeleton?
- [ ] Is there an empty state that shows something useful (not just a blank screen)?
- [ ] Is there an error state that tells the user what went wrong?
- [ ] Are all async calls wrapped in try/catch?

### 6. Screen — Writing Data
- [ ] Does the save/submit action disable the button while loading?
- [ ] Does it show feedback on success (toast, alert, or navigation)?
- [ ] Does it show feedback on failure (alert with a readable message)?
- [ ] Does it re-fetch or update local state after a successful write?
- [ ] If it updates something in a context (Booking, Cart etc.) — is that context also updated?

### 7. Real-time (if needed)
- [ ] Should this screen reflect changes made by the other party without a manual refresh?
- [ ] If yes — is a `supabase.channel()` subscription set up?
- [ ] Is the channel cleaned up in the `useEffect` return function (`supabase.removeChannel(channel)`)?
- [ ] Is the subscription filter correct (e.g. `provider_id=eq.${id}`)?

### 8. Navigation
- [ ] Is the new screen registered in the correct navigator's `types.ts`?
- [ ] Is it imported and added as a `<Stack.Screen>` in the correct navigator file?
- [ ] Does the back button work correctly?
- [ ] Is the back gesture enabled or disabled appropriately?
- [ ] After a save/submit, does it navigate to the right place?
- [ ] If the action is destructive (delete, cancel), is there a confirmation before acting?

### 9. Both Sides
- [ ] Client side: does the client see the result of their action?
- [ ] Provider side: does the provider see the result of their action?
- [ ] If one side updates — does the other side's screen reflect it (via real-time or on focus)?

### 10. UI Completeness
- [ ] Light mode looks correct?
- [ ] Dark mode looks correct?
- [ ] Haptics on every interactive element?
- [ ] `activeOpacity` set on all `TouchableOpacity` elements?
- [ ] Keyboard avoiding view on screens with text inputs?
- [ ] ScrollView with `keyboardShouldPersistTaps="handled"` on forms?
- [ ] `useSafeAreaInsets` applied to avoid notch/home bar overlap?

---

## The Architecture in Practice

### How data flows for a typical feature

**Example: Client books a service**

```
Client taps Book
  → createBooking() in databaseService
      → inserts into bookings table
      → inserts into booking_add_ons table
      → insertProviderNotification() → inserts into notifications
  → BookingContext refreshes (setBookings)
  → Client sees confirmation screen
  → Provider's ProviderHomeScreen real-time channel fires
      → re-fetches bookings
      → badge count updates
  → Provider opens notification → navigates to BookingDetail
```

Every arrow is a connection. If any arrow is missing, the feature is broken somewhere.

---

## Notification Matrix

Every action that involves two parties needs a notification. Use this to decide when to send one.

| Who acts | What they do | Who gets notified | Notification type |
|---|---|---|---|
| Client | Books appointment | Provider | `booking_pending` |
| Provider | Confirms booking | Client | `booking_confirmed` |
| Provider | Declines booking | Client | `booking_declined` |
| Client | Cancels booking | Provider | `booking_cancelled` |
| Provider | Cancels booking | Client | `booking_cancelled` |
| Client | Requests reschedule | Provider | `reschedule_request` |
| Provider | Responds with slots | Client | `reschedule_response` |
| Client | Confirms new slot | Provider | `reschedule_confirmed` |
| Provider | Marks complete | Client | `review_request` |
| Client | Leaves review | Provider | `review_received` |
| Provider | Sends promotion | Client | `promotion` |
| Provider | Sends rebook nudge | Client | `booking_reminder` |

When implementing any of these flows, the notification must be inserted as part of the same action — not as a separate step done later.

---

## How to Send a Notification

### To a client (you know their `user_id`):
```ts
await supabase.from('notifications').insert({
  user_id: clientUserId,
  type: 'booking_confirmed',           // must match NotificationType enum
  title: 'Booking Confirmed',
  message: 'Your appointment with [Provider] is confirmed.',
  priority: 'high',                    // 'high' | 'medium' | 'low'
  is_actionable: true,                 // true = tapping opens the booking
  booking_id: bookingId,               // attach if related to a booking
  provider_id: providerId,
});
```

### To a provider (you only know their `provider_id`):
```ts
await insertProviderNotification({
  provider_id: providerId,
  type: 'booking_pending',
  title: 'New Booking Request',
  message: '[Client Name] wants to book [Service].',
  priority: 'high',
  is_actionable: true,
  booking_id: bookingId,
});
```

This function automatically looks up the provider's `user_id` from the `providers` table.

---

## Data Fetching Pattern

Every screen that loads data follows this pattern. Copy it exactly.

```tsx
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

const [data, setData]       = useState<MyType[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError]     = useState<string | null>(null);

const load = useCallback(async () => {
  try {
    setLoading(true);
    setError(null);
    const result = await myDatabaseFunction();
    setData(result);
  } catch (e: any) {
    setError(e.message ?? 'Could not load data');
  } finally {
    setLoading(false);
  }
}, []);

// Runs on mount AND every time the user navigates back to this screen
useFocusEffect(useCallback(() => {
  load();
}, [load]));
```

Then in the render:

```tsx
if (loading) return <LoadingSpinner />;
if (error)   return <ErrorMessage message={error} onRetry={load} />;
if (!data.length) return <EmptyState message="Nothing here yet" />;
```

Never skip any of these three states. A blank screen is always a bug.

---

## Real-time Subscription Pattern

Use this when the screen must update automatically when the other party does something (e.g. provider calendar updating when a new booking comes in).

```tsx
useEffect(() => {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;

  const setup = async () => {
    const profile = await getMyProviderProfile();
    if (!profile || cancelled) return;

    channel = supabase
      .channel('my-feature-channel')
      .on(
        'postgres_changes',
        {
          event: '*',                    // INSERT | UPDATE | DELETE | *
          schema: 'public',
          table: 'bookings',
          filter: `provider_id=eq.${profile.id}`,
        },
        () => {
          if (!cancelled) load();        // re-fetch on any change
        }
      )
      .subscribe();
  };

  setup();

  return () => {
    cancelled = true;
    if (channel) supabase.removeChannel(channel);
  };
}, [load]);
```

Only add real-time when genuinely needed. Not every screen needs it.

---

## Writing / Saving Data Pattern

```tsx
const [saving, setSaving] = useState(false);

const handleSave = async () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  setSaving(true);
  try {
    await myDatabaseWriteFunction(formData);

    // 1. Send notification to the other party
    await insertProviderNotification({ ... });

    // 2. Update local state or context
    setData(prev => [...prev, newItem]);

    // 3. Success feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Saved', 'Your changes have been saved.');

    // 4. Navigate if needed
    navigation.goBack();

  } catch (e: any) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
  } finally {
    setSaving(false);
  }
};
```

---

## Context vs Local State

Decide where state lives before writing any code.

| Use context when | Use local state when |
|---|---|
| Multiple screens need the same data | Only one screen uses the data |
| Data must persist across navigation | Data is only needed while on that screen |
| Data changes on one screen must reflect on another | Changes are isolated to the current screen |
| It's core app data (bookings, auth, cart) | It's UI state (loading, form fields, modal open) |

**Available contexts:**
- `AuthContext` — current user, active mode (provider/client), login/logout
- `BookingContext` — client's bookings, real-time booking updates
- `CartContext` — cart items
- `RegistrationContext` — signup flow data across steps

Do not add to contexts unless truly needed. Local state is always simpler.

---

## Navigation Patterns

### Going to a new screen
```tsx
navigation.navigate('ScreenName', { param: value });
```

### Going back
```tsx
navigation.goBack();
```

### Resetting the stack (after login, after signup, after logout)
```tsx
navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
```

### Resetting to a specific position in the stack
```tsx
// Creates: Welcome → Login (back arrow on Login goes to Welcome)
navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });
```

### Disable back gesture on a screen (registration, verification flows)
In the navigator file:
```tsx
<Stack.Screen name="MyScreen" component={MyScreen} options={{ gestureEnabled: false }} />
```

---

## Adding a New Screen — Full Checklist

1. **Create the file** in `src/screens/`
2. **Add to `types.ts`** — add the screen name and its params to the correct stack param list
3. **Register in the navigator** — import and add `<Stack.Screen>` in the correct navigator file
4. **Build the screen** using the design system template (see `DESIGN_SYSTEM.md`)
5. **Add data fetching** using `useFocusEffect` + loading/empty/error states
6. **Add write logic** with try/catch, loading state, notifications, and navigation after save
7. **Test both sides** — if it's a provider screen, test the client impact too, and vice versa
8. **Test dark mode** — open settings and toggle

---

## The Two-Sided Feature Test

For any feature involving both a client and a provider, test it as both:

**As the client:**
- Can they trigger the action?
- Do they get confirmation?
- Does their screen update?
- Do they receive notifications from the provider's response?

**As the provider:**
- Do they receive the notification?
- Can they see the detail and take action?
- Does their action update the client's screen?
- Does their own screen reflect the change immediately?

If either side is missing any of these — the feature is not done.

---

## Common Half-Implemented Mistakes

These are the most common ways a feature ends up incomplete:

| Mistake | Result | Fix |
|---|---|---|
| Screen reads but doesn't re-fetch on focus | Data goes stale after navigation | Use `useFocusEffect` |
| Save function doesn't send notification | Other party never knows | Always insert notification alongside the write |
| Notification has no `booking_id` | Tapping notification goes nowhere | Attach `booking_id` to all booking-related notifications |
| No loading state on data fetch | Blank screen flash on load | Always have `isLoading` state with a spinner |
| No empty state | Blank screen with no explanation | Always have empty state UI |
| No error handling on async | Silent failure | Wrap every async call in try/catch |
| Form submits without disabling button | Double-submission possible | Set `setSaving(true)` before the call |
| New screen not in types.ts | TypeScript error, navigation crashes | Always add to `RootStackParamList` or relevant stack |
| New screen not in navigator | Screen unreachable | Always register with `<Stack.Screen>` |
| Context not updated after write | Other screens show stale data | Update context state after successful DB write |
| Real-time channel not cleaned up | Memory leak, duplicate listeners | Always return cleanup in `useEffect` |
