import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase/migrations');

/** The newest migration that redefines `name`, read as text.
 *
 *  Same pattern as emergencyRequestNeverAutoConfirms.test.ts: resolved by
 *  scanning rather than by naming one file, so a LATER reproduction that
 *  silently drops the rule fails this suite instead of going unnoticed.
 *  iCloud's numbered forks (`… 2.sql`) are excluded — they are never
 *  applied (see supabase/MIGRATION_OWNER.md). */
function latestDefinitionOf(name: string): { file: string; body: string } {
  const marker = `FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !/ \d+\.sql$/.test(f))
    .sort()
    .filter(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').includes(`CREATE OR REPLACE ${marker}`));
  const file = files[files.length - 1];
  if (!file) throw new Error(`No migration defines ${name}`);
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  return { file, body: text.slice(text.indexOf(`CREATE OR REPLACE ${marker}`)) };
}

// A provider who never answers a reschedule request used to be able to
// strand a client with zero available actions: cancel_own_booking() enforces
// the cancellation-notice window unconditionally (it never looks at
// booking_reschedule_requests), and request_reschedule_own_booking() refuses
// a second request while one is still 'pending'/'provider_responded'. The
// only thing standing between those two dead ends was
// process_expire_stale_reschedule_requests()'s auto-expiry deadline — which
// was anchored purely on the provider's rescheduleNotice policy (floored at
// 24h) and had no idea the SAME booking also carries a separate cancelNotice
// policy that can close sooner. A 24h cancelNotice + same_day rescheduleNotice
// booking 30h out left an 18-hour window with no available action at all.
//
// Confirmed against live state (project ztrfpfvvejzaysrelmfm) before fixing:
// cancel_own_booking() has no reschedule-request awareness, and the expiry
// deadline had no cancel-notice term. See
// 20260901150000_reschedule_expiry_before_cancel_window_closes.sql's header
// for the full trace.
describe('a pending reschedule request expires before the cancellation window closes', () => {
  it('process_expire_stale_reschedule_requests() bounds its deadline by cancel_notice_hours()', () => {
    const { body } = latestDefinitionOf('process_expire_stale_reschedule_requests');

    // The new bound must exist and must be gated on there being a real
    // cancellation-notice policy at all (no notice period -> no window to
    // race against).
    expect(body).toMatch(
      /WHEN public\.cancel_notice_hours\(p\.cancellation_notice_hours, p\.booking_policies\) > 0/,
    );

    // It has to be anchored on the appointment minus the cancel-notice
    // hours, not some independent constant — otherwise it could drift from
    // what cancel_own_booking() itself enforces.
    expect(body).toMatch(
      /booking_date::TIMESTAMP \+ b\.booking_time\)\s*-\s*\(public\.cancel_notice_hours\(p\.cancellation_notice_hours, p\.booking_policies\) \|\| ' hours'\)::INTERVAL\s*-\s*INTERVAL '6 hours'/,
    );

    // Floored at the same 4-hour "real chance to answer" minimum the
    // existing rescheduleNotice bound already uses, so a request made
    // minutes before the client's own cancel window shuts doesn't expire on
    // the very next tick.
    expect(body).toMatch(/rr\.updated_at \+ INTERVAL '4 hours'/);

    // When there is no cancellation-notice policy at all, the new bound must
    // not constrain anything (no window ever closes to race against).
    expect(body).toContain("ELSE 'infinity'::TIMESTAMP");
  });

  it('cancel_notice_hours() is the single source both cancel_own_booking() and the warning cron read', () => {
    // All three call sites must resolve the SAME function — that is the
    // whole point of extracting it, after MIGRATION_OWNER.md's queue flagged
    // cancel_own_booking()'s inline copy as a drift risk.
    const cancelBody = latestDefinitionOf('cancel_own_booking').body;
    const warningBody = latestDefinitionOf('process_cancel_window_closing_warnings').body;
    const expiryBody = latestDefinitionOf('process_expire_stale_reschedule_requests').body;

    expect(cancelBody).toContain('public.cancel_notice_hours(');
    expect(warningBody).toContain('public.cancel_notice_hours(');
    expect(expiryBody).toContain('public.cancel_notice_hours(');

    // cancel_own_booking() must still be the real enforcement point — this
    // fix does not grant a no-penalty cancellation, only makes the pending
    // reschedule resolve in time for the client to use it while it's open.
    expect(cancelBody).toMatch(/RAISE EXCEPTION 'This provider requires % hours notice to cancel'/);
  });

  it('cancel_notice_hours() maps a JSONB cancelNotice policy the same way cancel_own_booking() always has', () => {
    const { body } = latestDefinitionOf('cancel_notice_hours');
    expect(body).toContain("WHEN '24h' THEN 24");
    expect(body).toContain("WHEN '48h' THEN 48");
    expect(body).toContain("WHEN '72h' THEN 72");
    // An explicit cancellation_notice_hours column value always wins over
    // the JSONB fallback, matching cancel_own_booking()'s original COALESCE.
    expect(body).toMatch(/WHEN COALESCE\(p_cancellation_notice_hours, 0\) > 0 THEN p_cancellation_notice_hours/);
  });
});
