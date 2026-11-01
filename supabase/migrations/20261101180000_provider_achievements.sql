-- Provider achievements: what a provider has earned, private to them.
--
-- get_my_provider_achievements() is the one place the rules live: which
-- achievements exist, their targets, and what counts. The app only formats the
-- rows it returns.
--
-- Earned achievements are stored, because several counts can go back down (a
-- client removes a save, a photo is deleted, a rating slips) and an achievement
-- stays earned once it's earned. No app code reads the table directly.
--
-- Not here yet: the Fully Booked group. Nothing records a provider being fully
-- booked until the certificate is built, so showing it now would promise
-- something nothing can award.

BEGIN;

CREATE TABLE public.provider_achievements (
  provider_id     uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  earned_on       date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, achievement_key)
);

-- RLS on with no policies: only the SECURITY DEFINER function below touches it.
ALTER TABLE public.provider_achievements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_achievements FROM PUBLIC, anon, authenticated;

-- There is no record of when a provider went live. For those already live, the
-- day their profile was created is the closest true date. Anyone going live from
-- now on gets the day the screen first sees it.
INSERT INTO public.provider_achievements (provider_id, achievement_key, earned_on)
SELECT id, 'live', (COALESCE(claimed_at, created_at) AT TIME ZONE 'Europe/London')::date
FROM public.providers
WHERE has_gone_live = true AND user_id IS NOT NULL;

