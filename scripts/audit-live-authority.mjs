import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audits = [
  ['Privileged RPC execution', 'audit-live-rpc-exposure.mjs'],
  ['Client profile privacy baseline', 'audit-live-profile-privacy.mjs'],
  ['Notification recipient authority', 'audit-live-notification-authority.mjs'],
  ['Waitlist state authority', 'audit-live-waitlist-authority.mjs'],
  ['Provider lifecycle authority', 'audit-live-provider-lifecycle.mjs'],
  ['Review authority', 'audit-live-review-authority.mjs'],
  ['Booking/payment authority', 'audit-live-booking-authority.mjs'],
  ['Intake-form authority', 'audit-live-intake-form-authority.mjs'],
];

const failed = [];
for (const [label, script] of audits) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) failed.push(label);
}

if (failed.length) {
  console.error(`\nLive authority audit failed: ${failed.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log('\nLive authority audit passed: all configured contracts are healthy.');
}
