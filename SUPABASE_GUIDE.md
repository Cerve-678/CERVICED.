# Supabase Guide

How we approach Supabase changes in CERVICED — fast, safe, and without breaking anything.

---

## The Core Approach

**Check first. Then act. Never guess.**

Every time new screens or features are added, some of them will need new tables or columns. The process is always the same:

1. Run a check query to see what already exists
2. Only add what's missing
3. Verify it worked

This prevents duplicate constraints, overwritten data, and wasted time.

---

## Step 1 — Check Everything at Once

Before touching anything in Supabase, run this in the **SQL Editor**. Replace the table names with whatever you're working on.

```sql
SELECT
  'TABLES' as check_type, table_name as name, 'exists' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('table_one', 'table_two')

UNION ALL

SELECT
  'COLUMNS' as check_type,
  table_name || '.' || column_name as name,
  data_type as status
FROM information_schema.columns
WHERE table_name IN ('users', 'providers', 'promotions')
  AND column_name IN ('column_one', 'column_two')

UNION ALL

SELECT
  'RLS POLICIES' as check_type,
  tablename || ' - ' || policyname as name,
  'exists' as status
FROM pg_policies
WHERE tablename IN ('table_one', 'table_two')

ORDER BY check_type, name;
```

Read the results. Whatever is missing is what you do next. Whatever is already there — skip it.

---

## Step 2 — What Needs Supabase Changes

When new code is added, ask these questions:

| Question | If yes → |
|---|---|
| Does this screen read from a table? | Does that table exist? |
| Does this screen write new fields? | Do those columns exist? |
| Is this a brand new table? | Does it have RLS on and policies? |
| Does the code use `upsert` with `onConflict`? | Does the unique constraint exist? |
| Does this involve image/file upload? | Does the storage bucket exist with policies? |

---

## Step 3 — Adding Columns to Existing Tables

Always use `IF NOT EXISTS` so it won't error if already there.

```sql
ALTER TABLE table_name
  ADD COLUMN IF NOT EXISTS column_name TEXT,
  ADD COLUMN IF NOT EXISTS another_col BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS list_col    TEXT[] DEFAULT '{}';
```

### Common types used in CERVICED

| Type | Used for |
|---|---|
| `TEXT` | Names, notes, URLs, any string |
| `UUID` | IDs that reference other tables |
| `BOOLEAN` | True/false |
| `INTEGER` | Whole numbers |
| `TIMESTAMPTZ` | Date + time with timezone |
| `DATE` | Date only |
| `TIME` | Time only |
| `TEXT[]` | List of strings (e.g. categories, locations) |
| `UUID[]` | List of UUIDs |
| `JSONB` | Structured data (e.g. form questions and answers) |

---

## Step 4 — Creating a New Table

### In the UI (Table Editor → New table):

- Name the table
- Turn RLS **on**
- Turn Realtime **off** (unless the app subscribes to this table)
- Fix the `id` column: type = `uuid`, default = `gen_random_uuid()`, primary = ticked
- Leave `created_at` as-is (`timestamptz`, default `now()`)
- Add your columns, save

### Then in SQL Editor — always run after saving:

```sql
-- Foreign key (Supabase sometimes creates this from UI, sometimes not)
ALTER TABLE your_table
  ADD CONSTRAINT your_table_col_fkey
  FOREIGN KEY (col) REFERENCES other_table(id) ON DELETE CASCADE;

-- Unique constraint (only if code uses upsert with onConflict)
ALTER TABLE your_table
  ADD CONSTRAINT your_table_unique
  UNIQUE (col1, col2);
```

If you see `ERROR: constraint already exists` — ignore it. Supabase already made it. Move on.

---

## Step 5 — RLS Policies

RLS must be on and have at least one policy or all queries return empty. These are the patterns used in CERVICED:

**Provider owns the row:**
```sql
CREATE POLICY "Providers manage own [thing]"
  ON table_name FOR ALL
  USING (
    provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );
```

**Anyone can read:**
```sql
CREATE POLICY "Public read [thing]"
  ON table_name FOR SELECT
  USING (true);
```

**User owns the row:**
```sql
CREATE POLICY "Users manage own [thing]"
  ON table_name FOR ALL
  USING (user_id = auth.uid());
```

