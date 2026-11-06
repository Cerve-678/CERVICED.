-- Admin-owned directory listings. These are public link-only provider cards
-- without an account until the business owner has claimed them.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_directory_listings()
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  service_category text,
  location_text text,
  logo_url text,
  external_booking_url text,
  instagram text,
  website text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can view directory listings.';
  END IF;
  RETURN QUERY SELECT
    p.id, p.slug, p.display_name, p.service_category, p.location_text,
    p.logo_url, p.external_booking_url, p.instagram, p.website, p.created_at
  FROM public.providers p
  WHERE p.source = 'scraped' AND p.is_claimed = false
  ORDER BY p.created_at DESC, p.display_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_directory_listing(
  p_id uuid,
  p_display_name text,
  p_service_category text,
  p_location_text text,
  p_external_booking_url text,
  p_logo_url text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_website text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_slug_base text;
  v_slug text;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can manage directory listings.';
  END IF;
  IF char_length(btrim(coalesce(p_display_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter the business name.';
  END IF;
  IF p_service_category NOT IN ('HAIR', 'NAILS', 'MUA', 'AESTHETICS', 'BROWS', 'LASHES') THEN
    RAISE EXCEPTION 'Choose a valid service category.';
  END IF;
  IF btrim(coalesce(p_external_booking_url, '')) !~* '^https?://[^[:space:]]+\.[^[:space:]]+' THEN
    RAISE EXCEPTION 'Enter a valid booking link.';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.providers
       SET display_name = btrim(p_display_name),
           service_category = p_service_category,
           location_text = nullif(btrim(coalesce(p_location_text, '')), ''),
           external_booking_url = btrim(p_external_booking_url),
           logo_url = coalesce(nullif(btrim(coalesce(p_logo_url, '')), ''), logo_url),
           instagram = nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), ''),
           website = nullif(btrim(coalesce(p_website, '')), '')
     WHERE id = p_id AND source = 'scraped' AND is_claimed = false
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'This listing is no longer available to edit.';
    END IF;
    RETURN v_id;
  END IF;

  v_slug_base := trim(both '-' FROM regexp_replace(lower(btrim(p_display_name)), '[^a-z0-9]+', '-', 'g'));
  IF v_slug_base = '' THEN
    v_slug_base := 'provider';
  END IF;
  v_slug := left(v_slug_base, 42) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.providers (
    slug, display_name, service_category, location_text, logo_url,
    external_booking_url, booking_mode, instagram, website,
    is_active, is_claimed, source, scraped_at, scraped_fields
  ) VALUES (
    v_slug, btrim(p_display_name), p_service_category,
    nullif(btrim(coalesce(p_location_text, '')), ''),
    nullif(btrim(coalesce(p_logo_url, '')), ''),
    btrim(p_external_booking_url), 'external',
    nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), ''),
    nullif(btrim(coalesce(p_website, '')), ''),
    true, false, 'scraped', now(),
    ARRAY['display_name', 'service_category', 'location_text', 'external_booking_url']
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_directory_listing(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can manage directory listings.';
  END IF;
  DELETE FROM public.providers
  WHERE id = p_id AND source = 'scraped' AND is_claimed = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing is no longer available to remove.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_directory_listings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_directory_listing(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_directory_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_directory_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_directory_listing(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_directory_listing(uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104135806', 'admin_directory_listings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
