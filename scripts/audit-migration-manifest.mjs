import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'supabase', 'migration-manifest.json');
const migrationsDir = path.join(root, 'supabase', 'migrations');

const exists = async (relativePath) => {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const migrations = manifest.requiredBeforeFreshDeployment ?? [];

// The canonical deployment path is supabase/migrations/, NOT
// RUN_ALL_MIGRATIONS.sql — supabase/README.md marks that file as legacy
// reference material and explicitly not a fresh-environment source. This gate
// used to measure `bundled` (inclusion in RUN_ALL), so it was reporting on a
// file nothing deploys from: every entry failed by construction and the number
// could never improve. It now measures what a fresh environment would actually
// apply. It still fails — the remaining gap is real, not cosmetic.
const chainNames = new Set(
  (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/^\d+_/, '').replace(/\.sql$/, '')),
);

const coveredBy = (file) => {
  const base = file.replace(/^supabase\//, '').replace(/\.sql$/, '');
  if (chainNames.has(base)) return base;
  // Some root-level files carry a `fix_` prefix the migration dropped
  // (fix_reschedule_flow_completion.sql -> reschedule_flow_completion).
  return [...chainNames].find((n) => base.endsWith(n) || n.endsWith(base)) ?? null;
};

const missing = [];
const uncovered = [];

for (const migration of migrations) {
  if (!(await exists(migration.file))) {
    missing.push(migration);
    continue;
  }
  if (!coveredBy(migration.file)) uncovered.push(migration);
}

const present = migrations.length - missing.length;
console.log(`Migration inventory: ${migrations.length} required files`);
console.log(`Present in repository: ${present}`);
console.log(`Missing from repository: ${missing.length}`);
console.log(`Represented in the canonical supabase/migrations/ chain: ${present - uncovered.length}`);
console.log(`Not represented in the chain: ${uncovered.length}`);

if (uncovered.length > 0) {
  console.log(
    '\nThese are applied to production, but a fresh environment built from\n' +
      'supabase/migrations/ would NOT get them. Each needs its LIVE definition\n' +
      'captured as a migration — verify against the live catalog first, since\n' +
      'several of these root files predate the definition actually deployed:',
  );
  for (const migration of uncovered) {
    console.log(`- ${migration.file} (${migration.area})`);
  }
}

if (missing.length > 0) {
  console.error('\nBLOCKED: required migration source is missing:');
  for (const migration of missing) {
    console.error(`- ${migration.file}: ${migration.note ?? migration.area}`);
  }
  process.exitCode = 1;
}

if (uncovered.length > 0) {
  console.error(
    '\nBLOCKED: the canonical migration chain cannot yet rebuild a fresh\n' +
      'environment to match production. This is the tracked Phase 1 baseline\n' +
      'recovery — see supabase/README.md. Do not silence this failure.',
  );
  process.exitCode = 1;
}
