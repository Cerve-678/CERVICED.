-- ════════════════════════════════════════════════════════════════════════════
-- restrict_provider_full_address.sql
--
-- ⚠️  Run on a Supabase BRANCH first, then production. Ships WITH the app
--     changes listed at the bottom — SQL alone will break the provider profile
--     screen, and app-alone leaves the leak open.
--
-- PROBLEM
-- ───────
-- address_release_enforcement.sql masks the provider address behind the
-- client_bookings view. But the address itself lives in providers.full_address,
-- and the browse policy grants every authenticated user SELECT on that table:
--
--   CREATE POLICY "providers_public_read" ON public.providers
--     FOR SELECT USING (is_active = TRUE);          -- phase1_schema.sql:656
--
-- RLS filters ROWS, not COLUMNS. Worse, four client-facing browse queries in
-- databaseService.ts (getProviders / bySlug / trending / nearby, lines ~55, 69,
-- 98, 149) use `.select('*')`, so the app is ALREADY pulling every active
-- provider's exact address down to every client on browse. For home-based and
-- mobile providers that is their home address, released or not.
--
-- WHY NOT JUST REVOKE THE COLUMN
-- ──────────────────────────────
-- Two reasons:
--   1. `SELECT *` requires privileges on every column, so revoking would break
--      all six providers.select('*') call sites at once — including
--      getMyProviderProfile, which drives all of provider mode.
--   2. Column privileges are per-ROLE, and clients and providers share the
--      `authenticated` role — so it cannot distinguish "the owning provider"
--      from "any other logged-in user".
--
-- APPROACH
-- ────────
-- Move the column out of the publicly-readable table into an owner-only one.
-- `select('*')` on providers then simply stops returning it — every existing
-- query keeps working untouched, and no column-level grants are needed.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Owner-only table for the private address ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_private_details (
  provider_id  UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  full_address TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_private_details ENABLE ROW LEVEL SECURITY;

-- Only the provider who owns the row may read or write it. No public policy —
-- absence of one means clients get nothing, which is the point.
DROP POLICY IF EXISTS "provider_private_details_owner_all"
  ON public.provider_private_details;
CREATE POLICY "provider_private_details_owner_all"
  ON public.provider_private_details
  FOR ALL
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── 2. Copy existing addresses across ────────────────────────────────────────
-- Guarded so re-running after step 3 is a harmless no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'providers'
       AND column_name  = 'full_address'
  ) THEN
    INSERT INTO public.provider_private_details (provider_id, full_address)
    SELECT id, full_address
      FROM public.providers
     WHERE full_address IS NOT NULL
    ON CONFLICT (provider_id) DO UPDATE
      SET full_address = EXCLUDED.full_address,
          updated_at   = NOW();

    -- Verify before destroying the source.
    IF (SELECT COUNT(*) FROM public.providers WHERE full_address IS NOT NULL)
       <> (SELECT COUNT(*) FROM public.provider_private_details WHERE full_address IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Address copy incomplete — aborting before dropping the column';
    END IF;

    -- ── 3. Remove it from the publicly-readable table ────────────────────────
    ALTER TABLE public.providers DROP COLUMN full_address;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- APP CHANGES THAT SHIP WITH THIS (already applied)
--   • databaseService.ts    — getMyProviderFullAddress / setMyProviderFullAddress
--                             read+write the new table. getProviderAddressSettings
--                             no longer selects full_address (its only caller,
--                             ProviderBookingDetailScreen, never used it).
--                             getProviderAddressSettingsByDisplayName deleted —
--                             it had no callers and only existed to leak this.
--   • providerRegistrationService.ts — saves/loads the address via the new table.
--   • ProviderHomeScreen.tsx — the addressSet setup check uses the new accessor.
--
-- Deliberately NOT changed: the six providers.select('*') queries. Dropping the
-- column is what makes them safe, so they need no edits.
--
-- VERIFY
--   -- as any authenticated client:
--   select full_address from providers limit 1;
--     → expect: column "full_address" does not exist
--   select * from provider_private_details;
--     → expect: 0 rows (RLS hides other providers')
--   -- as a provider, in the app: registration + profile edit still show the
--      address, and the provider home "address set" tick still resolves.
--
-- ROLLBACK
--   BEGIN;
--     ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS full_address TEXT;
--     UPDATE public.providers p
--        SET full_address = d.full_address
--       FROM public.provider_private_details d
--      WHERE d.provider_id = p.id;
--     DROP TABLE public.provider_private_details;
--   COMMIT;
--   (then revert the app changes above)
-- ════════════════════════════════════════════════════════════════════════════
