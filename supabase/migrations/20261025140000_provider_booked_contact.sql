-- ============================================================
-- Booked clients get their own contact details, separate from the public ones
--
-- Why: Communications (Contact Preferences) decides how clients who already
-- hold a booking can reach a provider, but the email / phone / WhatsApp it
-- offered were the same public.providers columns the public profile's Get In
-- Touch shows to anyone browsing. A provider couldn't give booked clients a
-- different number (a personal mobile, say) without publishing it to
-- everyone, and couldn't edit the details from that screen at all.
--
-- The new values can't live on public.providers: every client can read that
-- row, so "booked clients only" would mean nothing. They can't live on
-- provider_private_details either: on_provider_address_change fires on every
-- write to that table, and a phone-number edit is not an address change.
--
-- So:
--   * provider_booked_contact — one row per provider, owner-only RLS, nothing
--     readable by clients directly.
--   * get_booked_client_contact(booking_id) — the only way a client sees it.
--     Returns a row only to the client on that booking while it's still live
--     (pending / confirmed / in_progress), and only the channels the provider
--     has switched on in preferred_contact_methods.
--
-- NULL (or blank) in a column means "use my public detail", which is exactly
-- what booked clients saw before this migration, so nobody's Contact sheet
-- changes until a provider types a separate value. The on/off switches stay
-- in providers.preferred_contact_methods.
--
-- Frontier at authoring: 20261024100000. First written as 20261024105000,
-- then 20261025130000, and renumbered both times because another session
-- applied service search above it (the second time at exactly 20261025130000).
-- Frontier now 20261025130000. Re-check max(version) before applying.
-- Redefines nothing. The file records its own version.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_booked_contact (
  provider_id     uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  email           text CHECK (email IS NULL OR char_length(email) <= 254),
  phone           text CHECK (phone IS NULL OR char_length(phone) <= 32),
  whatsapp_number text CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) <= 32),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_booked_contact ENABLE ROW LEVEL SECURITY;

-- Same owner shape as provider_private_details_owner_all.
DROP POLICY IF EXISTS provider_booked_contact_owner_all ON public.provider_booked_contact;
CREATE POLICY provider_booked_contact_owner_all ON public.provider_booked_contact
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()));

REVOKE ALL ON public.provider_booked_contact FROM anon;
REVOKE ALL ON public.provider_booked_contact FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_booked_contact TO authenticated;

CREATE OR REPLACE FUNCTION public.get_booked_client_contact(p_booking_id uuid)
RETURNS TABLE (
  preferred_contact_methods text[],
  email text,
  phone text,
  whatsapp_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH m AS (
    SELECT
      COALESCE(p.preferred_contact_methods, ARRAY['in_app']::text[]) AS methods,
      COALESCE(NULLIF(btrim(c.email), ''), p.email) AS email,
      COALESCE(NULLIF(btrim(c.phone), ''), p.phone) AS phone,
      COALESCE(NULLIF(btrim(c.whatsapp_number), ''), p.whatsapp_number) AS whatsapp_number
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    LEFT JOIN public.provider_booked_contact c ON c.provider_id = p.id
    WHERE b.id = p_booking_id
      -- auth.uid() IS NOT NULL so an anonymous caller can't match a NULL
      -- user_id through NULL = NULL semantics (it can't, but say so).
      AND auth.uid() IS NOT NULL
      AND b.user_id = auth.uid()
      AND b.status IN ('pending', 'confirmed', 'in_progress')
  )
  -- A switched-off channel's value never leaves the database.
  SELECT
    m.methods,
    CASE WHEN 'email'    = ANY (m.methods) THEN m.email END,
    CASE WHEN 'phone'    = ANY (m.methods) THEN m.phone END,
    CASE WHEN 'whatsapp' = ANY (m.methods) THEN m.whatsapp_number END
  FROM m;
$function$;

REVOKE ALL ON FUNCTION public.get_booked_client_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booked_client_contact(uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261025140000', 'provider_booked_contact')
ON CONFLICT (version) DO NOTHING;

COMMIT;
