# Booking-flow audit — what to run, in order

Status as of 2026-07-28. **Nothing here is committed.** All app changes are in the
working tree and typecheck clean (0 errors in `src/`).

To resume in a new chat: point Claude at this file.

---

## Context

An end-to-end audit of the booking flow found and fixed a set of issues. The app
changes are done. What remains is **database work you have to run yourself** —
the Supabase connector isn't authorised, so Claude can't run SQL for you.

Two facts established from your live DB:

- `providers.full_address` still exists → the address migration has **not** run
- 5 providers, 4 with an address (before the test-account delete below)

---

## STEP 1 — Delete the duplicate test provider

Two near-identical providers exist, on **different accounts**:

| id | name | active/live | bookings | verdict |
|---|---|---|---|---|
| `b6f60c71-4df6-4822-a3b5-331af4554cce` | `"Aestheicsby N "` — naomioahazie@gmail.com (Lara) | yes / yes | 56 | **real — KEEP** |
| `d79e9121-fa82-4c0d-b8cf-a4f99d3d05d4` | `"aestheicsby N "` — neaneac6@gmail.com (Dara) | no / no | 2 | test — delete |

Confirmed by email. The keeper is the **live** one (naomioahazie); the delete
target is the inactive test signup. Don't identify these by display name — they
differ by one capital letter, and the live one's slug (`glo-installs`) doesn't
match its name either.

### 1a. First, check what those 2 bookings are

```sql
select id, status, booking_date, customer_name, amount_paid
from public.bookings
where provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4';
```

If either belongs to a real client, deleting removes it from their history too.

### 1b. Run the delete

Only `bookings`, `reviews`, `transactions` block the delete (NO ACTION); every
other FK cascades. Order matters — reviews/transactions have `NOT NULL
booking_id` with no cascade, so they must go before the bookings they point at.

```sql
BEGIN;

-- Guard: refuses to run against a live provider, so a mistyped UUID can't
-- wipe the real account with its 55 bookings.
DO $$
DECLARE
  v_active BOOLEAN; v_live BOOLEAN; v_name TEXT;
BEGIN
  SELECT is_active, has_gone_live, display_name
    INTO v_active, v_live, v_name
    FROM public.providers
   WHERE id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found — nothing deleted';
  END IF;

  IF v_active OR v_live THEN
    RAISE EXCEPTION 'Refusing to delete "%" — it is active/live. Wrong id?', v_name;
  END IF;

  RAISE NOTICE 'Deleting test provider "%"', v_name;
END $$;

DELETE FROM public.reviews
 WHERE provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4'
    OR booking_id IN (SELECT id FROM public.bookings
                       WHERE provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4');

DELETE FROM public.transactions
 WHERE provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4'
    OR booking_id IN (SELECT id FROM public.bookings
                       WHERE provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4');

DELETE FROM public.bookings
 WHERE provider_id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4';

DELETE FROM public.providers
 WHERE id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4';

COMMIT;
```

All-or-nothing. If an unaccounted table blocks it, the whole thing rolls back and
names the table — extend the script and rerun.

### 1c. Verify

```sql
select count(*) from public.providers
 where id = 'd79e9121-fa82-4c0d-b8cf-a4f99d3d05d4';   -- expect 0

select count(*) filter (where full_address is not null) as with_address,
       count(*) as total
from public.providers;                                 -- expect 3, 4
```

Optional tidy-up (that account's notifications survive with a null provider_id):

```sql
delete from public.notifications
where user_id = 'bd6e84b3-aae1-4758-8ab5-c5d0a6c9302e';
```

To remove the login itself: Supabase dashboard → **Authentication → Users** →
delete `bd6e84b3-aae1-4758-8ab5-c5d0a6c9302e`. Do this **after** the SQL above.

---

### 1d. If you plan to re-create "Glo Installs" later

The neanea account was *intended* to be a Glo Installs hair profile. Deleting the
provider row does not block that — and it's actually the fix for the
"registration skipped questions" problem: InfoRegScreen flips into a reduced
**Edit Profile** form whenever a provider row already exists
(`InfoRegScreen.tsx:2141-2148`). With no row, you get the full flow, including
Service Type, which is locked once set.

**But free the slug first.** Lara's account currently holds `glo-installs` (see
Step 1.5). If it still holds it when you register, the new profile gets
`glo-installs-bd6e84b3` instead, because `providers.slug` is `UNIQUE NOT NULL`
and registration appends a suffix on collision.

---

## STEP 1.5 — Fix the live provider's name and slug

The keeper's `display_name` is `"Aestheicsby N "` — missing a 't' and carrying a
trailing space — while the account's `business_name` is `"Aestheticsby N"`. Its
slug is also `glo-installs`, which belongs to the *other* business entirely.

