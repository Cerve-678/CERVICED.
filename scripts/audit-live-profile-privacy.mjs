import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  COUNT(p.policyname)::integer AS policy_count,
  COALESCE(array_agg(p.policyname ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL), ARRAY[]::text[]) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relname = 'users'
GROUP BY c.relrowsecurity, c.relforcerowsecurity;
`;

const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];

if (!row) {
  console.error('Live profile-privacy audit failed: public.users is missing.');
  process.exitCode = 1;
} else if (!row.rls_enabled || row.policy_count === 0) {
  console.error(
    `Live profile-privacy audit failed: users RLS=${row.rls_enabled}, policies=${row.policy_count}. ` +
      'The app has direct self-service users reads/writes, so this boundary needs explicit policies and a private-data design.',
  );
  process.exitCode = 1;
} else {
  console.log(`Live profile-privacy audit passed: users RLS is enabled with ${row.policy_count} policy/policies.`);
}
