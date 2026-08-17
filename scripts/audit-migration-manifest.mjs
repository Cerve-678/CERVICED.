import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'supabase', 'migration-manifest.json');

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
const missing = [];
const intentionallyUnbundled = [];

for (const migration of migrations) {
  if (!(await exists(migration.file))) {
    missing.push(migration);
    continue;
  }

  if (migration.bundled !== true) intentionallyUnbundled.push(migration);
}

console.log(`Migration inventory: ${migrations.length} required files`);
console.log(`Present in repository: ${migrations.length - missing.length}`);
console.log(`Missing from repository: ${missing.length}`);
console.log(`Not fully included in RUN_ALL_MIGRATIONS.sql: ${intentionallyUnbundled.length}`);

if (intentionallyUnbundled.length > 0) {
  console.log('\nFresh-environment parity still requires explicit handling for:');
  for (const migration of intentionallyUnbundled) {
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

if (intentionallyUnbundled.length > 0) {
  console.error('\nBLOCKED: the all-in-one runner cannot yet produce the required schema without manual follow-up.');
  process.exitCode = 1;
}
