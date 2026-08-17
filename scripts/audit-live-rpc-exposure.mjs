import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');

// These functions either mutate booking state or bypass RLS. They must not
// inherit PostgreSQL's default PUBLIC EXECUTE grant. Public availability is
// deliberately restricted to the one read-only busy-span RPC below.
const contracts = [
  { name: 'append_saved_portfolio_item', arguments: 'p_user_id uuid, p_item_id text', allowed: ['authenticated'] },
  { name: 'attach_info_pack_to_booking', arguments: 'p_booking_id uuid, p_info_pack_id uuid', allowed: ['authenticated'] },
  { name: 'dev_reset_client', arguments: '', allowed: ['authenticated'] },
  { name: 'expire_cart_holds', arguments: '', allowed: [] },
  { name: 'expire_waitlist_holds', arguments: '', allowed: [] },
  { name: 'get_client_beauty_profile_for_provider', arguments: 'p_client_user_id uuid', allowed: ['authenticated'] },
  { name: 'get_promotion_audience', arguments: 'p_promotion_id uuid', allowed: ['authenticated'] },
  {
    name: 'get_provider_busy_spans',
    arguments: 'p_provider_id uuid, p_from_date date, p_to_date date',
    allowed: ['anon', 'authenticated'],
  },
  {
    name: 'invite_next_waitlist_entry',
    arguments:
      'p_provider_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone, p_base_price numeric, p_add_ons_total numeric, p_service_charge numeric, p_service_category_snapshot text',
    allowed: [],
  },
  { name: 'provider_release_booking_address', arguments: 'p_booking_id uuid', allowed: ['authenticated'] },
  { name: 'remove_saved_portfolio_item', arguments: 'p_user_id uuid, p_item_id text', allowed: ['authenticated'] },
  {
    name: 'set_booking_client_address',
    arguments: 'p_booking_id uuid, p_address text',
    allowed: ['authenticated'],
  },
];

// Trigger and cron helpers are never legitimate PostgREST endpoints. Keeping
// them in the same gate prevents a later CREATE OR REPLACE from silently
// restoring Supabase/PostgreSQL's default API-role grants.
const internalOnlyContracts = [
  ['apply_provider_booking_instructions', ''],
  ['auto_release_address', ''],
  ['check_and_set_provider_live', 'p_provider_id uuid'],
  ['compute_booking_effective_range', ''],
  ['enforce_booking_bookability', ''],
  ['handle_attach_info_packs', ''],
  ['handle_auto_send_intake_form', ''],
  ['handle_availability_window_change', ''],
  ['handle_booking_todo_notification', ''],
  ['handle_intake_form_completed', ''],
  ['handle_new_booking', ''],
  ['handle_new_info_pack', ''],
  ['handle_provider_address_change', ''],
  ['handle_provider_availability_change', ''],
  ['handle_provider_gone_live', ''],
  ['handle_provider_service_insert', ''],
  ['handle_review_received', ''],
  ['notify_on_new_chat_message', ''],
  ['prevent_self_conversation', ''],
  ['process_address_release_notifications', ''],
  ['process_auto_complete_bookings', ''],
  ['process_birthday_greetings', ''],
  ['process_client_appointment_reminders', ''],
  ['process_expire_stale_pending_bookings', ''],
  ['process_follow_availability_nudges', ''],
  ['process_follow_schedule_release_nudges', ''],
  ['process_pending_booking_warnings', ''],
  ['process_pending_scrape_jobs', ''],
  ['process_post_appt_check_ins', ''],
  ['process_provider_24hr_reminders', ''],
  ['process_provider_daily_recap', ''],
  ['process_provider_fully_booked_alerts', ''],
  ['process_provider_intake_form_reminders', ''],
  ['process_provider_not_started_reminders', ''],
  ['process_provider_stale_reschedule_reminders', ''],
  ['process_provider_unaccepted_booking_reminders', ''],
  ['process_provider_unpaid_deposit_reminders', ''],
  ['process_provider_unread_message_reminders', ''],
  ['process_rebooking_nudges', ''],
  ['process_scheduled_account_deletions', ''],
  ['process_scheduled_promotion_notifications', ''],
  ['send_push_on_notification_insert', ''],
  ['stamp_booking_address_snapshot', ''],
  ['throttle_reminder_notifications', ''],
  ['update_provider_rating', ''],
].map(([name, args]) => ({ name, arguments: args, allowed: [] }));

