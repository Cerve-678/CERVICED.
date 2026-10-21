-- A client can always read the review they wrote.
--
-- Until now the only SELECT policies on reviews were reviews_public_read
-- (provider is live AND active) and reviews_owner_read (the provider). So once
-- a provider went inactive or was never live, the author's own review became
-- invisible to them: the Bookings list and booking detail showed "Rate" again,
-- and rating a second time failed on reviews' UNIQUE(booking_id).
--
-- Additive: one more permissive SELECT policy scoped to the row's author.
-- Exposes nothing new to anyone else.

DROP POLICY IF EXISTS "reviews_author_read" ON public.reviews;
CREATE POLICY "reviews_author_read" ON public.reviews
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261021114000', 'reviews_author_can_read_own')
ON CONFLICT (version) DO NOTHING;
