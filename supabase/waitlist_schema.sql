-- ============================================================
-- Provider Service Waitlist
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_waitlist (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id             UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name_snapshot  TEXT NOT NULL,
  provider_name_snapshot TEXT NOT NULL,
  user_name_snapshot     TEXT,
  preferred_dates        DATE[],
  notes                  TEXT,
  status                 TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','notified','booked','expired','cancelled')),
  position               INTEGER NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  notified_at            TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE(provider_id, user_id, service_id)
);

-- Auto-assign position (1-based per provider+service among 'waiting' entries)
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
  FROM public.provider_waitlist
  WHERE provider_id = NEW.provider_id
    AND service_id IS NOT DISTINCT FROM NEW.service_id
    AND status = 'waiting';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_position ON public.provider_waitlist;
CREATE TRIGGER trg_waitlist_position
  BEFORE INSERT ON public.provider_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_provider ON public.provider_waitlist(provider_id, service_id, status, position);
CREATE INDEX IF NOT EXISTS idx_waitlist_user     ON public.provider_waitlist(user_id, status);

-- RLS
ALTER TABLE public.provider_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Waitlist participants can see and manage their entries" ON public.provider_waitlist;
CREATE POLICY "Waitlist participants can see and manage their entries"
  ON public.provider_waitlist
  FOR ALL USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT user_id FROM public.providers WHERE id = provider_id)
  );

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provider_waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_waitlist;
  END IF;
END $$;
