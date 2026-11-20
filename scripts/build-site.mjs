#!/usr/bin/env node
// Builds www.cerviced.co. Vercel runs this from waitlist/vercel.json with the
// output in waitlist/dist (Vercel's Root Directory is waitlist/, and the
// output has to sit inside it). Run it locally with `npm run build:site`,
// which builds into dist/.
//
//   1. The web app (App.web.tsx → src/web/SiteApp.tsx) is exported by Expo as
//      a single-page app. Its index.html is renamed app.html, and vercel.json
//      rewrites /@handle to it.
//   2. The static pages in waitlist/ (Home, About, Legal) are copied in as
//      they are, so their addresses and animations don't change.
//
// The Supabase URL and publishable anon key come from eas.json's production
// profile, the same public values every app build ships, so Vercel needs no
// environment variables of its own.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'dist';
const STATIC_PAGES = 'waitlist';
// vercel.json is Vercel's config, and dist is this build's own output when it
// is built inside waitlist/.
const NOT_PUBLISHED = new Set(['README.md', 'vercel.json', 'dist']);

const production = JSON.parse(readFileSync('eas.json', 'utf8')).build.production.env;
const publicEnv = {
  EXPO_PUBLIC_SUPABASE_URL: production.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: production.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};
for (const [name, value] of Object.entries(publicEnv)) {
  if (!value) throw new Error(`eas.json build.production.env.${name} is missing`);
}

rmSync(OUT, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', OUT], {
  stdio: 'inherit',
  env: { ...process.env, ...publicEnv, NODE_ENV: 'production' },
});

renameSync(join(OUT, 'index.html'), join(OUT, 'app.html'));

for (const entry of readdirSync(STATIC_PAGES)) {
  if (NOT_PUBLISHED.has(entry) || entry.startsWith('.')) continue;
  const target = join(OUT, entry);
  // A clash would silently replace one page with another.
  if (existsSync(target)) throw new Error(`${STATIC_PAGES}/${entry} clashes with the web app's ${target}`);
  cpSync(join(STATIC_PAGES, entry), target, { recursive: true });
}

console.log(`Site built into ${OUT}/: the web app at app.html, plus ${STATIC_PAGES}/'s pages.`);
