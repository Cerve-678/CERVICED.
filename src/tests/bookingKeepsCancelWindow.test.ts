import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const sql = read('supabase', 'migrations', '20261103040000_bookings_keep_their_cancel_window.sql');
const refund = read('supabase', 'functions', 'apply-cancellation-refund', 'index.ts');

function fnBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf('$function$', start) + '$function$'.length;
  return sql.slice(open, sql.indexOf('$function$', open));
}

describe('a booking keeps the cancellation window it was made under', () => {
  it('stores the window on insert and never lets it change', () => {
    expect(sql).toMatch(/BEFORE INSERT ON public\.bookings[\s\S]*freeze_booking_cancel_notice_hours/);
    expect(sql).toMatch(/BEFORE UPDATE OF cancel_notice_hours ON public\.bookings/);
    expect(fnBody('freeze_booking_cancel_notice_hours')).toContain('NEW.cancel_notice_hours := OLD.cancel_notice_hours');
  });

  it('fills existing bookings with the window in force now, with the any-update triggers off', () => {
    const fill = sql.indexOf('UPDATE public.bookings b');
    for (const trigger of ['bookings_updated_at', 'before_booking_snapshot_fees', 'enforce_mobile_booking_has_client_address']) {
      const off = sql.indexOf(`DISABLE TRIGGER ${trigger};`);
      const on = sql.indexOf(`ENABLE TRIGGER ${trigger};`);
      expect(off).toBeGreaterThan(-1);
      expect(off).toBeLessThan(fill);
      expect(on).toBeGreaterThan(fill);
    }
    expect(sql).toContain("VALUES ('20261103040000', 'bookings_keep_their_cancel_window')");
  });

  it.each([
    'cancel_own_booking',
    'request_reschedule_own_booking',
    'process_cancel_window_closing_warnings',
    'process_expire_stale_reschedule_requests',
  ])('%s prefers the booking window and is guarded against a newer live body', name => {
    const body = fnBody(name);
    expect(body).toMatch(/COALESCE\((b|v_booking)\.cancel_notice_hours, public\.cancel_notice_hours\(/);
    expect(body.replace(/COALESCE\((b|v_booking)\.cancel_notice_hours, public\.cancel_notice_hours\([^)]*\)\)/g, ''))
      .not.toMatch(/public\.cancel_notice_hours\(/);
    expect(sql).toContain(`'public.${name}(`);
  });

  it('settles a cancellation against the booking window', () => {
    expect(refund).toContain('cancel_notice_hours, policy_snapshot');
    expect(refund).toMatch(/booking\.cancel_notice_hours != null\s*\?\s*Number\(booking\.cancel_notice_hours\)/);
  });
});
