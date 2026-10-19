import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FEE_CONSENT_LINE,
  FEE_TERMS_BODY,
  FEE_TERMS_HEADING,
  FEE_TERMS_SHA256,
  FEE_TERMS_VERSION,
} from '../constants/feeTerms';

// The app records which wording a client agreed to by version + hash, and
// accept_checkout_fees refuses a hash that doesn't match the text the
// database holds for that version. Editing the wording without publishing a
// new version would make every fee checkout fail, so catch it here.

const sqlLiteral = (text: string) => `'${text.replace(/'/g, "''")}'`;

describe('fee terms version', () => {
  it('hash matches the wording shown at checkout', () => {
    const text = [FEE_TERMS_HEADING, FEE_TERMS_BODY, FEE_CONSENT_LINE].join('\n\n');
    expect(createHash('sha256').update(text, 'utf8').digest('hex')).toBe(FEE_TERMS_SHA256);
  });

  // Point this at the migration that seeds the current version.
  it('the current version is seeded in a migration with exactly this wording', () => {
    const migration = readFileSync(
      join(__dirname, '../../supabase/migrations/20261019210000_fee_auto_retries.sql'),
      'utf8',
    );
    const seed = [FEE_TERMS_VERSION, FEE_TERMS_HEADING, FEE_TERMS_BODY, FEE_CONSENT_LINE]
      .map(sqlLiteral)
      .join(',\n  ');
    expect(migration).toContain(seed);
  });
});
