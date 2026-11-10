-- 20261110170000_becca_misses.sql
--
-- Becca learns from the questions she didn't understand. When she misses a
-- question, the app waits for the person's next move and then records the
-- missed question once, with how it ended:
--   * resolved_by = 'chip'      they tapped one of her "did you mean" options;
--   * resolved_by = 'reworded'  they asked again in other words and she got it;
--   * resolved_by IS NULL       neither: they gave up or started over.
-- The first two say "these words mean that answer", which is what a weekly
-- review (/review-becca-misses) turns into new phrases in the capability
-- registry. Nothing here changes Becca's behaviour by itself: every new phrase
-- goes through a person and a PR.
--
-- What is kept, and for how long (the user's decisions, 2026-11-10):
--  * the question as typed, with email addresses, @handles, phone numbers,
--    street addresses and postcodes replaced by placeholders; which hat
--    asked; what it resolved to. Names can remain, so it is personal data.
--  * not a question that mentions health or another sensitive subject
--    (pregnancy, allergies, conditions, medication, religion, sexuality,
--    gender identity, a child). Those are dropped here, server-side, before
--    anything is written, so no app version can store one by mistake. It is
--    a keyword check, so the weekly review flags any that slip past it for
--    deletion, and the Privacy Policy says the check isn't perfect.
--  * the account, only so one person can't flood it (100 a day), so a
--    deletion request can find their rows, and so it goes with the account.
--  * 90 days, then deleted by a daily job; sooner when the person deletes a
--    Becca chat, that hat's profile, or their account.
-- Nothing here is readable by the app: rows are reachable only through
-- record_becca_miss (write). Review reads them with the service role.
--
-- Security review 2026-11-10: search_path is empty and every name is
-- qualified; redaction runs on the whole message before it is shortened (a
-- cut must never leave half an email behind); the daily cap takes a per-user
-- advisory lock so parallel calls can't overshoot it. Rows are untrusted
-- input to the review, which treats them as data, never instructions.

BEGIN;

CREATE TABLE public.becca_misses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hat text NOT NULL CHECK (hat IN ('client', 'provider')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 300),
  resolved_capability_id text CHECK (resolved_capability_id ~ '^[a-z_.]{1,80}$'),
  resolved_by text CHECK (resolved_by IN ('chip', 'reworded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((resolved_by IS NULL) = (resolved_capability_id IS NULL))
);

CREATE INDEX becca_misses_by_age ON public.becca_misses (created_at);
CREATE INDEX becca_misses_by_user_day ON public.becca_misses (user_id, created_at);

ALTER TABLE public.becca_misses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.becca_misses FROM PUBLIC, anon, authenticated;

-- Words that make a question health-adjacent or otherwise special-category
-- (UK GDPR Art. 9), plus a child's details. Matched at the START of a word
-- (\m), case-insensitive, so "pregnant", "pregnancy" and "allergic" are all
-- caught, and common misspellings and slang have their own stems. Errs
-- towards dropping: losing a harmless question costs nothing, keeping one of
-- these is data we have no basis to hold. Deliberately NOT here: service
-- words that only sound clinical (dermaplaning, afro hair, kids' cuts as a
-- category), which are ordinary beauty questions.
CREATE OR REPLACE FUNCTION public.becca_mentions_sensitive(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_text ~* (
    '\m('
    -- pregnancy and fertility, with misspellings and slang
    'preg|pergn|perg?nan|expecting|trimester|weeks along|postpartum|post ?natal|'
    'c-?section|caesarean|cesarean|breast ?feed|nursing|miscarr|ivf|fertility|'
    'menopaus|contracepti|the pill\M|hrt\M|hormon|period\M|'
    -- allergies and skin conditions
    'all?er[gj]|aler[gj]|anaphyla|epipen|intoleran|reaction|contraindicat|patch ?test|'
    'ecz|excema|exema|psor|rosacea|dermatitis|dermatolog|acne|cold ?sore|herpes|'
    'shingles|fung|infect|rash|hives|keloid|vitiligo|melasma|moles?\M|alopecia|'
    'hair ?loss|sensitive skin|retinol|'
    -- injury and symptoms
    'scar\M|scars|scarring|wound|bleed|bruis|swell|swollen|burn|blister|'
    'pain\M|pains|painful|sore|sick|illness|ill\M|unwell|symptom|'
    -- conditions and treatment
    'cancer|chemo|radiother|tumou?r|mastectom|lupus|arthrit|migraine|lymph|'
    'varicose|diabet|insulin|epilep|seizure|pacemaker|blood|warfarin|'
    'ha?emophilia|hiv|hepatitis|thyroid|asthma|pcos|endometrio|'
    'medica|medicine|prescri|antibiotic|steroid|accutane|roaccutane|'
    'isotretinoin|tretinoin|surgery|operation|stitches|contact lens|'
    'disab|wheelchair|mental|anxiety|anxious|depress|panic|ptsd|autis|adhd|'
    'trauma|self ?harm|eating disorder|'
    'doctor|gp\M|nhs|hospital|diagnos|condition|'
    -- religion, sexuality, gender identity
    'hijab|niqab|halal|kosher|muslim|jewish|christian|hindu|sikh|religio|'
    'gay\M|lesbian|bisexual|queer|trans\M|transgender|non-?binary|'
    -- a child
    'my (son|daughter|child|kid|baby|boy|girl)\M|[0-9]+ ?(year|yr)s? old'
    ')'
  );
$$;

REVOKE ALL ON FUNCTION public.becca_mentions_sensitive(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_becca_miss(
  p_hat text,
  p_message text,
  p_resolved_capability_id text DEFAULT NULL,
  p_resolved_by text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_text text;
  v_capability text;
  v_by text;
BEGIN
  IF v_uid IS NULL OR p_hat NOT IN ('client', 'provider') THEN RETURN; END IF;

  v_text := btrim(regexp_replace(left(coalesce(p_message, ''), 2000), '\s+', ' ', 'g'));
  IF v_text = '' THEN RETURN; END IF;

  -- Checked on the whole message, before anything is cut or replaced.
  IF public.becca_mentions_sensitive(v_text) THEN RETURN; END IF;

  -- One caller at a time per person, so parallel calls can't overshoot the cap.
  PERFORM pg_advisory_xact_lock(hashtext('becca_misses:' || v_uid::text));
  IF (SELECT count(*) FROM public.becca_misses m
       WHERE m.user_id = v_uid AND m.created_at > now() - interval '1 day') >= 100 THEN
    RETURN;
  END IF;

  -- Details nobody needs to see to teach Becca a phrase. On the full text,
  -- THEN shortened, so a cut can't leave part of one behind.
  v_text := regexp_replace(v_text, '[^\s@]+@[^\s@]+\.[^\s@]+', '[email]', 'g');
  v_text := regexp_replace(v_text, '(^|[^A-Za-z0-9_])@[A-Za-z0-9_.]+', '\1[handle]', 'g');
  v_text := regexp_replace(v_text, '\+?[0-9][0-9 ()./-]{7,}[0-9]', '[number]', 'g');
  v_text := regexp_replace(v_text, '\m[A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2}\M', '[postcode]', 'g');
  v_text := regexp_replace(
    v_text,
    '\m[0-9]{1,4}[a-z]? +([A-Za-z'']+ ){1,3}(road|rd|street|st|lane|ln|avenue|ave|close|way|drive|dr|crescent|place|gardens|grove|terrace|court|mews|hill|park)\M',
    '[address]', 'gi');
  v_text := left(v_text, 300);

  v_capability := CASE WHEN p_resolved_capability_id ~ '^[a-z_.]{1,80}$'
                        AND p_resolved_by IN ('chip', 'reworded')
                       THEN p_resolved_capability_id END;
  v_by := CASE WHEN v_capability IS NOT NULL THEN p_resolved_by END;

  INSERT INTO public.becca_misses (user_id, hat, message, resolved_capability_id, resolved_by)
  VALUES (v_uid, p_hat, v_text, v_capability, v_by);
END;
$$;

REVOKE ALL ON FUNCTION public.record_becca_miss(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_becca_miss(text, text, text, text) TO authenticated;

-- Deleting a Becca chat (or a hat's profile, which deletes that hat's chats)
-- forgets that hat's misses too. Rows aren't tied to a chat, so this clears
-- all of them for the hat: more than strictly needed, never less.
CREATE OR REPLACE FUNCTION public.forget_becca_misses_with_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.becca_misses WHERE user_id = OLD.user_id AND hat = OLD.hat;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.forget_becca_misses_with_chat() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER becca_chat_sessions_forget_misses
  AFTER DELETE ON public.becca_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.forget_becca_misses_with_chat();

-- The Privacy Policy says 90 days, so it has to hold when nobody is asking.
SELECT cron.schedule(
  'purge-becca-misses',
  '41 4 * * *',
  $$ DELETE FROM public.becca_misses WHERE created_at < now() - interval '90 days' $$
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110170000', 'becca_misses')
ON CONFLICT (version) DO NOTHING;

COMMIT;
