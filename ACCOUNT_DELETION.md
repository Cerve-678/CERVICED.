# Account Deletion — How It Works

## The model: one identity, two hats

Cerviced accounts aren't like Instagram's account switcher (fully separate,
independent accounts you flip between). It's one identity — one login, one
`public.users` row — that can carry a **client hat** and a **provider hat**
at the same time. `activeMode` just decides which one the app is currently
showing you. Closer to how Etsy or Airbnb do buyer/seller or guest/host: one
account, one login, switchable roles.

That's why "Delete Account" isn't one button with one behaviour — it depends
on which hat you're deleting and whether the other one still exists.

## The two delete buttons

| Where | Calls | Removes |
|---|---|---|
| Profile Info (client settings) | `delete_client_profile()` | Client side only |
| Account Info (provider settings) | `delete_provider_profile()` | Provider side only |

Each button **only ever touches its own side.** Neither one knows or cares
what the other button would do.

## Every scenario

### 1. Client-only account (no provider profile) taps Delete
This is their only hat — deleting it means deleting the whole account.
But it's **not instant**: they're signed out immediately, and the account
is flagged with `deletion_requested_at = now`. Nothing is actually deleted
yet. A background job checks daily and permanently deletes it 30 days later
— unless they log back in first (see Reactivation below).

### 2. Provider-only account (no `dob`/client profile) taps Delete
Same as #1, mirrored: signed out immediately, flagged, nothing deleted for
30 days. Additionally, `has_gone_live` is set to `false` immediately so the
business disappears from client-facing search right away, even though
nothing underneath (schedule, services, portfolio) has been touched.

### 3. Dual-role account taps Delete on the **client** side
They have a provider hat too, so this is a partial removal, not a full
account deletion — and it's **instant and permanent, no grace period**
(there's no "log back in" moment to hang a reactivation prompt on, since
they never leave the app). This deletes: their bookings as a customer,
reviews they wrote, bookmarks, event plans, saved payment methods, becca
chat history, provider-follows, chat conversations they had as a client,
notifications — and clears their beauty-profile fields (dob, hair/skin
type, allergies, etc.). Their provider profile, business bookings, and
everything provider-side is completely untouched. They stay logged in and
land in provider mode.

### 4. Dual-role account taps Delete on the **provider** side
Mirror of #3: instant and permanent, no grace period. Deletes their
provider profile (which cascades services, portfolio, availability,
promotions, form library, waitlist entries, provider chat conversations)
and their provider-side bookings. Also deletes **reviews other clients
wrote about them** and resets `role` back to `'user'` so the app stops
treating them as a provider anywhere. Their client profile, client
bookings, and personal data are completely untouched. They stay logged in
and land in client mode.

### 5. Reactivation — logging back in within 30 days
Applies only to scenarios #1/#2 (full account deletion). If they log back
in before the 30 days are up, the app intercepts the login *before* it
reaches the normal app — it shows a "Welcome back" screen instead, with
the exact deletion date and days remaining. If they tap **Reactivate**:
a "Reactivating your account…" loading state shows while the flag is
cleared server-side. Since nothing was ever deleted, clearing the flag
restores everything exactly as it was — bookings, profile, provider
listing, all of it. If they tap **Not now, sign out**: they're signed out
again and the account stays flagged — the 30-day countdown keeps running
from the original deletion date, it doesn't reset.

### 6. Nobody logs back in — the 30-day purge
A daily background job finds every account whose `deletion_requested_at`
is 30+ days old and does the real, permanent deletion: reviews, bookings
(both sides), the provider profile if any, then the account itself —
including the actual login credential. At that point it is genuinely,
irreversibly gone. There is no recovery after this point.

### 7. Blocked: upcoming bookings
Both delete buttons refuse to run — instantly showing "You have N upcoming
appointments, please cancel or complete them first" — if there's a
pending/confirmed/in-progress booking dated today or later on the side
being deleted. This applies whether the result would be instant (#3/#4) or
deferred (#1/#2). No deleting out from under a paid, scheduled appointment.

## What's deleted vs. what survives forever

| Data | On deletion | Why |
|---|---|---|
| Bookings, messages, bookmarks, portfolio, etc. | Deleted (after grace period, if any) | Personal/operational data — no reason to keep it |
| `transactions` (payment records) | **Never deleted** | Legal requirement to retain financial records for tax/dispute purposes, independent of account deletion. Kept as a "pseudonymised" record — the amount/currency/status/Stripe reference stay, but the link to a live account is gone (see `supabase/transactions_survive_account_deletion.sql`) |
| `account_deletion_log` entry | Written, never removed | Records that a deletion happened (who, when, which hat) for support/fraud/dispute investigation. Locked down — nobody in the app can read it, only accessible via the Supabase dashboard |

## Known limitations
- **Reviews are not preserved** the way transactions are. When a provider's
  side is fully removed (instant or after the 30-day purge), reviews other
  clients wrote about them are hard-deleted along with it — there's no
  schema support yet to keep them the way transactions are kept.
- **Stripe isn't wired up yet.** When real payments/subscriptions exist,
  deleting `payment_methods` rows needs a matching Stripe API call to
  actually detach the card/cancel the subscription on Stripe's side — right
  now it only removes the local database record. See the "FOR WHOEVER WIRES
  UP REAL STRIPE INTEGRATION" note in `transactions_survive_account_deletion.sql`.

## Where this all lives

| File | What it does |
|---|---|
| `supabase/delete_account.sql` | `delete_client_profile()`, `delete_provider_profile()` — the two buttons' logic |
| `supabase/transactions_survive_account_deletion.sql` | Makes `transactions` survive deletion; creates `account_deletion_log` |
| `supabase/account_deletion_grace_period.sql` | Adds `deletion_requested_at`; `cancel_account_deletion()`; the daily purge cron job |
| `src/contexts/AuthContext.tsx` | Client-side glue: `deleteClientProfile()`, `deleteProviderProfile()`, `reactivateAccount()`, `declineReactivation()`, and the login-time check that intercepts a pending-deletion account |
| `src/screens/ReactivateAccountScreen.tsx` | The "Welcome back, reactivate?" screen |
| `src/navigation/RootNavigation.tsx` | Shows that screen instead of the normal app when a login is pending reactivation |
| `src/screens/ProfileInfoScreen.tsx` / `ProviderAccountInfoScreen.tsx` | The two Delete Account buttons + confirmation copy |

**Setup required:** run the three `.sql` files in Supabase, in this order:
`transactions_survive_account_deletion.sql` → `account_deletion_grace_period.sql` → `delete_account.sql`.
