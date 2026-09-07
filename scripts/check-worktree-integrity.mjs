import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const skipped = new Set(['.git', '.claude', 'backups', 'node_modules']);
const collisionPattern = / \d+\.(?:ts|tsx|js|jsx|json|sql)$/;
const imageCollisionPattern = /^assets\/images\/.+ \d+\.(?:png|jpe?g|webp)$/i;

async function findCollisions(directory) {
  const collisions = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skipped.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      collisions.push(...await findCollisions(absolute));
      continue;
    }
    const path = relative(root, absolute).replaceAll('\\', '/');
    if (collisionPattern.test(path) || imageCollisionPattern.test(path)) collisions.push(path);
  }
  return collisions;
}

async function requireSourceContracts(path, contracts) {
  const source = await readFile(resolve(root, path), 'utf8');
  const missing = contracts.filter(({ pattern }) => !pattern.test(source));
  if (missing.length) {
    console.error(`\n${path} lost required UI/data contracts:`);
    for (const { label } of missing) console.error(`  - ${label}`);
    return false;
  }
  return true;
}

const collisions = await findCollisions(root);
let valid = true;

if (collisions.length) {
  valid = false;
  console.error('\nPossible iCloud conflict copies found. Recover or quarantine them before committing:');
  for (const path of collisions) console.error(`  - ${path}`);
}

valid = await requireSourceContracts('src/screens/provider/InfoRegScreen.tsx', [
  { label: 'top waypoint timeline', pattern: /waypointRow/ },
  { label: 'sideways pager ref', pattern: /ref=\{pagerRef\}/ },
  { label: 'horizontal paging', pattern: /horizontal[\s\S]{0,250}pagingEnabled|pagingEnabled[\s\S]{0,250}horizontal/ },
  { label: 'section navigation', pattern: /goToSection/ },
]) && valid;

valid = await requireSourceContracts('src/features/providers/goLiveStatus.ts', [
  { label: 'policies blocker', pattern: /key:\s*["']policies["']/ },
  { label: 'payment blocker', pattern: /key:\s*["']payment["']/ },
  { label: 'logo blocker', pattern: /key:\s*["']logo["']/ },
  { label: 'blocking-step model', pattern: /blocking:\s*true/ },
]) && valid;

valid = await requireSourceContracts('src/screens/provider/BrandingScreen.tsx', [
  { label: 'provider font picker', pattern: /ProviderFontPicker/ },
  { label: 'brand font persistence', pattern: /brand_font/ },
]) && valid;

valid = await requireSourceContracts('src/screens/auth/SignUpStep4Screen.tsx', [
  { label: 'single-area provider signup', pattern: /<AreaPicker/ },
]) && valid;

if (!valid) process.exit(1);
console.log('Worktree integrity checks passed.');
