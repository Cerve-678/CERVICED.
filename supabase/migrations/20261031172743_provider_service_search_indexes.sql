-- Provider and service discovery uses case-insensitive contains matches while
-- clients type. Trigram indexes keep those ILIKE filters responsive as the
-- catalogue grows, and the partial predicates keep inactive/ungone-live rows
-- out of the index entirely.
--
-- The extension is schema-qualified because Supabase installs extensions in
-- `extensions`, not `public`. No new public table/function is introduced, so
-- this migration does not require Data API grants or RLS changes.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS services_search_name_trgm_idx
  ON public.services USING gin (name extensions.gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS services_search_description_trgm_idx
  ON public.services USING gin (description extensions.gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS services_search_category_name_trgm_idx
  ON public.services USING gin (category_name extensions.gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS services_search_category_description_trgm_idx
  ON public.services USING gin (category_description extensions.gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS providers_search_display_name_trgm_idx
  ON public.providers USING gin (display_name extensions.gin_trgm_ops)
  WHERE is_active AND has_gone_live;

CREATE INDEX IF NOT EXISTS providers_search_about_text_trgm_idx
  ON public.providers USING gin (about_text extensions.gin_trgm_ops)
  WHERE is_active AND has_gone_live;

CREATE INDEX IF NOT EXISTS providers_search_location_text_trgm_idx
  ON public.providers USING gin (location_text extensions.gin_trgm_ops)
  WHERE is_active AND has_gone_live;
