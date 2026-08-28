import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='booking_intake_forms' AND policyname='Providers see their intake forms' AND cmd='ALL') AS provider_all_exists,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='booking_intake_forms' AND policyname IN ('Clients submit answers', 'client_submit_intake_forms') AND cmd='UPDATE') AS direct_client_update_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='submit_own_intake_form') AS submit_rpc_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='send_intake_form_for_own_booking') AS send_rpc_exists;
`;
const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];
const ready = row && !row.provider_all_exists && !row.direct_client_update_exists && row.submit_rpc_exists && row.send_rpc_exists;
if (!ready) {
  console.error('Live intake-form authority audit failed: direct mutable form policies remain or the server send/submit RPCs are absent.');
  process.exitCode = 1;
} else {
  console.log('Live intake-form authority audit passed: form ownership and state transitions are server-owned.');
}
