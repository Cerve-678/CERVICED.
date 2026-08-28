import { execFileSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(root, 'supabase', 'remote-migrations');
const force = process.argv.includes('--force');

const raw = execFileSync(
  'supabase',
  [
    'db', 'query', '--linked', '--output-format', 'json',
    'SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version;',
  ],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);

// The CLI may print connection progress before its JSON payload.
const payload = JSON.parse(raw.slice(raw.indexOf('{')));
const rows = payload.rows ?? [];

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('Linked project returned no migration history. Nothing was written.');
}

await mkdir(outputDirectory, { recursive: true });
const existing = await readdir(outputDirectory);
if (existing.length > 0 && !force) {
  throw new Error(
    `${path.relative(root, outputDirectory)} already contains files. Refusing to overwrite; rerun with --force after review.`,
  );
}

const inventory = [];
for (const row of rows) {
  const version = String(row.version ?? '');
  const name = String(row.name ?? 'unnamed');
  if (!/^\d{14}$/.test(version)) throw new Error(`Unsafe migration version: ${version}`);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unnamed';
  const statements = Array.isArray(row.statements) ? row.statements : [];
  const filename = `${version}_${slug}.sql`;
  const body = statements.join('\n\n');
  const content = [
    '-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.',
    `-- Remote version: ${version}`,
    `-- Remote name: ${name}`,
    '-- Do not edit this recovery archive; create a new tracked migration for changes.',
    '',
    body.trim(),
    '',
  ].join('\n');

  await writeFile(path.join(outputDirectory, filename), content, 'utf8');
  inventory.push({ version, name, file: `supabase/remote-migrations/${filename}`, statementCount: statements.length });
}

await writeFile(
  path.join(outputDirectory, 'inventory.json'),
  `${JSON.stringify({ source: 'linked Supabase migration history', exportedAt: new Date().toISOString(), migrations: inventory }, null, 2)}\n`,
  'utf8',
);

console.log(`Exported ${inventory.length} remote migrations to ${path.relative(root, outputDirectory)}.`);
