// Renders the two Supabase Auth emails (signup code, password-reset code) from
// the shared letterhead into supabase/templates/*.html.
//
//   node --experimental-strip-types scripts/build-auth-email-templates.ts
//
// Those HTML files are the source of truth for what Auth sends: config.toml
// points at them, and they are pasted into the dashboard (Authentication →
// Emails) for the hosted project. They are generated, so edit the templates in
// supabase/functions/_shared/emailTemplates.ts and re-run this, not the HTML.
import { mkdirSync, writeFileSync } from 'node:fs';
import { recoveryCodeEmail, signupCodeEmail } from '../supabase/functions/_shared/emailTemplates.ts';

const outDir = new URL('../supabase/templates/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const [file, email] of [
  ['confirmation.html', signupCodeEmail()],
  ['recovery.html', recoveryCodeEmail()],
] as const) {
  writeFileSync(new URL(file, outDir), email.html + '\n');
  console.log(`${file}  —  subject: ${email.subject}`);
}
