-- Tell a client their cancellation window is closing while they wait for an
-- answer that may never come.
--
-- THE TRAP (FUTURE_SCALE.md, "Reschedule expiry eats the client's cancellation
-- right"). Reschedule expiry shipped 2026-08-26: if a provider never answers,
-- the request expires and the booking stays as originally scheduled. But
-- cancelling is governed by a SEPARATE, unrelated window —
-- cancel_own_booking() reads providers.cancellation_notice_hours, falling back
-- to booking_policies->>'cancelNotice', and hard-blocks with "This provider
-- requires N hours notice to cancel". Nothing connects the two.
--
-- So a client who acts entirely in good time can end up able to do neither:
-- at the moment they asked they still had their full cancellation right, and
-- by the time the provider's silence resolved they had lost it. Their
-- remaining options are attend an appointment they tried to move, or no-show
-- — and a no-show inside the notice window increments late_cancel_count on
-- client_provider_reliability, so the provider's silence ends up recorded
-- against the CLIENT's reliability.
--
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT.
--
-- It warns, once, while the client can still act: "they haven't answered; if
-- you'd rather cancel, you have until X." That restores the client's CHOICE
-- without inventing a right, which keeps this an engineering change rather
-- than a product/legal one (LEGAL-COMPLIANCE-NOTES.md §12 — whether provider
-- silence should entitle a client to cancel penalty-free is still open, and
-- is not decided here).
--
-- It does NOT close the case where the client was already at or past the
-- cancellation boundary when they asked — a provider whose reschedule notice
-- is shorter than their cancellation notice accepts requests made after the
-- cancel window has already shut, and there is no gap to warn into. That
-- residual band still needs the cap-or-grant decision recorded in
-- FUTURE_SCALE.md. A warning is the honest half, not the whole fix.
--
-- SCOPE: 'pending' requests only — the client is waiting on a provider and can
-- do nothing but wait. A 'provider_responded' request is deliberately excluded:
-- the client has an answer in front of them and can act on it, so a warning
-- there is a nag rather than news.
--
-- THE NOTICE RESOLUTION IS SHARED, NOT COPIED. A warning about a deadline that
-- isn't the one actually enforced is worse than no warning, and two copies of
-- the same CASE expression is precisely how that happens — one gets edited.
-- So the mapping moves into cancel_notice_hours() below and this function
-- calls it.
--
-- !! STEP 2 IS NOT DONE YET, AND THIS IS NOT CLOSED UNTIL IT IS.
-- cancel_own_booking() still carries its own inline copy. Until it is rewritten
-- to call cancel_notice_hours() too, there are still two definitions and they
-- can still drift — the difference is that there is now one obvious place to
-- move it to, rather than a comment asking the next person to remember.
--
-- It is deliberately not rewritten in this file: doing that safely needs its
-- live definition in hand (pg_get_functiondef), so the reproduction can be
-- diffed clause by clause — LANGUAGE, SECURITY, SET search_path and all — and
-- the Supabase connection was down when this was written. That exact shortcut
-- stripped SET search_path off three SECURITY DEFINER functions on 2026-08-27
-- (see MIGRATION_OWNER.md). Whoever applies this file has a live connection by
-- definition; do step 2 then, in the same pass.
--
-- A provider with no cancellation notice at all (resolved to 0) is skipped:
-- there is no window to lose, so there is nothing to warn about.

-- ── 1. The new notification type ───────────────────────────────────────────
-- The CHECK constraint is the piece that gets forgotten (see the auto-memory
-- new-notification-type-is-four-places, and 20260826101008, which existed only
-- because a cron function inserted a type this constraint didn't allow — tsc
-- and jest both stayed green while every insert was rejected at runtime).
--
-- APPENDED, not rewritten from a literal list. Every previous migration that
-- touched this constraint dropped it and recreated it from a full hard-coded
-- array, which is safe exactly once. Right now TWO unapplied migrations do
-- that at the same time: 20260827154500 (another session's no-show disputes)
-- adds 'no_show_disputed', and this one adds 'cancel_window_closing'. Whichever
-- ran second would silently DROP the other's value — no error, no conflict,
-- and the loss only visible when a cron insert starts failing.
--
-- So this reads whatever is live and inserts one value into it. It cannot drop
-- a type it doesn't know about, it is idempotent, and it is correct in either
-- order. Do it this way next time too.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass
     AND conname  = 'notifications_type_check';

  -- Refuse to guess. A missing constraint means something else is wrong, and
  -- recreating it from this file's idea of the list is how values get lost.
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found — not recreating it blind';
  END IF;

  IF position('''cancel_window_closing''' IN v_def) > 0 THEN
    RETURN;
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check %s',
    regexp_replace(v_def, 'ARRAY\[', 'ARRAY[''cancel_window_closing''::text, ')
  );
END $$;

-- ── 2. The shared notice resolution ────────────────────────────────────────
-- The single definition of "how long before this appointment does this
-- provider's cancellation policy stop allowing a cancellation".
--
-- Takes the two columns rather than a provider id so it stays IMMUTABLE and
-- inlinable, and can be used directly in a WHERE clause without a lookup per
-- row. No SET search_path on purpose: it references no objects at all, and a
-- SET clause would block inlining.
--
-- Returns 0 when the provider has no cancellation notice — meaning "no window",
-- not "zero hours of window".
CREATE OR REPLACE FUNCTION public.cancel_notice_hours(
  p_notice_hours      INT,
  p_booking_policies  JSONB
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE
           WHEN COALESCE(p_notice_hours, 0) > 0 THEN p_notice_hours
           ELSE CASE p_booking_policies->>'cancelNotice'
                  WHEN '24h' THEN 24
                  WHEN '48h' THEN 48
                  WHEN '72h' THEN 72
                  ELSE 0
                END
         END
$function$;

COMMENT ON FUNCTION public.cancel_notice_hours(INT, JSONB) IS
  'Hours of notice a provider requires to cancel: providers.cancellation_notice_hours, '
  'falling back to booking_policies->>''cancelNotice''. 0 means no notice period. '
  'THE definition — cancel_own_booking() must be rewritten to call this rather '
  'than carrying its own copy (see 20260827160000 header, step 2).';

-- ── 3. The sweep ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_cancel_window_closing_warnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rr.id                                        AS request_id,
           rr.booking_id,
           b.user_id                                    AS client_user_id,
           b.provider_id,
           NULLIF(btrim(b.service_name_snapshot), '')   AS service_name_snapshot,
           NULLIF(btrim(b.provider_name_snapshot), '')  AS provider_name_snapshot,
           cc.cancel_cutoff
      FROM public.booking_reschedule_requests rr
      JOIN public.bookings  b ON b.id = rr.booking_id
      JOIN public.providers p ON p.id = b.provider_id
      -- Computed once, named once, used three times below. The previous draft
      -- of this function repeated the same CASE expression in the select list
      -- and in both time bounds.
      CROSS JOIN LATERAL (
        SELECT public.cancel_notice_hours(p.cancellation_notice_hours,
                                          p.booking_policies) AS notice_hours
      ) nh
      CROSS JOIN LATERAL (
        SELECT (b.booking_date + b.booking_time)::TIMESTAMP
                 - (nh.notice_hours || ' hours')::INTERVAL AS cancel_cutoff
      ) cc
     WHERE rr.status = 'pending'
       -- Only a booking that could still be cancelled has a right to lose.
       AND b.status IN ('pending', 'confirmed')
       -- No notice period means no window to close.
       AND nh.notice_hours > 0
       -- Inside the last 6 hours before the window shuts, and not after it. A
       -- client who asks with less than 6h of window left is warned on the next
       -- tick, which is the case that matters most.
       AND NOW() >= cc.cancel_cutoff - INTERVAL '6 hours'
       AND NOW() <  cc.cancel_cutoff
       -- Once per request, not once per tick. Keyed on rr.updated_at rather
       -- than "ever", so a client who requests again later (the same row is
       -- reused via ON CONFLICT (booking_id) DO UPDATE) is warned again.
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.booking_id = rr.booking_id
            AND n.type = 'cancel_window_closing'
            AND n.created_at > rr.updated_at
       )
     FOR UPDATE OF rr
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable,
       booking_id, provider_id, recipient_role)
    VALUES (
      r.client_user_id, 'cancel_window_closing', 'Still Waiting on Your Provider',
      COALESCE(r.provider_name_snapshot, 'Your provider') ||
        ' hasn''t answered your reschedule request for ' ||
        COALESCE(r.service_name_snapshot, 'your appointment') ||
        '. If you''d rather cancel, you need to do that by ' ||
        to_char(r.cancel_cutoff, 'FMHH12:MI') ||
        lower(to_char(r.cancel_cutoff, 'am')) || ' on ' ||
        to_char(r.cancel_cutoff, 'FMDD Mon') ||
        ' — after that their cancellation notice period has passed.',
      'high', TRUE, r.booking_id, r.provider_id, 'client'
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_cancel_window_closing_warnings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_cancel_window_closing_warnings() FROM anon;
REVOKE ALL ON FUNCTION public.process_cancel_window_closing_warnings() FROM authenticated;

COMMENT ON FUNCTION public.process_cancel_window_closing_warnings() IS
  'Warns a client once, up to 6h before their cancellation window shuts, while '
  'a reschedule request they made is still unanswered. Restores the choice '
  'their provider''s silence would otherwise consume. See BOOKINGS.md §7a.';

-- ── 4. The schedule ────────────────────────────────────────────────────────
-- Every 15 minutes. The window it guards is 6 hours wide, so this is precise
-- enough; more frequent would only narrow an already-generous margin.
-- Unscheduling first makes the migration safe to re-run.
SELECT cron.unschedule('cancel-window-closing-warnings')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cancel-window-closing-warnings');

SELECT cron.schedule(
  'cancel-window-closing-warnings',
  '7,22,37,52 * * * *',
  $$ SELECT public.process_cancel_window_closing_warnings(); $$
);
