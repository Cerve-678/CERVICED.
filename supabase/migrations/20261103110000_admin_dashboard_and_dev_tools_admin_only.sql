-- The admin dashboard, and developer tools for admins only.
--
-- 1. admin_dashboard_overview(p_days): one read for the Admin screen. Growth
--    (sign-ups, clients, providers, who signed in), the marketplace (providers
--    live, directory listings, bookings, money through the app) and problems
--    the server already records (background jobs that failed, failed payouts,
--    confirmation emails that didn't send, abandoned checkouts, open support
--    and refund requests). Counts only: no names, emails or other personal
--    fields leave this function. Every "new" figure is compared with the
--    period before it, so the app can show which way it is moving.
--
-- 2. admin_dev_reset(p_kind): the Developer tools reset buttons now call this.
--    It refuses anyone not in admin_users, then runs the existing self-scoped
--    reset. The three reset functions it wraps were executable by every
--    signed-in account, so any provider could call dev_reset_provider and
--    delete their clients' bookings and transactions straight through the API;
--    the app only hid the button. Execute on those three is taken away from
--    anon and authenticated here, so the wrapper is the only way in.
--    auth.uid() still reads the caller's JWT inside SECURITY DEFINER, so each
--    reset stays scoped to the admin's own account exactly as before.
--
-- Adds two functions and changes grants only: no table, row or existing
-- function body is touched.

BEGIN;