**This is now safe to change.** Bookings snapshot the provider name, so four
lookups used to key off that snapshot and would have silently broken for all 56
existing bookings on rename (reschedule limits, cancellation notice, address
countdown, and the contact sheet's email/WhatsApp/phone options). Those lookups
now follow `providerId`, which never changes — see BookingDetailScreen.

```sql
update public.providers
set display_name = 'Aestheticsby N'
where id = 'b6f60c71-4df6-4822-a3b5-331af4554cce';
```

Old bookings keep showing the old name in their history, which is correct: a
snapshot records what it was called at the time.

**Slug (optional, only if re-creating Glo Installs).** Freeing `glo-installs` so
the new profile can claim it cleanly. Safe to run after Step 1, since deleting
`d79e9121` frees `aestheicsby-n`:

```sql
update public.providers
set slug = 'aestheticsby-n'
where id = 'b6f60c71-4df6-4822-a3b5-331af4554cce';
```

Risk: the cart stores `providerSlug`, and checkout resolves it via
`getProviderBySlug` (`BookingContext.tsx:1093`). A client with one of that
provider's services already sitting in their cart may hit a checkout failure
until they re-add it. Any externally shared `/glo-installs` link also stops
resolving. Small window, but non-zero — skip this if you aren't re-creating
Glo Installs.

After renaming, open an existing booking as that provider's client and confirm
the contact sheet still offers email/WhatsApp/phone and the reschedule/cancel
rules still apply. If they don't, the id fallback isn't landing — say so.

---

## STEP 2 — Address privacy migration

**Backup snapshot first.** This drops a column.

### 2a. Record what's there now

```sql
select id, display_name, full_address
from public.providers
where full_address is not null
order by display_name;
```

Keep this — you'll compare against it. Should be 3 rows after Step 1.

### 2b. Run it

Run `supabase/restrict_provider_full_address.sql` (whole file, top to bottom).
On a branch first if you can.

**What it does:** the provider's street address currently sits in the
world-readable `providers` table, and four client browse queries use
`.select('*')` — so every client has been receiving every provider's home
address on every browse. This moves it to an owner-only
`provider_private_details` table. Because the column is *gone* rather than
permission-restricted, all six `select('*')` queries keep working untouched.

It copies, verifies the counts match, and only then drops the column. If the
copy comes up short it aborts without deleting anything.

### 2c. Verify the data moved

```sql
select p.display_name, d.full_address
from public.provider_private_details d
join public.providers p on p.id = d.provider_id
order by p.display_name;
```

Same rows and addresses as 2a.

### 2d. Test in the app

**Client side** — should look identical to before:
- Home screen provider sections load
- Search shows providers with their location
- A provider profile opens
- Saved providers still listed

**Provider side** — this is where a problem would show:
- Profile edit → is your address still there?
- Change it, save, reopen → did it persist?
- Provider home → does the "address set" tick still show?
- A booking → does the address release section still work?

Rollback is at the bottom of the SQL file if anything breaks.

---

## STEP 3 — Notification bundle (separate, still open)

Not address-related, but **your current code already depends on it.**

`src/contexts/BookingContext.tsx` removed the app-side auto-confirm and handed
the job to a DB trigger. If that trigger isn't deployed, **auto-accept providers'
bookings sit on "pending" forever.**

Check whether it's deployed:

```sql
select tgname from pg_trigger
where tgrelid = 'public.bookings'::regclass and not tgisinternal;
```

If `handle_new_booking` isn't listed, run `supabase/RUN_ALL_NOTIFICATION_FIXES.sql`
— whole file, top to bottom, order matters (several functions are defined more
than once and the last wins). Every section is idempotent, so re-running is safe.

Then deploy the Edge Function separately:

```
supabase functions deploy send-push-notification
```

---

## Still open in code (not done)

- `getProviderLocationsByDisplayNames` now has **zero callers** — dead code, kept
  as a safe fallback. Delete if you want.
- Tips record an amount but **no payment provider is wired up** — no money moves.
  Copy was changed to be accurate about this. Real tipping needs an integration.
- Add-on prices are revalidated on rebook; the base service too. Nothing else is.
- `jest-expo` isn't installed and ESLint 9 has no config file, so `npm test` and
  `npm run lint` both fail — pre-existing, unrelated to this work.
- `src/screens/InfoRegScreen.tsx` has a broken reference (`categoryServiceSuggestions`)
  from uncommitted changes that predate this work. Not touched.

---

## Verification standard used

TypeScript only — `npx tsc --noEmit` → **0 errors in `src/`**. Tests and lint
can't run (see above). Nothing was verified against a running app or database.