// Every RPC called by the shipped mobile app gets an explicit API contract.
// This is independent of its body-level ownership checks: permissions narrow
// the callable surface; authorization protects individual resources.
const authenticatedAppContracts = [
  ['cancel_account_deletion', ''],
  ['cancel_own_booking', 'p_booking_id uuid'],
  ['claim_cart_booking_slots', 'p_hold_batch_id uuid, p_items jsonb'],
  ['claim_provider_profile', 'p_provider_id uuid, p_claim_token text'],
  ['claim_waitlist_hold', 'p_booking_id uuid'],
  ['confirm_reschedule_own_booking', 'p_booking_id uuid, p_new_date date, p_new_time time without time zone, p_new_end_time time without time zone'],
  ['decline_reschedule_offer', 'p_booking_id uuid'],
  ['decline_waitlist_hold', 'p_booking_id uuid'],
  ['delete_client_profile', ''],
  ['delete_own_notification', 'p_notification_id uuid'],
  ['delete_provider_profile', ''],
  ['dev_reset_provider', ''],
  ['dev_reset_provider_bookings_only', ''],
  ['hold_cart_booking_slots', 'p_hold_batch_id uuid, p_items jsonb'],
  ['mark_all_notifications_read', ''],
  ['mark_notification_read', 'p_notification_id uuid'],
  ['provider_cancel_group_booking', 'p_group_booking_id uuid'],
  ['provider_cancel_own_booking', 'p_booking_id uuid'],
  ['provider_initiate_reschedule', 'p_booking_id uuid, p_proposed_slots jsonb'],
  ['provider_update_booking_status', 'p_booking_id uuid, p_status text'],
  ['provider_update_group_booking_status', 'p_group_booking_id uuid, p_status text'],
  ['reject_reschedule_request', 'p_booking_id uuid, p_response_note text'],
  ['release_cart_booking_slots', 'p_hold_batch_id uuid'],
  ['replace_provider_services', 'p_provider_id uuid, p_services jsonb'],
  ['request_reschedule_own_booking', 'p_booking_id uuid, p_preferred_dates text[]'],
  ['respond_to_reschedule_request', 'p_booking_id uuid, p_available_slots jsonb, p_response_note text'],
  ['update_conversation_last_message', 'conv_id uuid, msg_text text, p_sender_type text'],
].map(([name, args]) => ({ name, arguments: args, allowed: ['authenticated'] }));

const publicReadContracts = [
  ['get_trending_providers', 'p_limit integer'],
  ['get_user_public_profiles', 'p_user_ids uuid[]'],
].map(([name, args]) => ({ name, arguments: args, allowed: ['anon', 'authenticated'] }));

contracts.push(...authenticatedAppContracts, ...publicReadContracts, ...internalOnlyContracts);

const functionList = contracts
  .map(({ name, arguments: args }) => `('${name}', '${args.replaceAll("'", "''")}')`)
  .join(',\n    ');

const sql = `
WITH expected(name, identity_arguments) AS (
  VALUES
    ${functionList}
), functions AS (
  SELECT e.name, e.identity_arguments, p.oid, p.proacl, p.proowner
  FROM expected e
  LEFT JOIN pg_proc p
    ON p.proname = e.name
   AND pg_get_function_identity_arguments(p.oid) = e.identity_arguments
  LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' OR p.oid IS NULL
)
SELECT
  f.name,
  f.identity_arguments,
  f.oid IS NOT NULL AS present,
  COALESCE(
    array_agg(DISTINCT acl.grantee ORDER BY acl.grantee)
      FILTER (WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee IN ('public', 'anon', 'authenticated')),
    ARRAY[]::text[]
  ) AS execute_grantees
FROM functions f
LEFT JOIN LATERAL aclexplode(COALESCE(proacl, acldefault('f', proowner))) acl_entry ON TRUE
LEFT JOIN pg_roles r ON r.oid = acl_entry.grantee
LEFT JOIN LATERAL (
  SELECT CASE WHEN acl_entry.grantee = 0 THEN 'public' ELSE r.rolname END AS grantee,
         acl_entry.privilege_type
) acl ON TRUE
GROUP BY f.name, f.identity_arguments, f.oid
ORDER BY f.name, f.identity_arguments;
`;

const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const rows = JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];
const violations = [];

for (const contract of contracts) {
  const row = rows.find(
    (candidate) => candidate.name === contract.name && candidate.identity_arguments === contract.arguments,
  );
  if (!row?.present) {
    violations.push(`${contract.name}: function is missing`);
    continue;
  }

  const actual = Array.isArray(row.execute_grantees)
    ? row.execute_grantees
    : String(row.execute_grantees ?? '')
        .replace(/^\{|\}$/g, '')
        .split(',')
        .filter(Boolean);
  const unexpected = actual.filter((role) => !contract.allowed.includes(role));
  const missing = contract.allowed.filter((role) => !actual.includes(role));
  if (unexpected.length || missing.length) {
    violations.push(
      `${contract.name}: expected [${contract.allowed.join(', ')}], found [${actual.join(', ')}]`,
    );
  }
}

const passed = contracts.length - violations.length;
console.log(`Checked ${contracts.length} privileged RPC contracts: ${passed} passed, ${violations.length} failed.`);
if (process.env.VERBOSE_RPC_AUDIT === '1') {
  console.table(rows);
}
if (violations.length) {
  console.error(
    `Live privileged-RPC exposure audit failed: ${violations.length} contract(s) drifted. ` +
      'Set VERBOSE_RPC_AUDIT=1 for the per-function list.',
  );
  if (process.env.VERBOSE_RPC_AUDIT === '1') {
    for (const violation of violations) console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Live privileged-RPC exposure audit passed: ${contracts.length} contracts verified.`);
}