-- ── 1. the dashboard ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_overview(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer;
  v_now timestamptz := now();
  v_since timestamptz;
  v_prev timestamptz;
  v_week0 date;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can see this.';
  END IF;

  v_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_since := v_now - make_interval(days => v_days);
  v_prev := v_now - make_interval(days => v_days * 2);
  -- Twelve whole weeks, Monday first, ending with the current week.
  v_week0 := (date_trunc('week', v_now) - interval '11 weeks')::date;

  RETURN jsonb_build_object(
    'period_days', v_days,
    'generated_at', v_now,

    'accounts', (
      SELECT jsonb_build_object(
        'total', count(*),
        'new', count(*) FILTER (WHERE u.created_at >= v_since),
        'new_prev', count(*) FILTER (WHERE u.created_at >= v_prev AND u.created_at < v_since),
        'clients_total', count(*) FILTER (WHERE u.has_client_profile),
        'clients_new', count(*) FILTER (WHERE u.has_client_profile AND u.created_at >= v_since),
        'clients_new_prev', count(*) FILTER (WHERE u.has_client_profile AND u.created_at >= v_prev AND u.created_at < v_since),
        -- Only accounts with an app profile: auth.users also holds sign-ups
        -- that never finished, which would otherwise outnumber the total.
        'active', (SELECT count(*) FROM auth.users a JOIN public.users pu ON pu.id = a.id
                    WHERE a.last_sign_in_at >= v_since),
        'deleted', (SELECT count(*) FROM public.account_deletion_log d WHERE d.deleted_at >= v_since)
      )
      FROM public.users u
    ),

    -- Provider profiles people made themselves; scraped directory listings
    -- are counted separately below until someone claims them.
    'providers', (
      SELECT jsonb_build_object(
        'total', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped'),
        'new', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped' AND p.created_at >= v_since),
        'new_prev', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped' AND p.created_at >= v_prev AND p.created_at < v_since),
        'live', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped' AND p.has_gone_live AND p.is_active),
        'not_live', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped' AND NOT coalesce(p.has_gone_live, false)),
        'link_only', count(*) FILTER (WHERE p.source IS DISTINCT FROM 'scraped' AND p.booking_mode = 'external'),
        'listings_unclaimed', count(*) FILTER (WHERE p.source = 'scraped' AND NOT coalesce(p.is_claimed, false)),
        'claims_pending', (SELECT count(*) FROM public.provider_claim_requests c WHERE c.status = 'pending')
      )
      FROM public.providers p
    ),

    'weekly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'week_start', w.week_start,
        'accounts', (SELECT count(*) FROM public.users u
                      WHERE u.created_at >= w.week_start AND u.created_at < w.week_start + 7),
        'providers', (SELECT count(*) FROM public.providers p
                       WHERE p.source IS DISTINCT FROM 'scraped'
                         AND p.created_at >= w.week_start AND p.created_at < w.week_start + 7)
      ) ORDER BY w.week_start), '[]'::jsonb)
      FROM (SELECT (v_week0 + i * 7) AS week_start FROM generate_series(0, 11) AS i) w
    ),

    'bookings', (
      SELECT jsonb_build_object(
        'made', count(*) FILTER (WHERE b.created_at >= v_since),
        'made_prev', count(*) FILTER (WHERE b.created_at >= v_prev AND b.created_at < v_since),
        'completed', count(*) FILTER (WHERE b.status = 'completed' AND b.booking_date >= v_since::date AND b.booking_date <= v_now::date),
        'cancelled', count(*) FILTER (WHERE b.status = 'cancelled' AND coalesce(b.cancelled_at, b.updated_at) >= v_since),
        'upcoming', count(*) FILTER (WHERE b.status IN ('confirmed', 'pending') AND b.booking_date >= v_now::date)
      )
      FROM public.bookings b
    ),

    -- Pence, so the app never does money arithmetic on floats.
    'money', jsonb_build_object(
      'paid_in_pence', (SELECT coalesce(round(sum(cb.amount_due) * 100), 0)::bigint FROM public.checkout_batches cb
                         WHERE cb.status = 'finalised' AND coalesce(cb.finalised_at, cb.created_at) >= v_since),
      'paid_in_prev_pence', (SELECT coalesce(round(sum(cb.amount_due) * 100), 0)::bigint FROM public.checkout_batches cb
                              WHERE cb.status = 'finalised' AND coalesce(cb.finalised_at, cb.created_at) >= v_prev
                                AND coalesce(cb.finalised_at, cb.created_at) < v_since),
      'fees_pence', (SELECT coalesce(round(sum(cb.platform_fee) * 100), 0)::bigint FROM public.checkout_batches cb
                      WHERE cb.status = 'finalised' AND coalesce(cb.finalised_at, cb.created_at) >= v_since),
      'refunded_pence', (SELECT coalesce(sum(r.amount_pence), 0)::bigint FROM public.booking_refunds r
                          WHERE r.created_at >= v_since)
    ),

    'problems', jsonb_build_object(
      'jobs_failed_24h', (SELECT count(*) FROM cron.job_run_details d
                           WHERE d.status = 'failed' AND d.start_time >= v_now - interval '24 hours'),
      'jobs_failing', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.jobname, 'count', f.n) ORDER BY f.n DESC), '[]'::jsonb)
        FROM (
          SELECT j.jobname, count(*) AS n
          FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
          WHERE d.status = 'failed' AND d.start_time >= v_now - interval '24 hours'
          GROUP BY j.jobname ORDER BY count(*) DESC LIMIT 5
        ) f
      ),
      'payouts_failed', (SELECT count(*) FROM public.provider_payouts p WHERE p.status = 'failed'),
      'emails_failing', (SELECT count(*) FROM public.bookings b
                          WHERE b.confirmation_email_error IS NOT NULL
                            AND b.confirmation_email_sent_at IS NULL
                            AND b.created_at >= v_now - interval '7 days'),
      'checkouts_abandoned', (SELECT count(*) FROM public.checkout_batches cb
                               WHERE cb.status = 'expired' AND cb.created_at >= v_since),
      'support_open', (SELECT count(*) FROM public.support_requests s WHERE s.status IN ('open', 'in_progress')),
      'refunds_open', (SELECT count(*) FROM public.refund_requests r WHERE r.status IN ('with_provider', 'under_review')),
      'refunds_need_you', (SELECT count(*) FROM public.refund_requests r WHERE r.status = 'under_review')
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_overview(integer) TO authenticated;

-- ── 2. developer tools, admins only ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dev_reset(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can do this.';
  END IF;

  IF p_kind = 'client' THEN
    RETURN to_jsonb(public.dev_reset_client());
  ELSIF p_kind = 'provider_bookings' THEN
    RETURN to_jsonb(public.dev_reset_provider_bookings_only());
  ELSIF p_kind = 'provider' THEN
    RETURN to_jsonb(public.dev_reset_provider());
  END IF;
  RAISE EXCEPTION 'Unknown reset: %', p_kind;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dev_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dev_reset(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.dev_reset_client() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_reset_provider() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_reset_provider_bookings_only() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261103110000', 'admin_dashboard_and_dev_tools_admin_only')
ON CONFLICT (version) DO NOTHING;

COMMIT;
