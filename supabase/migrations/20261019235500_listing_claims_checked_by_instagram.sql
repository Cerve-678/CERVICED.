-- ============================================================
-- Listing claims are checked through Instagram, by hand, not by an emailed code
--
-- Why: the email-code claim kept its code on public.providers (claim_token),
-- and providers_unclaimed_read lets anon SELECT every column of an unclaimed
-- row — so the code proving ownership was readable by anyone with the app's
-- public key. Imported listings (Gina's directory) also have no email, so the
-- email route could never work for them anyway.
--
-- New flow:
--   1. A signed-in account asks to claim a listing: request_provider_claim()
--      records a provider_claim_requests row and hands back a bio code
--      (e.g. CERVICED-048213) for the listing's Instagram handle. At most
--      five claims per account per day.
--   2. The owner puts the code in that Instagram bio.
--   3. Someone at CERVICED (in practice a Claude session running the
--      check-claims command) looks at the bio and calls review_provider_claim()
--      to approve or reject. That function is not callable from the app at all.
--   On approval: if the account has no provider profile yet, the listing
--   becomes theirs (the old attach behaviour). If it already has one — the
--   usual case, since signup carries on while the claim waits — the listing
--   is removed: its imported details were already copied into their signup.
--
-- Nothing here is a secret. The bio code only proves who controls the
-- Instagram account, and approval is tied to the request's user_id, so a code
-- copied out of someone's bio is no use to anyone else. Codes are never
-- reused, so an old code left in a bio can't later point at a new request.
--
-- Frontier at authoring: 20261019233000. claim_provider_profile() is the only
-- live function that reads the dropped columns (checked with pg_proc on
-- 2026-10-19), so no trigger or view breaks when they go.
-- ============================================================

BEGIN;

-- 1. Retire the email-code claim --------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_provider_profile(uuid, text);

DROP INDEX IF EXISTS public.idx_providers_claim_token;
ALTER TABLE public.providers
  DROP COLUMN IF EXISTS claim_token,              -- takes its UNIQUE constraint with it
  DROP COLUMN IF EXISTS claim_token_expires_at,
  DROP COLUMN IF EXISTS claim_attempts,
  DROP COLUMN IF EXISTS claim_token_last_sent_at;

-- 2. Claim requests ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_claim_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: an approved claim on an account that already has a
  -- profile deletes the listing, and the request is the record of why.
  provider_id      uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Snapshots, so the reviewer checks the handle the claimant was shown even
  -- if the listing later changes or is gone.
  listing_name     text NOT NULL,
  instagram_handle text NOT NULL,
  bio_code         text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  -- Written by the reviewer for the record. Not readable by the claimant
  -- (left out of the column grant below).
  review_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  CONSTRAINT provider_claim_requests_decided_check
    CHECK ((status = 'pending') = (decided_at IS NULL))
);

COMMENT ON TABLE public.provider_claim_requests IS
  'Claims on imported (is_claimed = false) listings, proven by a code in the listing''s Instagram bio and approved by hand via review_provider_claim().';

-- One open claim per account at a time.
CREATE UNIQUE INDEX IF NOT EXISTS provider_claim_requests_one_open_per_user
  ON public.provider_claim_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS provider_claim_requests_open_idx
  ON public.provider_claim_requests (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS provider_claim_requests_provider_idx
  ON public.provider_claim_requests (provider_id);

-- Claimants read their own requests, minus the reviewer's note; every write
-- goes through the functions below.
ALTER TABLE public.provider_claim_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_claim_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, provider_id, user_id, listing_name, instagram_handle, bio_code,
              status, created_at, decided_at)
  ON public.provider_claim_requests TO authenticated;

DROP POLICY IF EXISTS provider_claim_requests_own_read ON public.provider_claim_requests;
CREATE POLICY provider_claim_requests_own_read
  ON public.provider_claim_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. request_provider_claim(p_provider_id) -----------------------------------------
