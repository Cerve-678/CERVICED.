import { readFileSync } from 'fs';
import { join } from 'path';

// "Sasha is back from holiday. Book now." goes to people who saved or belled a
// provider when their closed schedule opens again. Read from the migration that
// sets the rules.
const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261124200000_schedule_reopen_alerts.sql'),
  'utf8',
);
const reopen = MIGRATION.slice(
  MIGRATION.indexOf('FUNCTION public.reopen_my_schedule'),
  MIGRATION.indexOf('FUNCTION public.process_schedule_reopen_alerts'),
);
const alert = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.process_schedule_reopen_alerts'));
const PUSH = readFileSync(join(__dirname, '../../supabase/functions/send-push-notification/index.ts'), 'utf8');

describe('Reopen', () => {
  it('ends the closure today instead of deleting it, so the alert can see it', () => {
    expect(reopen).toContain("SET reopens_on = (now() AT TIME ZONE 'Europe/London')::date");
    expect(reopen).not.toContain('DELETE');
  });
});

describe('the back-from-closure alert', () => {
  it('waits for daytime instead of dropping a closure that ended at night', () => {
    const nightReturn = alert.indexOf('IF NOT v_daytime THEN');
    expect(nightReturn).toBeGreaterThan(-1);
    expect(nightReturn).toBeLessThan(alert.indexOf('DELETE FROM public.provider_schedule_closures'));
  });

  it('only takes a closure that is still ended, so closing again keeps it', () => {
    expect(alert).toMatch(
      /DELETE FROM public\.provider_schedule_closures c\s+WHERE c\.provider_id = r\.provider_id\s+AND NOT public\.provider_schedule_is_closed\(c\.provider_id\)/,
    );
    expect(alert).toContain('CONTINUE WHEN NOT FOUND;');
  });

  it('says nothing for a mis-tap, a fully-booked auto close, or no free slot', () => {
    expect(alert).toContain("CONTINUE WHEN v_ended.closed_at > now() - INTERVAL '24 hours';");
    expect(alert).toContain('CONTINUE WHEN v_ended.auto_closed;');
    expect(alert).toContain('WHERE o.has_slot');
  });

  it('is only for live, active providers', () => {
    expect(alert).toContain('AND p.has_gone_live = TRUE');
    expect(alert).toContain('AND p.is_active = TRUE');
  });

  it('names the reason only when the provider chose to tell clients', () => {
    expect(alert).toContain("WHEN v_ended.show_reason AND v_ended.reason = 'holiday'  THEN ' is back from holiday'");
    expect(alert).toContain("WHEN v_ended.show_reason AND v_ended.reason = 'training' THEN ' is back from training'");
    expect(alert).toContain("ELSE ' is taking bookings again'");
    expect(alert).toContain("'Taking bookings again. Book now.'");
  });

  it('reaches savers and bell followers once each, never the provider', () => {
    expect(alert).toMatch(/FROM public\.bookmarks b WHERE b\.provider_id = v_p\.id\s+UNION\s+SELECT f\.user_id FROM public\.provider_follows f/);
    expect(alert).not.toMatch(/UNION ALL\s+SELECT/);
    expect(alert).toContain('WHERE who.user_id IS DISTINCT FROM v_p.user_id');
  });

  it('leaves the bell to the release message on a release day', () => {
    expect(alert).toContain('AND NOT (v_p.is_release_day AND EXISTS (');
  });

  it('pushes even with Offers & Promotions off', () => {
    expect(alert).toContain("jsonb_build_object('kind', 'schedule_reopened')");
    expect(PUSH).toContain("const CHOSEN_PROVIDER_KINDS = new Set(['schedule_reopened']);");
  });

  it('refuses to apply over a newer Reopen', () => {
    expect(MIGRATION.match(/rebuild from live/g)).toHaveLength(1);
    expect(MIGRATION).toContain("'93ab36d99655ac360307fa3bb9190bf3'");
  });
});

describe('going live', () => {
  it('clears closures that already ended, so nobody gets late news', () => {
    const cleanup = MIGRATION.indexOf(
      'DELETE FROM public.provider_schedule_closures c\n WHERE NOT public.provider_schedule_is_closed(c.provider_id);',
    );
    expect(cleanup).toBeGreaterThan(MIGRATION.indexOf('$function$;\n\nREVOKE ALL ON FUNCTION public.process_schedule_reopen_alerts()'));
    expect(cleanup).toBeLessThan(MIGRATION.indexOf("cron.schedule('schedule-reopen-alerts'"));
  });
});
