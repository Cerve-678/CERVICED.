import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const outputPath = path.join(root, 'supabase', 'remote-schema-inventory.json');

const query = (sql) => {
  const raw = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', sql],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];
};

const [tables, views, functions, triggers, policies, cronJobs] = [
  query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"),
  query("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name;"),
  query("SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY p.proname, arguments;"),
  query("SELECT c.relname AS table_name, t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname;"),
  query("SELECT tablename AS table_name, policyname AS name, cmd AS command, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;"),
  query("SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;"),
];

const inventory = {
  source: 'linked Cerviced Supabase PostgreSQL catalogs',
  exportedAt: new Date().toISOString(),
  counts: {
    tables: tables.length,
    views: views.length,
    functions: functions.length,
    triggers: triggers.length,
    policies: policies.length,
    cronJobs: cronJobs.length,
  },
  tables,
  views,
  functions,
  triggers,
  policies,
  cronJobs,
};

await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
console.log(`Exported live schema inventory to ${path.relative(root, outputPath)}.`);
