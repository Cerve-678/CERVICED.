import { readFileSync } from 'fs';
import { join } from 'path';
import { WAITLIST_HOLD_MINUTES, WAITLIST_HOLD_MS } from '../constants/waitlist';

const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'supabase/migrations/20260827120519_waitlist_hold_fifteen_minutes.sql'),
  'utf8',
);

describe('waitlist hold window', () => {
  // The DB is the authority; the constant only mirrors it so a screen can say
  // when a hold runs out. They are in different languages in different folders
  // with nothing but this test connecting them — which is exactly how the old
  // `3 * 60 * 60 * 1000` buried in JSX survived the change to 15 minutes.
  it('matches the interval the database stamps', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.waitlist_hold_duration'));
    expect(fn).toContain(`INTERVAL '${WAITLIST_HOLD_MINUTES} minutes'`);
  });

  it('derives ms from minutes rather than carrying a second literal', () => {
    expect(WAITLIST_HOLD_MS).toBe(WAITLIST_HOLD_MINUTES * 60 * 1000);
  });

  it('sweeps at least as often as the hold is long', () => {
    // A hold can only overrun by one sweep interval. At the old */15 against a
    // 15-minute hold that is a 100% overrun — the hold outlives its own stated
    // life, and the cascade to the next person is late by as long as the offer
    // lasted.
    const cron = MIGRATION.match(/cron\.schedule\('expire-waitlist-holds',\s*'([^']+)'/);
    expect(cron).not.toBeNull();
    expect(cron![1]).toBe('* * * * *');
  });

  it('quotes the window in the notification from the function, not a literal', () => {
    const invite = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.invite_next_waitlist_entry'));
    expect(invite).toContain('v_hold_words');
    // The old copy hard-coded "3 hours" in prose, which stayed wrong silently.
    expect(invite).not.toContain('held for you for 3 hours');
  });
});

describe('an expired hold stops blocking the slot', () => {
  it('filters lapsed holds at read time, not just on the cron', () => {
    const spans = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.get_provider_busy_spans'));
    expect(spans).toContain('b.hold_expires_at > NOW()');
  });

  it('still blocks on a NULL expiry', () => {
    // Reschedule holds carry no clock — they end with the request they belong
    // to. NULL means "no deadline", not "expired"; reading it the other way
    // would make every reschedule hold invisible.
    const spans = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.get_provider_busy_spans'));
    expect(spans).toContain('b.hold_expires_at IS NULL OR');
  });
});
