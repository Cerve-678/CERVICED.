import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'provider_waitlist'
    AND policyname = 'Waitlist participants can see and manage their entries'
    AND cmd = 'ALL'
) AS broad_waitlist_all_exists;
`;
const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];
if (row?.broad_waitlist_all_exists) {
  console.error(
    'Live waitlist-authority audit failed: participant-wide ALL access allows direct mutation of server-managed waitlist state.',
  );
  process.exitCode = 1;
} else {
  console.log('Live waitlist-authority audit passed: no participant-wide ALL policy found.');
}
