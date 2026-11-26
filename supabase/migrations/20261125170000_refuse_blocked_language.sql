-- Refuse slurs and abusive language wherever one person's words reach another.
--
-- App Store guideline 1.2: an app with user-generated content needs a way of
-- filtering objectionable material before it is posted, alongside report and
-- block (20261125160000). The filter lives here, not in the app, so no screen,
-- RPC or service-role import can get round it.
--
-- What it checks (whole words only, so "Brazilian", "bikini" and "intimate"
-- are never touched): chat messages, reviews, provider and service names and
-- descriptions, client names, portfolio captions, promotions, Info Packs, and
-- the announcements and promotions a provider sends to clients. The app's own
-- notifications are not checked; they are built from text already checked here.
--
-- An UPDATE is only checked when the checked column itself changes, so a row
-- saved before this existed never blocks an unrelated edit.
--
-- The message is a P0001 guard written for people; the app shows it as is.
--
-- Frontier: live 20261125160000 (2026-11-25). Lock (none) on main; the only
-- other locks are on 2026-11-09/10 branches numbered far below live. New
-- table, functions and triggers only; nothing live is redefined.

BEGIN;

CREATE TABLE IF NOT EXISTS public.blocked_terms (
  pattern    text PRIMARY KEY,
  note       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Read only by the SECURITY DEFINER check below. No policies: nobody using the
-- app can read or change the list. Add a term with a plain INSERT as an admin.
ALTER TABLE public.blocked_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blocked_terms FROM PUBLIC, anon, authenticated;

-- Each pattern is a regular expression for one whole word or phrase; it is
-- wrapped in word boundaries when matched. Text is lower-cased and common
-- character swaps (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i) are undone
-- first, so "n1gg3r" matches like the plain spelling.
INSERT INTO public.blocked_terms (pattern, note) VALUES
  ('nigg(a|ah|as|az|er|ers|uh|uhs)',      'racial slur'),
  ('coons?',                              'racial slur'),
  ('pakis?',                              'racial slur'),
  ('chinks?',                             'racial slur'),
  ('gooks?',                              'racial slur'),
  ('kikes?',                              'antisemitic slur'),
  ('spics?',                              'racial slur'),
  ('wetbacks?',                           'racial slur'),
  ('beaners?',                            'racial slur'),
  ('ragheads?',                           'racial slur'),
  ('towelheads?',                         'racial slur'),
  ('zipperheads?',                        'racial slur'),
  ('jigaboos?',                           'racial slur'),
  ('sambos?',                             'racial slur'),
  ('golliwogs?',                          'racial slur'),
  ('gyppos?|gypos?',                      'anti-Traveller slur'),
  ('pikeys?',                             'anti-Traveller slur'),
  ('faggots?|faggy',                      'homophobic slur'),
  ('poofters?',                           'homophobic slur'),
  ('batty ?(boy|boys|man|men)',           'homophobic slur'),
  ('dykes?',                              'homophobic slur'),
  ('trann(y|ies)',                        'transphobic slur'),
  ('shemales?',                           'transphobic slur'),
  ('retards?|retarded',                   'ableist slur'),
  ('spazz?|spazzes|spastics?',            'ableist slur'),
  ('kill (yo)?urself|kys',                'telling someone to kill themselves'),
  ('send (me )?(ur |your |some )?nudes',  'asking for nude photos')
ON CONFLICT (pattern) DO NOTHING;

CREATE OR REPLACE FUNCTION public.contains_blocked_language(p_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_text IS NOT NULL AND btrim(p_text) <> '' AND EXISTS (
    SELECT 1
    FROM public.blocked_terms AS term
    WHERE translate(lower(p_text), '013457@$!', 'oieastasi')
          ~ ('\m(' || term.pattern || ')\M')
  );
$$;

-- One trigger function for every table: the columns to check are the trigger's
-- arguments.
CREATE OR REPLACE FUNCTION public.refuse_blocked_language()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_column text;
  v_new    text;
BEGIN
  FOREACH v_column IN ARRAY TG_ARGV LOOP
    v_new := to_jsonb(NEW) ->> v_column;
    IF TG_OP = 'UPDATE' AND v_new IS NOT DISTINCT FROM (to_jsonb(OLD) ->> v_column) THEN
      CONTINUE;
    END IF;
    IF public.contains_blocked_language(v_new) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'This includes language that isn''t allowed on CERVICED. Please change it and try again.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.contains_blocked_language(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refuse_blocked_language() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.provider_messages;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF content ON public.provider_messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('content');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.reviews;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF comment ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('comment');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.providers;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF display_name, about_text ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('display_name', 'about_text');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.services;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF name, description ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('name', 'description');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.users;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF name, business_name ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('name', 'business_name');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.portfolio_items;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF caption ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('caption');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.scheduled_announcements;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF title, body ON public.scheduled_announcements
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('title', 'body');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.promotions;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF title, description ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('title', 'description');

DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.info_packs;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT OR UPDATE OF title, content ON public.info_packs
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_language('title', 'content');

-- Only the notification types a provider writes the words of. Everything else
-- is the app's own copy and is left alone.
DROP TRIGGER IF EXISTS trg_refuse_blocked_language ON public.notifications;
CREATE TRIGGER trg_refuse_blocked_language
  BEFORE INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.type IN ('announcement', 'promotion'))
  EXECUTE FUNCTION public.refuse_blocked_language('title', 'message');

COMMIT;
