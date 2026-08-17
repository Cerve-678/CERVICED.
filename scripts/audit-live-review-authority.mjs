import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname IN ('reviews_owner_insert', 'reviews_user_insert', 'reviews_user_update')) AS direct_review_write_policy_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_review_for_own_completed_booking') AS secured_review_rpc_exists;
`;
const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];
if (row?.direct_review_write_policy_exists || !row?.secured_review_rpc_exists) {
  console.error('Live review-authority audit failed: direct review writes remain enabled or the completed-booking RPC is absent.');
  process.exitCode = 1;
} else {
  console.log('Live review-authority audit passed: reviews use the completed-booking server action.');
}
