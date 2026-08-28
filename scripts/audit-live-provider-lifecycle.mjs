import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = `
SELECT EXISTS (
  SELECT 1 FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'providers'
    AND t.tgname = 'before_provider_lifecycle_enforced' AND NOT t.tgisinternal
) AS lifecycle_trigger_exists;
`;
const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
const row = (JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [])[0];
if (!row?.lifecycle_trigger_exists) {
  console.error('Live provider-lifecycle audit failed: no provider lifecycle enforcement trigger is installed.');
  process.exitCode = 1;
} else {
  console.log('Live provider-lifecycle audit passed: lifecycle enforcement trigger is installed.');
}
