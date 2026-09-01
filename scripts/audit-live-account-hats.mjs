// Reconciles the five things that answer "which hats does this account have":
//
//   users.role                            -> the provider hat
//   users.has_client_profile              -> the client hat (mig 20260823105742)
//   auth raw_user_meta_data->>'role'      -> a mirror AuthContext falls back to
//   a public.providers row                -> whether the provider hat has a body
//   actual client-side activity           -> whether the client hat was ever used
//
// They are written by different code paths and have drifted before, which is
// how an account ends up showing a hat it does not hold. This reports; it does
// not repair. The client-hat check in particular CANNOT be safely automated:
// migration 20260823105742's backfill deliberately reproduced the old
// `dob IS NOT NULL` heuristic, false positives included, so a provider can hold
// a client hat that no one ever created — but a genuine client who upgraded to
// provider and simply never booked anything looks identical from here. Deciding
// between those two is a human call, so suspects are printed, never rewritten.
//
// Usage: node scripts/audit-live-account-hats.mjs

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sql = `
SELECT
  u.email,
  u.role,
  u.has_client_profile,
  (au.raw_user_meta_data->>'role') AS meta_role,
  (p.user_id IS NOT NULL)          AS has_provider_row,
  (
    EXISTS (SELECT 1 FROM public.bookings           b  WHERE b.user_id  = u.id)
    OR EXISTS (SELECT 1 FROM public.bookmarks       bm WHERE bm.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.provider_follows f WHERE f.user_id  = u.id)
    OR EXISTS (SELECT 1 FROM public.becca_chat_sessions c WHERE c.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.reviews         r  WHERE r.user_id  = u.id)
    OR u.client_address IS NOT NULL
    OR u.client_area IS NOT NULL
    OR u.hair_type IS NOT NULL
    OR u.skin_type IS NOT NULL
    OR u.style_vibe IS NOT NULL
    OR u.medical_notes IS NOT NULL
    OR COALESCE(u.maintenance_frequency, '') <> ''
    OR COALESCE(array_length(u.skin_concerns, 1), 0) > 0
    OR COALESCE(array_length(u.allergies, 1), 0) > 0
    OR COALESCE(array_length(u.treatment_history, 1), 0) > 0
  ) AS used_client_hat
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN public.providers p ON p.user_id = u.id
ORDER BY u.created_at;
`;

const raw = execFileSync(
  'supabase',
  ['db', 'query', '--linked', '--output-format', 'json', sql],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const rows = JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];

if (rows.length === 0) {
  console.error('Live account-hat audit failed: public.users returned no rows.');
  process.exitCode = 1;
} else {
  // A definite inconsistency: users.role is the source of truth and the mirror
  // contradicts it, so the metadata-fallback path in AuthContext.loadUserProfile
  // would restore the wrong hat.
  const mirrorDrift = rows.filter((r) => (r.meta_role ?? '') !== r.role);

  // Needs a human: could be a backfill false positive, or a real client who
  // upgraded and never used the client side. Never auto-repaired.
  const unusedClientHat = rows.filter(
    (r) => r.role === 'provider' && r.has_client_profile && !r.used_client_hat,
  );

  // Expected while a client->provider upgrade is mid-flight (upgradeUserToProvider
  // flips role before InfoReg inserts the providers row), so informational only.
  const providerWithoutRow = rows.filter((r) => r.role === 'provider' && !r.has_provider_row);
  const rowWithoutProvider = rows.filter((r) => r.role !== 'provider' && r.has_provider_row);

  for (const r of unusedClientHat) {
    console.warn(
      `  suspect client hat: ${r.email} is a provider with has_client_profile = true ` +
        'and no client-side activity of any kind. Could be the 20260823105742 backfill ' +
        'crediting a hat nobody created, or a real client who never booked. Check before touching.',
    );
  }
  for (const r of providerWithoutRow) {
    console.log(`  note: ${r.email} has role 'provider' with no providers row (mid-upgrade, or abandoned one).`);
  }
  for (const r of rowWithoutProvider) {
    console.log(`  note: ${r.email} has a providers row but role '${r.role}'.`);
  }

  if (mirrorDrift.length > 0) {
    for (const r of mirrorDrift) {
      console.error(
        `  mirror drift: ${r.email} has users.role '${r.role}' but auth metadata role ` +
          `'${r.meta_role ?? 'unset'}'. A profile-fetch failure would restore the wrong hat.`,
      );
    }
    console.error(
      `Live account-hat audit failed: ${mirrorDrift.length} account(s) whose auth metadata role ` +
        'contradicts users.role. Every writer of users.role must call syncAuthRoleMetadata.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Live account-hat audit passed: ${rows.length} account(s), auth metadata role matches users.role ` +
        `for all of them. ${unusedClientHat.length} client hat(s) flagged for review above.`,
    );
  }
}
