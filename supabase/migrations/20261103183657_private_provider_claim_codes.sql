-- Claim codes belong in a private RLS table. The public providers row is
-- readable while unclaimed, so a code stored on that row can be stolen.
BEGIN;

-- Older environments may have stored plaintext tokens on providers. Remove
-- that API and its columns before installing the private replacement.
DROP FUNCTION IF EXISTS public.claim_provider_profile(uuid, text);
ALTER TABLE public.providers
  DROP COLUMN IF EXISTS claim_token,
  DROP COLUMN IF EXISTS claim_token_expires_at,
  DROP COLUMN IF EXISTS claim_attempts,
  DROP COLUMN IF EXISTS claim_token_last_sent_at;

CREATE TABLE public.provider_claim_verifications (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  last_sent_at timestamptz NOT NULL
);

ALTER TABLE public.provider_claim_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_claim_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_claim_verifications TO service_role;

-- Called only by the claim-verification Edge Function's service-role client.
-- The row lock and conditional UPSERT enforce one send per minute even if two
-- requests arrive at once.
CREATE FUNCTION public.issue_provider_claim_code(p_provider_id uuid, p_code_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_rows integer;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid code hash.';
  END IF;

  SELECT * INTO v_provider
  FROM public.providers
  WHERE id = p_provider_id
  FOR UPDATE;
  IF NOT FOUND OR v_provider.is_claimed OR v_provider.source IS DISTINCT FROM 'scraped'
     OR nullif(btrim(v_provider.email), '') IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.provider_claim_verifications
    (provider_id, code_hash, expires_at, attempts, last_sent_at)
  VALUES (p_provider_id, p_code_hash, now() + interval '1 hour', 0, now())
  ON CONFLICT (provider_id) DO UPDATE
    SET code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        last_sent_at = excluded.last_sent_at
  WHERE provider_claim_verifications.last_sent_at <= now() - interval '1 minute';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_provider_claim_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_provider_claim_code(uuid, text) TO service_role;

-- A wrong code returns NULL instead of raising, so its attempt counter is
-- committed. The client turns NULL into the same generic error each time.
CREATE FUNCTION public.claim_provider_profile(p_provider_id uuid, p_claim_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_provider public.providers%ROWTYPE;
  v_code public.provider_claim_verifications%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to claim a profile.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.providers WHERE user_id = v_caller) THEN
    RAISE EXCEPTION 'This account already has a provider profile.';
  END IF;

  SELECT * INTO v_provider FROM public.providers
  WHERE id = p_provider_id FOR UPDATE;
  IF NOT FOUND OR v_provider.is_claimed OR v_provider.source IS DISTINCT FROM 'scraped' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_code FROM public.provider_claim_verifications
  WHERE provider_id = p_provider_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_code.expires_at <= now() OR v_code.attempts >= 5 THEN
    DELETE FROM public.provider_claim_verifications WHERE provider_id = p_provider_id;
    RETURN NULL;
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[0-9]{6}$'
     OR encode(extensions.digest(p_claim_token, 'sha256'), 'hex') <> v_code.code_hash THEN
    UPDATE public.provider_claim_verifications
       SET attempts = attempts + 1
     WHERE provider_id = p_provider_id;
    RETURN NULL;
  END IF;

  UPDATE public.providers
     SET user_id = v_caller, is_claimed = true, claimed_at = now()
   WHERE id = p_provider_id;
  DELETE FROM public.provider_claim_verifications WHERE provider_id = p_provider_id;
  RETURN p_provider_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_provider_profile(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_provider_profile(uuid, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261103183657', 'private_provider_claim_codes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
