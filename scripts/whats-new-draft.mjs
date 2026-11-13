#!/usr/bin/env node
// Lists the PRs merged to main since the last "What's new" entry, as raw
// material for the next one. Used by the /whats-new skill
// (.claude/skills/whats-new/SKILL.md), which rewrites this into plain,
// user-facing notes in src/data/whatsNew.ts for review before a build.
//
// It also says whether to ADD a new entry or UPDATE the top one: if the
// newest entry isn't in the last production build yet (drafted, then more
// PRs merged before building), the same entry is redrafted rather than a
// second one stacked on top of it.
//
// Where it starts from, in order:
//   1. --since <ref>, if given
//   2. the commit of the last finished production EAS build (needs `eas` login)
//   3. the newest entry's `coversThrough` in src/data/whatsNew.ts
//
// Usage: node scripts/whats-new-draft.mjs [--since <ref>] [--until <ref>]
// Read-only: it fetches origin/main and reads git/gh/eas, and writes nothing.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sh = async (cmd, args) => (await run(cmd, args, { maxBuffer: 32 * 1024 * 1024 })).stdout.trim();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function entries() {
  const src = await readFile(new URL('../src/data/whatsNew.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('WHATS_NEW_RELEASES'));
  return [...body.matchAll(/version:\s*(\d+)[\s\S]*?coversThrough:\s*['"]([0-9a-f]{7,40})['"]/g)]
    .map(m => ({ version: Number(m[1]), coversThrough: m[2] }));
}

/** Whether the file as built at `sha` already contained entry `version`. */
async function builtWith(sha, version) {
  try {
    const built = await sh('git', ['show', `${sha}:src/data/whatsNew.ts`]);
    return new RegExp(`version:\\s*${version}\\b`).test(built);
  } catch {
    return false;
  }
}

async function lastProductionBuildCommit() {
  try {
    const raw = await sh('eas', [
      'build:list', '--status', 'finished', '--build-profile', 'production',
      '--limit', '1', '--json', '--non-interactive',
    ]);
    const builds = JSON.parse(raw.slice(raw.indexOf('[')));
    return builds[0]?.gitCommitHash;
  } catch {
    return undefined;
  }
}

async function main() {
  await sh('git', ['fetch', '--quiet', 'origin', 'main']);
  const until = arg('--until') ?? 'origin/main';

  const [all, lastBuild] = await Promise.all([entries(), lastProductionBuildCommit()]);
  const top = all[0];
  const topShipped = top ? (lastBuild ? await builtWith(lastBuild, top.version) : true) : true;
  const mode = !top
    ? 'ADD the first entry: version 1'
    : topShipped
      ? `ADD a new entry at the top: version ${top.version + 1}`
      : `UPDATE the top entry (version ${top.version}); it is not in a production build yet`;

  let since = arg('--since');
  let sinceSource = '--since';
  if (!since && lastBuild) { since = lastBuild; sinceSource = 'last production EAS build'; }
  if (!since) {
    // No eas: fall back to what the notes already cover.
    const covered = topShipped ? top : all[1];
    since = covered?.coversThrough;
    sinceSource = 'whatsNew.ts coversThrough (eas unavailable)';
  }
  if (!since) {
    console.error('No starting point: pass --since <ref> (no shipped whatsNew.ts entry and eas build:list gave nothing).');
    process.exit(1);
  }

  // A build made from a branch has a commit that isn't on main; start from
  // where that branch left main instead.
  const base = await sh('git', ['merge-base', since, until]);
  const head = await sh('git', ['rev-parse', '--short', until]);

  const log = await sh('git', ['log', '--first-parent', '--format=%H%x1f%s', `${base}..${until}`]);
  const commits = log ? log.split('\n').map(line => {
    const [sha, subject] = line.split('\x1f');
    const pr = /\(#(\d+)\)\s*$/.exec(subject)?.[1] ?? /^Merge pull request #(\d+)/.exec(subject)?.[1];
    return { sha: sha.slice(0, 8), subject, pr };
  }) : [];

  // A handful of gh calls at a time, not one long serial chain.
  const prs = [...new Set(commits.map(c => c.pr).filter(Boolean))];
  const details = new Map();
  for (let i = 0; i < prs.length; i += 6) {
    await Promise.all(prs.slice(i, i + 6).map(async n => {
      try {
        details.set(n, JSON.parse(await sh('gh', ['pr', 'view', n, '--json', 'title,body'])));
      } catch {
        details.set(n, null);
      }
    }));
  }

  console.log(`# What's new — raw material`);
  console.log(`From ${since.slice(0, 8)} (${sinceSource}; merge-base ${base.slice(0, 8)}) to ${until} @ ${head}`);
  console.log(`Mode: ${mode}.`);
  console.log(`Use \`coversThrough: '${head}'\`.\n`);
  if (commits.length === 0) {
    console.log('Nothing merged since then.');
    return;
  }
  for (const c of commits) {
    const d = c.pr ? details.get(c.pr) : null;
    console.log(`## ${c.pr ? `#${c.pr} ` : ''}${d?.title ?? c.subject}`);
    const body = (d?.body ?? '').replace(/🤖 Generated with[\s\S]*$/, '').trim();
    if (body) console.log(body.length > 1500 ? `${body.slice(0, 1500)}…` : body);
    console.log('');
  }
}

main().catch(error => {
  console.error(error.message ?? error);
  process.exit(1);
});