--   Called by the claimant once signed in. Idempotent for the same listing
--   (hands back the same open request and code); asking for a different
--   listing withdraws the account's previous open claim.
CREATE OR REPLACE FUNCTION public.request_provider_claim(p_provider_id uuid)
 RETURNS public.provider_claim_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_listing record;
  v_open    public.provider_claim_requests;
  v_handle  text;
  v_code    text;
  v_row     public.provider_claim_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to claim a listing.';
  END IF;

  SELECT id, display_name, instagram, is_claimed
    INTO v_listing
    FROM public.providers
   WHERE id = p_provider_id;

  IF NOT FOUND OR v_listing.is_claimed THEN
    RAISE EXCEPTION 'This listing has already been claimed or removed.';
  END IF;

  v_handle := lower(regexp_replace(btrim(coalesce(v_listing.instagram, '')), '^@+', ''));
  IF v_handle = '' THEN
    RAISE EXCEPTION 'This listing has no Instagram to check it against. Email support@cerviced.co and we''ll help you claim it.';
  END IF;

  SELECT * INTO v_open
    FROM public.provider_claim_requests
   WHERE user_id = v_uid AND status = 'pending'
   FOR UPDATE;

  IF v_open.id IS NOT NULL AND v_open.provider_id = p_provider_id THEN
    v_open.review_note := NULL;  -- the reviewer's note is never the claimant's to read
    RETURN v_open;
  END IF;

  -- Each switch of listing makes a new row; cap it so one account can't churn
  -- through claims (or through the code space).
  IF (SELECT count(*) FROM public.provider_claim_requests
       WHERE user_id = v_uid AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'You''ve started too many claims today. Please try again tomorrow.';
  END IF;

  IF v_open.id IS NOT NULL THEN
    UPDATE public.provider_claim_requests
       SET status = 'withdrawn',
           decided_at = now(),
           review_note = 'Replaced by a claim on another listing.'
     WHERE id = v_open.id;
  END IF;

  -- Codes are never reused (bio_code is UNIQUE across every row, not just open
  -- ones). A million codes; retry on the rare collision.
  FOR i IN 1..20 LOOP
    v_code := 'CERVICED-' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.provider_claim_requests WHERE bio_code = v_code);
    v_code := NULL;
  END LOOP;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Could not create a claim code. Please try again.';
  END IF;

  INSERT INTO public.provider_claim_requests
    (provider_id, user_id, listing_name, instagram_handle, bio_code)
  VALUES
    (p_provider_id, v_uid, v_listing.display_name, v_handle, v_code)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_provider_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_provider_claim(uuid) TO authenticated;

-- 4. review_provider_claim(p_request_id, p_approve, p_note) ----------------------
--   For the reviewer only (service role / SQL editor / Supabase MCP). Never
--   granted to anon or authenticated: approving is the whole point of the check.
CREATE OR REPLACE FUNCTION public.review_provider_claim(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text DEFAULT NULL
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req        public.provider_claim_requests;
  v_is_claimed boolean;
  v_deleted    integer;
BEGIN
  SELECT * INTO v_req
    FROM public.provider_claim_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No claim request %.', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Claim request % is already %.', p_request_id, v_req.status;
  END IF;

  IF NOT p_approve THEN
    UPDATE public.provider_claim_requests
       SET status = 'rejected', decided_at = now(), review_note = p_note
     WHERE id = p_request_id;
    RETURN 'rejected';
  END IF;

  SELECT is_claimed INTO v_is_claimed
    FROM public.providers
   WHERE id = v_req.provider_id
   FOR UPDATE;

  IF NOT FOUND OR v_is_claimed THEN
    RAISE EXCEPTION 'The listing for claim % is gone or already claimed. Reject it instead.', p_request_id;
  END IF;

  UPDATE public.provider_claim_requests
     SET status = 'approved', decided_at = now(), review_note = p_note
   WHERE id = p_request_id;

  -- Anyone else's open claim on this listing can't succeed now.
  UPDATE public.provider_claim_requests
     SET status = 'rejected',
         decided_at = now(),
         review_note = 'Another account proved it owns this Instagram.'
   WHERE provider_id = v_req.provider_id
     AND status = 'pending'
     AND id <> p_request_id;

  IF EXISTS (SELECT 1 FROM public.providers WHERE user_id = v_req.user_id) THEN
    -- Their own profile already carries the listing's imported details
    -- (prefilled at signup), so the placeholder just goes. An unclaimed
    -- listing can't be booked or reviewed, but say so plainly rather than
    -- fail on a foreign key if one somehow has been. Anything else hanging
    -- off it (imported services, portfolio) cascades away with it.
    IF EXISTS (SELECT 1 FROM public.bookings WHERE provider_id = v_req.provider_id)
       OR EXISTS (SELECT 1 FROM public.reviews WHERE provider_id = v_req.provider_id) THEN
      RAISE EXCEPTION 'The listing for claim % has bookings or reviews, so it can''t be removed. Sort it out by hand.', p_request_id;
    END IF;

    DELETE FROM public.providers
     WHERE id = v_req.provider_id AND is_claimed = false;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> 1 THEN
      RAISE EXCEPTION 'The listing for claim % could not be removed.', p_request_id;
    END IF;
    RETURN 'approved: listing removed, the account already has a profile';
  END IF;

  UPDATE public.providers
     SET user_id = v_req.user_id,
         is_claimed = true,
         claimed_at = now()
   WHERE id = v_req.provider_id;

  UPDATE public.users SET role = 'provider' WHERE id = v_req.user_id;

  RETURN 'approved: listing attached to the account';
END;
$function$;

REVOKE ALL ON FUNCTION public.review_provider_claim(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

COMMIT;
