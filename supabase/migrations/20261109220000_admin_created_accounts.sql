-- Accounts an admin opened from Admin → Create an account, kept and listable.
--
-- The admin-create-account edge function (service role) now writes one
-- admin_actions row per account it creates: action 'create_account',
-- target_id = the new auth user's id, detail = {account_type}. Only the type
-- is copied into the log. Name and email are read live from public.users, so
-- an account its owner later deletes doesn't leave their details behind here.
--
-- admin_created_accounts() is what Admin → Accounts you created reads. Admins
-- only (is_cerviced_admin()), newest first, capped.
--
-- Numbered above live max (20261109200000) and above the unapplied
-- 20261109210000_marketing_studio on feat/marketing-studio.

BEGIN;

-- ── 1. let admin_actions record an account being created ───────────────────
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('retry_payout', 'decline_refund_request', 'approve_refund', 'create_account'));

-- ── 2. the list ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_created_accounts(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_rows jsonb;
BEGIN
  IF NOT public.is_cerviced_admin() THEN
    RAISE EXCEPTION 'Only CERVICED admins can do this.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      a.created_at,
      jsonb_build_object(
        'user_id',         a.target_id,
        'created_at',      a.created_at,
        'account_type',    a.detail ->> 'account_type',
        'created_by_name', creator.name,
        -- NULL once the account has been deleted.
        'name',            u.name,
        'email',           u.email,
        -- Providers only: 'live', 'setting_up' (profile started, not live),
        -- or 'not_started' (hasn't saved their profile yet).
        'provider_status', CASE
          WHEN u.id IS NULL OR (a.detail ->> 'account_type') <> 'provider' THEN NULL
          WHEN p.any_live THEN 'live'
          WHEN p.any_row THEN 'setting_up'
          ELSE 'not_started'
        END
      ) AS row_data
    FROM public.admin_actions a
    LEFT JOIN public.users u ON u.id = a.target_id
    LEFT JOIN public.users creator ON creator.id = a.admin_user_id
    LEFT JOIN LATERAL (
      SELECT true AS any_row, bool_or(pr.has_gone_live IS TRUE) AS any_live
      FROM public.providers pr
      WHERE pr.user_id = a.target_id
      HAVING count(*) > 0
    ) p ON true
    WHERE a.action = 'create_account'
    ORDER BY a.created_at DESC
    LIMIT v_limit
  ) s;

  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_created_accounts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_created_accounts(integer) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109220000', 'admin_created_accounts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
