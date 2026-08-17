import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_user_insert') AS direct_client_booking_insert_exists,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='booking_add_ons' AND policyname IN ('booking_add_ons_owner_all', 'booking_add_ons_user_insert')) AS direct_client_add_on_write_exists,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='checkout_batches') AS checkout_batches_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='prepare_checkout') AS prepare_checkout_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='finalize_checkout') AS finalize_checkout_exists;
`;
const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];
const ready = row && !row.direct_client_booking_insert_exists && !row.direct_client_add_on_write_exists
  && row.checkout_batches_exists && row.prepare_checkout_exists && row.finalize_checkout_exists;

if (!ready) {
  console.error(
    'Live booking-authority audit failed: direct client booking/add-on writes remain or the server-owned checkout batch route is incomplete.',
  );
  process.exitCode = 1;
} else {
  console.log('Live booking-authority audit passed: booking creation and finalisation are server-owned.');
}
