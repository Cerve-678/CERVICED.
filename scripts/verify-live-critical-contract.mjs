import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');

const sql = `
WITH expected(kind, name) AS (
  VALUES
    ('table', 'bookings'),
    ('table', 'providers'),
    ('table', 'provider_private_details'),
    ('view', 'client_bookings'),
    ('function', 'enforce_booking_bookability'),
    ('function', 'hold_cart_booking_slots'),
    ('function', 'claim_cart_booking_slots'),
    ('function', 'release_cart_booking_slots'),
    ('function', 'expire_cart_holds'),
    ('function', 'claim_waitlist_hold'),
    ('function', 'decline_waitlist_hold'),
    ('function', 'request_reschedule_own_booking'),
    ('function', 'confirm_reschedule_own_booking'),
    ('function', 'respond_to_reschedule_request'),
    ('function', 'provider_update_booking_status'),
    ('function', 'provider_update_group_booking_status'),
    ('function', 'provider_cancel_group_booking'),
    ('trigger', 'before_booking_enforce_bookability'),
    ('trigger', 'on_booking_status_changed'),
    ('trigger', 'on_reschedule_request_changed'),
    ('cron', 'expire-cart-holds'),
    ('cron', 'expire-waitlist-holds')
), actual(kind, name) AS (
  SELECT 'table', table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  UNION ALL
  SELECT 'view', table_name FROM information_schema.views WHERE table_schema = 'public'
  UNION ALL
  SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'trigger', t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'cron', jobname FROM cron.job
)
SELECT e.kind, e.name, EXISTS (
  SELECT 1 FROM actual a WHERE a.kind = e.kind AND a.name = e.name
) AS present
FROM expected e
ORDER BY e.kind, e.name;
`;

const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const rows = JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];
const missing = rows.filter((row) => !row.present);

console.table(rows);
if (missing.length > 0) {
  console.error(`Live critical-contract check failed: ${missing.length} object(s) missing.`);
  process.exitCode = 1;
} else {
  console.log(`Live critical-contract check passed: ${rows.length} required objects found.`);
}