**Client can read their own data:**
```sql
CREATE POLICY "Clients see own [thing]"
  ON table_name FOR SELECT
  USING (client_user_id = auth.uid());
```

---

## Step 6 — Storage Buckets

For image/file uploads:

1. **Storage** → **New bucket** → name it → toggle Public ON → save
2. Then run policies in SQL Editor:

```sql
CREATE POLICY "Public read bucket-name"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bucket-name');

CREATE POLICY "Authenticated upload bucket-name"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bucket-name' AND auth.role() = 'authenticated');

CREATE POLICY "Owner delete bucket-name"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'bucket-name' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Step 7 — Verify

After any SQL block, confirm it worked:

```sql
-- Check columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'your_table'
ORDER BY ordinal_position;

-- Check policies
SELECT policyname FROM pg_policies WHERE tablename = 'your_table';
```

`Success. No rows returned` from an ALTER or CREATE means it worked.
A result set from a SELECT means the rows/columns are there.

---

## Common Errors

| Error | What it means | What to do |
|---|---|---|
| `constraint already exists` | Supabase already created it | Ignore, move on |
| `column already exists` | Column was already added | Use `IF NOT EXISTS` next time |
| `relation does not exist` | Table not created yet | Create the table first |
| `new row violates row-level security` | No matching RLS policy | Add the correct policy |
| Query returns empty array | RLS on but no policy | Add a SELECT policy |

---

## Table Order When Creating (Important)

Some tables reference others. Always create in this order to avoid foreign key errors:

1. `users` and `providers` (already exist — base tables)
2. `services`, `bookings` (already exist)
3. `provider_form_library` — must exist before `booking_intake_forms`
4. `booking_intake_forms` — references form library

Never create a table that references another table that doesn't exist yet.

---

## CERVICED Tables Reference

| Table | Purpose |
|---|---|
| `users` | All accounts — clients and providers |
| `providers` | Provider profiles |
| `services` | Provider service menus |
| `service_images` | Images per service |
| `service_add_ons` | Add-ons per service |
| `bookings` | All bookings |
| `booking_add_ons` | Add-ons attached to a specific booking |
| `booking_reschedule_requests` | Reschedule back-and-forth between client and provider |
| `booking_intake_forms` | Intake/consent forms sent to clients per booking |
| `provider_form_library` | Provider's saved reusable form templates |
| `provider_availability` | Provider's weekly opening hours |
| `provider_blocked_dates` | Specific dates a provider has blocked off |
| `promotions` | Provider deals and promotions |
| `portfolio_items` | Provider portfolio photos |
| `reviews` | Client reviews |
| `notifications` | In-app notifications |
| `bookmarks` | Clients bookmarking providers |
| `event_plans` | Client event planning |
| `event_tasks` | Tasks within an event plan |
| `event_checklist_items` | Checklist items per task |

### Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `promotion-images` | Yes | Images attached to promotions |

---

## Key Columns Added This Batch (for reference)

### `users` table — beauty profile + social
`hair_type`, `skin_type`, `skin_concerns`, `style_vibe`, `allergies`, `treatment_history`, `medical_notes`, `photography_consent`, `service_locations`, `maintenance_frequency`, `referral_source`, `business_phone`, `instagram`, `tiktok`, `website`

### `providers` table — contact settings
`preferred_contact_methods` (TEXT[]), `whatsapp_number`

### `promotions` table — promotion features
`service_ids` (UUID[]), `promo_code`, `image_url`, `scheduled_notify_at`, `notify_sent_at`

---

## Future — Things Worth Adding

These aren't done yet but will be needed as the app grows:

**`updated_at` auto-trigger** — automatically stamps the time whenever a row is updated. Currently `updated_at` on new tables only updates if the code explicitly sets it.
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_table_name_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Auth trigger** — automatically creates a `users` row the moment someone signs up, instead of relying on the app to create it manually. This eliminates the signup race condition entirely.
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, login_method)
  VALUES (NEW.id, NEW.email, 'user', 'email')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Performance indexes** — as the user base grows, add indexes on frequently queried foreign keys:
```sql
CREATE INDEX IF NOT EXISTS idx_bookings_user_id      ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id  ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id   ON reviews(provider_id);
```