CREATE FUNCTION public.get_my_provider_achievements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_provider_id    uuid;
  v_has_gone_live  boolean;
  v_is_link_only   boolean;
  v_joined_on      date;
  v_today          date := (now() AT TIME ZONE 'Europe/London')::date;
  v_this_month     date := date_trunc('month', (now() AT TIME ZONE 'Europe/London'))::date;
  v_months_joined  integer;

  v_completed      date[];
  v_five_star      date[];
  v_review_count   integer;
  v_average_rating numeric;
  v_first_tip      date;
  v_returning      date[];
  v_saves          date[];
  v_bell           date[];
  v_photos         date[];
  v_refilled       date[];
  v_busy_best      integer;
  v_busy_day_on    date;

  -- Runs of calendar months with a completed booking: the longest ever decides
  -- what's earned, the one still going is the progress shown towards the next.
  v_run_start_3    date;
  v_run_start_6    date;
  v_run_start_12   date;
  v_run_now        integer;

  v_paid_pence     bigint;
  v_paid_first_on  date;
  v_paid_1000_on   date;
  v_paid_10000_on  date;

  v_rows           jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id, COALESCE(p.has_gone_live, false), COALESCE(p.booking_mode = 'external', false),
         (COALESCE(p.claimed_at, p.created_at) AT TIME ZONE 'Europe/London')::date
    INTO v_provider_id, v_has_gone_live, v_is_link_only, v_joined_on
  FROM providers p
  WHERE p.user_id = v_user_id;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'There is no provider profile on this account.' USING ERRCODE = 'P0001';
  END IF;

  v_months_joined := (extract(year FROM age(v_today, v_joined_on)) * 12
                      + extract(month FROM age(v_today, v_joined_on)))::integer;

  SELECT COALESCE(array_agg(b.booking_date ORDER BY b.booking_date), '{}')
    INTO v_completed
  FROM bookings b
  WHERE b.provider_id = v_provider_id AND b.status = 'completed';

  SELECT COUNT(*)::integer,
         round(avg(r.rating), 2),
         COALESCE(array_agg((r.created_at AT TIME ZONE 'Europe/London')::date ORDER BY r.created_at)
                  FILTER (WHERE r.rating = 5), '{}')
    INTO v_review_count, v_average_rating, v_five_star
  FROM reviews r
  WHERE r.provider_id = v_provider_id;

  SELECT min((COALESCE(t.paid_at, t.created_at) AT TIME ZONE 'Europe/London')::date)
    INTO v_first_tip
  FROM booking_tips t
  WHERE t.provider_id = v_provider_id AND t.status = 'succeeded';

  -- A returning client is someone on their second completed booking. Bookings
  -- under the provider's own account aren't a client coming back.
  SELECT COALESCE(array_agg(c.second_on ORDER BY c.second_on), '{}')
    INTO v_returning
  FROM (
    SELECT (array_agg(b.booking_date ORDER BY b.booking_date))[2] AS second_on
    FROM bookings b
    WHERE b.provider_id = v_provider_id AND b.status = 'completed' AND b.user_id <> v_user_id
    GROUP BY b.user_id
    HAVING COUNT(*) >= 2
  ) c;

  SELECT COALESCE(array_agg((s.created_at AT TIME ZONE 'Europe/London')::date ORDER BY s.created_at), '{}')
    INTO v_saves
  FROM bookmarks s
  WHERE s.provider_id = v_provider_id;

  SELECT COALESCE(array_agg((f.created_at AT TIME ZONE 'Europe/London')::date ORDER BY f.created_at), '{}')
    INTO v_bell
  FROM provider_follows f
  WHERE f.provider_id = v_provider_id AND f.notify_enabled = true;

  SELECT COALESCE(array_agg((i.created_at AT TIME ZONE 'Europe/London')::date ORDER BY i.created_at), '{}')
    INTO v_photos
  FROM portfolio_items i
  WHERE i.provider_id = v_provider_id;

  SELECT COALESCE(array_agg((b.created_at AT TIME ZONE 'Europe/London')::date ORDER BY b.created_at), '{}')
    INTO v_refilled
  FROM bookings b
  WHERE b.provider_id = v_provider_id
    AND b.waitlist_entry_id IS NOT NULL
    AND b.status IN ('confirmed', 'in_progress', 'completed');

  SELECT COALESCE(max(d.n), 0)::integer, min(d.booking_date) FILTER (WHERE d.n >= 5)
    INTO v_busy_best, v_busy_day_on
  FROM (
    SELECT b.booking_date, COUNT(*) AS n
    FROM bookings b
    WHERE b.provider_id = v_provider_id AND b.status = 'completed'
    GROUP BY b.booking_date
  ) d;

  WITH months AS (
    SELECT DISTINCT date_trunc('month', day)::date AS month FROM unnest(v_completed) AS day
  ), runs AS (
    SELECT min(m.month) AS first_month, max(m.month) AS last_month, COUNT(*)::integer AS length
    FROM (
      SELECT month,
             (extract(year FROM month) * 12 + extract(month FROM month))::integer
               - (row_number() OVER (ORDER BY month))::integer AS run
      FROM months
    ) m
    GROUP BY m.run
  )
  SELECT min(first_month) FILTER (WHERE length >= 3),
         min(first_month) FILTER (WHERE length >= 6),
         min(first_month) FILTER (WHERE length >= 12),
         -- This month not having a booking yet doesn't break a run that reached last month.
         COALESCE(max(length) FILTER (WHERE last_month >= (v_this_month - interval '1 month')::date), 0)
    INTO v_run_start_3, v_run_start_6, v_run_start_12, v_run_now
  FROM runs;

  -- Everything that has actually reached the provider's account: bookings, tips,
  -- and late and no-show fees.
  SELECT COALESCE(sum(p.pence), 0),
         min(p.on_day) FILTER (WHERE p.running > 0),
         min(p.on_day) FILTER (WHERE p.running >= 100000),
         min(p.on_day) FILTER (WHERE p.running >= 1000000)
    INTO v_paid_pence, v_paid_first_on, v_paid_1000_on, v_paid_10000_on
  FROM (
    SELECT t.pence, t.on_day, sum(t.pence) OVER (ORDER BY t.on_day ROWS UNBOUNDED PRECEDING) AS running
    FROM (
      SELECT (x.payout_amount - x.deducted_pence)::bigint AS pence,
             (x.updated_at AT TIME ZONE 'Europe/London')::date AS on_day
      FROM provider_payouts x
      WHERE x.provider_id = v_provider_id AND x.status = 'transferred'
      UNION ALL
      SELECT x.payout_pence::bigint, (x.updated_at AT TIME ZONE 'Europe/London')::date
      FROM booking_tips x
      WHERE x.provider_id = v_provider_id AND x.payout_status = 'transferred' AND x.payout_pence IS NOT NULL
      UNION ALL
      SELECT (x.payout_pence - x.deducted_pence)::bigint, (x.updated_at AT TIME ZONE 'Europe/London')::date
      FROM booking_fee_charges x
      WHERE x.provider_id = v_provider_id AND x.payout_status = 'transferred' AND x.payout_pence IS NOT NULL
    ) t
  ) p;

  -- ord, group, key, link-only providers get it, current, target, met, the day it was met.
  -- Link-only providers take bookings elsewhere, so only what doesn't need an
  -- in-app booking can apply to them.
  SELECT jsonb_agg(jsonb_build_object(
           'key', d.achievement_key, 'group', d.group_key, 'current', d.current_value,
           'target', d.target, 'met', d.met, 'met_on', d.met_on
         ) ORDER BY d.ord)
    INTO v_rows
  FROM (VALUES
    ( 1, 'bookings', 'booking_first', false, cardinality(v_completed)::bigint, 1::bigint, cardinality(v_completed) >= 1, v_completed[1]),
    ( 2, 'bookings', 'bookings_10',   false, cardinality(v_completed), 10, cardinality(v_completed) >= 10, v_completed[10]),
    ( 3, 'bookings', 'bookings_50',   false, cardinality(v_completed), 50, cardinality(v_completed) >= 50, v_completed[50]),
    ( 4, 'bookings', 'bookings_100',  false, cardinality(v_completed), 100, cardinality(v_completed) >= 100, v_completed[100]),
    ( 5, 'bookings', 'bookings_500',  false, cardinality(v_completed), 500, cardinality(v_completed) >= 500, v_completed[500]),

    ( 6, 'client_love', 'five_star_first', false, cardinality(v_five_star), 1, cardinality(v_five_star) >= 1, v_five_star[1]),
    ( 7, 'client_love', 'five_star_10',    false, cardinality(v_five_star), 10, cardinality(v_five_star) >= 10, v_five_star[10]),
    ( 8, 'client_love', 'five_star_50',    false, cardinality(v_five_star), 50, cardinality(v_five_star) >= 50, v_five_star[50]),
    ( 9, 'client_love', 'rating_48',       false, v_review_count, 25, v_review_count >= 25 AND v_average_rating >= 4.8, NULL),
    (10, 'client_love', 'tip_first',       false, (v_first_tip IS NOT NULL)::integer, 1, v_first_tip IS NOT NULL, v_first_tip),
    (11, 'client_love', 'returning_10',    false, cardinality(v_returning), 10, cardinality(v_returning) >= 10, v_returning[10]),
    (12, 'client_love', 'saves_25',        true,  cardinality(v_saves), 25, cardinality(v_saves) >= 25, v_saves[25]),
    (13, 'client_love', 'saves_100',       true,  cardinality(v_saves), 100, cardinality(v_saves) >= 100, v_saves[100]),
    (14, 'client_love', 'bell_10',         true,  cardinality(v_bell), 10, cardinality(v_bell) >= 10, v_bell[10]),
    (15, 'client_love', 'bell_50',         true,  cardinality(v_bell), 50, cardinality(v_bell) >= 50, v_bell[50]),

    (16, 'busy', 'months_3',  false, v_run_now, 3, v_run_start_3 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_3 + interval '2 months')::date)),
    (17, 'busy', 'months_6',  false, v_run_now, 6, v_run_start_6 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_6 + interval '5 months')::date)),
    (18, 'busy', 'months_12', false, v_run_now, 12, v_run_start_12 IS NOT NULL,
      (SELECT min(day) FROM unnest(v_completed) AS day WHERE day >= (v_run_start_12 + interval '11 months')::date)),
    (19, 'busy', 'busy_day',  false, v_busy_best, 5, v_busy_best >= 5, v_busy_day_on),

    (20, 'earnings', 'payout_first', false, v_paid_pence, 1, v_paid_first_on IS NOT NULL, v_paid_first_on),
    (21, 'earnings', 'paid_1000',    false, v_paid_pence, 100000, v_paid_1000_on IS NOT NULL, v_paid_1000_on),
    (22, 'earnings', 'paid_10000',   false, v_paid_pence, 1000000, v_paid_10000_on IS NOT NULL, v_paid_10000_on),

    (23, 'waitlist', 'waitlist_hero', false, cardinality(v_refilled), 5, cardinality(v_refilled) >= 5, v_refilled[5]),

    (24, 'established', 'live',      true, v_has_gone_live::integer, 1, v_has_gone_live, NULL),
    (25, 'established', 'photos_20', true, cardinality(v_photos), 20, cardinality(v_photos) >= 20, v_photos[20]),
    (26, 'established', 'months_on_6',  true, v_months_joined, 6, v_has_gone_live AND v_months_joined >= 6, (v_joined_on + interval '6 months')::date),
    (27, 'established', 'months_on_12', true, v_months_joined, 12, v_has_gone_live AND v_months_joined >= 12, (v_joined_on + interval '12 months')::date)
  ) AS d(ord, group_key, achievement_key, for_link_only, current_value, target, met, met_on)
  WHERE d.for_link_only OR NOT v_is_link_only;

  INSERT INTO provider_achievements (provider_id, achievement_key, earned_on)
  SELECT v_provider_id, r.value->>'key', COALESCE((r.value->>'met_on')::date, v_today)
  FROM jsonb_array_elements(v_rows) AS r
  WHERE (r.value->>'met')::boolean
  ON CONFLICT (provider_id, achievement_key) DO NOTHING;

  RETURN jsonb_build_object(
    'average_rating', v_average_rating,
    'achievements', (
      SELECT jsonb_agg(jsonb_build_object(
               'key', r.value->>'key',
               'group', r.value->>'group',
               'current', (r.value->>'current')::bigint,
               'target', (r.value->>'target')::bigint,
               'earned_on', a.earned_on
             ) ORDER BY r.ordinality)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS r
      LEFT JOIN provider_achievements a
        ON a.provider_id = v_provider_id AND a.achievement_key = r.value->>'key'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_provider_achievements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_provider_achievements() TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261101180000', 'provider_achievements')
ON CONFLICT DO NOTHING;

COMMIT;
