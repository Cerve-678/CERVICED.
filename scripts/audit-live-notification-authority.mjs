import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND policyname = 'Providers can send notifications to clients'
) AS broad_provider_insert_exists;
`;
const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];

if (row?.broad_provider_insert_exists) {
  console.error(
    'Live notification-authority audit failed: a provider can insert notifications for arbitrary clients. ' +
      'Replace app-side bulk/single promotion inserts with a provider-owned server action before removing this policy.',
  );
  process.exitCode = 1;
} else {
  console.log('Live notification-authority audit passed: no broad provider-to-arbitrary-client insert policy found.');
}
