import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase/migrations');

/** The newest migration that redefines `name`, read as text. Scans rather
 *  than naming one file, so a later redefinition that quietly puts the old
 *  hold length back fails here. iCloud's numbered forks are skipped. */
function latestDefinitionOf(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !/ \d+\.sql$/.test(f))
    .sort()
    .filter(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').includes(marker));
  const file = files[files.length - 1];
  if (!file) throw new Error(`No migration defines ${name}`);
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const start = text.indexOf(marker);
  const end = text.indexOf('$function$;', start);
  return text.slice(start, end);
}

// The user's rule (2026-11-08): a cart checkout holds the client's slots for
// 5 minutes while they pay, then lets them go.
describe('cart checkout holds slots for 5 minutes', () => {
  it.each(['prepare_checkout', 'hold_cart_booking_slots'])('%s sets a 5-minute hold', name => {
    const body = latestDefinitionOf(name);
    expect(body).toMatch(/interval '5 minutes'/i);
    expect(body).not.toMatch(/interval '10 minutes'/i);
  });
});
