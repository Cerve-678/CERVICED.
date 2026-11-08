import { readFileSync } from 'fs';
import { join } from 'path';
import { RESCHEDULE_REPLY_MINUTES, RESCHEDULE_REPLY_MS } from '../constants/reschedule';
import { rescheduleReplyBy } from '../utils/rescheduleReplyBy';

const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'supabase/migrations/20261109120000_reschedule_reply_45_minutes.sql'),
  'utf8',
);

function fn(name: string): string {
  const start = MIGRATION.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return MIGRATION.slice(start, MIGRATION.indexOf('$function$;', start));
}

// The user's rule (2026-11-08): whoever is waiting on a reschedule answer gets
// 45 minutes, and both people are told — when it's sent, and when it lapses.
describe('reschedule reply window', () => {
  it('the app constant matches the interval the database enforces', () => {
    expect(MIGRATION).toMatch(
      new RegExp(`FUNCTION public\\.reschedule_reply_window\\(\\)[\\s\\S]*?INTERVAL '${RESCHEDULE_REPLY_MINUTES} minutes'`),
    );
    expect(RESCHEDULE_REPLY_MS).toBe(RESCHEDULE_REPLY_MINUTES * 60 * 1000);
  });

  it('the expiry cron runs every minute', () => {
    expect(MIGRATION).toMatch(/jobname = 'reschedule-request-expiry'\),\s*schedule := '\* \* \* \* \*'/);
  });

  it('an unanswered client request tells the provider as well as the client', () => {
    const body = fn('process_expire_stale_reschedule_requests');
    const pending = body.slice(body.indexOf("IF r.request_status = 'pending' THEN"), body.indexOf('    ELSE'));
    expect(pending).toContain("r.client_user_id, 'reschedule_expired'");
    expect(pending).toContain("r.provider_user_id, 'reschedule_expired'");
  });

  it('an unanswered provider offer tells both sides too', () => {
    const body = fn('process_expire_stale_reschedule_requests');
    const offered = body.slice(body.indexOf('    ELSE'));
    expect(offered).toContain("r.client_user_id, 'reschedule_expired'");
    expect(offered).toContain("r.provider_user_id, 'reschedule_expired'");
  });

  it('every "your turn" notification quotes the window from the function, not a literal', () => {
    const body = fn('handle_reschedule_request_change');
    expect(body).toContain('public.reschedule_reply_window()');
    // client asked (insert + back to pending), provider initiated (group +
    // single), provider offered times (group + single)
    expect(body.match(/You have ' \|\| v_reply_words/g)).toHaveLength(6);
    expect(body).not.toMatch(/45 minutes/);
  });

  it('the 4-hour provider reminder is gone, since a request expires first', () => {
    expect(MIGRATION).toContain('DROP FUNCTION IF EXISTS public.process_provider_stale_reschedule_reminders()');
    expect(MIGRATION).toMatch(/cron\.unschedule\(jobid\) FROM cron\.job WHERE jobname = 'provider-stale-reschedule-reminders'/);
  });
});

describe('rescheduleReplyBy', () => {
  const start = new Date(2026, 10, 8, 15, 0).toISOString();

  it('gives the time the window ends', () => {
    expect(rescheduleReplyBy(start, new Date(2026, 10, 8, 15, 10).getTime())).toBe('3:45pm');
  });

  it('shows nothing once the window has passed or with no start time', () => {
    expect(rescheduleReplyBy(start, new Date(2026, 10, 8, 15, 46).getTime())).toBeNull();
    expect(rescheduleReplyBy(undefined)).toBeNull();
    expect(rescheduleReplyBy('not a date')).toBeNull();
  });
});
