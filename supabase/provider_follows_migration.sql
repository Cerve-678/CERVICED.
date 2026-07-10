-- ============================================================
-- PROVIDER FOLLOWS
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_follows_provider_id ON public.provider_follows(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_follows_user_id     ON public.provider_follows(user_id);

ALTER TABLE public.provider_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own follows" ON public.provider_follows;
CREATE POLICY "Users manage their own follows"
  ON public.provider_follows
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Providers can read their follower rows" ON public.provider_follows;
CREATE POLICY "Providers can read their follower rows"
  ON public.provider_follows
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );
